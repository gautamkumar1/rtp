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
