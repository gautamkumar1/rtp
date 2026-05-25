import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSchema, getMechanics, type GameSchemaData } from '../lib/api'

type Tab = 'reels' | 'paylines' | 'symbols' | 'paytable' | 'features' | 'mechanics' | 'warnings'

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[confidence]}`}>
      {confidence}
    </span>
  )
}

function ReelsTab({ schema }: { schema: GameSchemaData }) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        {schema.reels.length} reels
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {schema.reels.map((reel, i) => {
          const counts: Record<string, number> = {}
          for (const s of reel) counts[s] = (counts[s] ?? 0) + 1
          return (
            <div key={i} className="border border-border rounded-lg min-w-[120px]">
              <div
                className="px-3 py-2 border-b border-border bg-muted/50 text-xs font-medium cursor-pointer flex justify-between items-center"
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <span>Reel {i + 1}</span>
                <span className="text-muted-foreground">{reel.length}</span>
              </div>
              {expanded === i ? (
                <div className="p-2 max-h-64 overflow-y-auto">
                  {reel.map((sym, j) => {
                    const def = schema.symbols.find((s) => s.id === sym)
                    return (
                      <div
                        key={j}
                        className={`text-xs px-1 py-0.5 rounded mb-0.5 ${
                          def?.isWild
                            ? 'bg-purple-100 text-purple-900 dark:bg-purple-900 dark:text-purple-100'
                            : def?.isScatter
                            ? 'bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {sym}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-2">
                  {Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([sym, cnt]) => (
                      <div key={sym} className="text-xs flex justify-between">
                        <span className="truncate mr-2">{sym}</span>
                        <span className="text-muted-foreground">×{cnt}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PaylinesTab({ schema }: { schema: GameSchemaData }) {
  const rows = Math.max(...schema.paylines.map((pl) => Math.max(...pl))) + 1
  const cols = schema.reels.length

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        {schema.paylines.length} paylines · {cols} reels × {rows} rows
      </p>
      <div className="grid gap-2">
        {schema.paylines.slice(0, 20).map((pl, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-8 text-right">{i + 1}</span>
            <div className="flex gap-1">
              {Array.from({ length: cols }, (_, col) => (
                <div key={col} className="flex flex-col gap-0.5">
                  {Array.from({ length: rows }, (_, row) => (
                    <div
                      key={row}
                      className={`w-5 h-5 rounded-sm ${
                        pl[col] === row
                          ? 'bg-primary'
                          : 'bg-muted border border-border'
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">[{pl.join(',')}]</span>
          </div>
        ))}
        {schema.paylines.length > 20 && (
          <p className="text-xs text-muted-foreground">
            + {schema.paylines.length - 20} more paylines
          </p>
        )}
      </div>
    </div>
  )
}

function SymbolsTab({ schema }: { schema: GameSchemaData }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {schema.symbols.map((sym) => (
        <div key={sym.id} className="border border-border rounded-lg p-3">
          <div className="font-mono text-sm font-medium">{sym.id}</div>
          <div className="text-xs text-muted-foreground">{sym.name}</div>
          <div className="flex gap-1 mt-1">
            {sym.isWild && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                Wild
              </span>
            )}
            {sym.isScatter && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                Scatter
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function PaytableTab({ schema }: { schema: GameSchemaData }) {
  const countKeys = Array.from(
    new Set(
      Object.values(schema.paytable).flatMap((pays) => Object.keys(pays)),
    ),
  ).sort((a, b) => Number(a) - Number(b))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 font-medium">Symbol</th>
            {countKeys.map((cnt) => (
              <th key={cnt} className="text-right py-2 px-3 font-medium">
                {cnt}×
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(schema.paytable).map(([sym, pays]) => {
            const def = schema.symbols.find((s) => s.id === sym)
            return (
              <tr key={sym} className="border-b border-border/50">
                <td className="py-2 px-3">
                  <span className="font-mono text-xs">{sym}</span>
                  {def?.name && def.name !== sym && (
                    <span className="text-muted-foreground ml-2 text-xs">{def.name}</span>
                  )}
                </td>
                {countKeys.map((cnt) => (
                  <td key={cnt} className="py-2 px-3 text-right">
                    {pays[cnt] !== undefined ? (
                      <span className="font-mono">{pays[cnt]}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FeaturesTab({ schema }: { schema: GameSchemaData }) {
  return (
    <div className="space-y-6">
      {schema.wild && (
        <section>
          <h3 className="text-sm font-medium mb-2">Wild</h3>
          <div className="text-sm space-y-1 bg-muted/30 rounded-lg p-3">
            <div><span className="text-muted-foreground">Symbol:</span> <span className="font-mono">{schema.wild.symbolId}</span></div>
            <div><span className="text-muted-foreground">Substitutes for:</span> {schema.wild.substitutesFor.length === 0 ? 'all non-scatter' : schema.wild.substitutesFor.join(', ')}</div>
            {schema.wild.multiplier && schema.wild.multiplier !== 1 && (
              <div><span className="text-muted-foreground">Multiplier:</span> {schema.wild.multiplier}×</div>
            )}
            {schema.wild.restrictions && (
              <div><span className="text-muted-foreground">Restrictions:</span> {schema.wild.restrictions}</div>
            )}
          </div>
        </section>
      )}

      {schema.scatter && (
        <section>
          <h3 className="text-sm font-medium mb-2">Scatter</h3>
          <div className="text-sm space-y-1 bg-muted/30 rounded-lg p-3">
            <div><span className="text-muted-foreground">Symbol:</span> <span className="font-mono">{schema.scatter.symbolId}</span></div>
            <div><span className="text-muted-foreground">Trigger at:</span> {schema.scatter.triggerCount} scatters</div>
            <div><span className="text-muted-foreground">Awards:</span> {schema.scatter.awardType}</div>
            {schema.scatter.pays && (
              <div>
                <span className="text-muted-foreground">Scatter pays:</span>{' '}
                {Object.entries(schema.scatter.pays).map(([cnt, mult]) => `${cnt}× → ${mult}`).join(', ')}
              </div>
            )}
          </div>
        </section>
      )}

      {schema.freeSpins && (
        <section>
          <h3 className="text-sm font-medium mb-2">Free Spins</h3>
          <div className="text-sm space-y-1 bg-muted/30 rounded-lg p-3">
            <div><span className="text-muted-foreground">Count:</span> {schema.freeSpins.count}</div>
            <div><span className="text-muted-foreground">Multiplier:</span> {schema.freeSpins.multiplier}×</div>
            <div><span className="text-muted-foreground">Retrigger:</span> {schema.freeSpins.retrigger ? `Yes (+${schema.freeSpins.retriggerCount ?? '?'} spins)` : 'No'}</div>
            {schema.freeSpins.specialRules && (
              <div><span className="text-muted-foreground">Special:</span> {schema.freeSpins.specialRules}</div>
            )}
          </div>
        </section>
      )}

      {schema.bonus && (
        <section>
          <h3 className="text-sm font-medium mb-2">Bonus Round</h3>
          <div className="text-sm space-y-1 bg-muted/30 rounded-lg p-3">
            <div><span className="text-muted-foreground">Description:</span> {schema.bonus.description}</div>
            <div><span className="text-muted-foreground">Trigger:</span> {schema.bonus.triggerCondition}</div>
            {schema.bonus.specialRules && (
              <div><span className="text-muted-foreground">Special:</span> {schema.bonus.specialRules}</div>
            )}
          </div>
        </section>
      )}

      {schema.buyBonus && (
        <section>
          <h3 className="text-sm font-medium mb-2">Buy Bonus</h3>
          <div className="text-sm space-y-1 bg-muted/30 rounded-lg p-3">
            <div><span className="text-muted-foreground">Cost:</span> {schema.buyBonus.costMultiplier}× bet</div>
            <div><span className="text-muted-foreground">Entry point:</span> {schema.buyBonus.entryPoint}</div>
            {schema.buyBonus.rtp && (
              <div><span className="text-muted-foreground">Declared RTP:</span> {(schema.buyBonus.rtp * 100).toFixed(2)}%</div>
            )}
          </div>
        </section>
      )}

      {!schema.wild && !schema.scatter && !schema.freeSpins && !schema.bonus && !schema.buyBonus && (
        <p className="text-sm text-muted-foreground">No special features detected.</p>
      )}
    </div>
  )
}

function MechanicsTab({ gameId }: { gameId: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMechanics(gameId)
      .then(setContent)
      .catch((e) => setError(String(e.message)))
  }, [gameId])

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>
  if (!content) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{content}</pre>
    </div>
  )
}

function WarningsTab({ schema }: { schema: GameSchemaData }) {
  const [expandedEvidence, setExpandedEvidence] = useState<number | null>(null)

  return (
    <div className="space-y-6">
      {schema.warnings.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2">Warnings ({schema.warnings.length})</h3>
          <ul className="space-y-1">
            {schema.warnings.map((w, i) => (
              <li key={i} className="text-sm flex items-start gap-2 bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 rounded-md">
                <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {schema.assumptions.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2">Assumptions ({schema.assumptions.length})</h3>
          <ul className="space-y-2">
            {schema.assumptions.map((a, i) => (
              <li key={i} className="border border-border rounded-lg p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs">{a.field}</span>
                  {a.canBeImproved && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 shrink-0">
                      improvable
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground mt-1">
                  Assumed: <span className="font-mono text-foreground">{JSON.stringify(a.assumedValue)}</span>
                </div>
                <div className="text-muted-foreground mt-1">{a.reason}</div>
                {a.improvementHint && (
                  <div className="text-blue-600 dark:text-blue-400 mt-1 text-xs">Hint: {a.improvementHint}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {schema.sourceEvidence.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2">Source Evidence ({schema.sourceEvidence.length})</h3>
          <ul className="space-y-2">
            {schema.sourceEvidence.map((ev, i) => (
              <li key={i} className="border border-border rounded-lg overflow-hidden">
                <div
                  className="px-3 py-2 bg-muted/50 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedEvidence(expandedEvidence === i ? null : i)}
                >
                  <span className="text-xs font-mono truncate mr-2">{ev.filePath}{ev.lineNumber ? `:${ev.lineNumber}` : ''}</span>
                  <ConfidenceBadge confidence={ev.confidence} />
                </div>
                {expandedEvidence === i && (
                  <div className="p-3 text-xs space-y-1">
                    <div className="text-muted-foreground">{ev.reasoning}</div>
                    <pre className="bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                      {ev.rawValue}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {schema.warnings.length === 0 && schema.assumptions.length === 0 && schema.sourceEvidence.length === 0 && (
        <p className="text-sm text-muted-foreground">No warnings or assumptions.</p>
      )}
    </div>
  )
}

export function SchemaPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [schema, setSchema] = useState<GameSchemaData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('reels')

  useEffect(() => {
    if (!gameId) return
    getSchema(gameId)
      .then(setSchema)
      .catch((e) => setError(e.message))
  }, [gameId])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link to={`/games/${gameId}`} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
          ← Back to game
        </Link>
        <div className="mt-4 p-4 border border-border rounded-lg text-sm text-muted-foreground">{error}</div>
      </div>
    )
  }

  if (!schema) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link to={`/games/${gameId}`} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
          ← Back to game
        </Link>
        <p className="text-sm text-muted-foreground mt-4">Loading schema…</p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'reels', label: 'Reels', badge: schema.reels.length },
    { id: 'paylines', label: 'Paylines', badge: schema.paylines.length },
    { id: 'symbols', label: 'Symbols', badge: schema.symbols.length },
    { id: 'paytable', label: 'Paytable', badge: Object.keys(schema.paytable).length },
    { id: 'features', label: 'Features' },
    { id: 'mechanics', label: 'Mechanics Doc' },
    {
      id: 'warnings',
      label: 'Warnings',
      badge: schema.warnings.length + schema.assumptions.length,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/games/${gameId}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <div>
          <h2 className="text-lg font-semibold">{schema.gameName}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{schema.provider}</span>
            <span>·</span>
            <span className="font-mono text-xs">{schema.schemaVersion}</span>
            {schema.warnings.length > 0 && (
              <>
                <span>·</span>
                <span className="text-yellow-600 dark:text-yellow-400">
                  {schema.warnings.length} warning{schema.warnings.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
        <div className="border border-border rounded-lg p-3">
          <div className="text-muted-foreground text-xs mb-1">Bet Config</div>
          <div>{schema.bet.lines} lines · {schema.bet.defaultBet} default bet</div>
        </div>
        <div className="border border-border rounded-lg p-3">
          <div className="text-muted-foreground text-xs mb-1">Grid</div>
          <div>{schema.reels.length} reels · {schema.reels[0]?.length ?? '?'} strip length</div>
        </div>
        <div className="border border-border rounded-lg p-3">
          <div className="text-muted-foreground text-xs mb-1">Assumptions</div>
          <div>{schema.assumptions.length} AI-inferred fields</div>
        </div>
      </div>

      <div className="border-b border-border mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-muted">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === 'reels' && <ReelsTab schema={schema} />}
        {activeTab === 'paylines' && <PaylinesTab schema={schema} />}
        {activeTab === 'symbols' && <SymbolsTab schema={schema} />}
        {activeTab === 'paytable' && <PaytableTab schema={schema} />}
        {activeTab === 'features' && <FeaturesTab schema={schema} />}
        {activeTab === 'mechanics' && gameId && <MechanicsTab gameId={gameId} />}
        {activeTab === 'warnings' && <WarningsTab schema={schema} />}
      </div>
    </div>
  )
}
