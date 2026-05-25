import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { gameReportsPath, ensureDir } from '../lib/storage.js'
import type { GameReport, Provenance, Verdict } from './types.js'

const FONT_REG = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const FONT_ITAL = 'Helvetica-Oblique'

// Provenance colors must visibly distinguish sources at a glance.
const PROV_BG: Record<Provenance, string> = {
  extracted: '#E8F0FE',
  'ai-inferred': '#FFF4E5',
  'simulation-result': '#EAFBEE',
  warning: '#FFE8E8',
  assumption: '#F3E8FF',
}
const PROV_LABEL: Record<Provenance, string> = {
  extracted: 'EXTRACTED',
  'ai-inferred': 'AI-INFERRED',
  'simulation-result': 'SIMULATION',
  warning: 'WARNING',
  assumption: 'ASSUMPTION',
}
const VERDICT_COLOR: Record<Verdict, string> = {
  PASS: '#22C55E',
  WARN: '#F59E0B',
  FAIL: '#EF4444',
}

function pct(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage()
  }
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 32)
  doc.moveDown(0.5)
  doc.font(FONT_BOLD).fontSize(15).fillColor('#111827').text(title)
  doc
    .strokeColor('#D1D5DB')
    .lineWidth(0.5)
    .moveTo(doc.page.margins.left, doc.y + 2)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
    .stroke()
  doc.moveDown(0.4)
  doc.fillColor('#111827')
}

function provenanceTag(doc: PDFKit.PDFDocument, source: Provenance): void {
  const text = PROV_LABEL[source]
  const w = doc.widthOfString(text, { fontSize: 8 }) + 8
  const h = 12
  const x = doc.page.width - doc.page.margins.right - w
  const y = doc.y - 14
  doc.rect(x, y, w, h).fill(PROV_BG[source]).fillColor('#374151')
  doc.font(FONT_BOLD).fontSize(7).text(text, x + 4, y + 3, { width: w - 8, lineBreak: false })
  doc.font(FONT_REG).fontSize(11).fillColor('#111827')
}

function kvRow(doc: PDFKit.PDFDocument, label: string, value: string, opts: { highlight?: boolean } = {}): void {
  ensureSpace(doc, 16)
  const yStart = doc.y
  doc.font(FONT_BOLD).fontSize(10).fillColor('#374151').text(label, { continued: false })
  doc
    .font(opts.highlight ? FONT_BOLD : FONT_REG)
    .fontSize(opts.highlight ? 12 : 10)
    .fillColor(opts.highlight ? '#111827' : '#111827')
    .text(value, doc.page.margins.left + 180, yStart, { width: 320 })
  doc.font(FONT_REG).fontSize(10).fillColor('#111827')
  doc.moveDown(0.15)
}

function paragraph(doc: PDFKit.PDFDocument, text: string): void {
  doc.font(FONT_REG).fontSize(10).fillColor('#111827').text(text, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  })
  doc.moveDown(0.3)
}

function renderTable(
  doc: PDFKit.PDFDocument,
  columns: { header: string; width: number; align?: 'left' | 'right' }[],
  rows: (string | number)[][],
  opts: { rowFill?: (i: number, row: (string | number)[]) => string | null } = {},
): void {
  const startX = doc.page.margins.left
  const tableWidth = columns.reduce((a, c) => a + c.width, 0)
  const rowHeight = 18

  ensureSpace(doc, rowHeight)
  let y = doc.y
  doc.rect(startX, y, tableWidth, rowHeight).fill('#1F2937')
  doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(9)
  let x = startX
  for (const col of columns) {
    doc.text(col.header, x + 4, y + 5, {
      width: col.width - 8,
      align: col.align ?? 'left',
      lineBreak: false,
    })
    x += col.width
  }
  doc.y = y + rowHeight

  doc.font(FONT_REG).fontSize(9).fillColor('#111827')

  rows.forEach((row, i) => {
    ensureSpace(doc, rowHeight)
    y = doc.y
    const fill = opts.rowFill?.(i, row) ?? (i % 2 === 0 ? '#FFFFFF' : '#F9FAFB')
    doc.rect(startX, y, tableWidth, rowHeight).fill(fill)
    doc.fillColor('#111827')

    x = startX
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c]
      doc.text(String(row[c] ?? ''), x + 4, y + 5, {
        width: col.width - 8,
        align: col.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      })
      x += col.width
    }
    doc.y = y + rowHeight
  })

  doc.moveDown(0.3)
  doc.fillColor('#111827')
}

function renderLegend(doc: PDFKit.PDFDocument): void {
  ensureSpace(doc, 26)
  const xStart = doc.page.margins.left
  const y = doc.y
  let x = xStart
  const items: Provenance[] = ['extracted', 'ai-inferred', 'simulation-result', 'assumption', 'warning']
  for (const p of items) {
    const label = PROV_LABEL[p]
    const w = doc.widthOfString(label, { fontSize: 8 }) + 10
    doc.rect(x, y, w, 14).fill(PROV_BG[p])
    doc.fillColor('#374151').font(FONT_BOLD).fontSize(7).text(label, x + 5, y + 4, { width: w - 10, lineBreak: false })
    x += w + 6
  }
  doc.fillColor('#111827').font(FONT_REG)
  doc.y = y + 16
  doc.moveDown(0.2)
}

function buildCover(doc: PDFKit.PDFDocument, report: GameReport): void {
  doc.font(FONT_BOLD).fontSize(24).fillColor('#111827').text('RTP Verification Report')
  doc.moveDown(0.2)
  doc.font(FONT_REG).fontSize(11).fillColor('#6B7280').text(
    `Generated ${new Date(report.generatedAt).toLocaleString()}`,
  )
  doc.moveDown(1)

  // Verdict box
  const verdict = report.confidence.verdict
  const boxY = doc.y
  const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right
  doc.rect(doc.page.margins.left, boxY, boxW, 60).fill(VERDICT_COLOR[verdict])
  doc
    .fillColor('#FFFFFF')
    .font(FONT_BOLD)
    .fontSize(28)
    .text(verdict, doc.page.margins.left + 16, boxY + 14, { width: boxW - 32 })
  doc.font(FONT_REG).fontSize(10).text(
    report.confidence.verdictReasons.join(' · '),
    doc.page.margins.left + 16,
    boxY + 44,
    { width: boxW - 32, lineBreak: false, ellipsis: true },
  )
  doc.fillColor('#111827')
  doc.y = boxY + 72

  doc.moveDown(0.5)
  doc.font(FONT_BOLD).fontSize(11).text('Provenance Legend')
  doc.moveDown(0.1)
  renderLegend(doc)
  doc.font(FONT_REG).fontSize(9).fillColor('#6B7280').text(
    'Every figure in this report is tagged by source. Extracted = read directly from source code. AI-inferred = derived by the AI analyzer. Simulation = computed by the Go simulator. Assumption = AI made a guess and recorded it. Warning = flagged issue.',
  )
  doc.fillColor('#111827').moveDown(0.5)
}

function buildOverviewSection(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Game Overview')
  provenanceTag(doc, 'extracted')
  const ov = report.overview
  kvRow(doc, 'Game name', ov.gameName.value)
  kvRow(doc, 'Game ID', ov.gameId.value)
  kvRow(doc, 'Provider', ov.provider.value)
  kvRow(doc, 'Game type', ov.gameType.value)
  kvRow(doc, 'Original file', ov.originalFileName.value)
  kvRow(doc, 'Uploaded', ov.uploadedAt.value)
  kvRow(doc, 'File count', ov.fileCount.value == null ? 'unknown' : String(ov.fileCount.value))
  kvRow(doc, 'Languages detected', ov.detectedLanguages.value.join(', ') || 'none')
}

function buildMechanicsSection(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Game Mechanics Explanation')
  provenanceTag(doc, 'ai-inferred')
  const text = report.mechanics.value || '(no mechanics document was generated)'
  doc.font(FONT_REG).fontSize(10).fillColor('#111827').text(text, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  })
  doc.moveDown(0.4)
}

function buildMathSection(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Extracted Math Data')
  provenanceTag(doc, 'extracted')

  const reels = report.math.reels.value
  const reelCount = reels.length
  const maxLen = reels.reduce((m, r) => Math.max(m, r.length), 0)

  doc.font(FONT_BOLD).fontSize(11).text(`Reels (${reelCount} reels, max length ${maxLen})`)
  doc.moveDown(0.2)
  const reelCols = [
    { header: 'Pos', width: 36, align: 'right' as const },
    ...reels.map((_, i) => ({ header: `Reel ${i + 1}`, width: Math.floor((doc.page.width - doc.page.margins.left - doc.page.margins.right - 36) / reelCount), align: 'left' as const })),
  ]
  const reelRows: (string | number)[][] = []
  // Cap displayed strip length to avoid runaway docs.
  const stripLen = Math.min(maxLen, 30)
  for (let p = 0; p < stripLen; p++) {
    reelRows.push([p + 1, ...reels.map((r) => r.symbols[p] ?? '')])
  }
  renderTable(doc, reelCols, reelRows)
  if (maxLen > stripLen) {
    doc.font(FONT_ITAL).fontSize(8).fillColor('#6B7280').text(`(strips truncated to first ${stripLen} positions; full strips in JSON/Excel)`)
    doc.fillColor('#111827').font(FONT_REG).fontSize(10)
  }

  doc.moveDown(0.5)
  doc.font(FONT_BOLD).fontSize(11).text('Symbol weights per reel')
  doc.moveDown(0.2)
  const allSymbols = new Set<string>()
  for (const r of reels) for (const s of Object.keys(r.symbolCounts)) allSymbols.add(s)
  const symList = Array.from(allSymbols).sort()
  const symColW = Math.floor((doc.page.width - doc.page.margins.left - doc.page.margins.right - 80) / reelCount)
  const weightCols = [
    { header: 'Symbol', width: 80, align: 'left' as const },
    ...reels.map((_, i) => ({ header: `Reel ${i + 1}`, width: symColW, align: 'right' as const })),
  ]
  const weightRows = symList.map((s) => [s, ...reels.map((r) => r.symbolCounts[s] ?? 0)])
  renderTable(doc, weightCols, weightRows)

  doc.moveDown(0.5)
  doc.font(FONT_BOLD).fontSize(11).text('Paytable (symbol × match count → multiplier)')
  doc.moveDown(0.2)
  const paytable = report.math.paytable.value
  const counts = new Set<number>()
  for (const row of Object.values(paytable)) for (const k of Object.keys(row)) counts.add(Number(k))
  const cnts = Array.from(counts).sort((a, b) => a - b)
  const ptColW = Math.floor((doc.page.width - doc.page.margins.left - doc.page.margins.right - 80) / Math.max(1, cnts.length))
  const ptCols = [
    { header: 'Symbol', width: 80, align: 'left' as const },
    ...cnts.map((c) => ({ header: `${c}×`, width: ptColW, align: 'right' as const })),
  ]
  const ptRows = Object.keys(paytable).sort().map((s) => [
    s,
    ...cnts.map((c) => String(paytable[s][String(c)] ?? '—')),
  ])
  renderTable(doc, ptCols, ptRows)

  doc.moveDown(0.4)
  const lineCount = report.math.paylines.value.length
  doc.font(FONT_REG).fontSize(10).text(`Paylines defined: ${lineCount} (full patterns in JSON/Excel report).`)
  doc.moveDown(0.3)
}

function buildFeaturesSection(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Feature Descriptions')
  const f = report.features

  const renderFeature = (name: string, val: unknown, source: Provenance) => {
    ensureSpace(doc, 20)
    doc.font(FONT_BOLD).fontSize(10).text(name, { continued: true })
    doc.font(FONT_REG).text(`  [${PROV_LABEL[source]}]`, { continued: false })
    const text = val == null ? 'not detected in source — feature absent or undocumented' : JSON.stringify(val)
    doc.font(FONT_REG).fontSize(10).fillColor('#111827').text(text, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    })
    doc.moveDown(0.2)
  }

  renderFeature('Wild', f.wild.value, f.wild.source)
  renderFeature('Scatter', f.scatter.value, f.scatter.source)
  renderFeature('Free Spins', f.freeSpins.value, f.freeSpins.source)
  renderFeature('Bonus', f.bonus.value, f.bonus.source)
  renderFeature('Buy Bonus', f.buyBonus.value, f.buyBonus.source)
}

function buildAssumptionsSection(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Assumptions')
  provenanceTag(doc, 'assumption')
  if (report.assumptions.length === 0) {
    paragraph(doc, '(no assumptions recorded — schema was fully extracted from source)')
    return
  }
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const cols = [
    { header: 'Field', width: Math.floor(w * 0.22), align: 'left' as const },
    { header: 'Value', width: Math.floor(w * 0.18), align: 'left' as const },
    { header: 'Reason', width: Math.floor(w * 0.32), align: 'left' as const },
    { header: 'Improvement Hint', width: w - Math.floor(w * 0.22) - Math.floor(w * 0.18) - Math.floor(w * 0.32), align: 'left' as const },
  ]
  const rows = report.assumptions.map((a) => [
    a.field,
    typeof a.assumedValue === 'object' ? JSON.stringify(a.assumedValue) : String(a.assumedValue),
    a.reason,
    a.improvementHint,
  ])
  renderTable(doc, cols, rows, { rowFill: () => PROV_BG.assumption })
}

function buildWarningsSection(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Warnings')
  provenanceTag(doc, 'warning')
  if (report.warnings.length === 0) {
    paragraph(doc, '(no warnings)')
    return
  }
  doc.font(FONT_REG).fontSize(10).fillColor('#111827')
  report.warnings.forEach((w, i) => {
    ensureSpace(doc, 14)
    doc.text(`${i + 1}. ${w}`, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    })
  })
  doc.moveDown(0.3)
}

function buildSimulationSection(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Simulation Configuration')
  provenanceTag(doc, 'simulation-result')
  const cfg = report.simulation.config.value
  kvRow(doc, 'Spin count', cfg.spinCount.toLocaleString())
  kvRow(doc, 'Rows', String(cfg.rows))
  kvRow(doc, 'Seed', String(cfg.seed))
  kvRow(doc, 'Buy bonus simulated', cfg.simulateBuyBonus ? 'yes' : 'no')

  sectionTitle(doc, 'RTP Results')
  provenanceTag(doc, 'simulation-result')
  const rtp = report.simulation.rtp.value
  kvRow(doc, 'Total RTP', pct(rtp.total), { highlight: true })
  kvRow(doc, 'Base RTP', pct(rtp.base))
  kvRow(doc, 'Free spins RTP', pct(rtp.freeSpins))
  kvRow(doc, 'Bonus RTP', pct(rtp.bonus))
  kvRow(doc, 'Buy bonus RTP', pct(rtp.buyBonus))

  sectionTitle(doc, 'Symbol Hit Probabilities')
  provenanceTag(doc, 'simulation-result')
  const hits = report.simulation.symbolHitProbabilities.value
  const maxCount = hits.maxCount
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const numCols = 1 + maxCount * 2
  const symCols = [
    { header: 'Symbol', width: 80, align: 'left' as const },
    ...Array.from({ length: maxCount }, (_, i) => ({
      header: `${i + 1}× hits`,
      width: Math.floor((w - 80) / (maxCount * 2)),
      align: 'right' as const,
    })),
    ...Array.from({ length: maxCount }, (_, i) => ({
      header: `${i + 1}× prob`,
      width: Math.floor((w - 80) / (maxCount * 2)),
      align: 'right' as const,
    })),
  ]
  // Ensure widths sum correctly: adjust last column.
  const used = symCols.reduce((a, c) => a + c.width, 0)
  if (used < w) symCols[symCols.length - 1].width += w - used
  const symRows = hits.bySymbol.map((row) => [
    row.symbol,
    ...row.hits.map((n) => n.toLocaleString()),
    ...row.probs.map((p) => (p === 0 ? '—' : pct(p, 5))),
  ])
  renderTable(doc, symCols, symRows)

  if (hits.scatterHits.some((n) => n > 0)) {
    doc.moveDown(0.3)
    doc.font(FONT_BOLD).fontSize(10).text('Scatter count distribution')
    doc.font(FONT_REG).fontSize(9)
    const scLines: string[] = []
    for (let i = 0; i < hits.scatterHits.length; i++) {
      scLines.push(`${i}×: ${hits.scatterHits[i]?.toLocaleString() ?? 0} (${pct(hits.scatterProbs[i] ?? 0, 5)})`)
    }
    paragraph(doc, scLines.join('   '))
  }
  if (hits.wildAssistedWins > 0) {
    doc.font(FONT_REG).fontSize(9).text(
      `Wild-assisted wins: ${hits.wildAssistedWins.toLocaleString()} (${pct(hits.wildAssistRate, 5)})`,
    )
    doc.moveDown(0.3)
  }
  // suppress unused-var warning for numCols when it's just for layout intent
  void numCols

  sectionTitle(doc, 'Statistical Summary')
  provenanceTag(doc, 'simulation-result')
  const stats = report.simulation.statistics.value
  kvRow(doc, 'Total spins', stats.totalSpins.toLocaleString())
  kvRow(doc, 'Total wagered', fmt(stats.totalBet))
  kvRow(doc, 'Total paid', fmt(stats.totalReturn))
  kvRow(doc, 'Hit rate', pct(stats.hitRate))
  kvRow(doc, 'Variance', fmt(stats.variance))
  kvRow(doc, 'Standard deviation', fmt(stats.standardDeviation))
  kvRow(doc, '90% CI', `${pct(stats.confidence90.low)} – ${pct(stats.confidence90.high)}  (±${pct(stats.confidence90.halfWidth)})`)
  kvRow(doc, '95% CI', `${pct(stats.confidence95.low)} – ${pct(stats.confidence95.high)}  (±${pct(stats.confidence95.halfWidth)})`)
  kvRow(doc, 'Feature triggers', stats.featureTriggerCount.toLocaleString())
  kvRow(doc, 'Duration', `${(stats.durationMs / 1000).toFixed(2)} s`)
}

function buildFinalVerdict(doc: PDFKit.PDFDocument, report: GameReport): void {
  sectionTitle(doc, 'Final Verification')
  const verdict = report.confidence.verdict
  const boxY = doc.y
  const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right
  doc.rect(doc.page.margins.left, boxY, boxW, 56).fill(VERDICT_COLOR[verdict])
  doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(22).text(verdict, doc.page.margins.left + 16, boxY + 14, { width: boxW - 32 })
  doc.font(FONT_REG).fontSize(10).text(
    report.confidence.verdictReasons.join(' · '),
    doc.page.margins.left + 16,
    boxY + 40,
    { width: boxW - 32, lineBreak: false, ellipsis: true },
  )
  doc.fillColor('#111827')
  doc.y = boxY + 70

  doc.moveDown(0.3)
  kvRow(doc, 'Schema validation', report.confidence.schemaValidationOk ? 'OK' : `${report.confidence.schemaValidationErrors.length} error(s)`)
  kvRow(doc, 'Convergence', report.confidence.convergenceOk ? 'OK' : 'wide CI — needs more spins')
  kvRow(doc, 'Warnings', String(report.confidence.warningCount))
  kvRow(doc, 'Assumptions', String(report.confidence.assumptionCount))
}

export interface BuildPdfReportParams {
  gameId: string
  report: GameReport
}

export interface BuildPdfReportResult {
  pdfPath: string
}

/**
 * Render the labeled report to a styled PDF with a cover verdict box,
 * provenance legend + tags on each section, math + paytable tables,
 * a symbol hit probability table, and a final verdict block.
 *
 * Returns once the PDF stream has finished writing.
 */
export async function buildPdfReport(params: BuildPdfReportParams): Promise<BuildPdfReportResult> {
  const { gameId, report } = params

  const reportsDir = gameReportsPath(gameId)
  ensureDir(reportsDir)
  const pdfPath = path.join(reportsDir, 'report.pdf')

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      bufferPages: true,
      info: {
        Title: `RTP Verification Report — ${report.overview.gameName.value}`,
        Author: 'RTP Verification Platform',
        Subject: 'Slot game RTP verification',
        CreationDate: new Date(),
      },
    })

    const stream = fs.createWriteStream(pdfPath)
    stream.on('finish', () => resolve())
    stream.on('error', (err) => reject(err))
    doc.on('error', (err) => reject(err))
    doc.pipe(stream)

    try {
      buildCover(doc, report)
      buildOverviewSection(doc, report)
      buildMechanicsSection(doc, report)
      buildMathSection(doc, report)
      buildFeaturesSection(doc, report)
      buildAssumptionsSection(doc, report)
      buildWarningsSection(doc, report)
      buildSimulationSection(doc, report)
      buildFinalVerdict(doc, report)

      // Page numbers in the footer.
      const range = doc.bufferedPageRange()
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i)
        doc.font(FONT_REG).fontSize(8).fillColor('#9CA3AF').text(
          `Page ${i + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - 30,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'right', lineBreak: false },
        )
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })

  return { pdfPath }
}
