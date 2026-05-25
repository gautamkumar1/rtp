import path from 'path'
import fs from 'fs'

const STORAGE_BASE = path.resolve(process.env.STORAGE_BASE_PATH ?? './storage')

export function safeJoin(base: string, ...segments: string[]): string {
  const resolved = path.resolve(base, ...segments)
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    throw new Error(`Path traversal detected: ${resolved}`)
  }
  return resolved
}

export function gameUploadPath(gameId: string): string {
  return safeJoin(STORAGE_BASE, 'uploads', gameId)
}

export function gameExtractedPath(gameId: string): string {
  return safeJoin(STORAGE_BASE, 'extracted', gameId)
}

export function gameArtifactsPath(gameId: string): string {
  return safeJoin(STORAGE_BASE, 'artifacts', gameId)
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}
