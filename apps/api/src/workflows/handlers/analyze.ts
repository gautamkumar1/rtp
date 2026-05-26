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
          declaredRtp: result.schema.declaredRtp ?? null,
          variantLabel: result.schema.variantLabel ?? null,
        },
      })

      // Create/upsert variant Game rows for each variant in the extracted schema.
      const updatedGame = await prisma.game.findUniqueOrThrow({ where: { id: gameId } })
      const variants = result.schema.variants ?? []
      for (const v of variants) {
        // Build a per-variant schema: copy base schema, override scatter weights and metadata.
        const variantSchema = { ...result.schema, variantLabel: v.label, declaredRtp: v.declaredRtp }
        if (v.scatterWeights && variantSchema.randomScatterInject) {
          variantSchema.randomScatterInject = {
            ...variantSchema.randomScatterInject,
            baseWeights: v.scatterWeights,
            buyFeature: v.buyFeature ?? variantSchema.randomScatterInject.buyFeature ?? false,
          }
        }
        // Remove the variants array from child schemas to avoid infinite nesting.
        delete (variantSchema as Record<string, unknown>).variants

        await prisma.game.upsert({
          where: {
            // Use a stable compound key: parentGameId + variantLabel via findFirst pattern.
            // Prisma upsert needs a unique field — we use a synthetic approach: find+update or create.
            id: (await prisma.game.findFirst({ where: { parentGameId: gameId, variantLabel: v.label } }))?.id ?? '',
          },
          update: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            normalizedSchemaJson: variantSchema as any,
            declaredRtp: v.declaredRtp ?? null,
            status: 'analyzed',
          },
          create: {
            name: `${updatedGame.name} — ${v.label}`,
            provider: updatedGame.provider,
            status: 'analyzed',
            originalFileName: updatedGame.originalFileName,
            uploadPath: updatedGame.uploadPath,
            extractedPath: updatedGame.extractedPath,
            normalizedSchemaPath: result.normalizedSchemaPath,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            normalizedSchemaJson: variantSchema as any,
            parentGameId: gameId,
            variantLabel: v.label,
            declaredRtp: v.declaredRtp ?? null,
          },
        })
      }

      return {
        warningCount: result.warnings.length,
        validationErrorCount: result.validationErrors.length,
        assumptionCount: result.schema.assumptions.length,
        schemaPath: result.normalizedSchemaPath,
        variantCount: variants.length,
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
