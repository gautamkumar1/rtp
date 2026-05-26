import { onUploadReceived } from './handlers/extract.js'
import { onProjectExtracted } from './handlers/scan.js'
import { onProjectScanned } from './handlers/classify.js'
import { onAnalysisStarted } from './handlers/analyze.js'
import { onSchemaGenerated, onSimulationStarted } from './handlers/simulate.js'
import { onSimulationCompleted, onReportGenerated } from './handlers/report.js'

export { inngest } from './client.js'

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
