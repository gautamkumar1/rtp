import fs from 'fs'
import path from 'path'
import type { AstCandidate } from '../parser/types.js'
import type { CandidateFile } from '../parser/classifier.js'
import { SCHEMA_VERSION } from '@rtp/game-schema'

const MAX_SNIPPET_CHARS = 80_000 // ~20k tokens — enough for 6+ high-value files

export function buildExtractionPrompt(params: {
  gameId: string
  gameName: string
  candidateFiles: CandidateFile[]
  astCandidates: AstCandidate[]
  extractedPath: string
  schemaDefinition: string
}): string {
  const { gameId, gameName, candidateFiles, astCandidates, extractedPath, schemaDefinition } = params

  const sorted = [...candidateFiles].sort((a, b) => b.relevanceScore - a.relevanceScore)
  const top50 = sorted.slice(0, 50)

  const topFilesText = top50
    .map((f) => `  ${f.path} (score=${f.relevanceScore})`)
    .join('\n')

  // Include full rawValue for high/medium candidates (up to 2000 chars each)
  const topCandidates = astCandidates
    .filter((c) => c.confidence === 'high' || c.confidence === 'medium')
    .slice(0, 60)

  const candidateSummary = topCandidates
    .map(
      (c) =>
        `[${c.confidence.toUpperCase()}] ${c.language}/${c.kind} "${c.name}" at ${c.sourceFile}:${c.lineNumber}\n${c.rawValue.slice(0, 2000)}`,
    )
    .join('\n\n---\n\n')

  // Build code snippets from top-ranked files directly (using the CandidateFile objects)
  const snippets = buildCodeSnippets(top50, extractedPath)

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
Return ONLY valid JSON. No markdown fences, no explanation.

${schemaDefinition}

## Critical Rules
1. schemaVersion MUST be "${SCHEMA_VERSION}" — exact string
2. gameId MUST be "${gameId}" — exact string
3. REELS: Each inner array is one reel strip. Use the ACTUAL integer/string values from source arrays (e.g. baseStrips, reelStrip, REEL_DATA). Convert integer symbol IDs to strings.
4. SYMBOLS: Build from Symbol/Constant files — map each symbol constant to an id+name entry. Use the actual integer values as id strings. Set isWild=true for any symbol named "WILD", "WI", "W", "NU" (null/wild), or that substitutes for others in the paytable logic. Set isScatter=true for any symbol named "SCATTER", "F" (free spin trigger), "SC", or that triggers free spins. Set isWild=false, isScatter=false for all others including bonus trigger symbols.
5. PAYTABLE: Extract from PayTable/payTable source. Map symbol id string → { "3": mult, "4": mult, "5": mult }. Only include symbols that appear in the paytable source — do NOT add entries for wild or scatter symbols unless they explicitly appear in the paytable with payout values.
6. PAYLINES: Extract explicit payline arrays if present. If not found for a PAYLINE game, GENERATE standard paylines: rows × reels (e.g. 3 rows × 5 reels → 15 paylines). For WAYS games, set paylines to [].
7. Every field inferred without direct source evidence → add to assumptions[] with canBeImproved and improvementHint.
8. Every uncertain value → add to warnings[] as "fieldName: reason".
9. NEVER invent reel strips or paytable values — only use values found in the source.
10. MECHANIC DETECTION: If the game pays based on total symbol count across the full grid (all reels × all rows, minimum N matches anywhere), set mechanic="ways". Signs: ResultGroupWayDTO, ResultSetWayDTO, countSymbol(), "Way" in class names, or no explicit payline arrays in source. If it pays left-to-right on defined lines, set mechanic="paylines" (default).
11. TUMBLE/CASCADE: If winning symbols are removed and the grid refills from strips each cascade (look for eliminatePositions, respin loop, do-while on respin, or "tumble"/"cascade" in comments/class names), set tumble: { enabled: true }. If there are separate free-game strips (e.g. Strips.free[][]), populate tumble.freeReels with those strip arrays; if base and free strips are identical, omit tumble.freeReels.
12. RANDOM SCATTER INJECT: If scatters are NOT on reel strips but injected per-spin via a weighted random draw (look for GetRandomScatter(mode), AssignScatter(), or a weight table keyed by scatter count in Constant/Config files), you MUST extract randomScatterInject. Use MODE=0 (lowest RTP, first mode) weights as the base. CRITICAL: use field name "baseWeights" (not "weights"). Format: randomScatterInject: { symbolId: "<scatter symbol id string>", baseWeights: [{count: N, weight: W}, ...], buyFeature: false, perColumn: false }. Set perColumn: true if the draw runs independently per reel column (e.g. a loop over each reel calling GetRandomScatter once per reel). Set buyFeature: true for buy-feature modes where entry is forced. CRITICAL: baseWeights is REQUIRED — never emit randomScatterInject without it. Example from GetRandomScatter(0): [{count:1,weight:6},{count:0,weight:29}] → baseWeights: [{count:1,weight:6},{count:0,weight:29}].
13. BONUS MULTIPLIER: If a symbol triggers a random win multiplier drawn from a weighted table (e.g. GetMultiplier(mode)), extract as bonusMultiplier: { symbolId: "<symbol id>", weights: [[multiplierValue, weight], ...] }. Use the symbol ID of the bonus trigger symbol (e.g. "41" for symbol B).
14. MULTI-VARIANT DETECTION: If the source has multiple RTP modes (e.g. Mode.R90=0, Mode.R93=1, or comments like "0:Normal_90.2%,1:Normal_93%,2:Normal:96%,3:Buy_90.5%"), produce a variants array. Each variant: { label: "R90", declaredRtp: 0.902, scatterWeights: [{count,weight},...], buyFeature: false }. CRITICAL: use field name "scatterWeights" (not "weights") in each variant. Base schema uses mode 0 values. Variants where stop positions are fixed/forced (buy-feature modes) set buyFeature: true.
15. DECLARED RTP: Extract target RTP values from comments or constants (e.g. "90.2%" → 0.902, "93%" → 0.930, "96%" → 0.960). Set declaredRtp on the base schema (mode 0 value) and per variant in the variants array. Always use 0-1 fractions.`
}

function buildCodeSnippets(candidateFiles: CandidateFile[], extractedPath: string): string {
  let total = 0
  const parts: string[] = []

  for (const cf of candidateFiles) {
    if (total >= MAX_SNIPPET_CHARS) break

    const abs = path.resolve(extractedPath, cf.path)
    if (!fs.existsSync(abs)) continue

    try {
      const stat = fs.statSync(abs)
      if (stat.size > 800_000) continue // skip very large files

      // Read more of high-scoring files
      const maxChars = cf.relevanceScore >= 15 ? 12_000 : cf.relevanceScore >= 8 ? 6_000 : 3_000
      const content = fs.readFileSync(abs, 'utf8').slice(0, maxChars)
      const snippet = `\n${'='.repeat(4)} ${cf.path} (relevance=${cf.relevanceScore}) ${'='.repeat(4)}\n${content}\n`

      if (total + snippet.length > MAX_SNIPPET_CHARS) {
        // Include a partial snippet if it's a high-value file
        if (cf.relevanceScore >= 15) {
          const remaining = MAX_SNIPPET_CHARS - total
          if (remaining > 500) {
            parts.push(`\n==== ${cf.path} (relevance=${cf.relevanceScore}, truncated) ====\n${content.slice(0, remaining - 100)}\n[...truncated...]\n`)
            total = MAX_SNIPPET_CHARS
          }
        }
        break
      }

      parts.push(snippet)
      total += snippet.length
    } catch {
      // skip unreadable
    }
  }

  return parts.join('') || '(No source snippets available)'
}

export function buildSchemaDefinition(): string {
  return `{
  "schemaVersion": "${SCHEMA_VERSION}",
  "provider": "string",
  "gameId": "string",
  "gameName": "string",
  "gameType": "video-slot",
  "currencyMode": "credits | cash",
  "mechanic": "paylines | ways",
  "declaredRtp": number_or_null,
  "variantLabel": "string_or_null",
  "bet": {
    "defaultBet": number,
    "lines": number,
    "coinValue": number
  },
  "reels": [
    ["SYM_ID_STRING", "SYM_ID_STRING", ...],
    ["SYM_ID_STRING", ...]
  ],
  "paylines": [[rowIdx, rowIdx, ...], ...],
  "symbols": [
    { "id": "string", "name": "string", "isWild": false, "isScatter": false }
  ],
  "paytable": {
    "SYM_ID": { "3": number, "4": number, "5": number }
  },
  "wild": { "symbolId": "string", "substitutesFor": [], "multiplier": 1 },
  "scatter": { "symbolId": "string", "triggerCount": 3, "awardType": "freeSpins" },
  "freeSpins": { "count": number, "multiplier": number, "retrigger": false },
  "tumble": { "enabled": true, "freeReels": [["SYM_ID", ...], ...] },
  "randomScatterInject": {
    "symbolId": "string",
    "baseWeights": [{ "count": number, "weight": number }],
    "buyFeature": false,
    "perColumn": false
  },
  "bonusMultiplier": {
    "symbolId": "string",
    "weights": [[multiplierValue, weight], ...]
  },
  "variants": [
    {
      "label": "string",
      "declaredRtp": number,
      "scatterWeights": [{ "count": number, "weight": number }],
      "buyFeature": false
    }
  ],
  "bonus": { "description": "string", "triggerCondition": "string" },
  "buyBonus": { "costMultiplier": number, "entryPoint": "string" },
  "sourceEvidence": [
    { "filePath": "string", "lineNumber": number, "rawValue": "string", "confidence": "high|medium|low", "reasoning": "string" }
  ],
  "warnings": ["string"],
  "assumptions": [
    { "field": "string", "assumedValue": "any", "reason": "string", "sourceEvidence": [], "canBeImproved": true, "improvementHint": "string" }
  ]
}`
}
