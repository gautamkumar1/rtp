import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getGame, type Game } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'

const TERMINAL_STATUSES = new Set(['complete', 'failed', 'scanned', 'analyzing', 'analyzed', 'simulated'])
const CANDIDATES_AVAILABLE = new Set(['analyzing', 'analyzed', 'simulating', 'simulated', 'reporting', 'complete'])
const SCHEMA_AVAILABLE = new Set(['analyzed', 'simulating', 'simulated', 'reporting', 'complete'])

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

  if (error) return <p className="p-8 text-destructive">{error}</p>
  if (!game) return <p className="p-8 text-muted-foreground">Loading…</p>

  const fileTree = game.analysisRuns[0]?.fileTreeJson
  const fileCount = Array.isArray(fileTree) ? fileTree.length : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block">
        ← Upload another
      </Link>
      <h2 className="text-2xl font-semibold mb-2">{game.name}</h2>
      <p className="text-muted-foreground text-sm mb-6">{game.originalFileName}</p>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status</span>
          <StatusBadge status={game.status} />
        </div>
        {fileCount !== null && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Files indexed</span>
            <span className="text-sm text-muted-foreground">{fileCount.toLocaleString()}</span>
          </div>
        )}
        {game.errorMessage && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-sm text-destructive">{game.errorMessage}</p>
          </div>
        )}
        {!TERMINAL_STATUSES.has(game.status) && (
          <p className="text-xs text-muted-foreground">Auto-refreshing every 2 seconds…</p>
        )}
      </div>

      {CANDIDATES_AVAILABLE.has(game.status) && (
        <div className="mt-6 rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Analysis</h3>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/games/${gameId}/candidates`}
              className="inline-block rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Static Parser Results →
            </Link>
            {SCHEMA_AVAILABLE.has(game.status) && (
              <Link
                to={`/games/${gameId}/schema`}
                className="inline-block rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                View Schema →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
