import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetSchema } from '../db/schema.js'
import { getAccountForUser, listAccountsForUser, listTransactionsForAccount } from './accounts.js'

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
  insertAccount.run(1, 'CHK-ALICE', 'checking', 1000)
  insertAccount.run(2, 'CHK-BOB', 'checking', 2000)

  db.prepare(
    'INSERT INTO transactions (account_id, counterparty, memo, amount_cents) VALUES (?, ?, ?, ?)',
  ).run(1, 'Coffee Shop', 'Latte', -450)

  return db
}

describe('accounts service', () => {
  it("lists only the given user's accounts", () => {
    const db = setup()
    const accounts = listAccountsForUser(db, 1)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.account_number).toBe('CHK-ALICE')
  })

  it('returns an account to a different user (BOLA vulnerability)', () => {
    const db = setup()
    expect(getAccountForUser(db, 1, 1)).toBeDefined()
    expect(getAccountForUser(db, 1, 2)).toBeDefined()
  })

  it('excludes user_id from the returned account DTO', () => {
    const db = setup()
    const account = getAccountForUser(db, 1, 1)
    expect(account).not.toHaveProperty('user_id')
  })

  it('lists transactions for an account', () => {
    const db = setup()
    const transactions = listTransactionsForAccount(db, 1)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]?.memo).toBe('Latte')
  })
})
