import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import type { Account, Transaction } from '../api/types.js'
import { Nav } from '../components/Nav.js'
import { formatCents } from '../lib/format.js'

export function AccountPage() {
  const { id } = useParams()
  const [account, setAccount] = useState<Account | null>(null)
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get<Account>(`/accounts/${id}`),
      api.get<Transaction[]>(`/accounts/${id}/transactions`),
    ])
      .then(([accountResult, transactionsResult]) => {
        setAccount(accountResult)
        setTransactions(transactionsResult)
      })
      .catch(() => setError('Could not load account'))
  }, [id])

  return (
    <div>
      <Nav />
      {error && <p role="alert">{error}</p>}
      {account && (
        <>
          <h1>
            {account.account_number} ({account.type})
          </h1>
          <p>Balance: {formatCents(account.balance_cents)}</p>
        </>
      )}
      {transactions && (
        <ul>
          {transactions.map((transaction) => (
            <li key={transaction.id}>
              {transaction.created_at} &mdash; {transaction.memo ?? transaction.counterparty ?? 'Transaction'}{' '}
              &mdash; {formatCents(transaction.amount_cents)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
