#!/usr/bin/env node
/**
 * Real API integration test script.
 * Simulates the full frontend flow against the live Express server.
 *
 * Usage:
 *   node scripts/test-api.mjs [--game-id <id>] [--upload <path-to-zip>] [--skip-upload]
 *
 * If --game-id is given, skips upload and polls that game.
 * If --skip-upload is given, lists existing games and uses the most recent.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const BASE_URL = process.env.API_URL ?? 'http://localhost:3001/api'
const FIXTURE_DIR = ROOT // ZIPs are at root

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flagIdx = (flag) => args.indexOf(flag)
const flagVal = (flag) => { const i = flagIdx(flag); return i >= 0 ? args[i + 1] : null }

const forceGameId = flagVal('--game-id')
const uploadZip = flagVal('--upload')
const skipUpload = args.includes('--skip-upload') || !!forceGameId

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`)
}
function ok(msg) { log('✅', msg) }
function warn(msg) { log('⚠️ ', msg) }
function fail(msg) { log('❌', msg); }
function section(title) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

async function apiFetch(path, opts = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, opts)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Upload a ZIP ─────────────────────────────────────────────────────────────
async function uploadFixture(zipPath) {
  section(`UPLOAD: ${path.basename(zipPath)}`)
  const data = new FormData()
  const bytes = fs.readFileSync(zipPath)
  const blob = new Blob([bytes], { type: 'application/zip' })
  data.append('file', blob, path.basename(zipPath))

  log('📤', `Uploading ${(bytes.length / 1024 / 1024).toFixed(1)} MB …`)
  const { status, ok: isOk, body } = await apiFetch('/games/upload', { method: 'POST', body: data })

  if (!isOk) {
    fail(`Upload failed (${status}): ${JSON.stringify(body)}`)
    process.exit(1)
  }
  ok(`Uploaded — gameId: ${body.gameId}`)
  return body.gameId
}

// ─── Poll game status ─────────────────────────────────────────────────────────
const STATUS_ORDER = [
  'uploaded', 'extracting', 'extracted', 'scanning', 'scanned',
  'analyzing', 'analyzed', 'simulating', 'simulated', 'reporting', 'complete',
]

async function pollUntil(gameId, targetStatus, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs
  let lastStatus = ''
  while (Date.now() < deadline) {
    const { ok: isOk, body } = await apiFetch(`/games/${gameId}`)
    if (!isOk) { warn(`Poll returned non-200`); await sleep(3000); continue }

    const status = body.status
    if (status !== lastStatus) {
      log('🔄', `Status: ${status}`)
      lastStatus = status
    }

    if (status === 'failed') {
      fail(`Game failed: ${body.errorMessage ?? 'unknown'}`)
      return body
    }

    const targetIdx = STATUS_ORDER.indexOf(targetStatus)
    const currentIdx = STATUS_ORDER.indexOf(status)
    if (currentIdx >= targetIdx) return body

    await sleep(3000)
  }
  fail(`Timed out waiting for status ${targetStatus}`)
  return null
}

// ─── Test: GET /games ─────────────────────────────────────────────────────────
async function testListGames() {
  section('GET /games')
  const { status, ok: isOk, body } = await apiFetch('/games')
  if (!isOk) { fail(`${status}`); return null }
  ok(`Listed ${body.length} game(s)`)
  for (const g of body.slice(0, 5)) {
    console.log(`     ${g.id}  ${g.name.padEnd(30)} ${g.status}`)
  }
  return body
}

// ─── Test: GET /games/:id ─────────────────────────────────────────────────────
async function testGetGame(gameId) {
  section(`GET /games/${gameId}`)
  const { status, ok: isOk, body } = await apiFetch(`/games/${gameId}`)
  if (!isOk) { fail(`${status}: ${JSON.stringify(body)}`); return null }
  ok(`name=${body.name}  status=${body.status}`)
  return body
}

// ─── Test: GET /games/:id/files ───────────────────────────────────────────────
async function testFileTree(gameId) {
  section(`GET /games/${gameId}/files`)
  const { status, ok: isOk, body } = await apiFetch(`/games/${gameId}/files`)
  if (!isOk) { warn(`${status}: ${JSON.stringify(body)}`); return }
  const count = Array.isArray(body) ? body.length : (body.length ?? '?')
  ok(`File tree: ${count} entries`)
  if (Array.isArray(body)) {
    const sample = body.slice(0, 5).map((f) => f.relativePath ?? f.path).join(', ')
    console.log(`     Sample: ${sample}`)
  }
}

// ─── Test: GET /games/:id/candidates ─────────────────────────────────────────
async function testCandidates(gameId) {
  section(`GET /games/${gameId}/candidates`)
  const { status, ok: isOk, body } = await apiFetch(`/games/${gameId}/candidates`)
  if (!isOk) { warn(`${status}: ${JSON.stringify(body)}`); return }
  const astCount = Array.isArray(body.astCandidates) ? body.astCandidates.length : 0
  const fileCount = Array.isArray(body.candidateFiles) ? body.candidateFiles.length : 0
  ok(`Candidate files: ${fileCount}  AST candidates: ${astCount}`)
  if (astCount > 0) {
    const highs = body.astCandidates.filter((c) => c.confidence === 'high')
    console.log(`     High-confidence: ${highs.length}`)
    const sample = body.astCandidates.slice(0, 3)
    for (const c of sample) {
      console.log(`     [${c.confidence}] ${c.language}/${c.kind} "${c.name}" @ ${c.sourceFile}:${c.lineNumber}`)
    }
  }
}

// ─── Trigger direct AI extraction ────────────────────────────────────────────
async function triggerAnalyze(gameId) {
  section(`POST /games/${gameId}/analyze  (direct trigger)`)
  const { status, ok: isOk, body } = await apiFetch(`/games/${gameId}/analyze`, { method: 'POST' })
  if (!isOk) {
    warn(`${status}: ${JSON.stringify(body)}`)
    return false
  }
  ok(`Analysis started in background — polling for analyzed status…`)
  const result = await pollUntil(gameId, 'analyzed', 300_000)
  if (!result || result.status === 'failed') {
    fail(`Extraction failed or timed out`)
    return false
  }
  ok(`Game is now: ${result.status}`)
  return true
}

// ─── Test: GET /games/:id/schema ─────────────────────────────────────────────
async function testSchema(gameId) {
  section(`GET /games/${gameId}/schema`)
  const { status, ok: isOk, body } = await apiFetch(`/games/${gameId}/schema`)
  if (!isOk) { warn(`${status}: ${JSON.stringify(body)}`); return null }

  ok(`Schema: ${body.gameName} (${body.provider})`)
  console.log(`     Reels:    ${body.reels?.length ?? 0}  (strips: ${body.reels?.map((r) => r.length).join(',')})`)
  console.log(`     Paylines: ${body.paylines?.length ?? 0}`)
  console.log(`     Symbols:  ${body.symbols?.length ?? 0}`)
  console.log(`     Paytable: ${Object.keys(body.paytable ?? {}).length} entries`)
  console.log(`     Wild:     ${body.wild?.symbolId ?? 'none'}`)
  console.log(`     Scatter:  ${body.scatter?.symbolId ?? 'none'}`)
  console.log(`     FreeSpin: ${body.freeSpins ? `${body.freeSpins.count} spins × ${body.freeSpins.multiplier}x` : 'none'}`)
  console.log(`     Warnings: ${body.warnings?.length ?? 0}`)
  console.log(`     Assumptions: ${body.assumptions?.length ?? 0}`)

  if (body.warnings?.length > 0) {
    console.log(`\n     Warnings:`)
    for (const w of body.warnings.slice(0, 5)) console.log(`       ⚠  ${w}`)
  }
  if (body.assumptions?.length > 0) {
    console.log(`\n     Assumptions (first 3):`)
    for (const a of body.assumptions.slice(0, 3)) {
      console.log(`       • ${a.field}: ${JSON.stringify(a.assumedValue)} — ${a.reason}`)
    }
  }
  return body
}

// ─── Test: GET /games/:id/schema/warnings ────────────────────────────────────
async function testSchemaWarnings(gameId) {
  section(`GET /games/${gameId}/schema/warnings`)
  const { status, ok: isOk, body } = await apiFetch(`/games/${gameId}/schema/warnings`)
  if (!isOk) { warn(`${status}: ${JSON.stringify(body)}`); return }
  ok(`warnings=${body.warnings?.length ?? 0}  assumptions=${body.assumptions?.length ?? 0}  evidence=${body.sourceEvidence?.length ?? 0}`)
}

// ─── Test: GET /games/:id/mechanics ──────────────────────────────────────────
async function testMechanics(gameId) {
  section(`GET /games/${gameId}/mechanics`)
  const { status, ok: isOk, body } = await apiFetch(`/games/${gameId}/mechanics?format=json`)
  if (!isOk) { warn(`${status}: ${JSON.stringify(body)}`); return }
  const preview = typeof body === 'object' ? (body.content ?? '').slice(0, 400) : String(body).slice(0, 400)
  ok(`Mechanics doc (${preview.length} chars preview):`)
  console.log('\n' + preview.split('\n').map((l) => `     ${l}`).join('\n'))
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function printSummary(results) {
  section('SUMMARY')
  for (const [label, passed] of results) {
    console.log(`  ${passed ? '✅' : '❌'}  ${label}`)
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🎰  RTP Platform API Integration Test`)
  console.log(`    Base URL: ${BASE_URL}\n`)

  // 1. List games
  const games = await testListGames()
  const results = []

  results.push(['GET /games returns list', Array.isArray(games)])

  // 2. Resolve gameId
  let gameId = forceGameId

  if (!gameId && !skipUpload) {
    // Find a fixture ZIP to upload
    const fixtures = [
      '2GamesSource.zip',
      'Zeus_math.zip',
      'Category4-ProgressiveMultiplier.zip',
      'Category6-Tumble (2).zip',
      'src-20251222T115612Z-3-001.zip',
    ]
    const zipPath = uploadZip ?? fixtures.map((f) => path.join(FIXTURE_DIR, f)).find(fs.existsSync)
    if (!zipPath) {
      warn('No fixture ZIP found at repo root and --upload not specified. Using most recent game.')
      gameId = games?.[0]?.id
    } else {
      gameId = await uploadFixture(zipPath)
      results.push(['Upload succeeds', !!gameId])
    }
  }

  if (!gameId && games?.length > 0) {
    gameId = games[0].id
    log('📌', `Using most recent game: ${gameId} (${games[0].name}) — status: ${games[0].status}`)
  }

  if (!gameId) {
    fail('No gameId available. Upload a fixture or run the server with existing data.')
    process.exit(1)
  }

  // 3. GET /games/:id
  const game = await testGetGame(gameId)
  results.push(['GET /games/:id works', !!game])

  // 4. Wait for scanned (if still processing)
  if (game && ['uploaded', 'extracting', 'extracted', 'scanning'].includes(game.status)) {
    log('⏳', 'Waiting for scanned state…')
    await pollUntil(gameId, 'scanned', 120_000)
  }

  // 5. File tree
  await testFileTree(gameId)
  const { ok: ftOk } = await apiFetch(`/games/${gameId}/files`)
  results.push(['GET /games/:id/files returns tree', ftOk])

  // 6. Candidates
  await testCandidates(gameId)
  const { ok: candOk } = await apiFetch(`/games/${gameId}/candidates`)
  results.push(['GET /games/:id/candidates returns data', candOk])

  // 7. Trigger AI extraction if needed
  const currentGame = (await apiFetch(`/games/${gameId}`)).body
  const currentStatus = currentGame?.status

  if (currentStatus === 'analyzing') {
    // Stuck in analyzing — Inngest not running; reset to scanned so we can re-trigger
    log('⚠️ ', 'Game stuck in "analyzing" (Inngest not running). Triggering direct extraction…')
    const triggered = await triggerAnalyze(gameId)
    results.push(['Direct /analyze trigger works', triggered])
  } else if (['scanned', 'classified'].includes(currentStatus)) {
    log('⏳', 'Game scanned — triggering direct AI extraction…')
    const triggered = await triggerAnalyze(gameId)
    results.push(['Direct /analyze trigger works', triggered])
  } else if (currentStatus === 'analyzed' || STATUS_ORDER.indexOf(currentStatus) > STATUS_ORDER.indexOf('analyzed')) {
    log('✔ ', `Already analyzed (status: ${currentStatus})`)
  }

  // 8. Schema
  const schema = await testSchema(gameId)
  results.push(['GET /games/:id/schema returns schema', !!schema && !!schema.reels])
  results.push(['Schema has reels', (schema?.reels?.length ?? 0) > 0])
  results.push(['Schema has paylines', (schema?.paylines?.length ?? 0) > 0])
  results.push(['Schema has symbols', (schema?.symbols?.length ?? 0) > 0])

  // 9. Schema warnings
  await testSchemaWarnings(gameId)
  const { ok: warnOk } = await apiFetch(`/games/${gameId}/schema/warnings`)
  results.push(['GET /games/:id/schema/warnings works', warnOk])

  // 10. Mechanics doc
  await testMechanics(gameId)
  const { ok: mechOk } = await apiFetch(`/games/${gameId}/mechanics?format=json`)
  results.push(['GET /games/:id/mechanics returns doc', mechOk])

  // Summary
  printSummary(results)

  const passed = results.filter(([, p]) => p).length
  const total = results.length
  console.log(`\n  ${passed}/${total} checks passed\n`)

  if (passed < total) process.exit(1)
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err)
  process.exit(1)
})
