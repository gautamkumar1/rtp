# Ways-Pay + Tumble + Bonus Multiplier Engine — Design Spec

**Date:** 2026-05-26
**Scope:** Extend the Go simulator and schema to correctly simulate ways-pay tumble games (Cat 6 as first target), expose variant selection, and surface full stats per client requirements.

---

## 1. Goals

- Simulate all 6 Cat 6 variants and produce total RTP within ±0.1% of the Excel-verified targets
- Support variant/mode selection when a game has multiple RTP configurations
- Report: total RTP, base RTP, free-spins RTP, standard deviation, 90% CI, 95% CI, hit rate, feature trigger frequency
- Verdict is pass/fail on **total RTP ± 0.1%** vs declared target only — component RTPs are informational
- All new mechanics (ways, tumble, scatter-inject, bonus multiplier) are schema-driven — no game-specific hardcoding

---

## 2. Target RTP Values (from Excel — verified at 100M spins)

| Variant        | Declared RTP | Verified RTP  | Bet    |
|----------------|-------------|---------------|--------|
| Var.90         | 90.2%       | 90.2816%      | $0.20  |
| Var.93         | 93.0%       | 92.9229%      | $0.20  |
| Var.96         | 96.0%       | 95.9237%      | $0.20  |
| Var.93-BuyFeat | 93.5%       | 93.4510%      | $10.00 |
| Var.96-BuyFeat | 96.5%       | 96.4736%      | $10.00 |

At 100M spins, 95% CI half-width ≈ ±0.02–0.03% — well within the ±0.1% tolerance.

---

## 3. Schema Extensions

### 3.1 TypeScript (`packages/game-schema`)

New fields added to `GameSchema` Zod object:

```ts
mechanic: z.enum(['paylines', 'ways']).default('paylines')

tumble: z.object({
  enabled: z.boolean(),
  freeReels: z.array(z.array(z.string())).optional(), // free-game reel strips
}).optional()

randomScatterInject: z.object({
  symbolId: z.string(),
  baseWeights: z.array(z.object({ count: z.number(), weight: z.number() })),
  // for buy-feature: always inject to trigger free spins (mode >= 3 in Cat 6)
  buyFeature: z.boolean().default(false),
}).optional()

bonusMultiplier: z.object({
  symbolId: z.string(),  // e.g. "41" (B symbol)
  weights: z.array(z.tuple([z.number(), z.number()])), // [value, weight] pairs
}).optional()

declaredRtp: z.number().optional() // e.g. 0.902 — extracted from source comments

variantLabel: z.string().optional() // e.g. "90", "93-BuyFeature"
```

`paylines` becomes optional when `mechanic === "ways"` (validated in Zod `.superRefine()`).

`paytable` for ways games uses count thresholds as keys: `{ "8": 20, "9": 40, ..., "15": 1000 }`.

### 3.2 Go (`services/simulator/internal/schema/schema.go`)

Mirror all new fields. Add to `Validate()`:
- When `Mechanic == "ways"`: paylines optional, paytable keys must be parseable as integers
- `RandomScatterInject` symbol must exist in `Symbols`
- `BonusMultiplier` symbol must exist in `Symbols`

---

## 4. Go Engine Changes

### 4.1 New file: `engine/ways.go`

```
countSymbol(window [][]int, symIdx int) int
  — count all occurrences of symIdx across the full grid

waysPayForCount(pt *paytable, symIdx, count int) float64
  — find highest threshold key <= count with non-zero pay
  — e.g. count=10, keys={8,9,10,11,...} → use key 10
```

### 4.2 New file: `engine/tumble.go`

```
type tumbleState struct {
  window     [][]int   // current visible grid (cols × rows)
  eliminated [][]bool  // positions removed this cascade
}

playTumbleSpin(state, baseStrips, freeStrips, rng, pt, bonusMult, isFreeGame) float64
  Loop:
    1. collectWaysWins(state.window, pt) → list of (symIdx, count, pay)
    2. If no wins: break
    3. Add pays to cumulative win
    4. Check bonusMultiplier: if any B-symbol on grid AND cumulative win > 0:
         draw multiplier from weights table
         cumulativeWin *= multiplier
    5. removeWinners(state, winningSymbols)
    6. refill(state, strips, rng) — shift remaining symbols down per column,
         draw new symbols from random offset on the reel strip
  Return cumulativeWin
```

### 4.3 New file: `engine/scatter_inject.go`

```
injectScatters(window [][]int, cfg *ScatterInjectConfig, scatterIdx int, rng, isBuyFeature bool)
  — draw count from baseWeights using weighted random
  — if isBuyFeature: always inject enough scatters to trigger free spins (Cat 6 mode 3-5 behavior)
  — place scatters at random grid positions (overwrite existing symbol)
  — called AFTER tumble resolves with zero wins on the initial spin (Cat 6: inject on no-win base spins)
```

### 4.4 Changes to `runner.go`

Add `runWaysTumble(s schema.GameSchema, cfg schema.SimulationConfig) (*Result, error)`:
- Same stats/CI/output structure as existing `Run()`
- Per spin:
  1. `r.spinFull(rng, rows, window)` — spin all reels (existing logic)
  2. `playTumbleSpin(window, baseStrips, nil, rng, pt, bonusMult, false)`
  3. After tumble resolves: `injectScatters(window, cfg.ScatterInject, ...)` → count scatters
  4. If scatter count ≥ trigger: run free spins using `freeStrips`
     - Each free spin: `playTumbleSpin(window, freeStrips, ..., isFreeGame=true)`
     - No scatter inject during free spins (B-symbol bonus still active)
- Buy-bonus pass: enter free spins directly (skip base spin), same as today

`Run()` entry point: detects `s.Mechanic == "ways"` → calls `runWaysTumble()`, else existing path.

### 4.5 Changes to `reel.go`

Add `freeStrips [][]int` to `reels` struct, populated from `schema.Tumble.FreeReels`.

---

## 5. Variant Storage & Selection

### 5.1 DB

No new table. Each variant is stored as a **separate Game row** with:
- `name`: e.g. `"Category6-Tumble [Var.90]"`
- `parentGameId`: foreign key to the base game (new nullable column)
- `variantLabel`: e.g. `"90"`, `"93"`, `"96"`, `"90-BuyFeature"`
- `declaredRtp`: from schema

### 5.2 API

`GET /games/:id/variants` — returns list of variant game rows for a parent game.

`POST /games/:id/simulate` — accepts optional `variantId`. If game has variants and none specified, returns 400 with available variant list. If game has no variants, simulates the game itself.

### 5.3 AI Extraction

When the source contains multiple mode constants (e.g. `Mode.R90 = 0` … `Mode.R96_Buy = 5`), the AI extracts **one schema per variant**, each with:
- `variantLabel` set from the mode name
- `declaredRtp` from inline comments
- `randomScatterInject.baseWeights` from `GetRandomScatter(mode)` for that mode
- `randomScatterInject.buyFeature: true` for modes ≥ 3

Prompt builder rule added: "If source defines multiple RTP variants/modes, output a JSON array of schemas — one per variant."

---

## 6. Report Changes

Per-simulation report surfaces (already stored in DB, just needs template update):

| Field | Source |
|---|---|
| Total RTP | `simulation.rtp` |
| Base RTP | `simulation.baseRtp` |
| Free Spins RTP | `simulation.freeSpinsRtp` |
| Standard Deviation | `simulation.standardDeviation` |
| 90% CI | `[simulation.confidence90Low, simulation.confidence90High]` |
| 95% CI | `[simulation.confidence95Low, simulation.confidence95High]` |
| Hit Rate | `simulation.hitRate` |
| Feature Trigger Freq | `simulation.featureTriggerCount / simulation.totalSpins` |
| Verdict | PASS if `|rtp - declaredRtp| <= 0.001`, else FAIL |

Verdict is on **total RTP only**. Component RTPs shown as informational breakdown.

---

## 7. Runner.ts Fix (immediate)

Fix `isWild` extraction bug in `runner.ts`: when a symbol's ID matches `schema.wild?.symbolId`, set `sym.isWild = true` (not `isScatter`). Remove unused `wildId` variable and clean up the patch loop.

---

## 8. Out of Scope

- UI changes for variant selection (API-only for now)
- Support for other ways-pay games beyond Cat 6 mechanics (handled generically by schema fields)
- Reel strip editing / override UI

---

## 9. File Change Summary

| File | Change |
|---|---|
| `packages/game-schema/src/index.ts` | Add mechanic, tumble, randomScatterInject, bonusMultiplier, declaredRtp, variantLabel fields |
| `services/simulator/internal/schema/schema.go` | Mirror new fields, update Validate() |
| `services/simulator/internal/engine/ways.go` | New — ways-pay evaluation |
| `services/simulator/internal/engine/tumble.go` | New — tumble/cascade loop |
| `services/simulator/internal/engine/scatter_inject.go` | New — per-spin scatter injection |
| `services/simulator/internal/engine/runner.go` | Add runWaysTumble(), route by mechanic |
| `services/simulator/internal/engine/reel.go` | Add freeStrips field |
| `apps/api/src/simulation/runner.ts` | Fix isWild bug, add variant support |
| `apps/api/src/ai/prompt-builder.ts` | Multi-variant extraction rules |
| `apps/api/src/routes/games.ts` | variants endpoint, variantId param |
| `prisma/schema.prisma` | parentGameId, variantLabel, declaredRtp on Game |
