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

function userId(email: string): number {
  return (getDb().prepare('SELECT id FROM users WHERE email = ?').get(email) as IdRow).id
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

  // BOLA (vuln/phase-1-bola): the ownership predicate is removed, so a
  // cross-owner read now succeeds and leaks foreign account data. Restored
  // in fix/phase-1-bola.
  it("returns another user's account for a cross-owner request", async () => {
    const agent = await loginAsAlice()

    const res = await agent.get(`/api/accounts/${accountId('CHK-2001')}`)

    expect(res.status).toBe(200)
    expect(res.body.account_number).toBe('CHK-2001')
  })

  it('returns transactions for an owned account', async () => {
    const agent = await loginAsAlice()

    const res = await agent.get(`/api/accounts/${accountId('CHK-1001')}/transactions`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })

  // BOLA (vuln/phase-1-bola): same choke point as the account read above —
  // cross-owner transactions leak too. Restored in fix/phase-1-bola.
  it("returns another user's account transactions for a cross-owner request", async () => {
    const agent = await loginAsAlice()

    const res = await agent.get(`/api/accounts/${accountId('CHK-2001')}/transactions`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })

  describe('authz.account_access logging', () => {
    it('logs outcome=success with matching owner_user_id for a same-owner read', async () => {
      const agent = await loginAsAlice()
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const id = accountId('CHK-1001')
      const res = await agent.get(`/api/accounts/${id}`)

      expect(res.status).toBe(200)
      const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
      expect(line).toMatchObject({
        event: 'authz.account_access',
        actor_user_id: userId('alice@scpay.test'),
        target: `account:${id}`,
        outcome: 'success',
        owner_user_id: userId('alice@scpay.test'),
        target_account_id: id,
      })
      logSpy.mockRestore()
    })

    // BOLA (vuln/phase-1-bola): cross-owner reads currently succeed, so this
    // logs outcome=success with actor_user_id != owner_user_id -- exactly
    // what the detections/ rule flags. fix/phase-1-bola flips this to
    // outcome=denied for the same request.
    it('logs outcome=success with a mismatched owner_user_id for a cross-owner read', async () => {
      const agent = await loginAsAlice()
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const id = accountId('CHK-2001')
      const res = await agent.get(`/api/accounts/${id}`)

      expect(res.status).toBe(200)
      const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
      expect(line).toMatchObject({
        event: 'authz.account_access',
        actor_user_id: userId('alice@scpay.test'),
        outcome: 'success',
        owner_user_id: userId('bob@scpay.test'),
      })
      expect(line.actor_user_id).not.toBe(line.owner_user_id)
      logSpy.mockRestore()
    })

    it('logs exactly once per transactions read, reusing the same event shape', async () => {
      const agent = await loginAsAlice()
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const id = accountId('CHK-1001')
      await agent.get(`/api/accounts/${id}/transactions`)

      const accessLines = logSpy.mock.calls
        .map((call) => JSON.parse(call[0] as string))
        .filter((line) => line.event === 'authz.account_access')
      expect(accessLines).toHaveLength(1)
      expect(accessLines[0]).toMatchObject({ target: `account:${id}`, outcome: 'success' })
      logSpy.mockRestore()
    })

    it('does not log for a nonexistent account id', async () => {
      const agent = await loginAsAlice()
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const res = await agent.get('/api/accounts/999999')

      expect(res.status).toBe(404)
      const accessLines = logSpy.mock.calls
        .map((call) => JSON.parse(call[0] as string))
        .filter((line) => line.event === 'authz.account_access')
      expect(accessLines).toHaveLength(0)
      logSpy.mockRestore()
    })
  })
})
