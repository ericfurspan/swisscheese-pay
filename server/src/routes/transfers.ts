import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { logSecurity } from '../log/security.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { transfer, type TransferFailureReason } from '../services/transfers.js'

export const transfersRouter = Router()

transfersRouter.use(requireAuth)

const FAILURE_STATUS: Record<TransferFailureReason, number> = {
  not_owner: 404,
  invalid_amount: 400,
  invalid_destination: 400,
  insufficient_funds: 422,
}

const FAILURE_MESSAGE: Record<TransferFailureReason, string> = {
  not_owner: 'Not found',
  invalid_amount: 'amount_cents must be a positive integer',
  invalid_destination: 'Destination account not found',
  insufficient_funds: 'Insufficient funds',
}

transfersRouter.post('/', (req, res) => {
  const { from_account_id: fromId, to_account_id: toId, amount_cents: amountCents } = req.body ?? {}
  if (typeof fromId !== 'number' || typeof toId !== 'number' || typeof amountCents !== 'number') {
    res
      .status(400)
      .json({ error: 'from_account_id, to_account_id, and amount_cents are required numbers' })
    return
  }

  const db = getDb()
  const uid = req.user!.uid

  logSecurity({
    event: 'transfer.initiated',
    actor_user_id: uid,
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
    detail: { from_account_id: fromId, to_account_id: toId, amount_cents: amountCents },
  })

  const result = transfer(db, { fromId, toId, amountCents, uid })

  if (!result.ok) {
    logSecurity({
      event: result.reason === 'not_owner' ? 'authz.deny' : 'transfer.failed',
      actor_user_id: uid,
      outcome: result.reason === 'not_owner' ? 'denied' : 'failure',
      request_id: req.id,
      ip: req.ip,
      detail: { reason: result.reason, from_account_id: fromId },
    })
    res.status(FAILURE_STATUS[result.reason]).json({ error: FAILURE_MESSAGE[result.reason] })
    return
  }

  logSecurity({
    event: 'transfer.completed',
    actor_user_id: uid,
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
    detail: { transfer_id: result.transferId },
  })
  res.status(201).json({ id: result.transferId })
})
