import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext.js'
import { LoginPage } from './Login.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(loggedInRef: { current: boolean }) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input)

    if (url === '/api/profile') {
      if (!loggedInRef.current)
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      return new Response(
        JSON.stringify({
          id: 1,
          email: 'alice@scpay.test',
          full_name: 'Alice',
          ssn: '***-**-6789',
        }),
        { status: 200 },
      )
    }
    if (url === '/api/auth/login') {
      loggedInRef.current = true
      return new Response(JSON.stringify({ id: 1, email: 'alice@scpay.test' }), { status: 200 })
    }
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('LoginPage', () => {
  it('submits email and password to the login endpoint', async () => {
    const fetchMock = stubFetch({ current: false })

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@scpay.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    const loginCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/auth/login')
    expect(loginCall).toBeDefined()
    const [, options] = loginCall!
    expect(JSON.parse(options?.body as string)).toEqual({
      email: 'alice@scpay.test',
      password: 'Password123!',
    })
  })

  it('redirects to the dashboard after a successful login', async () => {
    stubFetch({ current: false })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<p>Dashboard stub</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@scpay.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Dashboard stub')).toBeInTheDocument()
  })

  it('shows an error message when login fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/profile')
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        if (url === '/api/auth/login') {
          return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
            status: 401,
          })
        }
        return new Response(null, { status: 404 })
      }),
    )

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@scpay.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i)
  })
})
