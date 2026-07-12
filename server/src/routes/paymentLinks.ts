import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { logSecurity } from '../log/security.js'
import { isAccountOwnedByUser } from '../services/accounts.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { transfer } from '../services/transfers.js'

export const paymentLinksRouter = Router()

paymentLinksRouter.use(requireAuth)

interface PaymentLinkRow {
  id: number
  account_id: number
  token: string
  amount_cents: number
  note: string | null
  created_at: string
}

function generateToken(): string {
  return randomBytes(16).toString('hex')
}

paymentLinksRouter.post('/', (req, res) => {
  const { amount_cents: amountCents, note, account_id: accountId } = req.body ?? {}
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: 'amount_cents must be a positive integer' })
    return
  }
  if (note !== undefined && typeof note !== 'string') {
    res.status(400).json({ error: 'note must be a string' })
    return
  }

  const db = getDb()
  if (typeof accountId !== 'number' || !isAccountOwnedByUser(db, accountId, req.user!.uid)) {
    res.status(400).json({ error: 'account_id must be one of your own accounts' })
    return
  }

  const token = generateToken()
  db.prepare(
    'INSERT INTO payment_links (user_id, account_id, token, amount_cents, note) VALUES (?, ?, ?, ?, ?)',
  ).run(req.user!.uid, accountId, token, amountCents, note ?? null)

  res.status(201).json({
    path: `/pay/${token}`,
    token,
    account_id: accountId,
    amount_cents: amountCents,
    note: note ?? null,
  })
})

paymentLinksRouter.get('/', (req, res) => {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, account_id, token, amount_cents, note, created_at FROM payment_links WHERE user_id = ? ORDER BY id',
    )
    .all(req.user!.uid) as PaymentLinkRow[]

  res.status(200).json(rows)
})

// Tokens are public/shareable by design (see the schema comment) -- no
// ownership gate on lookup by token, only requireAuth (a payer must be
// logged in to see the amount/note before paying).
paymentLinksRouter.get('/:token', (req, res) => {
  const db = getDb()
  const row = db
    .prepare('SELECT token, amount_cents, note FROM payment_links WHERE token = ?')
    .get(req.params.token) as
    { token: string; amount_cents: number; note: string | null } | undefined

  if (!row) {
    res.status(404).json({ error: 'Payment link not found' })
    return
  }

  res.status(200).json(row)
})

paymentLinksRouter.post(
  '/:token/pay',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const link = db
      .prepare('SELECT id, account_id, amount_cents FROM payment_links WHERE token = ?')
      .get(req.params.token) as { id: number; account_id: number; amount_cents: number } | undefined

    if (!link) {
      res.status(404).json({ error: 'Payment link not found' })
      return
    }

    const { from_account_id: fromId } = req.body ?? {}
    if (typeof fromId !== 'number') {
      res.status(400).json({ error: 'from_account_id is required' })
      return
    }

    // fix/phase-3-tampered-recipient: the destination is always the link's
    // own account_id -- nothing from the request body can override it.
    const toId = link.account_id

    const result = await transfer(db, {
      fromId,
      toId,
      amountCents: link.amount_cents,
      uid: req.user!.uid,
      paymentLinkId: link.id,
    })

    logSecurity({
      event: 'payment_link.paid',
      actor_user_id: req.user!.uid,
      target: `payment_link:${link.id}`,
      outcome: result.ok ? 'success' : 'failure',
      request_id: req.id,
      ip: req.ip,
      detail: {
        token: req.params.token,
        link_account_id: link.account_id,
        actual_to_account_id: toId,
      },
    })

    if (!result.ok) {
      const status =
        result.reason === 'not_owner'
          ? 404
          : result.reason === 'insufficient_funds'
            ? 422
            : result.reason === 'idempotency_conflict'
              ? 409
              : 400
      const error =
        result.reason === 'idempotency_conflict' ? 'Payment link already used' : result.reason
      res.status(status).json({ error })
      return
    }

    res.status(201).json({ id: result.transferId })
  }),
)
