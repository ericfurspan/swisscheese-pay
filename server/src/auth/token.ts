import jwt from 'jsonwebtoken'

// Dev-only default so the app boots without extra setup. This value is committed to
// source, so it must never be reachable in production — a missing JWT_SECRET there
// has to fail closed, not silently sign/verify tokens with a publicly known key.
const DEV_DEFAULT_SECRET = 'dev-only-insecure-secret'

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production')
}

const JWT_SECRET = process.env.JWT_SECRET ?? DEV_DEFAULT_SECRET

export interface TokenPayload {
  uid: number
  role: string
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (typeof decoded === 'string') return null
    const { uid, role } = decoded as jwt.JwtPayload & Partial<TokenPayload>
    if (typeof uid !== 'number' || typeof role !== 'string') return null
    return { uid, role }
  } catch {
    return null
  }
}
