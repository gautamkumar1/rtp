import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { type AstCandidate } from './types.js'

const require = createRequire(import.meta.url)

const MATH_FIELD_NAMES =
  /(?:reel|strip|paytable|payout|symbol|weight|scatter|wild|bonus|spin|payline|multiplier|jackpot)/i

function isMathRelevant(text: string): boolean {
  return MATH_FIELD_NAMES.test(text)
}

// ─── CSV ────────────────────────────────────────────────────────────────────

export function parseCsvFile(filePath: string, extractedBase: string): AstCandidate[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const relPath = path.relative(extractedBase, filePath)
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const header = lines[0]
  const dataRows = lines.slice(1, 11) // sample first 10 rows
  const hasNumbers = lines.some((l) => /\d{2,}/.test(l))
  const isRelevant = isMathRelevant(filePath) || isMathRelevant(header)

  if (!hasNumbers && !isRelevant) return []

  const confidence = isMathRelevant(header) && hasNumbers ? 'high' : isRelevant ? 'medium' : 'low'

  return [
    {
      sourceFile: relPath,
      lineNumber: 1,
      kind: 'csv-table',
      name: path.basename(filePath, '.csv'),
      rawValue: [header, ...dataRows].join('\n'),
      confidence,
      language: 'csv',
      format: 'csv',
    },
  ]
}

// ─── JSON ────────────────────────────────────────────────────────────────────

export function parseJsonFile(filePath: string, extractedBase: string): AstCandidate[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const relPath = path.relative(extractedBase, filePath)
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }

  if (typeof parsed !== 'object' || parsed === null) return []

  const topKeys = Object.keys(parsed as Record<string, unknown>)
  const mathKeys = topKeys.filter(isMathRelevant)

  if (mathKeys.length === 0 && !isMathRelevant(filePath)) return []

  const snippet = JSON.stringify(parsed, null, 2)
  const confidence = mathKeys.length >= 3 ? 'high' : mathKeys.length >= 1 ? 'medium' : 'low'

  return [
    {
      sourceFile: relPath,
      lineNumber: 1,
      kind: 'json-object',
      name: path.basename(filePath, '.json'),
      rawValue: snippet.length > 2000 ? snippet.slice(0, 2000) + '...' : snippet,
      confidence,
      language: 'json',
      format: 'json',
    },
  ]
}

// ─── SQL ────────────────────────────────────────────────────────────────────

export function parseSqlFile(filePath: string, extractedBase: string): AstCandidate[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const relPath = path.relative(extractedBase, filePath)
  const candidates: AstCandidate[] = []

  // Find INSERT statements into math-relevant tables
  const insertRe = /INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*(?:\([^)]*\))?\s*VALUES\s*(\([^;]*\)(?:\s*,\s*\([^;]*\))*)/gi
  let match: RegExpExecArray | null
  insertRe.lastIndex = 0
  while ((match = insertRe.exec(content)) !== null) {
    const tableName = match[1]
    const values = match[2]
    if (!isMathRelevant(tableName)) continue
    const lineNum = content.slice(0, match.index).split('\n').length
    const sample = values.length > 1000 ? values.slice(0, 1000) + '...' : values
    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'sql-insert',
      name: tableName,
      rawValue: `INSERT INTO ${tableName} VALUES ${sample}`,
      confidence: 'high',
      language: 'sql',
      format: 'sql',
      table: tableName,
    })
  }

  // CREATE TABLE for schema understanding
  const createRe = /CREATE\s+TABLE\s+[`"']?(\w+)[`"']?\s*\(([^;]*)\)/gi
  createRe.lastIndex = 0
  while ((match = createRe.exec(content)) !== null) {
    const tableName = match[1]
    const columns = match[2]
    if (!isMathRelevant(tableName) && !isMathRelevant(columns)) continue
    const lineNum = content.slice(0, match.index).split('\n').length
    candidates.push({
      sourceFile: relPath,
      lineNumber: lineNum,
      kind: 'sql-table-schema',
      name: tableName,
      rawValue: match[0].length > 500 ? match[0].slice(0, 500) + '...' : match[0],
      confidence: 'medium',
      language: 'sql',
      format: 'sql',
      table: tableName,
    })
  }

  return candidates
}

// ─── XML ────────────────────────────────────────────────────────────────────

export function parseXmlFile(filePath: string, extractedBase: string): AstCandidate[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const relPath = path.relative(extractedBase, filePath)
  const candidates: AstCandidate[] = []

  // Find elements matching reel/paytable/config patterns
  const elementRe = /<(\w+)[^>]*>/g
  let match: RegExpExecArray | null
  const mathElements = new Set<string>()

  elementRe.lastIndex = 0
  while ((match = elementRe.exec(content)) !== null) {
    const tag = match[1]
    if (isMathRelevant(tag)) mathElements.add(tag)
  }

  if (mathElements.size === 0 && !isMathRelevant(filePath) && !isMathRelevant(content.slice(0, 500))) return []

  // Extract sections for each math-relevant element
  for (const tag of mathElements) {
    const sectionRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
    sectionRe.lastIndex = 0
    while ((match = sectionRe.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length
      const raw = match[0]
      candidates.push({
        sourceFile: relPath,
        lineNumber: lineNum,
        kind: 'xml-element',
        name: tag,
        rawValue: raw.length > 1000 ? raw.slice(0, 1000) + '...' : raw,
        confidence: 'medium',
        language: 'xml',
        format: 'xml',
      })
      if (candidates.length > 50) break
    }
  }

  // If no specific math elements, still flag the file if path is relevant
  if (candidates.length === 0 && isMathRelevant(filePath)) {
    candidates.push({
      sourceFile: relPath,
      lineNumber: 1,
      kind: 'xml-file',
      name: path.basename(filePath, '.xml'),
      rawValue: content.length > 1000 ? content.slice(0, 1000) + '...' : content,
      confidence: 'low',
      language: 'xml',
      format: 'xml',
    })
  }

  return candidates
}

// ─── XLSX ────────────────────────────────────────────────────────────────────

export function parseXlsxFile(filePath: string, extractedBase: string): AstCandidate[] {
  const relPath = path.relative(extractedBase, filePath)

  let XLSX: typeof import('xlsx')
  try {
    // dynamic require to avoid issues if not installed
    XLSX = await_xlsx_import()
  } catch {
    return []
  }

  let workbook: import('xlsx').WorkBook
  try {
    workbook = XLSX.readFile(filePath)
  } catch {
    return []
  }

  const candidates: AstCandidate[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    if (rows.length < 2) continue

    const headerRow = (rows[0] as unknown[]).map(String).join(',')
    const isRelevant = isMathRelevant(sheetName) || isMathRelevant(headerRow) || isMathRelevant(filePath)
    const hasNumbers = rows.some((r) => (r as unknown[]).some((cell) => typeof cell === 'number' && cell > 0))

    if (!isRelevant && !hasNumbers) continue

    const sample = rows
      .slice(0, 10)
      .map((r) => (r as unknown[]).join('\t'))
      .join('\n')

    const confidence = isMathRelevant(sheetName) && hasNumbers ? 'high' : isRelevant ? 'medium' : 'low'

    candidates.push({
      sourceFile: relPath,
      lineNumber: 1,
      kind: 'xlsx-sheet',
      name: sheetName,
      rawValue: sample,
      confidence,
      language: 'xlsx',
      format: 'xlsx',
      sheet: sheetName,
    })
  }

  return candidates
}

// Node ESM workaround: synchronous require for xlsx (CommonJS)
function await_xlsx_import(): typeof import('xlsx') {
  return require('xlsx') as typeof import('xlsx')
}
