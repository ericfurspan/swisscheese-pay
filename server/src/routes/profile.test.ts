process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signToken } from '../auth/token.js'
import { createApp } from '../app.js'
import { getDb } from '../db/connection.js'
import { resetSchema } from '../db/schema.js'
import { seed } from '../db/seed.js'
import { SESSION_COOKIE } from '../middleware/requireAuth.js'

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

  it('lets a customer set their own role via the request body (mass assignment) -- tightened at fix/phase-2-mass-assignment', async () => {
    const agent = await loginAsAlice()

    const res = await agent.patch('/api/profile').send({ full_name: 'Alice Anderson', role: 'admin' })
    expect(res.status).toBe(200)

    const alice = getDb().prepare('SELECT role FROM users WHERE email = ?').get('alice@scpay.test') as {
      role: string
    }
    expect(alice.role).toBe('admin')
  })

  it('treats a validly-signed token for a since-deleted user as unauthenticated', async () => {
    // Simulates a session that outlives its user row -- e.g. the DB reseeds
    // (as it does on every container boot) while a still-unexpired cookie
    // from a prior boot is presented.
    const staleToken = signToken({ uid: 999_999, role: 'customer' })

    const res = await request(createApp())
      .get('/api/profile')
      .set('Cookie', [`${SESSION_COOKIE}=${staleToken}`])

    expect(res.status).toBe(401)
  })

  it('rejects a profile update for a since-deleted user rather than reporting false success', async () => {
    const staleToken = signToken({ uid: 999_999, role: 'customer' })

    const res = await request(createApp())
      .patch('/api/profile')
      .set('Cookie', [`${SESSION_COOKIE}=${staleToken}`])
      .send({ full_name: 'Nobody' })

    expect(res.status).toBe(401)
  })

  it('logs profile.update with changed_fields on a name-only update (state-independent)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = await loginAsAlice()

    await agent.patch('/api/profile').send({ full_name: 'Alice Updated' })

    const line = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string)).find((l) => l.event === 'profile.update')
    expect(line).toMatchObject({ event: 'profile.update', outcome: 'success', changed_fields: ['full_name'] })
    logSpy.mockRestore()
  })

  it('-- vulnerable state, tightened at fix/phase-2-mass-assignment -- logs role in changed_fields when a role field is smuggled in', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = await loginAsAlice()

    await agent.patch('/api/profile').send({ full_name: 'Alice Updated', role: 'admin' })

    const line = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string)).find((l) => l.event === 'profile.update')
    expect(line?.changed_fields).toEqual(['full_name', 'role'])
    logSpy.mockRestore()
  })
})
