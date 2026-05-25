# AI-Powered Slot RTP Verification Platform

## Project Purpose

Build an AI-powered platform that verifies slot game math from uploaded source code.

The product is not a simple RTP calculator, not a casino game engine, and not a pure AI wrapper. It is an automated slot math verification platform that extracts game math from provider source code, normalizes it into one schema, runs deterministic simulation, and generates certification-style reports.

The core value is:

> AI that converts arbitrary slot source code into a normalized simulation model.

AI is used for source understanding and schema generation only. Final RTP, variance, hit rate, confidence intervals, and all statistical verification must come from deterministic simulation.

## MVP Goal

Create a local-first MVP that supports uploaded slot game ZIP files, analyzes mixed-language slot math source code, extracts math configuration, normalizes it, runs RTP simulations through an existing simulation engine, and generates JSON, Excel, and PDF reports.

MVP target fixtures in this workspace:

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
| `Category6-Tumble (2).zip` | Java, XML, SQL, JAR/class artifacts | Eclipse/Maven-style Java game math engine for tumble mechanics; use as research fixture because tumble is not first-class MVP support. |
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
- Cascading/tumble mechanics, except as a research fixture
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

The deterministic simulation and statistical engine must calculate:

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
| Frontend | Next.js |
| UI | Tailwind CSS + shadcn/ui |
| Backend API | NestJS |
| AI Extraction Service | Python |
| Source Parsing | Tree-sitter where grammar support is available |
| JS/TS Parsing | Babel Parser when JS/TS projects are uploaded |
| Structured Assets | CSV, JSON, SQL, XML, and XLSX parsers |
| AI Provider | OpenAI API |
| Simulation Engine | `slotopol/server` |
| Queue and Jobs | Inngest |
| Database | PostgreSQL |
| Cache | Redis |
| Local Storage | Local filesystem |

Important MVP decision: do not use AWS S3 yet. Store uploaded ZIPs, extracted projects, generated schemas, simulation outputs, and reports locally.

Important MVP decision: do not use BullMQ. Use Inngest for background workflows and long-running jobs.

## High-Level Architecture

```text
Upload ZIP
    ↓
Local File Storage
    ↓
Project Scanner
    ↓
AST Parser
    ↓
AI Extraction Engine
    ↓
Unified Game Schema
    ↓
slotopol/server Simulation
    ↓
Statistical Verification
    ↓
Report Generator
```

System components:

```text
Frontend Dashboard
    ↓
NestJS API
    ↓
Inngest Workflows
    ↓
AI Parser Service
    ↓
Game Schema Package
    ↓
Simulation Service
    ↓
Report Engine
```

## Suggested Monorepo Structure

```text
/apps
  /web
    Next.js frontend dashboard
  /api
    NestJS backend API

/services
  /ai-parser
    Python service for project scanning, AST extraction, and AI-assisted normalization
  /simulation
    Wrapper around slotopol/server and statistical verification logic
  /report-engine
    JSON, Excel, and PDF report generation

/packages
  /game-schema
    Unified game schema, validators, fixtures, and schema versioning
  /shared-types
    Shared TypeScript types used by web, API, and services

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

### 1. Frontend Dashboard

Responsibilities:

- Upload slot source ZIP files
- Show upload and analysis status
- Display detected source files and candidate game math files
- Display extracted normalized game configuration
- Start simulations
- Show simulation progress
- View RTP and statistical results
- Download JSON, Excel, and PDF reports

Use:

- Next.js
- Tailwind CSS
- shadcn/ui

### 2. Backend API

Responsibilities:

- Accept ZIP uploads
- Validate files
- Save uploads to local storage
- Extract ZIP contents
- Create game records
- Trigger Inngest workflows
- Serve schema, simulation, and report results

Use:

- NestJS
- Multipart upload handling
- ZIP extraction
- PostgreSQL
- Redis where useful for cache/session/state

### 3. Inngest Workflow Layer

Use Inngest instead of BullMQ.

Workflow responsibilities:

- `upload.received`
- `project.extracted`
- `project.scanned`
- `analysis.started`
- `schema.generated`
- `simulation.started`
- `simulation.completed`
- `report.generated`

Each long-running operation should be a resumable workflow step:

- Extract source
- Scan project structure
- Parse AST
- Run AI analysis
- Validate normalized schema
- Run simulation
- Generate reports

### 4. Source Code Analyzer

This is the core product.

Responsibilities:

- Scan uploaded project structure
- Detect likely game files
- Detect math/config files
- Extract reels
- Extract symbols
- Extract symbol weights
- Extract paylines
- Extract paytables
- Extract wild/scatter configuration
- Extract bonus and free-spin logic
- Extract buy bonus configuration when present
- Record uncertainty instead of inventing values

Parsing strategy:

1. Project structure scan
2. File classification
3. Static parsing with Tree-sitter, Babel Parser for JS/TS, and structured parsers for CSV, JSON, SQL, XML, and XLSX
4. Candidate math object extraction
5. AI-assisted source understanding
6. Normalized schema generation
7. Deterministic schema validation

The analyzer should always preserve evidence:

- Source file path
- AST node location
- Extracted raw object/value
- Confidence level
- AI reasoning summary
- Validation errors or warnings

### 5. AI Extraction Engine

Use OpenAI API for reasoning over source code and extracted AST candidates.

AI prompt goals:

- Identify the game type
- Explain where reels are defined
- Explain where paylines are defined
- Explain where symbols and payouts are defined
- Explain bonus mechanics
- Map provider-specific structures into the unified schema
- Return strict JSON matching the game schema
- Mark uncertain or missing fields explicitly

AI must receive constrained input:

- File tree summary
- Candidate math files
- AST-extracted objects
- Relevant code snippets
- Existing provider adapter hints
- Unified schema definition

AI output must be validated before use.

### 6. Unified Game Schema

This is a critical layer.

Every provider structures games differently. The platform must standardize every extracted game into one schema before simulation.

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

- Use explicit schema versioning.
- No silent defaults for math-critical values.
- Required simulation fields must be present before simulation starts.
- Ambiguous values should become validation errors or warnings.
- Preserve source evidence for auditability.

### 7. Simulation Service

Do not build the RTP simulator from scratch.

Use:

- `slotopol/server`
- GitHub: `https://github.com/slotopol/server`

Purpose:

- Run reel simulation
- Calculate RTP
- Calculate hit frequency
- Calculate volatility
- Calculate statistical metrics
- Run feature simulations where possible

Simulation flow:

```text
Unified Game Schema
    ↓
slotopol-compatible model
    ↓
Simulation run
    ↓
Raw simulation output
    ↓
Statistical verification
    ↓
Report-ready results
```

Simulation types:

- Base game RTP
- Feature RTP
- Buy bonus RTP
- Full game RTP

### 8. Statistical Verification Engine

Responsibilities:

- Validate RTP convergence
- Validate simulation stability
- Calculate confidence intervals
- Compare observed and expected values where expected values exist
- Record number of spins, total wagered, total paid, and error bounds

Metrics:

- RTP
- Hit rate
- Volatility
- Variance
- Standard deviation
- P-value when applicable
- 95% confidence interval

Basic formula:

```text
RTP = Total Return / Total Bet × 100
```

### 9. Report Generator

Output formats:

- JSON
- Excel
- PDF

Report sections:

- Game overview
- Source upload metadata
- Extracted reels
- Extracted paylines
- Symbols and paytable
- Feature summary
- AI extraction confidence and warnings
- Schema validation result
- Simulation configuration
- RTP summary
- Base RTP
- Feature RTP
- Buy bonus RTP
- Total spins
- Total wagered
- Total paid
- Hit rate
- Variance
- Standard deviation
- Confidence intervals
- Symbol statistics
- Scatter and bonus trigger statistics
- Final verification summary

Reports must distinguish:

- Extracted facts
- AI-inferred mappings
- Deterministic simulation results
- Warnings and unsupported mechanics

## Database Model

Recommended MVP tables:

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

## Provider Adapters

Long-term architecture should include provider adapters:

```text
/services/ai-parser/adapters
  /pragmatic
  /hacksaw
  /nolimit
  /netent
  /generic-html5
```

Adapters should contain:

- File naming patterns
- Known config object names
- Known math file locations
- Symbol naming conventions
- Reel/payline extraction hints
- Provider-specific normalization logic

MVP should start with `generic-html5` and add adapter behavior only when real fixture analysis proves it is needed.

## Claude Code Worktree Strategy

Keep `main` stable.

Use separate worktrees or branches for independent work:

### Worktree 1: Parser

Focus only on:

- ZIP extraction
- Project scanning
- AST parsing
- Symbol extraction
- Reel detection
- Candidate math file detection

### Worktree 2: AI Analyzer

Focus only on:

- Prompt engineering
- Source-code understanding
- AI response schema
- Normalization generation
- Validation of AI output

### Worktree 3: Simulation Integration

Focus only on:

- `slotopol/server` integration
- Schema-to-simulator mapping
- RTP execution
- Statistical validation
- Simulation result storage

### Worktree 4: Report System

Focus only on:

- JSON export
- Excel export
- PDF generation
- Report templates
- Charts and summaries

## Development Phases

### Phase 1: Project Foundation

Create monorepo structure, local development setup, local storage folders, database schema, and shared game schema package.

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

Build project scanner and AST extraction.

Deliverable:

- System identifies candidate game/math files
- System extracts candidate reels, symbols, paylines, and paytables where statically available

### Phase 4: AI Analyzer

Build AI-assisted source understanding and schema generation.

Deliverable:

- System generates a validated unified schema draft from at least one MVP fixture
- System records confidence, warnings, and source evidence

### Phase 5: Simulation Integration

Integrate `slotopol/server`.

Deliverable:

- System converts unified schema to simulator input
- System runs simulations
- System stores deterministic statistics

### Phase 6: Report Generator

Build report outputs.

Deliverable:

- User can download JSON, Excel, and PDF verification reports

## Testing Strategy

Use fixture-driven tests.

Test against the MVP ZIP files and extracted source snapshots.

Required test areas:

- ZIP validation
- ZIP extraction
- File tree indexing
- Candidate file detection
- AST extraction
- Schema validation
- AI output validation with mocked AI responses
- Schema-to-simulation mapping
- Statistical calculations
- Report generation

Golden files should be used for:

- Expected file tree summaries
- Expected extracted candidates
- Expected normalized schema for each supported fixture
- Expected report JSON shape

## Security and Safety

Uploaded source code is untrusted.

MVP rules:

- Do not execute uploaded game source directly.
- Only parse uploaded source as text.
- Extract ZIP files into isolated local directories.
- Prevent path traversal during ZIP extraction.
- Limit upload size.
- Limit extracted file count.
- Limit maximum individual file size.
- Ignore binaries unless explicitly needed.
- Redact secrets before sending snippets to AI.
- Never send entire projects to AI when smaller candidate snippets are enough.

## Key Product Risks

### Arbitrary Source Understanding

The hardest problem is not the RTP formula. The hardest problem is understanding arbitrary provider source code.

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
- Avoid pretending extraction succeeded

### Large Simulations

High-confidence RTP verification may require millions or hundreds of millions of spins.

Mitigation:

- Use background workflows
- Store intermediate results
- Parallelize later
- Report confidence intervals, not just point estimates

## Definition of Done for MVP

The MVP is successful when:

- A user can upload at least one target fixture ZIP.
- The backend extracts it locally.
- The analyzer identifies likely math files.
- The AI analyzer produces a validated unified schema.
- The simulator runs deterministic spins from that schema.
- The system reports RTP, variance, hit rate, and confidence interval.
- The user can download JSON, Excel, and PDF reports.
- The report clearly separates AI-inferred data from deterministic simulation results.

## Product Philosophy

Build:

- AI extraction layer
- Normalization engine
- Upload workflow
- Report generation

Reuse:

- RTP simulation engine
- Statistical engine
- Reel simulation framework

The long-term moat is the normalization layer plus provider-specific extraction knowledge.


