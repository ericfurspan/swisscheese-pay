process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { getDb } from '../db/connection.js'
import { resetSchema } from '../db/schema.js'
import { seed } from '../db/seed.js'

interface IdRow {
  id: number
}

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

function accountId(accountNumber: string): number {
  return (
    getDb().prepare('SELECT id FROM accounts WHERE account_number = ?').get(accountNumber) as IdRow
  ).id
}

describe('accounts routes', () => {
  it('requires authentication', async () => {
    const res = await request(createApp()).get('/api/accounts')
    expect(res.status).toBe(401)
  })

  it("lists only the caller's accounts", async () => {
    const agent = await loginAsAlice()

    const res = await agent.get('/api/accounts')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body.map((a: { account_number: string }) => a.account_number).sort()).toEqual([
      'CHK-1001',
      'SAV-1002',
    ])
  })

  it('returns an owned account without ssn or password_hash fields', async () => {
    const agent = await loginAsAlice()

    const res = await agent.get(`/api/accounts/${accountId('CHK-1001')}`)

    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('ssn')
    expect(res.body).not.toHaveProperty('password_hash')
    expect(res.body).not.toHaveProperty('user_id')
  })

  it("returns 404 for another user's account (no existence leak)", async () => {
    const agent = await loginAsAlice()

    const res = await agent.get(`/api/accounts/${accountId('CHK-2001')}`)

    expect(res.status).toBe(404)
  })

  it('returns transactions for an owned account', async () => {
    const agent = await loginAsAlice()

    const res = await agent.get(`/api/accounts/${accountId('CHK-1001')}/transactions`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it("returns 404 for another user's account transactions", async () => {
    const agent = await loginAsAlice()

    const res = await agent.get(`/api/accounts/${accountId('CHK-2001')}/transactions`)

    expect(res.status).toBe(404)
  })
})
