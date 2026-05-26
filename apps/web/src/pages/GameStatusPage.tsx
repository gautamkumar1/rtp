import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getGame, type Game } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'
import { ReportDownloads } from '../components/ReportDownloads'
import { cn } from '@/lib/utils'
import { ChevronRight, FileSearch, DatabaseZap, PlayCircle, FileText, AlertCircle, RefreshCw } from 'lucide-react'

const TERMINAL_STATUSES = new Set(['complete', 'failed'])
const CANDIDATES_AVAILABLE = new Set(['analyzing', 'analyzed', 'simulating', 'simulated', 'reporting', 'complete'])
const SCHEMA_AVAILABLE = new Set(['analyzed', 'simulating', 'simulated', 'reporting', 'complete'])
const SIMULATION_AVAILABLE = new Set(['analyzed', 'simulating', 'simulated', 'reporting', 'complete'])
const REPORTS_AVAILABLE = new Set(['simulated', 'reporting', 'complete'])

interface ActionCardProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
  variant?: 'default' | 'primary'
}

function ActionCard({ to, icon, title, description, variant = 'default' }: ActionCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center justify-between rounded-lg border p-4 transition-all duration-150',
        variant === 'primary'
          ? 'border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60'
          : 'border-border bg-card hover:bg-accent hover:border-border'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
          variant === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:text-foreground'
        )}>
          {icon}
        </div>
        <div>
          <p className={cn('text-sm font-medium', variant === 'primary' && 'text-primary')}>{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <ChevronRight className={cn(
        'w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5',
        variant === 'primary' ? 'text-primary/60' : 'text-muted-foreground/40'
      )} />
    </Link>
  )
}

export function GameStatusPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) return
    let stopped = false

    async function poll() {
      try {
        const g = await getGame(gameId!)
        if (!stopped) {
          setGame(g)
          if (!TERMINAL_STATUSES.has(g.status)) {
            setTimeout(poll, 2000)
          }
        }
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Error fetching game')
      }
    }

    poll()
    return () => { stopped = true }
  }, [gameId])

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 p-4">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="max-w-2xl mx-auto py-12 flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading game…</span>
      </div>
    )
  }

  const fileTree = game.analysisRuns[0]?.fileTreeJson
  const fileCount = Array.isArray(fileTree) ? fileTree.length : null
  const isProcessing = !TERMINAL_STATUSES.has(game.status)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ChevronRight className="w-3 h-3 rotate-180" />
          Upload another
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{game.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{game.originalFileName}</p>
      </div>

      {/* Status card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
          <StatusBadge status={game.status} />
        </div>

        {fileCount !== null && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Files indexed</span>
            <span className="text-sm tabular font-medium">{fileCount.toLocaleString()}</span>
          </div>
        )}

        {game.errorMessage && (
          <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive">{game.errorMessage}</p>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-2 pt-1">
            <div className="flex gap-0.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1 h-1 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">Processing — refreshing every 2s</span>
          </div>
        )}
      </div>

      {/* Analysis actions */}
      {CANDIDATES_AVAILABLE.has(game.status) && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5">Analysis</p>
          <div className="space-y-2">
            <ActionCard
              to={`/games/${gameId}/candidates`}
              icon={<FileSearch className="w-4 h-4" />}
              title="Static Parser Results"
              description="Extracted math candidates from source code"
            />
            {SCHEMA_AVAILABLE.has(game.status) && (
              <ActionCard
                to={`/games/${gameId}/schema`}
                icon={<DatabaseZap className="w-4 h-4" />}
                title="Game Schema"
                description="AI-extracted game mechanics and paytable"
              />
            )}
            {SIMULATION_AVAILABLE.has(game.status) && (
              <ActionCard
                to={`/games/${gameId}/simulation`}
                icon={<PlayCircle className="w-4 h-4" />}
                title="RTP Verification"
                description="Compute and verify return-to-player for all variants"
                variant="primary"
              />
            )}
          </div>
        </div>
      )}

      {/* Reports */}
      {REPORTS_AVAILABLE.has(game.status) && gameId && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5">
            <FileText className="w-3 h-3 inline mr-1" />Reports
          </p>
          <ReportDownloads gameId={gameId} gameStatus={game.status} />
        </div>
      )}
    </div>
  )
}
