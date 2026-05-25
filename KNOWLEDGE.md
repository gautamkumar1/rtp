# AI-Powered Slot RTP Verification Platform

## Project Purpose

Build an AI-powered platform that verifies slot game math from uploaded source code.

The product is not a simple RTP calculator, not a casino game engine, and not a pure AI wrapper. It is an automated slot math verification platform that extracts game math from provider source code, normalizes it into one schema, runs deterministic simulation, and generates certification-style reports.

The core value is:

> AI that converts arbitrary slot source code into a normalized simulation model.

AI is used for source understanding and schema generation only. Final RTP, variance, hit rate, confidence intervals, and all statistical verification must come from deterministic simulation.

## MVP Goal

Create a local-first MVP that supports uploaded slot game ZIP files, analyzes mixed-language slot math source code, extracts math configuration, normalizes it, runs RTP simulations through a custom Go simulation engine, and generates JSON, Excel, and PDF reports.

All 5 MVP fixture ZIPs must pass end-to-end and produce correct RTP output:

- `2GamesSource.zip`
- `Category4-ProgressiveMultiplier.zip`
- `Category6-Tumble (2).zip`
- `src-20251222T115612Z-3-001.zip`
- `Zeus_math.zip`

Current fixture language scan:

| Fixture | Detected stack/language | Notes |
| --- | --- | --- |
| `2GamesSource.zip` | Go, SQL, YAML, JSON | Go backend-style slot project with `internal/games`, reel SQL files, and config YAML. |
| `Category4-ProgressiveMultiplier.zip` | Java, XML, SQL, JAR/class artifacts | Eclipse/Maven-style Java game math engine with `pom.xml`, `build.xml`, and SQL resources. |
| `Category6-Tumble (2).zip` | Java, XML, SQL, JAR/class artifacts | Eclipse/Maven-style Java game math engine for tumble mechanics. |
| `src-20251222T115612Z-3-001.zip` | Go, CSV, JSON, shell | Go simulator/game source with CSV math assets and cascading-related files. |
| `Zeus_math.zip` | C, C headers, XLSX, images | C math source with `freegame.c`, headers, and Excel math sheets. |

Initial MVP support:

- Mixed-language source scanning for Go, Java, C, JavaScript, TypeScript, JSON, CSV, SQL, XML, and XLSX math assets
- Fixed paylines
- Standard reel-based slots
- Simple bonus and free-spin systems
- Local file storage for uploads, extracted source, intermediate artifacts, and reports

Do not support initially:

- Megaways
- Cluster pays
- Remote math servers
- Encrypted math configs
- Heavily obfuscated production bundles
- Server-side provider math that is not present in uploaded source

## Engineering Rule

Never let AI do final math.

AI may:

- Understand source code
- Locate candidate math files
- Explain game logic
- Infer relationships between config objects
- Generate a normalized schema draft
- Flag uncertainty and missing data

AI must not:

- Calculate final RTP
- Validate statistics
- Produce certification values directly
- Invent missing reels, weights, paylines, paytables, or feature probabilities

The deterministic Go simulation engine must calculate:

- RTP
- Base game RTP
- Feature RTP
- Buy bonus RTP
- Variance
- Standard deviation
- Hit rate
- Confidence intervals
- Simulation convergence

## Final Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React + Vite + shadcn/ui |
| Backend API | Node.js + Express |
| AI Extraction | OpenAI API (within Express service) |
| Report Generation | Node.js (JSON, Excel, PDF — within Express service) |
| Simulation Engine | Go (custom-built deterministic engine, runs as HTTP service) |
| Source Parsing | Tree-sitter (Go, Java, C), structured parsers for CSV, JSON, SQL, XML, XLSX |
| Database | PostgreSQL + Prisma |
| Background Jobs | Inngest |
| Local Storage | Local filesystem |

Important MVP decisions:
- Do not use AWS S3. Store everything locally.
- Do not use BullMQ. Use Inngest for all background workflows.
- Simulation engine is custom Go, not slotopol/server.
- AI extraction and report generation live inside the Express API service.

## High-Level Architecture

```text
React + Vite Frontend
    ↓
Express API (Node.js)
  ├── Upload & ZIP extraction
  ├── Source parsing (Tree-sitter + structured parsers)
  ├── AI Extraction (OpenAI API)
  ├── Report Generation (JSON / Excel / PDF)
  └── Inngest Workflows
    ↓
Go Simulation Engine (HTTP service)
  ├── Deterministic reel simulation
  ├── RTP calculation
  └── Statistical verification
    ↓
Local Storage (reports, schemas, artifacts)
```

## Monorepo Structure

```text
/apps
  /web
    React + Vite frontend dashboard
  /api
    Express backend — upload, parsing, AI extraction, reports, Inngest

/services
  /simulator
    Go simulation engine (HTTP service)
    Deterministic reel simulation, RTP, statistics

/packages
  /game-schema
    Unified game schema, Zod validators, TypeScript types, fixtures
  /shared-types
    Shared TypeScript types used by web and api

/storage
  /uploads
    Uploaded ZIP files
  /extracted
    Unzipped source projects
  /artifacts
    Parser output, AI analysis output, normalized schemas, simulation output
  /reports
    Generated JSON, Excel, and PDF reports

/docs
  Product, architecture, schema, and provider adapter notes
```

## Main Modules

### 1. Frontend Dashboard (React + Vite + shadcn/ui)

Responsibilities:

- Upload slot source ZIP files
- Show upload and analysis status
- Display detected source files and candidate game math files
- Display extracted normalized game configuration
- Start simulations
- Show simulation progress
- View RTP and statistical results
- Download JSON, Excel, and PDF reports

### 2. Backend API (Node.js + Express)

Responsibilities:

- Accept ZIP uploads (multipart)
- Validate files (size, type, count)
- Save uploads to local storage
- Extract ZIP contents safely (path traversal prevention)
- Create game records in PostgreSQL via Prisma
- Trigger Inngest workflows
- Run source parsing pipeline
- Run AI extraction via OpenAI API
- Validate and store normalized schemas
- Trigger Go simulation engine via HTTP
- Generate JSON, Excel, PDF reports
- Serve all results to frontend

### 3. Inngest Workflow Layer

Workflow events:

- `upload.received`
- `project.extracted`
- `project.scanned`
- `analysis.started`
- `schema.generated`
- `simulation.started`
- `simulation.completed`
- `report.generated`

Each long-running operation is a resumable workflow step:

- Extract source
- Scan project structure
- Parse AST
- Run AI analysis
- Validate normalized schema
- Trigger simulation
- Generate reports

### 4. Source Code Analyzer (inside Express API)

Responsibilities:

- Scan uploaded project structure
- Detect likely game files
- Detect math/config files
- Extract reels, symbols, symbol weights, paylines, paytables
- Extract wild/scatter configuration
- Extract bonus and free-spin logic
- Extract buy bonus configuration when present
- Record uncertainty instead of inventing values

Parsing strategy:

1. Project structure scan
2. File classification
3. Static parsing — Tree-sitter for Go, Java, C; Babel Parser for JS/TS; dedicated parsers for CSV, JSON, SQL, XML, XLSX
4. Candidate math object extraction
5. AI-assisted source understanding via OpenAI
6. Normalized schema generation
7. Deterministic schema validation

The analyzer always preserves evidence:

- Source file path
- AST node location
- Extracted raw object/value
- Confidence level
- AI reasoning summary
- Validation errors or warnings

### 5. AI Extraction Engine (OpenAI API, inside Express API)

AI prompt goals:

- Identify the game type
- Explain where reels are defined
- Explain where paylines are defined
- Explain where symbols and payouts are defined
- Explain bonus mechanics
- Map provider-specific structures into the unified schema
- Return strict JSON matching the game schema
- Mark uncertain or missing fields explicitly

AI receives constrained input:

- File tree summary
- Candidate math files
- AST-extracted objects
- Relevant code snippets
- Unified schema definition

AI output is validated against the game schema before use.

### 6. Unified Game Schema (`/packages/game-schema`)

Every provider structures games differently. All extracted games must be normalized to one schema before simulation.

Example shape:

```json
{
  "schemaVersion": "0.1.0",
  "provider": "unknown",
  "gameId": "string",
  "gameName": "string",
  "gameType": "video-slot",
  "currencyMode": "credits",
  "bet": {
    "defaultBet": 1,
    "lines": 20,
    "coinValue": 1
  },
  "reels": [],
  "paylines": [],
  "symbols": [],
  "paytable": {},
  "wild": {},
  "scatter": {},
  "freeSpins": {},
  "bonus": {},
  "buyBonus": {},
  "sourceEvidence": [],
  "warnings": []
}
```

Schema rules:

- Explicit schema versioning
- No silent defaults for math-critical values
- Required simulation fields must be present before simulation starts
- Ambiguous values become validation errors or warnings
- Preserve source evidence for auditability

### 7. Go Simulation Engine (`/services/simulator`)

Custom-built deterministic simulation engine in Go.

Supports:
- Fixed payline slots
- Standard reel strips
- Wild substitution
- Scatter triggers
- Free spin rounds
- Buy bonus (where schema provides it)

Simulation flow:

```text
Unified Game Schema (JSON input via HTTP)
    ↓
Go reel engine
    ↓
Spin loop (configurable spin count)
    ↓
Win evaluation (paylines, wilds, scatters)
    ↓
Statistical accumulation
    ↓
JSON result output
```

Simulation types:

- Base game RTP
- Feature RTP
- Buy bonus RTP
- Full game RTP

Exposes an HTTP API consumed by the Express backend.

### 8. Statistical Verification Engine (inside Go service)

Responsibilities:

- Validate RTP convergence
- Calculate confidence intervals
- Compare observed and expected values where available
- Record spins, total wagered, total paid, error bounds

Metrics:

- RTP
- Hit rate
- Volatility / Variance
- Standard deviation
- 95% confidence interval

### 9. Report Generator (inside Express API)

Output formats:

- JSON
- Excel (xlsx)
- PDF

Report sections:

- Game overview
- Source upload metadata
- Extracted reels, paylines, symbols, paytable
- Feature summary
- AI extraction confidence and warnings
- Schema validation result
- Simulation configuration
- RTP summary (base, feature, buy bonus, total)
- Total spins, wagered, paid
- Hit rate, variance, standard deviation, confidence intervals
- Symbol statistics
- Final verification summary

Reports must clearly distinguish:

- Extracted facts
- AI-inferred mappings
- Deterministic simulation results
- Warnings and unsupported mechanics

## Database Model (PostgreSQL + Prisma)

### `games`

- `id`
- `name`
- `provider`
- `status`
- `upload_path`
- `extracted_path`
- `normalized_schema_path`
- `normalized_schema_json`
- `created_at`
- `updated_at`

### `analysis_runs`

- `id`
- `game_id`
- `status`
- `file_tree_json`
- `candidate_files_json`
- `ai_output_json`
- `warnings_json`
- `errors_json`
- `created_at`
- `updated_at`

### `simulations`

- `id`
- `game_id`
- `status`
- `total_spins`
- `rtp`
- `base_rtp`
- `feature_rtp`
- `buy_bonus_rtp`
- `variance`
- `standard_deviation`
- `hit_rate`
- `confidence_95`
- `raw_output_path`
- `created_at`
- `updated_at`

### `reports`

- `id`
- `game_id`
- `simulation_id`
- `json_report_path`
- `excel_report_path`
- `pdf_report_path`
- `created_at`

## Development Phases

### Phase 1: Project Foundation

Create monorepo structure, local dev setup, local storage folders, database schema, shared game schema package.

Deliverable:
- Apps and services boot locally
- Upload records can be created
- Local storage paths are stable

### Phase 2: Upload and Extraction

Build ZIP upload, validation, extraction, and project indexing.

Deliverable:
- User uploads one MVP fixture ZIP
- System extracts it locally
- System stores file tree metadata

### Phase 3: Static Parser

Build project scanner and AST extraction for all fixture languages (Go, Java, C, CSV, JSON, SQL, XML, XLSX).

Deliverable:
- System identifies candidate game/math files for all 5 fixtures
- System extracts candidate reels, symbols, paylines, and paytables where statically available

### Phase 4: AI Analyzer

Build AI-assisted source understanding and schema generation using OpenAI API.

Deliverable:
- System generates a validated unified schema from all 5 MVP fixtures
- System records confidence, warnings, and source evidence per field

### Phase 5: Go Simulation Engine

Build custom Go deterministic simulation engine.

Deliverable:
- Engine accepts unified schema JSON via HTTP
- Engine runs deterministic spins
- Engine returns RTP, variance, hit rate, confidence interval
- All 5 fixtures produce valid RTP output

### Phase 6: Report Generator

Build JSON, Excel, and PDF report generation.

Deliverable:
- User can download all three report formats
- Reports clearly separate AI-inferred data from deterministic simulation results

## Testing Strategy

Fixture-driven tests against all 5 MVP ZIP files.

Required test areas:

- ZIP validation and extraction
- File tree indexing
- Candidate file detection
- AST extraction per language
- Schema validation
- AI output validation with mocked OpenAI responses
- Schema-to-simulation mapping
- Go simulation correctness
- Statistical calculations
- Report generation

Golden files for:

- Expected file tree summaries per fixture
- Expected extracted candidates per fixture
- Expected normalized schema per fixture
- Expected report JSON shape

## Security and Safety

Uploaded source code is untrusted.

MVP rules:

- Do not execute uploaded game source directly
- Only parse uploaded source as text
- Extract ZIP files into isolated local directories
- Prevent path traversal during ZIP extraction
- Limit upload size
- Limit extracted file count
- Limit maximum individual file size
- Ignore binaries unless explicitly needed
- Redact secrets before sending snippets to OpenAI
- Never send entire projects to AI — send only candidate snippets

## Key Product Risks

### Arbitrary Source Understanding

The hardest problem is not the RTP formula. It is understanding arbitrary provider source code.

Mitigation:
- AST extraction first
- AI second
- Provider adapters over time
- Preserve source evidence
- Mark uncertainty clearly

### Obfuscated Code

Some providers minify, encrypt, or hide math configs.

Mitigation:
- Detect obfuscation
- Report unsupported files clearly
- Never pretend extraction succeeded

### Large Simulations

High-confidence RTP verification may require millions of spins.

Mitigation:
- Background workflows via Inngest
- Store intermediate results
- Report confidence intervals, not just point estimates

## Definition of Done for MVP

The MVP is complete when:

- A user can upload all 5 target fixture ZIPs
- The backend extracts each one locally
- The analyzer identifies likely math files for each fixture
- The AI analyzer produces a validated unified schema for each fixture
- The Go simulation engine runs deterministic spins from each schema
- The system reports RTP, variance, hit rate, and confidence interval for all 5 fixtures
- The user can download JSON, Excel, and PDF reports for each game
- Reports clearly separate AI-inferred data from deterministic simulation results

## Product Philosophy

Build:
- AI extraction layer
- Normalization engine
- Upload workflow
- Custom Go simulation engine
- Report generation

The long-term moat is the normalization layer plus provider-specific extraction knowledge.
