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

// The ownership check that keeps this a "secure baseline" -- returning a row
// only when it belongs to uid, rather than fetching by id alone, is what a
// later BOLA vuln phase deliberately removes.
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
