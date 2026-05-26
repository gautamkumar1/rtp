import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  triggerRtpAnalysis,
  getRtpAnalysis,
  resetRtpAnalysis,
  triggerReportsFromAnalysis,
  getReportStatus,
  reportDownloadUrl,
  type RtpAnalysisResult,
  type RtpVariantResult,
  type ReportStatus,
} from '../lib/api'
import { cn } from '@/lib/utils'
import { ChevronRight, PlayCircle, RotateCcw, CheckCircle2, XCircle, Minus, Download, RefreshCw, Loader2, AlertCircle } from 'lucide-react'

const PCT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const PCT2 = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function pct(n: number | null | undefined, dec = 4): string {
  if (n == null || Number.isNaN(n)) return '—'
  return dec === 2 ? PCT2.format(Number(n)) : PCT.format(Number(n))
}

const PROGRESS_MESSAGES = [
  'Reading reel configuration…',
  'Extracting symbol definitions…',
  'Evaluating paytable combinations…',
  'Computing base game contributions…',
  'Calculating feature probabilities…',
  'Enumerating free spin outcomes…',
  'Summing RTP components…',
  'Verifying results…',
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

function ProgressPanel({ startedAt }: { startedAt: number }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % PROGRESS_MESSAGES.length), 4000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
        <div>
          <p className="text-sm font-semibold">Verification in progress</p>
          <p className="text-xs text-muted-foreground">Elapsed: <ElapsedTimer startedAt={startedAt} /></p>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-px bg-border" />
        <p className="text-xs text-muted-foreground italic">{PROGRESS_MESSAGES[idx]}</p>
      </div>
      <p className="text-xs text-muted-foreground/60">
        This typically takes 2–5 minutes for complex games.
      </p>
    </div>
  )
}

function VerdictIcon({ pass }: { pass: boolean | null }) {
  if (pass === null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />
  return pass
    ? <CheckCircle2 className="w-4 h-4 text-success" />
    : <XCircle className="w-4 h-4 text-destructive" />
}

function DataRow({ label, value, highlight, verdict }: {
  label: string; value: string; highlight?: boolean; verdict?: 'pass' | 'fail'
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn(
        'text-right tabular',
        highlight ? 'text-base font-semibold' : 'text-sm font-medium',
        verdict === 'pass' && 'text-success',
        verdict === 'fail' && 'text-destructive',
      )}>
        {verdict && (
          <span className="inline-flex items-center gap-1.5">
            {verdict === 'pass'
              ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              : <XCircle className="w-3.5 h-3.5 text-destructive" />}
            {value}
          </span>
        )}
        {!verdict && value}
      </dd>
    </div>
  )
}

function VariantCard({ v }: { v: RtpVariantResult }) {
  const delta = v.declaredRtp != null ? v.totalRtp - v.declaredRtp : null
  const pass = delta != null ? Math.abs(delta) <= 0.001 : null

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <span className="text-xs font-mono font-semibold">{v.variantLabel}</span>
        <VerdictIcon pass={pass} />
      </div>
      <div className="p-4">
        <dl className="space-y-0">
          <DataRow label="Total RTP" value={pct(v.totalRtp)} highlight />
          <DataRow label="Base game" value={pct(v.baseRtp)} />
          <DataRow label="Free spins" value={pct(v.freeSpinsRtp)} />
          {v.retriggerRtp != null && <DataRow label="Re-trigger" value={pct(v.retriggerRtp)} />}
          {v.buyBonusRtp != null && <DataRow label="Buy bonus" value={pct(v.buyBonusRtp)} />}
          {v.declaredRtp != null && (
            <DataRow
              label="vs Declared"
              value={`${delta! >= 0 ? '+' : ''}${(delta! * 100).toFixed(3)}%`}
              verdict={pass ? 'pass' : 'fail'}
            />
          )}
          {v.hitRate != null && <DataRow label="Hit rate" value={pct(v.hitRate, 2)} />}
          {v.featureTriggerFrequency && <DataRow label="Feature trigger" value={v.featureTriggerFrequency} />}
          {v.avgFreeSpins != null && <DataRow label="Avg free spins" value={v.avgFreeSpins.toFixed(1)} />}
        </dl>
        {v.notes && (
          <p className="text-xs text-muted-foreground/70 mt-3 pt-3 border-t border-border/40 italic">{v.notes}</p>
        )}
      </div>
    </div>
  )
}

function SummaryTable({ result }: { result: RtpAnalysisResult }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">RTP Summary</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30">
              {['Variant', 'Total', 'Base', 'Free Spins', 'Re-trig', 'Buy Bonus', 'Declared', 'Delta', ''].map((h, i) => (
                <th key={i} className={cn(
                  'py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide',
                  i === 0 ? 'text-left' : i === 8 ? 'text-center' : 'text-right'
                )}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.variants.map(v => {
              const delta = v.declaredRtp != null ? v.totalRtp - v.declaredRtp : null
              const pass = delta != null ? Math.abs(delta) <= 0.001 : null
              return (
                <tr key={v.variantLabel} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs font-semibold">{v.variantLabel}</td>
                  <td className="py-3 px-4 text-right text-sm tabular font-medium">{pct(v.totalRtp)}</td>
                  <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{pct(v.baseRtp)}</td>
                  <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{pct(v.freeSpinsRtp)}</td>
                  <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{v.retriggerRtp != null ? pct(v.retriggerRtp) : '—'}</td>
                  <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{v.buyBonusRtp != null ? pct(v.buyBonusRtp) : '—'}</td>
                  <td className="py-3 px-4 text-right text-xs tabular text-muted-foreground">{v.declaredRtp != null ? pct(v.declaredRtp, 2) : '—'}</td>
                  <td className="py-3 px-4 text-right">
                    {delta != null
                      ? <span className={cn('font-mono text-xs tabular', pass ? 'text-success' : 'text-destructive')}>
                          {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(3)}%
                        </span>
                      : <span className="text-muted-foreground text-xs">—</span>
                    }
                  </td>
                  <td className="py-3 px-4 text-center">
                    <VerdictIcon pass={pass} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const FORMAT_META = {
  json: { label: 'JSON', ext: 'json', description: 'Machine-readable data' },
  excel: { label: 'Excel', ext: 'xlsx', description: 'Spreadsheet workbook' },
  pdf: { label: 'PDF', ext: 'pdf', description: 'Formatted report' },
} as const

function ReportsPanel({ gameId }: { gameId: string }) {
  const [report, setReport] = useState<ReportStatus | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await getReportStatus(gameId)
      setReport(r)
    } catch {
      // no report yet, that's fine
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!report) return
    const allReady = report.json.ready && report.excel.ready && report.pdf.ready
    if (allReady) return
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [report, refresh])

  async function onGenerate() {
    setTriggering(true)
    setError(null)
    try {
      await triggerReportsFromAnalysis(gameId)
      setReport(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate reports')
    } finally {
      setTriggering(false)
    }
  }

  const allReady = report?.json.ready && report?.excel.ready && report?.pdf.ready

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reports</p>
        {report && (
          <span className="text-xs text-muted-foreground">
            Generated {new Date(report.createdAt).toLocaleString()}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      ) : !report ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Generate JSON and Excel reports for this verification.
          </p>
          <button
            onClick={onGenerate}
            disabled={triggering}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {triggering ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {triggering ? 'Generating…' : 'Generate Reports'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(['json', 'excel', 'pdf'] as const).map(fmt => {
              const meta = FORMAT_META[fmt]
              const ready = report[fmt].ready
              const href = reportDownloadUrl(gameId, fmt)
              return (
                <a
                  key={fmt}
                  href={ready ? href : undefined}
                  download={ready ? `${gameId}-report.${meta.ext}` : undefined}
                  aria-disabled={!ready}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-4 py-3 transition-all duration-150 group',
                    ready
                      ? 'border-border hover:border-primary/40 hover:bg-accent cursor-pointer'
                      : 'border-border/50 opacity-50 cursor-not-allowed'
                  )}
                  onClick={e => { if (!ready) e.preventDefault() }}
                >
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                  {ready
                    ? <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    : <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                  }
                </a>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {allReady
                ? <><CheckCircle2 className="w-3 h-3 text-success" /> All formats ready</>
                : <><Loader2 className="w-3 h-3 animate-spin" /> Building…</>
              }
            </span>
            <button
              onClick={onGenerate}
              disabled={triggering}
              className="text-xs inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 hover:bg-accent disabled:opacity-50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3 h-3" />
              Rebuild
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}

export function SimulationPage() {
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
      setError(e instanceof Error ? e.message : String(e))
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

  const multiVariant = result && result.variants.length > 1

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/games/${gameId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ChevronRight className="w-3 h-3 rotate-180" />
            Back to game
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">RTP Verification</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verify return-to-player across all declared variants
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
              <PlayCircle className="w-3.5 h-3.5" />
              {status === 'idle' ? 'Run Verification' : 'Re-run'}
            </button>
          )}
        </div>
      </div>

      {/* Running */}
      {status === 'running' && <ProgressPanel startedAt={startedAt || Date.now()} />}

      {/* Error */}
      {status === 'failed' && !result && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 p-4">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">Verification failed. {error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Game meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Game type', value: result.gameType || '—' },
              { label: 'Mechanic', value: result.mechanic || '—' },
              { label: 'Reel config', value: result.reelConfig || '—' },
              { label: 'Variants', value: String(result.variants.length) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>

          {/* Game logic summary */}
          {result.gameLogicSummary && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Summary</p>
              <p className="text-sm leading-relaxed text-foreground/80">{result.gameLogicSummary}</p>
            </div>
          )}

          {/* Table for multi-variant, cards for single */}
          {multiVariant ? (
            <SummaryTable result={result} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.variants.map(v => <VariantCard key={v.variantLabel} v={v} />)}
            </div>
          )}

          {/* Multi-variant: also show cards below */}
          {multiVariant && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.variants.map(v => <VariantCard key={v.variantLabel} v={v} />)}
            </div>
          )}

          {/* Completed timestamp */}
          <p className="text-xs text-muted-foreground/60">
            Completed {new Date(result.completedAt).toLocaleString()}
          </p>

          {/* Reports */}
          <ReportsPanel gameId={gameId!} />
        </div>
      )}

      {/* Idle state */}
      {status === 'idle' && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <PlayCircle className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No verification yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click "Run Verification" to compute RTP for all declared variants.
            </p>
          </div>
          <button
            onClick={handleStart}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Run Verification
          </button>
        </div>
      )}

      {status === 'running' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Checking for results every 5 seconds…
        </div>
      )}
    </div>
  )
}
