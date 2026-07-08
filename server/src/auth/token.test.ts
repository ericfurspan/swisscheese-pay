import { afterEach, describe, expect, it, vi } from 'vitest'
import { signToken, verifyToken } from './token.js'

describe('token', () => {
  it('round-trips a signed token', () => {
    const token = signToken({ uid: 1, role: 'customer' })
    expect(verifyToken(token)).toMatchObject({ uid: 1, role: 'customer' })
  })

  it('rejects a tampered token', () => {
    const token = signToken({ uid: 1, role: 'customer' })
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a')
    expect(verifyToken(tampered)).toBeNull()
  })

  it('rejects a garbage token', () => {
    expect(verifyToken('not-a-real-token')).toBeNull()
  })
})

describe('token secret guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('refuses to load without JWT_SECRET when NODE_ENV=production', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JWT_SECRET', undefined)

    await expect(import('./token.js')).rejects.toThrow(/JWT_SECRET/)
  })
})
