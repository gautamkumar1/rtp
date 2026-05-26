import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { prisma } from '../db/client.js'
import { gameArtifactsPath, ensureDir } from '../lib/storage.js'

export type RtpVariantResult = {
  variantLabel: string
  declaredRtp: number | null
  totalRtp: number
  baseRtp: number
  freeSpinsRtp: number
  buyBonusRtp: number | null
  retriggerRtp: number | null
  featureTriggerFrequency: string | null
  avgFreeSpins: number | null
  hitRate: number | null
  notes: string | null
}

export type RtpAnalysisResult = {
  gameId: string
  gameName: string
  gameType: string
  mechanic: string
  reelConfig: string
  analysisMethod: 'analytical' | 'simulation' | 'hybrid'
  variants: RtpVariantResult[]
  gameLogicSummary: string
  rawThinking: string | null
  rawResponse: string
  completedAt: string
}

export type RtpAnalysisStatus = 'idle' | 'running' | 'complete' | 'failed'

const SYSTEM_PROMPT = `You are an expert slot game mathematician and game logic analyst with deep knowledge of RTP (Return to Player) calculation for casino slot games. You specialize in:
- Reading Java, JavaScript, and C++ slot game source code
- Extracting reel strips, paytable definitions, and game logic from source files
- Computing exact analytical RTP using probability theory
- Breaking down RTP by game component: base game, free spins, re-triggers, buy bonus

When analyzing source code, you will:
1. Identify all reel strips for each game mode/variant
2. Extract the exact paytable (symbol pays by count)
3. Understand win evaluation logic (paylines vs ways, left-to-right vs both directions)
4. Identify scatter triggers, free spin counts, multipliers, and re-trigger rules
5. Calculate RTP analytically using exact combinatorics where possible
6. Return results in strict JSON format as specified`

function buildAnalysisPrompt(params: {
  gameName: string
  gameFiles: { path: string; content: string }[]
  extractedSchema: string
  variantLabels: string[]
}): string {
  const { gameName, gameFiles, extractedSchema, variantLabels } = params

  const filesSection = gameFiles.map(f =>
    `=== FILE: ${f.path} ===\n${f.content}`
  ).join('\n\n')

  const variantSection = variantLabels.length > 0
    ? `Known variants: ${variantLabels.join(', ')}`
    : 'Variants: analyze all modes found in the source'

  return `Please perform deep game logic analysis of the following slot game source code and calculate the RTP analytically.

Game Name: ${gameName}
${variantSection}

Pre-extracted schema (use as reference, but re-derive from source for accuracy):
${extractedSchema}

Source Files:
${filesSection}

TASK:
1. Identify all reel strips for each game mode/variant
2. Extract the complete paytable
3. Understand all win mechanics (ways/paylines, wilds, scatters)
4. Identify free spin features: trigger conditions, spin counts, multipliers, re-trigger rules
5. Identify buy bonus features if present
6. Calculate RTP for each variant analytically — use exact enumeration or probability trees
7. Break down each variant's RTP into: base game RTP, free spins RTP (initial + re-trigger separately), buy bonus RTP

Return your answer as a JSON object with this exact structure:
{
  "gameType": "string (e.g. '5-reel 3-row ways slot')",
  "mechanic": "string (e.g. 'ways' or 'paylines')",
  "reelConfig": "string (e.g. '5x3, 243 ways')",
  "analysisMethod": "analytical",
  "gameLogicSummary": "string — 3-5 sentences summarizing key mechanics",
  "variants": [
    {
      "variantLabel": "string (e.g. 'R90', 'R93_Buy')",
      "declaredRtp": number or null (0-1 scale, e.g. 0.90),
      "totalRtp": number (0-1 scale),
      "baseRtp": number (0-1 scale),
      "freeSpinsRtp": number (0-1 scale, combined initial + re-trigger),
      "buyBonusRtp": number or null (0-1 scale, null if no buy bonus),
      "retriggerRtp": number or null (0-1 scale, the re-trigger contribution only),
      "featureTriggerFrequency": "string (e.g. '1 in 290 spins') or null",
      "avgFreeSpins": number or null (expected free spins per trigger including re-triggers),
      "hitRate": number or null (0-1 scale),
      "notes": "string or null — any important observations about this variant"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation outside the JSON.`
}

export async function runRtpAnalysis(gameId: string): Promise<RtpAnalysisResult> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      variants: { select: { id: true, variantLabel: true, declaredRtp: true } },
    },
  })

  // Mark as running
  await prisma.game.update({
    where: { id: gameId },
    data: { rtpAnalysisStatus: 'running', rtpAnalysisJson: null },
  })

  const artifactsDir = gameArtifactsPath(gameId)
  ensureDir(artifactsDir)

  // Load extracted schema for reference
  const normalizedPath = path.join(artifactsDir, 'normalized-schema.json')
  const extractedSchema = fs.existsSync(normalizedPath)
    ? fs.readFileSync(normalizedPath, 'utf8')
    : JSON.stringify(game.normalizedSchemaJson ?? {}, null, 2)

  // Load actual source files from the extracted path
  const gameFiles: { path: string; content: string }[] = []
  const extractedPath = game.extractedPath
  if (extractedPath && fs.existsSync(extractedPath)) {
    const collected = collectSourceFiles(extractedPath, extractedPath)
    gameFiles.push(...collected)
  }

  // Fallback: load candidate files from analysis artifacts
  if (gameFiles.length === 0) {
    const candidatesPath = path.join(artifactsDir, 'ast-candidates.json')
    if (fs.existsSync(candidatesPath)) {
      try {
        const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8')) as Array<{ sourceFile: string }>
        const seen = new Set<string>()
        for (const c of candidates) {
          if (c.sourceFile && !seen.has(c.sourceFile) && fs.existsSync(c.sourceFile)) {
            seen.add(c.sourceFile)
            gameFiles.push({
              path: path.relative(extractedPath ?? '', c.sourceFile),
              content: fs.readFileSync(c.sourceFile, 'utf8'),
            })
          }
        }
      } catch {}
    }
  }

  const variantLabels = game.variants.map(v => v.variantLabel).filter(Boolean) as string[]

  const prompt = buildAnalysisPrompt({
    gameName: game.name,
    gameFiles,
    extractedSchema,
    variantLabels,
  })

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await client.chat.completions.create({
    model: 'o3',
    reasoning_effort: 'high',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  } as Parameters<typeof client.chat.completions.create>[0])

  const rawResponse = response.choices[0]?.message?.content ?? ''
  const rawThinking = (response.choices[0]?.message as Record<string, unknown>)?.reasoning_content as string ?? null

  // Parse the JSON response
  let parsed: Record<string, unknown>
  try {
    // Strip markdown code fences if present
    const cleaned = rawResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // Try to extract JSON from within the response
    const match = rawResponse.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error(`o3 response was not valid JSON: ${rawResponse.slice(0, 200)}`)
    }
    parsed = JSON.parse(match[0])
  }

  const variantsRaw = (parsed['variants'] as RtpVariantResult[]) ?? []

  // Enrich with declaredRtp from our DB if o3 didn't include it
  const enrichedVariants: RtpVariantResult[] = variantsRaw.map(v => {
    const dbVariant = game.variants.find(dv =>
      dv.variantLabel?.toLowerCase() === v.variantLabel?.toLowerCase()
    )
    return {
      ...v,
      declaredRtp: v.declaredRtp ?? dbVariant?.declaredRtp ?? null,
    }
  })

  const result: RtpAnalysisResult = {
    gameId,
    gameName: game.name,
    gameType: String(parsed['gameType'] ?? ''),
    mechanic: String(parsed['mechanic'] ?? ''),
    reelConfig: String(parsed['reelConfig'] ?? ''),
    analysisMethod: (parsed['analysisMethod'] as 'analytical' | 'simulation' | 'hybrid') ?? 'analytical',
    variants: enrichedVariants,
    gameLogicSummary: String(parsed['gameLogicSummary'] ?? ''),
    rawThinking,
    rawResponse,
    completedAt: new Date().toISOString(),
  }

  // Persist
  await prisma.game.update({
    where: { id: gameId },
    data: {
      rtpAnalysisStatus: 'complete',
      rtpAnalysisJson: result as never,
    },
  })

  // Save raw response to disk for debugging
  const rawPath = path.join(artifactsDir, 'rtp-analysis-raw.json')
  fs.writeFileSync(rawPath, JSON.stringify({ rawResponse, rawThinking, result }, null, 2))

  return result
}

// Recursively collect source files up to a total size limit
function collectSourceFiles(
  dir: string,
  baseDir: string,
  maxFiles = 40,
  maxTotalBytes = 800_000,
): { path: string; content: string }[] {
  const SOURCE_EXTS = new Set(['.java', '.js', '.ts', '.cs', '.cpp', '.py', '.json', '.xml', '.properties', '.config'])
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '__pycache__', '.idea'])

  const results: { path: string; content: string }[] = []
  let totalBytes = 0

  function walk(current: string) {
    if (results.length >= maxFiles || totalBytes >= maxTotalBytes) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch { return }

    for (const entry of entries) {
      if (results.length >= maxFiles || totalBytes >= maxTotalBytes) break
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (!SOURCE_EXTS.has(ext)) continue
        try {
          const stat = fs.statSync(full)
          if (stat.size > 200_000) continue // skip huge files
          const content = fs.readFileSync(full, 'utf8')
          totalBytes += content.length
          if (totalBytes > maxTotalBytes) break
          results.push({ path: path.relative(baseDir, full), content })
        } catch {}
      }
    }
  }

  walk(dir)
  return results
}
