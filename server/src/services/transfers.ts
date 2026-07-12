import type Database from 'better-sqlite3'
import { isAccountOwnedByUser } from './accounts.js'
import { mockFraudCheck } from './fraudCheck.js'

export type TransferFailureReason =
  'not_owner' | 'invalid_amount' | 'invalid_destination' | 'insufficient_funds'

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

class InsufficientFundsError extends Error {}
class InvalidDestinationError extends Error {}

interface BalanceRow {
  balance_cents: number
}

interface TransferIdRow {
  id: number
}

export async function transfer(
  db: Database.Database,
  input: TransferInput,
): Promise<TransferResult> {
  const { fromId, toId, amountCents, uid, idempotencyKey } = input

  if (!isAccountOwnedByUser(db, fromId, uid)) {
    return { ok: false, reason: 'not_owner' }
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, reason: 'invalid_amount' }
  }

  if (fromId === toId) {
    return { ok: false, reason: 'invalid_destination' }
  }

  // fix/phase-3-concurrency: the fraud check still runs (it's a realistic
  // feature) but nothing about correctness depends on what happened before
  // or during it -- the synchronous transaction below is the sole authority
  // on both the idempotency key and the balance, evaluated only at write time.
  await mockFraudCheck()

  const debitStmt = db.prepare(
    'UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?',
  )
  const creditStmt = db.prepare(
    'UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?',
  )
  const insertTransfer = db.prepare(
    "INSERT INTO transfers (from_account_id, to_account_id, amount_cents, status, idempotency_key) VALUES (?, ?, ?, 'completed', ?)",
  )
  const insertTransaction = db.prepare(
    'INSERT INTO transactions (account_id, counterparty, memo, amount_cents) VALUES (?, ?, ?, ?)',
  )
  const balanceStmt = db.prepare('SELECT balance_cents FROM accounts WHERE id = ?')

  const run = db.transaction(() => {
    if (idempotencyKey !== undefined) {
      const existing = db
        .prepare('SELECT id FROM transfers WHERE idempotency_key = ?')
        .get(idempotencyKey) as TransferIdRow | undefined
      if (existing) {
        const balanceAfterCents = (balanceStmt.get(fromId) as BalanceRow).balance_cents
        return { transferId: existing.id, balanceAfterCents }
      }
    }

    const debited = debitStmt.run(amountCents, fromId, amountCents)
    if (debited.changes === 0) throw new InsufficientFundsError()

    const credited = creditStmt.run(amountCents, toId)
    if (credited.changes === 0) throw new InvalidDestinationError()

    const { lastInsertRowid } = insertTransfer.run(
      fromId,
      toId,
      amountCents,
      idempotencyKey ?? null,
    )
    insertTransaction.run(fromId, 'Transfer', 'Transfer out', -amountCents)
    insertTransaction.run(toId, 'Transfer', 'Transfer in', amountCents)
    const balanceAfterCents = (balanceStmt.get(fromId) as BalanceRow).balance_cents
    return { transferId: Number(lastInsertRowid), balanceAfterCents }
  })

  try {
    const result = run()
    return { ok: true, transferId: result.transferId, balanceAfterCents: result.balanceAfterCents }
  } catch (err) {
    if (err instanceof InsufficientFundsError) return { ok: false, reason: 'insufficient_funds' }
    if (err instanceof InvalidDestinationError) return { ok: false, reason: 'invalid_destination' }
    throw err
  }
}
