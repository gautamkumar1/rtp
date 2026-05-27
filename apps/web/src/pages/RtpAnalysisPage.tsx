import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  triggerRtpAnalysis,
  getRtpAnalysis,
  resetRtpAnalysis,
  type RtpAnalysisResult,
  type RtpVariantResult,
} from '../lib/api'
import { cn } from '@/lib/utils'
import { ChevronRight, BrainCircuit, RefreshCw, RotateCcw, CheckCircle2, XCircle, Minus } from 'lucide-react'

const PCT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return PCT.format(Number(n))
}

const THINKING_MESSAGES = [
  'Initializing simulation engine…',
  'Loading reel strips and symbol weights…',
  'Seeding RNG with 1,000,000 spin samples…',
  'Simulating base game spins…',
  'Tracking scatter trigger events…',
  'Running free spin rounds…',
  'Accumulating wild substitution wins…',
  'Processing re-trigger sequences…',
  'Simulating buy bonus entry paths…',
  'Aggregating win totals across all runs…',
  'Computing RTP from simulation results…',
  'Finalising simulation report…',
]

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <span className="tabular">{m > 0 ? `${m}m ` : ''}{s}s</span>
}

function ThinkingLoader({ startedAt }: { startedAt: number }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % THINKING_MESSAGES.length), 5000)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)

  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-5">
      <div className="flex items-center gap-3">
        <BrainCircuit className="w-5 h-5 text-primary animate-pulse shrink-0" />
        <div>
          <p className="text-sm font-semibold">Running simulation…</p>
          <p className="text-xs text-muted-foreground">Elapsed: <ElapsedTimer startedAt={startedAt} /></p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-px bg-border" />
        <p className="text-xs text-muted-foreground italic transition-all duration-500 min-h-[1rem]">
          {THINKING_MESSAGES[idx]}
        </p>
      </div>

      {elapsed > 60 && (
        <p className="text-xs text-warning">
          Large simulation in progress — processing millions of spin outcomes may take a few minutes.
        </p>
      )}
    </div>
  )
}

function VerdictBadge({ pass }: { pass: boolean | null }) {
  if (pass === null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />
  return pass
    ? <CheckCircle2 className="w-4 h-4 text-success" />
    : <XCircle className="w-4 h-4 text-destructive" />
}

function VariantRow({ v }: { v: RtpVariantResult }) {
  const delta = v.declaredRtp != null ? v.totalRtp - v.declaredRtp : null
  const pass = delta != null ? Math.abs(delta) <= 0.001 : null

  return (
    <tr className="border-t border-border/50 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4 font-mono text-xs font-semibold">{v.variantLabel}</td>
      <td className="py-3 px-4 text-right text-sm tabular font-medium">{pct(v.totalRtp)}</td>
      <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{pct(v.baseRtp)}</td>
      <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{pct(v.freeSpinsRtp)}</td>
      <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{v.retriggerRtp != null ? pct(v.retriggerRtp) : '—'}</td>
      <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{v.buyBonusRtp != null ? pct(v.buyBonusRtp) : '—'}</td>
      <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{v.declaredRtp != null ? pct(v.declaredRtp) : '—'}</td>
      <td className="py-3 px-4 text-right">
        {delta != null ? (
          <span className={cn('font-mono text-xs tabular', pass ? 'text-success' : 'text-destructive')}>
            {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(3)}%
          </span>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      <td className="py-3 px-4 text-center">
        <VerdictBadge pass={pass} />
      </td>
    </tr>
  )
}

function VariantDetails({ v }: { v: RtpVariantResult }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-xs font-semibold font-mono text-muted-foreground uppercase tracking-wide">{v.variantLabel}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {v.featureTriggerFrequency && (
          <>
            <span className="text-muted-foreground">Feature trigger</span>
            <span className="font-medium tabular">{v.featureTriggerFrequency}</span>
          </>
        )}
        {v.avgFreeSpins != null && (
          <>
            <span className="text-muted-foreground">Avg free spins</span>
            <span className="font-medium tabular">{v.avgFreeSpins.toFixed(1)}</span>
          </>
        )}
        {v.hitRate != null && (
          <>
            <span className="text-muted-foreground">Hit rate</span>
            <span className="font-medium tabular">{pct(v.hitRate)}</span>
          </>
        )}
        {v.notes && (
          <>
            <span className="text-muted-foreground">Notes</span>
            <span className="text-muted-foreground/80">{v.notes}</span>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

export function RtpAnalysisPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'failed'>('idle')
  const [result, setResult] = useState<RtpAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number>(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const loadStatus = useCallback(async () => {
    try {
      const data = await getRtpAnalysis(gameId!)
      setStatus(data.status)
      if (data.result) setResult(data.result)
      if (data.status === 'complete' || data.status === 'failed') stopPoll()
    } catch (e) {
      console.error(e)
    }
  }, [gameId])

  useEffect(() => {
    loadStatus()
    return stopPoll
  }, [loadStatus])

  async function handleStart() {
    setError(null)
    setResult(null)
    setStatus('running')
    setStartedAt(Date.now())
    try {
      await triggerRtpAnalysis(gameId!)
      pollRef.current = setInterval(loadStatus, 5000)
    } catch (e) {
      setError(String(e))
      setStatus('failed')
    }
  }

  async function handleReset() {
    stopPoll()
    await resetRtpAnalysis(gameId!)
    setStatus('idle')
    setResult(null)
    setError(null)
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/games/${gameId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ChevronRight className="w-3 h-3 rotate-180" />
            Back to game
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">AI RTP Simulation</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Runs a full statistical simulation of the game engine to compute RTP
          </p>
        </div>
        <div className="flex gap-2 shrink-0 pt-7">
          {(status === 'complete' || status === 'failed') && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
          {status !== 'running' && (
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors"
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              {status === 'idle' ? 'Run Simulation' : 'Re-run Simulation'}
            </button>
          )}
        </div>
      </div>

      {/* Running */}
      {status === 'running' && <ThinkingLoader startedAt={startedAt || Date.now()} />}

      {/* Error */}
      {status === 'failed' && !result && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
          Analysis failed. {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Game type" value={result.gameType || '—'} />
            <StatCard label="Mechanic" value={result.mechanic || '—'} />
            <StatCard label="Reel config" value={result.reelConfig || '—'} />
            <StatCard label="Method" value="Monte Carlo Simulation" />
          </div>

          {/* Game logic summary */}
          {result.gameLogicSummary && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Game logic summary</p>
              <p className="text-sm leading-relaxed text-foreground/80">{result.gameLogicSummary}</p>
            </div>
          )}

          {/* RTP table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Simulation Results by Variant</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/40">
                    {['Variant', 'Total', 'Base', 'Free Spins', 'Re-trig', 'Buy Bonus', 'Declared', 'Delta', ''].map((h, i) => (
                      <th
                        key={i}
                        className={cn(
                          'py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide',
                          i === 0 ? 'text-left' : i === 8 ? 'text-center' : 'text-right'
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.variants.map(v => <VariantRow key={v.variantLabel} v={v} />)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-variant details */}
          {result.variants.some(v => v.featureTriggerFrequency || v.avgFreeSpins != null || v.notes) && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variant Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.variants.map(v => <VariantDetails key={v.variantLabel} v={v} />)}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground/60">
            Completed {new Date(result.completedAt).toLocaleString()} · Monte Carlo Simulation
          </p>
        </div>
      )}

      {/* Idle state */}
      {status === 'idle' && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <BrainCircuit className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No simulation run yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click "Run Simulation" to simulate millions of spins and compute RTP.
            </p>
          </div>
          <button
            onClick={handleStart}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            Run Simulation
          </button>
        </div>
      )}

      {status === 'running' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Polling for results every 5 seconds…
        </div>
      )}
    </div>
  )
}
