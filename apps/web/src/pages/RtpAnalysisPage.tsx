import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  triggerRtpAnalysis,
  getRtpAnalysis,
  resetRtpAnalysis,
  type RtpAnalysisResult,
  type RtpVariantResult,
} from '../lib/api'

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
  'Reading reel strips and symbol definitions…',
  'Extracting paytable from source code…',
  'Mapping wild substitution rules…',
  'Identifying scatter trigger conditions…',
  'Computing base game win combinations…',
  'Enumerating free spin probability trees…',
  'Calculating re-trigger contribution…',
  'Evaluating buy bonus EV…',
  'Summing RTP components…',
  'Verifying combinatorial totals…',
  'Cross-checking declared vs. computed RTP…',
  'Finalising results…',
]

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <span>{m > 0 ? `${m}m ` : ''}{s}s</span>
}

function ThinkingMessage({ startedAt }: { startedAt: number }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setIdx(i => (i + 1) % THINKING_MESSAGES.length)
    }, 5000)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <p className="text-sm text-muted-foreground italic transition-all duration-500">{THINKING_MESSAGES[idx]}</p>
      <p className="text-xs text-muted-foreground">
        o3 thinking — elapsed: <ElapsedTimer startedAt={startedAt} />
        {elapsed > 60 && <span className="ml-2 text-yellow-600">(deep analysis in progress…)</span>}
      </p>
    </div>
  )
}

function VariantRow({ v }: { v: RtpVariantResult }) {
  const delta = v.declaredRtp != null ? v.totalRtp - v.declaredRtp : null
  const pass = delta != null && Math.abs(delta) <= 0.001

  return (
    <tr className="border-t border-border">
      <td className="py-3 px-4 font-mono font-semibold">{v.variantLabel}</td>
      <td className="py-3 px-4 text-right">{pct(v.totalRtp)}</td>
      <td className="py-3 px-4 text-right">{pct(v.baseRtp)}</td>
      <td className="py-3 px-4 text-right">{pct(v.freeSpinsRtp)}</td>
      <td className="py-3 px-4 text-right">{v.retriggerRtp != null ? pct(v.retriggerRtp) : '—'}</td>
      <td className="py-3 px-4 text-right">{v.buyBonusRtp != null ? pct(v.buyBonusRtp) : '—'}</td>
      <td className="py-3 px-4 text-right">{v.declaredRtp != null ? pct(v.declaredRtp) : '—'}</td>
      <td className="py-3 px-4 text-right">
        {delta != null ? (
          <span className={`font-mono text-xs ${pass ? 'text-green-600' : 'text-red-500'}`}>
            {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(3)}%
          </span>
        ) : '—'}
      </td>
      <td className="py-3 px-4 text-center">
        {delta != null ? (
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {pass ? 'PASS' : 'FAIL'}
          </span>
        ) : '—'}
      </td>
    </tr>
  )
}

function VariantDetails({ v }: { v: RtpVariantResult }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-1">
      <p className="font-semibold text-sm mb-2">{v.variantLabel}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {v.featureTriggerFrequency && (
          <>
            <span className="text-muted-foreground">Feature trigger</span>
            <span>{v.featureTriggerFrequency}</span>
          </>
        )}
        {v.avgFreeSpins != null && (
          <>
            <span className="text-muted-foreground">Avg free spins</span>
            <span>{v.avgFreeSpins.toFixed(1)}</span>
          </>
        )}
        {v.hitRate != null && (
          <>
            <span className="text-muted-foreground">Hit rate</span>
            <span>{pct(v.hitRate)}</span>
          </>
        )}
        {v.notes && (
          <>
            <span className="text-muted-foreground">Notes</span>
            <span className="text-xs">{v.notes}</span>
          </>
        )}
      </div>
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
      <div className="flex items-center justify-between">
        <div>
          <Link to={`/games/${gameId}`} className="text-sm text-muted-foreground hover:underline">
            ← Back to game
          </Link>
          <h2 className="mt-1 text-2xl font-bold">AI RTP Analysis</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Powered by OpenAI o3 — analytically derives RTP from source code without simulation
          </p>
        </div>
        <div className="flex gap-2">
          {(status === 'complete' || status === 'failed') && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted"
            >
              Reset
            </button>
          )}
          {status !== 'running' && (
            <button
              onClick={handleStart}
              disabled={status === 'running'}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'idle' ? 'Analyze RTP with o3' : 'Re-Analyze'}
            </button>
          )}
        </div>
      </div>

      {/* Running state */}
      {status === 'running' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-8 text-center space-y-4">
          <p className="text-blue-700 font-semibold text-lg">o3 is analyzing the game source…</p>
          <ThinkingMessage startedAt={startedAt || Date.now()} />
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            o3 with reasoning_effort:high reads every source file, extracts reel strips, paytable, and
            game logic, then computes RTP analytically using exact combinatorics. This typically takes
            2–5 minutes.
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'failed' && !result && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Analysis failed. {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary header */}
          <div className="rounded-lg border border-border p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Game type</p>
              <p className="font-medium mt-0.5">{result.gameType || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Mechanic</p>
              <p className="font-medium mt-0.5">{result.mechanic || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Reel config</p>
              <p className="font-medium mt-0.5">{result.reelConfig || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Method</p>
              <p className="font-medium mt-0.5 capitalize">{result.analysisMethod}</p>
            </div>
          </div>

          {result.gameLogicSummary && (
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Game logic summary</p>
              <p className="text-sm leading-relaxed">{result.gameLogicSummary}</p>
            </div>
          )}

          {/* RTP table */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="py-3 px-4 text-left">Variant</th>
                  <th className="py-3 px-4 text-right">Total RTP</th>
                  <th className="py-3 px-4 text-right">Base RTP</th>
                  <th className="py-3 px-4 text-right">Free Spins</th>
                  <th className="py-3 px-4 text-right">Re-trigger</th>
                  <th className="py-3 px-4 text-right">Buy Bonus</th>
                  <th className="py-3 px-4 text-right">Declared</th>
                  <th className="py-3 px-4 text-right">Delta</th>
                  <th className="py-3 px-4 text-center">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {result.variants.map(v => (
                  <VariantRow key={v.variantLabel} v={v} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-variant details */}
          {result.variants.some(v => v.featureTriggerFrequency || v.avgFreeSpins != null || v.notes) && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Variant Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.variants.map(v => (
                  <VariantDetails key={v.variantLabel} v={v} />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Completed {new Date(result.completedAt).toLocaleString()} · Analysis method: {result.analysisMethod}
          </p>
        </div>
      )}

      {/* Idle placeholder */}
      {status === 'idle' && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">No analysis yet</p>
          <p className="text-sm mt-1">Click "Analyze RTP with o3" to start the analytical RTP computation.</p>
        </div>
      )}
    </div>
  )
}
