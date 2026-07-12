import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('sends requests with credentials included and a JSON content type', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.get('/profile')

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/profile')
    expect(options?.credentials).toBe('include')
  })

  it('sends a POST body as JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.post('/auth/login', { email: 'a@x.test', password: 'secret' })

    const [, options] = fetchMock.mock.calls[0]
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual({ email: 'a@x.test', password: 'secret' })
  })

  it('resolves with the parsed JSON body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })),
    )

    const result = await api.get<{ id: number }>('/profile')

    expect(result).toEqual({ id: 1 })
  })

  it('throws an ApiError with the status and server message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 }),
      ),
    )

    await expect(api.post('/auth/login', {})).rejects.toMatchObject(
      new ApiError(401, 'Invalid email or password'),
    )
  })

  it('resolves with undefined for a 204 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )

    await expect(api.post('/auth/logout')).resolves.toBeUndefined()
  })
})
