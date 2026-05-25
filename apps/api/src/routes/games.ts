import { Router, type Router as RouterType, type Request, type Response, type NextFunction } from 'express'
import { createId } from '@paralleldrive/cuid2'
import path from 'path'
import fs from 'fs'
import { uploadMiddleware } from '../middleware/upload.js'
import { createGame, getGame, listGames, updateGameStatus } from '../services/games.js'
import { inngest } from '../workflows/inngest.js'
import { gameUploadPath, gameExtractedPath, gameArtifactsPath, ensureDir } from '../lib/storage.js'
import { runAiExtraction } from '../ai/extractor.js'
import { generateMechanicsDocument } from '../ai/mechanics-generator.js'
import { prisma } from '../db/client.js'

export const gamesRouter: RouterType = Router()

// POST /api/games/upload
gamesRouter.post(
  '/upload',
  (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message })
        return
      }
      next()
    })
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const gameId = createId()
    const originalName = req.file.originalname
    const uploadDir = gameUploadPath(gameId)
    const uploadPath = path.join(uploadDir, 'original.zip')

    ensureDir(uploadDir)
    fs.renameSync(req.file.path, uploadPath)

    await createGame({
      id: gameId,
      name: path.basename(originalName, '.zip'),
      originalFileName: originalName,
      uploadPath,
    })

    await inngest.send({
      name: 'upload/received',
      data: { gameId, uploadPath, originalName },
    })

    res.json({ gameId })
  },
)

// GET /api/games
gamesRouter.get('/', async (_req: Request, res: Response) => {
  const games = await listGames()
  res.json(games)
})

// GET /api/games/:gameId
gamesRouter.get('/:gameId', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }
  res.json(game)
})

// GET /api/games/:gameId/files
gamesRouter.get('/:gameId/files', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }
  const analysisRun = game.analysisRuns[0]
  if (!analysisRun?.fileTreeJson) {
    res.status(404).json({ error: 'File tree not yet available' })
    return
  }
  res.json(analysisRun.fileTreeJson)
})

// GET /api/games/:gameId/candidates
gamesRouter.get('/:gameId/candidates', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }
  const analysisRun = game.analysisRuns[0]
  if (!analysisRun) {
    res.status(404).json({ error: 'No analysis run found' })
    return
  }

  const artifactsDir = path.join(path.resolve(process.env.STORAGE_BASE_PATH ?? './storage'), 'artifacts', game.id)
  const candidatesPath = path.join(artifactsDir, 'ast-candidates.json')
  const classifiedPath = path.join(artifactsDir, 'candidate-files.json')

  const result: Record<string, unknown> = {
    analysisRunId: analysisRun.id,
    status: analysisRun.status,
  }

  if (fs.existsSync(candidatesPath)) {
    result.astCandidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))
  } else {
    result.astCandidates = analysisRun.astCandidatesJson ?? []
  }

  if (fs.existsSync(classifiedPath)) {
    result.candidateFiles = JSON.parse(fs.readFileSync(classifiedPath, 'utf8'))
  } else {
    result.candidateFiles = analysisRun.candidateFilesJson ?? []
  }

  res.json(result)
})

// GET /api/games/:gameId/analysis
gamesRouter.get('/:gameId/analysis', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }
  const analysisRun = game.analysisRuns[0]
  if (!analysisRun) {
    res.status(404).json({ error: 'No analysis run found' })
    return
  }
  res.json(analysisRun)
})

// GET /api/games/:gameId/schema
gamesRouter.get('/:gameId/schema', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }

  const artifactsDir = path.join(path.resolve(process.env.STORAGE_BASE_PATH ?? './storage'), 'artifacts', game.id)
  const normalizedPath = path.join(artifactsDir, 'normalized-schema.json')

  if (fs.existsSync(normalizedPath)) {
    res.json(JSON.parse(fs.readFileSync(normalizedPath, 'utf8')))
    return
  }

  if (game.normalizedSchemaJson) {
    res.json(game.normalizedSchemaJson)
    return
  }

  res.status(404).json({ error: 'Schema not yet generated' })
})

// GET /api/games/:gameId/schema/warnings
gamesRouter.get('/:gameId/schema/warnings', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }

  const schema = game.normalizedSchemaJson as Record<string, unknown> | null
  if (!schema) {
    res.status(404).json({ error: 'Schema not yet generated' })
    return
  }

  res.json({
    warnings: (schema['warnings'] as string[]) ?? [],
    assumptions: schema['assumptions'] ?? [],
    sourceEvidence: schema['sourceEvidence'] ?? [],
  })
})

// GET /api/games/:gameId/mechanics
gamesRouter.get('/:gameId/mechanics', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }

  const artifactsDir = path.join(path.resolve(process.env.STORAGE_BASE_PATH ?? './storage'), 'artifacts', game.id)
  const mechanicsPath = path.join(artifactsDir, 'game-mechanics.md')

  if (!fs.existsSync(mechanicsPath)) {
    res.status(404).json({ error: 'Mechanics document not yet generated' })
    return
  }

  const content = fs.readFileSync(mechanicsPath, 'utf8')
  const format = req.query['format']
  if (format === 'json') {
    res.json({ content })
  } else {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.send(content)
  }
})

// POST /api/games/:gameId/analyze
// Direct trigger for AI extraction — runs in-process without Inngest.
// Used by the test script and can be called when Inngest dev server is not running.
gamesRouter.post('/:gameId/analyze', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }

  const analysisRun = game.analysisRuns[0]
  if (!analysisRun) { res.status(404).json({ error: 'No analysis run found — game must be scanned first' }); return }

  const artifactsDir = gameArtifactsPath(game.id)
  const candidatesPath = path.join(artifactsDir, 'ast-candidates.json')
  const classifiedPath = path.join(artifactsDir, 'candidate-files.json')

  const astCandidates = fs.existsSync(candidatesPath)
    ? JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))
    : (analysisRun.astCandidatesJson ?? [])

  const candidateFiles = fs.existsSync(classifiedPath)
    ? JSON.parse(fs.readFileSync(classifiedPath, 'utf8'))
    : (analysisRun.candidateFilesJson ?? [])

  const extractedPath = gameExtractedPath(game.id)

  // Fire-and-return: respond immediately, run extraction async
  res.json({ status: 'started', gameId: game.id, analysisRunId: analysisRun.id })

  // Run async in background
  ;(async () => {
    try {
      await updateGameStatus(game.id, 'analyzing')
      await prisma.analysisRun.update({ where: { id: analysisRun.id }, data: { status: 'running' } })

      const result = await runAiExtraction({
        gameId: game.id,
        gameName: game.name,
        candidateFiles,
        astCandidates,
        extractedPath,
      })

      await prisma.analysisRun.update({
        where: { id: analysisRun.id },
        data: {
          aiOutputJson: result.schema as never,
          warningsJson: result.warnings as never,
          assumptionsJson: result.schema.assumptions as never,
          status: 'complete',
        },
      })
      await prisma.game.update({
        where: { id: game.id },
        data: {
          normalizedSchemaPath: result.normalizedSchemaPath,
          normalizedSchemaJson: result.schema as never,
        },
      })

      await generateMechanicsDocument(game.id, result.schema)
      await updateGameStatus(game.id, 'analyzed')

      console.log(`[analyze] ${game.id} → analyzed  warnings=${result.warnings.length}  assumptions=${result.schema.assumptions.length}`)
    } catch (err) {
      console.error(`[analyze] ${game.id} failed:`, err)
      await updateGameStatus(game.id, 'failed', { errorMessage: String(err) }).catch(() => {})
    }
  })()
})
