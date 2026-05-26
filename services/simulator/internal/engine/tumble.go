package engine

import (
	"math/rand/v2"

	"github.com/rtp-platform/simulator/internal/schema"
)

// tumbleState holds the mutable grid state during a cascade sequence.
type tumbleState struct {
	window [][]int  // window[col][row] = symbol index
	elim   [][]bool // elim[col][row] = true if position was removed this round
}

// removeWinners marks all positions containing any of the winning symbols as eliminated.
func removeWinners(state *tumbleState, winSymbols []int) {
	winSet := make(map[int]struct{}, len(winSymbols))
	for _, s := range winSymbols {
		winSet[s] = struct{}{}
	}
	for c, col := range state.window {
		for r, s := range col {
			if _, ok := winSet[s]; ok {
				state.elim[c][r] = true
			}
		}
	}
}

// refill shifts surviving symbols down in each column and draws new symbols
// from a random offset on the reel strip to fill vacated positions at the top.
func refill(state *tumbleState, strips [][]int, rng *rand.Rand) {
	rows := len(state.window[0])
	for c, col := range state.window {
		// Collect survivors bottom-to-top (preserving top-to-bottom order when reversed).
		survivors := make([]int, 0, rows)
		for r := rows - 1; r >= 0; r-- {
			if !state.elim[c][r] {
				survivors = append(survivors, col[r])
			}
		}
		needed := rows - len(survivors)
		strip := strips[c%len(strips)]
		off := rng.IntN(len(strip))
		// Rebuild column: new symbols at top, survivors below (survivors collected
		// bottom-to-top, so index 0 of survivors = was bottom-most surviving row).
		for i := 0; i < needed; i++ {
			state.window[c][i] = strip[(off+i)%len(strip)]
		}
		// survivors[0] = bottom-most survivor, place it at bottom
		for i, s := range survivors {
			state.window[c][needed+i] = s
		}
		// Clear elim flags.
		for r := range state.elim[c] {
			state.elim[c][r] = false
		}
	}
}

// drawBonusMultiplier picks a multiplier value from the weighted table.
func drawBonusMultiplier(cfg *schema.BonusMultiplierConfig, rng *rand.Rand) int {
	total := 0
	for _, w := range cfg.Weights {
		total += w[1]
	}
	if total == 0 {
		return 1
	}
	r := rng.IntN(total)
	for _, w := range cfg.Weights {
		if r < w[1] {
			return w[0]
		}
		r -= w[1]
	}
	return cfg.Weights[len(cfg.Weights)-1][0]
}

// playTumbleSpinWithBonus executes a full tumble/cascade sequence starting from
// the given window state. Returns total credits won (raw multiplier — caller
// scales by totalBet as needed).
//
// bmCfg may be nil (no bonus multiplier). bmSymIdx is the resolved symbol index
// for the bonus symbol (-1 if none). strips are used for refilling after each cascade.
func playTumbleSpinWithBonus(
	window [][]int,
	strips [][]int,
	rng *rand.Rand,
	pt *paytable,
	bmCfg *schema.BonusMultiplierConfig,
	bmSymIdx int,
) float64 {
	cols := len(window)
	rows := len(window[0])
	state := &tumbleState{
		window: window,
		elim:   make([][]bool, cols),
	}
	for i := range state.elim {
		state.elim[i] = make([]bool, rows)
	}

	cumulative := 0.0

	for {
		wins := collectWaysWins(state.window, pt)
		if len(wins) == 0 {
			break
		}

		roundPay := 0.0
		winSymbols := make([]int, 0, len(wins))
		for _, w := range wins {
			roundPay += w.pay
			winSymbols = append(winSymbols, w.symIdx)
		}
		cumulative += roundPay

		// Bonus multiplier: if the bonus symbol is anywhere on the grid
		// and we have a cumulative win, draw and apply a multiplier.
		if bmCfg != nil && bmSymIdx >= 0 && cumulative > 0 {
			for _, col := range state.window {
				found := false
				for _, s := range col {
					if s == bmSymIdx {
						found = true
						break
					}
				}
				if found {
					mult := drawBonusMultiplier(bmCfg, rng)
					cumulative *= float64(mult)
					break
				}
			}
		}

		removeWinners(state, winSymbols)
		refill(state, strips, rng)
	}

	return cumulative
}
