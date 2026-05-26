import fs from 'fs'
import path from 'path'
import { prisma } from '../db/client.js'
import { gameArtifactsPath, ensureDir } from '../lib/storage.js'
import {
  SimulatorClient,
  SimulatorError,
  type SimulationResult,
  type SpinCount,
} from './client.js'
import type { GameSchema } from '@rtp/game-schema'

export interface RunSimulationParams {
  gameId: string
  spinCount: SpinCount
  simulateBuyBonus?: boolean
  seed?: number
  rows?: number
  simulationId?: string
  client?: SimulatorClient
}

export interface RunSimulationOutcome {
  simulationId: string
  result: SimulationResult
  outputPath: string
}

/**
 * Load the normalized schema, POST it to the Go simulator, persist the result
 * to disk + DB. Caller is responsible for setting game status before/after.
 */
export async function runSimulation(params: RunSimulationParams): Promise<RunSimulationOutcome> {
  const { gameId, spinCount } = params
  const client = params.client ?? new SimulatorClient()

  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } })
  if (!game.normalizedSchemaJson) {
    throw new Error(`game ${gameId} has no normalized schema — analyze first`)
  }
  const schema = game.normalizedSchemaJson as unknown as GameSchema

  schema.warnings = schema.warnings ?? []

  // When paylines are missing (AI couldn't extract them), synthesize standard
  // row-by-row paylines so the simulator doesn't hard-fail on valid reel data.
  if ((!schema.paylines || schema.paylines.length === 0) && schema.reels?.length > 0) {
    const reelCount = schema.reels.length
    const rows = params.rows ?? 3
    const generated: number[][] = []
    for (let row = 0; row < rows; row++) {
      generated.push(Array.from({ length: reelCount }, () => row))
    }
    schema.paylines = generated
    schema.warnings.push('paylines: not found in source — synthesized standard row paylines for simulation')
  }

  // Symbols with no paytable entry are non-paying (blanks, bonus triggers, etc.).
  // Mark wild as isWild, everything else missing from paytable as scatter so the
  // Go validator skips the paytable requirement for them.
  const paytableIds = new Set(Object.keys(schema.paytable ?? {}))
  const wildId = schema.wild?.symbolId
  for (const sym of schema.symbols ?? []) {
    if (sym.isWild || sym.isScatter) continue
    if (sym.id === wildId) {
      sym.isWild = true
      schema.warnings.push(`symbol "${sym.id}" (${sym.name}): marked isWild — matches wild.symbolId`)
      continue
    }
    if (!paytableIds.has(sym.id)) {
      sym.isScatter = true
      schema.warnings.push(`symbol "${sym.id}" (${sym.name}): no paytable entry — treated as non-paying scatter for simulation`)
    }
  }

  // Create or reuse the simulations row.
  const sim = params.simulationId
    ? await prisma.simulation.update({
        where: { id: params.simulationId },
        data: { status: 'running', spinCount: BigInt(spinCount) },
      })
    : await prisma.simulation.create({
        data: {
          gameId,
          status: 'running',
          spinCount: BigInt(spinCount),
        },
      })

  let result: SimulationResult
  try {
    result = await client.simulate({
      schema,
      config: {
        spinCount,
        rows: params.rows ?? 3,
        seed: params.seed ?? 0,
        simulateBuyBonus: params.simulateBuyBonus ?? Boolean(schema.buyBonus),
      },
    })
  } catch (err) {
    await prisma.simulation.update({
      where: { id: sim.id },
      data: {
        status: 'failed',
        errorMessage: err instanceof SimulatorError ? err.message : String(err),
      },
    })
    throw err
  }

  const artifactsDir = gameArtifactsPath(gameId)
  ensureDir(artifactsDir)
  const outputPath = path.join(artifactsDir, 'simulation-output.json')
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))

  await prisma.simulation.update({
    where: { id: sim.id },
    data: {
      status: 'complete',
      totalSpins: BigInt(result.totalSpins),
      totalBet: result.totalBet,
      totalReturn: result.totalReturn,
      rtp: result.rtp,
      baseRtp: result.baseRtp,
      freeSpinsRtp: result.featureRtp.freeSpins,
      bonusRtp: result.featureRtp.bonus,
      buyBonusRtp: result.featureRtp.buyBonus,
      hitRate: result.hitRate,
      variance: result.variance,
      standardDeviation: result.standardDeviation,
      confidence90Low: result.confidence90Low,
      confidence90High: result.confidence90High,
      confidence95Low: result.confidence95Low,
      confidence95High: result.confidence95High,
      rawOutputPath: outputPath,
      symbolHitJson: result.symbolHitProbabilities as never,
    },
  })

  return { simulationId: sim.id, result, outputPath }
}
