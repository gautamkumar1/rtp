package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("SIMULATOR_PORT")
	if port == "" {
		port = "8090"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "version": "0.0.1"})
	})

	// Phase 5: POST /simulate will be implemented here
	mux.HandleFunc("POST /simulate", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "simulation engine not yet implemented — Phase 5", http.StatusNotImplemented)
	})

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Go simulation engine listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
