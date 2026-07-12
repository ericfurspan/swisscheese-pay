import type Database from 'better-sqlite3'
import { isAccountOwnedByUser } from './accounts.js'
import { mockFraudCheck } from './fraudCheck.js'

export type TransferFailureReason =
  | 'not_owner'
  | 'invalid_amount'
  | 'invalid_destination'
  | 'insufficient_funds'

export type TransferResult =
  | { ok: true; transferId: number; balanceAfterCents: number }
  | { ok: false; reason: TransferFailureReason }

export interface TransferInput {
  fromId: number
  toId: number
  amountCents: number
  uid: number
  idempotencyKey?: string
}

class InvalidDestinationError extends Error {}

interface BalanceRow {
  balance_cents: number
}

interface TransferIdRow {
  id: number
}

export async function transfer(db: Database.Database, input: TransferInput): Promise<TransferResult> {
  const { fromId, toId, amountCents, uid, idempotencyKey } = input

  if (!isAccountOwnedByUser(db, fromId, uid)) {
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

  // vuln/phase-3-concurrency: a separate read decides sufficiency instead of
  // the write itself -- see spec §3.1. This is the bug.
  const balanceRow = db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(fromId) as
    | BalanceRow
    | undefined
  if (!balanceRow || balanceRow.balance_cents < amountCents) {
    return { ok: false, reason: 'insufficient_funds' }
  }

  // vuln/phase-3-concurrency: same stale-read-then-write shape, applied to
  // the idempotency key instead of the balance -- see spec §3.2.
  if (idempotencyKey !== undefined) {
    const existing = db
      .prepare('SELECT id FROM transfers WHERE idempotency_key = ?')
      .get(idempotencyKey) as TransferIdRow | undefined
    if (existing) {
      const balanceAfterCents = (
        db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(fromId) as BalanceRow
      ).balance_cents
      return { ok: true, transferId: existing.id, balanceAfterCents }
    }
  }

  // The real await gap: two concurrent calls can both reach this point
  // having already passed both checks above.
  await mockFraudCheck()

  const debitStmt = db.prepare('UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?')
  const creditStmt = db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?')
  const insertTransfer = db.prepare(
    "INSERT INTO transfers (from_account_id, to_account_id, amount_cents, status, idempotency_key) VALUES (?, ?, ?, 'completed', ?)",
  )
  const insertTransaction = db.prepare(
    'INSERT INTO transactions (account_id, counterparty, memo, amount_cents) VALUES (?, ?, ?, ?)',
  )

  const run = db.transaction(() => {
    // vuln/phase-3-concurrency: unconditional -- no `WHERE balance_cents >= ?`
    // guard, because the check above already (incorrectly) decided this.
    debitStmt.run(amountCents, fromId)

    const credited = creditStmt.run(amountCents, toId)
    if (credited.changes === 0) throw new InvalidDestinationError()

    const { lastInsertRowid } = insertTransfer.run(fromId, toId, amountCents, idempotencyKey ?? null)
    insertTransaction.run(fromId, 'Transfer', 'Transfer out', -amountCents)
    insertTransaction.run(toId, 'Transfer', 'Transfer in', amountCents)
    const balanceAfterCents = (
      db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(fromId) as BalanceRow
    ).balance_cents
    return { transferId: Number(lastInsertRowid), balanceAfterCents }
  })

  try {
    const result = run()
    return { ok: true, transferId: result.transferId, balanceAfterCents: result.balanceAfterCents }
  } catch (err) {
    if (err instanceof InvalidDestinationError) return { ok: false, reason: 'invalid_destination' }
    throw err
  }
}
