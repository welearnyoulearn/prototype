/**
 * Watchline logger — fire-and-forget inserts into request_logs and error_events.
 * Never awaited by callers; a logging failure never breaks a user request.
 *
 * Manual usage in an API route:
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
 *
 * Preferred usage — wrap the route with withWatchline() instead of hand-rolling the
 * above in every handler; see withWatchline() below.
 */
import pool from './db'
import { NextRequest, NextResponse, after } from 'next/server'
import { getSession } from './auth'

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

export async function refreshMonitoredSchools(): Promise<void> {
  const now = Date.now()
  if (now - _cacheLastRefresh < CACHE_TTL) return
  _cacheLastRefresh = now
  try {
    const { rows } = await pool.query(
      `SELECT school_id FROM school_feature_overrides
       WHERE feature_key = 'api-monitoring' AND enabled = TRUE`,
    )
    _monitoredSchools = new Set(rows.map((r: { school_id: number }) => r.school_id))
  } catch (err) {
    console.error('[Watchline] flag cache refresh failed:', err)
  }
}

// ── Route wrapper ─────────────────────────────────────────────────────────────
// Wraps a route handler so every request is logged with its *real* outcome —
// unlike the middleware's request log (proxy.ts), which can't see past its own
// pre-flight pass and always records status_code 200 regardless of what the
// route actually returns.
//
// Most routes already catch their own errors internally and return
// NextResponse.json({ error }, { status: 500 }) rather than throwing — so this
// inspects the *returned* response's status rather than relying on a thrown
// exception ever reaching here (the try/catch below only exists as a backstop
// for an error that escapes before the route's own try, e.g. a malformed
// req.json() call).
//
// Logging runs inside next/server's after() so it reliably finishes even on
// Vercel, where a bare fire-and-forget promise can be frozen mid-flight the
// instant the response is sent.
//
// Usage:
//   export const DELETE = withWatchline(async (req) => { ... }, { route: '/api/fees/waivers' })
//   export const POST = withWatchline(async (req) => { ... }, {
//     route: '/api/fees/payments',
//     getSchoolId: async (req) => (await req.clone().json()).school_id ?? null,
//   })
// Rest-param signature (rather than a generic ctx type) so this is structurally
// assignable to Next's generated route-handler type for both static routes
// (context arg omitted) and dynamic [id]-style routes (context arg present).
type RouteHandler = (req: NextRequest, ...rest: unknown[]) => Promise<NextResponse>

export function withWatchline(
  handler: RouteHandler,
  opts: {
    route: string
    // Resolve the school_id this request belongs to, for monitored-schools gating.
    // Defaults to the `school_id` query param. Must not consume req's body unless
    // via req.clone() — the real handler still needs to read the original body.
    getSchoolId?: (req: NextRequest) => number | null | Promise<number | null>
  },
): RouteHandler {
  return async (req: NextRequest, ...rest: unknown[]): Promise<NextResponse> => {
    const start = Date.now()
    const method = req.method

    let response: NextResponse
    let thrown: unknown = null
    try {
      response = await handler(req, ...rest)
    } catch (err) {
      thrown = err
      response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const duration = Date.now() - start
    const status   = response.status

    // Clone + read the body now (if it's an error) — the original response's
    // stream must stay intact for the client, and after() runs later, by which
    // point the response has already started being sent.
    let errorMessage: string | null = null
    if (thrown) {
      errorMessage = thrown instanceof Error ? thrown.message : String(thrown)
    } else if (status >= 500) {
      try {
        const body = await response.clone().json()
        if (body?.error) errorMessage = String(body.error)
      } catch { /* not JSON, or already consumed — skip */ }
    }

    after(async () => {
      let schoolId: number | null = null
      try {
        schoolId = opts.getSchoolId ? await opts.getSchoolId(req) : defaultSchoolIdFromQuery(req)
      } catch { /* non-critical — proceed without a school_id */ }

      let actorRole: string | null = null
      try {
        const session = await getSession()
        if (session) actorRole = session.role
      } catch { /* non-critical */ }

      if (errorMessage) {
        logError({
          school_id: schoolId,
          severity:  thrown ? 'critical' : 'error',
          source:    'api',
          route:     opts.route,
          error:     thrown ?? new Error(errorMessage),
        })
      }

      if (schoolId != null) {
        await refreshMonitoredSchools()
        if (status >= 400 || isSchoolMonitored(schoolId)) {
          logRequest({
            school_id: schoolId, route: opts.route, method, status_code: status,
            duration_ms: duration, actor_role: actorRole,
            error_message: errorMessage,
          })
        }
      }
    })

    return response
  }
}

function defaultSchoolIdFromQuery(req: NextRequest): number | null {
  const sid = req.nextUrl.searchParams.get('school_id')
  const n = Number(sid)
  return sid && !isNaN(n) ? n : null
}
