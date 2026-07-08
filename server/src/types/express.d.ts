import 'express'

declare module 'express-serve-static-core' {
  interface Request {
    id: string
    user?: { uid: number; role: string }
  }
}
