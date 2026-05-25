package engine

import (
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

func sampleSchema() schema.GameSchema {
	return schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "t",
		GameName:      "t",
		Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels: [][]string{
			{"A", "B", "C"},
			{"A", "B", "C"},
			{"A", "B", "C"},
		},
		Paylines: [][]int{{0, 0, 0}},
		Symbols: []schema.Symbol{
			{ID: "A", Name: "A"},
			{ID: "B", Name: "B"},
			{ID: "C", Name: "C"},
		},
		Paytable: map[string]map[string]float64{
			"A": {"3": 10},
			"B": {"3": 5},
			"C": {"3": 1},
		},
	}
}

func TestRNGDeterministic(t *testing.T) {
	r1 := newRNG(42)
	r2 := newRNG(42)
	for i := 0; i < 10; i++ {
		if r1.Uint64() != r2.Uint64() {
			t.Fatalf("rng with same seed diverged at step %d", i)
		}
	}
}

func TestReelSpinDeterministic(t *testing.T) {
	s := sampleSchema()
	r := newReels(s)
	w1 := r.allocWindow(3)
	w2 := r.allocWindow(3)
	r.spin(newRNG(42), 3, w1)
	r.spin(newRNG(42), 3, w2)
	for reel := range w1 {
		for row := range w1[reel] {
			if w1[reel][row] != w2[reel][row] {
				t.Fatalf("spin diverged at reel %d row %d", reel, row)
			}
		}
	}
}

func TestReelSpinAllValidSymbols(t *testing.T) {
	s := sampleSchema()
	r := newReels(s)
	w := r.allocWindow(3)
	r.spin(newRNG(123), 3, w)
	for reel, col := range w {
		for row, sym := range col {
			if sym < 0 || sym >= len(s.Symbols) {
				t.Fatalf("invalid symbol index %d at [%d][%d]", sym, reel, row)
			}
		}
	}
}

func TestReelSpinDistribution(t *testing.T) {
	// Reel with weighted strip "AAAB" — A should land ~3× more often than B.
	s := sampleSchema()
	s.Reels = [][]string{{"A", "A", "A", "B"}}
	s.Paylines = [][]int{{0}}
	r := newReels(s)
	w := r.allocWindow(1)
	rng := newRNG(99)
	counts := map[int]int{}
	const N = 100_000
	for i := 0; i < N; i++ {
		r.spin(rng, 1, w)
		counts[w[0][0]]++
	}
	aIdx := r.idToIndex["A"]
	bIdx := r.idToIndex["B"]
	// Expected ~75% A, ~25% B. Allow 1.5pp slop.
	aShare := float64(counts[aIdx]) / N
	bShare := float64(counts[bIdx]) / N
	if aShare < 0.735 || aShare > 0.765 {
		t.Fatalf("A share %.4f outside expected 0.735–0.765", aShare)
	}
	if bShare < 0.235 || bShare > 0.265 {
		t.Fatalf("B share %.4f outside expected 0.235–0.265", bShare)
	}
}
