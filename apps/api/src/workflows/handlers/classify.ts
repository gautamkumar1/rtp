import { gameExtractedPath } from '../../lib/storage.js'
import { updateGameStatus } from '../../services/games.js'
import { prisma } from '../../db/client.js'
import { inngest } from '../client.js'
import { runStaticParser } from '../../parser/index.js'

export const onProjectScanned = inngest.createFunction(
  { id: 'on-project-scanned', name: 'Classify files and run static parser' },
  { event: 'project/scanned' },
  async ({ event, step }) => {
    const { gameId, analysisRunId } = event.data

    await step.run('set-analyzing', async () => {
      await updateGameStatus(gameId, 'analyzing')
    })

    const parserResult = await step.run('run-static-parser', async () => {
      const extractedPath = gameExtractedPath(gameId)
      const result = await runStaticParser(gameId, extractedPath)

      await prisma.analysisRun.update({
        where: { id: analysisRunId },
        data: {
          status: 'classified',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          candidateFilesJson: result.candidateFiles as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          astCandidatesJson: result.astCandidates as any,
        },
      })

      return {
        candidateCount: result.candidateFiles.length,
        astCandidateCount: result.astCandidates.length,
      }
    })

    await step.sendEvent('fire-analysis-started', {
      name: 'analysis/started',
      data: {
        gameId,
        analysisRunId,
        candidateCount: parserResult.candidateCount,
        astCandidateCount: parserResult.astCandidateCount,
      },
    })
  },
)
