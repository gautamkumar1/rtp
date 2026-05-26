package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/rtp-platform/simulator/internal/engine"
	"github.com/rtp-platform/simulator/internal/schema"
)

func main() {
	data, _ := os.ReadFile("/tmp/real_req2.json")
	var req struct {
		Schema schema.GameSchema       `json:"schema"`
		Config schema.SimulationConfig `json:"config"`
	}
	json.Unmarshal(data, &req)
	req.Config.SpinCount = 100

	fmt.Println("Running 10k spins...")
	start := time.Now()
	result, err := engine.Run(req.Schema, req.Config)
	elapsed := time.Since(start)
	if err != nil {
		fmt.Println("ERROR:", err)
		return
	}
	fmt.Printf("Done in %v (%.0f spins/sec)\n", elapsed, float64(req.Config.SpinCount)/elapsed.Seconds())
	fmt.Printf("RTP: %.3f%%, featureTriggers: %d\n", result.RTP*100, result.FeatureTriggerCount)
}
