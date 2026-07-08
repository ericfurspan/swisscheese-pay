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

async function loginAsAlice() {
  const app = createApp()
  const agent = request.agent(app)
  await agent.post('/api/auth/login').send({ email: 'alice@scpay.test', password: 'Password123!' })
  return agent
}

describe('profile routes', () => {
  it('requires authentication', async () => {
    const res = await request(createApp()).get('/api/profile')
    expect(res.status).toBe(401)
  })

  it("returns the caller's profile with a masked ssn", async () => {
    const agent = await loginAsAlice()

    const res = await agent.get('/api/profile')

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('alice@scpay.test')
    expect(res.body.ssn).toBe('***-**-6789')
  })

  it('does not expose the password hash', async () => {
    const agent = await loginAsAlice()

    const res = await agent.get('/api/profile')

    expect(res.body).not.toHaveProperty('password_hash')
  })

  it("updates the caller's own full_name", async () => {
    const agent = await loginAsAlice()

    const patchRes = await agent.patch('/api/profile').send({ full_name: 'Alice Updated' })
    expect(patchRes.status).toBe(200)

    const getRes = await agent.get('/api/profile')
    expect(getRes.body.full_name).toBe('Alice Updated')
  })

  it("cannot target another user's profile via the request body", async () => {
    const agent = await loginAsAlice()

    await agent.patch('/api/profile').send({ full_name: 'Hacked', id: 2 })

    const bob = getDb().prepare('SELECT full_name FROM users WHERE email = ?').get('bob@scpay.test') as {
      full_name: string
    }
    expect(bob.full_name).toBe('Bob Brown')
  })
})
