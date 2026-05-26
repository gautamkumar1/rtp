package engine

import (
	"math/rand/v2"

	"github.com/rtp-platform/simulator/internal/schema"
)

// weightedDraw picks a count value from a weighted list using a weighted random draw.
func weightedDraw(weights []schema.ScatterWeightEntry, rng *rand.Rand) int {
	total := 0
	for _, w := range weights {
		total += w.Weight
	}
	if total == 0 {
		return 0
	}
	r := rng.IntN(total)
	for _, w := range weights {
		if r < w.Weight {
			return w.Count
		}
		r -= w.Weight
	}
	return weights[len(weights)-1].Count
}

// injectScatters places scatter symbols at random positions in the window.
// isBuyFeature=true ensures at least 3 scatters are placed (guaranteeing
// free-spin trigger for buy-feature modes).
func injectScatters(
	window [][]int,
	cfg *schema.RandomScatterInjectConfig,
	scatterIdx int,
	rng *rand.Rand,
	isBuyFeature bool,
) {
	if cfg == nil {
		return
	}

	count := weightedDraw(cfg.BaseWeights, rng)

	// Buy-feature: guarantee at least 3 scatters (trigger threshold).
	if isBuyFeature && count < 3 {
		count = 3
	}

	if count == 0 {
		return
	}

	// Build a flat list of all grid positions.
	type pos struct{ col, row int }
	var positions []pos
	for c, col := range window {
		for r := range col {
			positions = append(positions, pos{c, r})
		}
	}

	// Fisher-Yates partial shuffle to pick `count` unique positions.
	for i := 0; i < count && i < len(positions); i++ {
		j := i + rng.IntN(len(positions)-i)
		positions[i], positions[j] = positions[j], positions[i]
		p := positions[i]
		window[p.col][p.row] = scatterIdx
	}
}
