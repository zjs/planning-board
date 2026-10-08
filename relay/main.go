// Command relay serves Planning Board and lets people share plans through
// it, end-to-end encrypted (ADR 0017). Run it on a company server, in a
// container, or on your own computer for a pilot (requirement 37).
package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	defaults := DefaultConfig("")
	addr := flag.String("addr", ":8787", "address to listen on")
	data := flag.String("data", defaultDataDir(), "directory for each shared plan's encrypted log and snapshot")
	static := flag.String("static", "", "serve the app from this directory's index.html instead of the built-in one")
	publicURL := flag.String("public-url", "", "the address people use to reach this relay, for share links (such as https://plans.example.com)")
	allowOrigins := flag.String("allow-origin", strings.Join(defaults.Origins.Hosts, ","), "other web hosts whose pages may use this relay, comma-separated, or * for any")
	allowNull := flag.Bool("allow-file-pages", defaults.Origins.Null, "let the app opened as a file from disk use this relay")
	maxMessage := flag.Int64("max-message", defaults.MaxMessage, "largest single change or snapshot, in bytes")
	maxRoom := flag.Int64("max-room", defaults.MaxRoom, "most one shared plan may hold, in bytes (0: no limit)")
	maxData := flag.Int64("max-data", defaults.MaxData, "most all shared plans together may hold, in bytes (0: no limit)")
	maxRooms := flag.Int("max-rooms", defaults.MaxRooms, "most shared plans this relay keeps (0: no limit)")
	updateRate := flag.Float64("update-rate", defaults.UpdatesPerSecond, "changes per second one connection may send (0: no limit)")
	connRate := flag.Float64("connection-rate", defaults.ConnectionsPerMinute, "connections per minute from one address (0: no limit)")
	createRate := flag.Float64("share-rate", defaults.RoomsPerHour, "new shared plans per hour from one address (0: no limit)")
	trustForwarded := flag.Bool("trust-forwarded", false, "behind a proxy, use X-Forwarded-For and X-Forwarded-Proto")
	announce := flag.Bool("announce", true, "print the addresses colleagues can open")
	flag.Parse()

	cfg := DefaultConfig(*data)
	cfg.MaxMessage, cfg.MaxRoom, cfg.MaxData, cfg.MaxRooms = *maxMessage, *maxRoom, *maxData, *maxRooms
	cfg.UpdatesPerSecond, cfg.ConnectionsPerMinute, cfg.RoomsPerHour = *updateRate, *connRate, *createRate
	cfg.TrustForwarded = *trustForwarded
	cfg.Origins = OriginPolicy{Null: *allowNull}
	for _, host := range strings.Split(*allowOrigins, ",") {
		switch host = strings.TrimSpace(host); host {
		case "":
		case "*":
			cfg.Origins.Any = true
		default:
			cfg.Origins.Hosts = append(cfg.Origins.Hosts, host)
		}
	}
	if *publicURL != "" {
		u, err := url.Parse(*publicURL)
		if err != nil || u.Host == "" {
			log.Fatalf("-public-url %q isn't an address like https://plans.example.com", *publicURL)
		}
		cfg.Origins.Public = u.Host
	}

	relay, err := NewRelay(cfg)
	if err != nil {
		log.Fatalf("can't use %s for data: %v", *data, err)
	}
	mux := http.NewServeMux()
	mux.Handle("GET /rooms/{id}", relay)
	mux.HandleFunc("GET /config", serveConfig(*publicURL, *trustForwarded))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok\n")) })
	mux.HandleFunc("GET /", serveApp(*static))

	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("can't listen on %s: %v", *addr, err)
	}
	if *announce {
		printAddresses(listener.Addr(), *publicURL, *data)
	}
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(server.Serve(listener))
}

// defaultDataDir keeps shared plans next to the program, so a pilot finds
// them where they put it, and a pilot that works becomes the install.
func defaultDataDir() string {
	exe, err := os.Executable()
	if err != nil || strings.Contains(exe, string(filepath.Separator)+"go-build") {
		return "planning-board-data"
	}
	return filepath.Join(filepath.Dir(exe), "planning-board-data")
}

func printAddresses(addr net.Addr, publicURL, data string) {
	port := "8787"
	if tcp, ok := addr.(*net.TCPAddr); ok {
		port = fmt.Sprint(tcp.Port)
	}
	fmt.Println("Planning Board is running.")
	if publicURL != "" {
		fmt.Printf("  Open: %s\n", publicURL)
	} else {
		fmt.Printf("  On this computer: http://localhost:%s\n", port)
		for _, ip := range networkAddresses() {
			fmt.Printf("  On your network:  http://%s\n", net.JoinHostPort(ip, port))
		}
	}
	fmt.Printf("  Shared plans are kept, encrypted, in %s\n", data)
	fmt.Println("  Leave this window open while people use it. Press Ctrl+C to stop.")
}
