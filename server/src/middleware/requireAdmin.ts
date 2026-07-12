import type { NextFunction, Request, Response } from 'express'
import { logSecurity } from '../log/security.js'

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    logSecurity({
      event: 'authz.deny',
      actor_user_id: req.user?.uid ?? null,
      target: 'admin:users:list',
      outcome: 'denied',
      request_id: req.id,
      ip: req.ip,
    })
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
