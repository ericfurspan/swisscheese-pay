import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client.js'
import type { Account, PaymentLink } from '../api/types.js'
import { Nav } from '../components/Nav.js'
import { formatCents } from '../lib/format.js'

export function PaymentLinkPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [links, setLinks] = useState<PaymentLink[]>([])
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function loadLinks() {
    api
      .get<PaymentLink[]>('/payment-links')
      .then(setLinks)
      .catch(() => setError('Could not load payment links'))
  }

  useEffect(() => {
    api
      .get<Account[]>('/accounts')
      .then((result) => {
        setAccounts(result)
        if (result[0]) setAccountId(String(result[0].id))
      })
      .catch(() => setError('Could not load accounts'))
    loadLinks()
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.post('/payment-links', {
        amount_cents: Math.round(Number(amount) * 100),
        note: note || undefined,
        account_id: Number(accountId),
      })
      setAmount('')
      setNote('')
      loadLinks()
    } catch {
      setError('Could not create payment link')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Nav />
      <h1>Payment Links</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="account">Receiving account</label>
        <select id="account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.account_number}
            </option>
          ))}
        </select>
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
        <label htmlFor="note">Note</label>
        <input id="note" value={note} onChange={(event) => setNote(event.target.value)} />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          Create link
        </button>
      </form>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            /pay/{link.token} &mdash; {formatCents(link.amount_cents)} {link.note && `(${link.note})`}
          </li>
        ))}
      </ul>
    </div>
  )
}
