import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  startSimulation,
  getLatestSimulation,
  getSimulationOutput,
  getVariants,
  SPIN_COUNTS,
  type SimulationRow,
  type SimulationResult,
  type VariantSummary,
} from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'
import { ReportDownloads } from '../components/ReportDownloads'

const PCT_FMT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const NUM_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return PCT_FMT.format(Number(n))
}

function dec(n: number | string | null | undefined, _frac = 4): string {
  if (n == null) return '—'
  const v = typeof n === 'string' ? Number(n) : n
  if (Number.isNaN(v)) return '—'
  return NUM_FMT.format(v)
}

function bigInt(n: string | null | undefined): string {
  if (!n) return '—'
  return Number(n).toLocaleString()
}

export function SimulationPage() {
  const { gameId } = useParams<{ gameId: string }>()

  // Variants
  const [variants, setVariants] = useState<VariantSummary[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')

  // Sim state
  const [sim, setSim] = useState<SimulationRow | null>(null)
  const [output, setOutput] = useState<SimulationResult | null>(null)
  const [spinCount, setSpinCount] = useState<number>(10_000_000)
  const [buyBonus, setBuyBonus] = useState<boolean>(false)
  const [seed, setSeed] = useState<string>('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The game ID actually being simulated (variant or base)
  const targetId = selectedVariantId || gameId!

  const loadLatest = useCallback(async () => {
    try {
      const s = await getLatestSimulation(targetId)
      setSim(s)
      if (s.status === 'complete') {
        try {
          const out = await getSimulationOutput(targetId, s.id)
          setOutput(out)
        } catch {
          setOutput(null)
        }
      } else {
        setOutput(null)
      }
    } catch {
      setSim(null)
      setOutput(null)
    }
  }, [targetId])

  // Load variants on mount
  useEffect(() => {
    if (!gameId) return
    getVariants(gameId).then((v) => {
      setVariants(v)
    }).catch(() => {
      setVariants([])
    })
  }, [gameId])

  // Reload latest sim when target changes
  useEffect(() => {
    loadLatest()
  }, [loadLatest])

  // Poll while running
  useEffect(() => {
    if (!sim || sim.status === 'complete' || sim.status === 'failed') return
    const t = setInterval(loadLatest, 2000)
    return () => clearInterval(t)
  }, [sim, loadLatest])

  async function onStart() {
    setError(null)
    setStarting(true)
    try {
      const body: { spinCount: number; simulateBuyBonus?: boolean; seed?: number; variantId?: string } = {
        spinCount,
        simulateBuyBonus: buyBonus,
      }
      if (seed.trim() !== '') {
        const n = Number(seed)
        if (!Number.isFinite(n) || n < 0) throw new Error('seed must be a non-negative integer')
        body.seed = n
      }
      // Pass variantId so the API simulates the correct schema
      if (selectedVariantId) body.variantId = selectedVariantId
      await startSimulation(gameId!, body)
      setSim(null)
      setOutput(null)
      await loadLatest()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const isRunning = sim?.status === 'running' || sim?.status === 'pending'
  const selectedVariant = variants.find((v) => v.id === selectedVariantId)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        to={`/games/${gameId}`}
        className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block"
      >
        ← Back to game
      </Link>
      <h2 className="text-2xl font-semibold mb-6">Simulation</h2>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="text-sm font-semibold">Configure & Run</h3>

        {/* Variant selector — shown only when variants exist */}
        {variants.length > 0 && (
          <div>
            <label className="block text-xs font-medium mb-1">Variant</label>
            <select
              className="w-full max-w-xs rounded border border-border bg-background px-3 py-2 text-sm"
              value={selectedVariantId}
              onChange={(e) => {
                setSelectedVariantId(e.target.value)
                setSim(null)
                setOutput(null)
              }}
              disabled={starting || isRunning}
            >
              <option value="">Base game (R90 / default)</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.variantLabel ?? v.name}
                  {v.declaredRtp != null ? ` — declared ${(v.declaredRtp * 100).toFixed(1)}%` : ''}
                </option>
              ))}
            </select>
            {selectedVariant?.declaredRtp != null && (
              <p className="text-xs text-muted-foreground mt-1">
                Declared RTP: <span className="font-medium">{(selectedVariant.declaredRtp * 100).toFixed(1)}%</span>
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Spin count</label>
            <select
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={spinCount}
              onChange={(e) => setSpinCount(Number(e.target.value))}
              disabled={starting || isRunning}
            >
              {SPIN_COUNTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Seed (optional, 0 = random)</label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={starting || isRunning}
              placeholder="e.g. 12345"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={buyBonus}
                onChange={(e) => setBuyBonus(e.target.checked)}
                disabled={starting || isRunning}
              />
              Simulate buy bonus
            </label>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={onStart}
              disabled={starting || isRunning}
            >
              {starting ? 'Starting…' : isRunning ? 'Running…' : 'Run Simulation'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>

      {sim && (
        <div className="mt-6 rounded-lg border border-border p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Latest Simulation
              {selectedVariant && (
                <span className="ml-2 text-muted-foreground font-normal">({selectedVariant.variantLabel})</span>
              )}
            </h3>
            <StatusBadge status={sim.status} />
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Spin count requested</dt>
              <dd className="font-medium">{bigInt(sim.spinCount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Spins completed</dt>
              <dd className="font-medium">{bigInt(sim.totalSpins)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Started</dt>
              <dd className="font-medium">{new Date(sim.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last update</dt>
              <dd className="font-medium">{new Date(sim.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
          {sim.errorMessage && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{sim.errorMessage}</p>
            </div>
          )}
          {isRunning && (
            <p className="text-xs text-muted-foreground">Polling every 2 seconds…</p>
          )}
        </div>
      )}

      {output && (
        <>
          <ResultsPanel result={output} declaredRtp={selectedVariant?.declaredRtp ?? null} />
          <SymbolHitTable result={output} />
          {output.warnings.length > 0 && (
            <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <h3 className="text-sm font-semibold mb-2">Warnings</h3>
              <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-300">
                {output.warnings.map((w, i) => (<li key={i}>{w}</li>))}
              </ul>
            </div>
          )}
        </>
      )}

      {sim?.status === 'complete' && targetId && (
        <div className="mt-6">
          <ReportDownloads gameId={targetId} gameStatus="simulated" />
        </div>
      )}
    </div>
  )
}

function ResultsPanel({ result, declaredRtp }: { result: SimulationResult; declaredRtp: number | null }) {
  const hwCi95 = (result.confidence95High - result.confidence95Low) / 2
  const delta = declaredRtp != null ? result.rtp - declaredRtp : null
  const withinTolerance = delta != null && Math.abs(delta) <= 0.005

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="text-sm font-semibold">RTP</h3>
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <Row label="Total RTP" value={pct(result.rtp)} highlight />
          {declaredRtp != null && (
            <Row
              label="vs Declared"
              value={`${delta! >= 0 ? '+' : ''}${(delta! * 100).toFixed(4)}%`}
              verdict={withinTolerance ? 'pass' : 'fail'}
            />
          )}
          <Row label="Base RTP" value={pct(result.baseRtp)} />
          <Row label="Free spins RTP" value={pct(result.featureRtp.freeSpins)} />
          <Row label="Bonus RTP" value={pct(result.featureRtp.bonus)} />
          {result.buyBonus ? (
            <Row label="Buy bonus RTP" value={pct(result.featureRtp.buyBonus)} />
          ) : null}
          <Row label="Feature triggers" value={result.featureTriggerCount.toLocaleString()} />
        </div>
      </div>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="text-sm font-semibold">Statistics</h3>
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <Row label="Hit rate" value={pct(result.hitRate)} />
          <Row label="Variance" value={dec(result.variance)} />
          <Row label="Std dev" value={dec(result.standardDeviation)} />
          <Row label="90% CI" value={`${pct(result.confidence90Low)} – ${pct(result.confidence90High)}`} />
          <Row label="95% CI" value={`${pct(result.confidence95Low)} – ${pct(result.confidence95High)}`} />
          <Row label="95% CI half-width" value={pct(hwCi95)} />
          <Row label="Total spins" value={result.totalSpins.toLocaleString()} />
          <Row label="Total wagered" value={dec(result.totalBet, 2)} />
          <Row label="Total paid" value={dec(result.totalReturn, 2)} />
          <Row label="Run time" value={`${(result.durationMs / 1000).toFixed(2)} s`} />
        </div>
      </div>

      {result.buyBonus && (
        <div className="rounded-lg border border-border p-6 space-y-4 lg:col-span-2">
          <h3 className="text-sm font-semibold">Buy Bonus</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-sm">
            <Row label="Purchases" value={result.buyBonus.purchases.toLocaleString()} />
            <Row label="Total cost" value={dec(result.buyBonus.totalCost, 2)} />
            <Row label="Total return" value={dec(result.buyBonus.totalReturn, 2)} />
            <Row label="RTP" value={pct(result.buyBonus.rtp)} />
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
  verdict,
}: {
  label: string
  value: string
  highlight?: boolean
  verdict?: 'pass' | 'fail'
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={[
          highlight ? 'text-lg font-semibold' : 'font-medium',
          verdict === 'pass' ? 'text-green-600 dark:text-green-400' : '',
          verdict === 'fail' ? 'text-destructive' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function SymbolHitTable({ result }: { result: SimulationResult }) {
  const { symbolHitProbabilities: hits } = result
  const maxCount = hits.maxCount

  return (
    <div className="mt-6 rounded-lg border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold">Symbol Hit Probabilities</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Counts per symbol × match length across {hits.totalSpins.toLocaleString()} spins.
          Wild-assisted wins: {hits.wildAssistedWins.toLocaleString()} ({pct(hits.wildAssistRate)})
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs">
              <th className="px-4 py-2 font-medium">Symbol</th>
              {Array.from({ length: maxCount }, (_, i) => (
                <th key={`h-${i}`} className="px-4 py-2 font-medium text-right">{i + 1}× hits</th>
              ))}
              {Array.from({ length: maxCount }, (_, i) => (
                <th key={`p-${i}`} className="px-4 py-2 font-medium text-right">{i + 1}× prob</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hits.bySymbol.map((row) => (
              <tr key={row.symbol} className="border-t border-border">
                <td className="px-4 py-2 font-mono">{row.symbol}</td>
                {row.hits.map((h, i) => (
                  <td key={`h-${i}`} className="px-4 py-2 text-right tabular-nums">
                    {h.toLocaleString()}
                  </td>
                ))}
                {row.probs.map((p, i) => (
                  <td key={`p-${i}`} className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {p === 0 ? '—' : pct(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hits.scatterHits.some((n) => n > 0) && (
        <div className="border-t border-border px-6 py-4">
          <h4 className="text-xs font-semibold mb-2">Scatter count distribution</h4>
          <div className="flex flex-wrap gap-4 text-sm">
            {hits.scatterHits.map((h, i) => (
              <div key={i} className="text-xs">
                <span className="text-muted-foreground">{i}× scatter:</span>{' '}
                <span className="font-mono">{h.toLocaleString()}</span>{' '}
                <span className="text-muted-foreground">({pct(hits.scatterProbs[i])})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
