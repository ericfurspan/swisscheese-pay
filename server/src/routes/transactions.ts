import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { listTransactionsForAccount } from '../services/accounts.js'
import { loadAccountForRead } from './accountAccess.js'

// mergeParams so this router (mounted at /:id/transactions in accounts.ts) can
// read the parent route's :id param.
export const transactionsRouter = Router({ mergeParams: true })

transactionsRouter.get<{ id: string }>('/', (req, res) => {
  const account = loadAccountForRead(req)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const db = getDb()
  res.status(200).json(listTransactionsForAccount(db, account.id))
})
