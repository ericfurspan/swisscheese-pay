import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const profileRouter = Router()

profileRouter.use(requireAuth)

interface ProfileRow {
  id: number
  email: string
  full_name: string
  ssn: string
}

function maskSsn(ssn: string): string {
  return `***-**-${ssn.slice(-4)}`
}

profileRouter.get('/', (req, res) => {
  const db = getDb()
  const row = db
    .prepare('SELECT id, email, full_name, ssn FROM users WHERE id = ?')
    .get(req.user!.uid) as ProfileRow

  res.status(200).json({ id: row.id, email: row.email, full_name: row.full_name, ssn: maskSsn(row.ssn) })
})

// No user id is accepted from the request -- the update always targets the
// authenticated caller's own row, so there's nothing here to guard against
// targeting another user.
profileRouter.patch('/', (req, res) => {
  const { full_name: fullName } = req.body ?? {}
  if (typeof fullName !== 'string' || fullName.trim() === '') {
    res.status(400).json({ error: 'full_name is required' })
    return
  }

  const db = getDb()
  db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, req.user!.uid)
  res.status(200).json({ id: req.user!.uid, full_name: fullName })
})
