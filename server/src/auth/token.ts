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
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof decoded === 'string') return null
    const { uid, role } = decoded as jwt.JwtPayload & Partial<TokenPayload>
    if (typeof uid !== 'number' || typeof role !== 'string') return null
    return { uid, role }
  } catch {
    return null
  }
}
