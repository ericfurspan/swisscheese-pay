import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext.js'
import { DashboardPage } from './Dashboard.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardPage', () => {
  it('renders returned account balances', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input)
        if (url === '/api/profile') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        if (url === '/api/accounts') {
          return new Response(
            JSON.stringify([
              { id: 1, account_number: 'CHK-1001', type: 'checking', balance_cents: 100_000, created_at: '' },
              { id: 2, account_number: 'SAV-1002', type: 'savings', balance_cents: 500_000, created_at: '' },
            ]),
            { status: 200 },
          )
        }
        return new Response(null, { status: 404 })
      }),
    )

    render(
      <MemoryRouter>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/\$1,000\.00/)).toBeInTheDocument()
    expect(await screen.findByText(/\$5,000\.00/)).toBeInTheDocument()
  })
})
