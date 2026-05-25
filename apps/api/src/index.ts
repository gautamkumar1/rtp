import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { serve } from 'inngest/express'
import { inngest, functions } from './workflows/inngest.js'
import { gamesRouter } from './routes/games.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.0.1' })
})

app.use('/api/inngest', serve({ client: inngest, functions }))
app.use('/api/games', gamesRouter)

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
  console.log(`Inngest endpoint: http://localhost:${PORT}/api/inngest`)
})
