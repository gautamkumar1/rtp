import { Inngest } from 'inngest'
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

type Events = {
  'upload/received': { data: UploadReceivedPayload }
  'project/extracted': { data: ProjectExtractedPayload }
  'project/scanned': { data: ProjectScannedPayload }
  'analysis/started': { data: AnalysisStartedPayload }
  'schema/generated': { data: SchemaGeneratedPayload }
  'simulation/started': { data: SimulationStartedPayload }
  'simulation/completed': { data: SimulationCompletedPayload }
  'report/generated': { data: ReportGeneratedPayload }
}

export const inngest = new Inngest<Events>({ id: 'rtp-platform' })

// upload/received → extract ZIP
export const onUploadReceived = inngest.createFunction(
  { id: 'on-upload-received', name: 'Extract uploaded ZIP' },
  { event: 'upload/received' },
  async ({ event, step }) => {
    const { gameId, uploadPath } = event.data
    await step.run('extract-zip', async () => {
      // Phase 2: ZIP extraction implementation
      console.log(`[stub] extract-zip for game ${gameId} from ${uploadPath}`)
    })
  },
)

// project/extracted → build file tree
export const onProjectExtracted = inngest.createFunction(
  { id: 'on-project-extracted', name: 'Index project file tree' },
  { event: 'project/extracted' },
  async ({ event, step }) => {
    const { gameId } = event.data
    await step.run('index-file-tree', async () => {
      console.log(`[stub] index-file-tree for game ${gameId}`)
    })
  },
)

// project/scanned → classify files + trigger analysis
export const onProjectScanned = inngest.createFunction(
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

// analysis/started → run AI extraction
export const onAnalysisStarted = inngest.createFunction(
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

// schema/generated → trigger simulation
export const onSchemaGenerated = inngest.createFunction(
  { id: 'on-schema-generated', name: 'Trigger simulation after schema is ready' },
  { event: 'schema/generated' },
  async ({ event, step }) => {
    const { gameId } = event.data
    await step.run('trigger-simulation', async () => {
      console.log(`[stub] trigger-simulation for game ${gameId}`)
    })
  },
)

// simulation/started → run Go simulation engine
export const onSimulationStarted = inngest.createFunction(
  { id: 'on-simulation-started', name: 'Run Go simulation engine' },
  { event: 'simulation/started' },
  async ({ event, step }) => {
    const { gameId, simulationId, spinCount } = event.data
    await step.run('run-simulation', async () => {
      console.log(`[stub] run-simulation for game ${gameId}, sim ${simulationId}, spins ${spinCount}`)
    })
  },
)

// simulation/completed → generate reports
export const onSimulationCompleted = inngest.createFunction(
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

// report/generated → mark game complete
export const onReportGenerated = inngest.createFunction(
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
