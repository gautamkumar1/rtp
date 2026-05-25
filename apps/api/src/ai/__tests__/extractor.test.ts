import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { SCHEMA_VERSION } from '@rtp/game-schema'

const mockCreate = vi.fn()

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
  }
  return { default: MockOpenAI }
})

const validSchemaResponse = {
  schemaVersion: SCHEMA_VERSION,
  provider: 'test-studio',
  gameId: 'test-game-001',
  gameName: 'Test Slot',
  gameType: 'video-slot',
  currencyMode: 'credits',
  bet: { defaultBet: 1, lines: 10, coinValue: 1 },
  reels: [
    ['A', 'B', 'C', 'WILD', 'A', 'B'],
    ['A', 'B', 'C', 'A', 'B', 'C'],
    ['A', 'B', 'C', 'SCATTER', 'A', 'B'],
    ['A', 'B', 'C', 'A', 'B', 'C'],
    ['A', 'B', 'C', 'A', 'WILD', 'B'],
  ],
  paylines: [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
  ],
  symbols: [
    { id: 'A', name: 'SymbolA', isWild: false, isScatter: false },
    { id: 'B', name: 'SymbolB', isWild: false, isScatter: false },
    { id: 'C', name: 'SymbolC', isWild: false, isScatter: false },
    { id: 'WILD', name: 'Wild', isWild: true, isScatter: false },
    { id: 'SCATTER', name: 'Scatter', isWild: false, isScatter: true },
  ],
  paytable: {
    A: { '3': 5, '4': 20, '5': 100 },
    B: { '3': 3, '4': 10, '5': 50 },
    C: { '3': 2, '4': 8, '5': 30 },
  },
  wild: { symbolId: 'WILD', substitutesFor: [] },
  scatter: { symbolId: 'SCATTER', triggerCount: 3, awardType: 'freeSpins' },
  freeSpins: { count: 10, multiplier: 2, retrigger: false },
  sourceEvidence: [
    {
      filePath: 'src/game.go',
      lineNumber: 42,
      rawValue: '["A","B","C"]',
      confidence: 'high',
      reasoning: 'reel strip array found',
    },
  ],
  warnings: [],
  assumptions: [],
}

function makeMockResponse(content: string) {
  return {
    choices: [{ message: { content } }],
  }
}

describe('runAiExtraction', () => {
  let tmpDir: string
  let extractedDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-test-'))
    extractedDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractedDir, { recursive: true })
    process.env.STORAGE_BASE_PATH = tmpDir
    process.env.OPENAI_API_KEY = 'test-key'
  })

  it('saves normalized-schema.json and ai-raw.json on success', async () => {
    const { runAiExtraction } = await import('../extractor.js')
    mockCreate.mockResolvedValueOnce(
      makeMockResponse(JSON.stringify(validSchemaResponse)),
    )

    const result = await runAiExtraction({
      gameId: 'test-game-001',
      gameName: 'Test Slot',
      candidateFiles: [],
      astCandidates: [],
      extractedPath: extractedDir,
    })

    expect(result.schema.gameId).toBe('test-game-001')
    expect(result.schema.schemaVersion).toBe(SCHEMA_VERSION)
    expect(result.validationErrors).toHaveLength(0)
    expect(fs.existsSync(result.rawResponsePath)).toBe(true)
    expect(fs.existsSync(result.normalizedSchemaPath)).toBe(true)
  })

  it('returns simulation blockers as warnings when reels are empty', async () => {
    const { runAiExtraction } = await import('../extractor.js')
    const badSchema = {
      ...validSchemaResponse,
      reels: [],
      paylines: [],
      symbols: [],
      paytable: {},
    }
    mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(badSchema)))

    const result = await runAiExtraction({
      gameId: 'test-game-001',
      gameName: 'Test Slot',
      candidateFiles: [],
      astCandidates: [],
      extractedPath: extractedDir,
    })

    const hasSimBlocker = result.warnings.some((w) => w.includes('Simulation blocker'))
    expect(hasSimBlocker).toBe(true)
  })

  it('retries once on validation failure and succeeds on retry', async () => {
    const { runAiExtraction } = await import('../extractor.js')
    const invalidResponse = { ...validSchemaResponse, bet: undefined }
    mockCreate
      .mockResolvedValueOnce(makeMockResponse(JSON.stringify(invalidResponse)))
      .mockResolvedValueOnce(makeMockResponse(JSON.stringify(validSchemaResponse)))

    const result = await runAiExtraction({
      gameId: 'test-game-001',
      gameName: 'Test Slot',
      candidateFiles: [],
      astCandidates: [],
      extractedPath: extractedDir,
    })

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.schema.bet.defaultBet).toBe(1)
  })

  it('throws on non-JSON response from OpenAI', async () => {
    const { runAiExtraction } = await import('../extractor.js')
    mockCreate.mockResolvedValueOnce(
      makeMockResponse('This is not JSON at all'),
    )

    await expect(
      runAiExtraction({
        gameId: 'test-game-001',
        gameName: 'Test Slot',
        candidateFiles: [],
        astCandidates: [],
        extractedPath: extractedDir,
      }),
    ).rejects.toThrow()
  })

  it('includes source evidence in output schema', async () => {
    const { runAiExtraction } = await import('../extractor.js')
    mockCreate.mockResolvedValueOnce(
      makeMockResponse(JSON.stringify(validSchemaResponse)),
    )

    const result = await runAiExtraction({
      gameId: 'test-game-001',
      gameName: 'Test Slot',
      candidateFiles: [],
      astCandidates: [],
      extractedPath: extractedDir,
    })

    expect(result.schema.sourceEvidence.length).toBeGreaterThan(0)
    expect(result.schema.sourceEvidence[0].confidence).toBe('high')
  })
})
