import type { Request } from 'express'
import { getDb } from '../db/connection.js'
import { logSecurity } from '../log/security.js'
import { getAccountForUser, getAccountOwnerId, type AccountDTO } from '../services/accounts.js'

// Shared by the account-read and transactions-read routes: parses the :id
// param, emits the authz.account_access log line for any existing account,
// and returns the ownership-gated account (undefined on miss or bad id).
// Fires in both the vulnerable and fixed states of getAccountForUser --
// only the outcome and (in the vulnerable state) whether a cross-owner
// caller gets the row back differ.
export function loadAccountForRead(req: Request): AccountDTO | undefined {
  const accountId = Number(req.params.id)
  if (!Number.isInteger(accountId)) {
    return undefined
  }

  const db = getDb()
  const ownerId = getAccountOwnerId(db, accountId)
  if (ownerId === undefined) {
    return undefined
  }

  const uid = req.user!.uid
  const account = getAccountForUser(db, accountId, uid)

  logSecurity({
    event: 'authz.account_access',
    actor_user_id: uid,
    target: `account:${accountId}`,
    outcome: account ? 'success' : 'denied',
    ip: req.ip,
    request_id: req.id,
    detail: { owner_user_id: ownerId, target_account_id: accountId },
  })

  return account
}
