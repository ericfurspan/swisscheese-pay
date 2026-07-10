import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client.js'
import type { Account } from '../api/types.js'
import { Nav } from '../components/Nav.js'

export function TransferPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api
      .get<Account[]>('/accounts')
      .then((result) => {
        setAccounts(result)
        if (result[0]) setFromAccountId(String(result[0].id))
      })
      .catch(() => setError('Could not load accounts'))
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      await api.post('/transfers', {
        from_account_id: Number(fromAccountId),
        to_account_id: Number(toAccountId),
        amount_cents: Math.round(Number(amount) * 100),
      })
      setSuccess('Transfer complete')
      setToAccountId('')
      setAmount('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transfer failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Nav />
      <h1>Transfer</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="from_account">From</label>
        <select
          id="from_account"
          value={fromAccountId}
          onChange={(event) => setFromAccountId(event.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.account_number}
            </option>
          ))}
        </select>
        <label htmlFor="to_account">To account ID</label>
        <input
          id="to_account"
          type="number"
          min="1"
          value={toAccountId}
          onChange={(event) => setToAccountId(event.target.value)}
          required
        />
        <label htmlFor="amount">Amount (USD)</label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">{success}</p>}
        <button type="submit" disabled={submitting}>
          Send
        </button>
      </form>
    </div>
  )
}
