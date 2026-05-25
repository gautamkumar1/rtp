import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import AdmZip from 'adm-zip'

// Mock Inngest so it doesn't try to connect
vi.mock('../src/workflows/inngest.js', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  functions: [],
}))

// Mock Prisma
vi.mock('../src/db/client.js', () => ({
  prisma: {
    game: {
      create: vi.fn().mockImplementation((args: { data: { id: string } }) =>
        Promise.resolve({ id: args.data.id, ...args.data }),
      ),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

// Dynamically import after mocks are set up
const { gamesRouter } = await import('../src/routes/games.js')

function makeTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/games', gamesRouter)
  return app
}

function makeZipBuffer(): Buffer {
  const zip = new AdmZip()
  zip.addFile('main.go', Buffer.from('package main'))
  return zip.toBuffer()
}

describe('POST /api/games/upload', () => {
  it('accepts a valid ZIP and returns gameId', async () => {
    const app = makeTestApp()
    const res = await request(app)
      .post('/api/games/upload')
      .attach('file', makeZipBuffer(), { filename: 'game.zip', contentType: 'application/zip' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('gameId')
  })

  it('rejects non-ZIP files', async () => {
    const app = makeTestApp()
    const res = await request(app)
      .post('/api/games/upload')
      .attach('file', Buffer.from('not a zip'), { filename: 'game.txt', contentType: 'text/plain' })
    expect(res.status).toBe(400)
  })

  it('rejects request with no file', async () => {
    const app = makeTestApp()
    const res = await request(app).post('/api/games/upload')
    expect(res.status).toBe(400)
  })
})
