package engine

// waysWin holds a single symbol's win result from a ways evaluation.
type waysWin struct {
	symIdx int
	count  int
	pay    float64
}

// countSymbol counts all occurrences of symIdx across the full grid window.
func countSymbol(window [][]int, symIdx int) int {
	n := 0
	for _, col := range window {
		for _, s := range col {
			if s == symIdx {
				n++
			}
		}
	}
	return n
}

// waysPayForCount returns the paytable multiplier for symIdx at the given count.
// It finds the highest threshold key ≤ count that has a non-zero pay.
// Returns 0 if no threshold is met.
func waysPayForCount(pt *paytable, symIdx, count int) float64 {
	if symIdx < 0 || symIdx >= len(pt.table) {
		return 0
	}
	row := pt.table[symIdx]
	best := 0.0
	for i, v := range row {
		threshold := i + 1 // index i represents count = i+1
		if v > 0 && threshold <= count {
			best = v
		}
	}
	return best
}

// collectWaysWins evaluates all symbols in the window and returns wins for
// every symbol whose total count meets a paytable threshold.
func collectWaysWins(window [][]int, pt *paytable) []waysWin {
	counts := make(map[int]int, len(pt.table))
	for _, col := range window {
		for _, s := range col {
			counts[s]++
		}
	}
	var wins []waysWin
	for symIdx, count := range counts {
		pay := waysPayForCount(pt, symIdx, count)
		if pay > 0 {
			wins = append(wins, waysWin{symIdx: symIdx, count: count, pay: pay})
		}
	}
	return wins
}
