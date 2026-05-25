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

### 3.1 File classifier

- [ ] Inngest `project/scanned` handler triggers file classification
- [ ] Score each file for math relevance:
  - Path patterns: `reel`, `paytable`, `symbol`, `math`, `config`, `game`, `pay`
  - Extensions: `.go`, `.java`, `.c`, `.h`, `.json`, `.csv`, `.sql`, `.xml`, `.yaml`, `.xlsx`
  - Size: ignore empty files and very large files (>2MB for text files)
  - Binary: skip binaries
- [ ] Save `candidate-files.json` to `/storage/artifacts/<gameId>/`
  - Each entry: `{ path, extension, relevanceScore, reason }`

### 3.2 AST parser — Go source (fixtures: `2GamesSource.zip`, `src-20251222T115612Z-3-001.zip`)

- [ ] Install `tree-sitter` and `tree-sitter-go` in `apps/api`
- [ ] Parse Go files for candidate math objects:
  - Array/slice literals that look like reel strips (arrays of strings or ints)
  - Struct literals with fields named `symbol`, `payout`, `reel`, `line`, `weight`
  - Map literals with numeric keys/values that resemble paytables
- [ ] For each extracted object, record:
  - Source file path
  - Line number
  - Raw extracted value
  - Confidence (`high` / `medium` / `low`)
- [ ] Save `ast-candidates.json` to `/storage/artifacts/<gameId>/`

### 3.3 AST parser — Java source (fixtures: `Category4-ProgressiveMultiplier.zip`, `Category6-Tumble (2).zip`)

- [ ] Install `tree-sitter-java`
- [ ] Parse Java files for candidate math objects:
  - Array initializers that look like reel strips
  - Field declarations with math-related names
  - XML resource files for SQL-defined reel/paytable data
- [ ] Same evidence format as Go parser
- [ ] Append to `ast-candidates.json`

### 3.4 AST parser — C source (fixture: `Zeus_math.zip`)

- [ ] Install `tree-sitter-c`
- [ ] Parse C/header files for candidate math objects:
  - Array declarations that look like reel strips
  - Struct definitions with math-relevant field names
  - `#define` constants for symbol counts, payline counts
- [ ] Same evidence format
- [ ] Append to `ast-candidates.json`

### 3.5 Structured asset parsers

- [ ] CSV parser — detect tabular reel/weight/paytable data, extract rows with headers
- [ ] JSON parser — extract top-level keys matching math field names
- [ ] SQL parser — extract `INSERT` statements into reel/paytable/symbol tables
- [ ] XML parser — extract elements matching reel/paytable/config patterns
- [ ] XLSX parser (`xlsx` npm package) — extract sheets that look like math tables
- [ ] All parsers write to `ast-candidates.json` with format and sheet/table name recorded

### 3.6 Candidate review API

- [ ] `GET /api/games/:gameId/candidates` — return `ast-candidates.json`
- [ ] `GET /api/games/:gameId/analysis` — return `analysis_runs` record

### 3.7 Candidate review UI

- [ ] Frontend page showing detected candidate files per game
- [ ] List of extracted raw objects with source location and confidence
- [ ] Expandable raw value view per candidate

### Phase 3 Deliverable

- [ ] Run all 5 fixtures through static parser
- [ ] Each fixture produces a populated `ast-candidates.json`
- [ ] Go, Java, C, CSV, SQL, XML, XLSX sources all produce candidates
- [ ] Frontend displays candidates for each fixture

---

## Phase 4 — AI Analyzer

Goal: System generates a validated unified schema for all 5 fixtures using OpenAI.

### 4.1 AI extraction service

- [ ] Install `openai` npm package in `apps/api`
- [ ] Build prompt construction:
  - File tree summary (top 50 most relevant files)
  - Candidate math objects from `ast-candidates.json` (top candidates by confidence)
  - Relevant code snippets (max 8,000 tokens of source)
  - Full `GameSchema` JSON Schema definition
  - Instruction: return strict JSON matching schema, mark uncertain fields with `"_confidence": "low"` and `"_warning": "reason"`
- [ ] Call OpenAI API (GPT-4o, JSON mode / structured outputs)
- [ ] Parse and validate AI response against `GameSchema` Zod validator
- [ ] If validation fails, retry once with error context appended to prompt
- [ ] Save raw AI response to `/storage/artifacts/<gameId>/ai-raw.json`
- [ ] Save validated schema to `/storage/artifacts/<gameId>/normalized-schema.json`
- [ ] Save schema JSON to `analysis_runs.ai_output_json` in database

### 4.6 Game mechanics explanation document (Requirement 2)

- [ ] After schema is validated, generate a human-readable game mechanics document via OpenAI
  - Describe how the game works in plain English
  - Explain reel layout (number of reels, rows, symbols per reel)
  - Explain weight table (symbol frequency/probability on each reel)
  - Explain payout table (symbol × count → multiplier)
  - Explain wild rules (which symbols substitute, any restrictions)
  - Explain scatter rules (trigger threshold, what it awards)
  - Explain free spin rules (count, multiplier, retrigger conditions)
  - Explain bonus/buy bonus mechanics if present
  - Flag any mechanics that could not be determined from source
- [ ] Save as `/storage/artifacts/<gameId>/game-mechanics.md`
- [ ] Expose via `GET /api/games/:gameId/mechanics`
- [ ] Display in frontend as a readable document tab on the game detail page

### 4.7 Assumptions tracking (Requirement Note 3)

- [ ] Add `assumptions` array to `GameSchema` alongside `warnings`
  - Each assumption: `{ field, assumedValue, reason, sourceEvidence, canBeImproved: true/false, improvementHint }`
- [ ] AI prompt must explicitly instruct: never invent a value silently — every inferred value must produce an assumption entry
- [ ] Schema validator checks that any field without direct source evidence has a corresponding assumption entry
- [ ] Save `assumptions` list to `analysis_runs` record
- [ ] Report clearly lists all assumptions with improvement hints (e.g. "provide `config.xml` line 42 to confirm reel 3 strip")

### 4.2 AI pipeline Inngest workflow

- [ ] Inngest `project/scanned` → trigger `analysis/started`
- [ ] `analysis/started` handler:
  - Call AI extraction service
  - Validate schema
  - Update `analysis_runs` record
  - Update `games` status to `analyzed`
  - Fire `schema/generated` event

### 4.3 Schema validation rules (enforced before simulation)

- [ ] `reels` must be present and non-empty
- [ ] `paylines` must be present and non-empty
- [ ] `symbols` must be present
- [ ] `paytable` must cover all non-wild, non-scatter symbols
- [ ] Reel strip symbols must all exist in `symbols` array
- [ ] Payline positions must be valid for reel count and row count
- [ ] Any missing required field must be recorded in `warnings` (not silently defaulted)

### 4.4 Schema review UI

- [ ] Frontend page for extracted schema:
  - Reels display (reel strips with symbol names)
  - Paylines visualization (grid pattern per payline)
  - Symbols list (name, wild/scatter flags)
  - Paytable (symbol × count → payout grid)
  - Feature summary (free spins, bonus, buy bonus)
  - AI confidence indicators per section
  - Warnings list
  - Source evidence expandable per field

### 4.5 Schema API endpoints

- [ ] `GET /api/games/:gameId/schema` — return normalized schema JSON
- [ ] `GET /api/games/:gameId/schema/warnings` — return warnings and confidence issues

### Phase 4 Deliverable

- [ ] All 5 fixtures produce a validated `normalized-schema.json`
- [ ] Schemas pass all validation rules (or have explicit warnings for gaps)
- [ ] Frontend displays schema for each fixture with confidence indicators

---

## Phase 5 — Go Simulation Engine

Goal: Custom Go engine accepts unified schema, runs deterministic spins, returns RTP and statistics for all 5 fixtures.

### 5.1 Go service scaffold

- [ ] Initialize Go module at `services/simulator`
- [ ] HTTP server on configurable port (default `8090`)
- [ ] `POST /simulate` endpoint accepting JSON body (unified schema + simulation config)
- [ ] `GET /health` endpoint
- [ ] Graceful shutdown

### 5.2 Schema input model

- [ ] Define Go structs matching `GameSchema` JSON shape
- [ ] JSON unmarshalling with validation
- [ ] Reject schemas missing required simulation fields (reels, paylines, paytable, symbols)

### 5.3 Reel engine

- [ ] Reel strip representation (symbol index arrays)
- [ ] Random spin using `crypto/rand` seeded PRNG for reproducibility
- [ ] Symbol landing per reel per row
- [ ] Support configurable number of rows (default 3)

### 5.4 Win evaluator

- [ ] Payline evaluation — for each payline, check symbol match left-to-right
- [ ] Wild substitution — replace wilds with best matching symbol per payline
- [ ] Scatter evaluation — count scatter symbols across all reels regardless of paylines
- [ ] Highest win per payline (not cumulative per line)
- [ ] Total spin win = sum of all payline wins + scatter wins

### 5.5 Feature simulation

- [ ] Free spin trigger detection (scatter count threshold)
- [ ] Free spin round execution (separate spin loop, accumulate wins)
- [ ] Free spin multiplier application
- [ ] Free spin retrigger support
- [ ] Buy bonus simulation (direct entry to free spins at configured cost)

### 5.6 Simulation runner (Requirement 4)

- [ ] Configurable spin count — accept one of: `1_000_000` / `10_000_000` / `100_000_000` / `500_000_000` / `1_000_000_000`
- [ ] Default spin count: `10_000_000`
- [ ] Accumulate: total bet, total return, spin count, win count, feature trigger count
- [ ] Base game RTP = base game return / base game bet
- [ ] Per-feature RTP — track each feature separately:
  - Free spins RTP = free spin total return / total bet
  - Bonus RTP = bonus total return / total bet (if applicable)
  - Buy bonus RTP = buy bonus return / buy bonus cost (if schema provides buy bonus)
- [ ] Total RTP = total return / total bet

### 5.7 Symbol hit probability tracking (Requirement 6)

- [ ] Per symbol, per match count (2x, 3x, 4x, 5x), track hit count across all spins
- [ ] Calculate hit probability = symbol_match_count_hits / total_spins
- [ ] Track scatter hit counts separately (1x, 2x, 3x, 4x, 5x scatters)
- [ ] Track wild contribution count (how many wins were wild-assisted)
- [ ] Output symbol hit probability table:
  ```
  Symbol  | 2x hits | 3x hits | 4x hits | 5x hits | 2x prob | 3x prob | 4x prob | 5x prob
  ```
- [ ] Save to simulation output JSON under `symbolHitProbabilities`

### 5.8 Statistical verification (Requirement 7)

- [ ] Hit rate = win spins / total spins
- [ ] Variance = E[X²] - E[X]²
- [ ] Standard deviation = sqrt(variance)
- [ ] 90% confidence interval = RTP ± 1.645 × (SD / sqrt(N))
- [ ] 95% confidence interval = RTP ± 1.960 × (SD / sqrt(N))
- [ ] Convergence check — warn if 95% CI width > 0.5% RTP

### 5.9 Simulation output

- [ ] Return JSON:
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
- [ ] Save raw output to `/storage/artifacts/<gameId>/simulation-output.json`

### 5.10 Simulation trigger in Express API

- [ ] `POST /api/games/:gameId/simulate` — trigger simulation
  - Accept `spinCount` in body (one of the 5 allowed values, default 10M)
  - Load normalized schema from artifacts
  - POST to Go simulator `http://localhost:8090/simulate`
  - Save result to `simulations` table
  - Update `games` status to `simulated`
  - Fire `simulation/completed` Inngest event
- [ ] Inngest `schema/generated` can auto-trigger simulation (configurable)

### 5.11 Simulation UI

- [ ] "Run Simulation" button on game detail page
- [ ] Spin count selector dropdown: `1M / 10M (default) / 100M / 500M / 1B`
- [ ] Progress indicator (polling simulation status)
- [ ] Results panel:
  - Total RTP, Base RTP
  - Per-feature RTP breakdown (free spins, bonus, buy bonus shown separately)
  - Hit rate, Variance, Standard deviation
  - 90% confidence interval
  - 95% confidence interval
  - Total spins, wagered, paid
  - Symbol hit probability table (symbol × match count grid)

### Phase 5 Deliverable

- [ ] All 5 fixture schemas run through Go simulator
- [ ] Each produces valid RTP, variance, hit rate, confidence interval
- [ ] RTP values are deterministic (same schema + seed = same result)
- [ ] Frontend displays simulation results

---

## Phase 6 — Report Generator

Goal: JSON, Excel, and PDF reports downloadable for each game.

### 6.1 JSON report

- [ ] Build full report object in Express:
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
- [ ] Label each data point as `extracted` / `ai-inferred` / `simulation-result` / `warning` / `assumption`
- [ ] Save to `/storage/reports/<gameId>/report.json`
- [ ] Update `reports` table

### 6.2 Excel report

- [ ] Use `exceljs` npm package
- [ ] Sheets:
  - `Overview` — game info, RTP summary, confidence intervals
  - `Game Mechanics` — plain English mechanics explanation
  - `Reels` — reel strips side by side with symbol weights
  - `Paylines` — payline grid patterns
  - `Paytable` — symbol × count → payout multiplier
  - `Simulation Results` — all statistical metrics (base RTP, per-feature RTP, SD, 90% CI, 95% CI)
  - `Symbol Hit Probability` — symbol × match count hit probability table
  - `Assumptions` — all AI assumptions with improvement hints
  - `Warnings` — all warnings with source location
- [ ] Save to `/storage/reports/<gameId>/report.xlsx`
- [ ] Update `reports` table

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
