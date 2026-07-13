import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { requireTrustedOrigin } from './requireTrustedOrigin.js'

function buildTestApp() {
  const app = express()
  app.use(requireTrustedOrigin)
  app.post('/action', (_req, res) => {
    res.status(200).json({ ok: true })
  })
  app.get('/read', (_req, res) => {
    res.status(200).json({ ok: true })
  })
  return app
}

describe('requireTrustedOrigin', () => {
  it('allows a POST with no Origin header at all', async () => {
    const res = await request(buildTestApp()).post('/action')
    expect(res.status).toBe(200)
  })

  it('allows a POST from the configured app origin', async () => {
    const res = await request(buildTestApp())
      .post('/action')
      .set('Origin', 'http://app.scpay.test:8082')
    expect(res.status).toBe(200)
  })

  it('allows a POST from the configured dev origin', async () => {
    const res = await request(buildTestApp()).post('/action').set('Origin', 'http://localhost:5173')
    expect(res.status).toBe(200)
  })

  it('rejects a POST from an untrusted origin', async () => {
    const res = await request(buildTestApp())
      .post('/action')
      .set('Origin', 'http://evil.scpay.test:9000')
    expect(res.status).toBe(403)
  })

  it('does not gate GET requests', async () => {
    const res = await request(buildTestApp())
      .get('/read')
      .set('Origin', 'http://evil.scpay.test:9000')
    expect(res.status).toBe(200)
  })
})
