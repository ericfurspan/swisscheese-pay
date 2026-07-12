import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../auth/token.js'
import { logSecurity } from '../log/security.js'

export const SESSION_COOKIE = 'sc_session'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[SESSION_COOKIE]
  const payload = typeof token === 'string' ? verifyToken(token) : null

  if (!payload) {
    logSecurity({
      event: 'authz.deny',
      actor_user_id: null,
      outcome: 'denied',
      request_id: req.id,
      ip: req.ip,
    })
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  req.user = payload
  logSecurity({
    event: 'auth.token_used',
    actor_user_id: payload.uid,
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
    detail: { jti: payload.jti },
  })
  next()
}
