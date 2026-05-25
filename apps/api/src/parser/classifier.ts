import fs from 'fs'
import path from 'path'
import { safeJoin } from '../lib/storage.js'

export type CandidateFile = {
  path: string
  extension: string
  relevanceScore: number
  reason: string[]
}

const MATH_PATH_PATTERNS = [
  /reel/i,
  /paytable/i,
  /pay[-_]?table/i,
  /symbol/i,
  /math/i,
  /config/i,
  /game/i,
  /strip/i,
  /weight/i,
  /payout/i,
  /bonus/i,
  /scatter/i,
  /wild/i,
  /spin/i,
]

const RELEVANT_EXTENSIONS = new Set([
  '.go',
  '.java',
  '.c',
  '.h',
  '.json',
  '.csv',
  '.sql',
  '.xml',
  '.yaml',
  '.yml',
  '.xlsx',
  '.txt',
])

const BINARY_EXTENSIONS = new Set([
  '.class',
  '.jar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bin',
  '.wasm',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
])

const MAX_TEXT_FILE_SIZE = 2 * 1024 * 1024 // 2MB

function scoreFile(filePath: string, sizeBytes: number): { score: number; reasons: string[] } {
  const ext = path.extname(filePath).toLowerCase()
  const basename = path.basename(filePath).toLowerCase()
  const dirParts = filePath.toLowerCase().split(path.sep)
  const reasons: string[] = []
  let score = 0

  if (BINARY_EXTENSIONS.has(ext)) return { score: -1, reasons: ['binary'] }
  if (sizeBytes === 0) return { score: 0, reasons: ['empty'] }
  if (ext && !RELEVANT_EXTENSIONS.has(ext)) return { score: 0, reasons: ['irrelevant extension'] }

  if (RELEVANT_EXTENSIONS.has(ext)) {
    score += 2
    reasons.push(`relevant extension (${ext})`)
  }

  for (const pattern of MATH_PATH_PATTERNS) {
    if (pattern.test(basename) || dirParts.some((p) => pattern.test(p))) {
      score += 5
      reasons.push(`path matches '${pattern.source}'`)
      break
    }
  }

  if (sizeBytes > MAX_TEXT_FILE_SIZE) {
    score -= 3
    reasons.push('file too large (>2MB)')
  }

  return { score, reasons }
}

export function classifyFiles(extractedPath: string): CandidateFile[] {
  const candidates: CandidateFile[] = []

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      // Skip hidden dirs like __MACOSX, .git, .settings
      if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue

      const fullPath = safeJoin(extractedPath, path.relative(extractedPath, path.join(dir, entry.name)))

      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        let sizeBytes = 0
        try {
          sizeBytes = fs.statSync(fullPath).size
        } catch {
          continue
        }

        const { score, reasons } = scoreFile(fullPath, sizeBytes)
        if (score > 0) {
          candidates.push({
            path: path.relative(extractedPath, fullPath),
            extension: path.extname(fullPath).toLowerCase(),
            relevanceScore: score,
            reason: reasons,
          })
        }
      }
    }
  }

  walk(extractedPath)

  return candidates.sort((a, b) => b.relevanceScore - a.relevanceScore)
}
