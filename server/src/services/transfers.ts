import type Database from 'better-sqlite3'
import { getAccountForUser } from './accounts.js'

export type TransferFailureReason =
  | 'not_owner'
  | 'invalid_amount'
  | 'invalid_destination'
  | 'insufficient_funds'

export type TransferResult = { ok: true; transferId: number } | { ok: false; reason: TransferFailureReason }

export interface TransferInput {
  fromId: number
  toId: number
  amountCents: number
  uid: number
}

class InsufficientFundsError extends Error {}
class InvalidDestinationError extends Error {}

export function transfer(db: Database.Database, input: TransferInput): TransferResult {
  const { fromId, toId, amountCents, uid } = input

  if (!getAccountForUser(db, fromId, uid)) {
    return { ok: false, reason: 'not_owner' }
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, reason: 'invalid_amount' }
  }

  // A self-transfer is a net-zero balance change that still writes a
  // 'completed' transfer row plus two offsetting transaction rows -- pure
  // ledger noise with no effect, so it's rejected the same as any other
  // invalid destination.
  if (fromId === toId) {
    return { ok: false, reason: 'invalid_destination' }
  }

  const debitStmt = db.prepare(
    'UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?',
  )
  const creditStmt = db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?')
  const insertTransfer = db.prepare(
    "INSERT INTO transfers (from_account_id, to_account_id, amount_cents, status) VALUES (?, ?, ?, 'completed')",
  )
  const insertTransaction = db.prepare(
    'INSERT INTO transactions (account_id, counterparty, memo, amount_cents) VALUES (?, ?, ?, ?)',
  )

  const run = db.transaction(() => {
    const debited = debitStmt.run(amountCents, fromId, amountCents)
    if (debited.changes === 0) throw new InsufficientFundsError()

    // The credit must actually land on a real row -- otherwise a transfer to a
    // nonexistent account would debit the source, still insert a 'completed'
    // transfer row, and the money would simply vanish.
    const credited = creditStmt.run(amountCents, toId)
    if (credited.changes === 0) throw new InvalidDestinationError()

    const { lastInsertRowid } = insertTransfer.run(fromId, toId, amountCents)
    insertTransaction.run(fromId, 'Transfer', 'Transfer out', -amountCents)
    insertTransaction.run(toId, 'Transfer', 'Transfer in', amountCents)
    return Number(lastInsertRowid)
  })

  try {
    return { ok: true, transferId: run() }
  } catch (err) {
    if (err instanceof InsufficientFundsError) return { ok: false, reason: 'insufficient_funds' }
    if (err instanceof InvalidDestinationError) return { ok: false, reason: 'invalid_destination' }
    throw err
  }
}
