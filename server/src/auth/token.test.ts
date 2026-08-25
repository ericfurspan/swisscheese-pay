import jwt from 'jsonwebtoken'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signToken, verifyToken } from './token.js'

describe('token', () => {
  it('round-trips a signed token, including a generated jti', () => {
    const { token, jti } = signToken({ uid: 1, role: 'customer' })
    expect(typeof jti).toBe('string')
    expect(jti.length).toBeGreaterThan(0)
    expect(verifyToken(token)).toEqual({ uid: 1, role: 'customer', jti })
  })

  it('generates a distinct jti per call', () => {
    const first = signToken({ uid: 1, role: 'customer' })
    const second = signToken({ uid: 1, role: 'customer' })
    expect(first.jti).not.toBe(second.jti)
  })

  it('rejects a tampered token', () => {
    const { token } = signToken({ uid: 1, role: 'customer' })
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a')
    expect(verifyToken(tampered)).toBeNull()
  })

  it('rejects a garbage token', () => {
    expect(verifyToken('not-a-real-token')).toBeNull()
  })

  it('rejects a token signed with a non-HS256 algorithm', () => {
    const token = jwt.sign({ uid: 1, role: 'customer' }, process.env.JWT_SECRET as string, {
      algorithm: 'HS512',
    })
    expect(verifyToken(token)).toBeNull()
  })

  it('rejects a token missing a jti claim', () => {
    const token = jwt.sign({ uid: 1, role: 'customer' }, process.env.JWT_SECRET as string, {
      algorithm: 'HS256',
    })
    expect(verifyToken(token)).toBeNull()
  })
})

describe('token secret guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('refuses to load without JWT_SECRET', async () => {
    vi.resetModules()
    vi.stubEnv('JWT_SECRET', undefined)

    await expect(import('./token.js')).rejects.toThrow(/JWT_SECRET/)
  })

  it('accepts a crackable short JWT_SECRET (JWT vulnerability)', async () => {
    vi.resetModules()
    vi.stubEnv('JWT_SECRET', 'short-secret')

    await expect(import('./token.js')).resolves.toMatchObject({
      signToken: expect.any(Function),
      verifyToken: expect.any(Function),
    })
  })
})
