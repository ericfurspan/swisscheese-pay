import type { NextFunction, Request, Response } from 'express'

// Errors like a malformed-JSON body from express.json() carry a 4xx statusCode
// and are meant to be exposed to the client -- only fall back to a generic 500
// for everything else so we don't leak internals.
function clientStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const { statusCode, expose } = err as { statusCode?: unknown; expose?: unknown }
  if (typeof statusCode !== 'number' || statusCode < 400 || statusCode >= 500) return undefined
  return expose === false ? undefined : statusCode
}

// Express only recognizes this as error-handling middleware because it declares
// all four parameters, regardless of whether each one is used.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err)
    return
  }

  const status = clientStatus(err)
  if (status !== undefined) {
    res.status(status).json({ error: 'Bad Request' })
    return
  }

  console.error(err)
  res.status(500).json({ error: 'Internal Server Error' })
}
