import type { NextFunction, Request, Response } from 'express'

// Express only recognizes this as error-handling middleware because it declares
// all four parameters, regardless of whether each one is used.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err)
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal Server Error' })
}
