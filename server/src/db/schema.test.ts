import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetSchema } from './schema.js'

function tableNames(db: Database.Database): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => (row as { name: string }).name)
}

describe('resetSchema', () => {
  it('creates all five tables, each empty', () => {
    const db = new Database(':memory:')

    resetSchema(db)

    expect(tableNames(db)).toEqual([
      'accounts',
      'payment_links',
      'transactions',
      'transfers',
      'users',
    ])

    for (const table of tableNames(db)) {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as {
        count: number
      }
      expect(row.count).toBe(0)
    }
  })

  it('is idempotent (safe to call repeatedly)', () => {
    const db = new Database(':memory:')

    resetSchema(db)
    resetSchema(db)

    expect(tableNames(db)).toEqual([
      'accounts',
      'payment_links',
      'transactions',
      'transfers',
      'users',
    ])
  })
})
