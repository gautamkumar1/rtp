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
import { runSimulation } from '../simulation/runner.js'
import { runRtpAnalysis } from '../ai/rtp-analyzer.js'
import {
  ALLOWED_SPIN_COUNTS,
  DEFAULT_SPIN_COUNT,
  isAllowedSpinCount,
  type SpinCount,
} from '../simulation/client.js'

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

// POST /api/games/:gameId/simulate
// Body: { spinCount?, simulateBuyBonus?, seed?, rows?, variantId? }
// When variantId is provided, simulate that variant's schema instead of the parent's.
// Fires the Go simulator asynchronously. Returns immediately with simulationId.
gamesRouter.post('/:gameId/simulate', async (req: Request, res: Response) => {
  const body0 = (req.body ?? {}) as { variantId?: string }
  const targetId = body0.variantId ?? String(req.params.gameId)
  const game = await getGame(targetId)
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  if (!game.normalizedSchemaJson) {
    res.status(409).json({ error: 'Game has no normalized schema yet — analyze first' })
    return
  }

  const body = (req.body ?? {}) as {
    spinCount?: number
    simulateBuyBonus?: boolean
    seed?: number
    rows?: number
    variantId?: string
  }
  const spinCount: SpinCount = isAllowedSpinCount(body.spinCount) ? body.spinCount : DEFAULT_SPIN_COUNT
  if (body.spinCount !== undefined && !isAllowedSpinCount(body.spinCount)) {
    res.status(400).json({
      error: `spinCount must be one of ${ALLOWED_SPIN_COUNTS.join(', ')}`,
    })
    return
  }

  // Create a Simulation row up-front so the client can poll.
  const sim = await prisma.simulation.create({
    data: { gameId: game.id, status: 'pending', spinCount: BigInt(spinCount) },
  })

  await updateGameStatus(game.id, 'simulating')
  res.json({ simulationId: sim.id, gameId: game.id, spinCount })

  // Run async; updates the simulation row when complete or failed.
  ;(async () => {
    try {
      const outcome = await runSimulation({
        gameId: game.id,
        spinCount,
        simulateBuyBonus: body.simulateBuyBonus,
        seed: body.seed,
        rows: body.rows,
        simulationId: sim.id,
      })
      await updateGameStatus(game.id, 'simulated')
      await inngest.send({
        name: 'simulation/completed',
        data: { gameId: game.id, simulationId: sim.id, rtp: outcome.result.rtp },
      })
    } catch (err) {
      console.error(`[simulate] ${game.id} failed:`, err)
      await updateGameStatus(game.id, 'failed', { errorMessage: String(err) }).catch(() => {})
    }
  })()
})

// GET /api/games/:gameId/simulations — list simulations for the game (newest first)
gamesRouter.get('/:gameId/simulations', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  const sims = await prisma.simulation.findMany({
    where: { gameId: game.id },
    orderBy: { createdAt: 'desc' },
  })
  res.json(sims.map((s) => ({
    ...s,
    spinCount: s.spinCount.toString(),
    totalSpins: s.totalSpins?.toString() ?? null,
  })))
})

// GET /api/games/:gameId/simulations/latest — return the latest simulation
gamesRouter.get('/:gameId/simulations/latest', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  const sim = await prisma.simulation.findFirst({
    where: { gameId: game.id },
    orderBy: { createdAt: 'desc' },
  })
  if (!sim) { res.status(404).json({ error: 'No simulations yet' }); return }
  res.json({
    ...sim,
    spinCount: sim.spinCount.toString(),
    totalSpins: sim.totalSpins?.toString() ?? null,
  })
})

// GET /api/games/:gameId/simulations/:simulationId
gamesRouter.get('/:gameId/simulations/:simulationId', async (req: Request, res: Response) => {
  const sim = await prisma.simulation.findUnique({
    where: { id: String(req.params.simulationId) },
  })
  if (!sim || sim.gameId !== String(req.params.gameId)) {
    res.status(404).json({ error: 'Simulation not found' }); return
  }
  res.json({
    ...sim,
    spinCount: sim.spinCount.toString(),
    totalSpins: sim.totalSpins?.toString() ?? null,
  })
})

// GET /api/games/:gameId/simulations/:simulationId/output
// Stream the raw simulation-output.json for the simulation
gamesRouter.get('/:gameId/simulations/:simulationId/output', async (req: Request, res: Response) => {
  const sim = await prisma.simulation.findUnique({
    where: { id: String(req.params.simulationId) },
  })
  if (!sim || sim.gameId !== String(req.params.gameId)) {
    res.status(404).json({ error: 'Simulation not found' }); return
  }
  if (!sim.rawOutputPath || !fs.existsSync(sim.rawOutputPath)) {
    res.status(404).json({ error: 'Output not yet available' }); return
  }
  res.setHeader('Content-Type', 'application/json')
  res.sendFile(path.resolve(sim.rawOutputPath))
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

// ─────────────────────────────────────────────────────────────────────────
// Reports — Phase 6.5
// ─────────────────────────────────────────────────────────────────────────

async function latestReportForGame(gameId: string) {
  return prisma.report.findFirst({
    where: { gameId },
    orderBy: { createdAt: 'desc' },
  })
}

// POST /api/games/:gameId/reports — manually trigger report generation for the
// latest complete simulation (useful when Inngest isn't running locally).
gamesRouter.post('/:gameId/reports', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  const game = await getGame(gameId)
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }

  const sim = await prisma.simulation.findFirst({
    where: { gameId, status: 'complete' },
    orderBy: { createdAt: 'desc' },
  })
  if (!sim) { res.status(409).json({ error: 'No complete simulation found — run simulation first' }); return }

  res.json({ status: 'started', gameId, simulationId: sim.id })

  ;(async () => {
    try {
      const { generateAllReports } = await import('../reports/generator.js')
      const out = await generateAllReports({ gameId, simulationId: sim.id })
      console.log(`[reports] ${gameId} → complete  reportId=${out.reportId}  verdict=${out.verdict}`)
    } catch (err) {
      console.error(`[reports] ${gameId} failed:`, err)
    }
  })()
})

// GET /api/games/:gameId/reports — return metadata for the latest report set.
gamesRouter.get('/:gameId/reports', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  const game = await getGame(gameId)
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }

  const report = await latestReportForGame(gameId)
  if (!report) { res.status(404).json({ error: 'No reports generated yet' }); return }

  res.json({
    id: report.id,
    gameId: report.gameId,
    simulationId: report.simulationId,
    createdAt: report.createdAt,
    json: { ready: Boolean(report.jsonReportPath && fs.existsSync(report.jsonReportPath)) },
    excel: { ready: Boolean(report.excelReportPath && fs.existsSync(report.excelReportPath)) },
    pdf: { ready: Boolean(report.pdfReportPath && fs.existsSync(report.pdfReportPath)) },
  })
})

function streamReportFile(
  res: Response,
  pathOnDisk: string | null,
  contentType: string,
  downloadName: string,
) {
  if (!pathOnDisk || !fs.existsSync(pathOnDisk)) {
    res.status(404).json({ error: 'Report not yet generated' })
    return
  }
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
  res.sendFile(path.resolve(pathOnDisk))
}

// GET /api/games/:gameId/reports/json — download/stream JSON report
gamesRouter.get('/:gameId/reports/json', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  const game = await getGame(gameId)
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  const report = await latestReportForGame(gameId)
  if (!report) { res.status(404).json({ error: 'No reports generated yet' }); return }
  streamReportFile(res, report.jsonReportPath, 'application/json', `${game.name}-report.json`)
})

// GET /api/games/:gameId/reports/excel — download Excel report
gamesRouter.get('/:gameId/reports/excel', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  const game = await getGame(gameId)
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  const report = await latestReportForGame(gameId)
  if (!report) { res.status(404).json({ error: 'No reports generated yet' }); return }
  streamReportFile(
    res,
    report.excelReportPath,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    `${game.name}-report.xlsx`,
  )
})

// GET /api/games/:gameId/reports/pdf — download PDF report
gamesRouter.get('/:gameId/reports/pdf', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  const game = await getGame(gameId)
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  const report = await latestReportForGame(gameId)
  if (!report) { res.status(404).json({ error: 'No reports generated yet' }); return }
  streamReportFile(res, report.pdfReportPath, 'application/pdf', `${game.name}-report.pdf`)
})

// GET /api/games/:gameId/variants — list variant games linked to this parent
gamesRouter.get('/:gameId/variants', async (req: Request, res: Response) => {
  const game = await getGame(String(req.params.gameId))
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }

  const variants = await prisma.game.findMany({
    where: { parentGameId: game.id },
    orderBy: { variantLabel: 'asc' },
    select: { id: true, name: true, variantLabel: true, declaredRtp: true, status: true, createdAt: true },
  })
  res.json({ gameId: game.id, variants })
})

// ─────────────────────────────────────────────────────────────────────────
// RTP Analysis (o3 AI analytical)
// ─────────────────────────────────────────────────────────────────────────

// POST /api/games/:gameId/rtp-analysis — trigger o3 analysis async
gamesRouter.post('/:gameId/rtp-analysis', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, rtpAnalysisStatus: true },
  })
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }

  if (game.rtpAnalysisStatus === 'running') {
    res.status(409).json({ error: 'Analysis already running' })
    return
  }

  res.json({ status: 'started', gameId })

  ;(async () => {
    try {
      await runRtpAnalysis(gameId)
    } catch (err) {
      console.error(`[rtp-analysis] ${gameId} failed:`, err)
      await prisma.game.update({
        where: { id: gameId },
        data: { rtpAnalysisStatus: 'failed' },
      }).catch(() => {})
    }
  })()
})

// GET /api/games/:gameId/rtp-analysis — return stored result
gamesRouter.get('/:gameId/rtp-analysis', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, rtpAnalysisStatus: true, rtpAnalysisJson: true },
  })
  if (!game) { res.status(404).json({ error: 'Game not found' }); return }
  res.json({
    status: game.rtpAnalysisStatus ?? 'idle',
    result: game.rtpAnalysisJson ?? null,
  })
})

// POST /api/games/:gameId/rtp-analysis/reset — clear stored result
gamesRouter.post('/:gameId/rtp-analysis/reset', async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId)
  await prisma.game.update({
    where: { id: gameId },
    data: { rtpAnalysisStatus: 'idle', rtpAnalysisJson: null },
  }).catch(() => {})
  res.json({ status: 'reset' })
})

// POST /api/games/:gameId/variants — create a variant of this game
// Body: { variantLabel: string, declaredRtp?: number, normalizedSchemaJson?: object }
gamesRouter.post('/:gameId/variants', async (req: Request, res: Response) => {
  const parent = await getGame(String(req.params.gameId))
  if (!parent) { res.status(404).json({ error: 'Game not found' }); return }

  const body = (req.body ?? {}) as { variantLabel?: string; declaredRtp?: number; normalizedSchemaJson?: object }
  if (!body.variantLabel) {
    res.status(400).json({ error: 'variantLabel is required' })
    return
  }

  const variant = await prisma.game.create({
    data: {
      name: `${parent.name} — ${body.variantLabel}`,
      provider: parent.provider,
      status: 'analyzed',
      originalFileName: parent.originalFileName,
      uploadPath: parent.uploadPath,
      extractedPath: parent.extractedPath,
      normalizedSchemaPath: parent.normalizedSchemaPath,
      normalizedSchemaJson: (body.normalizedSchemaJson ?? parent.normalizedSchemaJson) as object,
      parentGameId: parent.id,
      variantLabel: body.variantLabel,
      declaredRtp: body.declaredRtp ?? null,
    },
  })
  res.status(201).json({ id: variant.id, variantLabel: variant.variantLabel })
})
