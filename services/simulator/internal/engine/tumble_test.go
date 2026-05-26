package engine

import (
	"math/rand/v2"
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

func testWaysPt() *paytable {
	// 3 symbols, max count 6. Symbol 0 pays at count 2+, symbol 1 and 2 don't pay.
	pt := &paytable{maxCount: 6, table: make([][]float64, 3)}
	for i := range pt.table {
		pt.table[i] = make([]float64, 6)
	}
	pt.table[0][1] = 5  // count=2 → 5x
	pt.table[0][2] = 10 // count=3 → 10x
	return pt
}

func TestRemoveWinners_ClearsPositions(t *testing.T) {
	state := &tumbleState{
		window: [][]int{{0, 1}, {0, 2}},
		elim:   [][]bool{{false, false}, {false, false}},
	}
	removeWinners(state, []int{0})
	if !state.elim[0][0] || !state.elim[1][0] {
		t.Error("winning symbol positions should be marked eliminated")
	}
	if state.elim[0][1] || state.elim[1][1] {
		t.Error("non-winning positions should not be eliminated")
	}
}

func TestPlayTumbleSpin_NoWinReturnsZero(t *testing.T) {
	// Window: all symbol 1 (no pays for symbol 1)
	window := [][]int{{1, 1}, {1, 1}, {1, 1}}
	strips := [][]int{{1, 1}, {1, 1}, {1, 1}}
	pt := testWaysPt()
	rng := rand.New(rand.NewPCG(1, 0))
	ret := playTumbleSpinWithBonus(window, strips, rng, pt, nil, -1)
	if ret != 0 {
		t.Errorf("expected 0 return for no-win window, got %f", ret)
	}
}

func TestPlayTumbleSpin_WinReturnsPositive(t *testing.T) {
	// Window: symbol 0 appears in all 3 cols × 1 row = 3 occurrences → pays 10x
	window := [][]int{{0}, {0}, {0}}
	strips := [][]int{{1}, {1}, {1}} // refill with non-winning symbol
	pt := testWaysPt()
	rng := rand.New(rand.NewPCG(2, 0))
	ret := playTumbleSpinWithBonus(window, strips, rng, pt, nil, -1)
	if ret <= 0 {
		t.Errorf("expected positive return for winning window, got %f", ret)
	}
}

func TestPlayTumbleSpin_BonusMultiplierApplied(t *testing.T) {
	pt := testWaysPt()
	bmCfg := &schema.BonusMultiplierConfig{
		SymbolID: "2",
		Weights:  [][2]int{{2, 1}}, // always returns multiplier 2
	}

	// Without bonus multiplier
	rng1 := rand.New(rand.NewPCG(3, 0))
	window1 := [][]int{{0}, {0}, {2}}
	strips1 := [][]int{{1}, {1}, {1}}
	baseRet := playTumbleSpinWithBonus(window1, strips1, rng1, pt, nil, -1)

	// With bonus multiplier (bmSymIdx=2)
	rng2 := rand.New(rand.NewPCG(3, 0))
	window2 := [][]int{{0}, {0}, {2}}
	strips2 := [][]int{{1}, {1}, {1}}
	bonusRet := playTumbleSpinWithBonus(window2, strips2, rng2, pt, bmCfg, 2)

	if bonusRet <= baseRet {
		t.Errorf("bonus multiplier should increase return: base=%f bonus=%f", baseRet, bonusRet)
	}
}

func TestRefill_RebuildsColumn(t *testing.T) {
	// 2 cols × 3 rows. Col 0: positions 0,1 eliminated. Col 1: none eliminated.
	state := &tumbleState{
		window: [][]int{{9, 9, 5}, {3, 4, 5}},
		elim:   [][]bool{{true, true, false}, {false, false, false}},
	}
	// Strip for col 0 only has symbol 7 — new symbols should be 7.
	strips := [][]int{{7, 7, 7}, {3, 4, 5}}
	rng := rand.New(rand.NewPCG(10, 0))
	refill(state, strips, rng)

	// Col 0: 2 positions were eliminated, so top 2 should be new (7), bottom should be 5
	if state.window[0][2] != 5 {
		t.Errorf("surviving symbol should be at bottom, got %d", state.window[0][2])
	}
	if state.window[0][0] != 7 && state.window[0][1] != 7 {
		t.Errorf("new symbols should be 7, got col0=%v", state.window[0])
	}
	// elim flags should be cleared
	for _, e := range state.elim[0] {
		if e {
			t.Error("elim flags should be cleared after refill")
		}
	}
}
