import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { signToken } from '../auth/token.js'
import { requireAuth, SESSION_COOKIE } from './requireAuth.js'

function buildTestApp() {
  const app = express()
  app.use(cookieParser())
  app.get('/protected', requireAuth, (req, res) => {
    res.status(200).json({ user: req.user })
  })
  return app
}

describe('requireAuth', () => {
  it('rejects a request without a session cookie and logs authz.deny', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const app = buildTestApp()

    const res = await request(app).get('/protected')

    expect(res.status).toBe(401)
    const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(line).toMatchObject({ event: 'authz.deny', outcome: 'denied' })
    logSpy.mockRestore()
  })

  it('rejects a request with an invalid session cookie', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const app = buildTestApp()

    const res = await request(app)
      .get('/protected')
      .set('Cookie', [`${SESSION_COOKIE}=garbage`])

    expect(res.status).toBe(401)
    logSpy.mockRestore()
  })

  it('populates req.user for a valid session cookie', async () => {
    const app = buildTestApp()
    const { token } = signToken({ uid: 1, role: 'customer' })

    const res = await request(app)
      .get('/protected')
      .set('Cookie', [`${SESSION_COOKIE}=${token}`])

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ uid: 1, role: 'customer' })
    expect(typeof res.body.user.jti).toBe('string')
  })

  it("logs auth.token_used with the token's jti on a successful request", async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const app = buildTestApp()
    const { token, jti } = signToken({ uid: 1, role: 'customer' })

    await request(app)
      .get('/protected')
      .set('Cookie', [`${SESSION_COOKIE}=${token}`])

    const line = logSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((l) => l.event === 'auth.token_used')
    expect(line).toMatchObject({ actor_user_id: 1, outcome: 'success', jti })
    logSpy.mockRestore()
  })
})
