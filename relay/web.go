package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// web holds the app, copied in from the web build before `go build`
// (relay/README.md). Without it, the relay serves a page saying how.
//
//go:embed web
var web embed.FS

// appPage is the single-file app to serve at /: from -static, then the
// embedded build, then the placeholder.
func appPage(static string) ([]byte, error) {
	if static != "" {
		return os.ReadFile(filepath.Join(static, "index.html"))
	}
	if b, err := fs.ReadFile(web, "web/index.html"); err == nil {
		return b, nil
	}
	return fs.ReadFile(web, "web/placeholder.html")
}

// serveApp serves the app at / and /index.html. It's never cached, so a
// relay upgraded in place serves its new app on the next load.
func serveApp(static string) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/" && req.URL.Path != "/index.html" {
			http.NotFound(w, req)
			return
		}
		page, err := appPage(static)
		if err != nil {
			http.Error(w, "the app isn't available", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Write(page)
	}
}

// relayInfo is what /config tells the app: the protocol this relay speaks,
// and the address to put in share links, so a link made on the relay's own
// computer doesn't say "localhost" when colleagues need its network address.
type relayInfo struct {
	Protocol  int    `json:"protocol"`
	PublicURL string `json:"publicUrl"`
}

func serveConfig(publicURL string, trustForwarded bool) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		info := relayInfo{Protocol: ProtocolVersion, PublicURL: publicURL}
		if info.PublicURL == "" {
			info.PublicURL = requestURL(req, trustForwarded)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		// Any page may ask, so the app opened elsewhere can check an address before sharing through it.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(info)
	}
}

// requestURL is the address the request came to. When that's this computer
// ("localhost"), it's the computer's network address instead, if it has one.
func requestURL(req *http.Request, trustForwarded bool) string {
	scheme := "http"
	if req.TLS != nil {
		scheme = "https"
	}
	if trustForwarded && req.Header.Get("X-Forwarded-Proto") != "" {
		scheme = req.Header.Get("X-Forwarded-Proto")
	}
	host := req.Host
	if hostname, port, err := net.SplitHostPort(host); err == nil && isLoopback(hostname) {
		if lan := networkAddresses(); len(lan) > 0 {
			host = net.JoinHostPort(lan[0], port)
		}
	}
	return (&url.URL{Scheme: scheme, Host: host}).String()
}

func isLoopback(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// networkAddresses are this computer's addresses on its local networks,
// IPv4 first, for printing and for share links.
func networkAddresses() []string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	var v4, v6 []string
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok || ipnet.IP.IsLoopback() || ipnet.IP.IsLinkLocalUnicast() {
			continue
		}
		if ip := ipnet.IP.To4(); ip != nil {
			v4 = append(v4, ip.String())
		} else {
			v6 = append(v6, ipnet.IP.String())
		}
	}
	return append(v4, v6...)
}
