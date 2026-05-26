import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { GameSchema } from '@rtp/game-schema'
import type { SimulationResult } from '../../simulation/client.js'

// Mock prisma — used for findUniqueOrThrow + report.create + game.update.
const mockGameFind = vi.fn()
const mockSimFind = vi.fn()
const mockGameUpdate = vi.fn()
const mockReportCreate = vi.fn()

vi.mock('../../db/client.js', () => ({
  prisma: {
    game: {
      findUniqueOrThrow: (...args: unknown[]) => mockGameFind(...args),
      update: (...args: unknown[]) => mockGameUpdate(...args),
    },
    simulation: {
      findUniqueOrThrow: (...args: unknown[]) => mockSimFind(...args),
    },
    report: {
      create: (...args: unknown[]) => mockReportCreate(...args),
    },
  },
}))

function makeSchema(): GameSchema {
  return {
    schemaVersion: '0.1.0',
    provider: 'TestCo',
    gameId: 'g1',
    gameName: 'Generator Slot',
    gameType: 'video-slot',
    currencyMode: 'credits',
    mechanic: 'paylines' as const,
    bet: { defaultBet: 1, lines: 10, coinValue: 1 },
    reels: [['A', 'B', 'A'], ['B', 'A', 'B'], ['A', 'A', 'B']],
    paylines: [[0, 0, 0]],
    symbols: [
      { id: 'A', name: 'A', isWild: false, isScatter: false },
      { id: 'B', name: 'B', isWild: false, isScatter: false },
    ],
    paytable: { A: { '3': 10 }, B: { '3': 5 } },
    sourceEvidence: [],
    warnings: [],
    assumptions: [],
  }
}

function makeSim(): SimulationResult {
  return {
    totalSpins: 1_000_000,
    totalBet: 1_000_000,
    totalReturn: 960_000,
    rtp: 0.96,
    baseRtp: 0.96,
    featureRtp: { freeSpins: 0, bonus: 0, buyBonus: 0 },
    hitRate: 0.32,
    variance: 5.5,
    standardDeviation: 2.345,
    confidence90Low: 0.9598,
    confidence90High: 0.9602,
    confidence95Low: 0.9596,
    confidence95High: 0.9604,
    featureTriggerCount: 0,
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
  }
}

describe('generateAllReports', () => {
  let tmpStorage: string

  beforeEach(() => {
    tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-gen-'))
    process.env.STORAGE_BASE_PATH = tmpStorage
    mockGameFind.mockReset()
    mockSimFind.mockReset()
    mockGameUpdate.mockReset()
    mockReportCreate.mockReset()

    // Seed artifacts.
    const artifactsDir = path.join(tmpStorage, 'artifacts', 'g1')
    fs.mkdirSync(artifactsDir, { recursive: true })
    fs.writeFileSync(path.join(artifactsDir, 'simulation-output.json'), JSON.stringify(makeSim()))
    fs.writeFileSync(path.join(artifactsDir, 'game-mechanics.md'), '# How it works\nReels spin.')

    mockGameFind.mockResolvedValue({
      id: 'g1',
      originalFileName: 'g1.zip',
      createdAt: new Date('2026-05-25T00:00:00Z'),
      normalizedSchemaJson: makeSchema() as unknown,
      analysisRuns: [{ astCandidatesJson: [{ language: 'go' }], fileTreeJson: [{ relativePath: 'a' }] }],
    })
    mockSimFind.mockResolvedValue({
      id: 'sim-1',
      gameId: 'g1',
      rawOutputPath: path.join(artifactsDir, 'simulation-output.json'),
    })
    mockGameUpdate.mockResolvedValue({})
    mockReportCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'r-1',
      ...data,
    }))
  })

  afterEach(() => {
    fs.rmSync(tmpStorage, { recursive: true, force: true })
    delete process.env.STORAGE_BASE_PATH
  })

  it('writes all 3 reports, persists the Report row, and bumps game status to complete', async () => {
    const { generateAllReports } = await import('../generator.js')
    const out = await generateAllReports({ gameId: 'g1', simulationId: 'sim-1' })

    const reportsDir = path.join(tmpStorage, 'reports', 'g1')
    expect(out.jsonPath).toBe(path.join(reportsDir, 'report.json'))
    expect(out.excelPath).toBe(path.join(reportsDir, 'report.xlsx'))
    expect(out.pdfPath).toBe(path.join(reportsDir, 'report.pdf'))
    expect(fs.existsSync(out.jsonPath)).toBe(true)
    expect(fs.existsSync(out.excelPath)).toBe(true)
    expect(fs.existsSync(out.pdfPath)).toBe(true)

    // Report row persisted with all 3 paths.
    expect(mockReportCreate).toHaveBeenCalledTimes(1)
    const createArg = mockReportCreate.mock.calls[0][0] as { data: Record<string, string> }
    expect(createArg.data.gameId).toBe('g1')
    expect(createArg.data.simulationId).toBe('sim-1')
    expect(createArg.data.jsonReportPath).toBe(out.jsonPath)
    expect(createArg.data.excelReportPath).toBe(out.excelPath)
    expect(createArg.data.pdfReportPath).toBe(out.pdfPath)

    // Status bumps: reporting → complete.
    const statuses = mockGameUpdate.mock.calls.map((c) => (c[0] as { data: { status: string } }).data.status)
    expect(statuses).toEqual(['reporting', 'complete'])

    expect(out.verdict).toBe('PASS')
  })

  it('marks game failed and rethrows when report building blows up', async () => {
    // Force buildJsonReport to fail by removing the simulation output file.
    fs.unlinkSync(path.join(tmpStorage, 'artifacts', 'g1', 'simulation-output.json'))

    const { generateAllReports } = await import('../generator.js')
    await expect(generateAllReports({ gameId: 'g1', simulationId: 'sim-1' })).rejects.toThrow()

    const statuses = mockGameUpdate.mock.calls.map((c) => (c[0] as { data: { status: string } }).data.status)
    expect(statuses).toContain('reporting')
    expect(statuses).toContain('failed')
    expect(mockReportCreate).not.toHaveBeenCalled()
  })
})
