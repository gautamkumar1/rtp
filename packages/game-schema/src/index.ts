import { z } from 'zod'

export const SCHEMA_VERSION = '0.1.0'

const SourceEvidenceSchema = z.object({
  filePath: z.string(),
  lineNumber: z.number().int().positive().optional(),
  columnNumber: z.number().int().positive().optional(),
  rawValue: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string(),
})

const AssumptionSchema = z.object({
  field: z.string(),
  assumedValue: z.unknown(),
  reason: z.string(),
  sourceEvidence: z.array(SourceEvidenceSchema),
  canBeImproved: z.boolean(),
  improvementHint: z.string(),
})

const SymbolSchema = z.object({
  id: z.string(),
  name: z.string(),
  isWild: z.boolean().default(false),
  isScatter: z.boolean().default(false),
  displayName: z.string().optional(),
})

// paytable: symbolId -> matchCount -> payoutMultiplier
// e.g. { "CHERRY": { "3": 5, "4": 20, "5": 100 } }
// For ways games, keys are count thresholds: { "8": 20, "10": 50, "15": 200 }
const PaytableSchema = z.record(z.string(), z.record(z.string(), z.number()))

// payline: array of row indices per reel column
// e.g. [1,1,1,1,1] = middle row across all 5 reels
const PaylineSchema = z.array(z.number().int().min(0))

const WildSchema = z.object({
  symbolId: z.string(),
  substitutesFor: z.array(z.string()).describe('symbol IDs wild can substitute — empty means all non-scatter'),
  multiplier: z.number().default(1).optional(),
  restrictions: z.string().optional().describe('any restrictions noted in source'),
}).optional()

const ScatterSchema = z.object({
  symbolId: z.string(),
  triggerCount: z.number().int().min(2).describe('minimum scatters to trigger feature'),
  awardType: z.enum(['freeSpins', 'bonus', 'multiplier', 'cash']),
  pays: z.record(z.string(), z.number()).optional().describe('scatter count -> payout multiplier'),
}).optional()

const FreeSpinsSchema = z.object({
  count: z.number().int().positive().describe('number of free spins awarded'),
  multiplier: z.number().default(1).describe('win multiplier during free spins'),
  retrigger: z.boolean().default(false),
  retriggerCount: z.number().int().positive().optional().describe('extra spins on retrigger'),
  specialRules: z.string().optional().describe('any extra mechanics during free spins'),
}).optional()

const BonusSchema = z.object({
  description: z.string(),
  triggerCondition: z.string().describe('what triggers the bonus round'),
  specialRules: z.string().optional(),
}).optional()

const BuyBonusSchema = z.object({
  costMultiplier: z.number().positive().describe('cost as multiple of total bet'),
  entryPoint: z.string().describe('which feature is entered directly'),
  rtp: z.number().optional().describe('declared buy-bonus RTP if present in source'),
}).optional()

const TumbleSchema = z.object({
  enabled: z.boolean(),
  freeReels: z.array(z.array(z.string())).optional(),
}).optional()

const RandomScatterInjectSchema = z.object({
  symbolId: z.string(),
  baseWeights: z.array(z.object({ count: z.number().int(), weight: z.number().int() })),
  buyFeature: z.boolean().default(false),
}).optional()

const BonusMultiplierSchema = z.object({
  symbolId: z.string(),
  weights: z.array(z.tuple([z.number(), z.number()])),
}).optional()

const BetConfigSchema = z.object({
  defaultBet: z.number().positive(),
  lines: z.number().int().positive().describe('number of active paylines'),
  coinValue: z.number().positive().default(1),
  minBet: z.number().positive().optional(),
  maxBet: z.number().positive().optional(),
})

export const GameSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  provider: z.string().default('unknown'),
  gameId: z.string(),
  gameName: z.string(),
  gameType: z.enum(['video-slot']).default('video-slot'),
  currencyMode: z.enum(['credits', 'cash']).default('credits'),

  bet: BetConfigSchema,

  // reels[i] = array of symbol IDs on reel i from top to bottom
  reels: z.array(z.array(z.string())).min(1).describe('each inner array is one reel strip'),

  // paylines[i] = row index per reel — length must equal reels.length
  // Optional for ways games (mechanic: "ways")
  paylines: z.array(PaylineSchema).default([]),

  symbols: z.array(SymbolSchema).min(1),
  paytable: PaytableSchema,

  wild: WildSchema,
  scatter: ScatterSchema,
  freeSpins: FreeSpinsSchema,
  bonus: BonusSchema,
  buyBonus: BuyBonusSchema,

  mechanic: z.enum(['paylines', 'ways']).default('paylines'),
  tumble: TumbleSchema,
  randomScatterInject: RandomScatterInjectSchema,
  bonusMultiplier: BonusMultiplierSchema,
  declaredRtp: z.number().min(0).max(1).optional(),
  variantLabel: z.string().optional(),

  sourceEvidence: z.array(SourceEvidenceSchema).default([]),
  warnings: z.array(z.string()).default([]),
  assumptions: z.array(AssumptionSchema).default([]),
}).superRefine((data, ctx) => {
  if (data.mechanic === 'paylines' && data.paylines.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_small,
      minimum: 1,
      type: 'array',
      inclusive: true,
      path: ['paylines'],
      message: 'paylines must have at least 1 entry when mechanic is "paylines"',
    })
  }
})

export type GameSchema = z.infer<typeof GameSchema>
export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>
export type Assumption = z.infer<typeof AssumptionSchema>
export type Symbol = z.infer<typeof SymbolSchema>
export type Paytable = z.infer<typeof PaytableSchema>
export type Payline = z.infer<typeof PaylineSchema>
export type BetConfig = z.infer<typeof BetConfigSchema>
export type WildConfig = z.infer<typeof WildSchema>
export type ScatterConfig = z.infer<typeof ScatterSchema>
export type FreeSpinsConfig = z.infer<typeof FreeSpinsSchema>
export type BonusConfig = z.infer<typeof BonusSchema>
export type BuyBonusConfig = z.infer<typeof BuyBonusSchema>
export type TumbleConfig = z.infer<typeof TumbleSchema>
export type RandomScatterInjectConfig = z.infer<typeof RandomScatterInjectSchema>
export type BonusMultiplierConfig = z.infer<typeof BonusMultiplierSchema>

export function validateGameSchema(data: unknown): GameSchema {
  return GameSchema.parse(data)
}

export function safeValidateGameSchema(data: unknown) {
  return GameSchema.safeParse(data)
}

// Validate all required simulation fields are present before sim starts
export function assertSimulationReady(schema: GameSchema): string[] {
  const errors: string[] = []

  if (!schema.reels || schema.reels.length === 0) errors.push('reels: required and must be non-empty')
  if (schema.mechanic !== 'ways' && (!schema.paylines || schema.paylines.length === 0)) {
    errors.push('paylines: required and must be non-empty')
  }
  if (!schema.symbols || schema.symbols.length === 0) errors.push('symbols: required and must be non-empty')
  if (!schema.paytable || Object.keys(schema.paytable).length === 0) errors.push('paytable: required and must be non-empty')

  // Payline length must match reel count (payline games only)
  if (schema.mechanic !== 'ways') {
    for (let i = 0; i < schema.paylines.length; i++) {
      if (schema.paylines[i].length !== schema.reels.length) {
        errors.push(`paylines[${i}]: length ${schema.paylines[i].length} does not match reel count ${schema.reels.length}`)
      }
    }
  }

  // All reel symbols must exist in symbols array
  const symbolIds = new Set(schema.symbols.map((s) => s.id))
  for (let r = 0; r < schema.reels.length; r++) {
    for (const sym of schema.reels[r]) {
      if (!symbolIds.has(sym)) {
        errors.push(`reels[${r}]: unknown symbol "${sym}" not in symbols array`)
      }
    }
  }

  // Paytable must cover all non-wild, non-scatter symbols
  const payableSymbols = schema.symbols.filter((s) => !s.isWild && !s.isScatter)
  for (const sym of payableSymbols) {
    if (!schema.paytable[sym.id]) {
      errors.push(`paytable: missing entry for symbol "${sym.id}"`)
    }
  }

  return errors
}
