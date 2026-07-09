import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { getAccountForUser, listTransactionsForAccount } from '../services/accounts.js'

// mergeParams so this router (mounted at /:id/transactions in accounts.ts) can
// read the parent route's :id param.
export const transactionsRouter = Router({ mergeParams: true })

transactionsRouter.get<{ id: string }>('/', (req, res) => {
  const db = getDb()
  const accountId = Number(req.params.id)
  const account = Number.isInteger(accountId) ? getAccountForUser(db, accountId, req.user!.uid) : undefined
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.status(200).json(listTransactionsForAccount(db, account.id))
})
