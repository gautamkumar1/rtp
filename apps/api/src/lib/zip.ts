import AdmZip from 'adm-zip'
import path from 'path'
import fs from 'fs'

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractionError'
  }
}

const SKIP_EXTENSIONS = new Set([
  '.class', '.jar', '.exe', '.dll', '.so', '.dylib',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg', '.avi', '.mov',
  '.ttf', '.otf', '.woff', '.woff2',
  '.zip', '.tar', '.gz', '.7z', '.rar',
])

interface ExtractionOptions {
  maxFiles: number
  maxFileSizeBytes: number
}

interface ExtractionResult {
  fileCount: number
  skippedCount: number
}

export async function extractZip(
  zipPath: string,
  outDir: string,
  opts: ExtractionOptions,
): Promise<ExtractionResult> {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()

  const resolvedOut = path.resolve(outDir)
  let fileCount = 0
  let skippedCount = 0

  for (const entry of entries) {
    if (entry.isDirectory) continue

    const entryName = entry.entryName
    // Check raw entry name for traversal sequences before adm-zip normalizes them
    if (entryName.includes('..') || path.isAbsolute(entryName)) {
      throw new ExtractionError(`Path traversal detected in ZIP entry: ${entryName}`)
    }
    const destPath = path.resolve(resolvedOut, entryName)
    if (!destPath.startsWith(resolvedOut + path.sep)) {
      throw new ExtractionError(`Path traversal detected in ZIP entry: ${entryName}`)
    }

    const ext = path.extname(entryName).toLowerCase()
    if (SKIP_EXTENSIONS.has(ext)) {
      skippedCount++
      continue
    }

    if (entry.header.size > opts.maxFileSizeBytes) {
      skippedCount++
      continue
    }

    fileCount++
    if (fileCount > opts.maxFiles) {
      throw new ExtractionError(`ZIP contains more than ${opts.maxFiles} files`)
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, entry.getData())
  }

  return { fileCount, skippedCount }
}
