package engine

// symbolHitTracker counts how often each symbol pays at each match count.
// Reset between base game and free spins so the report can attribute hits.
type symbolHitTracker struct {
	// hits[symbolIdx][count-1] = times this symbol paid at that count
	hits [][]int64
	// scatterHits[count-1] = number of spins with exactly that many scatters
	scatterHits []int64
	// wildAssistedWins = wins where at least one wild contributed
	wildAssistedWins int64
	maxCount         int
	symbolIDs        []string
	wildIdx          int
	scatterIdx       int
}

func newSymbolHitTracker(r *reels) *symbolHitTracker {
	t := &symbolHitTracker{
		maxCount:    r.reelCount(),
		symbolIDs:   r.symbolIDs,
		wildIdx:     r.wildIdx,
		scatterIdx:  r.scatterIdx,
		scatterHits: make([]int64, r.reelCount()+1),
	}
	t.hits = make([][]int64, len(r.symbolIDs))
	for i := range t.hits {
		t.hits[i] = make([]int64, t.maxCount)
	}
	return t
}

// recordLineWin bumps the {sym,count} counter and the wild-assisted counter.
func (t *symbolHitTracker) recordLineWin(sym, count int, wildUsed bool) {
	if sym < 0 || sym >= len(t.hits) {
		return
	}
	if count < 1 || count > t.maxCount {
		return
	}
	t.hits[sym][count-1]++
	if wildUsed {
		t.wildAssistedWins++
	}
}

// recordScatterCount logs how many scatters landed this spin (0..maxCount+).
func (t *symbolHitTracker) recordScatterCount(count int) {
	if count < 0 {
		return
	}
	if count >= len(t.scatterHits) {
		count = len(t.scatterHits) - 1
	}
	t.scatterHits[count]++
}

// SymbolHitRow is the public per-symbol output row.
type SymbolHitRow struct {
	Symbol string     `json:"symbol"`
	Hits   []int64    `json:"hits"`        // length = maxCount; index = count-1
	Probs  []float64  `json:"probs"`       // hits / totalSpins
}

// HitOutput is the symbolHitProbabilities block.
type HitOutput struct {
	MaxCount         int            `json:"maxCount"`
	TotalSpins       int64          `json:"totalSpins"`
	BySymbol         []SymbolHitRow `json:"bySymbol"`
	ScatterHits      []int64        `json:"scatterHits"` // index = scatter count
	ScatterProbs     []float64      `json:"scatterProbs"`
	WildAssistedWins int64          `json:"wildAssistedWins"`
	WildAssistRate   float64        `json:"wildAssistRate"`
}

func (t *symbolHitTracker) toOutput(totalSpins int64, winSpins int64) HitOutput {
	out := HitOutput{
		MaxCount:         t.maxCount,
		TotalSpins:       totalSpins,
		ScatterHits:      append([]int64(nil), t.scatterHits...),
		ScatterProbs:     make([]float64, len(t.scatterHits)),
		WildAssistedWins: t.wildAssistedWins,
	}
	if totalSpins > 0 {
		for i, h := range t.scatterHits {
			out.ScatterProbs[i] = float64(h) / float64(totalSpins)
		}
	}
	if winSpins > 0 {
		out.WildAssistRate = float64(t.wildAssistedWins) / float64(winSpins)
	}

	out.BySymbol = make([]SymbolHitRow, len(t.symbolIDs))
	for i, id := range t.symbolIDs {
		row := SymbolHitRow{
			Symbol: id,
			Hits:   append([]int64(nil), t.hits[i]...),
			Probs:  make([]float64, t.maxCount),
		}
		if totalSpins > 0 {
			for j, h := range t.hits[i] {
				row.Probs[j] = float64(h) / float64(totalSpins)
			}
		}
		out.BySymbol[i] = row
	}
	return out
}
