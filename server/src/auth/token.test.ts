import { describe, expect, it } from 'vitest'
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
