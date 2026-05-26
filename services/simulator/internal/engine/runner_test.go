package engine

import (
	"math"
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

// fairCoinSchema: 3 reels of ["A","B"], 1 payline, A×3 pays 8.
// Expected RTP = (1/8) * 8 = 1.0, hit rate = 1/8.
func fairCoinSchema() schema.GameSchema {
	return schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "t",
		GameName:      "t",
		Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels: [][]string{
			{"A", "B"},
			{"A", "B"},
			{"A", "B"},
		},
		Paylines: [][]int{{0, 0, 0}},
		Symbols: []schema.Symbol{
			{ID: "A", Name: "A"},
			{ID: "B", Name: "B"},
		},
		Paytable: map[string]map[string]float64{
			"A": {"3": 8},
			"B": {"3": 0}, // entry required by validator, pays nothing
		},
	}
}

func TestRun_FairCoinRTP(t *testing.T) {
	s := fairCoinSchema()
	cfg := schema.SimulationConfig{SpinCount: 1_000_000, Rows: 1, Seed: 12345}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	res, err := Run(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	// True RTP = 1.0. SD per spin = sqrt(E[X²] - E[X]²) = sqrt(8 - 1) = sqrt(7) ≈ 2.65
	// SE of mean ≈ 2.65 / sqrt(1e6) ≈ 0.00265
	// 5σ window — 1.0 ± 0.013
	if math.Abs(res.RTP-1.0) > 0.013 {
		t.Fatalf("RTP=%.6f, expected ≈1.0", res.RTP)
	}
	if math.Abs(res.HitRate-0.125) > 0.002 {
		t.Fatalf("hit rate=%.6f, expected ≈0.125", res.HitRate)
	}
	// 95% CI should contain 1.0
	if res.Confidence95Low > 1.0 || res.Confidence95High < 1.0 {
		t.Fatalf("CI95 [%.6f,%.6f] does not contain true RTP", res.Confidence95Low, res.Confidence95High)
	}
}

func TestRun_Determinism(t *testing.T) {
	s := fairCoinSchema()
	cfg := schema.SimulationConfig{SpinCount: 1_000_000, Rows: 1, Seed: 777}
	_ = cfg.Validate()
	a, _ := Run(s, cfg)
	b, _ := Run(s, cfg)
	if a.RTP != b.RTP {
		t.Fatalf("non-deterministic: a.RTP=%v b.RTP=%v", a.RTP, b.RTP)
	}
	if a.HitRate != b.HitRate {
		t.Fatalf("non-deterministic hit rate")
	}
}

func TestRun_SymbolHitProbabilities(t *testing.T) {
	s := fairCoinSchema()
	cfg := schema.SimulationConfig{SpinCount: 1_000_000, Rows: 1, Seed: 42}
	_ = cfg.Validate()
	res, _ := Run(s, cfg)
	// Find A row.
	var aHits int64
	for _, row := range res.SymbolHitProbabilities.BySymbol {
		if row.Symbol == "A" {
			aHits = row.Hits[2] // count=3 entry (index = count-1)
		}
	}
	// Expect ~125,000 (1/8 of 1M)
	if aHits < 120_000 || aHits > 130_000 {
		t.Fatalf("A 3x hits = %d, expected ~125,000", aHits)
	}
}

func TestRun_FreeSpinsTriggerCounted(t *testing.T) {
	// Build a slot where every spin lands 3 scatters → trigger every spin.
	s := schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "t",
		GameName:      "t",
		Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels: [][]string{
			{"S"}, {"S"}, {"S"},
		},
		Paylines: [][]int{{0, 0, 0}},
		Symbols: []schema.Symbol{
			{ID: "S", Name: "Scatter", IsScatter: true},
		},
		Paytable: map[string]map[string]float64{},
		Scatter: &schema.ScatterConfig{
			SymbolID: "S", TriggerCount: 3, AwardType: "freeSpins",
		},
		FreeSpins: &schema.FreeSpinsConfig{
			Count: 5, Multiplier: 1, Retrigger: false,
		},
	}
	cfg := schema.SimulationConfig{SpinCount: 1_000_000, Rows: 1, Seed: 1}
	_ = cfg.Validate()
	res, err := Run(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if res.FeatureTriggerCount != 1_000_000 {
		t.Fatalf("expected trigger every spin, got %d", res.FeatureTriggerCount)
	}
}

func TestRun_BuyBonusReported(t *testing.T) {
	s := fairCoinSchema()
	s.FreeSpins = &schema.FreeSpinsConfig{Count: 3, Multiplier: 1}
	s.BuyBonus = &schema.BuyBonusConfig{CostMultiplier: 100, EntryPoint: "freeSpins"}
	cfg := schema.SimulationConfig{
		SpinCount:        1_000_000,
		Rows:             1,
		Seed:             999,
		SimulateBuyBonus: true,
	}
	_ = cfg.Validate()
	res, err := Run(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if res.BuyBonus == nil {
		t.Fatal("expected BuyBonus output")
	}
	if res.BuyBonus.Purchases <= 0 {
		t.Fatal("buyBonus purchases should be > 0")
	}
}

// cat6MiniSchema builds a minimal ways-pay tumble schema for unit testing.
// 3 reels × 3 rows (9 cells). Symbol "0" pays at count ≥3.
// Strip has 25% density of "0" so initial wins are common (~33% hit rate)
// but after cascade removal, refill rarely regenerates enough "0"s to re-trigger.
func cat6MiniSchema() schema.GameSchema {
	// 12 symbols per strip: 3 paying (0) and 9 non-paying (1) — 25% density.
	baseStrip := []string{"0", "1", "1", "1", "0", "1", "1", "1", "0", "1", "1", "1"}
	reels := make([][]string, 3)
	for i := range reels {
		reels[i] = baseStrip
	}
	return schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "cat6mini",
		GameName:      "Cat6Mini",
		Mechanic:      "ways",
		Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels:         reels,
		Paylines:      [][]int{},
		Symbols: []schema.Symbol{
			{ID: "0", Name: "H1"},
			{ID: "1", Name: "Low"},
		},
		Paytable: map[string]map[string]float64{
			"0": {"3": 5, "4": 10},
			"1": {"10": 1}, // threshold exceeds max grid cells (3×3=9) — never pays
		},
		Tumble: &schema.TumbleConfig{Enabled: true},
	}
}

func TestRun_WaysTumble_RTPInRange(t *testing.T) {
	s := cat6MiniSchema()
	cfg := schema.SimulationConfig{SpinCount: 1_000_000, Rows: 3, Seed: 42}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	res, err := Run(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if res.RTP <= 0 || res.RTP > 10.0 {
		t.Fatalf("ways RTP=%.6f out of sanity range", res.RTP)
	}
	if res.Confidence95Low >= res.Confidence95High {
		t.Fatalf("bad CI95: [%.6f, %.6f]", res.Confidence95Low, res.Confidence95High)
	}
}

func TestRun_WaysTumble_Deterministic(t *testing.T) {
	s := cat6MiniSchema()
	cfg := schema.SimulationConfig{SpinCount: 500_000, Rows: 3, Seed: 99}
	_ = cfg.Validate()
	a, _ := Run(s, cfg)
	b, _ := Run(s, cfg)
	if a.RTP != b.RTP {
		t.Fatalf("ways tumble non-deterministic: a=%v b=%v", a.RTP, b.RTP)
	}
}
