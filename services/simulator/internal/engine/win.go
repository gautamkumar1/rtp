package engine

import (
	"strconv"

	"github.com/rtp-platform/simulator/internal/schema"
)

// paytable in index form: paytable[symbolIdx][matchCount] -> multiplier
// matchCount starts at 1; entries for counts not in the source map are 0.
type paytable struct {
	// table[symbolIdx][count-1] = multiplier (0 if not paying at that count)
	table [][]float64
	// scatterPays[count-1] = multiplier; nil if scatter doesn't pay or absent
	scatterPays []float64
	maxCount    int
}

func buildPaytable(s schema.GameSchema, r *reels) *paytable {
	pt := &paytable{maxCount: r.reelCount()}
	pt.table = make([][]float64, len(s.Symbols))
	for i := range pt.table {
		pt.table[i] = make([]float64, pt.maxCount)
	}
	for symID, byCount := range s.Paytable {
		idx, ok := r.idToIndex[symID]
		if !ok {
			continue
		}
		for cntStr, mult := range byCount {
			c, err := strconv.Atoi(cntStr)
			if err != nil || c < 1 || c > pt.maxCount {
				continue
			}
			pt.table[idx][c-1] = mult
		}
	}
	if s.Scatter != nil && len(s.Scatter.Pays) > 0 {
		pt.scatterPays = make([]float64, pt.maxCount)
		for cntStr, mult := range s.Scatter.Pays {
			c, err := strconv.Atoi(cntStr)
			if err != nil || c < 1 || c > pt.maxCount {
				continue
			}
			pt.scatterPays[c-1] = mult
		}
	}
	return pt
}

// linePay returns the multiplier for `count` consecutive matches of symbol `sym`.
// Returns 0 if no entry. Caller multiplies by line bet.
func (p *paytable) linePay(sym, count int) float64 {
	if count < 1 || count > p.maxCount || sym < 0 || sym >= len(p.table) {
		return 0
	}
	return p.table[sym][count-1]
}

// scatterPay returns the multiplier for `count` scatters across the window.
// Returns 0 if not configured. Caller multiplies by total bet.
func (p *paytable) scatterPay(count int) float64 {
	if p.scatterPays == nil || count < 1 || count > len(p.scatterPays) {
		return 0
	}
	return p.scatterPays[count-1]
}

// payline (numeric) holds row index per reel.
type paylines [][]int

func newPaylines(s schema.GameSchema) paylines {
	out := make(paylines, len(s.Paylines))
	for i, line := range s.Paylines {
		cp := make([]int, len(line))
		copy(cp, line)
		out[i] = cp
	}
	return out
}

// lineWin holds the per-line win after evaluation, plus tracking info.
type lineWin struct {
	symbol     int     // resolved (non-wild) symbol that paid, -1 if pure-wild win
	count      int     // matching reels from left (0 if no win)
	multiplier float64 // paytable multiplier for {symbol,count}
	wildUsed   bool    // any wild participated in the win
}

// evaluator computes per-spin wins from a landed window.
type evaluator struct {
	pt       *paytable
	lines    paylines
	wildIdx  int
	scatIdx  int
	wildMult float64
	wildSubs map[int]struct{} // wild substitution allow-list; nil = substitutes for all non-scatter
}

func newEvaluator(s schema.GameSchema, r *reels) *evaluator {
	e := &evaluator{
		pt:      buildPaytable(s, r),
		lines:   newPaylines(s),
		wildIdx: r.wildIdx,
		scatIdx: r.scatterIdx,
	}
	if s.Wild != nil {
		if s.Wild.Multiplier > 0 {
			e.wildMult = s.Wild.Multiplier
		} else {
			e.wildMult = 1
		}
		if len(s.Wild.SubstitutesFor) > 0 {
			e.wildSubs = make(map[int]struct{}, len(s.Wild.SubstitutesFor))
			for _, sid := range s.Wild.SubstitutesFor {
				if idx, ok := r.idToIndex[sid]; ok {
					e.wildSubs[idx] = struct{}{}
				}
			}
		}
	} else {
		e.wildMult = 1
	}
	return e
}

// canWildSub reports whether the wild can substitute for symbol s on a payline.
// Wild never substitutes for scatter. If no allow-list is configured, the wild
// substitutes for any non-scatter symbol (standard slot rule).
func (e *evaluator) canWildSub(s int) bool {
	if e.wildIdx < 0 {
		return false
	}
	if s == e.scatIdx {
		return false
	}
	if e.wildSubs == nil {
		return true
	}
	_, ok := e.wildSubs[s]
	return ok
}

// evalLine resolves one payline against the window and writes the result into out.
// Behaviour:
//   - Walk reels left to right; first reel's symbol (resolved past leading wilds)
//     becomes the line symbol. Wilds count as that symbol.
//   - The leading-wild case: if every reel landed a wild, attempt a pure-wild win
//     using the wild's own paytable entry. Otherwise the first non-wild fixes the
//     symbol and we count the run length (including leading wilds).
//   - Scatters never participate in payline wins.
func (e *evaluator) evalLine(window [][]int, line []int, out *lineWin) {
	out.symbol = -1
	out.count = 0
	out.multiplier = 0
	out.wildUsed = false

	// Walk to first non-wild non-scatter on the line.
	firstSym := -1
	leadingWilds := 0
	for reel, row := range line {
		sym := window[reel][row]
		if sym == e.scatIdx {
			// Scatter breaks any payline win attempt before we identified a symbol.
			if firstSym == -1 {
				return
			}
			break
		}
		if sym == e.wildIdx && e.wildIdx >= 0 {
			leadingWilds++
			continue
		}
		firstSym = sym
		break
	}

	if firstSym == -1 {
		// Entire line is wilds — pay the wild symbol if its paytable has it.
		// leadingWilds equals number of wild reels encountered before a scatter
		// or before the end of the line; if it equals len(line), all wilds.
		if e.wildIdx >= 0 && leadingWilds == len(line) {
			mult := e.pt.linePay(e.wildIdx, len(line))
			if mult > 0 {
				out.symbol = e.wildIdx
				out.count = len(line)
				out.multiplier = mult * e.wildMult
				out.wildUsed = true
			}
		}
		return
	}

	// Count consecutive matches from the left.
	count := leadingWilds
	wildUsed := leadingWilds > 0
	for reel := leadingWilds; reel < len(line); reel++ {
		sym := window[reel][line[reel]]
		if sym == firstSym {
			count++
			continue
		}
		if sym == e.wildIdx && e.canWildSub(firstSym) {
			count++
			wildUsed = true
			continue
		}
		break
	}

	if count < 1 {
		return
	}

	mult := e.pt.linePay(firstSym, count)
	if mult == 0 {
		return
	}
	out.symbol = firstSym
	out.count = count
	out.multiplier = mult * e.wildMult
	out.wildUsed = wildUsed
}

// evalScatter counts scatters across the window and returns their multiplier
// (applied to total bet by the caller), plus the count.
func (e *evaluator) evalScatter(window [][]int) (count int, mult float64) {
	if e.scatIdx < 0 {
		return 0, 0
	}
	for _, col := range window {
		for _, s := range col {
			if s == e.scatIdx {
				count++
			}
		}
	}
	mult = e.pt.scatterPay(count)
	return count, mult
}
