import { inngest } from '../client.js'
import { updateGameStatus } from '../../services/games.js'
import { prisma } from '../../db/client.js'
import { runSimulation } from '../../simulation/runner.js'
import { DEFAULT_SPIN_COUNT } from '../../simulation/client.js'

// Auto-trigger a simulation when a schema is generated, unless the env
// var SIM_AUTOSTART is "false". Picks the default 10M spin count.
export const onSchemaGenerated = inngest.createFunction(
  { id: 'on-schema-generated', name: 'Auto-trigger simulation after schema is ready' },
  { event: 'schema/generated' },
  async ({ event, step }) => {
    const { gameId } = event.data
    if (process.env.SIM_AUTOSTART === 'false') {
      await step.run('autostart-disabled', async () => {
        console.log(`[sim] autostart disabled — skipping ${gameId}`)
      })
      return
    }

    const sim = await step.run('create-simulation-row', async () => {
      const created = await prisma.simulation.create({
        data: { gameId, status: 'pending', spinCount: BigInt(DEFAULT_SPIN_COUNT) },
      })
      await updateGameStatus(gameId, 'simulating')
      return { id: created.id }
    })

    await step.sendEvent('fire-simulation-started', {
      name: 'simulation/started',
      data: { gameId, simulationId: sim.id, spinCount: DEFAULT_SPIN_COUNT },
    })
  },
)

export const onSimulationStarted = inngest.createFunction(
  { id: 'on-simulation-started', name: 'Run Go simulation engine' },
  { event: 'simulation/started' },
  async ({ event, step }) => {
    const { gameId, simulationId, spinCount } = event.data

    const result = await step.run('run-simulator', async () => {
      const outcome = await runSimulation({
        gameId,
        spinCount,
        simulationId,
      })
      return {
        rtp: outcome.result.rtp,
        spins: outcome.result.totalSpins,
      }
    })

    await step.run('mark-simulated', async () => {
      await updateGameStatus(gameId, 'simulated')
    })

    await step.sendEvent('fire-simulation-completed', {
      name: 'simulation/completed',
      data: { gameId, simulationId, rtp: result.rtp, spins: result.spins },
    })
  },
)
