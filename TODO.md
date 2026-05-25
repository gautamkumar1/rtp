# RTP Verification Platform — Implementation TODO

## Stack Summary

| Layer | Technology |
|---|---|
| Frontend | React + Vite + shadcn/ui |
| Backend API | Node.js + Express |
| AI Extraction | OpenAI API (inside Express) |
| Simulation Engine | Go (custom HTTP service) |
| Database | PostgreSQL + Prisma |
| Background Jobs | Inngest |
| Storage | Local filesystem |

All 5 fixtures must pass end-to-end and produce correct RTP.

---

## Phase 1 — Project Foundation

Goal: Monorepo boots locally, database is up, storage paths exist, shared schema package is defined.

### 1.1 Monorepo scaffold ✅

- [x] Initialize pnpm workspace at root
- [x] Create `apps/web` — Vite + React + Tailwind v4 + shadcn/ui ready
- [x] Create `apps/api` — Express + TypeScript
- [x] Create `services/simulator` — Go module (HTTP scaffold, Phase 5 impl pending)
- [x] Create `packages/game-schema` — TypeScript + Zod
- [x] Create `packages/shared-types` — TypeScript types shared by web and api
- [x] Add root `package.json` with workspace scripts (`dev`, `build`, `lint`)
- [x] Add `tsconfig.json` at root with path aliases for packages
- [x] Add `.env.example` with all required env vars

### 1.2 Local storage folders ✅

- [x] Create `/storage/uploads` — uploaded ZIP files
- [x] Create `/storage/extracted` — unzipped source projects
- [x] Create `/storage/artifacts` — parser output, AI output, normalized schemas, simulation output
- [x] Create `/storage/reports` — JSON, Excel, PDF reports
- [x] Add storage path constants to `packages/shared-types`

### 1.3 Database setup ✅

- [x] Add PostgreSQL connection to `apps/api`
- [x] Initialize Prisma in `apps/api`
- [x] Write Prisma schema for `games`, `analysis_runs`, `simulations`, `reports`
- [x] Write and run initial migration (`20260525204420_init`)
- [x] Seed script with one game record for local testing

### 1.4 Shared game schema package ✅

- [x] Define `GameSchema` Zod shape in `packages/game-schema`
  - `schemaVersion`, `provider`, `gameId`, `gameName`, `gameType`
  - `bet` — `defaultBet`, `lines`, `coinValue`
  - `reels` — array of reel strips (symbol arrays)
  - `paylines` — array of payline patterns
  - `symbols` — array with id, name, isWild, isScatter
  - `paytable` — symbol id → count → payout map
  - `wild` — substitution rules
  - `scatter` — trigger rules
  - `freeSpins` — count, multiplier, retrigger rules
  - `bonus` — description, trigger condition
  - `buyBonus` — cost multiplier, entry point
  - `sourceEvidence` — array of evidence objects (file, line, raw value, confidence, reasoning)
  - `warnings` — array of warning strings
  - `assumptions` — AI-inferred values with improvement hints
- [x] Export TypeScript types from Zod schema
- [x] Write unit tests for schema validation — 10/10 passing
- [x] Add fixture golden schema stub files for all 5 fixtures

### 1.5 Inngest local dev setup ✅

- [x] Install Inngest SDK in `apps/api`
- [x] Register Inngest client and route (`/api/inngest`)
- [x] Define stub functions for all 8 workflow events:
  - `upload/received`
  - `project/extracted`
  - `project/scanned`
  - `analysis/started`
  - `schema/generated`
  - `simulation/started`
  - `simulation/completed`
  - `report/generated`

### Phase 1 Deliverable ✅

- [x] Monorepo boots — `pnpm install` clean, all packages linked
- [x] Database migration applied, seed game created
- [x] Inngest stubs registered on `/api/inngest`
- [x] Schema package validates correctly — 10/10 tests pass
- [x] Go simulator compiles cleanly

---

## Phase 2 — Upload and Extraction

Goal: User uploads a ZIP, system extracts it safely, file tree is stored.

### 2.1 ZIP upload endpoint

- [x] Add `multer` to Express for multipart uploads
- [x] `POST /api/games/upload` endpoint
  - Validate file is a ZIP (by MIME type and extension)
  - Enforce max upload size (configurable, default 500MB)
  - Save ZIP to `/storage/uploads/<gameId>/original.zip`
  - Create `games` record in database (status: `uploaded`)
  - Fire `upload/received` Inngest event with `gameId` and `uploadPath`
  - Return `{ gameId }` to client
- [x] Path traversal prevention on all file operations
- [x] Return proper error responses for oversized or invalid files

### 2.2 ZIP extraction workflow step

- [x] Inngest `upload/received` handler
  - Extract ZIP to `/storage/extracted/<gameId>/`
  - Enforce max file count (configurable, default 10,000 files)
  - Enforce max individual file size (configurable, default 50MB)
  - Skip binary files (`.class`, `.jar`, `.exe`, `.dll`, `.so`, `.dylib`, images) unless explicitly needed
  - Update `games` record status to `extracting` then `extracted`
  - Fire `project/extracted` Inngest event

### 2.3 File tree indexing

- [x] Inngest `project/extracted` handler
  - Walk extracted directory recursively
  - Build file tree JSON (path, size, extension, isBinary flag)
  - Save file tree JSON to `/storage/artifacts/<gameId>/file-tree.json`
  - Create `analysis_runs` record with `file_tree_json`
  - Update `games` status to `scanned`
  - Fire `project/scanned` Inngest event

### 2.4 Upload UI

- [x] Upload page in React frontend
  - Drag-and-drop or file picker accepting `.zip` files
  - Upload progress bar (via XHR or fetch with progress)
  - Display returned `gameId` and navigate to game status page
- [x] Game status page
  - Poll `GET /api/games/:gameId` every 2 seconds
  - Display current status (uploaded / extracting / extracted / scanned / analyzing / simulating / done)
  - Display file count from file tree once scanned

### 2.5 API status endpoints

- [x] `GET /api/games/:gameId` — return game record with current status
- [x] `GET /api/games` — list all games
- [x] `GET /api/games/:gameId/files` — return file tree JSON

### Phase 2 Deliverable

- [ ] Upload all 5 fixture ZIPs one at a time
- [ ] Each ZIP extracts cleanly without path traversal errors
- [ ] File tree JSON is stored for each fixture
- [ ] Frontend shows correct status progression

---

## Phase 3 — Static Parser

Goal: System identifies candidate math files and extracts raw math objects for all 5 fixtures.

### 3.1 File classifier ✅

- [x] Inngest `project/scanned` handler triggers file classification
- [x] Score each file for math relevance:
  - Path patterns: `reel`, `paytable`, `symbol`, `math`, `config`, `game`, `pay`
  - Extensions: `.go`, `.java`, `.c`, `.h`, `.json`, `.csv`, `.sql`, `.xml`, `.yaml`, `.xlsx`
  - Size: ignore empty files and very large files (>2MB for text files)
  - Binary: skip binaries
- [x] Save `candidate-files.json` to `/storage/artifacts/<gameId>/`
  - Each entry: `{ path, extension, relevanceScore, reason }`

### 3.2 AST parser — Go source (fixtures: `2GamesSource.zip`, `src-20251222T115612Z-3-001.zip`) ✅

- [x] Parse Go files for candidate math objects (regex-based, tree-sitter not usable on Node v24):
  - Array/slice literals that look like reel strips (arrays of strings or ints)
  - Struct literals with fields named `symbol`, `payout`, `reel`, `line`, `weight`
  - Map literals with numeric keys/values that resemble paytables
- [x] For each extracted object, record:
  - Source file path
  - Line number
  - Raw extracted value
  - Confidence (`high` / `medium` / `low`)
- [x] Save `ast-candidates.json` to `/storage/artifacts/<gameId>/`

### 3.3 AST parser — Java source (fixtures: `Category4-ProgressiveMultiplier.zip`, `Category6-Tumble (2).zip`) ✅

- [x] Parse Java files for candidate math objects (regex-based):
  - Array initializers that look like reel strips
  - Field declarations with math-related names
  - 2D array initializers (`new int[][]`) for reel/paytable data
- [x] Same evidence format as Go parser
- [x] Append to `ast-candidates.json`

### 3.4 AST parser — C source (fixture: `Zeus_math.zip`) ✅

- [x] Parse C/header files for candidate math objects (regex-based):
  - Array declarations that look like reel strips
  - Struct definitions with math-relevant field names
  - `#define` constants for symbol counts, payline counts
- [x] Same evidence format
- [x] Append to `ast-candidates.json`

### 3.5 Structured asset parsers ✅

- [x] CSV parser — detect tabular reel/weight/paytable data, extract rows with headers
- [x] JSON parser — extract top-level keys matching math field names
- [x] SQL parser — extract `INSERT` statements into reel/paytable/symbol tables
- [x] XML parser — extract elements matching reel/paytable/config patterns
- [x] XLSX parser (`xlsx` npm package) — extract sheets that look like math tables
- [x] All parsers write to `ast-candidates.json` with format and sheet/table name recorded

### 3.6 Candidate review API ✅

- [x] `GET /api/games/:gameId/candidates` — return `ast-candidates.json`
- [x] `GET /api/games/:gameId/analysis` — return `analysis_runs` record

### 3.7 Candidate review UI ✅

- [x] Frontend page showing detected candidate files per game
- [x] List of extracted raw objects with source location and confidence
- [x] Expandable raw value view per candidate

### Phase 3 Deliverable

- [ ] Run all 5 fixtures through static parser
- [ ] Each fixture produces a populated `ast-candidates.json`
- [ ] Go, Java, C, CSV, SQL, XML, XLSX sources all produce candidates
- [ ] Frontend displays candidates for each fixture

---

## Phase 4 — AI Analyzer

Goal: System generates a validated unified schema for all 5 fixtures using OpenAI.

### 4.1 AI extraction service ✅

- [x] Install `openai` npm package in `apps/api`
- [x] Build prompt construction:
  - File tree summary (top 50 most relevant files)
  - Candidate math objects from `ast-candidates.json` (top candidates by confidence)
  - Relevant code snippets (max 24,000 chars / ~8k tokens of source)
  - Full `GameSchema` JSON Schema definition
  - Instruction: return strict JSON matching schema, mark uncertain fields in warnings and assumptions
- [x] Call OpenAI API (GPT-4o, JSON mode / structured outputs)
- [x] Parse and validate AI response against `GameSchema` Zod validator
- [x] If validation fails, retry once with error context appended to prompt
- [x] Save raw AI response to `/storage/artifacts/<gameId>/ai-raw.json`
- [x] Save validated schema to `/storage/artifacts/<gameId>/normalized-schema.json`
- [x] Save schema JSON to `analysis_runs.ai_output_json` in database
- [x] 5/5 extractor unit tests passing (mocked OpenAI)

### 4.6 Game mechanics explanation document (Requirement 2) ✅

- [x] After schema is validated, generate a human-readable game mechanics document via OpenAI
  - Describe how the game works in plain English
  - Explain reel layout (number of reels, rows, symbols per reel)
  - Explain weight table (symbol frequency/probability on each reel)
  - Explain payout table (symbol × count → multiplier)
  - Explain wild rules (which symbols substitute, any restrictions)
  - Explain scatter rules (trigger threshold, what it awards)
  - Explain free spin rules (count, multiplier, retrigger conditions)
  - Explain bonus/buy bonus mechanics if present
  - Flag any mechanics that could not be determined from source
- [x] Save as `/storage/artifacts/<gameId>/game-mechanics.md`
- [x] Expose via `GET /api/games/:gameId/mechanics`
- [x] Display in frontend as a readable document tab on the game detail page

### 4.7 Assumptions tracking (Requirement Note 3) ✅

- [x] `assumptions` array already in `GameSchema` alongside `warnings`
  - Each assumption: `{ field, assumedValue, reason, sourceEvidence, canBeImproved: true/false, improvementHint }`
- [x] AI prompt explicitly instructs: never invent a value silently — every inferred value must produce an assumption entry
- [x] Simulation-readiness validator checks all required fields; missing ones go to warnings
- [x] Save `assumptions` list to `analysis_runs` record (`assumptionsJson`)
- [x] Schema UI lists all assumptions with improvement hints and improvable badges

### 4.2 AI pipeline Inngest workflow ✅

- [x] Inngest `project/scanned` → trigger `analysis/started` (via classify handler)
- [x] `analysis/started` handler (handlers/analyze.ts):
  - Call AI extraction service
  - Validate schema
  - Generate mechanics document
  - Update `analysis_runs` record
  - Update `games` status to `analyzed`
  - Fire `schema/generated` event

### 4.3 Schema validation rules (enforced before simulation) ✅

- [x] `reels` must be present and non-empty
- [x] `paylines` must be present and non-empty
- [x] `symbols` must be present
- [x] `paytable` must cover all non-wild, non-scatter symbols
- [x] Reel strip symbols must all exist in `symbols` array
- [x] Payline positions must be valid for reel count and row count
- [x] Any missing required field must be recorded in `warnings` (not silently defaulted)

### 4.4 Schema review UI ✅

- [x] Frontend page for extracted schema (`/games/:gameId/schema`):
  - Reels display (collapsible strip view + symbol frequency counts)
  - Paylines visualization (grid pattern per payline)
  - Symbols list (name, wild/scatter flags)
  - Paytable (symbol × count → payout grid)
  - Feature summary (free spins, bonus, buy bonus)
  - Warnings list with improvement hints
  - Assumptions list with improvable badges
  - Source evidence expandable per entry
  - Mechanics document tab (raw markdown)

### 4.5 Schema API endpoints ✅

- [x] `GET /api/games/:gameId/schema` — return normalized schema JSON
- [x] `GET /api/games/:gameId/schema/warnings` — return warnings and confidence issues
- [x] `GET /api/games/:gameId/mechanics` — return game-mechanics.md (markdown or JSON)

### Phase 4 Deliverable

- [ ] All 5 fixtures produce a validated `normalized-schema.json`
- [ ] Schemas pass all validation rules (or have explicit warnings for gaps)
- [x] Frontend displays schema for each fixture with confidence indicators

---

## Phase 5 — Go Simulation Engine

Goal: Custom Go engine accepts unified schema, runs deterministic spins, returns RTP and statistics for all 5 fixtures.

### 5.1 Go service scaffold ✅

- [x] Initialize Go module at `services/simulator`
- [x] HTTP server on configurable port (default `8090`)
- [x] `POST /simulate` endpoint accepting JSON body (unified schema + simulation config)
- [x] `GET /health` endpoint
- [x] Graceful shutdown

### 5.2 Schema input model ✅

- [x] Define Go structs matching `GameSchema` JSON shape
- [x] JSON unmarshalling with validation (lenient — ignores TS-only fields like sourceEvidence)
- [x] Reject schemas missing required simulation fields (reels, paylines, paytable, symbols)

### 5.3 Reel engine ✅

- [x] Reel strip representation (symbol index arrays)
- [x] Random spin using PCG seeded from `crypto/rand` when seed=0; reproducible when seed≠0
- [x] Symbol landing per reel per row (window-reuse buffer, no per-spin allocation)
- [x] Support configurable number of rows (default 3)

### 5.4 Win evaluator ✅

- [x] Payline evaluation — left-to-right match scanning
- [x] Wild substitution with leading-wild resolution + pure-wild line win
- [x] Scatter evaluation — count scatters anywhere on window
- [x] One win per payline (left-to-right run length × paytable multiplier)
- [x] Total spin win = sum of payline wins + scatter pays

### 5.5 Feature simulation ✅

- [x] Free spin trigger detection (scatter count threshold)
- [x] Free spin round execution with separate spin loop
- [x] Free spin multiplier application
- [x] Free spin retrigger support
- [x] Buy bonus simulation (separate pass, RTP = return / purchase cost)

### 5.6 Simulation runner (Requirement 4) ✅

- [x] Configurable spin count — accepts `1M / 10M / 100M / 500M / 1B`
- [x] Default spin count: `10_000_000`
- [x] Accumulate: total bet, total return, spin count, win count, feature trigger count
- [x] Base game RTP = (total - feature) return / bet
- [x] Per-feature RTP — `freeSpins`, `bonus` (placeholder 0 until schema has bonus rules), `buyBonus`
- [x] Total RTP = total return / total bet (online Welford accumulator)

### 5.7 Symbol hit probability tracking (Requirement 6) ✅

- [x] Per symbol × match count hit count across all spins
- [x] Hit probability = hits / total spins
- [x] Scatter hit counts tracked separately (0..reelCount scatters)
- [x] Wild-assisted win counter tracked
- [x] Symbol hit table emitted under `symbolHitProbabilities`

### 5.8 Statistical verification (Requirement 7) ✅

- [x] Hit rate = win spins / total spins
- [x] Variance via sample (Welford) — `m2 / (n-1)`
- [x] Standard deviation = sqrt(variance)
- [x] 90% CI = RTP ± 1.645 × (SD / sqrt(N))
- [x] 95% CI = RTP ± 1.96  × (SD / sqrt(N))
- [x] Convergence warning when 95% CI half-width > 0.5% of RTP

### 5.9 Simulation output ✅

- [x] Return JSON:
  ```json
  {
    "totalSpins": 0,
    "totalBet": 0,
    "totalReturn": 0,
    "rtp": 0.0,
    "baseRtp": 0.0,
    "featureRtp": {
      "freeSpins": 0.0,
      "bonus": 0.0,
      "buyBonus": 0.0
    },
    "hitRate": 0.0,
    "variance": 0.0,
    "standardDeviation": 0.0,
    "confidence90Low": 0.0,
    "confidence90High": 0.0,
    "confidence95Low": 0.0,
    "confidence95High": 0.0,
    "featureTriggerCount": 0,
    "symbolHitProbabilities": [],
    "warnings": []
  }
  ```
- [x] Output JSON shape returned by `POST /simulate`; raw file persistence happens in API layer (§5.10)

### 5.10 Simulation trigger in Express API ✅

- [x] `POST /api/games/:gameId/simulate` — trigger simulation
  - Accepts `spinCount` (one of 5 allowed values, default 10M), `seed`, `simulateBuyBonus`
  - Loads normalized schema from DB
  - POSTs to Go simulator at `SIMULATOR_URL` (default `http://localhost:8090`)
  - Writes `simulation-output.json` artifact, populates `simulations` row
  - Updates `games` status `simulating` → `simulated` (or `failed`)
  - Fires `simulation/completed` Inngest event
- [x] `GET /api/games/:gameId/simulations` (list), `latest`, `/:simulationId`, `/:simulationId/output`
- [x] Inngest `schema/generated` auto-triggers a 10M simulation unless `SIM_AUTOSTART=false`
- [x] 8 simulation tests including end-to-end Go-binary spawn + 1M-spin RTP convergence

### 5.11 Simulation UI ✅

- [x] "Run Simulation" CTA on game detail page (gated on `analyzed`+ status)
- [x] Spin count selector dropdown: `1M / 10M (default) / 100M / 500M / 1B`
- [x] Optional seed input + "Simulate buy bonus" checkbox
- [x] Status badge + polling (2s) while simulation is `pending` / `running`
- [x] Results panel:
  - Total RTP highlighted; Base RTP, Free spins / Bonus / Buy bonus RTP
  - Hit rate, Variance, Standard deviation
  - 90% and 95% confidence intervals (with half-width)
  - Total spins, wagered, paid, run time
  - Symbol hit probability table (symbol × match count grid, with prob columns)
  - Scatter count distribution block (when scatters land)
  - Buy bonus card (purchases / cost / return / RTP) when run
  - Warnings list

### Phase 5 Deliverable

- [x] Go simulator builds, runs, all 28 Go tests + 8 TS simulation tests green
- [x] Deterministic RTP for `same schema + seed` (verified by `TestRun_Determinism`)
- [x] Frontend displays simulation results (UI compiles and prod-builds clean)
- [ ] All 5 fixture schemas run through Go simulator end-to-end (requires Phase 4 to have produced real normalized schemas for each fixture)

---

## Phase 6 — Report Generator

Goal: JSON, Excel, and PDF reports downloadable for each game.

### 6.1 JSON report ✅

- [x] Build full report object in Express:
  - Game overview (name, provider, gameId, upload date)
  - Source upload metadata (original filename, file count, detected languages)
  - **Game mechanics summary** — plain English explanation from `game-mechanics.md`
  - Extracted reels (all reel strips with symbol names)
  - Extracted paylines (all patterns)
  - Symbols and paytable
  - Weight table (symbol frequency per reel)
  - Feature summary (free spins, bonus, buy bonus — each described)
  - AI extraction confidence per section
  - Warnings list
  - **Assumptions list** — every AI-inferred value with reason and improvement hint
  - Schema validation result
  - Simulation configuration (spin count, seed)
  - RTP summary — total, base, per-feature breakdown (free spins, bonus, buy bonus separately)
  - Total spins, wagered, paid
  - Hit rate, variance, SD
  - **90% confidence interval**
  - **95% confidence interval**
  - **Symbol hit probability table** — symbol × match count (2x/3x/4x/5x) with probability per spin
  - Scatter and bonus trigger statistics
  - Final verification summary
- [x] Label each data point as `extracted` / `ai-inferred` / `simulation-result` / `warning` / `assumption`
- [x] Save to `/storage/reports/<gameId>/report.json`
- [x] `reports` table updated in §6.4 workflow

### 6.2 Excel report ✅

- [x] Use `exceljs` npm package
- [x] Sheets:
  - `Overview` — game info, RTP summary, confidence intervals, verdict
  - `Game Mechanics` — plain English mechanics explanation
  - `Reels` — reel strips side by side with symbol weights
  - `Paylines` — payline grid patterns
  - `Paytable` — symbol × count → payout multiplier
  - `Simulation Results` — all statistical metrics (base RTP, per-feature RTP, SD, 90% CI, 95% CI)
  - `Symbol Hit Probability` — symbol × match count hit probability table
  - `Assumptions` — all AI assumptions with improvement hints
  - `Warnings` — all warnings with source evidence
- [x] Save to `/storage/reports/<gameId>/report.xlsx`
- [x] `reports` table updated in §6.4 workflow

### 6.3 PDF report

- [ ] Use `pdfkit` or `puppeteer` npm package
- [ ] Sections:
  - Game overview
  - **Game mechanics explanation** (human-readable, from AI-generated doc)
  - Extracted math data (reels, weights, paytable, paylines)
  - Feature descriptions
  - **Assumptions table** with improvement hints
  - Warnings
  - Simulation configuration
  - RTP results (total, base, per-feature)
  - **Symbol hit probability table**
  - Statistical summary (SD, 90% CI, 95% CI)
  - Final PASS / WARN / FAIL verdict box
- [ ] Clear visual separation between AI-inferred and deterministic data (color coding or labels)
- [ ] Save to `/storage/reports/<gameId>/report.pdf`
- [ ] Update `reports` table

### 6.4 Report generation workflow

- [ ] Inngest `simulation/completed` triggers report generation
- [ ] Generate JSON → Excel → PDF in sequence
- [ ] Update `games` status to `complete`
- [ ] Fire `report/generated` event

### 6.5 Report download API

- [ ] `GET /api/games/:gameId/reports/json` — stream JSON report file
- [ ] `GET /api/games/:gameId/reports/excel` — stream Excel file
- [ ] `GET /api/games/:gameId/reports/pdf` — stream PDF file

### 6.6 Report download UI

- [ ] Download buttons on game detail page (JSON, Excel, PDF)
- [ ] Show report generation status
- [ ] Disable buttons until reports are ready

### Phase 6 Deliverable

- [ ] All 5 fixtures produce downloadable JSON, Excel, and PDF reports
- [ ] Reports clearly label AI-inferred vs deterministic data
- [ ] PDF shows PASS/WARN/FAIL summary

---

## Cross-Cutting Concerns

### Security (implement throughout)

- [ ] Path traversal prevention on all file reads and writes (validate all paths are within `/storage/`)
- [ ] ZIP extraction: reject entries with `..` in path
- [ ] Max upload size enforced at Express middleware level
- [ ] Max extracted file count enforced during extraction
- [ ] Max individual file size enforced during extraction
- [ ] Binary file exclusion list maintained
- [ ] OpenAI prompt input: strip potential secrets (private keys, tokens matching common patterns)
- [ ] Never send full project to OpenAI — only candidate snippets

### Error handling (implement throughout)

- [ ] All Inngest workflow steps wrapped in try/catch
- [ ] Failures update `games` status to `failed` with error message
- [ ] Partial extraction failures recorded in `analysis_runs.errors_json`
- [ ] AI validation failures trigger retry then fallback to partial schema with warnings
- [ ] Simulation failures recorded in `simulations` table with error field

### Testing (implement per phase)

- [ ] Phase 1: Schema package unit tests
- [ ] Phase 2: Upload endpoint tests with fixture ZIPs, extraction safety tests
- [ ] Phase 3: Parser tests with golden candidate outputs per fixture
- [ ] Phase 4: AI extraction tests with mocked OpenAI responses, schema validation tests
- [ ] Phase 5: Go simulation unit tests (reel engine, win evaluator, statistics), integration test per fixture
- [ ] Phase 6: Report generation tests with golden report shapes

---

## Fixture Verification Checklist

Run this checklist after Phase 5 and Phase 6 are complete:

| Fixture | Extracted | Schema Valid | Mechanics Doc | RTP Result | Per-Feature RTP | Symbol Hit Prob | 90% CI | 95% CI | Reports |
|---|---|---|---|---|---|---|---|---|---|
| `2GamesSource.zip` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| `Category4-ProgressiveMultiplier.zip` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| `Category6-Tumble (2).zip` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| `src-20251222T115612Z-3-001.zip` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| `Zeus_math.zip` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## Requirements Coverage Map

| Requirement | Covered by |
|---|---|
| 1. Analyze game logic from source code | Phase 3 (static parser) + Phase 4 (AI analyzer) |
| 2. Output game mechanics document | Phase 4.6 (game mechanics explanation doc) |
| 3. Normalize to standard format | Phase 4 (unified game schema) |
| 4. Run 10M spins; configurable 1M/100M/500M/1B | Phase 5.6 (spin count selector) |
| 5. RTP broken down by base game + each feature | Phase 5.6 (per-feature RTP tracking) |
| 6. Hit probability per symbol (3x, 4x, 5x) | Phase 5.7 (symbol hit probability tracking) |
| 7. Standard deviation, 90% CI, 95% CI | Phase 5.8 (statistical verification) |
| 8. Additional analysis from source code | Phase 4 (confidence, warnings, source evidence) |
| Note 3: Assumptions must be listed | Phase 4.7 (assumptions tracking) |
