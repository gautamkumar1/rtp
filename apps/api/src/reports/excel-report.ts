import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'
import { gameReportsPath, ensureDir } from '../lib/storage.js'
import type { GameReport, Provenance } from './types.js'

const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
}

const PROV_COLORS: Record<Provenance, string> = {
  extracted: 'FFE8F0FE',
  'ai-inferred': 'FFFFF4E5',
  'simulation-result': 'FFEAFBEE',
  warning: 'FFFFE8E8',
  assumption: 'FFF3E8FF',
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })
}

function provenanceFill(p: Provenance): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: PROV_COLORS[p] } }
}

function addKeyValueRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: unknown,
  source?: Provenance,
): void {
  const row = sheet.addRow([label, value as ExcelJS.CellValue, source ?? ''])
  if (source) {
    row.getCell(3).fill = provenanceFill(source)
    row.getCell(3).font = { italic: true, size: 10 }
  }
  row.getCell(1).font = { bold: true }
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(4)}%`
}

function buildOverviewSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Overview', { properties: { tabColor: { argb: 'FF1F2937' } } })
  sheet.columns = [
    { header: 'Field', key: 'field', width: 32 },
    { header: 'Value', key: 'value', width: 60 },
    { header: 'Source', key: 'source', width: 18 },
  ]
  styleHeaderRow(sheet.getRow(1))

  const ov = report.overview
  addKeyValueRow(sheet, 'Game ID', ov.gameId.value, ov.gameId.source)
  addKeyValueRow(sheet, 'Game Name', ov.gameName.value, ov.gameName.source)
  addKeyValueRow(sheet, 'Provider', ov.provider.value, ov.provider.source)
  addKeyValueRow(sheet, 'Game Type', ov.gameType.value, ov.gameType.source)
  addKeyValueRow(sheet, 'Original File', ov.originalFileName.value, ov.originalFileName.source)
  addKeyValueRow(sheet, 'Uploaded At', ov.uploadedAt.value, ov.uploadedAt.source)
  addKeyValueRow(sheet, 'File Count', ov.fileCount.value ?? 'unknown', ov.fileCount.source)
  addKeyValueRow(sheet, 'Detected Languages', ov.detectedLanguages.value.join(', ') || 'none', ov.detectedLanguages.source)

  sheet.addRow([])
  const rtpHeader = sheet.addRow(['RTP Summary', 'Value', 'Source'])
  styleHeaderRow(rtpHeader)
  const rtp = report.simulation.rtp.value
  addKeyValueRow(sheet, 'Total RTP', pct(rtp.total), report.simulation.rtp.source)
  addKeyValueRow(sheet, 'Base RTP', pct(rtp.base), report.simulation.rtp.source)
  addKeyValueRow(sheet, 'Free Spins RTP', pct(rtp.freeSpins), report.simulation.rtp.source)
  addKeyValueRow(sheet, 'Bonus RTP', pct(rtp.bonus), report.simulation.rtp.source)
  addKeyValueRow(sheet, 'Buy Bonus RTP', pct(rtp.buyBonus), report.simulation.rtp.source)

  sheet.addRow([])
  const ciHeader = sheet.addRow(['Confidence Intervals', 'Low', 'High'])
  styleHeaderRow(ciHeader)
  const stats = report.simulation.statistics.value
  sheet.addRow(['90% CI', pct(stats.confidence90.low), pct(stats.confidence90.high)])
  sheet.addRow(['95% CI', pct(stats.confidence95.low), pct(stats.confidence95.high)])
  sheet.addRow(['90% Half-width', pct(stats.confidence90.halfWidth), ''])
  sheet.addRow(['95% Half-width', pct(stats.confidence95.halfWidth), ''])

  sheet.addRow([])
  const verdictHeader = sheet.addRow(['Verification', 'Result', ''])
  styleHeaderRow(verdictHeader)
  const verdictRow = sheet.addRow(['Verdict', report.confidence.verdict, ''])
  verdictRow.getCell(1).font = { bold: true }
  verdictRow.getCell(2).font = { bold: true, size: 14 }
  verdictRow.getCell(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      argb:
        report.confidence.verdict === 'PASS'
          ? 'FF22C55E'
          : report.confidence.verdict === 'WARN'
          ? 'FFF59E0B'
          : 'FFEF4444',
    },
  }
  for (const r of report.confidence.verdictReasons) sheet.addRow(['', r, ''])
}

function buildMechanicsSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Game Mechanics')
  sheet.columns = [{ header: 'Game Mechanics (AI-generated)', key: 'text', width: 120 }]
  styleHeaderRow(sheet.getRow(1))

  const lines = (report.mechanics.value || '').split('\n')
  for (const line of lines) {
    const row = sheet.addRow([line])
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    if (line.startsWith('# ') || line.startsWith('## ')) {
      row.getCell(1).font = { bold: true, size: 12 }
    }
  }
}

function buildReelsSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Reels')
  const reels = report.math.reels.value
  const reelCount = reels.length
  const maxLen = reels.reduce((m, r) => Math.max(m, r.length), 0)

  // Reel strips side-by-side
  const stripHeader = sheet.addRow(['Position', ...reels.map((_, i) => `Reel ${i + 1}`)])
  styleHeaderRow(stripHeader)
  for (let pos = 0; pos < maxLen; pos++) {
    const row = [String(pos + 1), ...reels.map((r) => r.symbols[pos] ?? '')]
    sheet.addRow(row)
  }
  sheet.getColumn(1).width = 10
  for (let i = 0; i < reelCount; i++) sheet.getColumn(i + 2).width = 12

  sheet.addRow([])
  const weightsHeader = sheet.addRow(['Symbol', ...reels.map((_, i) => `Reel ${i + 1} count`), 'Total'])
  styleHeaderRow(weightsHeader)
  const allSymbols = new Set<string>()
  for (const r of reels) for (const s of Object.keys(r.symbolCounts)) allSymbols.add(s)
  for (const sym of Array.from(allSymbols).sort()) {
    const counts = reels.map((r) => r.symbolCounts[sym] ?? 0)
    const total = counts.reduce((a, b) => a + b, 0)
    sheet.addRow([sym, ...counts, total])
  }
}

function buildPaylinesSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Paylines')
  const paylines = report.math.paylines.value
  const reelCount = paylines[0]?.length ?? 0

  const header = ['#', ...Array.from({ length: reelCount }, (_, i) => `Reel ${i + 1}`)]
  const hr = sheet.addRow(header)
  styleHeaderRow(hr)
  paylines.forEach((line, i) => {
    sheet.addRow([i + 1, ...line])
  })

  sheet.addRow([])
  sheet.addRow(['Visual grid (one block per payline):'])

  // Per-payline visual mini-grid: rows × reels with X marked positions
  const rowCount = Math.max(3, paylines.reduce((m, l) => Math.max(m, ...l), 0) + 1)
  paylines.forEach((line, idx) => {
    sheet.addRow([`Payline ${idx + 1}`])
    for (let r = 0; r < rowCount; r++) {
      const cells: (string | number)[] = ['']
      for (let c = 0; c < reelCount; c++) {
        cells.push(line[c] === r ? '●' : '·')
      }
      const row = sheet.addRow(cells)
      row.eachCell((cell, col) => {
        if (col === 1) return
        cell.alignment = { horizontal: 'center' }
        if (cell.value === '●') cell.font = { bold: true, color: { argb: 'FF1F2937' } }
      })
    }
    sheet.addRow([])
  })
}

function buildPaytableSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Paytable')
  const paytable = report.math.paytable.value
  const symbolRows = Object.keys(paytable).sort()

  const allCounts = new Set<number>()
  for (const row of Object.values(paytable)) {
    for (const k of Object.keys(row)) allCounts.add(Number(k))
  }
  const counts = Array.from(allCounts).sort((a, b) => a - b)

  const hr = sheet.addRow(['Symbol', ...counts.map((c) => `${c}× match`)])
  styleHeaderRow(hr)
  for (const sym of symbolRows) {
    const payouts = paytable[sym] ?? {}
    const cells = [sym, ...counts.map((c) => payouts[String(c)] ?? '')]
    sheet.addRow(cells)
  }
  sheet.getColumn(1).width = 16
}

function buildSimulationResultsSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Simulation Results')
  sheet.columns = [
    { header: 'Metric', key: 'metric', width: 36 },
    { header: 'Value', key: 'value', width: 28 },
  ]
  styleHeaderRow(sheet.getRow(1))

  const cfg = report.simulation.config.value
  addKeyValueRow(sheet, 'Spin Count', cfg.spinCount.toLocaleString())
  addKeyValueRow(sheet, 'Rows', cfg.rows)
  addKeyValueRow(sheet, 'Seed', cfg.seed)
  addKeyValueRow(sheet, 'Simulate Buy Bonus', cfg.simulateBuyBonus ? 'yes' : 'no')

  sheet.addRow([])
  const rtpHeader = sheet.addRow(['RTP Breakdown', 'Value'])
  styleHeaderRow(rtpHeader)
  const rtp = report.simulation.rtp.value
  addKeyValueRow(sheet, 'Total RTP', pct(rtp.total))
  addKeyValueRow(sheet, 'Base RTP', pct(rtp.base))
  addKeyValueRow(sheet, 'Free Spins RTP', pct(rtp.freeSpins))
  addKeyValueRow(sheet, 'Bonus RTP', pct(rtp.bonus))
  addKeyValueRow(sheet, 'Buy Bonus RTP', pct(rtp.buyBonus))

  sheet.addRow([])
  const statHeader = sheet.addRow(['Statistics', 'Value'])
  styleHeaderRow(statHeader)
  const stats = report.simulation.statistics.value
  addKeyValueRow(sheet, 'Total Spins', stats.totalSpins.toLocaleString())
  addKeyValueRow(sheet, 'Total Bet', stats.totalBet)
  addKeyValueRow(sheet, 'Total Return', stats.totalReturn)
  addKeyValueRow(sheet, 'Hit Rate', pct(stats.hitRate))
  addKeyValueRow(sheet, 'Variance', stats.variance)
  addKeyValueRow(sheet, 'Standard Deviation', stats.standardDeviation)
  addKeyValueRow(sheet, 'Feature Triggers', stats.featureTriggerCount.toLocaleString())
  addKeyValueRow(sheet, 'Duration (ms)', stats.durationMs)
  addKeyValueRow(sheet, '90% CI Low', pct(stats.confidence90.low))
  addKeyValueRow(sheet, '90% CI High', pct(stats.confidence90.high))
  addKeyValueRow(sheet, '90% CI Half-width', pct(stats.confidence90.halfWidth))
  addKeyValueRow(sheet, '95% CI Low', pct(stats.confidence95.low))
  addKeyValueRow(sheet, '95% CI High', pct(stats.confidence95.high))
  addKeyValueRow(sheet, '95% CI Half-width', pct(stats.confidence95.halfWidth))

  const bb = report.simulation.buyBonus.value
  if (bb) {
    sheet.addRow([])
    const bbHeader = sheet.addRow(['Buy Bonus', 'Value'])
    styleHeaderRow(bbHeader)
    addKeyValueRow(sheet, 'Purchases', bb.purchases.toLocaleString())
    addKeyValueRow(sheet, 'Total Cost', bb.totalCost)
    addKeyValueRow(sheet, 'Total Return', bb.totalReturn)
    addKeyValueRow(sheet, 'Buy Bonus RTP', pct(bb.rtp))
  }
}

function buildSymbolHitSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Symbol Hit Probability')
  const hits = report.simulation.symbolHitProbabilities.value
  const maxCount = hits.maxCount

  const header = [
    'Symbol',
    ...Array.from({ length: maxCount }, (_, i) => `${i + 1}× hits`),
    ...Array.from({ length: maxCount }, (_, i) => `${i + 1}× prob`),
  ]
  const hr = sheet.addRow(header)
  styleHeaderRow(hr)

  for (const row of hits.bySymbol) {
    const cells: (string | number)[] = [
      row.symbol,
      ...row.hits,
      ...row.probs.map((p) => (p === 0 ? '—' : pct(p))),
    ]
    sheet.addRow(cells)
  }

  sheet.addRow([])
  const scatterHeader = sheet.addRow(['Scatter count', 'Hits', 'Probability'])
  styleHeaderRow(scatterHeader)
  for (let i = 0; i < hits.scatterHits.length; i++) {
    sheet.addRow([`${i}× scatter`, hits.scatterHits[i] ?? 0, pct(hits.scatterProbs[i] ?? 0)])
  }

  sheet.addRow([])
  sheet.addRow(['Wild-assisted wins', hits.wildAssistedWins])
  sheet.addRow(['Wild-assist rate', pct(hits.wildAssistRate)])

  sheet.getColumn(1).width = 18
}

function buildAssumptionsSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Assumptions')
  sheet.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Assumed Value', key: 'value', width: 28 },
    { header: 'Reason', key: 'reason', width: 50 },
    { header: 'Can Be Improved', key: 'imp', width: 16 },
    { header: 'Improvement Hint', key: 'hint', width: 50 },
  ]
  styleHeaderRow(sheet.getRow(1))

  for (const a of report.assumptions) {
    const row = sheet.addRow([
      a.field,
      typeof a.assumedValue === 'object' ? JSON.stringify(a.assumedValue) : String(a.assumedValue),
      a.reason,
      a.canBeImproved ? 'yes' : 'no',
      a.improvementHint,
    ])
    row.eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' }
      cell.fill = provenanceFill('assumption')
    })
  }
  if (report.assumptions.length === 0) {
    sheet.addRow(['(none)', '', '', '', ''])
  }
}

function buildWarningsSheet(wb: ExcelJS.Workbook, report: GameReport): void {
  const sheet = wb.addWorksheet('Warnings')
  sheet.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'Warning', key: 'warning', width: 90 },
  ]
  styleHeaderRow(sheet.getRow(1))
  report.warnings.forEach((w, i) => {
    const row = sheet.addRow([i + 1, w])
    row.getCell(2).fill = provenanceFill('warning')
  })
  if (report.warnings.length === 0) {
    sheet.addRow(['', '(no warnings)'])
  }

  sheet.addRow([])
  sheet.addRow(['Source Evidence'])
  const eHeader = sheet.addRow(['File', 'Line', 'Confidence', 'Raw Value', 'Reasoning'])
  styleHeaderRow(eHeader)
  for (const e of report.sourceEvidence) {
    sheet.addRow([e.filePath, e.lineNumber ?? '', e.confidence, e.rawValue, e.reasoning])
  }
}

export interface BuildExcelReportParams {
  gameId: string
  report: GameReport
}

export interface BuildExcelReportResult {
  excelPath: string
}

/**
 * Render the report into a multi-sheet .xlsx file with provenance color
 * coding (extracted / ai-inferred / simulation-result / assumption / warning).
 */
export async function buildExcelReport(params: BuildExcelReportParams): Promise<BuildExcelReportResult> {
  const { gameId, report } = params

  const wb = new ExcelJS.Workbook()
  wb.creator = 'RTP Verification Platform'
  wb.created = new Date()

  buildOverviewSheet(wb, report)
  buildMechanicsSheet(wb, report)
  buildReelsSheet(wb, report)
  buildPaylinesSheet(wb, report)
  buildPaytableSheet(wb, report)
  buildSimulationResultsSheet(wb, report)
  buildSymbolHitSheet(wb, report)
  buildAssumptionsSheet(wb, report)
  buildWarningsSheet(wb, report)

  const reportsDir = gameReportsPath(gameId)
  ensureDir(reportsDir)
  const excelPath = path.join(reportsDir, 'report.xlsx')
  await wb.xlsx.writeFile(excelPath)

  if (!fs.existsSync(excelPath)) {
    throw new Error(`failed to write Excel report at ${excelPath}`)
  }

  return { excelPath }
}
