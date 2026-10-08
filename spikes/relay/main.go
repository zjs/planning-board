package main

import (
	"flag"
	"log"
	"net/http"
	"time"
)

func main() {
	addr := flag.String("addr", "localhost:8787", "address to listen on")
	data := flag.String("data", "relay-data", "directory for each room's encrypted log and snapshot")
	static := flag.String("static", "", "directory of the spike app to serve at / (optional)")
	flag.Parse()

	mux := http.NewServeMux()
	mux.Handle("GET /rooms/{id}", NewRelay(*data))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok\n")) })
	if *static != "" {
		mux.Handle("GET /", http.FileServer(http.Dir(*static)))
	}
	server := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("relay (spike) on http://%s, data in %s", *addr, *data)
	log.Fatal(server.ListenAndServe())
}
