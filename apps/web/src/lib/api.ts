const BASE = '/api'

export interface Game {
  id: string
  name: string
  provider: string
  status: string
  originalFileName: string
  uploadPath: string
  extractedPath: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  analysisRuns: Array<{ fileTreeJson: FileTreeEntry[] | null }>
}

export interface FileTreeEntry {
  relativePath: string
  sizeBytes: number
  extension: string
  isBinary: boolean
}

export async function uploadGame(file: File, onProgress: (pct: number) => void): Promise<{ gameId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/games/upload`)
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        const body = JSON.parse(xhr.responseText)
        reject(new Error(body.error ?? `Upload failed (${xhr.status})`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export async function getGame(gameId: string): Promise<Game> {
  const res = await fetch(`${BASE}/games/${gameId}`)
  if (!res.ok) throw new Error(`Game not found (${res.status})`)
  return res.json()
}

export async function listGames(): Promise<Game[]> {
  const res = await fetch(`${BASE}/games`)
  if (!res.ok) throw new Error('Failed to list games')
  return res.json()
}

export async function getFileTree(gameId: string): Promise<FileTreeEntry[]> {
  const res = await fetch(`${BASE}/games/${gameId}/files`)
  if (!res.ok) throw new Error('File tree not available')
  return res.json()
}

export interface CandidateFile {
  path: string
  extension: string
  relevanceScore: number
  reason: string[]
}

export interface AstCandidate {
  sourceFile: string
  lineNumber: number
  kind: string
  name: string
  rawValue: string
  confidence: 'high' | 'medium' | 'low'
  language: string
  format?: string
  sheet?: string
  table?: string
}

export interface CandidatesResult {
  analysisRunId: string
  status: string
  candidateFiles: CandidateFile[]
  astCandidates: AstCandidate[]
}

export async function getCandidates(gameId: string): Promise<CandidatesResult> {
  const res = await fetch(`${BASE}/games/${gameId}/candidates`)
  if (!res.ok) throw new Error('Candidates not available')
  return res.json()
}
