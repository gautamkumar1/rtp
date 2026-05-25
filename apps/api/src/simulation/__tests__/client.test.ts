import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SimulatorClient,
  SimulatorError,
  ALLOWED_SPIN_COUNTS,
  DEFAULT_SPIN_COUNT,
  isAllowedSpinCount,
} from '../client.js'
import type { GameSchema } from '@rtp/game-schema'

function makeSchema(): GameSchema {
  return {
    schemaVersion: '0.1.0',
    provider: 'test',
    gameId: 't',
    gameName: 't',
    gameType: 'video-slot',
    currencyMode: 'credits',
    bet: { defaultBet: 1, lines: 1, coinValue: 1 },
    reels: [['A', 'B'], ['A', 'B'], ['A', 'B']],
    paylines: [[0, 0, 0]],
    symbols: [
      { id: 'A', name: 'A', isWild: false, isScatter: false },
      { id: 'B', name: 'B', isWild: false, isScatter: false },
    ],
    paytable: { A: { '3': 8 }, B: { '3': 0 } },
    sourceEvidence: [],
    warnings: [],
    assumptions: [],
  }
}

describe('isAllowedSpinCount', () => {
  it('accepts every allowed value', () => {
    for (const n of ALLOWED_SPIN_COUNTS) expect(isAllowedSpinCount(n)).toBe(true)
  })
  it('rejects others', () => {
    expect(isAllowedSpinCount(123)).toBe(false)
    expect(isAllowedSpinCount('1000000')).toBe(false)
    expect(isAllowedSpinCount(undefined)).toBe(false)
  })
})

describe('SimulatorClient', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('passes schema + config to /simulate and returns parsed result', async () => {
    const mockResult = {
      totalSpins: 1_000_000,
      rtp: 0.96,
      symbolHitProbabilities: { bySymbol: [], scatterHits: [], scatterProbs: [], maxCount: 3, totalSpins: 1_000_000, wildAssistedWins: 0, wildAssistRate: 0 },
      warnings: [],
    }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response)

    const client = new SimulatorClient({ baseUrl: 'http://x' })
    const res = await client.simulate({
      schema: makeSchema(),
      config: { spinCount: DEFAULT_SPIN_COUNT },
    })
    expect(res.rtp).toBe(0.96)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://x/simulate',
      expect.objectContaining({ method: 'POST' }),
    )
    const args = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse((args[1] as RequestInit).body as string)
    expect(body.config.spinCount).toBe(DEFAULT_SPIN_COUNT)
    expect(body.schema.reels.length).toBe(3)
  })

  it('throws SimulatorError on non-2xx', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'schema invalid: bad input' }),
    } as Response)
    const client = new SimulatorClient({ baseUrl: 'http://x' })
    await expect(
      client.simulate({ schema: makeSchema(), config: { spinCount: DEFAULT_SPIN_COUNT } }),
    ).rejects.toBeInstanceOf(SimulatorError)
  })

  it('throws SimulatorError on network error', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const client = new SimulatorClient({ baseUrl: 'http://x' })
    await expect(
      client.simulate({ schema: makeSchema(), config: { spinCount: DEFAULT_SPIN_COUNT } }),
    ).rejects.toBeInstanceOf(SimulatorError)
  })
})
