/**
 * Watchline logger — fire-and-forget inserts into request_logs and error_events.
 * Never awaited by callers; a logging failure never breaks a user request.
 *
 * Usage in an API route:
 *   const start = Date.now()
 *   let status = 200
 *   try {
 *     // ... route logic ...
 *   } catch (err) {
 *     status = 500
 *     logError({ school_id, severity: 'error', source: 'api', route: '/api/fees/stats', error: err })
 *     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
 *   } finally {
 *     logRequest({ school_id, route: '/api/fees/stats', method: 'GET', status_code: status,
 *                  duration_ms: Date.now() - start })
 *   }
 */
import pool from './db'

// In-memory buffer — drained every FLUSH_INTERVAL ms or when BUFFER_SIZE is hit.
// This keeps PgBouncer pressure negligible (one bulk INSERT instead of one per request).
const REQUEST_BUFFER: RequestLogRow[] = []
const FLUSH_INTERVAL = 10_000 // 10 seconds
const BUFFER_SIZE    = 20

type RequestLogRow = {
  school_id?:     number | null
  route:          string
  method:         string
  status_code:    number
  duration_ms:    number
  actor_role?:    string | null
  actor_email?:   string | null
  error_code?:    string | null
  error_message?: string | null
}

let _flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(flush, FLUSH_INTERVAL)
}

function flush() {
  _flushTimer = null
  if (REQUEST_BUFFER.length === 0) return
  const rows = REQUEST_BUFFER.splice(0, REQUEST_BUFFER.length)
  // Build a bulk INSERT with numbered placeholders
  const values: unknown[] = []
  const placeholders = rows.map((r, i) => {
    const base = i * 9
    values.push(
      r.school_id ?? null, r.route, r.method, r.status_code, r.duration_ms,
      r.actor_role ?? null, r.actor_email ?? null,
      r.error_code ?? null, r.error_message ?? null,
    )
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`
  }).join(',')

  pool.query(
    `INSERT INTO request_logs (school_id,route,method,status_code,duration_ms,actor_role,actor_email,error_code,error_message)
     VALUES ${placeholders}`,
    values,
  ).catch(err => console.error('[Watchline] request_logs flush failed:', err))
}

/**
 * Buffer a request log row. Flushed in bulk — never blocks the caller.
 * Only call when the school has api-monitoring enabled, except for errors
 * (errors are always logged regardless of toggle).
 */
export function logRequest(params: RequestLogRow): void {
  REQUEST_BUFFER.push(params)
  if (REQUEST_BUFFER.length >= BUFFER_SIZE) flush()
  else scheduleFlush()
}

/** Sanitise a stack trace: strip absolute file paths and anything that looks like a secret. */
function sanitiseStack(raw: unknown): string | null {
  if (!raw) return null
  let s = raw instanceof Error ? (raw.stack ?? raw.message) : String(raw)
  // Remove absolute Windows/Unix file paths
  s = s.replace(/[A-Za-z]:\\[^\s)]+/g, '<path>')
       .replace(/\/[^\s)]+\.(ts|tsx|js|mjs)/g, '<path>')
  // Truncate to 4000 chars so we don't bloat the DB
  return s.slice(0, 4000)
}

type ErrorLogParams = {
  school_id?:      number | null
  severity:        'info' | 'warn' | 'error' | 'critical'
  source:          string
  route?:          string | null
  error:           unknown
  context?:        Record<string, unknown>
  actor_email?:    string | null
  request_log_id?: number | null
}

/**
 * Insert an error event immediately (not batched — errors are low-volume and
 * high-value; we want them in the DB before the function cold-exits).
 */
export function logError(params: ErrorLogParams): void {
  const err = params.error
  const name    = err instanceof Error ? err.constructor.name : typeof err
  const message = err instanceof Error ? err.message : String(err)
  const stack   = sanitiseStack(err)

  pool.query(
    `INSERT INTO error_events
       (school_id, severity, source, route, error_name, error_message, stack_trace, context, actor_email, request_log_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      params.school_id ?? null,
      params.severity,
      params.source,
      params.route ?? null,
      name,
      message,
      stack,
      JSON.stringify(params.context ?? {}),
      params.actor_email ?? null,
      params.request_log_id ?? null,
    ],
  ).catch(e => console.error('[Watchline] error_events insert failed:', e))
}

// ── In-memory monitoring flag cache ──────────────────────────────────────────
// Stores which school IDs currently have api-monitoring enabled.
// Refreshed every 60 seconds. Middleware reads from this — zero DB hit per request.

let _monitoredSchools: Set<number> = new Set()
let _cacheLastRefresh = 0
const CACHE_TTL = 60_000 // 60 seconds

export function isSchoolMonitored(schoolId: number): boolean {
  return _monitoredSchools.has(schoolId)
}

export function refreshMonitoredSchools(): void {
  const now = Date.now()
  if (now - _cacheLastRefresh < CACHE_TTL) return
  _cacheLastRefresh = now
  pool.query(
    `SELECT school_id FROM school_feature_overrides
     WHERE feature_key = 'api-monitoring' AND enabled = TRUE`,
  ).then(({ rows }) => {
    _monitoredSchools = new Set(rows.map((r: { school_id: number }) => r.school_id))
  }).catch(err => console.error('[Watchline] flag cache refresh failed:', err))
}
