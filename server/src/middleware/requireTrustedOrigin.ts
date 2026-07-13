import type { NextFunction, Request, Response } from 'express'
import { isTrustedOrigin } from '../security/trustedOrigins.js'

// Principled defense-in-depth against forged state-changing requests,
// independent of body-parser/content-type specifics (fix/phase-5-csrf).
// Mounted globally, before all routers -- not inside requireAuth, since
// requireAuth alone would miss /logout (outside it, in authRouter) and
// login-CSRF.
//
// Requests with NO Origin header at all are allowed through: browsers
// always set Origin on cross-origin and same-site-cross-origin
// state-changing requests, but Node-based scripts and this project's own
// Phase 1-4 exploit/test tooling typically don't set one -- rejecting
// those would be a false positive, not a real defense.
export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD') {
    next()
    return
  }

  const origin = req.get('Origin')
  if (origin != null && !isTrustedOrigin(origin)) {
    res.status(403).json({ error: 'Origin not trusted for this request' })
    return
  }

  next()
}
