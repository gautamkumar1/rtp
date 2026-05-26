package engine

import (
	"math/rand/v2"

	"github.com/rtp-platform/simulator/internal/schema"
)

// Result is the JSON payload returned by POST /simulate. Field names map
// directly onto the contract documented in TODO.md §5.9.
type Result struct {
	TotalSpins  int64   `json:"totalSpins"`
	TotalBet    float64 `json:"totalBet"`
	TotalReturn float64 `json:"totalReturn"`
	RTP         float64 `json:"rtp"`
	BaseRTP     float64 `json:"baseRtp"`

	FeatureRTP FeatureRTP `json:"featureRtp"`

	HitRate           float64 `json:"hitRate"`
	Variance          float64 `json:"variance"`
	StandardDeviation float64 `json:"standardDeviation"`
	Confidence90Low   float64 `json:"confidence90Low"`
	Confidence90High  float64 `json:"confidence90High"`
	Confidence95Low   float64 `json:"confidence95Low"`
	Confidence95High  float64 `json:"confidence95High"`

	FeatureTriggerCount int64 `json:"featureTriggerCount"`

	SymbolHitProbabilities HitOutput `json:"symbolHitProbabilities"`

	BuyBonus *BuyBonusResult `json:"buyBonus,omitempty"`

	Warnings   []string `json:"warnings"`
	Config     RunInfo  `json:"config"`
	DurationMs int64    `json:"durationMs"`
}

type FeatureRTP struct {
	FreeSpins float64 `json:"freeSpins"`
	Bonus     float64 `json:"bonus"`
	BuyBonus  float64 `json:"buyBonus"`
}

// BuyBonusResult is reported only when SimulateBuyBonus is enabled and the
// schema declares a buy-bonus feature.
type BuyBonusResult struct {
	Purchases   int64   `json:"purchases"`
	TotalCost   float64 `json:"totalCost"`
	TotalReturn float64 `json:"totalReturn"`
	RTP         float64 `json:"rtp"`
}

type RunInfo struct {
	SpinCount        int64  `json:"spinCount"`
	Rows             int    `json:"rows"`
	Seed             uint64 `json:"seed"`
	SimulateBuyBonus bool   `json:"simulateBuyBonus"`
}

// Run executes the full simulation pipeline. Schema and config are assumed
// pre-validated by the caller (server.go validates before invoking).
func Run(s schema.GameSchema, cfg schema.SimulationConfig) (*Result, error) {
	if s.Mechanic == "ways" {
		return runWaysTumble(s, cfg)
	}
	rng := newRNG(cfg.Seed)
	// Snapshot the seed actually used so output is reproducible.
	usedSeed := cfg.Seed
	if usedSeed == 0 {
		// We can't recover the bytes drawn from crypto/rand, so report 0.
	}

	r := newReels(s)
	ev := newEvaluator(s, r)
	tracker := newSymbolHitTracker(r)
	window := r.allocWindow(cfg.Rows)
	lineWins := make([]lineWin, len(s.Paylines))

	totalBet := s.TotalBet()
	if totalBet <= 0 {
		totalBet = 1
	}

	// Free spin parameters (zero when no free-spin feature).
	var (
		fsCount      int
		fsMultiplier = 1.0
		fsRetrigger  bool
		fsRetrigAdd  int
	)
	if s.FreeSpins != nil {
		fsCount = s.FreeSpins.Count
		if s.FreeSpins.Multiplier > 0 {
			fsMultiplier = s.FreeSpins.Multiplier
		}
		fsRetrigger = s.FreeSpins.Retrigger
		fsRetrigAdd = s.FreeSpins.RetriggerCount
		if fsRetrigAdd == 0 {
			fsRetrigAdd = fsCount
		}
	}
	scatterTrig := 0
	if s.Scatter != nil {
		scatterTrig = s.Scatter.TriggerCount
	}

	var (
		stats          statsAccumulator
		featureReturn  float64 // total credits returned inside free spins
		featureSpins   int64
		featureTrigger int64
	)

	N := cfg.SpinCount
	for i := int64(0); i < N; i++ {
		baseReturn, scatCount := spinOnce(rng, r, ev, window, lineWins, totalBet, tracker, true)

		// Spin-level payout ratio (base only — feature wins attributed below).
		spinReturn := baseReturn

		// Free-spin trigger: enough scatters AND a free-spin feature exists.
		if fsCount > 0 && scatterTrig > 0 && scatCount >= scatterTrig {
			featureTrigger++
			fsRet := playFreeSpins(rng, r, ev, window, lineWins, totalBet, tracker,
				fsCount, fsMultiplier, fsRetrigger, fsRetrigAdd, scatterTrig, &featureSpins)
			featureReturn += fsRet
			spinReturn += fsRet
		}

		stats.add(spinReturn / totalBet)
	}

	sum := stats.summary()
	totalBetSum := float64(N) * totalBet
	// totalReturn = sum of per-spin returns = mean ratio × spins × bet
	totalReturn := sum.RTP * float64(N) * totalBet

	// Base RTP = (total - feature) / bet. Use exact featureReturn we tracked.
	baseRTP := 0.0
	if totalBetSum > 0 {
		baseRTP = (totalReturn - featureReturn) / totalBetSum
	}
	freeSpinsRTP := 0.0
	if totalBetSum > 0 {
		freeSpinsRTP = featureReturn / totalBetSum
	}

	hitOut := tracker.toOutput(N, sum.Wins)

	result := &Result{
		TotalSpins:  N,
		TotalBet:    totalBetSum,
		TotalReturn: totalReturn,
		RTP:         sum.RTP,
		BaseRTP:     baseRTP,
		FeatureRTP: FeatureRTP{
			FreeSpins: freeSpinsRTP,
		},
		HitRate:                sum.HitRate,
		Variance:               sum.Variance,
		StandardDeviation:      sum.StandardDeviation,
		Confidence90Low:        sum.Confidence90Low,
		Confidence90High:       sum.Confidence90High,
		Confidence95Low:        sum.Confidence95Low,
		Confidence95High:       sum.Confidence95High,
		FeatureTriggerCount:    featureTrigger,
		SymbolHitProbabilities: hitOut,
		Warnings:               []string{},
		Config: RunInfo{
			SpinCount:        N,
			Rows:             cfg.Rows,
			Seed:             usedSeed,
			SimulateBuyBonus: cfg.SimulateBuyBonus,
		},
	}

	if w := convergenceWarning(sum, 0.005); w != "" {
		result.Warnings = append(result.Warnings, w)
	}

	// Buy bonus: separate pass purchasing direct entry into free spins.
	if cfg.SimulateBuyBonus && s.BuyBonus != nil && fsCount > 0 {
		purchases := int64(100_000)
		// Match the magnitude of the base run when small, to keep variance low.
		if N < purchases {
			purchases = N
		}
		bbRng := newRNG(cfg.Seed ^ 0xBB)
		var bbReturn float64
		for i := int64(0); i < purchases; i++ {
			ret := playFreeSpins(bbRng, r, ev, window, lineWins, totalBet, nil,
				fsCount, fsMultiplier, fsRetrigger, fsRetrigAdd, scatterTrig, nil)
			bbReturn += ret
		}
		bbCost := float64(purchases) * s.BuyBonus.CostMultiplier * totalBet
		bbRTP := 0.0
		if bbCost > 0 {
			bbRTP = bbReturn / bbCost
		}
		result.BuyBonus = &BuyBonusResult{
			Purchases:   purchases,
			TotalCost:   bbCost,
			TotalReturn: bbReturn,
			RTP:         bbRTP,
		}
		result.FeatureRTP.BuyBonus = bbRTP
	}

	return result, nil
}

// spinOnce performs one reel spin, evaluates all paylines + scatter, and
// returns the credit return (after applying spinMultiplier inside callers
// who pass it via a wrapper — base spins call with multiplier=1).
// When trackHits is true the symbolHitTracker is updated.
func spinOnce(
	rng *rand.Rand,
	r *reels,
	ev *evaluator,
	window [][]int,
	lineWins []lineWin,
	totalBet float64,
	tracker *symbolHitTracker,
	trackScatter bool,
) (totalReturn float64, scatterCount int) {
	r.spin(rng, len(window[0]), window)

	// Per-line bet — total bet divided across active lines.
	lines := len(ev.lines)
	if lines == 0 {
		return 0, 0
	}
	lineBet := totalBet / float64(lines)

	for i, line := range ev.lines {
		ev.evalLine(window, line, &lineWins[i])
		if lineWins[i].count > 0 && lineWins[i].multiplier > 0 {
			pay := lineWins[i].multiplier * lineBet
			totalReturn += pay
			if tracker != nil {
				tracker.recordLineWin(lineWins[i].symbol, lineWins[i].count, lineWins[i].wildUsed)
			}
		}
	}

	scatterCount, scatMult := ev.evalScatter(window)
	if scatMult > 0 {
		totalReturn += scatMult * totalBet
	}
	if tracker != nil && trackScatter {
		tracker.recordScatterCount(scatterCount)
	}

	return totalReturn, scatterCount
}

// playFreeSpins runs the free-spin feature loop. Returns total credits awarded
// inside the feature (with multiplier applied). Updates the tracker if non-nil.
func playFreeSpins(
	rng *rand.Rand,
	r *reels,
	ev *evaluator,
	window [][]int,
	lineWins []lineWin,
	totalBet float64,
	tracker *symbolHitTracker,
	startCount int,
	multiplier float64,
	retrigger bool,
	retrigAdd int,
	scatterTrig int,
	featureSpins *int64,
) float64 {
	remaining := startCount
	var ret float64
	for remaining > 0 {
		remaining--
		if featureSpins != nil {
			*featureSpins++
		}
		spinRet, scatCount := spinOnce(rng, r, ev, window, lineWins, totalBet, tracker, false)
		ret += spinRet * multiplier
		if retrigger && scatterTrig > 0 && scatCount >= scatterTrig {
			remaining += retrigAdd
		}
	}
	return ret
}

// runWaysTumble simulates a ways-pay tumble game. Each spin:
//  1. Spins all reels to fill the window.
//  2. Runs the tumble/cascade loop (playTumbleSpinWithBonus).
//  3. Injects scatters into the post-tumble window (base game only).
//  4. Triggers free spins if scatter count >= threshold, using freeStrips.
func runWaysTumble(s schema.GameSchema, cfg schema.SimulationConfig) (*Result, error) {
	rng := newRNG(cfg.Seed)

	r := newReels(s)
	pt := buildPaytable(s, r)
	window := r.allocWindow(cfg.Rows)
	tracker := newSymbolHitTracker(r)

	totalBet := s.TotalBet()
	if totalBet <= 0 {
		totalBet = 1
	}

	// Resolve bonus multiplier symbol index once.
	bmSymIdx := -1
	if s.BonusMultiplier != nil {
		if idx, ok := r.idToIndex[s.BonusMultiplier.SymbolID]; ok {
			bmSymIdx = idx
		}
	}

	// Resolve scatter symbol index and trigger threshold.
	scatterIdx := r.scatterIdx
	scatterTrig := 0
	if s.Scatter != nil {
		scatterTrig = s.Scatter.TriggerCount
	}

	// Free-spin params.
	fsCount := 0
	if s.FreeSpins != nil {
		fsCount = s.FreeSpins.Count
	}

	// Choose strips.
	baseStrips := r.strips
	freeStrips := r.freeStrips
	if freeStrips == nil {
		freeStrips = baseStrips
	}

	var (
		stats          statsAccumulator
		featureReturn  float64
		featureTrigger int64
	)

	for i := int64(0); i < cfg.SpinCount; i++ {
		// 1. Spin base reels.
		r.spin(rng, cfg.Rows, window)

		// 2. Tumble base game.
		baseWin := playTumbleSpinWithBonus(window, baseStrips, rng, pt, s.BonusMultiplier, bmSymIdx)

		// 3. Inject scatters after tumble settles (base game only).
		scatCount := 0
		if s.RandomScatterInject != nil {
			injectScatters(window, s.RandomScatterInject, scatterIdx, rng,
				s.RandomScatterInject.BuyFeature)
		}
		// Count scatters on grid (injected or natural).
		if scatterIdx >= 0 {
			for _, col := range window {
				for _, sym := range col {
					if sym == scatterIdx {
						scatCount++
					}
				}
			}
		}

		spinReturn := baseWin

		// 4. Free spins trigger.
		if fsCount > 0 && scatterTrig > 0 && scatCount >= scatterTrig {
			featureTrigger++
			var fsReturn float64
			for fs := 0; fs < fsCount; fs++ {
				r.spin(rng, cfg.Rows, window)
				fsReturn += playTumbleSpinWithBonus(window, freeStrips, rng, pt, s.BonusMultiplier, bmSymIdx)
			}
			featureReturn += fsReturn
			spinReturn += fsReturn
		}

		stats.add(spinReturn / totalBet)
	}

	sum := stats.summary()
	totalBetSum := float64(cfg.SpinCount) * totalBet
	totalReturn := sum.RTP * float64(cfg.SpinCount) * totalBet

	baseRTP := 0.0
	if totalBetSum > 0 {
		baseRTP = (totalReturn - featureReturn) / totalBetSum
	}
	freeSpinsRTP := 0.0
	if totalBetSum > 0 {
		freeSpinsRTP = featureReturn / totalBetSum
	}

	hitOut := tracker.toOutput(cfg.SpinCount, sum.Wins)

	result := &Result{
		TotalSpins:  cfg.SpinCount,
		TotalBet:    totalBetSum,
		TotalReturn: totalReturn,
		RTP:         sum.RTP,
		BaseRTP:     baseRTP,
		FeatureRTP: FeatureRTP{
			FreeSpins: freeSpinsRTP,
		},
		HitRate:             sum.HitRate,
		Variance:            sum.Variance,
		StandardDeviation:   sum.StandardDeviation,
		Confidence90Low:     sum.Confidence90Low,
		Confidence90High:    sum.Confidence90High,
		Confidence95Low:     sum.Confidence95Low,
		Confidence95High:    sum.Confidence95High,
		FeatureTriggerCount: featureTrigger,
		SymbolHitProbabilities: hitOut,
		Warnings: []string{},
		Config: RunInfo{
			SpinCount:        cfg.SpinCount,
			Rows:             cfg.Rows,
			Seed:             cfg.Seed,
			SimulateBuyBonus: cfg.SimulateBuyBonus,
		},
	}

	if w := convergenceWarning(sum, 0.005); w != "" {
		result.Warnings = append(result.Warnings, w)
	}

	// Buy bonus: enter free spins directly (skip base spin).
	if cfg.SimulateBuyBonus && s.BuyBonus != nil && fsCount > 0 {
		purchases := int64(100_000)
		if cfg.SpinCount < purchases {
			purchases = cfg.SpinCount
		}
		bbRng := newRNG(cfg.Seed ^ 0xBB)
		var bbReturn float64
		for i := int64(0); i < purchases; i++ {
			for fs := 0; fs < fsCount; fs++ {
				r.spin(bbRng, cfg.Rows, window)
				bbReturn += playTumbleSpinWithBonus(window, freeStrips, bbRng, pt, s.BonusMultiplier, bmSymIdx)
			}
		}
		bbCost := float64(purchases) * s.BuyBonus.CostMultiplier * totalBet
		bbRTP := 0.0
		if bbCost > 0 {
			bbRTP = bbReturn / bbCost
		}
		result.BuyBonus = &BuyBonusResult{
			Purchases:   purchases,
			TotalCost:   bbCost,
			TotalReturn: bbReturn,
			RTP:         bbRTP,
		}
		result.FeatureRTP.BuyBonus = bbRTP
	}

	return result, nil
}
