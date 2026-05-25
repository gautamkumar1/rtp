package engine

import (
	"math/rand/v2"

	"github.com/rtp-platform/simulator/internal/schema"
)

// reels holds the schema reels translated into integer indices for fast lookup.
type reels struct {
	strips     [][]int  // strips[reel] = symbol indices in landing order
	symbolIDs  []string // index → symbol id
	idToIndex  map[string]int
	wildIdx    int // -1 if no wild
	scatterIdx int // -1 if no scatter
}

func newReels(s schema.GameSchema) *reels {
	r := &reels{
		strips:     make([][]int, len(s.Reels)),
		symbolIDs:  make([]string, len(s.Symbols)),
		idToIndex:  make(map[string]int, len(s.Symbols)),
		wildIdx:    -1,
		scatterIdx: -1,
	}
	for i, sym := range s.Symbols {
		r.symbolIDs[i] = sym.ID
		r.idToIndex[sym.ID] = i
		if sym.IsWild {
			r.wildIdx = i
		}
		if sym.IsScatter {
			r.scatterIdx = i
		}
	}
	for reelIdx, strip := range s.Reels {
		ints := make([]int, len(strip))
		for j, symID := range strip {
			ints[j] = r.idToIndex[symID]
		}
		r.strips[reelIdx] = ints
	}
	return r
}

// reelCount returns number of reels.
func (r *reels) reelCount() int { return len(r.strips) }

// spin lands the visible window on each reel and writes the resulting
// symbol indices into window[reel][row] (caller-owned buffer to avoid
// per-spin allocation in the hot loop).
//
// Each reel's strip is rotated by a uniformly random offset; the first
// `rows` symbols starting at that offset (with wrap-around) are visible.
func (r *reels) spin(rng *rand.Rand, rows int, window [][]int) {
	for reelIdx, strip := range r.strips {
		n := len(strip)
		off := rng.IntN(n)
		row := window[reelIdx]
		for row_i := 0; row_i < rows; row_i++ {
			row[row_i] = strip[(off+row_i)%n]
		}
	}
}

// allocWindow returns a reusable [reels][rows] buffer.
func (r *reels) allocWindow(rows int) [][]int {
	w := make([][]int, len(r.strips))
	for i := range w {
		w[i] = make([]int, rows)
	}
	return w
}

// countSymbolOnReel returns how many times the given symbol index appears
// on the given reel — used for theoretical hit-frequency sanity checks.
func (r *reels) countSymbolOnReel(reel, sym int) int {
	n := 0
	for _, s := range r.strips[reel] {
		if s == sym {
			n++
		}
	}
	return n
}
