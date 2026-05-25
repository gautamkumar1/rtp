import { extractZip } from '../../lib/zip.js'
import { gameExtractedPath, ensureDir } from '../../lib/storage.js'
import { updateGameStatus } from '../../services/games.js'
import { inngest } from '../inngest.js'

const MAX_FILES = parseInt(process.env.MAX_EXTRACTED_FILES ?? '10000')
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB ?? '50') * 1024 * 1024

export const onUploadReceived = inngest.createFunction(
  { id: 'on-upload-received', name: 'Extract uploaded ZIP' },
  { event: 'upload/received' },
  async ({ event, step }) => {
    const { gameId, uploadPath } = event.data

    await step.run('set-extracting', async () => {
      await updateGameStatus(gameId, 'extracting')
    })

    const { fileCount } = await step.run('extract-zip', async () => {
      const outDir = gameExtractedPath(gameId)
      ensureDir(outDir)
      const result = await extractZip(uploadPath, outDir, {
        maxFiles: MAX_FILES,
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      })
      await updateGameStatus(gameId, 'extracted', { extractedPath: outDir })
      return result
    })

    await step.sendEvent('fire-project-extracted', {
      name: 'project/extracted',
      data: {
        gameId,
        extractedPath: gameExtractedPath(gameId),
        fileCount,
      },
    })
  },
)
