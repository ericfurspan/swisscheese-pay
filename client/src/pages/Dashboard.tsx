import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import type { Account } from '../api/types.js'
import { Nav } from '../components/Nav.js'
import { formatCents } from '../lib/format.js'

export function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Account[]>('/accounts')
      .then(setAccounts)
      .catch(() => setError('Could not load accounts'))
  }, [])

  return (
    <div>
      <Nav />
      <h1>Dashboard</h1>
      {error && <p role="alert">{error}</p>}
      {accounts && (
        <ul>
          {accounts.map((account) => (
            <li key={account.id}>
              <Link to={`/accounts/${account.id}`}>
                {account.account_number} ({account.type}) &mdash; {formatCents(account.balance_cents)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
