import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const adminRouter = Router()

adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)

adminRouter.get('/users', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all()
  res.status(200).json(rows)
})
