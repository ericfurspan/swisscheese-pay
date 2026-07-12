import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

// No fallback: a committed default secret is forgeable by anyone with repo access,
// and env-based gating (e.g. only requiring it when NODE_ENV=production) drifts out
// of sync with however the app actually gets deployed. JWT_SECRET is always required;
// local dev/test convenience is provided by tooling (see server/package.json "dev"
// script, and vitest.config.ts for tests), never by a literal in this file.
function requireSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET must be set')
  return secret
}

const JWT_SECRET = requireSecret()

export interface TokenPayload {
  uid: number
  role: string
  jti: string
}

export interface SignedToken {
  token: string
  jti: string
}

export function signToken(payload: { uid: number; role: string }): SignedToken {
  const jti = randomUUID()
  const token = jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: '1h' })
  return { token, jti }
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof decoded === 'string') return null
    const { uid, role, jti } = decoded as jwt.JwtPayload & Partial<TokenPayload>
    if (typeof uid !== 'number' || typeof role !== 'string' || typeof jti !== 'string') return null
    return { uid, role, jti }
  } catch {
    return null
  }
}
