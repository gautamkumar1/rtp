import { inngest } from './client.js'
import { onUploadReceived } from './handlers/extract.js'
import { onProjectExtracted } from './handlers/scan.js'
import { onProjectScanned } from './handlers/classify.js'
import { onAnalysisStarted } from './handlers/analyze.js'
import { onSchemaGenerated, onSimulationStarted } from './handlers/simulate.js'

export { inngest } from './client.js'

const onSimulationCompleted = inngest.createFunction(
  { id: 'on-simulation-completed', name: 'Generate JSON, Excel, PDF reports' },
  { event: 'simulation/completed' },
  async ({ event, step }) => {
    const { gameId, simulationId } = event.data
    await step.run('generate-json-report', async () => {
      console.log(`[stub] generate-json-report for game ${gameId}, sim ${simulationId}`)
    })
    await step.run('generate-excel-report', async () => {
      console.log(`[stub] generate-excel-report for game ${gameId}`)
    })
    await step.run('generate-pdf-report', async () => {
      console.log(`[stub] generate-pdf-report for game ${gameId}`)
    })
  },
)

const onReportGenerated = inngest.createFunction(
  { id: 'on-report-generated', name: 'Mark game verification complete' },
  { event: 'report/generated' },
  async ({ event, step }) => {
    const { gameId } = event.data
    await step.run('mark-complete', async () => {
      console.log(`[stub] mark-complete for game ${gameId}`)
    })
  },
)

export const functions = [
  onUploadReceived,
  onProjectExtracted,
  onProjectScanned,
  onAnalysisStarted,
  onSchemaGenerated,
  onSimulationStarted,
  onSimulationCompleted,
  onReportGenerated,
]
