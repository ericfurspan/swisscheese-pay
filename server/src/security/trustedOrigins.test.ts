import { describe, expect, it } from 'vitest'
import { isTrustedOrigin, TRUSTED_ORIGINS } from './trustedOrigins.js'

describe('trustedOrigins', () => {
  it('trusts the configured app origin', () => {
    expect(isTrustedOrigin(TRUSTED_ORIGINS[0])).toBe(true)
    expect(TRUSTED_ORIGINS[0]).toBe('http://127.0.0.1:8082')
  })

  it('trusts the configured security-lab origin', () => {
    expect(isTrustedOrigin(TRUSTED_ORIGINS[1])).toBe(true)
    expect(TRUSTED_ORIGINS[1]).toBe('http://app.scpay.test:8082')
  })

  it('trusts the configured dev origin', () => {
    expect(isTrustedOrigin(TRUSTED_ORIGINS[2])).toBe(true)
    expect(TRUSTED_ORIGINS[2]).toBe('http://localhost:5173')
  })

  it('does not trust an arbitrary origin', () => {
    expect(isTrustedOrigin('http://evil.scpay.test:9000')).toBe(false)
  })
})
