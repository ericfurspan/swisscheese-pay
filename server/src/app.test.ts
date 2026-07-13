process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { getDb } from './db/connection.js'
import { resetSchema } from './db/schema.js'
import { seed } from './db/seed.js'

beforeEach(() => {
  const db = getDb()
  resetSchema(db)
  seed(db)
})

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(createApp()).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('serves the SPA index for an unknown non-API GET route', async () => {
    const res = await request(createApp()).get('/some/client/route')

    expect(res.status).toBe(200)
    expect(res.type).toBe('text/html')
  })

  it('does not fall back to the SPA for an unknown API route', async () => {
    const res = await request(createApp()).get('/api/does-not-exist')

    expect(res.status).toBe(404)
  })

  it('does not reject requests from Phase 1-4 exploit/test tooling (no Origin header)', async () => {
    const res = await request(createApp()).post('/api/auth/login').send({
      email: 'alice@scpay.test',
      password: 'Password123!',
    })

    expect(res.status).toBe(200)
  })
})
