import { describe, expect, it, vi } from 'vitest'
import { logSecurity } from './security.js'

describe('logSecurity', () => {
  it('emits exactly one parseable JSON line to stdout with all fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logSecurity({
      event: 'auth.login.success',
      actor_user_id: 1,
      target: 'user:1',
      outcome: 'success',
      ip: '127.0.0.1',
      request_id: 'req-1',
      detail: { foo: 'bar' },
    })

    expect(spy).toHaveBeenCalledTimes(1)
    const line = spy.mock.calls[0]?.[0] as string
    expect(() => JSON.parse(line)).not.toThrow()

    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      event: 'auth.login.success',
      actor_user_id: 1,
      target: 'user:1',
      outcome: 'success',
      ip: '127.0.0.1',
      request_id: 'req-1',
      foo: 'bar',
    })
    expect(typeof parsed.ts).toBe('string')
    expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts)

    spy.mockRestore()
  })

  it('handles a null actor and omits unset optional fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logSecurity({ event: 'authz.deny', actor_user_id: null, outcome: 'denied' })

    const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string)
    expect(parsed.actor_user_id).toBeNull()
    expect(parsed.outcome).toBe('denied')
    expect('target' in parsed).toBe(false)
    expect('ip' in parsed).toBe(false)
    expect('request_id' in parsed).toBe(false)

    spy.mockRestore()
  })

  it('does not let detail forge the reserved fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logSecurity({
      event: 'authz.deny',
      actor_user_id: 7,
      outcome: 'denied',
      detail: {
        outcome: 'success',
        actor_user_id: 1,
        event: 'auth.login.success',
        note: 'legitimate detail survives',
      },
    })

    const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string)
    expect(parsed.outcome).toBe('denied')
    expect(parsed.actor_user_id).toBe(7)
    expect(parsed.event).toBe('authz.deny')
    expect(parsed.note).toBe('legitimate detail survives')

    spy.mockRestore()
  })
})
