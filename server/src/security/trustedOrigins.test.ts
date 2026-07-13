import { describe, expect, it } from 'vitest'
import { isTrustedOrigin, TRUSTED_ORIGINS } from './trustedOrigins.js'

describe('trustedOrigins', () => {
  it('trusts the configured app origin', () => {
    expect(isTrustedOrigin(TRUSTED_ORIGINS[0])).toBe(true)
  })

  it('trusts the configured dev origin', () => {
    expect(isTrustedOrigin(TRUSTED_ORIGINS[1])).toBe(true)
  })

  it('does not trust an arbitrary origin', () => {
    expect(isTrustedOrigin('http://evil.scpay.test:9000')).toBe(false)
  })
})
