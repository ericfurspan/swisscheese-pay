import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password', () => {
  it('round-trips a hashed password', () => {
    const hash = hashPassword('correct-horse-battery-staple')
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
  })

  it('rejects the wrong password', () => {
    const hash = hashPassword('correct-horse-battery-staple')
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('does not store the password in plaintext', () => {
    const hash = hashPassword('correct-horse-battery-staple')
    expect(hash).not.toBe('correct-horse-battery-staple')
  })
})
