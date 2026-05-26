import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildPdfReport } from '../pdf-report.js'
import type { GameReport, Verdict } from '../types.js'

function makeReport(verdict: Verdict = 'WARN'): GameReport {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-05-25T00:00:00Z',
    overview: {
      gameId: { value: 'g1', source: 'extracted' },
      gameName: { value: 'Test Slot PDF', source: 'extracted' },
      provider: { value: 'TestCo', source: 'extracted' },
      gameType: { value: 'video-slot', source: 'extracted' },
      originalFileName: { value: 'test.zip', source: 'extracted' },
      uploadedAt: { value: '2026-05-25T00:00:00Z', source: 'extracted' },
      fileCount: { value: 42, source: 'extracted' },
      detectedLanguages: { value: ['go'], source: 'extracted' },
    },
    mechanics: { value: '# How it works\n\nReels spin and match patterns.', source: 'ai-inferred' },
    math: {
      reels: {
        value: [
          { reelIndex: 0, length: 3, symbols: ['A', 'B', 'A'], symbolCounts: { A: 2, B: 1 } },
          { reelIndex: 1, length: 3, symbols: ['B', 'A', 'B'], symbolCounts: { A: 1, B: 2 } },
          { reelIndex: 2, length: 3, symbols: ['A', 'A', 'B'], symbolCounts: { A: 2, B: 1 } },
        ],
        source: 'extracted',
      },
      paylines: { value: [[0, 0, 0], [1, 1, 1]], source: 'extracted' },
      symbols: {
        value: [
          { id: 'A', name: 'Apple', isWild: false, isScatter: false },
          { id: 'B', name: 'Bell', isWild: false, isScatter: false },
        ],
        source: 'extracted',
      },
      paytable: { value: { A: { '3': 10 }, B: { '3': 5 } }, source: 'extracted' },
      weightTable: {
        value: [
          { reelIndex: 0, counts: { A: 2, B: 1 }, total: 3 },
          { reelIndex: 1, counts: { A: 1, B: 2 }, total: 3 },
          { reelIndex: 2, counts: { A: 2, B: 1 }, total: 3 },
        ],
        source: 'extracted',
      },
      bet: { value: { defaultBet: 1, lines: 2, coinValue: 1 }, source: 'extracted' },
    },
    features: {
      wild: { value: { symbolId: 'WILD', substitutesFor: ['A', 'B'] }, source: 'extracted' },
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
    warnings: ['no scatter detected'],
    assumptions: [
      {
        field: 'bet.coinValue',
        assumedValue: 1,
        reason: 'no explicit coin value in source',
        canBeImproved: true,
        improvementHint: 'check config.json',
      },
    ],
    sourceEvidence: [],
    confidence: {
      schemaValidationOk: true,
      schemaValidationErrors: [],
      warningCount: 1,
      assumptionCount: 1,
      convergenceOk: true,
      verdict,
      verdictReasons: ['1 warning(s) raised during analysis'],
    },
  }
}

describe('buildPdfReport', () => {
  let tmpStorage: string

  beforeEach(() => {
    tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-pdf-'))
    process.env.STORAGE_BASE_PATH = tmpStorage
  })

  afterEach(() => {
    fs.rmSync(tmpStorage, { recursive: true, force: true })
    delete process.env.STORAGE_BASE_PATH
  })

  it('writes a valid PDF file with a PDF magic header', async () => {
    const report = makeReport()
    const { pdfPath } = await buildPdfReport({ gameId: 'g1', report })

    expect(pdfPath).toBe(path.join(tmpStorage, 'reports', 'g1', 'report.pdf'))
    expect(fs.existsSync(pdfPath)).toBe(true)

    const buf = fs.readFileSync(pdfPath)
    // PDFs start with "%PDF-"
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    // and end with "%%EOF"
    const tail = buf.subarray(buf.length - 32).toString('ascii')
    expect(tail).toMatch(/%%EOF/)
    expect(buf.length).toBeGreaterThan(2_000)
  })

  it('embeds metadata title with the game name', async () => {
    const report = makeReport('PASS')
    const { pdfPath } = await buildPdfReport({ gameId: 'g2', report })

    const buf = fs.readFileSync(pdfPath)
    // Title is always present in the Info dict, as an indirect reference.
    const ascii = buf.toString('binary')
    expect(ascii).toContain('/Title')
    // The Title contains an em-dash so pdfkit encodes as UTF-16BE inside a
    // parenthesised literal — find the game name with interleaved nulls.
    const interleaved = Array.from('Test Slot PDF').map((c) => `\\u0000${c}`).join('')
    const re = new RegExp(interleaved)
    expect(re.test(ascii)).toBe(true)
  })

  it('spans multiple pages for a normal-sized report', async () => {
    const report = makeReport('WARN')
    const { pdfPath } = await buildPdfReport({ gameId: 'g4', report })
    const buf = fs.readFileSync(pdfPath)
    // Each PDF page emits a "/Type /Page " object — count them.
    const ascii = buf.toString('binary')
    const pageCount = (ascii.match(/\/Type \/Page[^s]/g) ?? []).length
    expect(pageCount).toBeGreaterThanOrEqual(2)
  })

  it('works when warnings and assumptions are empty', async () => {
    const r = makeReport('PASS')
    r.warnings = []
    r.assumptions = []
    const { pdfPath } = await buildPdfReport({ gameId: 'g3', report: r })
    const buf = fs.readFileSync(pdfPath)
    expect(buf.length).toBeGreaterThan(1_000)
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })
})
