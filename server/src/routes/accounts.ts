import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { logSecurity } from '../log/security.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { listAccountsForUser } from '../services/accounts.js'
import { loadAccountForRead } from './accountAccess.js'
import { transactionsRouter } from './transactions.js'

export const accountsRouter = Router()

accountsRouter.use(requireAuth)

accountsRouter.get('/', (req, res) => {
  const db = getDb()
  logSecurity({
    event: 'authz.account_access',
    actor_user_id: req.user!.uid,
    target: 'accounts:list',
    outcome: 'success',
    ip: req.ip,
    request_id: req.id,
    detail: { origin: req.get('Origin') ?? null },
  })
  res.status(200).json(listAccountsForUser(db, req.user!.uid))
})

accountsRouter.get('/:id', (req, res) => {
  const account = loadAccountForRead(req)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.status(200).json(account)
})

accountsRouter.use('/:id/transactions', transactionsRouter)
