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
