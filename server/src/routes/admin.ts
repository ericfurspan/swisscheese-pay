import { Router } from 'express'
import { getDb } from '../db/connection.js'
import { logSecurity } from '../log/security.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { maskSsn } from '../services/users.js'

export const adminRouter = Router()

adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)

interface AdminUserRow {
  id: number
  email: string
  full_name: string
  ssn: string
  role: string
  created_at: string
}

adminRouter.get('/users', (req, res) => {
  const db = getDb()
  const rows = db
    .prepare('SELECT id, email, full_name, ssn, role, created_at FROM users ORDER BY id')
    .all() as AdminUserRow[]
  const dto = rows.map((row) => ({ ...row, ssn: maskSsn(row.ssn) }))

  logSecurity({
    event: 'admin.action',
    actor_user_id: req.user!.uid,
    target: 'admin:users:list',
    outcome: 'success',
    request_id: req.id,
    ip: req.ip,
    detail: { action: 'list_users', row_count: dto.length },
  })

  res.status(200).json(dto)
})
