import fs from 'fs'
import path from 'path'
import { classifyFiles, type CandidateFile } from './classifier.js'
import { parseGoFiles } from './go-parser.js'
import { parseJavaFiles } from './java-parser.js'
import { parseCFiles } from './c-parser.js'
import { parseCsvFile, parseJsonFile, parseSqlFile, parseXmlFile, parseXlsxFile } from './structured-parsers.js'
import { type AstCandidate } from './types.js'
import { gameArtifactsPath, ensureDir } from '../lib/storage.js'

export type { AstCandidate, CandidateFile }

export type ParserResult = {
  candidateFiles: CandidateFile[]
  astCandidates: AstCandidate[]
}

export async function runStaticParser(gameId: string, extractedPath: string): Promise<ParserResult> {
  const candidateFiles = classifyFiles(extractedPath)

  const artifactsDir = gameArtifactsPath(gameId)
  ensureDir(artifactsDir)

  fs.writeFileSync(path.join(artifactsDir, 'candidate-files.json'), JSON.stringify(candidateFiles, null, 2))

  const astCandidates = extractAstCandidates(candidateFiles, extractedPath)

  fs.writeFileSync(path.join(artifactsDir, 'ast-candidates.json'), JSON.stringify(astCandidates, null, 2))

  return { candidateFiles, astCandidates }
}

function extractAstCandidates(candidateFiles: CandidateFile[], extractedPath: string): AstCandidate[] {
  const byExt = groupByExtension(candidateFiles, extractedPath)

  const goFiles = byExt.get('.go') ?? []
  const javaFiles = byExt.get('.java') ?? []
  const cFiles = [...(byExt.get('.c') ?? []), ...(byExt.get('.h') ?? [])]
  const csvFiles = byExt.get('.csv') ?? []
  const jsonFiles = byExt.get('.json') ?? []
  const sqlFiles = byExt.get('.sql') ?? []
  const xmlFiles = [...(byExt.get('.xml') ?? []), ...(byExt.get('.yaml') ?? []), ...(byExt.get('.yml') ?? [])]
  const xlsxFiles = byExt.get('.xlsx') ?? []

  const all: AstCandidate[] = [
    ...parseGoFiles(goFiles, extractedPath),
    ...parseJavaFiles(javaFiles, extractedPath),
    ...parseCFiles(cFiles, extractedPath),
    ...csvFiles.flatMap((f) => parseCsvFile(f, extractedPath)),
    ...jsonFiles.flatMap((f) => parseJsonFile(f, extractedPath)),
    ...sqlFiles.flatMap((f) => parseSqlFile(f, extractedPath)),
    ...xmlFiles.flatMap((f) => parseXmlFile(f, extractedPath)),
    ...xlsxFiles.flatMap((f) => parseXlsxFile(f, extractedPath)),
  ]

  return all.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.confidence] - order[b.confidence]
  })
}

function groupByExtension(candidateFiles: CandidateFile[], extractedPath: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const cf of candidateFiles) {
    const ext = cf.extension
    const abs = path.join(extractedPath, cf.path)
    if (!map.has(ext)) map.set(ext, [])
    map.get(ext)!.push(abs)
  }
  return map
}
