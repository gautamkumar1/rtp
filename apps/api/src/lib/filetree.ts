import path from 'path'
import fs from 'fs'

const BINARY_EXTENSIONS = new Set([
  '.class', '.jar', '.exe', '.dll', '.so', '.dylib',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg', '.avi', '.mov',
  '.ttf', '.otf', '.woff', '.woff2',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls',
])

export interface FileTreeEntry {
  relativePath: string
  sizeBytes: number
  extension: string
  isBinary: boolean
}

export function buildFileTree(rootDir: string): FileTreeEntry[] {
  const entries: FileTreeEntry[] = []

  function walk(dir: string) {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else {
        const ext = path.extname(name).toLowerCase()
        entries.push({
          relativePath: path.relative(rootDir, fullPath),
          sizeBytes: stat.size,
          extension: ext,
          isBinary: BINARY_EXTENSIONS.has(ext),
        })
      }
    }
  }

  walk(rootDir)
  return entries
}
