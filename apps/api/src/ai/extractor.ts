import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import {
  validateGameSchema,
  safeValidateGameSchema,
  assertSimulationReady,
  type GameSchema,
} from '@rtp/game-schema'
import { buildExtractionPrompt, buildSchemaDefinition } from './prompt-builder.js'
import type { AstCandidate } from '../parser/types.js'
import type { CandidateFile } from '../parser/classifier.js'
import { gameArtifactsPath, ensureDir } from '../lib/storage.js'

export type ExtractionResult = {
  schema: GameSchema
  validationErrors: string[]
  warnings: string[]
  rawResponsePath: string
  normalizedSchemaPath: string
}

export async function runAiExtraction(params: {
  gameId: string
  gameName: string
  candidateFiles: CandidateFile[]
  astCandidates: AstCandidate[]
  extractedPath: string
}): Promise<ExtractionResult> {
  const { gameId, gameName, candidateFiles, astCandidates, extractedPath } = params

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const schemaDefinition = buildSchemaDefinition()

  const prompt = buildExtractionPrompt({
    gameId,
    gameName,
    candidateFiles,
    astCandidates,
    extractedPath,
    schemaDefinition,
  })

  const artifactsDir = gameArtifactsPath(gameId)
  ensureDir(artifactsDir)

  let rawResponse: string
  let parsedJson: unknown

  // First attempt
  try {
    rawResponse = await callOpenAI(client, prompt)
    parsedJson = JSON.parse(rawResponse)
  } catch (err) {
    throw new Error(`OpenAI call or JSON parse failed on first attempt: ${String(err)}`)
  }

  // Normalize AI output before validation: fix known field-name mismatches.
  parsedJson = normalizeAiOutput(parsedJson)

  // Validate against GameSchema
  let validationResult = safeValidateGameSchema(parsedJson)

  // Retry once with error context if validation failed
  if (!validationResult.success) {
    const errorSummary = validationResult.error.errors
      .slice(0, 10)
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('\n')

    const retryPrompt = `${prompt}

## Previous attempt validation errors (fix these):
${errorSummary}

Return corrected JSON only.`

    try {
      rawResponse = await callOpenAI(client, retryPrompt)
      parsedJson = normalizeAiOutput(JSON.parse(rawResponse))
      validationResult = safeValidateGameSchema(parsedJson)
    } catch (err) {
      // Continue with partial schema + warnings
      console.error(`AI retry failed: ${String(err)}`)
    }
  }

  const rawPath = path.join(artifactsDir, 'ai-raw.json')
  fs.writeFileSync(rawPath, JSON.stringify(parsedJson, null, 2))

  let schema: GameSchema
  const extractionWarnings: string[] = []

  if (validationResult.success) {
    schema = validationResult.data
  } else {
    // Build partial schema with warnings for all validation failures
    const validationErrors = validationResult.error.errors.map(
      (e) => `${e.path.join('.')}: ${e.message}`,
    )
    extractionWarnings.push(
      ...validationErrors.map((e) => `Schema validation failed — ${e}`),
    )

    // Attempt to coerce a partial schema
    schema = buildPartialSchema(parsedJson, gameId, gameName, extractionWarnings)
  }

  // Run simulation readiness checks
  const simErrors = assertSimulationReady(schema)
  if (simErrors.length > 0) {
    schema.warnings.push(...simErrors.map((e) => `Simulation blocker: ${e}`))
  }

  const normalizedPath = path.join(artifactsDir, 'normalized-schema.json')
  fs.writeFileSync(normalizedPath, JSON.stringify(schema, null, 2))

  return {
    schema,
    validationErrors: extractionWarnings,
    warnings: schema.warnings,
    rawResponsePath: rawPath,
    normalizedSchemaPath: normalizedPath,
  }
}

async function callOpenAI(client: OpenAI, prompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a casino game math extraction expert. Return only valid JSON matching the exact schema provided. Never invent data — mark uncertainty with warnings and assumptions.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0,
    max_tokens: 16_000,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Empty response from OpenAI')
  return content
}

// Build a best-effort partial schema when validation fails
function buildPartialSchema(
  raw: unknown,
  gameId: string,
  gameName: string,
  warnings: string[],
): GameSchema {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  // Normalize randomScatterInject: AI may output "weights" instead of "baseWeights"
  let randomScatterInject = obj['randomScatterInject'] as Record<string, unknown> | undefined
  if (randomScatterInject && !randomScatterInject['baseWeights'] && randomScatterInject['weights']) {
    randomScatterInject = { ...randomScatterInject, baseWeights: randomScatterInject['weights'] }
    delete randomScatterInject['weights']
  }

  const partial = {
    schemaVersion: '0.1.0' as const,
    provider: (obj['provider'] as string) || 'unknown',
    gameId,
    gameName,
    gameType: 'video-slot' as const,
    currencyMode: 'credits' as const,
    mechanic: (obj['mechanic'] as 'paylines' | 'ways') || 'paylines',
    bet: (obj['bet'] as GameSchema['bet']) || { defaultBet: 1, lines: 1, coinValue: 1 },
    reels: Array.isArray(obj['reels']) ? (obj['reels'] as string[][]) : [],
    paylines: Array.isArray(obj['paylines']) ? (obj['paylines'] as number[][]) : [],
    symbols: Array.isArray(obj['symbols']) ? (obj['symbols'] as GameSchema['symbols']) : [],
    paytable: (obj['paytable'] as GameSchema['paytable']) || {},
    wild: obj['wild'] as GameSchema['wild'],
    scatter: obj['scatter'] as GameSchema['scatter'],
    freeSpins: obj['freeSpins'] as GameSchema['freeSpins'],
    bonus: obj['bonus'] as GameSchema['bonus'],
    buyBonus: obj['buyBonus'] as GameSchema['buyBonus'],
    tumble: obj['tumble'] as GameSchema['tumble'],
    randomScatterInject: randomScatterInject as GameSchema['randomScatterInject'],
    bonusMultiplier: obj['bonusMultiplier'] as GameSchema['bonusMultiplier'],
    declaredRtp: obj['declaredRtp'] as number | undefined,
    variantLabel: obj['variantLabel'] as string | undefined,
    variants: obj['variants'] as GameSchema['variants'],
    sourceEvidence: Array.isArray(obj['sourceEvidence'])
      ? (obj['sourceEvidence'] as GameSchema['sourceEvidence'])
      : [],
    warnings: [
      ...warnings,
      ...(Array.isArray(obj['warnings']) ? (obj['warnings'] as string[]) : []),
    ],
    assumptions: Array.isArray(obj['assumptions'])
      ? (obj['assumptions'] as GameSchema['assumptions'])
      : [],
  }

  // Use validateGameSchema with strip to get whatever passes
  try {
    return validateGameSchema(partial)
  } catch {
    warnings.push('Could not produce a valid schema even after partial coercion — schema is incomplete')
    return partial as GameSchema
  }
}

// Fix known field-name mismatches the AI produces due to schema template errors.
function normalizeAiOutput(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const obj = raw as Record<string, unknown>

  // randomScatterInject.weights → baseWeights (AI uses "weights" from old template)
  if (obj['randomScatterInject'] && typeof obj['randomScatterInject'] === 'object') {
    const rsi = obj['randomScatterInject'] as Record<string, unknown>
    if (!rsi['baseWeights'] && rsi['weights']) {
      obj['randomScatterInject'] = { ...rsi, baseWeights: rsi['weights'] }
      delete (obj['randomScatterInject'] as Record<string, unknown>)['weights']
    }
  }

  // variants[].scatterWeights may also use "weights" key — normalize each variant
  if (Array.isArray(obj['variants'])) {
    obj['variants'] = (obj['variants'] as Record<string, unknown>[]).map((v) => {
      if (!v['scatterWeights'] && v['weights']) {
        return { ...v, scatterWeights: v['weights'] }
      }
      return v
    })
  }

  return obj
}
