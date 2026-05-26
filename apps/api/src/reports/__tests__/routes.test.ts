import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Mock Inngest so the router doesn't try to send events.
vi.mock('../../workflows/inngest.js', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  functions: [],
}))

// Mock Prisma. We keep state in module-scope refs so each test can tweak it.
const state = {
  game: null as null | Record<string, unknown>,
  report: null as null | Record<string, unknown>,
  sim: null as null | Record<string, unknown>,
}

vi.mock('../../db/client.js', () => ({
  prisma: {
    game: {
      findUnique: vi.fn(async () => state.game),
      update: vi.fn().mockResolvedValue({}),
    },
    simulation: {
      findFirst: vi.fn(async () => state.sim),
    },
    report: {
      findFirst: vi.fn(async () => state.report),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'r-1', ...data })),
    },
  },
}))

// Static schema/extractor mocks (so the import graph for routes doesn't fail).
vi.mock('../../ai/extractor.js', () => ({ runAiExtraction: vi.fn() }))
vi.mock('../../ai/mechanics-generator.js', () => ({ generateMechanicsDocument: vi.fn() }))
vi.mock('../../simulation/runner.js', () => ({ runSimulation: vi.fn() }))

const { gamesRouter } = await import('../../routes/games.js')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/games', gamesRouter)
  return app
}

describe('reports routes', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rtp-routes-'))
    state.game = { id: 'g1', name: 'TestSlot', analysisRuns: [] }
    state.report = null
    state.sim = null
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('GET /reports returns 404 when no reports yet', async () => {
    const res = await request(makeApp()).get('/api/games/g1/reports')
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/No reports/i)
  })

  it('GET /reports returns ready flags for each format', async () => {
    const jsonPath = path.join(tmp, 'r.json')
    const pdfPath = path.join(tmp, 'r.pdf')
    fs.writeFileSync(jsonPath, '{}')
    fs.writeFileSync(pdfPath, '%PDF-1.4\n%%EOF')

    state.report = {
      id: 'r-1',
      gameId: 'g1',
      simulationId: 'sim-1',
      createdAt: new Date('2026-05-25T00:00:00Z'),
      jsonReportPath: jsonPath,
      excelReportPath: '/does/not/exist.xlsx',
      pdfReportPath: pdfPath,
    }

    const res = await request(makeApp()).get('/api/games/g1/reports')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('r-1')
    expect(res.body.json.ready).toBe(true)
    expect(res.body.excel.ready).toBe(false)
    expect(res.body.pdf.ready).toBe(true)
  })

  it('GET /reports/json streams the file with correct headers', async () => {
    const jsonPath = path.join(tmp, 'r.json')
    fs.writeFileSync(jsonPath, JSON.stringify({ hello: 'world' }))
    state.report = {
      id: 'r-1',
      gameId: 'g1',
      simulationId: 'sim-1',
      jsonReportPath: jsonPath,
      excelReportPath: null,
      pdfReportPath: null,
      createdAt: new Date(),
    }

    const res = await request(makeApp()).get('/api/games/g1/reports/json')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.headers['content-disposition']).toContain('TestSlot-report.json')
    expect(JSON.parse(res.text)).toEqual({ hello: 'world' })
  })

  it('GET /reports/excel returns 404 when the file is missing', async () => {
    state.report = {
      id: 'r-1',
      gameId: 'g1',
      simulationId: 'sim-1',
      jsonReportPath: null,
      excelReportPath: '/does/not/exist.xlsx',
      pdfReportPath: null,
      createdAt: new Date(),
    }
    const res = await request(makeApp()).get('/api/games/g1/reports/excel')
    expect(res.status).toBe(404)
  })

  it('GET /reports/pdf streams a PDF with the right content type', async () => {
    const pdfPath = path.join(tmp, 'r.pdf')
    fs.writeFileSync(pdfPath, '%PDF-1.4\n%%EOF')
    state.report = {
      id: 'r-1',
      gameId: 'g1',
      simulationId: 'sim-1',
      jsonReportPath: null,
      excelReportPath: null,
      pdfReportPath: pdfPath,
      createdAt: new Date(),
    }

    const res = await request(makeApp()).get('/api/games/g1/reports/pdf')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toContain('TestSlot-report.pdf')
    expect(res.body.toString().startsWith('%PDF-')).toBe(true)
  })

  it('returns 404 when the game does not exist', async () => {
    state.game = null
    const res = await request(makeApp()).get('/api/games/missing/reports/json')
    expect(res.status).toBe(404)
  })

  it('POST /reports returns 409 if no complete simulation exists', async () => {
    state.sim = null
    const res = await request(makeApp()).post('/api/games/g1/reports')
    expect(res.status).toBe(409)
  })

  it('POST /reports returns 202-equivalent JSON when a sim exists', async () => {
    state.sim = { id: 'sim-1', gameId: 'g1', status: 'complete' }
    const res = await request(makeApp()).post('/api/games/g1/reports')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('started')
    expect(res.body.simulationId).toBe('sim-1')
  })
})
