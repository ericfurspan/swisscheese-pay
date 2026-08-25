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

  it('honors a tampered to_account_id override', async () => {
    const bobAgent = await loginAs('bob@scpay.test')
    const created = await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 5_000, note: 'Rent', account_id: accountId('CHK-2001') })
    const bobBalanceBefore = balanceOf('CHK-2001')
    const attackerBalanceBefore = balanceOf('SAV-1002')

    const aliceAgent = await loginAs('alice@scpay.test')
    const res = await aliceAgent.post(`/api/payment-links/${created.body.token}/pay`).send({
      from_account_id: accountId('CHK-1001'),
      to_account_id: accountId('SAV-1002'),
    })

    expect(res.status).toBe(201)
    expect(balanceOf('CHK-2001')).toBe(bobBalanceBefore)
    expect(balanceOf('SAV-1002')).toBe(attackerBalanceBefore + 5_000)
  })

  it('logs mismatched link and actual recipient account ids', async () => {
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
      actual_to_account_id: accountId('SAV-1002'),
    })
    logSpy.mockRestore()
  })

  it('pays a link exactly once under concurrent attempts from different accounts', async () => {
    const bobAgent = await loginAs('bob@scpay.test')
    const created = await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 1_000, account_id: accountId('CHK-2001') })
    const bobBalanceBefore = balanceOf('CHK-2001')

    const aliceAgent = await loginAs('alice@scpay.test')
    const [r1, r2] = await Promise.all([
      aliceAgent
        .post(`/api/payment-links/${created.body.token}/pay`)
        .send({ from_account_id: accountId('CHK-1001') }),
      aliceAgent
        .post(`/api/payment-links/${created.body.token}/pay`)
        .send({ from_account_id: accountId('SAV-1002') }),
    ])

    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([201, 409])
    expect(balanceOf('CHK-2001')).toBe(bobBalanceBefore + 1_000) // credited exactly once
  })

  it('returns the same transfer id on a sequential retry (safe retry after a lost response)', async () => {
    const bobAgent = await loginAs('bob@scpay.test')
    const created = await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 1_000, account_id: accountId('CHK-2001') })
    const bobBalanceBefore = balanceOf('CHK-2001')

    const aliceAgent = await loginAs('alice@scpay.test')
    const body = { from_account_id: accountId('CHK-1001') }
    const first = await aliceAgent.post(`/api/payment-links/${created.body.token}/pay`).send(body)
    const second = await aliceAgent.post(`/api/payment-links/${created.body.token}/pay`).send(body)

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.body.id).toBe(first.body.id)
    expect(balanceOf('CHK-2001')).toBe(bobBalanceBefore + 1_000) // still only one credit
  })

  it('returns one shared transfer id under true concurrent exact-retry from the same source account', async () => {
    const bobAgent = await loginAs('bob@scpay.test')
    const created = await bobAgent
      .post('/api/payment-links')
      .send({ amount_cents: 1_000, account_id: accountId('CHK-2001') })
    const bobBalanceBefore = balanceOf('CHK-2001')

    const aliceAgent = await loginAs('alice@scpay.test')
    const body = { from_account_id: accountId('CHK-1001') }
    const [r1, r2] = await Promise.all([
      aliceAgent.post(`/api/payment-links/${created.body.token}/pay`).send(body),
      aliceAgent.post(`/api/payment-links/${created.body.token}/pay`).send(body),
    ])

    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r1.body.id).toBe(r2.body.id)
    expect(balanceOf('CHK-2001')).toBe(bobBalanceBefore + 1_000) // exactly one debit/credit
  })

  it('logs payment_link.created with note_flagged: false for a benign note', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = await loginAs('alice@scpay.test')

    await agent
      .post('/api/payment-links')
      .send({ amount_cents: 500, note: 'Lunch', account_id: accountId('CHK-1001') })

    const line = logSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((l) => l.event === 'payment_link.created')
    expect(line).toMatchObject({ outcome: 'success', note_flagged: false })
    logSpy.mockRestore()
  })

  it('logs payment_link.created with note_flagged: true for a suspicious note', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = await loginAs('alice@scpay.test')

    await agent.post('/api/payment-links').send({
      amount_cents: 500,
      note: '<img src=x onerror="alert(1)">',
      account_id: accountId('CHK-1001'),
    })

    const line = logSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((l) => l.event === 'payment_link.created')
    expect(line).toMatchObject({ outcome: 'success', note_flagged: true })
    logSpy.mockRestore()
  })

  it('flags note_flagged: true case-insensitively', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = await loginAs('alice@scpay.test')

    await agent.post('/api/payment-links').send({
      amount_cents: 500,
      note: '<IMG SRC=x ONERROR="alert(1)">',
      account_id: accountId('CHK-1001'),
    })

    const line = logSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((l) => l.event === 'payment_link.created')
    expect(line).toMatchObject({ outcome: 'success', note_flagged: true })
    logSpy.mockRestore()
  })

  it('logs payment_link.created with note_flagged: false when note is omitted', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = await loginAs('alice@scpay.test')

    await agent
      .post('/api/payment-links')
      .send({ amount_cents: 500, account_id: accountId('CHK-1001') })

    const line = logSpy.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((l) => l.event === 'payment_link.created')
    expect(line).toMatchObject({ outcome: 'success', note_flagged: false })
    logSpy.mockRestore()
  })
})
