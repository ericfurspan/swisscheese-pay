import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { asyncHandler } from './asyncHandler.js'
import { errorHandler } from './errorHandler.js'

describe('asyncHandler', () => {
  it('lets a resolved handler respond normally', async () => {
    const app = express()
    app.get(
      '/ok',
      asyncHandler(async (_req, res) => {
        res.status(200).json({ ok: true })
      }),
    )
    app.use(errorHandler)

    const res = await request(app).get('/ok')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('forwards a rejected handler to the error handler instead of hanging', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = express()
    app.get(
      '/boom',
      asyncHandler(async () => {
        throw new Error('boom')
      }),
    )
    app.use(errorHandler)

    const res = await request(app).get('/boom')
    expect(res.status).toBe(500)
    errorSpy.mockRestore()
  })
})
