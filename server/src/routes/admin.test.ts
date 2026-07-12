process.env.DB_PATH = ':memory:'

import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('excludes password_hash and masks ssn for a real admin', async () => {
    const agent = await loginAs('admin@scpay.test')

    const res = await agent.get('/api/admin/users')

    expect(res.status).toBe(200)
    const bob = res.body.find((u: { email: string }) => u.email === 'bob@scpay.test')
    expect(bob).not.toHaveProperty('password_hash')
    expect(bob.ssn).toBe('***-**-4321')
    expect(bob.role).toBe('customer')
  })

  it('logs admin.action with row_count on a successful listing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = await loginAs('admin@scpay.test')

    await agent.get('/api/admin/users')

    const line = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string)).find((l) => l.event === 'admin.action')
    expect(line).toMatchObject({ event: 'admin.action', outcome: 'success', action: 'list_users', row_count: 3 })
    logSpy.mockRestore()
  })
})
