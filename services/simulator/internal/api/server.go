// Package api wires the HTTP layer for the simulator service.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/rtp-platform/simulator/internal/engine"
	"github.com/rtp-platform/simulator/internal/schema"
)

const Version = "0.5.0"

type Server struct {
	srv  *http.Server
	addr string
}

func New(addr string) *Server {
	mux := http.NewServeMux()
	s := &Server{addr: addr}

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /simulate", s.handleSimulate)

	s.srv = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 15 * time.Second,
	}
	return s
}

func (s *Server) Start() error {
	log.Printf("simulator listening on http://localhost%s", s.addr)
	if err := s.srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.srv.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": Version,
	})
}

func (s *Server) handleSimulate(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req schema.SimulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	if err := req.Schema.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "schema invalid: "+err.Error())
		return
	}
	if err := req.Config.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "config invalid: "+err.Error())
		return
	}

	t0 := time.Now()
	result, err := engine.Run(req.Schema, req.Config)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "simulation failed: "+err.Error())
		return
	}
	result.DurationMs = time.Since(t0).Milliseconds()

	writeJSON(w, http.StatusOK, result)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("write json failed: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
