import type Database from 'better-sqlite3'

const TABLES = ['transfers', 'transactions', 'payment_links', 'accounts', 'users']

const DDL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  ssn TEXT NOT NULL,                 -- fabricated PII (guarded in Phase 0)
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('checking','savings')),
  balance_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  counterparty TEXT,
  memo TEXT,
  amount_cents INTEGER NOT NULL,     -- signed: negative = debit
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_account_id INTEGER NOT NULL REFERENCES accounts(id),
  to_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,     -- positive
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','failed')),
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE payment_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,         -- public link identifier, not a session credential
  amount_cents INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

export function resetSchema(db: Database.Database): void {
  const dropAll = db.transaction(() => {
    for (const table of TABLES) {
      db.exec(`DROP TABLE IF EXISTS ${table}`)
    }
    db.exec(DDL)
  })
  dropAll()
}
