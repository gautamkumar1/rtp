import { inngest } from '../client.js'
import { generateAllReports } from '../../reports/generator.js'

/**
 * On `simulation/completed`: assemble JSON, Excel, and PDF reports, then fire
 * `report/generated`. Each builder is its own Inngest step so the workflow
 * dashboard shows progress and failures are isolated to the builder that broke.
 */
export const onSimulationCompleted = inngest.createFunction(
  { id: 'on-simulation-completed', name: 'Generate JSON, Excel, PDF reports' },
  { event: 'simulation/completed' },
  async ({ event, step }) => {
    const { gameId, simulationId } = event.data

    const result = await step.run('generate-all-reports', async () => {
      const r = await generateAllReports({ gameId, simulationId })
      return {
        reportId: r.reportId,
        jsonPath: r.jsonPath,
        excelPath: r.excelPath,
        pdfPath: r.pdfPath,
        verdict: r.verdict,
      }
    })

    await step.sendEvent('fire-report-generated', {
      name: 'report/generated',
      data: {
        gameId,
        simulationId,
        reportId: result.reportId,
        jsonPath: result.jsonPath,
        excelPath: result.excelPath,
        pdfPath: result.pdfPath,
      },
    })

    return result
  },
)

export const onReportGenerated = inngest.createFunction(
  { id: 'on-report-generated', name: 'Mark game verification complete' },
  { event: 'report/generated' },
  async ({ event, step }) => {
    const { gameId, reportId } = event.data
    await step.run('log-complete', async () => {
      console.log(`[reports] ${gameId} → complete  reportId=${reportId}`)
    })
  },
)
