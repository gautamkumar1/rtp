package schema

import (
	"encoding/json"
	"testing"
)

func minimalSchema() GameSchema {
	return GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "test",
		GameName:      "Test",
		GameType:      "video-slot",
		Bet:           BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels:         [][]string{{"A", "B"}, {"A", "B"}, {"A", "B"}},
		Paylines:      [][]int{{0, 0, 0}},
		Symbols: []Symbol{
			{ID: "A", Name: "A"},
			{ID: "B", Name: "B"},
		},
		Paytable: map[string]map[string]float64{
			"A": {"3": 10},
			"B": {"3": 5},
		},
	}
}

func TestValidate_Minimal(t *testing.T) {
	s := minimalSchema()
	if err := s.Validate(); err != nil {
		t.Fatalf("minimal schema should be valid: %v", err)
	}
}

func TestValidate_EmptyReels(t *testing.T) {
	s := minimalSchema()
	s.Reels = nil
	if err := s.Validate(); err == nil {
		t.Fatal("expected error for empty reels")
	}
}

func TestValidate_PaylineLengthMismatch(t *testing.T) {
	s := minimalSchema()
	s.Paylines = [][]int{{0, 0}}
	if err := s.Validate(); err == nil {
		t.Fatal("expected error for payline length mismatch")
	}
}

func TestValidate_UnknownSymbolInReel(t *testing.T) {
	s := minimalSchema()
	s.Reels[0] = []string{"A", "ZZZ"}
	if err := s.Validate(); err == nil {
		t.Fatal("expected error for unknown symbol")
	}
}

func TestValidate_MissingPaytableEntry(t *testing.T) {
	s := minimalSchema()
	delete(s.Paytable, "B")
	if err := s.Validate(); err == nil {
		t.Fatal("expected error for missing paytable entry")
	}
}

func TestValidate_WildScatterSkipPaytable(t *testing.T) {
	s := minimalSchema()
	s.Symbols = append(s.Symbols, Symbol{ID: "W", Name: "Wild", IsWild: true})
	s.Symbols = append(s.Symbols, Symbol{ID: "S", Name: "Scatter", IsScatter: true})
	// Add to reels so reel-symbol check passes.
	s.Reels[0] = []string{"A", "W", "S"}
	if err := s.Validate(); err != nil {
		t.Fatalf("wild/scatter should not need paytable entry: %v", err)
	}
}

func TestSimConfig_Defaults(t *testing.T) {
	c := SimulationConfig{}
	if err := c.Validate(); err != nil {
		t.Fatalf("default config should validate: %v", err)
	}
	if c.SpinCount != 10_000_000 {
		t.Fatalf("default spinCount = %d", c.SpinCount)
	}
	if c.Rows != 3 {
		t.Fatalf("default rows = %d", c.Rows)
	}
}

func TestSimConfig_DisallowedSpinCount(t *testing.T) {
	c := SimulationConfig{SpinCount: 12345}
	if err := c.Validate(); err == nil {
		t.Fatal("expected error for disallowed spin count")
	}
}

func TestSimConfig_AllowedSpinCounts(t *testing.T) {
	allowed := []int64{1_000_000, 10_000_000, 100_000_000, 500_000_000, 1_000_000_000}
	for _, n := range allowed {
		c := SimulationConfig{SpinCount: n}
		if err := c.Validate(); err != nil {
			t.Fatalf("spinCount %d should be allowed: %v", n, err)
		}
	}
}

func TestTotalBet(t *testing.T) {
	s := minimalSchema()
	s.Bet = BetConfig{DefaultBet: 0.5, Lines: 20, CoinValue: 1}
	if got := s.TotalBet(); got != 10 {
		t.Fatalf("TotalBet = %v want 10", got)
	}
	s.Bet.CoinValue = 0
	if got := s.TotalBet(); got != 10 {
		t.Fatalf("TotalBet with zero coin = %v want 10", got)
	}
}

func TestRoundtripJSON(t *testing.T) {
	in := minimalSchema()
	in.Wild = &WildConfig{SymbolID: "W", SubstitutesFor: []string{"A"}, Multiplier: 1}
	in.Scatter = &ScatterConfig{SymbolID: "S", TriggerCount: 3, AwardType: "freeSpins"}
	in.FreeSpins = &FreeSpinsConfig{Count: 10, Multiplier: 2, Retrigger: true}

	b, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out GameSchema
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if out.Wild == nil || out.Wild.SymbolID != "W" {
		t.Fatal("wild lost in roundtrip")
	}
	if out.Scatter == nil || out.Scatter.TriggerCount != 3 {
		t.Fatal("scatter lost in roundtrip")
	}
	if out.FreeSpins == nil || out.FreeSpins.Count != 10 {
		t.Fatal("freeSpins lost in roundtrip")
	}
}

func TestValidate_WaysMechanicAllowsEmptyPaylines(t *testing.T) {
	s := GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "test",
		GameName:      "test",
		Mechanic:      "ways",
		Bet:           BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels:         [][]string{{"A"}, {"A"}, {"A"}},
		Paylines:      [][]int{},
		Symbols:       []Symbol{{ID: "A", Name: "A"}},
		Paytable:      map[string]map[string]float64{"A": {"8": 20}},
	}
	if err := s.Validate(); err != nil {
		t.Fatalf("ways mechanic should allow empty paylines, got: %v", err)
	}
}

func TestValidate_RandomScatterInjectSymbolMustExist(t *testing.T) {
	s := GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "test",
		GameName:      "test",
		Mechanic:      "ways",
		Bet:           BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels:         [][]string{{"A"}, {"A"}, {"A"}},
		Paylines:      [][]int{},
		Symbols:       []Symbol{{ID: "A", Name: "A"}},
		Paytable:      map[string]map[string]float64{"A": {"8": 20}},
		RandomScatterInject: &RandomScatterInjectConfig{
			SymbolID:    "MISSING",
			BaseWeights: []ScatterWeightEntry{{Count: 1, Weight: 10}},
		},
	}
	if err := s.Validate(); err == nil {
		t.Fatal("expected error for unknown scatter inject symbol")
	}
}
