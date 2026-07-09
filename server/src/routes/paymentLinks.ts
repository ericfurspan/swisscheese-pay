import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const paymentLinksRouter = Router()

paymentLinksRouter.use(requireAuth)

interface PaymentLinkRow {
  id: number
  token: string
  amount_cents: number
  note: string | null
  created_at: string
}

function generateToken(): string {
  return randomBytes(16).toString('hex')
}

paymentLinksRouter.post('/', (req, res) => {
  const { amount_cents: amountCents, note } = req.body ?? {}
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: 'amount_cents must be a positive integer' })
    return
  }
  if (note !== undefined && typeof note !== 'string') {
    res.status(400).json({ error: 'note must be a string' })
    return
  }

  const db = getDb()
  const token = generateToken()
  db.prepare(
    'INSERT INTO payment_links (user_id, token, amount_cents, note) VALUES (?, ?, ?, ?)',
  ).run(req.user!.uid, token, amountCents, note ?? null)

  res.status(201).json({ path: `/pay/${token}`, token, amount_cents: amountCents, note: note ?? null })
})

paymentLinksRouter.get('/', (req, res) => {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, token, amount_cents, note, created_at FROM payment_links WHERE user_id = ? ORDER BY id',
    )
    .all(req.user!.uid) as PaymentLinkRow[]

  res.status(200).json(rows)
})
