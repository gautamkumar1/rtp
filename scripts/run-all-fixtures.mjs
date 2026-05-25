#!/usr/bin/env node
/**
 * Upload all 5 fixture ZIPs, run full pipeline on each, print a summary table.
 * Uses the direct POST /analyze endpoint (no Inngest dev server needed).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASE = process.env.API_URL ?? 'http://localhost:3001/api'

const FIXTURES = [
  '2GamesSource.zip',
  'Category4-ProgressiveMultiplier.zip',
  'Category6-Tumble (2).zip',
  'src-20251222T115612Z-3-001.zip',
  'Zeus_math.zip',
]

const STATUS_ORDER = [
  'uploaded','extracting','extracted','scanning','scanned',
  'analyzing','analyzed','simulating','simulated','reporting','complete',
]

// ── helpers ──────────────────────────────────────────────────────────────────
async function api(urlPath, opts = {}) {
  const res = await fetch(`${BASE}${urlPath}`, opts)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function pad(s, n) { return String(s).padEnd(n).slice(0, n) }

async function pollUntil(gameId, target, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    const { body } = await api(`/games/${gameId}`)
    const s = body?.status ?? 'unknown'
    if (s !== last) { process.stdout.write(`  → ${s}\n`); last = s }
    if (s === 'failed') return body
    if (STATUS_ORDER.indexOf(s) >= STATUS_ORDER.indexOf(target)) return body
    await sleep(3000)
  }
  return null
}

// ── upload ────────────────────────────────────────────────────────────────────
async function upload(zipPath) {
  const bytes = fs.readFileSync(zipPath)
  const blob = new Blob([bytes], { type: 'application/zip' })
  const form = new FormData()
  form.append('file', blob, path.basename(zipPath))
  const { ok, body } = await api('/games/upload', { method: 'POST', body: form })
  if (!ok) throw new Error(`Upload failed: ${JSON.stringify(body)}`)
  return body.gameId
}

// ── per-fixture pipeline ──────────────────────────────────────────────────────
async function runFixture(zipName) {
  const zipPath = path.join(ROOT, zipName)
  const label = zipName.replace('.zip', '').slice(0, 35)

  console.log(`\n${'═'.repeat(64)}`)
  console.log(`  ${zipName}`)
  console.log('═'.repeat(64))

  // 1. Upload
  process.stdout.write('  Upload… ')
  let gameId
  try {
    gameId = await upload(zipPath)
    console.log(`gameId=${gameId}`)
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
    return { label, gameId: null, reels: 0, paylines: 0, symbols: 0, paytable: 0, warnings: '?', assumptions: '?', mechanics: false, pass: false }
  }

  // 2. Trigger full pipeline (extract → scan → classify → AI analyze)
  console.log('  Running full pipeline…')
  await api(`/games/${gameId}/run-pipeline`, { method: 'POST' })
  const analyzed = await pollUntil(gameId, 'analyzed', 480_000)
  if (!analyzed || analyzed.status === 'failed') {
    console.log('  ✗ Pipeline failed')
    return { label, gameId, reels: 0, paylines: 0, symbols: 0, paytable: 0, warnings: 'failed', assumptions: '?', mechanics: false, pass: false }
  }

  // 3. Report candidate counts
  const { body: cands } = await api(`/games/${gameId}/candidates`)
  const astCount = Array.isArray(cands?.astCandidates) ? cands.astCandidates.length : 0
  const highCount = Array.isArray(cands?.astCandidates) ? cands.astCandidates.filter(c => c.confidence === 'high').length : 0
  console.log(`  Candidates: ${astCount} AST  (${highCount} high-confidence)`)

  // 4. Read schema
  const { ok: schemaOk, body: schema } = await api(`/games/${gameId}/schema`)
  if (!schemaOk) {
    console.log('  ✗ Schema not found')
    return { label, gameId, reels: 0, paylines: 0, symbols: 0, paytable: 0, warnings: '?', assumptions: '?', mechanics: false, pass: false }
  }

  const reels = schema.reels?.length ?? 0
  const paylines = schema.paylines?.length ?? 0
  const symbols = schema.symbols?.length ?? 0
  const paytable = Object.keys(schema.paytable ?? {}).length
  const warnings = schema.warnings?.length ?? 0
  const assumptions = schema.assumptions?.length ?? 0

  // 6. Check mechanics doc
  const { ok: mechOk } = await api(`/games/${gameId}/mechanics?format=json`)

  // 7. Print schema highlights
  console.log(`  Reels:      ${reels}  strips: [${(schema.reels ?? []).map(r => r.length).join(', ')}]`)
  console.log(`  Paylines:   ${paylines}`)
  console.log(`  Symbols:    ${symbols}`)
  console.log(`  Paytable:   ${paytable} entries`)
  console.log(`  Wild:       ${schema.wild?.symbolId ?? 'none'}`)
  console.log(`  Scatter:    ${schema.scatter?.symbolId ?? 'none'}`)
  console.log(`  FreeSpin:   ${schema.freeSpins ? `${schema.freeSpins.count} spins × ${schema.freeSpins.multiplier}x` : 'none'}`)
  console.log(`  BuyBonus:   ${schema.buyBonus ? `${schema.buyBonus.costMultiplier}x bet` : 'none'}`)
  console.log(`  Warnings:   ${warnings}`)
  console.log(`  Assumptions:${assumptions}`)
  console.log(`  Mechanics:  ${mechOk ? '✓ generated' : '✗ missing'}`)

  if (warnings > 0) {
    console.log(`\n  Warnings:`)
    for (const w of schema.warnings.slice(0, 6)) console.log(`    ⚠  ${w}`)
  }

  const pass = reels > 0 && symbols > 0 && paytable > 0 && mechOk
  console.log(`\n  Result: ${pass ? '✅ PASS' : '⚠️  PARTIAL'} (reels=${reels}, paylines=${paylines}, symbols=${symbols}, paytable=${paytable})`)

  return { label, gameId, reels, paylines, symbols, paytable, warnings, assumptions, mechanics: mechOk, pass }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🎰  RTP Platform — All 5 Fixtures Pipeline`)
  console.log(`    API: ${BASE}\n`)

  const results = []
  for (const zip of FIXTURES) {
    const r = await runFixture(zip)
    results.push(r)
  }

  // Summary table
  console.log(`\n${'═'.repeat(64)}`)
  console.log('  FINAL SUMMARY')
  console.log('═'.repeat(64))
  console.log(`  ${'Fixture'.padEnd(38)} ${'Reels'.padStart(5)} ${'Lines'.padStart(5)} ${'Syms'.padStart(5)} ${'Pay'.padStart(4)} ${'Warn'.padStart(5)}  Result`)
  console.log(`  ${'-'.repeat(62)}`)
  for (const r of results) {
    const res = r.pass ? '✅ PASS' : '⚠️  PARTIAL'
    console.log(`  ${pad(r.label, 38)} ${String(r.reels).padStart(5)} ${String(r.paylines).padStart(5)} ${String(r.symbols).padStart(5)} ${String(r.paytable).padStart(4)} ${String(r.warnings).padStart(5)}  ${res}`)
  }

  const passed = results.filter(r => r.pass).length
  console.log(`\n  ${passed}/${results.length} fixtures PASS\n`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
