import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import express from 'express'
import { errorHandler } from './middleware/errorHandler.js'
import { requestId } from './middleware/requestId.js'
import { accountsRouter } from './routes/accounts.js'
import { authRouter } from './routes/auth.js'
import { paymentLinksRouter } from './routes/paymentLinks.js'
import { profileRouter } from './routes/profile.js'
import { transfersRouter } from './routes/transfers.js'

// Resolved from this module's own location rather than process.cwd() so it's
// correct whether running from src (dev/test, via tsx/vitest) or dist (prod,
// after tsc) -- both sit two directories above the repo root's client/dist.
const CLIENT_DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist')

// Factory only -- no listen() here, so this stays supertest-safe. Boot wiring
// (reset/seed + listen) lives in index.ts, added when the full router set is mounted.
export function createApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(requestId)

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/accounts', accountsRouter)
  app.use('/api/transfers', transfersRouter)
  app.use('/api/payment-links', paymentLinksRouter)
  app.use('/api/profile', profileRouter)

  // No blanket /api 404 handler here -- it would run before (and shadow) any
  // route a caller mounts on the returned app afterward, which auth.test.ts's
  // buildAppWithProtectedTestRoute() relies on. Unmatched /api requests fall
  // through Express's default 404 instead.
  app.use(express.static(CLIENT_DIST))
  app.get(/^\/(?!api).*/, (_req, res, next) => {
    res.sendFile(join(CLIENT_DIST, 'index.html'), (err) => {
      if (err) next(err)
    })
  })

  app.use(errorHandler)

  return app
}
