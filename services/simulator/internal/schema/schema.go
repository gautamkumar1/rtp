// Package schema defines the unified game schema input model and validation
// rules used by the Go simulator. Shape must stay compatible with
// packages/game-schema (Zod) output that the API ships in normalized-schema.json.
package schema

import "fmt"

// GameSchema mirrors the TS GameSchema in packages/game-schema.
// Only fields the simulator reads are listed — extras are ignored on unmarshal.
type GameSchema struct {
	SchemaVersion string `json:"schemaVersion"`
	Provider      string `json:"provider"`
	GameID        string `json:"gameId"`
	GameName      string `json:"gameName"`
	GameType      string `json:"gameType"`

	Bet BetConfig `json:"bet"`

	// Reels[i] = symbol IDs on reel i (length = strip length on that reel).
	Reels [][]string `json:"reels"`

	// Paylines[i] = row index per reel column. Length must equal len(Reels).
	Paylines [][]int `json:"paylines"`

	Symbols  []Symbol                      `json:"symbols"`
	Paytable map[string]map[string]float64 `json:"paytable"`

	Wild      *WildConfig      `json:"wild,omitempty"`
	Scatter   *ScatterConfig   `json:"scatter,omitempty"`
	FreeSpins *FreeSpinsConfig `json:"freeSpins,omitempty"`
	Bonus     *BonusConfig     `json:"bonus,omitempty"`
	BuyBonus  *BuyBonusConfig  `json:"buyBonus,omitempty"`

	Mechanic            string                     `json:"mechanic,omitempty"`
	Tumble              *TumbleConfig              `json:"tumble,omitempty"`
	RandomScatterInject *RandomScatterInjectConfig `json:"randomScatterInject,omitempty"`
	BonusMultiplier     *BonusMultiplierConfig     `json:"bonusMultiplier,omitempty"`
	DeclaredRTP         float64                    `json:"declaredRtp,omitempty"`
	VariantLabel        string                     `json:"variantLabel,omitempty"`

	Warnings []string `json:"warnings"`
}

type BetConfig struct {
	DefaultBet float64 `json:"defaultBet"`
	Lines      int     `json:"lines"`
	CoinValue  float64 `json:"coinValue"`
}

type Symbol struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	IsWild    bool   `json:"isWild"`
	IsScatter bool   `json:"isScatter"`
}

type WildConfig struct {
	SymbolID       string   `json:"symbolId"`
	SubstitutesFor []string `json:"substitutesFor"`
	Multiplier     float64  `json:"multiplier,omitempty"`
}

type ScatterConfig struct {
	SymbolID     string             `json:"symbolId"`
	TriggerCount int                `json:"triggerCount"`
	AwardType    string             `json:"awardType"`
	Pays         map[string]float64 `json:"pays,omitempty"`
}

type FreeSpinsConfig struct {
	Count          int     `json:"count"`
	Multiplier     float64 `json:"multiplier"`
	Retrigger      bool    `json:"retrigger"`
	RetriggerCount int     `json:"retriggerCount,omitempty"`
}

type BonusConfig struct {
	Description      string `json:"description"`
	TriggerCondition string `json:"triggerCondition"`
}

type BuyBonusConfig struct {
	CostMultiplier float64 `json:"costMultiplier"`
	EntryPoint     string  `json:"entryPoint"`
	RTP            float64 `json:"rtp,omitempty"`
}

type TumbleConfig struct {
	Enabled   bool       `json:"enabled"`
	FreeReels [][]string `json:"freeReels,omitempty"`
}

type ScatterWeightEntry struct {
	Count  int `json:"count"`
	Weight int `json:"weight"`
}

type RandomScatterInjectConfig struct {
	SymbolID   string               `json:"symbolId"`
	BaseWeights []ScatterWeightEntry `json:"baseWeights"`
	BuyFeature bool                 `json:"buyFeature"`
	// PerColumn: if true, run the weighted draw once per reel column rather
	// than once for the whole grid. Supports Cat 6-style independent per-reel injection.
	PerColumn bool `json:"perColumn"`
}

type BonusMultiplierConfig struct {
	SymbolID string   `json:"symbolId"`
	Weights  [][2]int `json:"weights"`
}

// SimulationConfig is the second top-level body field on POST /simulate.
type SimulationConfig struct {
	SpinCount int64  `json:"spinCount"`
	Rows      int    `json:"rows"`
	Seed      uint64 `json:"seed,omitempty"`
	// SimulateBuyBonus: when true, run a separate buy-bonus pass with
	// CostMultiplier × bet purchases entering the free-spin feature directly.
	SimulateBuyBonus bool `json:"simulateBuyBonus,omitempty"`
}

// SimulateRequest is the body of POST /simulate.
type SimulateRequest struct {
	Schema GameSchema       `json:"schema"`
	Config SimulationConfig `json:"config"`
}

const allowedSpinCountSummary = "1_000_000 / 10_000_000 / 100_000_000 / 500_000_000 / 1_000_000_000"

var allowedSpinCounts = map[int64]struct{}{
	1_000_000:     {},
	10_000_000:    {},
	100_000_000:   {},
	500_000_000:   {},
	1_000_000_000: {},
}

// Validate enforces the simulation-readiness rules from TODO.md §5.2.
// Returns the first hard error so the simulator never spins with bogus input.
func (s *GameSchema) Validate() error {
	if len(s.Reels) == 0 {
		return fmt.Errorf("schema: reels must be non-empty")
	}
	isWays := s.Mechanic == "ways"
	if !isWays && len(s.Paylines) == 0 {
		return fmt.Errorf("schema: paylines must be non-empty")
	}
	if len(s.Symbols) == 0 {
		return fmt.Errorf("schema: symbols must be non-empty")
	}
	if len(s.Paytable) == 0 {
		return fmt.Errorf("schema: paytable must be non-empty")
	}
	if s.Bet.DefaultBet <= 0 {
		return fmt.Errorf("schema: bet.defaultBet must be > 0")
	}

	// Each reel strip must have at least one symbol.
	for i, strip := range s.Reels {
		if len(strip) == 0 {
			return fmt.Errorf("schema: reels[%d] is empty", i)
		}
	}

	// Payline length must match reel count (payline games only).
	for i, line := range s.Paylines {
		if len(line) != len(s.Reels) {
			return fmt.Errorf("schema: paylines[%d] length %d != reel count %d", i, len(line), len(s.Reels))
		}
	}

	// All symbols referenced by reels must exist.
	symIDs := make(map[string]struct{}, len(s.Symbols))
	for _, sym := range s.Symbols {
		symIDs[sym.ID] = struct{}{}
	}
	for r, strip := range s.Reels {
		for _, sym := range strip {
			if _, ok := symIDs[sym]; !ok {
				return fmt.Errorf("schema: reels[%d] references unknown symbol %q", r, sym)
			}
		}
	}

	// Paytable must cover every non-wild non-scatter symbol.
	for _, sym := range s.Symbols {
		if sym.IsWild || sym.IsScatter {
			continue
		}
		if _, ok := s.Paytable[sym.ID]; !ok {
			return fmt.Errorf("schema: paytable missing entry for symbol %q", sym.ID)
		}
	}

	// Validate RandomScatterInject symbol exists.
	if s.RandomScatterInject != nil {
		if _, ok := symIDs[s.RandomScatterInject.SymbolID]; !ok {
			return fmt.Errorf("schema: randomScatterInject.symbolId %q not in symbols", s.RandomScatterInject.SymbolID)
		}
	}

	// Validate BonusMultiplier symbol exists.
	if s.BonusMultiplier != nil {
		if _, ok := symIDs[s.BonusMultiplier.SymbolID]; !ok {
			return fmt.Errorf("schema: bonusMultiplier.symbolId %q not in symbols", s.BonusMultiplier.SymbolID)
		}
	}

	return nil
}

// Validate the simulation config. Applies defaults; returns errors for
// out-of-range values.
func (c *SimulationConfig) Validate() error {
	if c.SpinCount == 0 {
		c.SpinCount = 10_000_000
	}
	if _, ok := allowedSpinCounts[c.SpinCount]; !ok {
		return fmt.Errorf("config: spinCount %d not in {%s}", c.SpinCount, allowedSpinCountSummary)
	}
	if c.Rows == 0 {
		c.Rows = 3
	}
	if c.Rows < 1 || c.Rows > 10 {
		return fmt.Errorf("config: rows %d out of range [1,10]", c.Rows)
	}
	return nil
}

// WildID returns the wild symbol id if a wild is configured, or "".
func (s *GameSchema) WildID() string {
	if s.Wild == nil {
		return ""
	}
	return s.Wild.SymbolID
}

// ScatterID returns the scatter symbol id if a scatter is configured, or "".
func (s *GameSchema) ScatterID() string {
	if s.Scatter == nil {
		return ""
	}
	return s.Scatter.SymbolID
}

// TotalBet returns total cost per spin = defaultBet × lines (× coinValue if > 0).
// Coin value of 0 is treated as 1.
func (s *GameSchema) TotalBet() float64 {
	coin := s.Bet.CoinValue
	if coin <= 0 {
		coin = 1
	}
	lines := s.Bet.Lines
	if lines <= 0 {
		lines = len(s.Paylines)
	}
	return s.Bet.DefaultBet * float64(lines) * coin
}
