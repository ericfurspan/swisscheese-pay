import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client.js'
import type { PaymentLink } from '../api/types.js'
import { Nav } from '../components/Nav.js'
import { formatCents } from '../lib/format.js'

export function PaymentLinkPage() {
  const [links, setLinks] = useState<PaymentLink[]>([])
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
