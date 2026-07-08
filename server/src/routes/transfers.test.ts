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

interface BalanceRow {
  balance_cents: number
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

function balanceOf(accountNumber: string): number {
  return (
    getDb()
      .prepare('SELECT balance_cents FROM accounts WHERE account_number = ?')
      .get(accountNumber) as BalanceRow
  ).balance_cents
}

describe('transfers routes', () => {
  it('requires authentication', async () => {
    const res = await request(createApp()).post('/api/transfers').send({})
    expect(res.status).toBe(401)
  })

  it("moves money from alice's account to bob's account", async () => {
    const agent = await loginAsAlice()

    const res = await agent.post('/api/transfers').send({
      from_account_id: accountId('CHK-1001'),
      to_account_id: accountId('CHK-2001'),
      amount_cents: 1_000,
    })

    expect(res.status).toBe(201)
    expect(balanceOf('CHK-1001')).toBe(100_000 - 1_000)
    expect(balanceOf('CHK-2001')).toBe(25_000 + 1_000)
  })

  it('denies a transfer from an account alice does not own, balance unchanged', async () => {
    const agent = await loginAsAlice()

    const res = await agent.post('/api/transfers').send({
      from_account_id: accountId('CHK-2001'),
      to_account_id: accountId('CHK-1001'),
      amount_cents: 1_000,
    })

    expect(res.status).toBe(404)
    expect(balanceOf('CHK-2001')).toBe(25_000)
  })

  it('rejects a zero or negative amount', async () => {
    const agent = await loginAsAlice()

    const res = await agent.post('/api/transfers').send({
      from_account_id: accountId('CHK-1001'),
      to_account_id: accountId('CHK-2001'),
      amount_cents: -100,
    })

    expect(res.status).toBe(400)
    expect(balanceOf('CHK-1001')).toBe(100_000)
  })

  it('rejects a transfer to a nonexistent account, leaving the balance unchanged', async () => {
    const agent = await loginAsAlice()

    const res = await agent.post('/api/transfers').send({
      from_account_id: accountId('CHK-1001'),
      to_account_id: 999_999,
      amount_cents: 1_000,
    })

    expect(res.status).toBe(400)
    expect(balanceOf('CHK-1001')).toBe(100_000)
  })

  it('rejects an overdraft, leaving balances unchanged', async () => {
    const agent = await loginAsAlice()

    const res = await agent.post('/api/transfers').send({
      from_account_id: accountId('CHK-1001'),
      to_account_id: accountId('CHK-2001'),
      amount_cents: 999_999_999,
    })

    expect(res.status).toBe(422)
    expect(balanceOf('CHK-1001')).toBe(100_000)
    expect(balanceOf('CHK-2001')).toBe(25_000)
  })
})
