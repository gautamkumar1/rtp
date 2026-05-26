import { inngest } from '../client.js'

// Auto-simulation is disabled — users trigger simulation manually from the UI.
export const onSchemaGenerated = inngest.createFunction(
  { id: 'on-schema-generated', name: 'Auto-trigger simulation after schema is ready' },
  { event: 'schema/generated' },
  async ({ event, step }) => {
    await step.run('autostart-disabled', async () => {
      console.log(`[sim] auto-simulation disabled — user will trigger manually for ${event.data.gameId}`)
    })
  },
)

// Simulations are run directly via POST /api/games/:id/simulate (HTTP route).
// This handler exists only to process the completion event fired by that route.
export const onSimulationStarted = inngest.createFunction(
  { id: 'on-simulation-started', name: 'Handle simulation completion event' },
  { event: 'simulation/started' },
  async ({ event, step }) => {
    await step.run('log', async () => {
      console.log(`[sim] simulation/started received for ${event.data.gameId} — simulation runs via HTTP route`)
    })
  },
)
