import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { classifyFiles } from '../src/parser/classifier.js'
import { parseGoFile } from '../src/parser/go-parser.js'
import { parseJavaFile } from '../src/parser/java-parser.js'
import { parseCFile } from '../src/parser/c-parser.js'
import { parseCsvFile, parseJsonFile, parseSqlFile, parseXmlFile } from '../src/parser/structured-parsers.js'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-parser-test-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function write(relPath: string, content: string): string {
  const abs = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return abs
}

// ─── File Classifier ─────────────────────────────────────────────────────────

describe('classifyFiles', () => {
  it('returns files with math-relevant names scored higher', () => {
    write('reels.go', 'package main\nvar x = 1')
    write('main.go', 'package main\nfunc main() {}')
    write('readme.txt', 'hello')

    const results = classifyFiles(tmpDir)
    const reelFile = results.find((f) => f.path.includes('reels.go'))
    const mainFile = results.find((f) => f.path.includes('main.go'))

    expect(reelFile).toBeDefined()
    expect(reelFile!.relevanceScore).toBeGreaterThan(mainFile?.relevanceScore ?? 0)
  })

  it('skips binary extensions', () => {
    write('game.class', Buffer.from([0xca, 0xfe, 0xba, 0xbe]).toString())
    write('game.jar', 'PK...')

    const results = classifyFiles(tmpDir)
    const classFile = results.find((f) => f.path.endsWith('.class'))
    const jarFile = results.find((f) => f.path.endsWith('.jar'))
    expect(classFile).toBeUndefined()
    expect(jarFile).toBeUndefined()
  })

  it('skips empty files', () => {
    write('empty.go', '')
    const results = classifyFiles(tmpDir)
    const emptyFile = results.find((f) => f.path.includes('empty.go'))
    expect(emptyFile).toBeUndefined()
  })

  it('skips __MACOSX directories', () => {
    write('__MACOSX/._reels.go', 'data')
    const results = classifyFiles(tmpDir)
    const macFile = results.find((f) => f.path.includes('__MACOSX'))
    expect(macFile).toBeUndefined()
  })

  it('gives relevance reason for math path pattern', () => {
    write('math/paytable.json', '{"paytable": {}}')
    const results = classifyFiles(tmpDir)
    const file = results.find((f) => f.path.includes('paytable.json'))
    expect(file).toBeDefined()
    expect(file!.reason.some((r) => /reel|paytable|symbol|math|config|game|pay/i.test(r))).toBe(true)
  })
})

// ─── Go Parser ───────────────────────────────────────────────────────────────

describe('parseGoFile', () => {
  it('extracts array slice literals as candidates', () => {
    const code = `package main
var reelStrip = []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22}
`
    const filePath = write('reel/reels.go', code)
    const candidates = parseGoFile(filePath, tmpDir)
    expect(candidates.length).toBeGreaterThan(0)
    const c = candidates[0]
    expect(c.language).toBe('go')
    expect(c.kind).toBe('array-literal')
    expect(c.name).toBe('reelStrip')
    expect(c.confidence).toBe('high')
  })

  it('assigns medium confidence to small named arrays', () => {
    const code = `package main
var symbols = []string{"A", "B", "C"}`
    const filePath = write('symbols/symbols.go', code)
    const candidates = parseGoFile(filePath, tmpDir)
    const sym = candidates.find((c) => c.name === 'symbols')
    expect(sym?.confidence).toBe('medium')
  })

  it('includes source file path and line number', () => {
    const code = `package main

var reels = []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}`
    const filePath = write('game/game.go', code)
    const candidates = parseGoFile(filePath, tmpDir)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].lineNumber).toBeGreaterThanOrEqual(1)
    expect(candidates[0].sourceFile).toContain('game.go')
  })

  it('returns empty for non-Go-math files', () => {
    const code = `package main
func main() { fmt.Println("hello") }`
    const filePath = write('cmd/main.go', code)
    const candidates = parseGoFile(filePath, tmpDir)
    expect(candidates).toEqual([])
  })
})

// ─── Java Parser ─────────────────────────────────────────────────────────────

describe('parseJavaFile', () => {
  it('extracts 2D int array initializers', () => {
    const code = `public class Strips {
  public static int[][] base = new int[][]
  {
    new int[]{ 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20 },
    new int[]{ 3,2,1,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20 },
  };
}`
    const filePath = write('model/Strips.java', code)
    const candidates = parseJavaFile(filePath, tmpDir)
    const c2d = candidates.find((c) => c.kind === '2d-array-initializer')
    expect(c2d).toBeDefined()
    expect(c2d!.confidence).toBe('high')
  })

  it('extracts field declarations with math-relevant names', () => {
    const code = `public class GameConfig {
  private int payoutMultiplier = 100;
  private int reelCount = 5;
}`
    const filePath = write('model/GameConfig.java', code)
    const candidates = parseJavaFile(filePath, tmpDir)
    const fieldCandidates = candidates.filter((c) => c.kind === 'field-declaration')
    expect(fieldCandidates.length).toBeGreaterThan(0)
  })

  it('records correct source file relative path', () => {
    const code = `public class Paytable {
  int[][] paytable = new int[][]{ new int[]{1,2,3,4,5} };
}`
    const filePath = write('math/Paytable.java', code)
    const candidates = parseJavaFile(filePath, tmpDir)
    expect(candidates.some((c) => c.sourceFile.includes('Paytable.java'))).toBe(true)
  })
})

// ─── C Parser ────────────────────────────────────────────────────────────────

describe('parseCFile', () => {
  it('extracts #define constants with math-relevant names', () => {
    const code = `#define REEL_COUNT 5
#define SYMBOL_COUNT 12
#define PAYLINE_COUNT 20
#define VERSION 1`
    const filePath = write('math/game.h', code)
    const candidates = parseCFile(filePath, tmpDir)
    const defines = candidates.find((c) => c.kind === 'define-constants')
    expect(defines).toBeDefined()
    expect(defines!.rawValue).toContain('REEL_COUNT')
    expect(defines!.rawValue).toContain('SYMBOL_COUNT')
    expect(defines!.rawValue).not.toContain('VERSION')
  })

  it('extracts array declarations matching math patterns', () => {
    const code = `static int reelStrip[100] = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25};`
    const filePath = write('math/reels.c', code)
    const candidates = parseCFile(filePath, tmpDir)
    const arr = candidates.find((c) => c.kind === 'array-declaration')
    expect(arr).toBeDefined()
    expect(arr!.name).toBe('reelStrip')
    expect(arr!.confidence).toBe('high')
  })

  it('extracts struct definitions with math-relevant fields', () => {
    const code = `typedef struct { int symbolId; int payoutValue; int reelPos; } PayEntry;`
    const filePath = write('include/pay.h', code)
    const candidates = parseCFile(filePath, tmpDir)
    const struct = candidates.find((c) => c.kind === 'struct-definition')
    expect(struct).toBeDefined()
    expect(struct!.name).toBe('PayEntry')
  })
})

// ─── CSV Parser ──────────────────────────────────────────────────────────────

describe('parseCsvFile', () => {
  it('extracts math-relevant CSV with numeric data', () => {
    const content = `reel1,reel2,reel3,reel4,reel5\n1,2,3,4,5\n6,7,8,9,10`
    const filePath = write('data/reels.csv', content)
    const candidates = parseCsvFile(filePath, tmpDir)
    expect(candidates.length).toBe(1)
    expect(candidates[0].confidence).toBe('high')
    expect(candidates[0].format).toBe('csv')
  })

  it('returns empty for non-relevant CSV without numbers', () => {
    const content = `name,color\nalice,red\nbob,blue`
    const filePath = write('data/users.csv', content)
    const candidates = parseCsvFile(filePath, tmpDir)
    expect(candidates).toEqual([])
  })
})

// ─── JSON Parser ─────────────────────────────────────────────────────────────

describe('parseJsonFile', () => {
  it('extracts JSON with multiple math-relevant top-level keys', () => {
    const content = JSON.stringify({
      reels: [[1, 2, 3]],
      paytable: { '1': { '3': 5 } },
      symbols: [{ id: 1, name: 'A' }],
    })
    const filePath = write('config/game.json', content)
    const candidates = parseJsonFile(filePath, tmpDir)
    expect(candidates.length).toBe(1)
    expect(candidates[0].confidence).toBe('high')
  })

  it('returns empty for non-math JSON', () => {
    const content = JSON.stringify({ name: 'foo', version: '1.0' })
    const filePath = write('config/package.json', content)
    const candidates = parseJsonFile(filePath, tmpDir)
    expect(candidates).toEqual([])
  })
})

// ─── SQL Parser ──────────────────────────────────────────────────────────────

describe('parseSqlFile', () => {
  it('extracts INSERT statements into reel/paytable tables', () => {
    const content = `
INSERT INTO reel_strips (reel_id, symbol_id) VALUES (1, 5),(1, 3),(1, 7);
INSERT INTO paytable (symbol_id, count, multiplier) VALUES (5, 3, 10),(5, 4, 25);
INSERT INTO users (id, name) VALUES (1, 'alice');
`
    const filePath = write('db/seed.sql', content)
    const candidates = parseSqlFile(filePath, tmpDir)
    const tables = candidates.map((c) => c.table)
    expect(tables).toContain('reel_strips')
    expect(tables).toContain('paytable')
    expect(tables).not.toContain('users')
  })

  it('extracts CREATE TABLE for math-relevant tables', () => {
    const content = `
CREATE TABLE symbol_weights (id INT, reel_id INT, symbol_id INT, weight INT);
CREATE TABLE accounts (id INT, name VARCHAR(100));
`
    const filePath = write('db/schema.sql', content)
    const candidates = parseSqlFile(filePath, tmpDir)
    const tables = candidates.filter((c) => c.kind === 'sql-table-schema').map((c) => c.table)
    expect(tables).toContain('symbol_weights')
    expect(tables).not.toContain('accounts')
  })
})

// ─── XML Parser ──────────────────────────────────────────────────────────────

describe('parseXmlFile', () => {
  it('extracts elements with math-relevant tag names', () => {
    const content = `<?xml version="1.0"?>
<config>
  <reel id="1"><symbol>3</symbol><symbol>5</symbol></reel>
  <paytable><entry symbol="3" count="3" payout="10"/></paytable>
</config>`
    const filePath = write('config/game.xml', content)
    const candidates = parseXmlFile(filePath, tmpDir)
    const tags = candidates.map((c) => c.name)
    expect(tags).toContain('reel')
    expect(tags).toContain('paytable')
  })

  it('returns empty for XML without math content or relevant path', () => {
    const content = `<?xml version="1.0"?><beans><bean id="x" class="Foo"/></beans>`
    const filePath = write('spring/beans.xml', content)
    const candidates = parseXmlFile(filePath, tmpDir)
    expect(candidates).toEqual([])
  })
})
