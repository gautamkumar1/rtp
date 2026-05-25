export type Confidence = 'high' | 'medium' | 'low'

export type AstCandidate = {
  sourceFile: string
  lineNumber: number
  kind: string
  name: string
  rawValue: string
  confidence: Confidence
  language: string
  format?: string
  sheet?: string
  table?: string
}
