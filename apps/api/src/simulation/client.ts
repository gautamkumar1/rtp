import type { GameSchema } from '@rtp/game-schema'

const DEFAULT_SIMULATOR_URL = 'http://localhost:8090'

export const ALLOWED_SPIN_COUNTS = [
  1_000_000,
  10_000_000,
  100_000_000,
  500_000_000,
  1_000_000_000,
] as const
export type SpinCount = (typeof ALLOWED_SPIN_COUNTS)[number]
export const DEFAULT_SPIN_COUNT: SpinCount = 10_000_000

export interface SimulateRequest {
  schema: GameSchema
  config: {
    spinCount: number
    rows?: number
    seed?: number
    simulateBuyBonus?: boolean
  }
}

export interface SymbolHitRow {
  symbol: string
  hits: number[]
  probs: number[]
}

export interface SimulationResult {
  totalSpins: number
  totalBet: number
  totalReturn: number
  rtp: number
  baseRtp: number
  featureRtp: { freeSpins: number; bonus: number; buyBonus: number }
  hitRate: number
  variance: number
  standardDeviation: number
  confidence90Low: number
  confidence90High: number
  confidence95Low: number
  confidence95High: number
  featureTriggerCount: number
  symbolHitProbabilities: {
    maxCount: number
    totalSpins: number
    bySymbol: SymbolHitRow[]
    scatterHits: number[]
    scatterProbs: number[]
    wildAssistedWins: number
    wildAssistRate: number
  }
  buyBonus?: { purchases: number; totalCost: number; totalReturn: number; rtp: number }
  warnings: string[]
  config: { spinCount: number; rows: number; seed: number; simulateBuyBonus: boolean }
  durationMs: number
}

export interface SimulatorClientOptions {
  baseUrl?: string
  timeoutMs?: number
}

export class SimulatorError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'SimulatorError'
  }
}

export class SimulatorClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(opts: SimulatorClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.SIMULATOR_URL ?? DEFAULT_SIMULATOR_URL
    // Default 10 minutes — a 1B-spin run can take a while. Callers can override.
    this.timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000
  }

  async health(): Promise<{ status: string; version: string }> {
    const res = await fetch(`${this.baseUrl}/health`)
    if (!res.ok) throw new SimulatorError(`health check failed (${res.status})`, res.status)
    return res.json() as Promise<{ status: string; version: string }>
  }

  async simulate(req: SimulateRequest): Promise<SimulationResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      })
      const body = (await res.json()) as SimulationResult | { error: string }
      if (!res.ok) {
        const errMsg = 'error' in body ? body.error : `simulator returned ${res.status}`
        throw new SimulatorError(errMsg, res.status)
      }
      return body as SimulationResult
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SimulatorError(`simulator timed out after ${this.timeoutMs}ms`)
      }
      if (err instanceof SimulatorError) throw err
      throw new SimulatorError(`simulator request failed: ${String(err)}`)
    } finally {
      clearTimeout(timer)
    }
  }
}

export function isAllowedSpinCount(n: unknown): n is SpinCount {
  return typeof n === 'number' && (ALLOWED_SPIN_COUNTS as readonly number[]).includes(n)
}
