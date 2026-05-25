import { Router, type Request, type Response, type NextFunction } from 'express'
import { createId } from '@paralleldrive/cuid2'
import path from 'path'
import fs from 'fs'
import { uploadMiddleware } from '../middleware/upload.js'
import { createGame, getGame, listGames } from '../services/games.js'
import { inngest } from '../workflows/inngest.js'
import { gameUploadPath, ensureDir } from '../lib/storage.js'

export const gamesRouter = Router()

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
