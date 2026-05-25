import { describe, it, expect } from 'vitest'
import { extractZip, ExtractionError } from '../src/lib/zip.js'
import AdmZip from 'adm-zip'
import path from 'path'
import os from 'os'
import fs from 'fs'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-test-'))
}

function writeZip(entries: Array<{ name: string; content: string }>, dest: string): string {
  const zip = new AdmZip()
  for (const e of entries) zip.addFile(e.name, Buffer.from(e.content))
  const zipPath = path.join(dest, 'test.zip')
  zip.writeZip(zipPath)
  return zipPath
}

/** Creates a ZIP with a raw entry name that adm-zip won't normalize (bypasses adm-zip writer). */
function writeRawZip(entryName: string, content: Buffer, dest: string): string {
  const nameBytes = Buffer.from(entryName, 'utf8')
  const crc = 0x00000000

  const localHeader = Buffer.alloc(30 + nameBytes.length + content.length)
  let o = 0
  localHeader.writeUInt32LE(0x04034b50, o); o += 4
  localHeader.writeUInt16LE(20, o); o += 2
  localHeader.writeUInt16LE(0, o); o += 2
  localHeader.writeUInt16LE(0, o); o += 2
  localHeader.writeUInt16LE(0, o); o += 2
  localHeader.writeUInt16LE(0, o); o += 2
  localHeader.writeUInt32LE(crc, o); o += 4
  localHeader.writeUInt32LE(content.length, o); o += 4
  localHeader.writeUInt32LE(content.length, o); o += 4
  localHeader.writeUInt16LE(nameBytes.length, o); o += 2
  localHeader.writeUInt16LE(0, o); o += 2
  nameBytes.copy(localHeader, o); o += nameBytes.length
  content.copy(localHeader, o); o += content.length
  const localSize = o

  const cd = Buffer.alloc(46 + nameBytes.length)
  let co = 0
  cd.writeUInt32LE(0x02014b50, co); co += 4
  cd.writeUInt16LE(20, co); co += 2
  cd.writeUInt16LE(20, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt32LE(crc, co); co += 4
  cd.writeUInt32LE(content.length, co); co += 4
  cd.writeUInt32LE(content.length, co); co += 4
  cd.writeUInt16LE(nameBytes.length, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt16LE(0, co); co += 2
  cd.writeUInt32LE(0, co); co += 4
  cd.writeUInt32LE(0, co); co += 4
  nameBytes.copy(cd, co); co += nameBytes.length

  const eocd = Buffer.alloc(22)
  let eo = 0
  eocd.writeUInt32LE(0x06054b50, eo); eo += 4
  eocd.writeUInt16LE(0, eo); eo += 2
  eocd.writeUInt16LE(0, eo); eo += 2
  eocd.writeUInt16LE(1, eo); eo += 2
  eocd.writeUInt16LE(1, eo); eo += 2
  eocd.writeUInt32LE(co, eo); eo += 4
  eocd.writeUInt32LE(localSize, eo); eo += 4
  eocd.writeUInt16LE(0, eo); eo += 2

  const zipPath = path.join(dest, 'raw.zip')
  fs.writeFileSync(zipPath, Buffer.concat([localHeader.subarray(0, localSize), cd.subarray(0, co), eocd]))
  return zipPath
}

describe('extractZip', () => {
  it('extracts valid zip', async () => {
    const tmp = makeTempDir()
    const zipPath = writeZip([{ name: 'hello.txt', content: 'hello' }], tmp)
    const outDir = path.join(tmp, 'out')
    const result = await extractZip(zipPath, outDir, { maxFiles: 100, maxFileSizeBytes: 1024 * 1024 })
    expect(result.fileCount).toBe(1)
    expect(fs.existsSync(path.join(outDir, 'hello.txt'))).toBe(true)
  })

  it('throws on path traversal entry', async () => {
    const tmp = makeTempDir()
    const zipPath = writeRawZip('../evil.txt', Buffer.from('bad'), tmp)
    const outDir = path.join(tmp, 'out')
    await expect(extractZip(zipPath, outDir, { maxFiles: 100, maxFileSizeBytes: 1024 * 1024 }))
      .rejects.toThrow(ExtractionError)
  })

  it('throws when file count exceeds limit', async () => {
    const tmp = makeTempDir()
    const entries = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.txt`, content: 'x' }))
    const zipPath = writeZip(entries, tmp)
    const outDir = path.join(tmp, 'out')
    await expect(extractZip(zipPath, outDir, { maxFiles: 3, maxFileSizeBytes: 1024 * 1024 }))
      .rejects.toThrow(ExtractionError)
  })

  it('skips binary extensions', async () => {
    const tmp = makeTempDir()
    const zipPath = writeZip([
      { name: 'game.class', content: 'bytes' },
      { name: 'main.go', content: 'package main' },
    ], tmp)
    const outDir = path.join(tmp, 'out')
    const result = await extractZip(zipPath, outDir, { maxFiles: 100, maxFileSizeBytes: 1024 * 1024 })
    expect(fs.existsSync(path.join(outDir, 'game.class'))).toBe(false)
    expect(fs.existsSync(path.join(outDir, 'main.go'))).toBe(true)
    expect(result.skippedCount).toBe(1)
  })
})
