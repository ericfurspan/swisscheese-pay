process.env.DB_PATH = ':memory:'

import bcrypt from 'bcryptjs'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { getDb } from '../db/connection.js'
import { resetSchema } from '../db/schema.js'
import { requireAuth } from '../middleware/requireAuth.js'

beforeEach(() => {
  resetSchema(getDb())
})

function buildAppWithProtectedTestRoute() {
  const app = createApp()
  app.get('/api/_protected-test-only', requireAuth, (req, res) => {
    res.status(200).json({ user: req.user })
  })
  return app
}

describe('auth routes', () => {
  it('registers, logs in, and accesses a protected route via the session cookie', async () => {
    const app = buildAppWithProtectedTestRoute()
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ email: 'new@scpay.test', password: 'Sup3rSecret!', full_name: 'New User' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: 'new@scpay.test', password: 'Sup3rSecret!' })
    expect(loginRes.status).toBe(200)

    const protectedRes = await agent.get('/api/_protected-test-only')
    expect(protectedRes.status).toBe(200)
    expect(protectedRes.body.user).toMatchObject({ role: 'customer' })
  })

  it('logs auth.register on successful registration', async () => {
    const app = createApp()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'logged@scpay.test', password: 'Sup3rSecret!', full_name: 'Logged User' })

    expect(res.status).toBe(201)
    const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(line).toMatchObject({ event: 'auth.register', outcome: 'success', actor_user_id: res.body.id })
    logSpy.mockRestore()
  })

  it('rejects registration with a too-short password', async () => {
    const app = createApp()

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@scpay.test', password: 'short1', full_name: 'Short Pw' })

    expect(res.status).toBe(400)
  })

  it('rejects registration with a duplicate email', async () => {
    const app = createApp()
    const payload = { email: 'dupe@scpay.test', password: 'Sup3rSecret!', full_name: 'Dupe User' }

    const first = await request(app).post('/api/auth/register').send(payload)
    expect(first.status).toBe(201)

    const second = await request(app).post('/api/auth/register').send(payload)
    expect(second.status).toBe(409)
  })

  it('rejects login with a bad password and logs auth.login.failure', async () => {
    const app = createApp()
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'baduser@scpay.test', password: 'Sup3rSecret!', full_name: 'Bad User' })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'baduser@scpay.test', password: 'wrong-password' })

    expect(res.status).toBe(401)
    const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(line).toMatchObject({ event: 'auth.login.failure', outcome: 'failure' })
    logSpy.mockRestore()
  })

  it('runs a password comparison even for an unknown email (no timing oracle)', async () => {
    const app = createApp()
    const compareSpy = vi.spyOn(bcrypt, 'compareSync')

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody-registered@scpay.test', password: 'whatever' })

    expect(res.status).toBe(401)
    expect(compareSpy).toHaveBeenCalledTimes(1)
    compareSpy.mockRestore()
  })

  it('logs out and clears the session cookie', async () => {
    const app = buildAppWithProtectedTestRoute()
    const agent = request.agent(app)
    await agent
      .post('/api/auth/register')
      .send({ email: 'logout@scpay.test', password: 'Sup3rSecret!', full_name: 'Logout User' })

    const logoutRes = await agent.post('/api/auth/logout')
    expect(logoutRes.status).toBe(204)

    const protectedRes = await agent.get('/api/_protected-test-only')
    expect(protectedRes.status).toBe(401)
  })

  it('logs auth.logout with the same field set as other security events', async () => {
    const app = buildAppWithProtectedTestRoute()
    const agent = request.agent(app)
    await agent
      .post('/api/auth/register')
      .send({ email: 'logoutfields@scpay.test', password: 'Sup3rSecret!', full_name: 'Logout Fields' })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await agent.post('/api/auth/logout')

    const line = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(line).toMatchObject({ event: 'auth.logout', outcome: 'success' })
    expect(line.ip).toBeDefined()
    logSpy.mockRestore()
  })
})
