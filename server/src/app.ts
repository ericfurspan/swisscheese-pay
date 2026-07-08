import cookieParser from 'cookie-parser'
import express from 'express'
import { errorHandler } from './middleware/errorHandler.js'
import { requestId } from './middleware/requestId.js'
import { authRouter } from './routes/auth.js'

// Factory only -- no listen() here, so this stays supertest-safe. Boot wiring
// (reset/seed + listen) lives in index.ts, added when the full router set is mounted.
export function createApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(requestId)

  app.use('/api/auth', authRouter)

  app.use(errorHandler)

  return app
}
