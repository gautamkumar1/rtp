import fs from 'fs'
import path from 'path'
import type { AstCandidate } from '../parser/types.js'
import type { CandidateFile } from '../parser/classifier.js'
import { SCHEMA_VERSION } from '@rtp/game-schema'

const MAX_SNIPPET_CHARS = 24_000 // ~8k tokens

export function buildExtractionPrompt(params: {
  gameId: string
  gameName: string
  candidateFiles: CandidateFile[]
  astCandidates: AstCandidate[]
  extractedPath: string
  schemaDefinition: string
}): string {
  const { gameId, gameName, candidateFiles, astCandidates, extractedPath, schemaDefinition } = params

  const topFiles = candidateFiles
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 50)
    .map((f) => `  ${f.path} (score=${f.relevanceScore}, reason=${f.reason})`)
    .join('\n')

  const topCandidates = astCandidates
    .filter((c) => c.confidence === 'high' || c.confidence === 'medium')
    .slice(0, 80)

  const candidateSummary = topCandidates
    .map(
      (c) =>
        `[${c.confidence.toUpperCase()}] ${c.language}/${c.kind} "${c.name}" at ${c.sourceFile}:${c.lineNumber}\n  ${c.rawValue.slice(0, 500)}`,
    )
    .join('\n\n')

  const snippets = buildCodeSnippets(topFiles.split('\n').map((l) => l.trim().split(' ')[0]), extractedPath)

  return `You are a casino game math analyzer. Your task is to extract the complete mathematical model of a slot game from its source code artifacts.

Game ID: ${gameId}
Game Name: ${gameName}

## Top Candidate Files (by math relevance score)
${topFiles}

## Extracted Math Candidates from Static Parser
${candidateSummary || '(No candidates extracted — analyze files directly)'}

## Source Code Snippets
${snippets}

## Required Output Schema
Return ONLY valid JSON matching this Zod schema definition:

${schemaDefinition}

## Rules
1. schemaVersion MUST be "${SCHEMA_VERSION}"
2. Every field you infer without direct source evidence MUST have an entry in the \`assumptions\` array:
   { field, assumedValue, reason, sourceEvidence: [], canBeImproved: boolean, improvementHint: string }
3. Any uncertain value MUST appear in \`warnings\` with: "field: reason for uncertainty"
4. NEVER invent reel strips, paytables, or paylines — if you cannot find them, leave them empty and add a warning
5. If reels are found, ALL symbol IDs in reel strips must appear in the \`symbols\` array
6. For paytable: keys are symbol IDs, values are objects mapping match count (as string) to payout multiplier
7. For paylines: each payline is an array of row indices (0-based), one per reel
8. sourceEvidence entries must reference actual file paths and line numbers from the provided artifacts
9. Return ONLY JSON — no markdown, no explanation, no code blocks

gameId in output must be: "${gameId}"`
}

function buildCodeSnippets(filePaths: string[], extractedPath: string): string {
  let total = 0
  const parts: string[] = []

  for (const rel of filePaths) {
    if (!rel || rel === '(score=0,') continue
    const abs = path.resolve(extractedPath, rel.replace(/^\//, ''))
    if (!fs.existsSync(abs)) continue

    try {
      const stat = fs.statSync(abs)
      if (stat.size > 500_000) continue // skip large files

      const content = fs.readFileSync(abs, 'utf8').slice(0, 6_000)
      const snippet = `\n--- ${rel} ---\n${content}\n`

      if (total + snippet.length > MAX_SNIPPET_CHARS) break

      parts.push(snippet)
      total += snippet.length
    } catch {
      // skip unreadable files
    }
  }

  return parts.join('\n') || '(No snippets available)'
}

// Build the JSON Schema representation of GameSchema for the prompt
export function buildSchemaDefinition(): string {
  return `{
  "schemaVersion": "${SCHEMA_VERSION}",
  "provider": "string (game provider/studio name)",
  "gameId": "string (use the provided gameId)",
  "gameName": "string (human-readable game title)",
  "gameType": "video-slot",
  "currencyMode": "credits | cash",
  "bet": {
    "defaultBet": "number (default total bet per spin)",
    "lines": "number (active paylines count)",
    "coinValue": "number (default 1)",
    "minBet": "number (optional)",
    "maxBet": "number (optional)"
  },
  "reels": [
    ["SYMBOL_ID", "SYMBOL_ID", ...],  // reel 0 strip (top to bottom)
    ["SYMBOL_ID", ...]                  // reel 1 strip
    // one array per reel
  ],
  "paylines": [
    [0, 1, 2, 1, 0],  // each array: row index per reel (0-based)
    [1, 1, 1, 1, 1]   // middle row
  ],
  "symbols": [
    { "id": "SYMBOL_ID", "name": "Display Name", "isWild": false, "isScatter": false, "displayName": "optional" }
  ],
  "paytable": {
    "SYMBOL_ID": { "3": 5, "4": 20, "5": 100 }
  },
  "wild": {
    "symbolId": "WILD_ID",
    "substitutesFor": [],
    "multiplier": 1,
    "restrictions": "optional description"
  },
  "scatter": {
    "symbolId": "SCATTER_ID",
    "triggerCount": 3,
    "awardType": "freeSpins | bonus | multiplier | cash",
    "pays": { "3": 2, "4": 5, "5": 20 }
  },
  "freeSpins": {
    "count": 10,
    "multiplier": 1,
    "retrigger": false,
    "retriggerCount": 5,
    "specialRules": "optional"
  },
  "bonus": {
    "description": "string",
    "triggerCondition": "string",
    "specialRules": "optional"
  },
  "buyBonus": {
    "costMultiplier": 100,
    "entryPoint": "freeSpins",
    "rtp": 0.96
  },
  "sourceEvidence": [
    {
      "filePath": "relative/path/to/file",
      "lineNumber": 42,
      "rawValue": "the actual extracted value",
      "confidence": "high | medium | low",
      "reasoning": "why this was extracted"
    }
  ],
  "warnings": ["field: reason string"],
  "assumptions": [
    {
      "field": "dotted.field.path",
      "assumedValue": "the assumed value",
      "reason": "why this was assumed",
      "sourceEvidence": [],
      "canBeImproved": true,
      "improvementHint": "Provide X file to confirm"
    }
  ]
}`
}
