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
  return (
    db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').get(accountId) as AccountRow
  ).balance_cents
}

describe('transfer', () => {
  it('moves money between accounts and records a completed transfer', async () => {
    const db = setup()
    const result = await transfer(db, { fromId: 1, toId: 2, amountCents: 1_000, uid: 1 })

    expect(result).toMatchObject({ ok: true, balanceAfterCents: 9_000 })
    expect(balanceOf(db, 1)).toBe(9_000)
    expect(balanceOf(db, 2)).toBe(6_000)

    const row = db.prepare('SELECT * FROM transfers').get() as {
      status: string
      amount_cents: number
    }
    expect(row).toMatchObject({ status: 'completed', amount_cents: 1_000 })
  })

  it('rejects a transfer from an account the caller does not own, balances unchanged', async () => {
    const db = setup()
    const result = await transfer(db, { fromId: 1, toId: 2, amountCents: 1_000, uid: 2 })

    expect(result).toEqual({ ok: false, reason: 'not_owner' })
    expect(balanceOf(db, 1)).toBe(10_000)
    expect(balanceOf(db, 2)).toBe(5_000)
  })

  it('still rejects a non-integer amount', async () => {
    const db = setup()
    expect(await transfer(db, { fromId: 1, toId: 2, amountCents: 10.5, uid: 1 })).toEqual({
      ok: false,
      reason: 'invalid_amount',
    })
  })

  it('reverses balances for a negative amount (negative-amount vulnerability)', async () => {
    const db = setup()
    const result = await transfer(db, { fromId: 1, toId: 2, amountCents: -1_000, uid: 1 })

    expect(result).toMatchObject({ ok: true, balanceAfterCents: 11_000 })
    expect(balanceOf(db, 1)).toBe(11_000)
    expect(balanceOf(db, 2)).toBe(4_000)
  })

  it('rejects an overdraft, leaving balances unchanged (single request)', async () => {
    const db = setup()
    const result = await transfer(db, { fromId: 1, toId: 2, amountCents: 999_999, uid: 1 })

    expect(result).toEqual({ ok: false, reason: 'insufficient_funds' })
    expect(balanceOf(db, 1)).toBe(10_000)
    expect(balanceOf(db, 2)).toBe(5_000)
  })

  it('rejects a transfer to a nonexistent account, leaving the source balance unchanged', async () => {
    const db = setup()
    const result = await transfer(db, { fromId: 1, toId: 999, amountCents: 1_000, uid: 1 })

    expect(result).toEqual({ ok: false, reason: 'invalid_destination' })
    expect(balanceOf(db, 1)).toBe(10_000)
  })

  it('rejects a transfer to the same account', async () => {
    const db = setup()
    const result = await transfer(db, { fromId: 1, toId: 1, amountCents: 1_000, uid: 1 })

    expect(result).toEqual({ ok: false, reason: 'invalid_destination' })
    expect(balanceOf(db, 1)).toBe(10_000)
  })

  it('allows several concurrent overdrawing transfers (race vulnerability)', async () => {
    const db = setup()
    const results = await Promise.all([
      transfer(db, { fromId: 1, toId: 2, amountCents: 6_000, uid: 1 }),
      transfer(db, { fromId: 1, toId: 2, amountCents: 6_000, uid: 1 }),
      transfer(db, { fromId: 1, toId: 2, amountCents: 6_000, uid: 1 }),
    ])

    const succeeded = results.filter((r) => r.ok)
    expect(succeeded.length).toBe(3)
    expect(balanceOf(db, 1)).toBe(-8_000)
  })

  it('executes a concurrently replayed idempotency key twice', async () => {
    const db = setup()
    const key = 'race-key-1'
    const results = await Promise.all([
      transfer(db, { fromId: 1, toId: 2, amountCents: 100, uid: 1, idempotencyKey: key }),
      transfer(db, { fromId: 1, toId: 2, amountCents: 100, uid: 1, idempotencyKey: key }),
    ])

    const transferIds = new Set(
      results.filter((r) => r.ok).map((r) => (r as { transferId: number }).transferId),
    )
    expect(transferIds.size).toBe(2)
    expect(balanceOf(db, 1)).toBe(10_000 - 200)
  })

  it('silently replays a mismatched idempotency-key request', async () => {
    const db = setup()
    const key = 'reused-key-1'

    const first = await transfer(db, {
      fromId: 1,
      toId: 2,
      amountCents: 100,
      uid: 1,
      idempotencyKey: key,
    })
    expect(first.ok).toBe(true)

    // Same key, different amount is incorrectly treated as the same request.
    const second = await transfer(db, {
      fromId: 1,
      toId: 2,
      amountCents: 200,
      uid: 1,
      idempotencyKey: key,
    })

    expect(second).toEqual(first)
    expect(balanceOf(db, 1)).toBe(10_000 - 100)
  })

  it('returns the original result for an exact retry with the same idempotency key', async () => {
    const db = setup()
    const key = 'exact-retry-key'

    const first = await transfer(db, {
      fromId: 1,
      toId: 2,
      amountCents: 150,
      uid: 1,
      idempotencyKey: key,
    })
    const second = await transfer(db, {
      fromId: 1,
      toId: 2,
      amountCents: 150,
      uid: 1,
      idempotencyKey: key,
    })

    expect(first.ok).toBe(true)
    expect(second).toEqual(first)
  })

  it('returns another user transfer id when a different user reuses their key', async () => {
    const db = setup()
    const key = 'cross-user-key'

    // setup() seeds account 1 (CHK-ALICE) owned by uid 1, account 2 (CHK-BOB) owned by uid 2.
    const victim = await transfer(db, {
      fromId: 1,
      toId: 2,
      amountCents: 500,
      uid: 1,
      idempotencyKey: key,
    })
    expect(victim.ok).toBe(true)

    // Bob (uid 2) owns account 2 -- passes the ownership gate for his own fromId,
    // then reuses Alice's idempotency key with a mismatched payload.
    const attacker = await transfer(db, {
      fromId: 2,
      toId: 1,
      amountCents: 500,
      uid: 2,
      idempotencyKey: key,
    })

    expect(attacker).toMatchObject({ ok: true })
    expect(attacker).toHaveProperty('transferId', (victim as { transferId: number }).transferId)
  })
})
