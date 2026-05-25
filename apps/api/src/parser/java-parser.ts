import fs from 'fs'
import path from 'path'
import { type AstCandidate } from './types.js'

const MATH_FIELD_NAMES =
  /(?:reel|strip|paytable|payout|symbol|weight|scatter|wild|bonus|spin|payline|multiplier|jackpot|base|free)/i

function lineNumberOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function extractBalanced(source: string, openBrace: number, open: string, close: string): string {
  let depth = 1
  let i = openBrace + 1
  while (i < source.length && depth > 0) {
    if (source[i] === open) depth++
    else if (source[i] === close) depth--
    i++
  }
  return source.slice(openBrace, i)
}

function isMathRelevant(name: string): boolean {
  return MATH_FIELD_NAMES.test(name)
}

function scoreJavaArray(raw: string, name: string): 'high' | 'medium' | 'low' {
  const numbers = raw.match(/\d+/g) ?? []
  if (numbers.length > 20 && isMathRelevant(name)) return 'high'
  if (numbers.length > 5 && isMathRelevant(name)) return 'medium'
  if (isMathRelevant(name)) return 'medium'
  return 'low'
}

export function parseJavaFile(filePath: string, extractedBase: string): AstCandidate[] {
  let source: string
  try {
    source = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const relPath = path.relative(extractedBase, filePath)
  const candidates: AstCandidate[] = []

  // Array initializers: int[] name = { ... } or int[][] name = { ... }
  const arrayInitRe =
    /(?:(?:public|private|protected|static|final)\s+)*(?:int|long|double|float|String|boolean)(?:\[\]){1,2}\s+(\w+)\s*(?:=\s*new\s+(?:int|long|double|float|String|boolean)(?:\[\d*\]){1,2}\s*)?\{/g

  let match: RegExpExecArray | null
  arrayInitRe.lastIndex = 0
  while ((match = arrayInitRe.exec(source)) !== null) {
    const varName = match[1]
    const braceStart = source.indexOf('{', match.index + match[0].length - 1)
    if (braceStart === -1) continue
    const raw = extractBalanced(source, braceStart, '{', '}')
    const lineNum = lineNumberOf(source, match.index)
    const confidence = scoreJavaArray(raw, varName)

    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'array-initializer',
      name: varName,
      rawValue: raw.length > 2000 ? raw.slice(0, 2000) + '...' : raw,
      confidence,
      language: 'java',
    })
  }

  // Field declarations with math-relevant names
  const fieldDeclRe = /(?:private|public|protected|static|final)\s+(?:\w+(?:\[\])*\s+){1,3}(\w+)\s*=/g
  fieldDeclRe.lastIndex = 0
  while ((match = fieldDeclRe.exec(source)) !== null) {
    const fieldName = match[1]
    if (!isMathRelevant(fieldName)) continue
    // grab next 200 chars as context
    const snippet = source.slice(match.index, match.index + 300)
    const lineNum = lineNumberOf(source, match.index)
    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'field-declaration',
      name: fieldName,
      rawValue: snippet,
      confidence: 'medium',
      language: 'java',
    })
  }

  // Inner class / nested object literals that look like math tables
  const newIntArrayRe = /new\s+int\[\]\[\]\s*\{/g
  newIntArrayRe.lastIndex = 0
  while ((match = newIntArrayRe.exec(source)) !== null) {
    const braceStart = source.indexOf('{', match.index + match[0].length - 1)
    if (braceStart === -1) continue
    const raw = extractBalanced(source, braceStart, '{', '}')
    // Look back for var name
    const before = source.slice(Math.max(0, match.index - 100), match.index)
    const varMatch = before.match(/(\w+)\s*=\s*$/)
    const varName = varMatch ? varMatch[1] : 'unknown'
    const lineNum = lineNumberOf(source, match.index)
    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: '2d-array-initializer',
      name: varName,
      rawValue: raw.length > 2000 ? raw.slice(0, 2000) + '...' : raw,
      confidence: 'high',
      language: 'java',
    })
  }

  return candidates
}

export function parseJavaFiles(filePaths: string[], extractedBase: string): AstCandidate[] {
  return filePaths.flatMap((f) => parseJavaFile(f, extractedBase))
}
