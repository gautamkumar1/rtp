import { useEffect, useState, useCallback } from 'react'
import {
  getReportStatus,
  triggerReportGeneration,
  reportDownloadUrl,
  type ReportStatus,
  type ReportFormat,
} from '../lib/api'

interface ReportDownloadsProps {
  gameId: string
  gameStatus: string
}

const FORMAT_META: Record<ReportFormat, { label: string; ext: string; mime: string }> = {
  json: { label: 'JSON', ext: 'json', mime: 'application/json' },
  excel: { label: 'Excel', ext: 'xlsx', mime: 'spreadsheet' },
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
}

export function ReportDownloads({ gameId, gameStatus }: ReportDownloadsProps) {
  const [report, setReport] = useState<ReportStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await getReportStatus(gameId)
      setReport(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => { refresh() }, [refresh])

  // Poll while game is in reporting state or any format isn't ready yet.
  useEffect(() => {
    const anyMissing = !report || !report.json.ready || !report.excel.ready || !report.pdf.ready
    const inFlight = gameStatus === 'reporting' || gameStatus === 'simulated'
    if (!anyMissing && !inFlight) return
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [report, gameStatus, refresh])

  async function onTrigger() {
    setTriggering(true)
    setError(null)
    try {
      await triggerReportGeneration(gameId)
      setReport(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start report generation')
    } finally {
      setTriggering(false)
    }
  }

  const allReady = report?.json.ready && report?.excel.ready && report?.pdf.ready
  const eligible = ['simulated', 'reporting', 'complete'].includes(gameStatus)

  if (!eligible) {
    return (
      <div className="rounded-lg border border-border p-6">
        <h3 className="text-sm font-semibold mb-2">Reports</h3>
        <p className="text-sm text-muted-foreground">
          Reports become available after a simulation completes.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Reports</h3>
        {report && (
          <span className="text-xs text-muted-foreground">
            Generated {new Date(report.createdAt).toLocaleString()}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !report ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No report generated yet. Click below to build JSON, Excel, and PDF reports for the latest simulation.
          </p>
          <button
            type="button"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={onTrigger}
            disabled={triggering || gameStatus === 'reporting'}
          >
            {triggering ? 'Starting…' : 'Generate Reports'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['json', 'excel', 'pdf'] as ReportFormat[]).map((fmt) => {
              const meta = FORMAT_META[fmt]
              const ready = report[fmt].ready
              const href = reportDownloadUrl(gameId, fmt)
              return (
                <a
                  key={fmt}
                  href={ready ? href : undefined}
                  download={ready ? `${gameId}-report.${meta.ext}` : undefined}
                  aria-disabled={!ready}
                  className={`flex items-center justify-between rounded border px-4 py-3 text-sm font-medium transition-colors ${
                    ready
                      ? 'border-border hover:bg-muted cursor-pointer'
                      : 'border-border opacity-50 cursor-not-allowed'
                  }`}
                  onClick={(e) => { if (!ready) e.preventDefault() }}
                >
                  <span>Download {meta.label}</span>
                  <span className={`text-xs ${ready ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {ready ? 'ready ↓' : 'building…'}
                  </span>
                </a>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {allReady ? 'All formats are ready.' : 'Some formats are still being built — polling every 2s.'}
            </span>
            <button
              type="button"
              className="text-xs rounded border border-border px-3 py-1 hover:bg-muted disabled:opacity-50"
              onClick={onTrigger}
              disabled={triggering || gameStatus === 'reporting'}
            >
              {triggering ? 'Rebuilding…' : 'Rebuild reports'}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
