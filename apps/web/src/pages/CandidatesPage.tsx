import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCandidates, type CandidatesResult, type AstCandidate } from '../lib/api'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'

const CONFIDENCE_CONFIG: Record<string, { dot: string; text: string }> = {
  high:   { dot: 'bg-success',             text: 'text-success' },
  medium: { dot: 'bg-warning',             text: 'text-warning' },
  low:    { dot: 'bg-muted-foreground',    text: 'text-muted-foreground' },
}

const LANG_COLORS: Record<string, string> = {
  go:   'bg-blue-500/10 text-blue-500 dark:text-blue-400',
  java: 'bg-orange-500/10 text-orange-500 dark:text-orange-400',
  c:    'bg-violet-500/10 text-violet-500 dark:text-violet-400',
  csv:  'bg-teal-500/10 text-teal-500 dark:text-teal-400',
  json: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400',
  sql:  'bg-red-500/10 text-red-500 dark:text-red-400',
  xml:  'bg-pink-500/10 text-pink-500 dark:text-pink-400',
  xlsx: 'bg-green-500/10 text-green-500 dark:text-green-400',
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const cfg = CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG.low
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
      <span className={cn('text-xs font-medium', cfg.text)}>{confidence}</span>
    </span>
  )
}

function LangPill({ lang }: { lang: string }) {
  const cls = LANG_COLORS[lang] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-mono font-medium', cls)}>
      {lang}
    </span>
  )
}

function CandidateCard({ candidate }: { candidate: AstCandidate }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceDot confidence={candidate.confidence} />
          <LangPill lang={candidate.language} />
          <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
            {candidate.kind}
          </span>
          <span className="font-medium text-sm ml-auto">{candidate.name}</span>
        </div>
        <p className="text-xs text-muted-foreground font-mono truncate" title={`${candidate.sourceFile}:${candidate.lineNumber}`}>
          {candidate.sourceFile}
          <span className="text-muted-foreground/50">:{candidate.lineNumber}</span>
          {candidate.sheet && <span className="ml-2 text-indigo-400">sheet:{candidate.sheet}</span>}
          {candidate.table && <span className="ml-2 text-red-400">table:{candidate.table}</span>}
        </p>
        <button
          onClick={() => setExpanded(v => !v)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} raw value
        </button>
      </div>
      {expanded && (
        <pre className="border-t border-border bg-muted/30 px-4 py-3 text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
          {candidate.rawValue}
        </pre>
      )}
    </div>
  )
}

function StatCard({ value, label, colorClass }: { value: string | number; label: string; colorClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
      <p className={cn('text-2xl font-bold tabular', colorClass)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  )
}

export function CandidatesPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [data, setData] = useState<CandidatesResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all')

  useEffect(() => {
    if (!gameId) return
    getCandidates(gameId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [gameId])

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2 py-12">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        Loading candidates…
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 py-12 max-w-2xl">
        <p className="text-sm text-destructive">{error}</p>
        <Link to={`/games/${gameId}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <ChevronRight className="w-3 h-3 rotate-180" />
          Back to game status
        </Link>
      </div>
    )
  }

  if (!data) return null

  const languages = [...new Set(data.astCandidates.map(c => c.language))]
  const filtered = data.astCandidates.filter(c => {
    const langOk = filter === 'all' || c.language === filter
    const confOk = confidenceFilter === 'all' || c.confidence === confidenceFilter
    return langOk && confOk
  })

  const highCount = data.astCandidates.filter(c => c.confidence === 'high').length
  const medCount = data.astCandidates.filter(c => c.confidence === 'medium').length
  const lowCount = data.astCandidates.filter(c => c.confidence === 'low').length

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/games/${gameId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ChevronRight className="w-3 h-3 rotate-180" />
            Back to game
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Static Parser Results</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{gameId}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={data.candidateFiles.length} label="Candidate Files" />
        <StatCard value={highCount} label="High Confidence" colorClass="text-success" />
        <StatCard value={medCount} label="Medium Confidence" colorClass="text-warning" />
        <StatCard value={lowCount} label="Low Confidence" colorClass="text-muted-foreground" />
      </div>

      {/* Files table */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classified Source Files</p>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                {['File', 'Ext', 'Score', 'Reasons'].map((h, i) => (
                  <th key={h} className={cn(
                    'px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wide',
                    i === 2 ? 'text-right' : 'text-left'
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.candidateFiles.slice(0, 20).map((cf, i) => (
                <tr key={i} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 font-mono max-w-xs truncate text-muted-foreground/80" title={cf.path}>
                    {cf.path}
                  </td>
                  <td className="px-4 py-2">
                    <LangPill lang={cf.extension.slice(1) || cf.extension} />
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular">{cf.relevanceScore}</td>
                  <td className="px-4 py-2 text-muted-foreground">{cf.reason.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.candidateFiles.length > 20 && (
            <div className="px-4 py-2 text-xs text-muted-foreground/60 bg-muted/20 border-t border-border/50">
              + {data.candidateFiles.length - 20} more files
            </div>
          )}
        </div>
      </div>

      {/* Candidates */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Extracted Math Candidates ({filtered.length})
          </p>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-xs border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All languages</option>
              {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
            </select>
            <select
              value={confidenceFilter}
              onChange={e => setConfidenceFilter(e.target.value)}
              className="text-xs border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All confidence</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            No candidates match the current filters.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((candidate, i) => (
              <CandidateCard key={i} candidate={candidate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
