import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { hashPassword } from '../auth/password.js'
import { resetSchema } from './schema.js'
import { seed } from './seed.js'

interface UserRow {
  id: number
  email: string
  role: string
}

interface AccountRow {
  id: number
  user_id: number
  balance_cents: number
  type: string
}

function setup(): Database.Database {
  const db = new Database(':memory:')
  resetSchema(db)
  seed(db)
  return db
}

describe('seed', () => {
  it('inserts exactly 3 users', () => {
    const db = setup()
    const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number
    }
    expect(count).toBe(3)
  })

  it('gives admin@scpay.test the admin role', () => {
    const db = setup()
    const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@scpay.test') as
      UserRow | undefined
    expect(admin?.role).toBe('admin')
  })

  it('gives alice exactly 2 accounts', () => {
    const db = setup()
    const alice = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get('alice@scpay.test') as UserRow
    const accounts = db
      .prepare('SELECT * FROM accounts WHERE user_id = ?')
      .all(alice.id) as AccountRow[]
    expect(accounts).toHaveLength(2)
  })

  it("sets bob's checking balance to 25000 cents", () => {
    const db = setup()
    const bob = db.prepare('SELECT * FROM users WHERE email = ?').get('bob@scpay.test') as UserRow
    const checking = db
      .prepare("SELECT * FROM accounts WHERE user_id = ? AND type = 'checking'")
      .get(bob.id) as AccountRow
    expect(checking.balance_cents).toBe(25000)
  })

  it('hashes the seed password at the same cost as hashPassword', () => {
    const db = setup()
    const alice = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get('alice@scpay.test') as UserRow & { password_hash: string }
    const referenceHash = hashPassword('reference')

    expect(alice.password_hash.split('$')[2]).toBe(referenceHash.split('$')[2])
  })

  it('is idempotent after resetSchema (safe to reseed on boot)', () => {
    const db = new Database(':memory:')
    resetSchema(db)
    seed(db)
    resetSchema(db)
    seed(db)

    const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number
    }
    expect(count).toBe(3)
  })
})
