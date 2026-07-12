import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { logSecurity } from '../log/security.js'
import { requireAuth, SESSION_COOKIE } from '../middleware/requireAuth.js'

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
    .get(req.user!.uid) as ProfileRow | undefined

  // A validly-signed token can outlive its user row (e.g. the DB reseeds on
  // every container boot while a still-unexpired cookie from a prior boot is
  // presented) -- treat that the same as no session at all.
  if (!row) {
    res.clearCookie(SESSION_COOKIE)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  res.status(200).json({ id: row.id, email: row.email, full_name: row.full_name, ssn: maskSsn(row.ssn) })
})

// No user id is accepted from the request -- the update always targets the
// authenticated caller's own row, so there's nothing here to guard against
// targeting another user.
profileRouter.patch('/', (req, res) => {
  const { full_name: fullName, role } = req.body ?? {}
  if (typeof fullName !== 'string' || fullName.trim() === '') {
    res.status(400).json({ error: 'full_name is required' })
    return
  }

  const db = getDb()
  const changedFields = ['full_name']
  let changes: number
  if (role !== undefined) {
    changedFields.push('role')
    changes = db
      .prepare('UPDATE users SET full_name = ?, role = ? WHERE id = ?')
      .run(fullName, role, req.user!.uid).changes
  } else {
    changes = db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, req.user!.uid).changes
  }

  // See the GET handler above: a validly-signed token can outlive its user
  // row. Without this check a stale session would get a 200 claiming the
  // update succeeded when no row was actually touched.
  if (changes === 0) {
    res.clearCookie(SESSION_COOKIE)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  logSecurity({
    event: 'profile.update',
    actor_user_id: req.user!.uid,
    target: `user:${req.user!.uid}`,
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
    detail: { changed_fields: changedFields },
  })

  res.status(200).json({ id: req.user!.uid, full_name: fullName })
})
