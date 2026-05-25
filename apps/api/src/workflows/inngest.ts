import { Inngest, EventSchemas } from 'inngest'
import type {
  UploadReceivedPayload,
  ProjectExtractedPayload,
  ProjectScannedPayload,
  AnalysisStartedPayload,
  SchemaGeneratedPayload,
  SimulationStartedPayload,
  SimulationCompletedPayload,
  ReportGeneratedPayload,
} from '@rtp/shared-types'
import { onUploadReceived } from './handlers/extract.js'
import { onProjectExtracted } from './handlers/scan.js'

type Events = {
  'upload/received': { name: 'upload/received'; data: UploadReceivedPayload }
  'project/extracted': { name: 'project/extracted'; data: ProjectExtractedPayload }
  'project/scanned': { name: 'project/scanned'; data: ProjectScannedPayload }
  'analysis/started': { name: 'analysis/started'; data: AnalysisStartedPayload }
  'schema/generated': { name: 'schema/generated'; data: SchemaGeneratedPayload }
  'simulation/started': { name: 'simulation/started'; data: SimulationStartedPayload }
  'simulation/completed': { name: 'simulation/completed'; data: SimulationCompletedPayload }
  'report/generated': { name: 'report/generated'; data: ReportGeneratedPayload }
}

export const inngest = new Inngest({
  id: 'rtp-platform',
  schemas: new EventSchemas<Events>(),
})

const onProjectScanned = inngest.createFunction(
  { id: 'on-project-scanned', name: 'Classify files and start analysis' },
  { event: 'project/scanned' },
  async ({ event, step }) => {
    const { gameId } = event.data
    await step.run('classify-files', async () => {
      console.log(`[stub] classify-files for game ${gameId}`)
    })
    await step.run('trigger-analysis', async () => {
      console.log(`[stub] trigger-analysis for game ${gameId}`)
    })
  },
)

const onAnalysisStarted = inngest.createFunction(
  { id: 'on-analysis-started', name: 'Run AI extraction and schema generation' },
  { event: 'analysis/started' },
  async ({ event, step }) => {
    const { gameId, analysisRunId } = event.data
    await step.run('run-ai-extraction', async () => {
      console.log(`[stub] run-ai-extraction for game ${gameId}, run ${analysisRunId}`)
    })
    await step.run('validate-schema', async () => {
      console.log(`[stub] validate-schema for game ${gameId}`)
    })
  },
)

const onSchemaGenerated = inngest.createFunction(
  { id: 'on-schema-generated', name: 'Trigger simulation after schema is ready' },
  { event: 'schema/generated' },
  async ({ event, step }) => {
    const { gameId } = event.data
    await step.run('trigger-simulation', async () => {
      console.log(`[stub] trigger-simulation for game ${gameId}`)
    })
  },
)

const onSimulationStarted = inngest.createFunction(
  { id: 'on-simulation-started', name: 'Run Go simulation engine' },
  { event: 'simulation/started' },
  async ({ event, step }) => {
    const { gameId, simulationId, spinCount } = event.data
    await step.run('run-simulation', async () => {
      console.log(`[stub] run-simulation for game ${gameId}, sim ${simulationId}, spins ${spinCount}`)
    })
  },
)

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
