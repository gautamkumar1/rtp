#!/usr/bin/env node
/**
 * Drive each of the 5 fixture ZIPs through the full Phase 1-6 pipeline:
 *   upload → (Inngest: extract → scan → classify) → analyze → simulate → reports
 * Verifies that JSON, Excel, and PDF reports are produced and downloadable.
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

const SPIN_COUNT = Number(process.env.FIXTURE_SPIN_COUNT ?? 1_000_000)

const STATUS_ORDER = [
  'uploaded', 'extracting', 'extracted', 'scanning', 'scanned',
  'analyzing', 'analyzed', 'simulating', 'simulated', 'reporting', 'complete',
]

async function api(p, opts = {}) {
  const res = await fetch(`${BASE}${p}`, opts)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function pollUntil(gameId, target, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    const { body } = await api(`/games/${gameId}`)
    const s = body?.status ?? 'unknown'
    if (s !== last) { console.log(`     → ${s}`); last = s }
    if (s === 'failed') return body
    if (STATUS_ORDER.indexOf(s) >= STATUS_ORDER.indexOf(target)) return body
    await sleep(2000)
  }
  return null
}

async function upload(zipPath) {
  const bytes = fs.readFileSync(zipPath)
  const blob = new Blob([bytes], { type: 'application/zip' })
  const form = new FormData()
  form.append('file', blob, path.basename(zipPath))
  const { ok, body } = await api('/games/upload', { method: 'POST', body: form })
  if (!ok) throw new Error(`upload failed: ${JSON.stringify(body)}`)
  return body.gameId
}

async function downloadAndStat(gameId, fmt) {
  const res = await fetch(`${BASE}/games/${gameId}/reports/${fmt}`)
  if (!res.ok) return { ok: false, size: 0 }
  const buf = Buffer.from(await res.arrayBuffer())
  return { ok: true, size: buf.length, head: buf.subarray(0, 5).toString('binary') }
}

async function runFixture(zipName) {
  const zipPath = path.join(ROOT, zipName)
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`  ${zipName}`)
  console.log('═'.repeat(72))

  const result = {
    name: zipName,
    gameId: null,
    scanned: false,
    analyzed: false,
    rtp: null,
    reportRow: null,
    json: null,
    excel: null,
    pdf: null,
    error: null,
  }

  try {
    process.stdout.write('  1. Upload      … ')
    const gameId = await upload(zipPath)
    result.gameId = gameId
    console.log(`gameId=${gameId}`)

    // Step 2: wait for Inngest to drive extract → scan → classify
    console.log('  2. Inngest pipeline → scanned')
    const scanned = await pollUntil(gameId, 'scanned', 120_000)
    if (!scanned || scanned.status === 'failed') {
      result.error = `did not reach scanned (status=${scanned?.status})`
      return result
    }
    result.scanned = true

    // Step 3: Direct analyze (bypasses Inngest schema/generated auto-sim)
    console.log('  3. AI analyze (POST /analyze)')
    const an = await api(`/games/${gameId}/analyze`, { method: 'POST' })
    if (!an.ok) { result.error = `analyze: ${JSON.stringify(an.body)}`; return result }
    const analyzed = await pollUntil(gameId, 'analyzed', 360_000)
    if (!analyzed || analyzed.status === 'failed') {
      result.error = `did not reach analyzed (status=${analyzed?.status})`
      return result
    }
    result.analyzed = true

    // Step 4: Trigger simulation
    console.log(`  4. Simulate (${SPIN_COUNT.toLocaleString()} spins)`)
    const sim = await api(`/games/${gameId}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spinCount: SPIN_COUNT, seed: 12345 }),
    })
    if (!sim.ok) { result.error = `simulate: ${JSON.stringify(sim.body)}`; return result }
    const simulated = await pollUntil(gameId, 'simulated', 600_000)
    if (!simulated || simulated.status === 'failed') {
      result.error = `did not reach simulated (status=${simulated?.status})`
      return result
    }

    // Read RTP off latest simulation
    const latest = await api(`/games/${gameId}/simulations/latest`)
    if (latest.ok) {
      result.rtp = latest.body.rtp ? Number(latest.body.rtp) : null
    }

    // Step 5: Reports — Inngest simulation/completed handler should run this,
    // but to keep this script Inngest-agnostic we also trigger directly.
    console.log('  5. Generate reports')
    const rep = await api(`/games/${gameId}/reports`, { method: 'POST' })
    if (!rep.ok) { result.error = `reports trigger: ${JSON.stringify(rep.body)}`; return result }

    const deadline = Date.now() + 120_000
    let allReady = false
    while (Date.now() < deadline) {
      const status = await api(`/games/${gameId}/reports`)
      if (status.ok && status.body.json?.ready && status.body.excel?.ready && status.body.pdf?.ready) {
        result.reportRow = status.body
        allReady = true
        break
      }
      await sleep(2000)
    }
    if (!allReady) { result.error = 'reports not ready before timeout'; return result }

    // Step 6: Download
    result.json = await downloadAndStat(gameId, 'json')
    result.excel = await downloadAndStat(gameId, 'excel')
    result.pdf = await downloadAndStat(gameId, 'pdf')
    console.log(`  6. Downloaded — json=${result.json.size}B  excel=${result.excel.size}B  pdf=${result.pdf.size}B`)
    return result
  } catch (e) {
    result.error = String(e?.message ?? e)
    return result
  }
}

function pad(s, n) { return String(s).padEnd(n).slice(0, n) }
function num(n) { return n == null ? '—' : Number(n).toLocaleString() }

async function main() {
  console.log(`🎰  RTP Verification — Phase 6 end-to-end across 5 fixtures`)
  console.log(`    API: ${BASE}`)
  console.log(`    Spin count per fixture: ${SPIN_COUNT.toLocaleString()}`)

  const results = []
  for (const zip of FIXTURES) {
    const r = await runFixture(zip)
    results.push(r)
  }

  console.log(`\n${'═'.repeat(72)}`)
  console.log('  PHASE 6 FIXTURE SUMMARY')
  console.log('═'.repeat(72))
  console.log(`  ${pad('Fixture', 36)}  ${pad('RTP', 10)} ${pad('JSON', 10)} ${pad('Excel', 10)} ${pad('PDF', 10)}`)
  console.log(`  ${'-'.repeat(80)}`)
  for (const r of results) {
    const rtp = r.rtp != null ? `${(r.rtp * 100).toFixed(2)}%` : '—'
    const j = r.json?.ok ? `${num(r.json.size)}B` : '✗'
    const x = r.excel?.ok ? `${num(r.excel.size)}B` : '✗'
    const p = r.pdf?.ok ? `${num(r.pdf.size)}B` : '✗'
    console.log(`  ${pad(r.name, 36)}  ${pad(rtp, 10)} ${pad(j, 10)} ${pad(x, 10)} ${pad(p, 10)}`)
    if (r.error) console.log(`     ↳ ${r.error}`)
  }
  const passed = results.filter(r => r.json?.ok && r.excel?.ok && r.pdf?.ok).length
  console.log(`\n  ${passed}/${results.length} fixtures produced all 3 report formats\n`)
  fs.writeFileSync('/tmp/phase6-results.json', JSON.stringify(results, null, 2))
  console.log('  Full results JSON written to /tmp/phase6-results.json\n')
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
