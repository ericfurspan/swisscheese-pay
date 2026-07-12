import type Database from 'better-sqlite3'

export interface AccountDTO {
  id: number
  account_number: string
  type: string
  balance_cents: number
  created_at: string
}

export interface TransactionDTO {
  id: number
  counterparty: string | null
  memo: string | null
  amount_cents: number
  created_at: string
}

const ACCOUNT_COLUMNS = 'id, account_number, type, balance_cents, created_at'
const TRANSACTION_COLUMNS = 'id, counterparty, memo, amount_cents, created_at'

export function listAccountsForUser(db: Database.Database, uid: number): AccountDTO[] {
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE user_id = ? ORDER BY id`)
    .all(uid) as AccountDTO[]
}

interface OwnerRow {
  user_id: number
}

// Looks up the true owner of an account independent of the (possibly
// vulnerable) ownership predicate in getAccountForUser -- the access-log
// event needs the real owner_user_id in both the vulnerable and fixed
// states to compute actor_user_id != owner_user_id.
export function getAccountOwnerId(db: Database.Database, accountId: number): number | undefined {
  const row = db.prepare('SELECT user_id FROM accounts WHERE id = ?').get(accountId) as
    OwnerRow | undefined
  return row?.user_id
}

// Dedicated ownership check for transfers.ts's source-account gate. Kept
// independent of getAccountForUser so Phase 1's BOLA vuln (account/transaction
// reads only) can't incidentally break transfer authz -- money-movement bugs
// are a separate, later vuln phase.
export function isAccountOwnedByUser(
  db: Database.Database,
  accountId: number,
  uid: number,
): boolean {
  return getAccountOwnerId(db, accountId) === uid
}

// The ownership check that keeps this a "secure baseline" -- returning a row
// only when it belongs to uid, rather than fetching by id alone, is what
// vuln/phase-1-bola deliberately removed and fix/phase-1-bola restores.
export function getAccountForUser(
  db: Database.Database,
  accountId: number,
  uid: number,
): AccountDTO | undefined {
  return db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ? AND user_id = ?`)
    .get(accountId, uid) as AccountDTO | undefined
}

export function listTransactionsForAccount(
  db: Database.Database,
  accountId: number,
): TransactionDTO[] {
  return db
    .prepare(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE account_id = ? ORDER BY id`)
    .all(accountId) as TransactionDTO[]
}
