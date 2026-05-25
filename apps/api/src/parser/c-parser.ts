import fs from 'fs'
import path from 'path'
import { type AstCandidate } from './types.js'

const MATH_FIELD_NAMES =
  /(?:reel|strip|paytable|payout|symbol|weight|scatter|wild|bonus|spin|payline|multiplier|jackpot)/i

function lineNumberOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function extractBalanced(source: string, openBrace: number): string {
  let depth = 1
  let i = openBrace + 1
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    i++
  }
  return source.slice(openBrace, i)
}

function isMathRelevant(name: string): boolean {
  return MATH_FIELD_NAMES.test(name)
}

export function parseCFile(filePath: string, extractedBase: string): AstCandidate[] {
  let source: string
  try {
    source = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const relPath = path.relative(extractedBase, filePath)
  const candidates: AstCandidate[] = []

  let match: RegExpExecArray | null

  // #define constants for symbol/payline counts
  const defineRe = /#define\s+(\w+)\s+(\d+)/g
  defineRe.lastIndex = 0
  const defines: Array<{ name: string; value: string; line: number }> = []
  while ((match = defineRe.exec(source)) !== null) {
    if (isMathRelevant(match[1])) {
      defines.push({
        name: match[1],
        value: match[2],
        line: lineNumberOf(source, match.index),
      })
    }
  }
  if (defines.length > 0) {
    candidates.push({
      sourceFile: relPath,
      lineNumber: defines[0].line,
      kind: 'define-constants',
      name: 'defines',
      rawValue: defines.map((d) => `#define ${d.name} ${d.value}`).join('\n'),
      confidence: 'high',
      language: 'c',
    })
  }

  // Array declarations: int name[] = { ... } or static int name[N][M] = { ... }
  const arrayDeclRe =
    /(?:static\s+|extern\s+|const\s+)*(?:int|long|float|double|unsigned\s+int|short)\s+(\w+)\s*(?:\[\d*\]){1,2}\s*=\s*\{/g
  arrayDeclRe.lastIndex = 0
  while ((match = arrayDeclRe.exec(source)) !== null) {
    const varName = match[1]
    const braceStart = source.indexOf('{', match.index + match[0].length - 1)
    if (braceStart === -1) continue
    const raw = extractBalanced(source, braceStart)
    const lineNum = lineNumberOf(source, match.index)
    const numbers = raw.match(/\d+/g) ?? []
    let confidence: 'high' | 'medium' | 'low' = 'low'
    if (numbers.length > 20 && isMathRelevant(varName)) confidence = 'high'
    else if (numbers.length > 5) confidence = 'medium'
    else if (isMathRelevant(varName)) confidence = 'medium'

    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'array-declaration',
      name: varName,
      rawValue: raw.length > 2000 ? raw.slice(0, 2000) + '...' : raw,
      confidence,
      language: 'c',
    })
  }

  // Struct definitions with math-relevant field names
  const structDefRe = /typedef\s+struct\s*\{([^}]*)\}\s*(\w+)\s*;/g
  structDefRe.lastIndex = 0
  while ((match = structDefRe.exec(source)) !== null) {
    const body = match[1]
    const typeName = match[2]
    if (!isMathRelevant(body) && !isMathRelevant(typeName)) continue
    const lineNum = lineNumberOf(source, match.index)
    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'struct-definition',
      name: typeName,
      rawValue: match[0].length > 500 ? match[0].slice(0, 500) + '...' : match[0],
      confidence: 'medium',
      language: 'c',
    })
  }

  return candidates
}

export function parseCFiles(filePaths: string[], extractedBase: string): AstCandidate[] {
  return filePaths.flatMap((f) => parseCFile(f, extractedBase))
}
