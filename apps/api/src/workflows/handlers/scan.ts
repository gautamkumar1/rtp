import path from 'path'
import fs from 'fs'
import { buildFileTree } from '../../lib/filetree.js'
import { gameArtifactsPath, ensureDir } from '../../lib/storage.js'
import { updateGameStatus } from '../../services/games.js'
import { prisma } from '../../db/client.js'
import { inngest } from '../inngest.js'

export const onProjectExtracted = inngest.createFunction(
  { id: 'on-project-extracted', name: 'Index project file tree' },
  { event: 'project/extracted' },
  async ({ event, step }) => {
    const { gameId, extractedPath } = event.data

    await step.run('set-scanning', async () => {
      await updateGameStatus(gameId, 'scanning')
    })

    const { analysisRunId } = await step.run('index-file-tree', async () => {
      const tree = buildFileTree(extractedPath)

      const artifactsDir = gameArtifactsPath(gameId)
      ensureDir(artifactsDir)
      const treeJsonPath = path.join(artifactsDir, 'file-tree.json')
      fs.writeFileSync(treeJsonPath, JSON.stringify(tree, null, 2))

      const run = await prisma.analysisRun.create({
        data: {
          gameId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fileTreeJson: tree as any,
          status: 'pending',
        },
      })

      await updateGameStatus(gameId, 'scanned')
      return { analysisRunId: run.id }
    })

    await step.sendEvent('fire-project-scanned', {
      name: 'project/scanned',
      data: {
        gameId,
        analysisRunId,
        candidateCount: 0,
      },
    })
  },
)
