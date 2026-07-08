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

describe('payment links routes', () => {
  it('requires authentication', async () => {
    const res = await request(createApp()).post('/api/payment-links').send({ amount_cents: 500 })
    expect(res.status).toBe(401)
  })

  it('creates a link belonging to the caller', async () => {
    const agent = await loginAs('alice@scpay.test')

    const res = await agent.post('/api/payment-links').send({ amount_cents: 500, note: 'Lunch' })

    expect(res.status).toBe(201)
    expect(res.body.path).toMatch(/^\/pay\/[a-f0-9]{32}$/)
    expect(res.body.note).toBe('Lunch')
  })

  it('rejects a non-positive amount', async () => {
    const agent = await loginAs('alice@scpay.test')

    const res = await agent.post('/api/payment-links').send({ amount_cents: 0 })

    expect(res.status).toBe(400)
  })

  it("lists only the caller's own links", async () => {
    const aliceAgent = await loginAs('alice@scpay.test')
    await aliceAgent.post('/api/payment-links').send({ amount_cents: 500, note: 'Lunch' })

    const bobAgent = await loginAs('bob@scpay.test')
    await bobAgent.post('/api/payment-links').send({ amount_cents: 900, note: 'Rent' })

    const res = await bobAgent.get('/api/payment-links')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].note).toBe('Rent')
  })
})
