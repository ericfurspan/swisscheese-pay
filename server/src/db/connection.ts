import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

let db: Database.Database | undefined

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = process.env.DB_PATH ?? './data/app.sqlite'
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
