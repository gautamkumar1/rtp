import { prisma } from '../db/client.js'
import { updateGameStatus } from '../services/games.js'
import { buildJsonReport } from './json-report.js'
import { buildExcelReport } from './excel-report.js'
import { buildPdfReport } from './pdf-report.js'
import type { GameReport } from './types.js'

export interface GenerateReportsParams {
  gameId: string
  simulationId: string
}

export interface GenerateReportsResult {
  reportId: string
  jsonPath: string
  excelPath: string
  pdfPath: string
  verdict: GameReport['confidence']['verdict']
  report: GameReport
}

/**
 * Run the JSON → Excel → PDF pipeline for a (game, simulation) pair,
 * persisting paths to the `reports` table and bumping the game status
 * to `complete` on success (or `failed` on error).
 *
 * Idempotent enough to re-run for the same simulation: a new `reports`
 * row is inserted each time.
 */
export async function generateAllReports(
  params: GenerateReportsParams,
): Promise<GenerateReportsResult> {
  const { gameId, simulationId } = params

  try {
    await updateGameStatus(gameId, 'reporting')

    const { report, jsonPath } = await buildJsonReport({ gameId, simulationId })
    const { excelPath } = await buildExcelReport({ gameId, report })
    const { pdfPath } = await buildPdfReport({ gameId, report })

    const dbReport = await prisma.report.create({
      data: {
        gameId,
        simulationId,
        jsonReportPath: jsonPath,
        excelReportPath: excelPath,
        pdfReportPath: pdfPath,
      },
    })

    await updateGameStatus(gameId, 'complete')

    return {
      reportId: dbReport.id,
      jsonPath,
      excelPath,
      pdfPath,
      verdict: report.confidence.verdict,
      report,
    }
  } catch (err) {
    await updateGameStatus(gameId, 'failed', { errorMessage: String(err) }).catch(() => {})
    throw err
  }
}
