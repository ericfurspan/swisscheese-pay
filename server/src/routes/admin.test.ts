process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { getDb } from '../db/connection.js'
import { resetSchema } from '../db/schema.js'
import { seed } from '../db/seed.js'

beforeEach(() => {
  const db = getDb()
  resetSchema(db)
  seed(db)
})

async function loginAs(email: string) {
  const app = createApp()
  const agent = request.agent(app)
  await agent.post('/api/auth/login').send({ email, password: 'Password123!' })
  return agent
}

describe('GET /api/admin/users', () => {
  it('requires authentication', async () => {
    const res = await request(createApp()).get('/api/admin/users')
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin caller', async () => {
    const agent = await loginAs('alice@scpay.test')

    const res = await agent.get('/api/admin/users')

    expect(res.status).toBe(403)
  })

  it('-- vulnerable state, tightened at fix/phase-2-mass-assignment -- over-returns password_hash and unmasked ssn to a real admin', async () => {
    const agent = await loginAs('admin@scpay.test')

    const res = await agent.get('/api/admin/users')

    expect(res.status).toBe(200)
    const bob = res.body.find((u: { email: string }) => u.email === 'bob@scpay.test')
    expect(bob).toHaveProperty('password_hash')
    expect(bob.ssn).toBe('987-65-4321')
  })
})
