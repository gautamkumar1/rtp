package engine

import (
	"testing"
)

func TestCountSymbol(t *testing.T) {
	// 3-col × 2-row window
	window := [][]int{
		{1, 2},
		{1, 3},
		{2, 2},
	}
	if got := countSymbol(window, 1); got != 2 {
		t.Fatalf("countSymbol(1) = %d, want 2", got)
	}
	if got := countSymbol(window, 2); got != 3 {
		t.Fatalf("countSymbol(2) = %d, want 3", got)
	}
	if got := countSymbol(window, 9); got != 0 {
		t.Fatalf("countSymbol(9) = %d, want 0", got)
	}
}

func TestWaysPayForCount(t *testing.T) {
	// paytable for symIdx 0: 8→20, 10→50, 12→200
	pt := &paytable{
		maxCount: 15,
		table:    make([][]float64, 2),
	}
	pt.table[0] = make([]float64, 15)
	pt.table[0][7] = 20   // count=8
	pt.table[0][9] = 50   // count=10
	pt.table[0][11] = 200 // count=12
	pt.table[1] = make([]float64, 15)

	tests := []struct {
		count int
		want  float64
	}{
		{7, 0},    // below min threshold
		{8, 20},   // exact match
		{9, 20},   // between thresholds → use 8
		{10, 50},  // exact match
		{11, 50},  // between → use 10
		{12, 200}, // exact match
		{15, 200}, // above max → use 12
	}
	for _, tt := range tests {
		got := waysPayForCount(pt, 0, tt.count)
		if got != tt.want {
			t.Errorf("waysPayForCount(count=%d) = %v, want %v", tt.count, got, tt.want)
		}
	}
}

func TestCollectWaysWins_NoWin(t *testing.T) {
	pt := &paytable{
		maxCount: 6,
		table:    make([][]float64, 3),
	}
	for i := range pt.table {
		pt.table[i] = make([]float64, 6)
	}
	// symbol 0 has no pay entries — never wins
	window := [][]int{{0}, {1}, {2}}
	wins := collectWaysWins(window, pt)
	if len(wins) != 0 {
		t.Fatalf("expected no wins, got %d", len(wins))
	}
}

func TestCollectWaysWins_Win(t *testing.T) {
	pt := &paytable{
		maxCount: 6,
		table:    make([][]float64, 2),
	}
	pt.table[0] = make([]float64, 6)
	pt.table[0][1] = 10 // count=2 pays 10x
	pt.table[1] = make([]float64, 6)

	// 3 cols × 2 rows, symbol 0 appears 4 times
	window := [][]int{{0, 0}, {0, 1}, {0, 1}}
	wins := collectWaysWins(window, pt)
	if len(wins) != 1 {
		t.Fatalf("expected 1 win, got %d", len(wins))
	}
	if wins[0].symIdx != 0 {
		t.Errorf("wrong symbol, want 0 got %d", wins[0].symIdx)
	}
	if wins[0].count != 4 {
		t.Errorf("wrong count, want 4 got %d", wins[0].count)
	}
	if wins[0].pay != 10 {
		t.Errorf("wrong pay, want 10 got %f", wins[0].pay)
	}
}
