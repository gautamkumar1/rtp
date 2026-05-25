import fs from 'fs'
import path from 'path'
import type { AstCandidate } from '../parser/types.js'
import type { CandidateFile } from '../parser/classifier.js'
import { SCHEMA_VERSION } from '@rtp/game-schema'

const MAX_SNIPPET_CHARS = 32_000 // ~10k tokens — increased to fit more source

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
4. SYMBOLS: Build from Symbol/Constant files — map each symbol constant to an id+name entry. Use the actual integer values as id strings.
5. PAYTABLE: Extract from PayTable/payTable source. Map symbol id string → { "3": mult, "4": mult, "5": mult }.
6. PAYLINES: Extract explicit payline arrays if present. If not found, leave empty array and add warning.
7. Every field inferred without direct source evidence → add to assumptions[] with canBeImproved and improvementHint.
8. Every uncertain value → add to warnings[] as "fieldName: reason".
9. NEVER invent reel strips or paytable values — only use values found in the source.`
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
