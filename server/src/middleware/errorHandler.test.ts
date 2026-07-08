process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

describe('errorHandler', () => {
  it('returns 400 for a malformed JSON body instead of 500', async () => {
    const app = createApp()

    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{not valid json')

    expect(res.status).toBe(400)
  })
})
