import path from 'path'
import fs from 'fs'
import { inngest } from '../client.js'
import { updateGameStatus } from '../../services/games.js'
import { prisma } from '../../db/client.js'
import { runAiExtraction } from '../../ai/extractor.js'
import { generateMechanicsDocument } from '../../ai/mechanics-generator.js'
import { gameArtifactsPath, gameExtractedPath } from '../../lib/storage.js'

export const onAnalysisStarted = inngest.createFunction(
  { id: 'on-analysis-started', name: 'Run AI extraction and schema generation' },
  { event: 'analysis/started' },
  async ({ event, step }) => {
    const { gameId, analysisRunId } = event.data

    await step.run('set-analyzing', async () => {
      await updateGameStatus(gameId, 'analyzing')
      await prisma.analysisRun.update({
        where: { id: analysisRunId },
        data: { status: 'running' },
      })
    })

    const extractionResult = await step.run('run-ai-extraction', async () => {
      const game = await prisma.game.findUniqueOrThrow({
        where: { id: gameId },
      })
      const analysisRun = await prisma.analysisRun.findUniqueOrThrow({
        where: { id: analysisRunId },
      })

      const artifactsDir = gameArtifactsPath(gameId)
      const candidatesPath = path.join(artifactsDir, 'ast-candidates.json')
      const classifiedPath = path.join(artifactsDir, 'candidate-files.json')

      const astCandidates = fs.existsSync(candidatesPath)
        ? JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))
        : (analysisRun.astCandidatesJson ?? [])

      const candidateFiles = fs.existsSync(classifiedPath)
        ? JSON.parse(fs.readFileSync(classifiedPath, 'utf8'))
        : (analysisRun.candidateFilesJson ?? [])

      const extractedPath = gameExtractedPath(gameId)

      const result = await runAiExtraction({
        gameId,
        gameName: game.name,
        candidateFiles,
        astCandidates,
        extractedPath,
      })

      await prisma.analysisRun.update({
        where: { id: analysisRunId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          aiOutputJson: result.schema as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          warningsJson: result.warnings as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          assumptionsJson: result.schema.assumptions as any,
        },
      })

      await prisma.game.update({
        where: { id: gameId },
        data: {
          normalizedSchemaPath: result.normalizedSchemaPath,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          normalizedSchemaJson: result.schema as any,
        },
      })

      return {
        warningCount: result.warnings.length,
        validationErrorCount: result.validationErrors.length,
        assumptionCount: result.schema.assumptions.length,
        schemaPath: result.normalizedSchemaPath,
      }
    })

    await step.run('generate-mechanics-doc', async () => {
      const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } })
      if (!game.normalizedSchemaJson) {
        console.warn(`[analyze] No normalized schema for game ${gameId} — skipping mechanics doc`)
        return
      }
      const schema = game.normalizedSchemaJson as Parameters<typeof generateMechanicsDocument>[1]
      await generateMechanicsDocument(gameId, schema)
    })

    await step.run('mark-analyzed', async () => {
      await updateGameStatus(gameId, 'analyzed')
      await prisma.analysisRun.update({
        where: { id: analysisRunId },
        data: { status: 'complete' },
      })
    })

    await step.sendEvent('fire-schema-generated', {
      name: 'schema/generated',
      data: {
        gameId,
        analysisRunId,
        schemaPath: extractionResult.schemaPath,
        warningCount: extractionResult.warningCount,
        assumptionCount: extractionResult.assumptionCount,
      },
    })
  },
)
