package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rtp-platform/simulator/internal/api"
)

func main() {
	port := os.Getenv("SIMULATOR_PORT")
	if port == "" {
		port = "8090"
	}

	addr := fmt.Sprintf(":%s", port)
	srv := api.New(addr)

	errCh := make(chan error, 1)
	go func() { errCh <- srv.Start() }()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-errCh:
		log.Fatalf("server error: %v", err)
	case sig := <-stop:
		log.Printf("received %s — shutting down", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Fatalf("graceful shutdown failed: %v", err)
		}
		log.Printf("shut down cleanly")
	}
}
