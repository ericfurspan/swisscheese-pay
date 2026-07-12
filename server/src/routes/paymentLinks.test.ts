process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

async function loginAs(email: string) {
  const app = createApp()
  const agent = request.agent(app)
  await agent.post('/api/auth/login').send({ email, password: 'Password123!' })
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

describe('payment links routes', () => {
  it('requires authentication', async () => {
    const res = await request(createApp()).post('/api/payment-links').send({ amount_cents: 500 })
    expect(res.status).toBe(401)
  })

  it('creates a link belonging to the caller, tied to one of their own accounts', async () => {
    const agent = await loginAs('alice@scpay.test')

    const res = await agent
      .post('/api/payment-links')
      .send({ amount_cents: 500, note: 'Lunch', account_id: accountId('CHK-1001') })

    expect(res.status).toBe(201)
    expect(res.body.path).toMatch(/^\/pay\/[a-f0-9]{32}$/)
    expect(res.body.note).toBe('Lunch')
    expect(res.body.account_id).toBe(accountId('CHK-1001'))
  })

  it('rejects an account_id the caller does not own', async () => {
    const agent = await loginAs('alice@scpay.test')

    const res = await agent
      .post('/api/payment-links')
      .send({ amount_cents: 500, account_id: accountId('CHK-2001') })

    expect(res.status).toBe(400)
  })

  it('rejects a non-positive amount', async () => {
    const agent = await loginAs('alice@scpay.test')

    const res = await agent
      .post('/api/payment-links')
      .send({ amount_cents: 0, account_id: accountId('CHK-1001') })

    expect(res.status).toBe(400)
  })

  it("lists only the caller's own links", async () => {
    const aliceAgent = await loginAs('alice@scpay.test')
    await aliceAgent
      .post('/api/payment-links')
      .send({ amount_cents: 500, note: 'Lunch', account_id: accountId('CHK-1001') })

    const bobAgent = await loginAs('bob@scpay.test')
    await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 900, note: 'Rent', account_id: accountId('CHK-2001') })

    const res = await bobAgent.get('/api/payment-links')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].note).toBe('Rent')
  })

  it('GET /:token returns public metadata for any authenticated caller', async () => {
    const bobAgent = await loginAs('bob@scpay.test')
    const created = await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 5_000, note: 'Rent', account_id: accountId('CHK-2001') })

    const aliceAgent = await loginAs('alice@scpay.test')
    const res = await aliceAgent.get(`/api/payment-links/${created.body.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ amount_cents: 5_000, note: 'Rent' })
  })

  it('GET /:token 404s for an unknown token', async () => {
    const agent = await loginAs('alice@scpay.test')
    const res = await agent.get('/api/payment-links/not-a-real-token')
    expect(res.status).toBe(404)
  })

  it('ignores a to_account_id override and always pays the link account (tampered-recipient fixed)', async () => {
    const bobAgent = await loginAs('bob@scpay.test')
    const created = await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 5_000, note: 'Rent', account_id: accountId('CHK-2001') })
    const bobBalanceBefore = balanceOf('CHK-2001')

    const aliceAgent = await loginAs('alice@scpay.test')
    const res = await aliceAgent.post(`/api/payment-links/${created.body.token}/pay`).send({
      from_account_id: accountId('CHK-1001'),
      to_account_id: accountId('SAV-1002'),
    })

    expect(res.status).toBe(201)
    expect(balanceOf('CHK-2001')).toBe(bobBalanceBefore + 5_000)
  })

  it('logs payment_link.paid with matching link_account_id and actual_to_account_id (tampered-recipient fixed)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const bobAgent = await loginAs('bob@scpay.test')
    const created = await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 5_000, account_id: accountId('CHK-2001') })

    const aliceAgent = await loginAs('alice@scpay.test')
    await aliceAgent.post(`/api/payment-links/${created.body.token}/pay`).send({
      from_account_id: accountId('CHK-1001'),
      to_account_id: accountId('SAV-1002'),
    })

    const line = logSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((l) => l.event === 'payment_link.paid')
    expect(line).toMatchObject({
      outcome: 'success',
      link_account_id: accountId('CHK-2001'),
      actual_to_account_id: accountId('CHK-2001'),
    })
    logSpy.mockRestore()
  })
})
