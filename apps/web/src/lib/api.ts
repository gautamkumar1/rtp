const BASE = '/api'

export interface Game {
  id: string
  name: string
  provider: string
  status: string
  originalFileName: string
  uploadPath: string
  extractedPath: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  analysisRuns: Array<{ fileTreeJson: FileTreeEntry[] | null }>
}

export interface FileTreeEntry {
  relativePath: string
  sizeBytes: number
  extension: string
  isBinary: boolean
}

export async function uploadGame(file: File, onProgress: (pct: number) => void): Promise<{ gameId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/games/upload`)
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        const body = JSON.parse(xhr.responseText)
        reject(new Error(body.error ?? `Upload failed (${xhr.status})`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export async function getGame(gameId: string): Promise<Game> {
  const res = await fetch(`${BASE}/games/${gameId}`)
  if (!res.ok) throw new Error(`Game not found (${res.status})`)
  return res.json()
}

export async function listGames(): Promise<Game[]> {
  const res = await fetch(`${BASE}/games`)
  if (!res.ok) throw new Error('Failed to list games')
  return res.json()
}

export async function getFileTree(gameId: string): Promise<FileTreeEntry[]> {
  const res = await fetch(`${BASE}/games/${gameId}/files`)
  if (!res.ok) throw new Error('File tree not available')
  return res.json()
}

export interface CandidateFile {
  path: string
  extension: string
  relevanceScore: number
  reason: string[]
}

export interface AstCandidate {
  sourceFile: string
  lineNumber: number
  kind: string
  name: string
  rawValue: string
  confidence: 'high' | 'medium' | 'low'
  language: string
  format?: string
  sheet?: string
  table?: string
}

export interface CandidatesResult {
  analysisRunId: string
  status: string
  candidateFiles: CandidateFile[]
  astCandidates: AstCandidate[]
}

export async function getCandidates(gameId: string): Promise<CandidatesResult> {
  const res = await fetch(`${BASE}/games/${gameId}/candidates`)
  if (!res.ok) throw new Error('Candidates not available')
  return res.json()
}

// Schema types
export interface SourceEvidence {
  filePath: string
  lineNumber?: number
  rawValue: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

export interface Assumption {
  field: string
  assumedValue: unknown
  reason: string
  sourceEvidence: SourceEvidence[]
  canBeImproved: boolean
  improvementHint: string
}

export interface SymbolDef {
  id: string
  name: string
  isWild: boolean
  isScatter: boolean
  displayName?: string
}

export interface GameSchemaData {
  schemaVersion: string
  provider: string
  gameId: string
  gameName: string
  gameType: string
  currencyMode: string
  bet: {
    defaultBet: number
    lines: number
    coinValue: number
    minBet?: number
    maxBet?: number
  }
  reels: string[][]
  paylines: number[][]
  symbols: SymbolDef[]
  paytable: Record<string, Record<string, number>>
  wild?: {
    symbolId: string
    substitutesFor: string[]
    multiplier?: number
    restrictions?: string
  }
  scatter?: {
    symbolId: string
    triggerCount: number
    awardType: string
    pays?: Record<string, number>
  }
  freeSpins?: {
    count: number
    multiplier: number
    retrigger: boolean
    retriggerCount?: number
    specialRules?: string
  }
  bonus?: {
    description: string
    triggerCondition: string
    specialRules?: string
  }
  buyBonus?: {
    costMultiplier: number
    entryPoint: string
    rtp?: number
  }
  sourceEvidence: SourceEvidence[]
  warnings: string[]
  assumptions: Assumption[]
}

export interface SchemaWarnings {
  warnings: string[]
  assumptions: Assumption[]
  sourceEvidence: SourceEvidence[]
}

export async function getSchema(gameId: string): Promise<GameSchemaData> {
  const res = await fetch(`${BASE}/games/${gameId}/schema`)
  if (!res.ok) throw new Error(`Schema not available (${res.status})`)
  return res.json()
}

export async function getSchemaWarnings(gameId: string): Promise<SchemaWarnings> {
  const res = await fetch(`${BASE}/games/${gameId}/schema/warnings`)
  if (!res.ok) throw new Error('Schema warnings not available')
  return res.json()
}

export async function getMechanics(gameId: string): Promise<string> {
  const res = await fetch(`${BASE}/games/${gameId}/mechanics`)
  if (!res.ok) throw new Error('Mechanics not available')
  return res.text()
}

// Simulation types
export const SPIN_COUNTS = [
  { value: 1_000_000, label: '1M' },
  { value: 10_000_000, label: '10M (default)' },
  { value: 100_000_000, label: '100M' },
  { value: 500_000_000, label: '500M' },
  { value: 1_000_000_000, label: '1B' },
] as const

export interface SymbolHitRow {
  symbol: string
  hits: number[]
  probs: number[]
}

export interface SymbolHitProbabilities {
  maxCount: number
  totalSpins: number
  bySymbol: SymbolHitRow[]
  scatterHits: number[]
  scatterProbs: number[]
  wildAssistedWins: number
  wildAssistRate: number
}

export interface SimulationRow {
  id: string
  gameId: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  spinCount: string
  totalSpins: string | null
  totalBet: string | null
  totalReturn: string | null
  rtp: string | null
  baseRtp: string | null
  freeSpinsRtp: string | null
  bonusRtp: string | null
  buyBonusRtp: string | null
  hitRate: string | null
  variance: string | null
  standardDeviation: string | null
  confidence90Low: string | null
  confidence90High: string | null
  confidence95Low: string | null
  confidence95High: string | null
  rawOutputPath: string | null
  symbolHitJson: SymbolHitProbabilities | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface SimulationResult {
  totalSpins: number
  totalBet: number
  totalReturn: number
  rtp: number
  baseRtp: number
  featureRtp: { freeSpins: number; bonus: number; buyBonus: number }
  hitRate: number
  variance: number
  standardDeviation: number
  confidence90Low: number
  confidence90High: number
  confidence95Low: number
  confidence95High: number
  featureTriggerCount: number
  symbolHitProbabilities: SymbolHitProbabilities
  buyBonus?: { purchases: number; totalCost: number; totalReturn: number; rtp: number }
  warnings: string[]
  config: { spinCount: number; rows: number; seed: number; simulateBuyBonus: boolean }
  durationMs: number
}

export async function startSimulation(
  gameId: string,
  body: { spinCount: number; simulateBuyBonus?: boolean; seed?: number },
): Promise<{ simulationId: string; gameId: string; spinCount: number }> {
  const res = await fetch(`${BASE}/games/${gameId}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Simulation start failed (${res.status})`)
  }
  return res.json()
}

export async function getLatestSimulation(gameId: string): Promise<SimulationRow> {
  const res = await fetch(`${BASE}/games/${gameId}/simulations/latest`)
  if (!res.ok) throw new Error('No simulations yet')
  return res.json()
}

export async function getSimulation(gameId: string, simulationId: string): Promise<SimulationRow> {
  const res = await fetch(`${BASE}/games/${gameId}/simulations/${simulationId}`)
  if (!res.ok) throw new Error('Simulation not found')
  return res.json()
}

export async function getSimulationOutput(
  gameId: string,
  simulationId: string,
): Promise<SimulationResult> {
  const res = await fetch(`${BASE}/games/${gameId}/simulations/${simulationId}/output`)
  if (!res.ok) throw new Error('Simulation output not available')
  return res.json()
}
