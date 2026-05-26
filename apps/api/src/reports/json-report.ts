import fs from 'fs'
import path from 'path'
import { prisma } from '../db/client.js'
import { gameReportsPath, gameArtifactsPath, ensureDir } from '../lib/storage.js'
import { assertSimulationReady } from '@rtp/game-schema'
import type { GameSchema } from '@rtp/game-schema'
import type { SimulationResult } from '../simulation/client.js'
import type {
  GameReport,
  Labeled,
  Provenance,
  ReportConfidence,
  ReportReelSummary,
  Verdict,
} from './types.js'

function label<T>(value: T, source: Provenance, note?: string): Labeled<T> {
  return note ? { value, source, note } : { value, source }
}

function detectLanguages(astCandidates: unknown): string[] {
  if (!Array.isArray(astCandidates)) return []
  const langs = new Set<string>()
  for (const c of astCandidates as Array<{ language?: unknown }>) {
    if (c && typeof c.language === 'string' && c.language.length > 0) {
      langs.add(c.language)
    }
  }
  return Array.from(langs).sort()
}

function reelSummaries(schema: GameSchema): ReportReelSummary[] {
  return schema.reels.map((reel, i) => {
    const counts: Record<string, number> = {}
    for (const s of reel) counts[s] = (counts[s] ?? 0) + 1
    return { reelIndex: i, length: reel.length, symbols: reel, symbolCounts: counts }
  })
}

function weightTable(schema: GameSchema): Array<{ reelIndex: number; counts: Record<string, number>; total: number }> {
  return schema.reels.map((reel, i) => {
    const counts: Record<string, number> = {}
    for (const s of reel) counts[s] = (counts[s] ?? 0) + 1
    return { reelIndex: i, counts, total: reel.length }
  })
}

function deriveVerdict(args: {
  schemaErrors: string[]
  warnings: string[]
  convergenceOk: boolean
  rtp: number
  declaredRtp?: number | null
}): { verdict: Verdict; reasons: string[] } {
  const reasons: string[] = []
  if (args.schemaErrors.length > 0) {
    reasons.push(`schema validation failed: ${args.schemaErrors.length} error(s)`)
  }
  if (!Number.isFinite(args.rtp) || args.rtp <= 0) {
    reasons.push('simulation RTP is not a positive finite number')
  }

  // Declared RTP check: FAIL if simulated RTP deviates by more than ±0.1%.
  if (args.declaredRtp != null && Number.isFinite(args.rtp) && args.rtp > 0) {
    const delta = Math.abs(args.rtp - args.declaredRtp)
    if (delta > 0.001) {
      reasons.push(
        `simulated RTP ${(args.rtp * 100).toFixed(3)}% deviates from declared ${(args.declaredRtp * 100).toFixed(3)}% by ${(delta * 100).toFixed(3)}% (tolerance ±0.1%)`,
      )
    }
  }

  const fail = reasons.length > 0
  if (fail) return { verdict: 'FAIL', reasons }

  if (!args.convergenceOk) {
    reasons.push('simulation has not converged: 95% CI half-width > 0.5% of RTP')
  }
  if (args.warnings.length > 0) {
    reasons.push(`${args.warnings.length} warning(s) raised during analysis`)
  }
  if (args.declaredRtp != null) {
    reasons.push(`declared RTP ${(args.declaredRtp * 100).toFixed(2)}% verified within ±0.1%`)
  }
  if (reasons.filter((r) => !r.startsWith('declared RTP')).length > 0) return { verdict: 'WARN', reasons }
  reasons.push('all checks passed')
  return { verdict: 'PASS', reasons }
}

/**
 * Compute whether the simulation has converged.
 * Convention from Phase 5.8: warn when 95% CI half-width > 0.5% of RTP.
 */
function isConverged(result: SimulationResult): boolean {
  if (!Number.isFinite(result.rtp) || result.rtp <= 0) return false
  const hw = (Number(result.confidence95High) - Number(result.confidence95Low)) / 2
  return hw <= Number(result.rtp) * 0.005
}

export interface BuildReportParams {
  gameId: string
  simulationId: string
}

export interface BuildReportResult {
  report: GameReport
  jsonPath: string
}

/**
 * Assemble the full report object for a game + simulation. Persists JSON to
 * disk and (caller-coordinated) returns the in-memory report for the
 * Excel/PDF builders to consume without re-loading anything.
 */
export async function buildJsonReport(params: BuildReportParams): Promise<BuildReportResult> {
  const { gameId, simulationId } = params

  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { analysisRuns: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const sim = await prisma.simulation.findUniqueOrThrow({ where: { id: simulationId } })
  if (sim.gameId !== gameId) {
    throw new Error(`simulation ${simulationId} does not belong to game ${gameId}`)
  }

  const schema = game.normalizedSchemaJson as unknown as GameSchema | null
  if (!schema) throw new Error(`game ${gameId} has no normalized schema`)

  const artifactsDir = gameArtifactsPath(gameId)
  const simOutputPath = sim.rawOutputPath ?? path.join(artifactsDir, 'simulation-output.json')
  if (!fs.existsSync(simOutputPath)) {
    throw new Error(`simulation-output.json not found at ${simOutputPath}`)
  }
  const simResult = JSON.parse(fs.readFileSync(simOutputPath, 'utf8')) as SimulationResult

  const mechanicsPath = path.join(artifactsDir, 'game-mechanics.md')
  const mechanics = fs.existsSync(mechanicsPath) ? fs.readFileSync(mechanicsPath, 'utf8') : ''

  const analysisRun = game.analysisRuns[0]
  const detectedLangs = detectLanguages(analysisRun?.astCandidatesJson)
  const fileTree = analysisRun?.fileTreeJson
  const fileCount = Array.isArray(fileTree) ? fileTree.length : null

  const reels = reelSummaries(schema)
  const weights = weightTable(schema)

  const schemaErrors = assertSimulationReady(schema)
  const convergenceOk = isConverged(simResult)
  const warnings = [...(schema.warnings ?? []), ...(simResult.warnings ?? [])]
  // Use declaredRtp from the game row (set on variants or the main game schema).
  const declaredRtp = (game.declaredRtp ?? (schema as { declaredRtp?: number }).declaredRtp) ?? null
  const { verdict, reasons } = deriveVerdict({
    schemaErrors,
    warnings,
    convergenceOk,
    rtp: Number(simResult.rtp),
    declaredRtp,
  })

  const confidence: ReportConfidence = {
    schemaValidationOk: schemaErrors.length === 0,
    schemaValidationErrors: schemaErrors,
    warningCount: warnings.length,
    assumptionCount: schema.assumptions?.length ?? 0,
    convergenceOk,
    verdict,
    verdictReasons: reasons,
  }

  const report: GameReport = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    overview: {
      gameId: label(schema.gameId, 'extracted'),
      gameName: label(schema.gameName, 'extracted'),
      provider: label(schema.provider, 'extracted'),
      gameType: label(schema.gameType, 'extracted'),
      originalFileName: label(game.originalFileName, 'extracted'),
      uploadedAt: label(game.createdAt.toISOString(), 'extracted'),
      fileCount: label(fileCount, 'extracted'),
      detectedLanguages: label(detectedLangs, 'extracted'),
    },
    mechanics: label(mechanics, 'ai-inferred', 'human-readable explanation generated by AI'),
    math: {
      reels: label(reels, 'extracted'),
      paylines: label(schema.paylines, 'extracted'),
      symbols: label(
        schema.symbols.map((s) => ({ id: s.id, name: s.name, isWild: s.isWild, isScatter: s.isScatter })),
        'extracted',
      ),
      paytable: label(schema.paytable, 'extracted'),
      weightTable: label(weights, 'extracted', 'symbol frequency per reel, derived from reel strips'),
      bet: label(
        { defaultBet: schema.bet.defaultBet, lines: schema.bet.lines, coinValue: schema.bet.coinValue },
        'extracted',
      ),
    },
    features: {
      wild: label(
        schema.wild
          ? {
              symbolId: schema.wild.symbolId,
              substitutesFor: schema.wild.substitutesFor,
              multiplier: schema.wild.multiplier,
            }
          : null,
        schema.wild ? 'extracted' : 'warning',
      ),
      scatter: label(
        schema.scatter
          ? {
              symbolId: schema.scatter.symbolId,
              triggerCount: schema.scatter.triggerCount,
              awardType: schema.scatter.awardType,
            }
          : null,
        schema.scatter ? 'extracted' : 'warning',
      ),
      freeSpins: label(
        schema.freeSpins
          ? {
              count: schema.freeSpins.count,
              multiplier: schema.freeSpins.multiplier,
              retrigger: schema.freeSpins.retrigger,
              retriggerCount: schema.freeSpins.retriggerCount,
            }
          : null,
        schema.freeSpins ? 'extracted' : 'warning',
      ),
      bonus: label(
        schema.bonus
          ? { description: schema.bonus.description, triggerCondition: schema.bonus.triggerCondition }
          : null,
        schema.bonus ? 'extracted' : 'warning',
      ),
      buyBonus: label(
        schema.buyBonus
          ? { costMultiplier: schema.buyBonus.costMultiplier, entryPoint: schema.buyBonus.entryPoint }
          : null,
        schema.buyBonus ? 'extracted' : 'warning',
      ),
    },
    simulation: {
      config: label(simResult.config, 'simulation-result'),
      rtp: label(
        {
          total: simResult.rtp,
          base: simResult.baseRtp,
          freeSpins: simResult.featureRtp.freeSpins,
          bonus: simResult.featureRtp.bonus,
          buyBonus: simResult.featureRtp.buyBonus,
        },
        'simulation-result',
      ),
      statistics: label(
        {
          totalSpins: simResult.totalSpins,
          totalBet: simResult.totalBet,
          totalReturn: simResult.totalReturn,
          hitRate: simResult.hitRate,
          variance: simResult.variance,
          standardDeviation: simResult.standardDeviation,
          confidence90: {
            low: simResult.confidence90Low,
            high: simResult.confidence90High,
            halfWidth: (simResult.confidence90High - simResult.confidence90Low) / 2,
          },
          confidence95: {
            low: simResult.confidence95Low,
            high: simResult.confidence95High,
            halfWidth: (simResult.confidence95High - simResult.confidence95Low) / 2,
          },
          featureTriggerCount: simResult.featureTriggerCount,
          durationMs: simResult.durationMs,
        },
        'simulation-result',
      ),
      symbolHitProbabilities: label(simResult.symbolHitProbabilities, 'simulation-result'),
      buyBonus: label(simResult.buyBonus ?? null, simResult.buyBonus ? 'simulation-result' : 'warning'),
    },
    warnings,
    assumptions: (schema.assumptions ?? []).map((a) => ({
      field: a.field,
      assumedValue: a.assumedValue,
      reason: a.reason,
      canBeImproved: a.canBeImproved,
      improvementHint: a.improvementHint,
    })),
    sourceEvidence: (schema.sourceEvidence ?? []).map((e) => ({
      filePath: e.filePath,
      lineNumber: e.lineNumber,
      rawValue: e.rawValue,
      confidence: e.confidence,
      reasoning: e.reasoning,
    })),
    confidence,
  }

  const reportsDir = gameReportsPath(gameId)
  ensureDir(reportsDir)
  const jsonPath = path.join(reportsDir, 'report.json')
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  return { report, jsonPath }
}
