package engine

import (
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

func TestLineWin_ThreeInARow(t *testing.T) {
	s := sampleSchema()
	r := newReels(s)
	ev := newEvaluator(s, r)

	// Window: all A in row 0 across 3 reels.
	w := [][]int{{r.idToIndex["A"], 0}, {r.idToIndex["A"], 0}, {r.idToIndex["A"], 0}}
	var lw lineWin
	ev.evalLine(w, []int{0, 0, 0}, &lw)
	if lw.count != 3 || lw.symbol != r.idToIndex["A"] || lw.multiplier != 10 {
		t.Fatalf("expected A×3=10 got count=%d sym=%d mult=%v", lw.count, lw.symbol, lw.multiplier)
	}
	if lw.wildUsed {
		t.Fatal("no wild used in this spin")
	}
}

func TestLineWin_NoWin(t *testing.T) {
	s := sampleSchema()
	r := newReels(s)
	ev := newEvaluator(s, r)
	w := [][]int{{r.idToIndex["A"], 0}, {r.idToIndex["B"], 0}, {r.idToIndex["C"], 0}}
	var lw lineWin
	ev.evalLine(w, []int{0, 0, 0}, &lw)
	if lw.count != 0 || lw.multiplier != 0 {
		t.Fatalf("expected no win, got count=%d mult=%v", lw.count, lw.multiplier)
	}
}

func TestLineWin_WildSubstitution(t *testing.T) {
	s := sampleSchema()
	// Add wild.
	s.Symbols = append(s.Symbols, schema.Symbol{ID: "W", Name: "Wild", IsWild: true})
	s.Reels[1] = []string{"A", "B", "W"}
	s.Wild = &schema.WildConfig{SymbolID: "W", SubstitutesFor: []string{"A", "B", "C"}, Multiplier: 1}

	r := newReels(s)
	ev := newEvaluator(s, r)

	// A, W, A → wild substitutes for A → 3× A
	aIdx := r.idToIndex["A"]
	wIdx := r.idToIndex["W"]
	w := [][]int{{aIdx, 0}, {wIdx, 0}, {aIdx, 0}}
	var lw lineWin
	ev.evalLine(w, []int{0, 0, 0}, &lw)
	if lw.count != 3 || lw.symbol != aIdx {
		t.Fatalf("wild sub failed: count=%d sym=%d", lw.count, lw.symbol)
	}
	if !lw.wildUsed {
		t.Fatal("wildUsed should be true")
	}
}

func TestLineWin_LeadingWildResolvesToNextSymbol(t *testing.T) {
	s := sampleSchema()
	s.Symbols = append(s.Symbols, schema.Symbol{ID: "W", Name: "Wild", IsWild: true})
	s.Reels[0] = []string{"A", "B", "W"}
	s.Wild = &schema.WildConfig{SymbolID: "W", SubstitutesFor: []string{"A", "B", "C"}, Multiplier: 1}

	r := newReels(s)
	ev := newEvaluator(s, r)

	aIdx := r.idToIndex["A"]
	wIdx := r.idToIndex["W"]
	// W, A, A → first reel wild, then A,A — should count 3 As with wild help
	w := [][]int{{wIdx, 0}, {aIdx, 0}, {aIdx, 0}}
	var lw lineWin
	ev.evalLine(w, []int{0, 0, 0}, &lw)
	if lw.count != 3 || lw.symbol != aIdx || !lw.wildUsed {
		t.Fatalf("leading wild fail: count=%d sym=%d wildUsed=%v", lw.count, lw.symbol, lw.wildUsed)
	}
}

func TestLineWin_ScatterStopsWin(t *testing.T) {
	s := sampleSchema()
	s.Symbols = append(s.Symbols, schema.Symbol{ID: "S", Name: "Scatter", IsScatter: true})
	s.Reels[1] = []string{"A", "B", "S"}
	s.Scatter = &schema.ScatterConfig{SymbolID: "S", TriggerCount: 3, AwardType: "freeSpins"}

	r := newReels(s)
	ev := newEvaluator(s, r)
	aIdx := r.idToIndex["A"]
	sIdx := r.idToIndex["S"]
	// A, S, A → scatter breaks the line — only A counted but len 1 doesn't pay
	w := [][]int{{aIdx, 0}, {sIdx, 0}, {aIdx, 0}}
	var lw lineWin
	ev.evalLine(w, []int{0, 0, 0}, &lw)
	if lw.count > 1 {
		t.Fatalf("scatter should break line: count=%d", lw.count)
	}
}

func TestScatterPay(t *testing.T) {
	s := sampleSchema()
	s.Symbols = append(s.Symbols, schema.Symbol{ID: "S", Name: "Scatter", IsScatter: true})
	s.Reels = [][]string{
		{"A", "S"},
		{"A", "S"},
		{"A", "S"},
	}
	s.Scatter = &schema.ScatterConfig{
		SymbolID:     "S",
		TriggerCount: 3,
		AwardType:    "freeSpins",
		Pays:         map[string]float64{"3": 5},
	}
	r := newReels(s)
	ev := newEvaluator(s, r)

	sIdx := r.idToIndex["S"]
	// 3 scatters across the window
	w := [][]int{{sIdx, 0}, {sIdx, 0}, {sIdx, 0}}
	cnt, mult := ev.evalScatter(w)
	if cnt != 3 || mult != 5 {
		t.Fatalf("scatter eval got count=%d mult=%v want 3,5", cnt, mult)
	}
}

func TestPaytable_NoEntryReturnsZero(t *testing.T) {
	s := sampleSchema()
	r := newReels(s)
	pt := buildPaytable(s, r)
	// A only has count=3, not count=4
	if pt.linePay(r.idToIndex["A"], 4) != 0 {
		t.Fatal("expected 0 for count without entry")
	}
	if pt.linePay(r.idToIndex["A"], 0) != 0 {
		t.Fatal("expected 0 for count 0")
	}
	if pt.linePay(99, 3) != 0 {
		t.Fatal("expected 0 for unknown symbol")
	}
}
