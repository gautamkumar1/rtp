/**
 * Report data model — every value is labeled by `source` so consumers (and the
 * PDF/Excel renderers) can show provenance: was this extracted directly from
 * source code, inferred by the AI, computed by the simulation, or a warning?
 */

export type Provenance =
  | 'extracted'
  | 'ai-inferred'
  | 'simulation-result'
  | 'warning'
  | 'assumption'

export interface Labeled<T> {
  value: T
  source: Provenance
  note?: string
}

export interface ReportGameOverview {
  gameId: Labeled<string>
  gameName: Labeled<string>
  provider: Labeled<string>
  gameType: Labeled<string>
  originalFileName: Labeled<string>
  uploadedAt: Labeled<string>
  fileCount: Labeled<number | null>
  detectedLanguages: Labeled<string[]>
}

export interface ReportReelSummary {
  reelIndex: number
  length: number
  symbols: string[]
  symbolCounts: Record<string, number>
}

export interface ReportMath {
  reels: Labeled<ReportReelSummary[]>
  paylines: Labeled<number[][]>
  symbols: Labeled<Array<{ id: string; name: string; isWild: boolean; isScatter: boolean }>>
  paytable: Labeled<Record<string, Record<string, number>>>
  weightTable: Labeled<Array<{ reelIndex: number; counts: Record<string, number>; total: number }>>
  bet: Labeled<{ defaultBet: number; lines: number; coinValue: number }>
}

export interface ReportFeatures {
  wild: Labeled<{ symbolId: string; substitutesFor: string[]; multiplier?: number } | null>
  scatter: Labeled<{ symbolId: string; triggerCount: number; awardType: string } | null>
  freeSpins: Labeled<{ count: number; multiplier: number; retrigger: boolean; retriggerCount?: number } | null>
  bonus: Labeled<{ description: string; triggerCondition: string } | null>
  buyBonus: Labeled<{ costMultiplier: number; entryPoint: string } | null>
}

export interface ReportSimulationConfig {
  spinCount: number
  rows: number
  seed: number
  simulateBuyBonus: boolean
}

export interface ReportRtp {
  total: number
  base: number
  freeSpins: number
  bonus: number
  buyBonus: number
}

export interface ReportStatistics {
  totalSpins: number
  totalBet: number
  totalReturn: number
  hitRate: number
  variance: number
  standardDeviation: number
  confidence90: { low: number; high: number; halfWidth: number }
  confidence95: { low: number; high: number; halfWidth: number }
  featureTriggerCount: number
  durationMs: number
}

export interface ReportSymbolHitRow {
  symbol: string
  hits: number[]
  probs: number[]
}

export interface ReportSymbolHits {
  maxCount: number
  totalSpins: number
  bySymbol: ReportSymbolHitRow[]
  scatterHits: number[]
  scatterProbs: number[]
  wildAssistedWins: number
  wildAssistRate: number
}

export interface ReportAssumption {
  field: string
  assumedValue: unknown
  reason: string
  canBeImproved: boolean
  improvementHint: string
}

export interface ReportEvidence {
  filePath: string
  lineNumber?: number
  rawValue: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

export type Verdict = 'PASS' | 'WARN' | 'FAIL'

export interface ReportConfidence {
  schemaValidationOk: boolean
  schemaValidationErrors: string[]
  warningCount: number
  assumptionCount: number
  convergenceOk: boolean
  verdict: Verdict
  verdictReasons: string[]
}

export interface GameReport {
  schemaVersion: '1.0.0'
  generatedAt: string
  overview: ReportGameOverview
  mechanics: Labeled<string>
  math: ReportMath
  features: ReportFeatures
  simulation: {
    config: Labeled<ReportSimulationConfig>
    rtp: Labeled<ReportRtp>
    statistics: Labeled<ReportStatistics>
    symbolHitProbabilities: Labeled<ReportSymbolHits>
    buyBonus: Labeled<{ purchases: number; totalCost: number; totalReturn: number; rtp: number } | null>
  }
  warnings: string[]
  assumptions: ReportAssumption[]
  sourceEvidence: ReportEvidence[]
  confidence: ReportConfidence
}
