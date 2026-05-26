# Ways-Pay + Tumble + Bonus Multiplier Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Go simulator and API to correctly simulate ways-pay tumble games with variant selection, producing total RTP within ±0.1% of Excel-verified targets for all 6 Cat 6 variants.

**Architecture:** New schema fields (`mechanic`, `tumble`, `randomScatterInject`, `bonusMultiplier`, `declaredRtp`, `variantLabel`) drive game-type routing in the Go engine. The existing payline path is untouched; a new `runWaysTumble()` path handles ways/cascade/scatter-inject games. Variants are stored as separate Game rows with a `parentGameId` foreign key.

**Tech Stack:** Go 1.22 (simulator engine), TypeScript + Zod (game-schema package), Prisma + PostgreSQL (API DB), Express (API routes), pnpm monorepo.

---

## Task 1: Fix runner.ts isWild bug (immediate unblock)

**Files:**
- Modify: `apps/api/src/simulation/runner.ts:60-68`

- [ ] **Step 1: Update the symbol patch loop**

Replace the existing patch block (lines 58–68) with:

```typescript
  // Symbols with no paytable entry are non-paying (blanks, bonus triggers, etc.).
  // Mark wild as isWild, everything else missing from paytable as scatter so the
  // Go validator skips the paytable requirement for them.
  const paytableIds = new Set(Object.keys(schema.paytable ?? {}))
  const wildId = schema.wild?.symbolId
  for (const sym of schema.symbols ?? []) {
    if (sym.isWild || sym.isScatter) continue
    if (sym.id === wildId) {
      sym.isWild = true
      schema.warnings.push(`symbol "${sym.id}" (${sym.name}): marked isWild — matches wild.symbolId`)
      continue
    }
    if (!paytableIds.has(sym.id)) {
      sym.isScatter = true
      schema.warnings.push(`symbol "${sym.id}" (${sym.name}): no paytable entry — treated as non-paying scatter for simulation`)
    }
  }
```

- [ ] **Step 2: Restart API server and verify no schema-validation error**

```bash
cd /Users/mac/Desktop/coding/rtp
pnpm --filter api dev
```

Trigger a simulation for game `jvc9lyx41es1z2pogi8ntx30`. Confirm no `paytable missing entry for symbol "0"` error in logs.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/simulation/runner.ts
git commit -m "fix(runner): mark wild symbol isWild instead of isScatter in schema patch"
```

---

## Task 2: Extend TypeScript game-schema package

**Files:**
- Modify: `packages/game-schema/src/index.ts`

- [ ] **Step 1: Add new Zod schemas before `BetConfigSchema`**

Insert after the `BuyBonusSchema` block and before `BetConfigSchema`:

```typescript
const TumbleSchema = z.object({
  enabled: z.boolean(),
  freeReels: z.array(z.array(z.string())).optional(),
}).optional()

const RandomScatterInjectSchema = z.object({
  symbolId: z.string(),
  baseWeights: z.array(z.object({ count: z.number().int(), weight: z.number().int() })),
  buyFeature: z.boolean().default(false),
}).optional()

const BonusMultiplierSchema = z.object({
  symbolId: z.string(),
  weights: z.array(z.tuple([z.number(), z.number()])),
}).optional()
```

- [ ] **Step 2: Add new fields to `GameSchema`**

Add these fields to the `GameSchema` object, after `buyBonus`:

```typescript
  mechanic: z.enum(['paylines', 'ways']).default('paylines'),
  tumble: TumbleSchema,
  randomScatterInject: RandomScatterInjectSchema,
  bonusMultiplier: BonusMultiplierSchema,
  declaredRtp: z.number().min(0).max(1).optional(),
  variantLabel: z.string().optional(),
```

- [ ] **Step 3: Make paylines optional for ways games**

Replace the `paylines` field definition:
```typescript
  // Before:
  paylines: z.array(PaylineSchema).min(1),

  // After:
  paylines: z.array(PaylineSchema).default([]),
```

Add `.superRefine()` after the closing of the `GameSchema` object:

```typescript
.superRefine((data, ctx) => {
  if (data.mechanic === 'paylines' && data.paylines.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_small,
      minimum: 1,
      type: 'array',
      inclusive: true,
      path: ['paylines'],
      message: 'paylines must have at least 1 entry when mechanic is "paylines"',
    })
  }
})
```

- [ ] **Step 4: Export new types at the bottom of the file**

```typescript
export type TumbleConfig = z.infer<typeof TumbleSchema>
export type RandomScatterInjectConfig = z.infer<typeof RandomScatterInjectSchema>
export type BonusMultiplierConfig = z.infer<typeof BonusMultiplierSchema>
```

- [ ] **Step 5: Run existing schema tests**

```bash
cd /Users/mac/Desktop/coding/rtp
pnpm --filter @rtp/game-schema test
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/game-schema/src/index.ts
git commit -m "feat(game-schema): add mechanic, tumble, randomScatterInject, bonusMultiplier, declaredRtp, variantLabel fields"
```

---

## Task 3: Extend Go schema struct and validation

**Files:**
- Modify: `services/simulator/internal/schema/schema.go`
- Modify: `services/simulator/internal/schema/schema_test.go`

- [ ] **Step 1: Add new structs to schema.go**

After `BuyBonusConfig` struct, add:

```go
type TumbleConfig struct {
	Enabled   bool       `json:"enabled"`
	FreeReels [][]string `json:"freeReels,omitempty"`
}

type ScatterWeightEntry struct {
	Count  int `json:"count"`
	Weight int `json:"weight"`
}

type RandomScatterInjectConfig struct {
	SymbolID    string               `json:"symbolId"`
	BaseWeights []ScatterWeightEntry `json:"baseWeights"`
	BuyFeature  bool                 `json:"buyFeature"`
}

type BonusMultiplierConfig struct {
	SymbolID string      `json:"symbolId"`
	Weights  [][2]int    `json:"weights"`
}
```

- [ ] **Step 2: Add new fields to GameSchema struct**

In the `GameSchema` struct, after `BuyBonus *BuyBonusConfig`:

```go
	Mechanic            string                     `json:"mechanic,omitempty"`
	Tumble              *TumbleConfig              `json:"tumble,omitempty"`
	RandomScatterInject *RandomScatterInjectConfig `json:"randomScatterInject,omitempty"`
	BonusMultiplier     *BonusMultiplierConfig     `json:"bonusMultiplier,omitempty"`
	DeclaredRTP         float64                    `json:"declaredRtp,omitempty"`
	VariantLabel        string                     `json:"variantLabel,omitempty"`
```

- [ ] **Step 3: Update Validate() for ways mechanic**

Replace the paylines length check and paytable check in `Validate()`:

```go
	// For payline games, paylines must be non-empty.
	// For ways games, paylines are unused (engine counts all positions).
	isWays := s.Mechanic == "ways"
	if !isWays && len(s.Paylines) == 0 {
		return fmt.Errorf("schema: paylines must be non-empty")
	}

	// ... (keep existing symbol/reel checks unchanged) ...

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
```

- [ ] **Step 4: Write a failing test for ways validation**

Add to `schema_test.go`:

```go
func TestValidate_WaysMechanicAllowsEmptyPaylines(t *testing.T) {
	s := schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "test",
		GameName:      "test",
		Mechanic:      "ways",
		Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels:         [][]string{{"A"}, {"A"}, {"A"}},
		Paylines:      [][]int{},
		Symbols:       []schema.Symbol{{ID: "A", Name: "A"}},
		Paytable:      map[string]map[string]float64{"A": {"8": 20}},
	}
	if err := s.Validate(); err != nil {
		t.Fatalf("ways mechanic should allow empty paylines, got: %v", err)
	}
}

func TestValidate_RandomScatterInjectSymbolMustExist(t *testing.T) {
	s := schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "test",
		GameName:      "test",
		Mechanic:      "ways",
		Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels:         [][]string{{"A"}, {"A"}, {"A"}},
		Paylines:      [][]int{},
		Symbols:       []schema.Symbol{{ID: "A", Name: "A"}},
		Paytable:      map[string]map[string]float64{"A": {"8": 20}},
		RandomScatterInject: &schema.RandomScatterInjectConfig{
			SymbolID:    "MISSING",
			BaseWeights: []schema.ScatterWeightEntry{{Count: 1, Weight: 10}},
		},
	}
	if err := s.Validate(); err == nil {
		t.Fatal("expected error for unknown scatter inject symbol")
	}
}
```

- [ ] **Step 5: Run tests to confirm they fail, then pass after implementation**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/schema/... -v -run TestValidate_Ways
```

Expected after step 3 implementation: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/simulator/internal/schema/schema.go services/simulator/internal/schema/schema_test.go
git commit -m "feat(simulator/schema): add ways mechanic, tumble, scatter-inject, bonus-multiplier fields"
```

---

## Task 4: Add freeStrips to reels struct

**Files:**
- Modify: `services/simulator/internal/engine/reel.go`
- Modify: `services/simulator/internal/engine/reel_test.go`

- [ ] **Step 1: Write failing test**

Add to `reel_test.go`:

```go
func TestNewReels_FreeStripsLoaded(t *testing.T) {
	s := schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "t",
		GameName:      "t",
		Mechanic:      "ways",
		Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
		Reels:         [][]string{{"A", "B"}, {"A", "B"}},
		Paylines:      [][]int{},
		Symbols:       []schema.Symbol{{ID: "A", Name: "A"}, {ID: "B", Name: "B"}},
		Paytable:      map[string]map[string]float64{"A": {"2": 5}, "B": {"2": 3}},
		Tumble: &schema.TumbleConfig{
			Enabled:   true,
			FreeReels: [][]string{{"A", "A", "B"}, {"A", "A", "B"}},
		},
	}
	r := newReels(s)
	if r.freeStrips == nil {
		t.Fatal("expected freeStrips to be populated")
	}
	if len(r.freeStrips) != 2 {
		t.Fatalf("expected 2 free strips, got %d", len(r.freeStrips))
	}
	if len(r.freeStrips[0]) != 3 {
		t.Fatalf("expected free strip length 3, got %d", len(r.freeStrips[0]))
	}
}
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run TestNewReels_FreeStripsLoaded
```

Expected: compile error or test failure.

- [ ] **Step 3: Add freeStrips field and populate it in newReels()**

In `reel.go`, add `freeStrips [][]int` to the `reels` struct:

```go
type reels struct {
	strips     [][]int
	freeStrips [][]int  // nil when no tumble free-reel config
	symbolIDs  []string
	idToIndex  map[string]int
	wildIdx    int
	scatterIdx int
}
```

In `newReels()`, after the existing `for reelIdx, strip := range s.Reels` loop, add:

```go
	if s.Tumble != nil && len(s.Tumble.FreeReels) > 0 {
		r.freeStrips = make([][]int, len(s.Tumble.FreeReels))
		for reelIdx, strip := range s.Tumble.FreeReels {
			ints := make([]int, len(strip))
			for j, symID := range strip {
				ints[j] = r.idToIndex[symID]
			}
			r.freeStrips[reelIdx] = ints
		}
	}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run TestNewReels_FreeStripsLoaded
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/simulator/internal/engine/reel.go services/simulator/internal/engine/reel_test.go
git commit -m "feat(simulator/engine): add freeStrips to reels struct for tumble free-game support"
```

---

## Task 5: Implement ways-pay evaluation (ways.go)

**Files:**
- Create: `services/simulator/internal/engine/ways.go`
- Create: `services/simulator/internal/engine/ways_test.go`

- [ ] **Step 1: Write failing tests**

Create `services/simulator/internal/engine/ways_test.go`:

```go
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
	// symbol 0: pays at count 8+ — but grid is 6 positions max, so never wins
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run "TestCountSymbol|TestWaysPayForCount|TestCollectWaysWins"
```

Expected: compile error (functions not defined).

- [ ] **Step 3: Create ways.go**

Create `services/simulator/internal/engine/ways.go`:

```go
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
	// Count each symbol once across the whole grid.
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
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run "TestCountSymbol|TestWaysPayForCount|TestCollectWaysWins"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/simulator/internal/engine/ways.go services/simulator/internal/engine/ways_test.go
git commit -m "feat(simulator/engine): add ways-pay evaluation (countSymbol, waysPayForCount, collectWaysWins)"
```

---

## Task 6: Implement scatter injection (scatter_inject.go)

**Files:**
- Create: `services/simulator/internal/engine/scatter_inject.go`
- Create: `services/simulator/internal/engine/scatter_inject_test.go`

- [ ] **Step 1: Write failing tests**

Create `services/simulator/internal/engine/scatter_inject_test.go`:

```go
package engine

import (
	"math/rand/v2"
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

func TestWeightedDraw_ReturnsValidCount(t *testing.T) {
	weights := []schema.ScatterWeightEntry{
		{Count: 0, Weight: 29},
		{Count: 1, Weight: 6},
	}
	rng := rand.New(rand.NewPCG(42, 0))
	counts := map[int]int{}
	for i := 0; i < 10000; i++ {
		c := weightedDraw(weights, rng)
		counts[c]++
	}
	// Should see roughly 29/(29+6) ≈ 83% zeros and 6/35 ≈ 17% ones
	ratio := float64(counts[1]) / 10000.0
	if ratio < 0.12 || ratio > 0.22 {
		t.Errorf("count=1 ratio %.3f out of expected ~0.17", ratio)
	}
}

func TestInjectScatters_PlacesScatterSymbols(t *testing.T) {
	window := [][]int{
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
		{1, 2, 3, 4, 5},
	}
	cfg := &schema.RandomScatterInjectConfig{
		SymbolID: "F",
		BaseWeights: []schema.ScatterWeightEntry{
			{Count: 3, Weight: 1}, // always inject 3
		},
		BuyFeature: false,
	}
	scatterIdx := 99
	rng := rand.New(rand.NewPCG(1, 0))
	injectScatters(window, cfg, scatterIdx, rng, false)

	total := 0
	for _, col := range window {
		for _, s := range col {
			if s == scatterIdx {
				total++
			}
		}
	}
	if total != 3 {
		t.Errorf("expected 3 injected scatters, got %d", total)
	}
}

func TestInjectScatters_BuyFeatureAlwaysInjectsEnoughToTrigger(t *testing.T) {
	// 6×5 grid, all symbol 1
	window := make([][]int, 6)
	for i := range window {
		window[i] = []int{1, 1, 1, 1, 1}
	}
	cfg := &schema.RandomScatterInjectConfig{
		SymbolID:    "F",
		BaseWeights: []schema.ScatterWeightEntry{{Count: 1, Weight: 10}},
		BuyFeature:  true,
	}
	scatterIdx := 31
	rng := rand.New(rand.NewPCG(7, 0))
	triggerCount := 3
	injectScatters(window, cfg, scatterIdx, rng, true)

	count := 0
	for _, col := range window {
		for _, s := range col {
			if s == scatterIdx {
				count++
			}
		}
	}
	if count < triggerCount {
		t.Errorf("buy feature should inject >= %d scatters, got %d", triggerCount, count)
	}
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run "TestWeightedDraw|TestInjectScatters"
```

Expected: compile error.

- [ ] **Step 3: Create scatter_inject.go**

Create `services/simulator/internal/engine/scatter_inject.go`:

```go
package engine

import (
	"math/rand/v2"

	"github.com/rtp-platform/simulator/internal/schema"
)

// weightedDraw picks a count value from a weighted list.
func weightedDraw(weights []schema.ScatterWeightEntry, rng *rand.Rand) int {
	total := 0
	for _, w := range weights {
		total += w.Weight
	}
	if total == 0 {
		return 0
	}
	r := rng.IntN(total)
	for _, w := range weights {
		if r < w.Weight {
			return w.Count
		}
		r -= w.Weight
	}
	return weights[len(weights)-1].Count
}

// injectScatters places scatter symbols at random positions in the window.
// isBuyFeature=true ensures at least the trigger count (3) are placed,
// matching Cat 6 buy-feature behavior (modes 3-5 guarantee free-spin entry).
func injectScatters(
	window [][]int,
	cfg *schema.RandomScatterInjectConfig,
	scatterIdx int,
	rng *rand.Rand,
	isBuyFeature bool,
) {
	if cfg == nil {
		return
	}

	count := weightedDraw(cfg.BaseWeights, rng)

	// Buy-feature: guarantee at least 3 scatters (trigger threshold).
	if isBuyFeature && count < 3 {
		count = 3
	}

	if count == 0 {
		return
	}

	// Build a flat list of all grid positions.
	type pos struct{ col, row int }
	var positions []pos
	for c, col := range window {
		for r := range col {
			positions = append(positions, pos{c, r})
		}
	}

	// Fisher-Yates shuffle to pick `count` unique positions.
	for i := 0; i < count && i < len(positions); i++ {
		j := i + rng.IntN(len(positions)-i)
		positions[i], positions[j] = positions[j], positions[i]
		p := positions[i]
		window[p.col][p.row] = scatterIdx
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run "TestWeightedDraw|TestInjectScatters"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/simulator/internal/engine/scatter_inject.go services/simulator/internal/engine/scatter_inject_test.go
git commit -m "feat(simulator/engine): add weighted scatter injection for ways-pay games"
```

---

## Task 7: Implement tumble/cascade loop (tumble.go)

**Files:**
- Create: `services/simulator/internal/engine/tumble.go`
- Create: `services/simulator/internal/engine/tumble_test.go`

- [ ] **Step 1: Write failing tests**

Create `services/simulator/internal/engine/tumble_test.go`:

```go
package engine

import (
	"math/rand/v2"
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

func testWaysPt() *paytable {
	// 3 symbols, max count 6. Symbol 0 pays at count 2+.
	pt := &paytable{maxCount: 6, table: make([][]float64, 3)}
	for i := range pt.table {
		pt.table[i] = make([]float64, 6)
	}
	pt.table[0][1] = 5 // count=2 → 5x
	pt.table[0][2] = 10 // count=3 → 10x
	return pt
}

func TestRemoveWinners_ClearsPositions(t *testing.T) {
	state := &tumbleState{
		window: [][]int{{0, 1}, {0, 2}},
		elim:   [][]bool{{false, false}, {false, false}},
	}
	removeWinners(state, []int{0})
	if !state.elim[0][0] || !state.elim[1][0] {
		t.Error("winning symbol positions should be marked eliminated")
	}
	if state.elim[0][1] || state.elim[1][1] {
		t.Error("non-winning positions should not be eliminated")
	}
}

func TestPlayTumbleSpin_NoWinReturnsZero(t *testing.T) {
	// Window: all symbol 1 (no pays for symbol 1)
	window := [][]int{{1, 1}, {1, 1}, {1, 1}}
	strips := [][]int{{1, 1}, {1, 1}, {1, 1}}
	pt := testWaysPt()
	rng := rand.New(rand.NewPCG(1, 0))
	ret := playTumbleSpin(window, strips, rng, pt, nil)
	if ret != 0 {
		t.Errorf("expected 0 return for no-win window, got %f", ret)
	}
}

func TestPlayTumbleSpin_WinReturnsPositive(t *testing.T) {
	// Window: symbol 0 appears in all 3 cols × 1 row = 3 occurrences → pays 10x
	window := [][]int{{0}, {0}, {0}}
	strips := [][]int{{1}, {1}, {1}} // refill with non-winning symbol
	pt := testWaysPt()
	rng := rand.New(rand.NewPCG(2, 0))
	ret := playTumbleSpin(window, strips, rng, pt, nil)
	if ret <= 0 {
		t.Errorf("expected positive return for winning window, got %f", ret)
	}
}

func TestPlayTumbleSpin_BonusMultiplierApplied(t *testing.T) {
	// Window: symbol 0 wins (3 of them), symbol 2 is the bonus symbol also present
	window := [][]int{{0}, {0}, {2}} // col 0,1 = win sym; col 2 = bonus sym
	strips := [][]int{{1}, {1}, {1}}
	pt := testWaysPt()
	bmCfg := &schema.BonusMultiplierConfig{
		SymbolID: "2",
		Weights:  [][2]int{{2, 1}}, // always returns multiplier 2
	}
	rng := rand.New(rand.NewPCG(3, 0))

	// Without bonus multiplier
	window1 := [][]int{{0}, {0}, {2}}
	strips1 := [][]int{{1}, {1}, {1}}
	baseRet := playTumbleSpin(window1, strips1, rng, pt, nil)

	// With bonus multiplier
	rng2 := rand.New(rand.NewPCG(3, 0))
	window2 := [][]int{{0}, {0}, {2}}
	strips2 := [][]int{{1}, {1}, {1}}
	bonusRet := playTumbleSpin(window2, strips2, rng2, pt, bmCfg)

	if bonusRet <= baseRet {
		t.Errorf("bonus multiplier should increase return: base=%f bonus=%f", baseRet, bonusRet)
	}
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run "TestRemoveWinners|TestPlayTumbleSpin"
```

Expected: compile error.

- [ ] **Step 3: Create tumble.go**

Create `services/simulator/internal/engine/tumble.go`:

```go
package engine

import (
	"math/rand/v2"

	"github.com/rtp-platform/simulator/internal/schema"
)

// tumbleState holds the mutable grid state during a cascade sequence.
type tumbleState struct {
	window [][]int  // window[col][row] = symbol index
	elim   [][]bool // elim[col][row] = true if position was removed this round
}

func newTumbleState(cols, rows int) *tumbleState {
	w := make([][]int, cols)
	e := make([][]bool, cols)
	for i := range w {
		w[i] = make([]int, rows)
		e[i] = make([]bool, rows)
	}
	return &tumbleState{window: w, elim: e}
}

// removeWinners marks all positions containing any of the winning symbols as eliminated.
func removeWinners(state *tumbleState, winSymbols []int) {
	winSet := make(map[int]struct{}, len(winSymbols))
	for _, s := range winSymbols {
		winSet[s] = struct{}{}
	}
	for c, col := range state.window {
		for r, s := range col {
			if _, ok := winSet[s]; ok {
				state.elim[c][r] = true
			}
		}
	}
}

// refill shifts surviving symbols down in each column and draws new symbols
// from a random offset on the reel strip to fill vacated positions at the top.
func refill(state *tumbleState, strips [][]int, rng *rand.Rand) {
	rows := len(state.window[0])
	for c, col := range state.window {
		// Collect survivors (bottom to top, preserving order).
		survivors := make([]int, 0, rows)
		for r := rows - 1; r >= 0; r-- {
			if !state.elim[c][r] {
				survivors = append(survivors, col[r])
			}
		}
		// Number of new symbols needed.
		needed := rows - len(survivors)
		// Draw new symbols from a random position on the strip.
		strip := strips[c%len(strips)]
		off := rng.IntN(len(strip))
		// Rebuild column: new symbols at top (index 0), survivors below.
		newSyms := make([]int, needed)
		for i := 0; i < needed; i++ {
			newSyms[i] = strip[(off+i)%len(strip)]
		}
		// Assemble: new symbols (top) + survivors (reversed back to top-down)
		for i := 0; i < needed; i++ {
			state.window[c][i] = newSyms[i]
		}
		for i, s := range survivors {
			state.window[c][needed+i] = s
		}
		// Clear elim flags.
		for r := range state.elim[c] {
			state.elim[c][r] = false
		}
	}
}

// drawBonusMultiplier picks a multiplier value from the weighted table.
func drawBonusMultiplier(cfg *schema.BonusMultiplierConfig, rng *rand.Rand) int {
	total := 0
	for _, w := range cfg.Weights {
		total += w[1]
	}
	if total == 0 {
		return 1
	}
	r := rng.IntN(total)
	for _, w := range cfg.Weights {
		if r < w[1] {
			return w[0]
		}
		r -= w[1]
	}
	return cfg.Weights[len(cfg.Weights)-1][0]
}

// playTumbleSpin executes a full tumble/cascade sequence starting from the
// given window state. Returns total credits won (before bet scaling — caller
// multiplies by lineBet or totalBet as appropriate).
//
// bmCfg may be nil (no bonus multiplier). strips are the reel strips used for
// refilling (base strips for base game, free strips for free game).
func playTumbleSpin(
	window [][]int,
	strips [][]int,
	rng *rand.Rand,
	pt *paytable,
	bmCfg *schema.BonusMultiplierConfig,
) float64 {
	cols := len(window)
	rows := len(window[0])
	state := &tumbleState{
		window: window,
		elim:   make([][]bool, cols),
	}
	for i := range state.elim {
		state.elim[i] = make([]bool, rows)
	}

	cumulative := 0.0

	for {
		wins := collectWaysWins(state.window, pt)
		if len(wins) == 0 {
			break
		}

		roundPay := 0.0
		winSymbols := make([]int, 0, len(wins))
		for _, w := range wins {
			roundPay += w.pay
			winSymbols = append(winSymbols, w.symIdx)
		}
		cumulative += roundPay

		// Bonus multiplier: if any B-symbol is on the grid and we have wins,
		// apply a multiplier to cumulative win this round.
		if bmCfg != nil {
			bmIdx := -1
			// Find bonus symbol index in window (it's not in the paytable).
			for c, col := range state.window {
				for r, s := range col {
					_ = r
					_ = c
					// We compare by position below — need to find by symbol ID.
					// bmCfg.SymbolID is a string; we need the index.
					// Pass bmSymIdx from caller instead.
					_ = s
				}
			}
			_ = bmIdx
			// NOTE: bonus multiplier symbol index is resolved in runWaysTumble
			// and passed as bmSymIdx. See playTumbleSpinWithBonus() below.
		}

		removeWinners(state, winSymbols)
		refill(state, strips, rng)
	}

	return cumulative
}

// playTumbleSpinWithBonus is the full version used by runWaysTumble — it
// handles the bonus multiplier symbol by index (resolved once at startup).
func playTumbleSpinWithBonus(
	window [][]int,
	strips [][]int,
	rng *rand.Rand,
	pt *paytable,
	bmCfg *schema.BonusMultiplierConfig,
	bmSymIdx int, // -1 if no bonus multiplier
) float64 {
	cols := len(window)
	rows := len(window[0])
	state := &tumbleState{
		window: window,
		elim:   make([][]bool, cols),
	}
	for i := range state.elim {
		state.elim[i] = make([]bool, rows)
	}

	cumulative := 0.0

	for {
		wins := collectWaysWins(state.window, pt)
		if len(wins) == 0 {
			break
		}

		roundPay := 0.0
		winSymbols := make([]int, 0, len(wins))
		for _, w := range wins {
			roundPay += w.pay
			winSymbols = append(winSymbols, w.symIdx)
		}
		cumulative += roundPay

		// Check for bonus multiplier symbol on grid.
		if bmCfg != nil && bmSymIdx >= 0 && cumulative > 0 {
			for _, col := range state.window {
				for _, s := range col {
					if s == bmSymIdx {
						mult := drawBonusMultiplier(bmCfg, rng)
						cumulative *= float64(mult)
						goto doneBonus
					}
				}
			}
		doneBonus:
		}

		removeWinners(state, winSymbols)
		refill(state, strips, rng)
	}

	return cumulative
}
```

- [ ] **Step 4: Update tumble_test.go to use playTumbleSpinWithBonus for bonus test**

In `tumble_test.go`, replace the `TestPlayTumbleSpin_BonusMultiplierApplied` test to call `playTumbleSpinWithBonus` with `bmSymIdx=2`:

```go
func TestPlayTumbleSpin_BonusMultiplierApplied(t *testing.T) {
	pt := testWaysPt()
	bmCfg := &schema.BonusMultiplierConfig{
		SymbolID: "2",
		Weights:  [][2]int{{2, 1}},
	}

	// Without bonus multiplier
	rng1 := rand.New(rand.NewPCG(3, 0))
	window1 := [][]int{{0}, {0}, {2}}
	strips1 := [][]int{{1}, {1}, {1}}
	baseRet := playTumbleSpinWithBonus(window1, strips1, rng1, pt, nil, -1)

	// With bonus multiplier (bmSymIdx=2)
	rng2 := rand.New(rand.NewPCG(3, 0))
	window2 := [][]int{{0}, {0}, {2}}
	strips2 := [][]int{{1}, {1}, {1}}
	bonusRet := playTumbleSpinWithBonus(window2, strips2, rng2, pt, bmCfg, 2)

	if bonusRet <= baseRet {
		t.Errorf("bonus multiplier should increase return: base=%f bonus=%f", baseRet, bonusRet)
	}
}
```

Also update `TestPlayTumbleSpin_NoWinReturnsZero` and `TestPlayTumbleSpin_WinReturnsPositive` to call `playTumbleSpinWithBonus(..., nil, -1)` instead of `playTumbleSpin`.

- [ ] **Step 5: Run tests**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run "TestRemoveWinners|TestPlayTumbleSpin|TestRefill"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/simulator/internal/engine/tumble.go services/simulator/internal/engine/tumble_test.go
git commit -m "feat(simulator/engine): add tumble/cascade loop with bonus multiplier support"
```

---

## Task 8: Add runWaysTumble to runner.go

**Files:**
- Modify: `services/simulator/internal/engine/runner.go`
- Modify: `services/simulator/internal/engine/runner_test.go`

- [ ] **Step 1: Write failing integration test**

Add to `runner_test.go`:

```go
// cat6MiniSchema builds a minimal ways-pay tumble schema that mimics Cat 6
// structure: 6 reels × 5 rows, symbol 0 pays on count 8+.
func cat6MiniSchema() schema.GameSchema {
	// 6 reels, each strip = [1,1,1,1,0,0,0,2,2,2] — symbol 0 appears 3/10
	strip := []string{"1", "1", "1", "1", "0", "0", "0", "2", "2", "2"}
	reels := make([][]string, 6)
	for i := range reels {
		reels[i] = strip
	}
	return schema.GameSchema{
		SchemaVersion: "0.1.0",
		GameID:        "cat6mini",
		GameName:      "Cat6Mini",
		Mechanic:      "ways",
		Bet:           schema.BetConfig{DefaultBet: 20, Lines: 1, CoinValue: 1},
		Reels:         reels,
		Paylines:      [][]int{},
		Symbols: []schema.Symbol{
			{ID: "0", Name: "Wild", IsWild: true},
			{ID: "1", Name: "H1"},
			{ID: "2", Name: "H2"},
		},
		Paytable: map[string]map[string]float64{
			"0": {"8": 10, "10": 30, "15": 100},
			"1": {"8": 5, "10": 15, "15": 50},
			"2": {"8": 3, "10": 10, "15": 30},
		},
		Tumble: &schema.TumbleConfig{Enabled: true},
	}
}

func TestRun_WaysTumble_RTPInRange(t *testing.T) {
	s := cat6MiniSchema()
	cfg := schema.SimulationConfig{SpinCount: 1_000_000, Rows: 5, Seed: 42}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	res, err := Run(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	// RTP should be > 0 and < 2.0 (sanity bounds)
	if res.RTP <= 0 || res.RTP > 2.0 {
		t.Fatalf("ways RTP=%.6f out of sanity range", res.RTP)
	}
	// 95% CI should be populated
	if res.Confidence95Low >= res.Confidence95High {
		t.Fatalf("bad CI95: [%.6f, %.6f]", res.Confidence95Low, res.Confidence95High)
	}
}

func TestRun_WaysTumble_Deterministic(t *testing.T) {
	s := cat6MiniSchema()
	cfg := schema.SimulationConfig{SpinCount: 500_000, Rows: 5, Seed: 99}
	_ = cfg.Validate()
	a, _ := Run(s, cfg)
	b, _ := Run(s, cfg)
	if a.RTP != b.RTP {
		t.Fatalf("ways tumble non-deterministic: a=%v b=%v", a.RTP, b.RTP)
	}
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./internal/engine/... -v -run "TestRun_WaysTumble"
```

Expected: FAIL (Run() doesn't route to ways path yet).

- [ ] **Step 3: Add runWaysTumble() and routing to runner.go**

At the top of `Run()` in `runner.go`, add routing:

```go
func Run(s schema.GameSchema, cfg schema.SimulationConfig) (*Result, error) {
	if s.Mechanic == "ways" {
		return runWaysTumble(s, cfg)
	}
	// ... existing payline code unchanged ...
```

Add `runWaysTumble()` as a new function at the bottom of `runner.go`:

```go
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

	// Resolve scatter symbol index.
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
		stats         statsAccumulator
		featureReturn float64
		featureTrigger int64
	)

	for i := int64(0); i < cfg.SpinCount; i++ {
		// 1. Spin reels.
		r.spin(rng, cfg.Rows, window)

		// 2. Tumble base game.
		baseWin := playTumbleSpinWithBonus(window, baseStrips, rng, pt, s.BonusMultiplier, bmSymIdx)

		// 3. Inject scatters after tumble settles (base game only).
		scatCount := 0
		if s.RandomScatterInject != nil {
			injectScatters(window, s.RandomScatterInject, scatterIdx, rng,
				s.RandomScatterInject.BuyFeature)
			for _, col := range window {
				for _, sym := range col {
					if sym == scatterIdx {
						scatCount++
					}
				}
			}
		} else {
			// Count scatters that landed naturally.
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

		if tracker != nil {
			// Record base win symbol hits from final window.
			for _, col := range window {
				for _, sym := range col {
					tracker.recordLineWin(sym, 1, false)
				}
			}
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

	// Buy bonus: enter free spins directly.
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
```

- [ ] **Step 4: Run all engine tests**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go test ./... -v
```

Expected: all tests pass including `TestRun_WaysTumble_RTPInRange` and `TestRun_WaysTumble_Deterministic`.

- [ ] **Step 5: Rebuild the simulator binary**

```bash
cd /Users/mac/Desktop/coding/rtp/services/simulator
go build -o bin/simulator ./cmd/server
```

Expected: no build errors.

- [ ] **Step 6: Commit**

```bash
git add services/simulator/internal/engine/runner.go services/simulator/internal/engine/runner_test.go
git commit -m "feat(simulator/engine): add runWaysTumble() for ways-pay tumble games"
```

---

## Task 9: Prisma schema — add variant fields to Game

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add new fields to Game model**

In `apps/api/prisma/schema.prisma`, add to the `Game` model after `errorMessage String?`:

```prisma
  parentGameId   String?
  parent         Game?     @relation("GameVariants", fields: [parentGameId], references: [id])
  variants       Game[]    @relation("GameVariants")
  variantLabel   String?
  declaredRtp    Decimal?  @db.Decimal(10, 6)
```

- [ ] **Step 2: Create and apply migration**

```bash
cd /Users/mac/Desktop/coding/rtp/apps/api
npx prisma migrate dev --name add_game_variant_fields
```

Expected: migration applied, Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(api/db): add parentGameId, variantLabel, declaredRtp to Game model"
```

---

## Task 10: Update AI prompt builder for multi-variant extraction

**Files:**
- Modify: `apps/api/src/ai/prompt-builder.ts`

- [ ] **Step 1: Add variant extraction rules to buildExtractionPrompt()**

In `buildExtractionPrompt()`, replace the `## Critical Rules` section content with the updated rules (keep rules 1–9, add rules 10–15):

```typescript
  return `You are a casino game math analyzer. Extract the complete mathematical model from the source code.

Game ID: ${gameId}
Game Name: ${gameName}

## Top Candidate Files (ranked by math relevance)
${topFilesText || '(none classified)'}

## Extracted Math Objects from Static Parser
The following were extracted by a regex AST parser. IMPORTANT: these contain the ACTUAL source values — use them directly to populate the schema.

${candidateSummary || '(No candidates — analyze file snippets below directly)'}

## Full Source File Contents
${snippets}

## Output Schema
Return ONLY valid JSON (single schema or JSON array of schemas for multi-variant games). No markdown fences, no explanation.

${schemaDefinition}

## Critical Rules
1. schemaVersion MUST be "${SCHEMA_VERSION}" — exact string
2. gameId MUST be "${gameId}" — exact string
3. REELS: Each inner array is one reel strip. Use the ACTUAL integer/string values from source arrays (e.g. baseStrips, reelStrip, REEL_DATA). Convert integer symbol IDs to strings.
4. SYMBOLS: Build from Symbol/Constant files — map each symbol constant to an id+name entry. Use the actual integer values as id strings.
5. PAYTABLE: Extract from PayTable/payTable source. Map symbol id string → { "3": mult, "4": mult, "5": mult } for payline games. For ways/tumble games use count thresholds: { "8": mult, "10": mult, "15": mult }.
6. PAYLINES: Extract explicit payline arrays if present. If not found, GENERATE standard paylines for the grid: rows × reels (e.g. 3 rows × 5 reels → 15 paylines covering every row). Use row indices 0..rows-1. Add an assumption entry noting they were synthesized. Never leave paylines empty for payline games.
7. Every field inferred without direct source evidence → add to assumptions[] with canBeImproved and improvementHint.
8. Every uncertain value → add to warnings[] as "fieldName: reason".
9. NEVER invent reel strips or paytable values — only use values found in the source.
10. MECHANIC: If the game pays based on total count of matching symbols across the full grid (not left-to-right paylines), set mechanic: "ways". Otherwise mechanic: "paylines".
11. TUMBLE: If winning symbols are removed and new ones fall in (cascade/tumble mechanic), set tumble.enabled: true. If the source has separate free-game reel strips, set tumble.freeReels to those strips.
12. RANDOM SCATTER INJECT: If scatters are randomly inserted per-spin using weighted tables (not on the reels), extract randomScatterInject.symbolId and randomScatterInject.baseWeights as [{ count, weight }] pairs. Set buyFeature: true if this mode always guarantees scatter trigger.
13. BONUS MULTIPLIER: If a special symbol triggers a random multiplier applied to cumulative cascade win, extract bonusMultiplier.symbolId and bonusMultiplier.weights as [[value, weight]] pairs.
14. MULTIPLE VARIANTS: If source defines multiple RTP modes (e.g. Mode.R90=0, Mode.R93=1), output a JSON ARRAY of schemas — one per variant. Each schema gets variantLabel (e.g. "90", "93-BuyFeature") and declaredRtp (e.g. 0.902) from mode comments. Each variant schema has its own randomScatterInject.baseWeights for that mode.
15. DECLARED RTP: Extract declaredRtp from mode comments like "//0:Normal_90.2%" → 0.902. Set on each variant schema.`
```

- [ ] **Step 2: Update buildSchemaDefinition() to include new fields**

In `buildSchemaDefinition()`, add after `"buyBonus"` block:

```typescript
  "mechanic": "paylines | ways",
  "tumble": {
    "enabled": true,
    "freeReels": [["SYM_ID", ...], ...]
  },
  "randomScatterInject": {
    "symbolId": "string",
    "baseWeights": [{ "count": number, "weight": number }],
    "buyFeature": false
  },
  "bonusMultiplier": {
    "symbolId": "string",
    "weights": [[value, weight], ...]
  },
  "declaredRtp": 0.902,
  "variantLabel": "90"
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/ai/prompt-builder.ts
git commit -m "feat(api/ai): add multi-variant and ways-tumble extraction rules to prompt builder"
```

---

## Task 11: Add variant support to API routes and runner.ts

**Files:**
- Modify: `apps/api/src/routes/games.ts`
- Modify: `apps/api/src/simulation/runner.ts`

- [ ] **Step 1: Add GET /games/:gameId/variants endpoint**

In `apps/api/src/routes/games.ts`, add before the simulate route:

```typescript
// GET /api/games/:gameId/variants — list variants of a game
gamesRouter.get('/:gameId/variants', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  const variants = await prisma.game.findMany({
    where: { parentGameId: game.id },
    select: { id: true, name: true, variantLabel: true, declaredRtp: true, status: true },
    orderBy: { variantLabel: 'asc' },
  })
  res.json({ variants })
})
```

- [ ] **Step 2: Update POST simulate to accept variantId**

In the simulate route body parsing, add `variantId` to the accepted fields:

```typescript
  const body = req.body as {
    spinCount?: number
    simulateBuyBonus?: boolean
    seed?: number
    rows?: number
    variantId?: string  // ← add this
  }
```

After the `game` lookup, add variant resolution:

```typescript
  // If variantId provided, simulate that variant instead of the base game.
  let simulationTarget = game
  if (body.variantId) {
    const variant = await prisma.game.findUnique({ where: { id: body.variantId } })
    if (!variant || variant.parentGameId !== game.id) {
      res.status(400).json({ error: 'variantId not found or does not belong to this game' })
      return
    }
    simulationTarget = variant
  }

  // If game has variants and no variantId specified, inform the caller.
  const variantCount = await prisma.game.count({ where: { parentGameId: game.id } })
  if (variantCount > 0 && !body.variantId) {
    const variants = await prisma.game.findMany({
      where: { parentGameId: game.id },
      select: { id: true, variantLabel: true, declaredRtp: true },
    })
    res.status(400).json({
      error: 'This game has variants. Specify variantId to simulate a specific variant.',
      variants,
    })
    return
  }
```

Update the `runSimulation` call to use `simulationTarget.id`:

```typescript
      const outcome = await runSimulation({
        gameId: simulationTarget.id,  // ← was game.id
        spinCount,
        simulateBuyBonus: body.simulateBuyBonus,
        seed: body.seed,
        rows: body.rows,
        simulationId: sim.id,
      })
```

- [ ] **Step 3: Update runner.ts to handle array-of-schemas from AI and save variants**

In `apps/api/src/simulation/runner.ts`, the schema is already loaded from DB per game. The multi-variant save logic belongs in the **analysis route** (where AI output is saved), not in runner.ts.

In the analysis route (find where `normalizedSchemaJson` is saved to DB — likely in `apps/api/src/routes/games.ts` or an analysis job), add after saving the base game schema:

```typescript
  // If AI returned an array of variant schemas, save each as a child Game row.
  const aiOutput = /* the parsed AI JSON */
  const schemas = Array.isArray(aiOutput) ? aiOutput : [aiOutput]

  if (schemas.length > 1) {
    for (const variantSchema of schemas) {
      const label = variantSchema.variantLabel ?? 'unknown'
      const declaredRtp = variantSchema.declaredRtp ?? null
      await prisma.game.create({
        data: {
          name: `${game.name} [Var.${label}]`,
          provider: game.provider,
          status: 'analyzed',
          originalFileName: game.originalFileName,
          uploadPath: game.uploadPath,
          extractedPath: game.extractedPath,
          parentGameId: game.id,
          variantLabel: label,
          declaredRtp: declaredRtp,
          normalizedSchemaJson: variantSchema as any,
        },
      })
    }
  }
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/games.ts apps/api/src/simulation/runner.ts
git commit -m "feat(api): add variant selection to simulate endpoint and GET variants route"
```

---

## Task 12: Update report verdict logic for declared RTP

**Files:**
- Modify: `apps/api/src/reports/` (find report builder file)

- [ ] **Step 1: Find the report builder**

```bash
find /Users/mac/Desktop/coding/rtp/apps/api/src -name "*.ts" | xargs grep -l "verdict\|rtp.*pass\|pass.*rtp" 2>/dev/null | head -5
```

- [ ] **Step 2: Update verdict calculation**

Find the verdict logic and update it to use `declaredRtp` from the game record with ±0.1% tolerance:

```typescript
// Load declaredRtp from game record
const game = await prisma.game.findUniqueOrThrow({ where: { id: simulation.gameId } })
const declaredRtp = game.declaredRtp ? Number(game.declaredRtp) : null
const simulatedRtp = Number(simulation.rtp)

const verdict = declaredRtp !== null
  ? Math.abs(simulatedRtp - declaredRtp) <= 0.001 ? 'PASS' : 'FAIL'
  : 'UNVERIFIED'  // no declared RTP to compare against
```

- [ ] **Step 3: Ensure report template surfaces all required stats**

Find where the report JSON/Excel/PDF is built and confirm these fields are included in the output:

```typescript
const reportStats = {
  totalRtp: simulatedRtp,
  baseRtp: Number(simulation.baseRtp),
  freeSpinsRtp: Number(simulation.freeSpinsRtp),
  standardDeviation: Number(simulation.standardDeviation),
  ci90: { low: Number(simulation.confidence90Low), high: Number(simulation.confidence90High) },
  ci95: { low: Number(simulation.confidence95Low), high: Number(simulation.confidence95High) },
  hitRate: Number(simulation.hitRate),
  featureTriggerFreq: simulation.featureTriggerCount
    ? Number(simulation.featureTriggerCount) / Number(simulation.totalSpins)
    : null,
  verdict,
  declaredRtp,
  variantLabel: game.variantLabel ?? null,
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api/reports): update verdict logic with declaredRtp ±0.1% tolerance, surface full stats"
```

---

## Task 13: End-to-end test with Cat 6 game

**Files:**
- No new files — manual verification

- [ ] **Step 1: Re-analyze the Cat 6 game to get multi-variant schemas**

Start the API server:
```bash
cd /Users/mac/Desktop/coding/rtp && pnpm --filter api dev
```

Trigger re-analysis on game `jvc9lyx41es1z2pogi8ntx30`:
```bash
curl -X POST http://localhost:3000/api/games/jvc9lyx41es1z2pogi8ntx30/analyze
```

Wait for analysis to complete. Then check variants were created:
```bash
curl http://localhost:3000/api/games/jvc9lyx41es1z2pogi8ntx30/variants | jq '.variants[] | {id, variantLabel, declaredRtp}'
```

Expected: 5–6 variant rows with labels `90`, `93`, `96`, `93-BuyFeature`, `96-BuyFeature`.

- [ ] **Step 2: Run simulation for each variant**

For each variant ID returned above:
```bash
curl -X POST http://localhost:3000/api/games/jvc9lyx41es1z2pogi8ntx30/simulate \
  -H "Content-Type: application/json" \
  -d '{"variantId": "<VARIANT_ID>", "spinCount": 10000000, "rows": 5}'
```

- [ ] **Step 3: Check RTP results against Excel targets**

For each completed simulation, check the result is within ±0.1% of the declared RTP:

| Variant | Target | Acceptable range |
|---------|--------|-----------------|
| 90 | 90.2% | 90.1% – 90.3% |
| 93 | 93.0% | 92.9% – 93.1% |
| 96 | 96.0% | 95.9% – 96.1% |
| 93-BuyFeature | 93.5% | 93.4% – 93.6% |
| 96-BuyFeature | 96.5% | 96.4% – 96.6% |

At 10M spins results may be wider. Run at 100M spins for production-quality verification.

- [ ] **Step 4: Commit any last fixes found during testing**

```bash
git add -A && git commit -m "fix: end-to-end Cat 6 variant simulation corrections"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ §3 Schema extensions — Tasks 2 & 3
- ✅ §4 Go engine (ways, tumble, scatter-inject, runner routing) — Tasks 4–8
- ✅ §5 Variant storage & selection — Tasks 9, 11
- ✅ §5.3 AI extraction — Task 10
- ✅ §6 Report verdict & stats — Task 12
- ✅ §7 runner.ts isWild fix — Task 1
- ✅ §2 RTP target verification — Task 13

**Type consistency:**
- `playTumbleSpinWithBonus` used consistently in runner.go and tests
- `tumbleState.elim` (not `eliminated`) used consistently in tumble.go and tests
- `schema.RandomScatterInjectConfig`, `schema.BonusMultiplierConfig` match Go struct names from Task 3
- `ScatterWeightEntry` struct used in both schema.go and scatter_inject.go
