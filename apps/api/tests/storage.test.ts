import { describe, it, expect } from 'vitest'
import { safeJoin, gameUploadPath, gameExtractedPath, gameArtifactsPath } from '../src/lib/storage.js'
import path from 'path'

const BASE = '/storage'

describe('safeJoin', () => {
  it('returns absolute path inside base', () => {
    expect(safeJoin(BASE, 'abc', 'original.zip')).toBe('/storage/abc/original.zip')
  })

  it('throws on path traversal', () => {
    expect(() => safeJoin(BASE, '../etc', 'passwd')).toThrow('Path traversal')
  })

  it('throws on absolute segment', () => {
    expect(() => safeJoin(BASE, '/etc', 'passwd')).toThrow('Path traversal')
  })
})

describe('game path helpers', () => {
  it('gameUploadPath returns correct path', () => {
    const p = gameUploadPath('abc123')
    expect(p).toContain(path.join('uploads', 'abc123'))
  })
  it('gameExtractedPath returns correct path', () => {
    const p = gameExtractedPath('abc123')
    expect(p).toContain(path.join('extracted', 'abc123'))
  })
  it('gameArtifactsPath returns correct path', () => {
    const p = gameArtifactsPath('abc123')
    expect(p).toContain(path.join('artifacts', 'abc123'))
  })
})
