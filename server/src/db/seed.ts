import bcrypt from 'bcryptjs'
import type Database from 'better-sqlite3'

const SEED_PASSWORD_HASH = bcrypt.hashSync('Password123!', 10)

interface SeedUser {
  email: string
  fullName: string
  ssn: string
  role: 'customer' | 'admin'
}

const USERS: SeedUser[] = [
  { email: 'alice@scpay.test', fullName: 'Alice Anderson', ssn: '123-45-6789', role: 'customer' },
  { email: 'bob@scpay.test', fullName: 'Bob Brown', ssn: '987-65-4321', role: 'customer' },
  { email: 'admin@scpay.test', fullName: 'Ada Admin', ssn: '111-22-3333', role: 'admin' },
]

export function seed(db: Database.Database): void {
  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, full_name, ssn, role) VALUES (?, ?, ?, ?, ?)`,
  )
  const insertAccount = db.prepare(
    `INSERT INTO accounts (user_id, account_number, type, balance_cents) VALUES (?, ?, ?, ?)`,
  )
  const insertTransaction = db.prepare(
    `INSERT INTO transactions (account_id, counterparty, memo, amount_cents) VALUES (?, ?, ?, ?)`,
  )

  const run = db.transaction(() => {
    const userIds: Record<string, number> = {}
    for (const user of USERS) {
      const { lastInsertRowid } = insertUser.run(
        user.email,
        SEED_PASSWORD_HASH,
        user.fullName,
        user.ssn,
        user.role,
      )
      userIds[user.email] = Number(lastInsertRowid)
    }

    const aliceChecking = insertAccount.run(
      userIds['alice@scpay.test'],
      'CHK-1001',
      'checking',
      100_000,
    ).lastInsertRowid as number
    const aliceSavings = insertAccount.run(
      userIds['alice@scpay.test'],
      'SAV-1002',
      'savings',
      500_000,
    ).lastInsertRowid as number
    const bobChecking = insertAccount.run(userIds['bob@scpay.test'], 'CHK-2001', 'checking', 25_000)
      .lastInsertRowid as number

    insertTransaction.run(aliceChecking, 'Coffee Shop', 'Morning coffee', -450)
    insertTransaction.run(aliceChecking, 'Employer Inc', 'Payroll deposit', 250_000)
    insertTransaction.run(aliceSavings, 'Alice Checking', 'Transfer to savings', 50_000)
    insertTransaction.run(bobChecking, 'Grocery Store', 'Weekly groceries', -6_000)
    insertTransaction.run(bobChecking, 'Employer Inc', 'Payroll deposit', 100_000)
  })

  run()
}
