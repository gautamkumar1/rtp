import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCandidates, type CandidatesResult, type AstCandidate } from '../lib/api'

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800 border border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  low: 'bg-gray-100 text-gray-600 border border-gray-300',
}

const LANG_COLORS: Record<string, string> = {
  go: 'bg-blue-100 text-blue-700',
  java: 'bg-orange-100 text-orange-700',
  c: 'bg-purple-100 text-purple-700',
  csv: 'bg-teal-100 text-teal-700',
  json: 'bg-indigo-100 text-indigo-700',
  sql: 'bg-red-100 text-red-700',
  xml: 'bg-pink-100 text-pink-700',
  xlsx: 'bg-green-100 text-green-700',
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_COLORS[confidence] ?? 'bg-gray-100 text-gray-600'}`}>
      {confidence}
    </span>
  )
}

function LangBadge({ lang }: { lang: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${LANG_COLORS[lang] ?? 'bg-gray-100 text-gray-600'}`}>
      {lang}
    </span>
  )
}

function CandidateCard({ candidate }: { candidate: AstCandidate }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={candidate.confidence} />
        <LangBadge lang={candidate.language} />
        <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
          {candidate.kind}
        </span>
        <span className="font-semibold text-sm">{candidate.name}</span>
      </div>
      <div className="text-xs text-muted-foreground font-mono">
        {candidate.sourceFile}:{candidate.lineNumber}
        {candidate.sheet && <span className="ml-2 text-indigo-500">sheet: {candidate.sheet}</span>}
        {candidate.table && <span className="ml-2 text-red-500">table: {candidate.table}</span>}
      </div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-primary hover:underline focus:outline-none"
      >
        {expanded ? 'Hide raw value' : 'Show raw value'}
      </button>
      {expanded && (
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
          {candidate.rawValue}
        </pre>
      )}
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
    return <div className="text-muted-foreground">Loading candidates…</div>
  }
  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Link to={`/games/${gameId}`} className="text-primary hover:underline text-sm">
          ← Back to game status
        </Link>
      </div>
    )
  }
  if (!data) return null

  const languages = [...new Set(data.astCandidates.map((c) => c.language))]
  const filtered = data.astCandidates.filter((c) => {
    const langOk = filter === 'all' || c.language === filter
    const confOk = confidenceFilter === 'all' || c.confidence === confidenceFilter
    return langOk && confOk
  })

  const highCount = data.astCandidates.filter((c) => c.confidence === 'high').length
  const medCount = data.astCandidates.filter((c) => c.confidence === 'medium').length
  const lowCount = data.astCandidates.filter((c) => c.confidence === 'low').length

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Static Parser Results</h2>
          <p className="text-sm text-muted-foreground mt-1">Game {gameId}</p>
        </div>
        <Link to={`/games/${gameId}`} className="text-primary hover:underline text-sm">
          ← Back to status
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{data.candidateFiles.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Candidate Files</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{highCount}</div>
          <div className="text-xs text-muted-foreground mt-1">High Confidence</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{medCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Medium Confidence</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-gray-500">{lowCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Low Confidence</div>
        </div>
      </div>

      {/* Candidate Files List */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Classified Source Files</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">File</th>
                <th className="text-left px-4 py-2 font-medium">Ext</th>
                <th className="text-right px-4 py-2 font-medium">Score</th>
                <th className="text-left px-4 py-2 font-medium">Reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.candidateFiles.slice(0, 20).map((cf, i) => (
                <tr key={i} className="hover:bg-muted/50">
                  <td className="px-4 py-2 font-mono text-xs max-w-xs truncate" title={cf.path}>
                    {cf.path}
                  </td>
                  <td className="px-4 py-2">
                    <LangBadge lang={cf.extension.slice(1) || cf.extension} />
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{cf.relevanceScore}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{cf.reason.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.candidateFiles.length > 20 && (
            <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/50">
              + {data.candidateFiles.length - 20} more files
            </div>
          )}
        </div>
      </div>

      {/* AST Candidates */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <h3 className="text-lg font-semibold">Extracted Math Candidates ({filtered.length})</h3>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border border-border rounded px-2 py-1 bg-background"
            >
              <option value="all">All languages</option>
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              className="text-sm border border-border rounded px-2 py-1 bg-background"
            >
              <option value="all">All confidence</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-muted-foreground">
            No candidates match the current filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((candidate, i) => (
              <CandidateCard key={i} candidate={candidate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
