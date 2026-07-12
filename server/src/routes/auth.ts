import { randomInt } from 'node:crypto'
import { Router } from 'express'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { signToken, verifyToken } from '../auth/token.js'
import { getDb } from '../db/connection.js'
import { logSecurity } from '../log/security.js'
import { SESSION_COOKIE } from '../middleware/requireAuth.js'

interface UserRow {
  id: number
  password_hash: string
  role: string
}

// Registration doesn't collect an SSN (out of scope for this endpoint), but the
// schema requires one -- generate a fabricated placeholder, consistent with this
// project's seed data being entirely fake PII.
function fabricatedSsn(): string {
  const part = (digits: number) => String(randomInt(0, 10 ** digits)).padStart(digits, '0')
  return `${part(3)}-${part(2)}-${part(4)}`
}

// Compared against when no user is found, so login always pays the cost of one
// bcrypt compare -- otherwise a nonexistent email short-circuits before hashing
// and response latency alone discloses which emails are registered.
const DUMMY_PASSWORD_HASH = hashPassword('sc-pay-timing-guard-dummy-password')

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // Not `secure: true` -- this app is served over plain HTTP on loopback by design
  // (see spec's single-origin/loopback-only constraint), so a secure-only cookie
  // would never be sent at all.
  maxAge: 60 * 60 * 1000,
}

export const authRouter = Router()

const MIN_PASSWORD_LENGTH = 8

authRouter.post('/register', (req, res) => {
  const { email, password, full_name: fullName } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string' || typeof fullName !== 'string') {
    res.status(400).json({ error: 'email, password, and full_name are required' })
    return
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` })
    return
  }

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const passwordHash = hashPassword(password)
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO users (email, password_hash, full_name, ssn, role) VALUES (?, ?, ?, ?, ?)',
    )
    .run(email, passwordHash, fullName, fabricatedSsn(), 'customer')

  const uid = Number(lastInsertRowid)
  const { token, jti } = signToken({ uid, role: 'customer' })
  res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
  logSecurity({
    event: 'auth.register',
    actor_user_id: uid,
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
    detail: { jti, role: 'customer' },
  })
  res.status(201).json({ id: uid, email, full_name: fullName })
})

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body ?? {}
  const db = getDb()
  const user =
    typeof email === 'string'
      ? (db.prepare('SELECT id, password_hash, role FROM users WHERE email = ?').get(email) as
          UserRow | undefined)
      : undefined

  const passwordMatches = verifyPassword(
    typeof password === 'string' ? password : '',
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  )

  if (!user || !passwordMatches) {
    logSecurity({
      event: 'auth.login.failure',
      actor_user_id: null,
      outcome: 'failure',
      target: typeof email === 'string' ? email : undefined,
      request_id: req.id,
      ip: req.ip,
    })
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const { token, jti } = signToken({ uid: user.id, role: user.role })
  res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
  logSecurity({
    event: 'auth.login.success',
    actor_user_id: user.id,
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
    detail: { jti, role: user.role },
  })
  res.status(200).json({ id: user.id, email })
})

authRouter.post('/logout', (req, res) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE]
  const payload = typeof token === 'string' ? verifyToken(token) : null

  res.clearCookie(SESSION_COOKIE)
  logSecurity({
    event: 'auth.logout',
    actor_user_id: payload?.uid ?? null,
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
  })
  res.status(204).end()
})
