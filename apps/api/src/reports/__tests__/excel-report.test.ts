import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import ExcelJS from 'exceljs'
import { buildExcelReport } from '../excel-report.js'
import type { GameReport } from '../types.js'

function makeReport(overrides: Partial<GameReport> = {}): GameReport {
  const base: GameReport = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-05-25T00:00:00Z',
    overview: {
      gameId: { value: 'g1', source: 'extracted' },
      gameName: { value: 'Mock Slot', source: 'extracted' },
      provider: { value: 'TestCo', source: 'extracted' },
      gameType: { value: 'video-slot', source: 'extracted' },
      originalFileName: { value: 'mock.zip', source: 'extracted' },
      uploadedAt: { value: '2026-05-25T00:00:00Z', source: 'extracted' },
      fileCount: { value: 42, source: 'extracted' },
      detectedLanguages: { value: ['go', 'java'], source: 'extracted' },
    },
    mechanics: { value: '# How it works\nspin reels.', source: 'ai-inferred' },
    math: {
      reels: {
        value: [
          { reelIndex: 0, length: 3, symbols: ['A', 'B', 'A'], symbolCounts: { A: 2, B: 1 } },
          { reelIndex: 1, length: 3, symbols: ['B', 'A', 'B'], symbolCounts: { A: 1, B: 2 } },
        ],
        source: 'extracted',
      },
      paylines: { value: [[0, 0], [1, 1]], source: 'extracted' },
      symbols: {
        value: [
          { id: 'A', name: 'A', isWild: false, isScatter: false },
          { id: 'B', name: 'B', isWild: false, isScatter: false },
        ],
        source: 'extracted',
      },
      paytable: { value: { A: { '3': 10 }, B: { '3': 5 } }, source: 'extracted' },
      weightTable: {
        value: [
          { reelIndex: 0, counts: { A: 2, B: 1 }, total: 3 },
          { reelIndex: 1, counts: { A: 1, B: 2 }, total: 3 },
        ],
        source: 'extracted',
      },
      bet: { value: { defaultBet: 1, lines: 2, coinValue: 1 }, source: 'extracted' },
    },
    features: {
      wild: { value: null, source: 'warning' },
      scatter: { value: null, source: 'warning' },
      freeSpins: { value: null, source: 'warning' },
      bonus: { value: null, source: 'warning' },
      buyBonus: { value: null, source: 'warning' },
    },
    simulation: {
      config: { value: { spinCount: 1_000_000, rows: 3, seed: 0, simulateBuyBonus: false }, source: 'simulation-result' },
      rtp: { value: { total: 0.96, base: 0.9, freeSpins: 0.06, bonus: 0, buyBonus: 0 }, source: 'simulation-result' },
      statistics: {
        value: {
          totalSpins: 1_000_000,
          totalBet: 1_000_000,
          totalReturn: 960_000,
          hitRate: 0.32,
          variance: 5.5,
          standardDeviation: 2.345,
          confidence90: { low: 0.9598, high: 0.9602, halfWidth: 0.0002 },
          confidence95: { low: 0.9596, high: 0.9604, halfWidth: 0.0004 },
          featureTriggerCount: 1234,
          durationMs: 8000,
        },
        source: 'simulation-result',
      },
      symbolHitProbabilities: {
        value: {
          maxCount: 3,
          totalSpins: 1_000_000,
          bySymbol: [
            { symbol: 'A', hits: [0, 0, 100], probs: [0, 0, 0.0001] },
            { symbol: 'B', hits: [0, 0, 50], probs: [0, 0, 0.00005] },
          ],
          scatterHits: [999_000, 1_000],
          scatterProbs: [0.999, 0.001],
          wildAssistedWins: 42,
          wildAssistRate: 0.00042,
        },
        source: 'simulation-result',
      },
      buyBonus: { value: null, source: 'warning' },
    },
    warnings: ['no scatter detected', 'no free spins detected'],
    assumptions: [
      {
        field: 'bet.coinValue',
        assumedValue: 1,
        reason: 'no explicit coin value in source',
        canBeImproved: true,
        improvementHint: 'check config.json',
      },
    ],
    sourceEvidence: [
      {
        filePath: 'src/reels.go',
        lineNumber: 12,
        rawValue: '[A B A]',
        confidence: 'high',
        reasoning: 'literal',
      },
    ],
    confidence: {
      schemaValidationOk: true,
      schemaValidationErrors: [],
      warningCount: 2,
      assumptionCount: 1,
      convergenceOk: true,
      verdict: 'WARN',
      verdictReasons: ['2 warning(s) raised during analysis'],
    },
  }
  return { ...base, ...overrides }
}

describe('buildExcelReport', () => {
  let tmpStorage: string

  beforeEach(() => {
    tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-xlsx-'))
    process.env.STORAGE_BASE_PATH = tmpStorage
  })

  afterEach(() => {
    fs.rmSync(tmpStorage, { recursive: true, force: true })
    delete process.env.STORAGE_BASE_PATH
  })

  it('writes report.xlsx with all expected sheets', async () => {
    const report = makeReport()
    const { excelPath } = await buildExcelReport({ gameId: 'g1', report })

    expect(excelPath).toBe(path.join(tmpStorage, 'reports', 'g1', 'report.xlsx'))
    expect(fs.existsSync(excelPath)).toBe(true)

    // Read it back and verify sheet names + a few key cells.
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(excelPath)
    const sheetNames = wb.worksheets.map((w) => w.name)
    expect(sheetNames).toEqual([
      'Overview',
      'Game Mechanics',
      'Reels',
      'Paylines',
      'Paytable',
      'Simulation Results',
      'Symbol Hit Probability',
      'Assumptions',
      'Warnings',
    ])
  })

  it('Overview sheet shows the verdict and RTP values', async () => {
    const report = makeReport()
    const { excelPath } = await buildExcelReport({ gameId: 'g2', report })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(excelPath)
    const overview = wb.getWorksheet('Overview')!
    const flat: string[] = []
    overview.eachRow((r) => {
      r.eachCell((c) => flat.push(String(c.value ?? '')))
    })
    expect(flat).toContain('Total RTP')
    expect(flat.some((v) => v.startsWith('96.000'))).toBe(true)
    expect(flat).toContain('Verdict')
    expect(flat).toContain('WARN')
  })

  it('Symbol Hit Probability sheet contains rows for each symbol + scatter block', async () => {
    const report = makeReport()
    const { excelPath } = await buildExcelReport({ gameId: 'g3', report })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(excelPath)
    const sheet = wb.getWorksheet('Symbol Hit Probability')!
    const flat: string[] = []
    sheet.eachRow((r) => {
      r.eachCell((c) => flat.push(String(c.value ?? '')))
    })
    expect(flat).toContain('A')
    expect(flat).toContain('B')
    expect(flat).toContain('1× hits')
    expect(flat).toContain('0× scatter')
    expect(flat).toContain('Wild-assisted wins')
  })

  it('Assumptions sheet lists improvement hints, empty warning sheet handles 0 warnings', async () => {
    const report = makeReport({ warnings: [] })
    const { excelPath } = await buildExcelReport({ gameId: 'g4', report })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(excelPath)

    const a = wb.getWorksheet('Assumptions')!
    const flat: string[] = []
    a.eachRow((r) => r.eachCell((c) => flat.push(String(c.value ?? ''))))
    expect(flat).toContain('bet.coinValue')
    expect(flat).toContain('check config.json')

    const w = wb.getWorksheet('Warnings')!
    const warnFlat: string[] = []
    w.eachRow((r) => r.eachCell((c) => warnFlat.push(String(c.value ?? ''))))
    expect(warnFlat).toContain('(no warnings)')
  })
})
