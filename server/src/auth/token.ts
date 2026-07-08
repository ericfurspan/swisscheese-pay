import jwt from 'jsonwebtoken'

// Dev-only default so the app boots without extra setup; production deployments
// must set a real JWT_SECRET.
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-insecure-secret'

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
