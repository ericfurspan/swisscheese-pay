import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { requireAdmin } from './requireAdmin.js'

function buildTestApp(role: string) {
  const app = express()
  app.get(
    '/protected',
    (req, _res, next) => {
      req.user = { uid: role === 'admin' ? 3 : 1, role, jti: 'test-jti' }
      next()
    },
    requireAdmin,
    (_req, res) => res.status(200).json({ ok: true }),
  )
  return app
}

describe('requireAdmin', () => {
  it('rejects a non-admin caller with 403 and logs authz.deny', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await request(buildTestApp('customer')).get('/protected')

    expect(res.status).toBe(403)
    const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(line).toMatchObject({ event: 'authz.deny', outcome: 'denied', actor_user_id: 1 })
    logSpy.mockRestore()
  })

  it('allows an admin caller through', async () => {
    const res = await request(buildTestApp('admin')).get('/protected')

    expect(res.status).toBe(200)
  })
})
