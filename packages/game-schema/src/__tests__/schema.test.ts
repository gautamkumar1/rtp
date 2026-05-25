import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateGameSchema,
  safeValidateGameSchema,
  assertSimulationReady,
  SCHEMA_VERSION,
} from '../index.ts'

const validSchema = {
  schemaVersion: SCHEMA_VERSION,
  provider: 'test-provider',
  gameId: 'test-game-001',
  gameName: 'Test Slot',
  gameType: 'video-slot' as const,
  currencyMode: 'credits' as const,
  bet: { defaultBet: 1, lines: 10, coinValue: 1 },
  reels: [
    ['A', 'B', 'C', 'WILD', 'A', 'B'],
    ['A', 'B', 'C', 'A', 'B', 'C'],
    ['A', 'B', 'C', 'SCATTER', 'A', 'B'],
    ['A', 'B', 'C', 'A', 'B', 'C'],
    ['A', 'B', 'C', 'A', 'WILD', 'B'],
  ],
  paylines: [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
  ],
  symbols: [
    { id: 'A', name: 'SymbolA', isWild: false, isScatter: false },
    { id: 'B', name: 'SymbolB', isWild: false, isScatter: false },
    { id: 'C', name: 'SymbolC', isWild: false, isScatter: false },
    { id: 'WILD', name: 'Wild', isWild: true, isScatter: false },
    { id: 'SCATTER', name: 'Scatter', isWild: false, isScatter: true },
  ],
  paytable: {
    A: { '3': 5, '4': 20, '5': 100 },
    B: { '3': 3, '4': 10, '5': 50 },
    C: { '3': 2, '4': 8, '5': 30 },
  },
  wild: { symbolId: 'WILD', substitutesFor: [] },
  scatter: { symbolId: 'SCATTER', triggerCount: 3, awardType: 'freeSpins' as const },
  freeSpins: { count: 10, multiplier: 2, retrigger: false },
  sourceEvidence: [],
  warnings: [],
  assumptions: [],
}

describe('GameSchema validation', () => {
  it('accepts a valid schema', () => {
    const result = validateGameSchema(validSchema)
    assert.equal(result.gameId, 'test-game-001')
    assert.equal(result.schemaVersion, SCHEMA_VERSION)
  })

  it('rejects a schema with wrong version', () => {
    const result = safeValidateGameSchema({ ...validSchema, schemaVersion: '9.9.9' })
    assert.equal(result.success, false)
  })

  it('rejects a schema with empty reels', () => {
    const result = safeValidateGameSchema({ ...validSchema, reels: [] })
    assert.equal(result.success, false)
  })

  it('rejects a schema with empty paylines', () => {
    const result = safeValidateGameSchema({ ...validSchema, paylines: [] })
    assert.equal(result.success, false)
  })

  it('rejects a schema missing gameName', () => {
    const { gameName: _, ...rest } = validSchema
    const result = safeValidateGameSchema(rest)
    assert.equal(result.success, false)
  })

  it('defaults warnings and assumptions to empty arrays', () => {
    const { warnings: _w, assumptions: _a, ...rest } = validSchema
    const result = validateGameSchema(rest)
    assert.deepEqual(result.warnings, [])
    assert.deepEqual(result.assumptions, [])
  })
})

describe('assertSimulationReady', () => {
  it('returns no errors for valid schema', () => {
    const schema = validateGameSchema(validSchema)
    const errors = assertSimulationReady(schema)
    assert.deepEqual(errors, [])
  })

  it('catches payline length mismatch', () => {
    const bad = validateGameSchema({
      ...validSchema,
      paylines: [[1, 1, 1]], // only 3 entries for 5 reels
    })
    const errors = assertSimulationReady(bad)
    assert.ok(errors.some((e) => e.includes('paylines[0]')))
  })

  it('catches unknown symbol in reel strip', () => {
    const bad = validateGameSchema({
      ...validSchema,
      reels: [
        ['A', 'UNKNOWN_SYM'],
        ...validSchema.reels.slice(1),
      ],
    })
    const errors = assertSimulationReady(bad)
    assert.ok(errors.some((e) => e.includes('UNKNOWN_SYM')))
  })

  it('catches missing paytable entry for non-wild non-scatter symbol', () => {
    const { A: _a, ...paytableWithoutA } = validSchema.paytable
    const bad = validateGameSchema({ ...validSchema, paytable: paytableWithoutA })
    const errors = assertSimulationReady(bad)
    assert.ok(errors.some((e) => e.includes('"A"')))
  })
})
