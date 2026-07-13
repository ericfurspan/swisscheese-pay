import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client.js'
import type { Account } from '../api/types.js'
import { Nav } from '../components/Nav.js'
import { formatCents } from '../lib/format.js'

interface PaymentLinkDetail {
  token: string
  amount_cents: number
  note: string | null
}

export function PayPage() {
  const { token } = useParams<{ token: string }>()
  const [link, setLink] = useState<PaymentLinkDetail | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromAccountId, setFromAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    api
      .get<PaymentLinkDetail>(`/payment-links/${token}`)
      .catch(() => {
        setError('Payment link not found')
        return null
      })
      .then((result) => setLink(result))
    api
      .get<Account[]>('/accounts')
      .then((result) => {
        setAccounts(result)
        if (result[0]) setFromAccountId(String(result[0].id))
      })
      .catch(() => setError('Could not load accounts'))
  }, [token])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      await api.post(`/payment-links/${token}/pay`, { from_account_id: Number(fromAccountId) })
      setSuccess('Payment complete')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!link) {
    return (
      <div>
        <Nav />
        {error && <p role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <Nav />
      <h1>Pay {formatCents(link.amount_cents)}</h1>
      {link.note && <p>{link.note}</p>}
      <form onSubmit={handleSubmit}>
        <label htmlFor="from_account">Pay from</label>
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
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">{success}</p>}
        <button type="submit" disabled={submitting}>
          Pay
        </button>
      </form>
    </div>
  )
}
