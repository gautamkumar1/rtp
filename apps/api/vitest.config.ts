import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@rtp/game-schema': path.resolve('../../packages/game-schema/src/index.ts'),
      '@rtp/shared-types': path.resolve('../../packages/shared-types/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
