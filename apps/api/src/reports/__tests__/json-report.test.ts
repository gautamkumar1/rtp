import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { GameSchema } from '@rtp/game-schema'
import type { SimulationResult } from '../../simulation/client.js'

// Mock prisma client used by buildJsonReport.
const mockGame = vi.fn()
const mockSimulation = vi.fn()

vi.mock('../../db/client.js', () => ({
  prisma: {
    game: { findUniqueOrThrow: (...args: unknown[]) => mockGame(...args) },
    simulation: { findUniqueOrThrow: (...args: unknown[]) => mockSimulation(...args) },
  },
}))

function makeSchema(overrides: Partial<GameSchema> = {}): GameSchema {
  return {
    schemaVersion: '0.1.0',
    provider: 'TestCo',
    gameId: 'game-1',
    gameName: 'Test Slot',
    gameType: 'video-slot',
    currencyMode: 'credits',
    bet: { defaultBet: 1, lines: 10, coinValue: 1 },
    reels: [
      ['A', 'B', 'A', 'WILD'],
      ['B', 'A', 'B', 'A'],
      ['A', 'A', 'B', 'B'],
    ],
    paylines: [[0, 0, 0], [1, 1, 1]],
    symbols: [
      { id: 'A', name: 'Apple', isWild: false, isScatter: false },
      { id: 'B', name: 'Bell', isWild: false, isScatter: false },
      { id: 'WILD', name: 'Wild', isWild: true, isScatter: false },
    ],
    paytable: { A: { '3': 10 }, B: { '3': 5 } },
    wild: { symbolId: 'WILD', substitutesFor: ['A', 'B'], multiplier: 1 },
    sourceEvidence: [
      { filePath: 'src/reels.go', lineNumber: 12, rawValue: '[A B A]', confidence: 'high', reasoning: 'literal' },
    ],
    warnings: ['no free spins detected'],
    assumptions: [
      {
        field: 'bet.coinValue',
        assumedValue: 1,
        reason: 'no explicit coin value in source',
        sourceEvidence: [],
        canBeImproved: true,
        improvementHint: 'check config.json',
      },
    ],
    ...overrides,
  }
}

function makeSim(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    totalSpins: 1_000_000,
    totalBet: 1_000_000,
    totalReturn: 960_000,
    rtp: 0.96,
    baseRtp: 0.90,
    featureRtp: { freeSpins: 0.06, bonus: 0, buyBonus: 0 },
    hitRate: 0.32,
    variance: 5.5,
    standardDeviation: Math.sqrt(5.5),
    confidence90Low: 0.9598,
    confidence90High: 0.9602,
    confidence95Low: 0.9596,
    confidence95High: 0.9604,
    featureTriggerCount: 1234,
    symbolHitProbabilities: {
      maxCount: 3,
      totalSpins: 1_000_000,
      bySymbol: [{ symbol: 'A', hits: [0, 0, 100], probs: [0, 0, 0.0001] }],
      scatterHits: [0],
      scatterProbs: [0],
      wildAssistedWins: 0,
      wildAssistRate: 0,
    },
    warnings: [],
    config: { spinCount: 1_000_000, rows: 3, seed: 0, simulateBuyBonus: false },
    durationMs: 8000,
    ...overrides,
  }
}

describe('buildJsonReport', () => {
  let tmpStorage: string

  beforeEach(() => {
    tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-report-'))
    process.env.STORAGE_BASE_PATH = tmpStorage
    mockGame.mockReset()
    mockSimulation.mockReset()
  })

  afterEach(() => {
    fs.rmSync(tmpStorage, { recursive: true, force: true })
    delete process.env.STORAGE_BASE_PATH
  })

  function seed(schema: GameSchema, sim: SimulationResult, simId = 'sim-1', gameId = 'game-1') {
    const artifactsDir = path.join(tmpStorage, 'artifacts', gameId)
    fs.mkdirSync(artifactsDir, { recursive: true })
    const outPath = path.join(artifactsDir, 'simulation-output.json')
    fs.writeFileSync(outPath, JSON.stringify(sim))
    fs.writeFileSync(path.join(artifactsDir, 'game-mechanics.md'), '# Mechanics\nplain english.')

    mockGame.mockResolvedValue({
      id: gameId,
      originalFileName: 'test-slot.zip',
      createdAt: new Date('2026-01-15T00:00:00Z'),
      normalizedSchemaJson: schema as unknown,
      analysisRuns: [
        {
          astCandidatesJson: [{ language: 'go' }, { language: 'java' }, { language: 'go' }],
          fileTreeJson: [{ relativePath: 'a' }, { relativePath: 'b' }, { relativePath: 'c' }],
        },
      ],
    })
    mockSimulation.mockResolvedValue({ id: simId, gameId, rawOutputPath: outPath })

    return { outPath, gameId, simId }
  }

  it('assembles a labeled report and writes report.json', async () => {
    const { buildJsonReport } = await import('../json-report.js')
    const { simId, gameId } = seed(makeSchema(), makeSim())

    const { report, jsonPath } = await buildJsonReport({ gameId, simulationId: simId })

    expect(jsonPath).toBe(path.join(tmpStorage, 'reports', gameId, 'report.json'))
    expect(fs.existsSync(jsonPath)).toBe(true)

    expect(report.schemaVersion).toBe('1.0.0')
    expect(report.overview.gameName).toEqual({ value: 'Test Slot', source: 'extracted' })
    expect(report.overview.detectedLanguages.value).toEqual(['go', 'java'])
    expect(report.overview.fileCount.value).toBe(3)

    expect(report.math.reels.source).toBe('extracted')
    expect(report.math.reels.value).toHaveLength(3)
    expect(report.math.reels.value[0].symbolCounts).toEqual({ A: 2, B: 1, WILD: 1 })
    expect(report.math.weightTable.value[0]).toMatchObject({ reelIndex: 0, total: 4 })

    expect(report.features.wild.source).toBe('extracted')
    expect(report.features.scatter.source).toBe('warning')

    expect(report.simulation.rtp.source).toBe('simulation-result')
    expect(report.simulation.rtp.value.total).toBeCloseTo(0.96)
    expect(report.simulation.statistics.value.confidence90.halfWidth).toBeCloseTo(0.0002, 5)
    expect(report.simulation.statistics.value.confidence95.halfWidth).toBeCloseTo(0.0004, 5)

    expect(report.warnings).toContain('no free spins detected')
    expect(report.assumptions).toHaveLength(1)
    expect(report.assumptions[0].canBeImproved).toBe(true)
    expect(report.sourceEvidence).toHaveLength(1)

    expect(report.confidence.schemaValidationOk).toBe(true)
    expect(report.confidence.convergenceOk).toBe(true)
    expect(report.confidence.verdict).toBe('WARN') // 1 warning present
  })

  it('emits FAIL when schema validation fails or RTP is invalid', async () => {
    const { buildJsonReport } = await import('../json-report.js')
    const broken = makeSchema({ paytable: {} })
    const { simId, gameId } = seed(broken, makeSim())

    const { report } = await buildJsonReport({ gameId, simulationId: simId })
    expect(report.confidence.schemaValidationOk).toBe(false)
    expect(report.confidence.verdict).toBe('FAIL')
  })

  it('emits PASS only when no warnings, schema OK, and converged', async () => {
    const { buildJsonReport } = await import('../json-report.js')
    const clean = makeSchema({ warnings: [] })
    const { simId, gameId } = seed(clean, makeSim())

    const { report } = await buildJsonReport({ gameId, simulationId: simId })
    expect(report.confidence.verdict).toBe('PASS')
  })

  it('marks convergenceOk=false when 95% CI half-width exceeds 0.5% of RTP', async () => {
    const { buildJsonReport } = await import('../json-report.js')
    const sim = makeSim({ confidence95Low: 0.94, confidence95High: 0.98 }) // half-width 0.02 vs 0.5% of 0.96 = 0.0048
    const { simId, gameId } = seed(makeSchema({ warnings: [] }), sim)

    const { report } = await buildJsonReport({ gameId, simulationId: simId })
    expect(report.confidence.convergenceOk).toBe(false)
    expect(report.confidence.verdict).toBe('WARN')
  })

  it('throws when simulation output file is missing', async () => {
    const { buildJsonReport } = await import('../json-report.js')
    const { simId, gameId, outPath } = seed(makeSchema(), makeSim())
    fs.unlinkSync(outPath)

    await expect(buildJsonReport({ gameId, simulationId: simId })).rejects.toThrow(/simulation-output\.json not found/)
  })

  it('refuses if simulationId belongs to a different game', async () => {
    const { buildJsonReport } = await import('../json-report.js')
    seed(makeSchema(), makeSim())
    mockSimulation.mockResolvedValue({ id: 'sim-1', gameId: 'other-game', rawOutputPath: '/tmp/x' })

    await expect(buildJsonReport({ gameId: 'game-1', simulationId: 'sim-1' })).rejects.toThrow(/does not belong/)
  })
})
