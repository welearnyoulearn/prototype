import pool from '@/lib/db'

export const REQUEST_LOG_LIMIT = 100_000
export const ERROR_EVENT_LIMIT = 10_000

const WARN_RATIO     = 0.8
const CRITICAL_RATIO = 0.95

export type WatchlineHealth = {
  request_logs: { count: number; limit: number; pct: number; status: 'ok' | 'warn' | 'critical' }
  error_events: { count: number; limit: number; pct: number; status: 'ok' | 'warn' | 'critical' }
  overall:      'ok' | 'warn' | 'critical'
  checked_at:   string
}

function classify(count: number, limit: number): 'ok' | 'warn' | 'critical' {
  const r = count / limit
  if (r >= CRITICAL_RATIO) return 'critical'
  if (r >= WARN_RATIO)     return 'warn'
  return 'ok'
}

export async function buildHealth(): Promise<WatchlineHealth> {
  const [r1, r2] = await Promise.all([
    pool.query('SELECT COUNT(*) AS n FROM request_logs'),
    pool.query('SELECT COUNT(*) AS n FROM error_events'),
  ])
  const rlCount = Number(r1.rows[0].n)
  const eeCount = Number(r2.rows[0].n)

  const rlStatus = classify(rlCount, REQUEST_LOG_LIMIT)
  const eeStatus = classify(eeCount, ERROR_EVENT_LIMIT)

  const overall: WatchlineHealth['overall'] =
    rlStatus === 'critical' || eeStatus === 'critical' ? 'critical'
    : rlStatus === 'warn'   || eeStatus === 'warn'     ? 'warn'
    : 'ok'

  return {
    request_logs: { count: rlCount, limit: REQUEST_LOG_LIMIT, pct: Math.round((rlCount / REQUEST_LOG_LIMIT) * 100), status: rlStatus },
    error_events: { count: eeCount, limit: ERROR_EVENT_LIMIT, pct: Math.round((eeCount / ERROR_EVENT_LIMIT) * 100), status: eeStatus },
    overall,
    checked_at: new Date().toISOString(),
  }
}
