import { prisma } from '../db/client.js'
import type { GameStatus } from '@rtp/shared-types'

export async function createGame(data: {
  id: string
  name: string
  originalFileName: string
  uploadPath: string
}) {
  return prisma.game.create({
    data: {
      id: data.id,
      name: data.name,
      originalFileName: data.originalFileName,
      uploadPath: data.uploadPath,
      status: 'uploaded',
    },
  })
}

export async function updateGameStatus(
  gameId: string,
  status: GameStatus,
  extra?: { extractedPath?: string; errorMessage?: string },
) {
  return prisma.game.update({
    where: { id: gameId },
    data: { status, ...extra },
  })
}

export async function getGame(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    include: { analysisRuns: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
}

export async function listGames() {
  return prisma.game.findMany({ orderBy: { createdAt: 'desc' } })
}
