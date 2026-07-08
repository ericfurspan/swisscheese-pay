import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetSchema } from '../db/schema.js'
import { transfer } from './transfers.js'

interface AccountRow {
  id: number
  balance_cents: number
}

function setup(): Database.Database {
  const db = new Database(':memory:')
  resetSchema(db)

  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, full_name, ssn, role) VALUES (?, ?, ?, ?, ?)',
  )
  insertUser.run('alice@x.test', 'hash', 'Alice', '111-11-1111', 'customer')
  insertUser.run('bob@x.test', 'hash', 'Bob', '222-22-2222', 'customer')

  const insertAccount = db.prepare(
    'INSERT INTO accounts (user_id, account_number, type, balance_cents) VALUES (?, ?, ?, ?)',
  )
  insertAccount.run(1, 'CHK-ALICE', 'checking', 10_000)
  insertAccount.run(2, 'CHK-BOB', 'checking', 5_000)

  return db
}

function balanceOf(db: Database.Database, accountId: number): number {
  return (db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(accountId) as AccountRow)
    .balance_cents
}

describe('transfer', () => {
  it('moves money between accounts and records a completed transfer', () => {
    const db = setup()
    const result = transfer(db, { fromId: 1, toId: 2, amountCents: 1_000, uid: 1 })

    expect(result).toMatchObject({ ok: true })
    expect(balanceOf(db, 1)).toBe(9_000)
    expect(balanceOf(db, 2)).toBe(6_000)

    const row = db.prepare('SELECT * FROM transfers').get() as { status: string; amount_cents: number }
    expect(row).toMatchObject({ status: 'completed', amount_cents: 1_000 })
  })

  it('rejects a transfer from an account the caller does not own, balances unchanged', () => {
    const db = setup()
    const result = transfer(db, { fromId: 1, toId: 2, amountCents: 1_000, uid: 2 })

    expect(result).toEqual({ ok: false, reason: 'not_owner' })
    expect(balanceOf(db, 1)).toBe(10_000)
    expect(balanceOf(db, 2)).toBe(5_000)
  })

  it('rejects a zero or negative amount', () => {
    const db = setup()
    expect(transfer(db, { fromId: 1, toId: 2, amountCents: 0, uid: 1 })).toEqual({
      ok: false,
      reason: 'invalid_amount',
    })
    expect(transfer(db, { fromId: 1, toId: 2, amountCents: -500, uid: 1 })).toEqual({
      ok: false,
      reason: 'invalid_amount',
    })
  })

  it('rejects an overdraft, leaving balances unchanged (atomic guard)', () => {
    const db = setup()
    const result = transfer(db, { fromId: 1, toId: 2, amountCents: 999_999, uid: 1 })

    expect(result).toEqual({ ok: false, reason: 'insufficient_funds' })
    expect(balanceOf(db, 1)).toBe(10_000)
    expect(balanceOf(db, 2)).toBe(5_000)
  })

  it('rejects a transfer to a nonexistent account, leaving the source balance unchanged', () => {
    const db = setup()
    const result = transfer(db, { fromId: 1, toId: 999, amountCents: 1_000, uid: 1 })

    expect(result).toEqual({ ok: false, reason: 'invalid_destination' })
    expect(balanceOf(db, 1)).toBe(10_000)
  })
})
