import { useEffect, useState, useCallback } from 'react'
import {
  getReportStatus,
  triggerReportGeneration,
  reportDownloadUrl,
  type ReportStatus,
  type ReportFormat,
} from '../lib/api'
import { cn } from '@/lib/utils'
import { Download, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface ReportDownloadsProps {
  gameId: string
  gameStatus: string
}

const FORMAT_META: Record<ReportFormat, { label: string; ext: string; description: string }> = {
  json: { label: 'JSON', ext: 'json', description: 'Machine-readable data' },
  excel: { label: 'Excel', ext: 'xlsx', description: 'Spreadsheet workbook' },
  pdf: { label: 'PDF', ext: 'pdf', description: 'Formatted report' },
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

  if (!eligible) return null

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
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading…
        </div>
      ) : !report ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            No reports generated yet. Build JSON, Excel, and PDF reports for the latest simulation.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            onClick={onTrigger}
            disabled={triggering || gameStatus === 'reporting'}
          >
            {triggering ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {triggering ? 'Starting…' : 'Generate Reports'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(['json', 'excel', 'pdf'] as ReportFormat[]).map(fmt => {
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
                : <><Loader2 className="w-3 h-3 animate-spin" /> Building — polling every 2s</>
              }
            </span>
            <button
              type="button"
              className="text-xs inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 hover:bg-accent disabled:opacity-50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={onTrigger}
              disabled={triggering || gameStatus === 'reporting'}
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
