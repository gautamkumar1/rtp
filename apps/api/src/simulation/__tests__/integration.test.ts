import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import net from 'net'
import { SimulatorClient, DEFAULT_SPIN_COUNT } from '../client.js'
import type { GameSchema } from '@rtp/game-schema'

const SIM_BIN = path.resolve(
  process.cwd(),
  '../../services/simulator/bin/simulator',
)

function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

async function waitForHealth(url: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/health`)
      if (r.ok) return
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`simulator not healthy after ${timeoutMs}ms`)
}

const hasBinary = fs.existsSync(SIM_BIN)
const describeIfBinary = hasBinary ? describe : describe.skip

describeIfBinary('Go simulator end-to-end', () => {
  let proc: ChildProcess
  let baseUrl: string

  beforeAll(async () => {
    const port = await pickPort()
    baseUrl = `http://localhost:${port}`
    proc = spawn(SIM_BIN, [], {
      env: { ...process.env, SIMULATOR_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await waitForHealth(baseUrl)
  }, 15_000)

  afterAll(() => {
    proc?.kill('SIGTERM')
  })

  it('GET /health returns ok', async () => {
    const c = new SimulatorClient({ baseUrl })
    const h = await c.health()
    expect(h.status).toBe('ok')
    expect(typeof h.version).toBe('string')
  })

  it('POST /simulate returns RTP ≈ 1.0 for fair-coin schema', async () => {
    const c = new SimulatorClient({ baseUrl })
    const schema: GameSchema = {
      schemaVersion: '0.1.0',
      provider: 'test',
      gameId: 'fair-coin',
      gameName: 'Fair Coin',
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
    const res = await c.simulate({
      schema,
      config: { spinCount: 1_000_000, rows: 1, seed: 12345 },
    })
    expect(res.totalSpins).toBe(1_000_000)
    expect(Math.abs(res.rtp - 1.0)).toBeLessThan(0.02)
    expect(res.symbolHitProbabilities.bySymbol.length).toBeGreaterThan(0)
    expect(res.confidence95Low).toBeLessThanOrEqual(1.0)
    expect(res.confidence95High).toBeGreaterThanOrEqual(1.0)
  }, 30_000)

  it('POST /simulate rejects invalid schema with 400', async () => {
    const c = new SimulatorClient({ baseUrl })
    await expect(
      c.simulate({
        // @ts-expect-error intentionally broken schema
        schema: { schemaVersion: '0.1.0', reels: [], paylines: [], symbols: [], paytable: {} },
        config: { spinCount: DEFAULT_SPIN_COUNT },
      }),
    ).rejects.toThrow(/schema|invalid/i)
  })
})
