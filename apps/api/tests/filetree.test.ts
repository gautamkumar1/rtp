import { describe, it, expect } from 'vitest'
import { buildFileTree } from '../src/lib/filetree.js'
import path from 'path'
import os from 'os'
import fs from 'fs'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-ft-'))
}

describe('buildFileTree', () => {
  it('returns entries for all files recursively', () => {
    const tmp = makeTempDir()
    fs.writeFileSync(path.join(tmp, 'main.go'), 'package main')
    fs.mkdirSync(path.join(tmp, 'sub'))
    fs.writeFileSync(path.join(tmp, 'sub', 'data.json'), '{}')

    const tree = buildFileTree(tmp)
    const paths = tree.map((e) => e.relativePath)
    expect(paths).toContain('main.go')
    expect(paths).toContain(path.join('sub', 'data.json'))
  })

  it('marks binary extensions with isBinary=true', () => {
    const tmp = makeTempDir()
    fs.writeFileSync(path.join(tmp, 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    fs.writeFileSync(path.join(tmp, 'main.go'), 'package main')

    const tree = buildFileTree(tmp)
    const png = tree.find((e) => e.relativePath === 'icon.png')
    const go = tree.find((e) => e.relativePath === 'main.go')
    expect(png?.isBinary).toBe(true)
    expect(go?.isBinary).toBe(false)
  })

  it('records correct size in bytes', () => {
    const tmp = makeTempDir()
    fs.writeFileSync(path.join(tmp, 'hello.txt'), 'hello')
    const tree = buildFileTree(tmp)
    const entry = tree.find((e) => e.relativePath === 'hello.txt')
    expect(entry?.sizeBytes).toBe(5)
  })
})
