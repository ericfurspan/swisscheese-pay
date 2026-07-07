export type SecurityEvent =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'authz.deny'
  | 'transfer.initiated'
  | 'transfer.completed'
  | 'transfer.failed'
  | 'admin.action'

export interface SecurityLogEntry {
  event: SecurityEvent
  actor_user_id: number | null
  target?: string
  outcome: 'success' | 'failure' | 'denied'
  ip?: string
  request_id?: string
  detail?: Record<string, unknown>
}

export function logSecurity(entry: SecurityLogEntry): void {
  const line = {
    ts: new Date().toISOString(),
    event: entry.event,
    actor_user_id: entry.actor_user_id,
    target: entry.target,
    outcome: entry.outcome,
    ip: entry.ip,
    request_id: entry.request_id,
    ...entry.detail,
  }

  console.log(JSON.stringify(line))
}
