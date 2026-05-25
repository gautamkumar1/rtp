import fs from 'fs'
import path from 'path'
import { type AstCandidate } from './types.js'

const ARRAY_LITERAL_RE =
  /(?:var\s+(\w+)|(\w+)\s*:?=)\s*(?:\[\](?:\[\])?(?:int|string|float\d*|int\d+)|new\s*\[\](?:\[\])?int)\s*\{([\s\S]*?)\}/g

const SLICE_FIELD_RE = /(\w+)\s+(?:\[\](?:\[\])?(?:int|string|float\d*|int\d+))/g

const STRUCT_LITERAL_RE = /(\w+)\s*\{([^}]*(?:Symbol|Payout|Reel|Line|Weight|Count|Mult)[^}]*)\}/gi

const MAP_LITERAL_RE = /(?:map\[(?:int|string)\](?:int|float\d*|map[^\n]+)|(\w+)\s*(?::?=)\s*map\[)/g

const MATH_FIELD_NAMES =
  /(?:reel|strip|paytable|payout|symbol|weight|scatter|wild|bonus|spin|payline|multiplier|jackpot)/i

function lineNumberOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function extractArrayContent(source: string, openBrace: number): string {
  let depth = 1
  let i = openBrace + 1
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    i++
  }
  return source.slice(openBrace, i)
}

function isMathRelevantName(name: string): boolean {
  return MATH_FIELD_NAMES.test(name)
}

function scoreGoArray(raw: string, name: string): 'high' | 'medium' | 'low' {
  const numbers = raw.match(/\d+/g) ?? []
  if (numbers.length > 20 && isMathRelevantName(name)) return 'high'
  if (numbers.length > 5 && isMathRelevantName(name)) return 'medium'
  if (isMathRelevantName(name)) return 'medium'
  return 'low'
}

export function parseGoFile(filePath: string, extractedBase: string): AstCandidate[] {
  let source: string
  try {
    source = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const relPath = path.relative(extractedBase, filePath)
  const candidates: AstCandidate[] = []

  // Find array/slice literals
  let match: RegExpExecArray | null
  const arrayRe = new RegExp(
    /(?:(?:var\s+(\w+)|\b(\w+)\s*:?=)\s*(?:\[\](?:\[\])?(?:string|int(?:\d+)?|float\d*)|new\[[\d]*\](?:\[\])?int)\s*\{)/.source,
    'g',
  )
  arrayRe.lastIndex = 0
  while ((match = arrayRe.exec(source)) !== null) {
    const varName = match[1] ?? match[2] ?? 'unknown'
    const braceStart = source.indexOf('{', match.index + match[0].length - 1)
    if (braceStart === -1) continue
    const raw = extractArrayContent(source, braceStart)
    const lineNum = lineNumberOf(source, match.index)
    const confidence = scoreGoArray(raw, varName)

    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'array-literal',
      name: varName,
      rawValue: raw.length > 2000 ? raw.slice(0, 2000) + '...' : raw,
      confidence,
      language: 'go',
    })
  }

  // Find struct literals with math-relevant field names
  STRUCT_LITERAL_RE.lastIndex = 0
  while ((match = STRUCT_LITERAL_RE.exec(source)) !== null) {
    const name = match[1]
    const body = match[2]
    if (!isMathRelevantName(name) && !isMathRelevantName(body)) continue
    const lineNum = lineNumberOf(source, match.index)
    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'struct-literal',
      name,
      rawValue: match[0].length > 500 ? match[0].slice(0, 500) + '...' : match[0],
      confidence: 'medium',
      language: 'go',
    })
  }

  // Find map literals
  MAP_LITERAL_RE.lastIndex = 0
  while ((match = MAP_LITERAL_RE.exec(source)) !== null) {
    const varName = match[1] ?? 'map'
    if (!isMathRelevantName(varName) && !isMathRelevantName(source.slice(Math.max(0, match.index - 40), match.index)))
      continue
    const braceStart = source.indexOf('{', match.index + match[0].length - 1)
    if (braceStart === -1) continue
    const raw = extractArrayContent(source, braceStart)
    const lineNum = lineNumberOf(source, match.index)
    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'map-literal',
      name: varName,
      rawValue: raw.length > 1000 ? raw.slice(0, 1000) + '...' : raw,
      confidence: 'medium',
      language: 'go',
    })
  }

  // Filter out ARRAY_LITERAL_RE / SLICE_FIELD_RE false positives already deduplicated
  void ARRAY_LITERAL_RE
  void SLICE_FIELD_RE

  return candidates
}

export function parseGoFiles(filePaths: string[], extractedBase: string): AstCandidate[] {
  return filePaths.flatMap((f) => parseGoFile(f, extractedBase))
}
