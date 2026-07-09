process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'

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
})
