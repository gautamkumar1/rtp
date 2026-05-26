package engine

import (
	"math/rand/v2"
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

func TestWeightedDraw_ReturnsValidCount(t *testing.T) {
	weights := []schema.ScatterWeightEntry{
		{Count: 0, Weight: 29},
		{Count: 1, Weight: 6},
	}
	rng := rand.New(rand.NewPCG(42, 0))
	counts := map[int]int{}
	for i := 0; i < 10000; i++ {
		c := weightedDraw(weights, rng)
		counts[c]++
	}
	// Should see roughly 29/(29+6) ≈ 83% zeros and 6/35 ≈ 17% ones
	ratio := float64(counts[1]) / 10000.0
	if ratio < 0.12 || ratio > 0.22 {
		t.Errorf("count=1 ratio %.3f out of expected ~0.17", ratio)
	}
}

func TestInjectScatters_PlacesScatterSymbols(t *testing.T) {
	window := [][]int{
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
	}
	cfg := &schema.RandomScatterInjectConfig{
		SymbolID: "F",
		BaseWeights: []schema.ScatterWeightEntry{
			{Count: 3, Weight: 1}, // always inject 3
		},
		BuyFeature: false,
	}
	scatterIdx := 99
	rng := rand.New(rand.NewPCG(1, 0))
	injectScatters(window, cfg, scatterIdx, rng, false)

	total := 0
	for _, col := range window {
		for _, s := range col {
			if s == scatterIdx {
				total++
			}
		}
	}
	if total != 3 {
		t.Errorf("expected 3 injected scatters, got %d", total)
	}
}

func TestInjectScatters_BuyFeatureInjectsAtLeastThree(t *testing.T) {
	window := make([][]int, 6)
	for i := range window {
		window[i] = []int{1, 1, 1, 1, 1}
	}
	cfg := &schema.RandomScatterInjectConfig{
		SymbolID:    "F",
		BaseWeights: []schema.ScatterWeightEntry{{Count: 1, Weight: 10}},
		BuyFeature:  true,
	}
	scatterIdx := 31
	rng := rand.New(rand.NewPCG(7, 0))
	injectScatters(window, cfg, scatterIdx, rng, true)

	count := 0
	for _, col := range window {
		for _, s := range col {
			if s == scatterIdx {
				count++
			}
		}
	}
	if count < 3 {
		t.Errorf("buy feature should inject >= 3 scatters, got %d", count)
	}
}
