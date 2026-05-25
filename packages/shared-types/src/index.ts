import path from 'path'

// Storage path constants
export const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? './storage'
export const UPLOADS_PATH = path.join(STORAGE_BASE, 'uploads')
export const EXTRACTED_PATH = path.join(STORAGE_BASE, 'extracted')
export const ARTIFACTS_PATH = path.join(STORAGE_BASE, 'artifacts')
export const REPORTS_PATH = path.join(STORAGE_BASE, 'reports')

// Game status states
export type GameStatus =
  | 'uploaded'
  | 'extracting'
  | 'extracted'
  | 'scanning'
  | 'scanned'
  | 'analyzing'
  | 'analyzed'
  | 'simulating'
  | 'simulated'
  | 'reporting'
  | 'complete'
  | 'failed'

// Analysis run status
export type AnalysisStatus = 'pending' | 'running' | 'complete' | 'failed'

// Simulation status
export type SimulationStatus = 'pending' | 'running' | 'complete' | 'failed'

// Allowed spin counts per requirement spec
export type SpinCount =
  | 1_000_000
  | 10_000_000
  | 100_000_000
  | 500_000_000
  | 1_000_000_000

export const ALLOWED_SPIN_COUNTS: SpinCount[] = [
  1_000_000,
  10_000_000,
  100_000_000,
  500_000_000,
  1_000_000_000,
]

export const DEFAULT_SPIN_COUNT: SpinCount = 10_000_000

// File classification
export type FileRelevance = 'high' | 'medium' | 'low' | 'none'
export type FileCategory = 'reel' | 'paytable' | 'symbol' | 'config' | 'math' | 'other'

export interface ClassifiedFile {
  path: string
  extension: string
  sizeBytes: number
  relevanceScore: number
  relevance: FileRelevance
  category: FileCategory
  reason: string
  isBinary: boolean
}

// Source evidence attached to every extracted value
export interface SourceEvidence {
  filePath: string
  lineNumber?: number
  columnNumber?: number
  rawValue: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

// Assumption record for AI-inferred values
export interface Assumption {
  field: string
  assumedValue: unknown
  reason: string
  sourceEvidence: SourceEvidence[]
  canBeImproved: boolean
  improvementHint: string
}

// Inngest event payloads
export interface UploadReceivedPayload {
  gameId: string
  uploadPath: string
  originalName: string
}

export interface ProjectExtractedPayload {
  gameId: string
  extractedPath: string
  fileCount: number
}

export interface ProjectScannedPayload {
  gameId: string
  analysisRunId: string
  candidateCount: number
}

export interface AnalysisStartedPayload {
  gameId: string
  analysisRunId: string
}

export interface SchemaGeneratedPayload {
  gameId: string
  analysisRunId: string
  schemaPath: string
  warningCount: number
  assumptionCount: number
}

export interface SimulationStartedPayload {
  gameId: string
  simulationId: string
  spinCount: SpinCount
}

export interface SimulationCompletedPayload {
  gameId: string
  simulationId: string
  rtp: number
}

export interface ReportGeneratedPayload {
  gameId: string
  simulationId: string
  reportId: string
  jsonPath: string
  excelPath: string
  pdfPath: string
}
