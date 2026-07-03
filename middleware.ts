import { NextRequest, NextResponse } from 'next/server'

// Watchline middleware — intercepts API requests, checks per-school monitoring flag,
// and fires a fire-and-forget log-ingest call for monitored schools.
// Edge runtime: cannot use pg or lib/logger directly — delegates to /api/internal/log-ingest.

// Only run on API routes (not static assets, pages, _next, etc.)
export const config = {
  matcher: ['/api/:path*'],
}

// In-memory flag cache: Set of school IDs with monitoring ON.
// Refreshed every 60 seconds from /api/internal/watchline-flags.
// Starts empty — no monitoring until first refresh completes.
const monitored   = new Set<number>()
let lastRefresh   = 0
const CACHE_TTL   = 60_000

// Routes to skip entirely (internal + static — no value in logging these)
const SKIP_ROUTES = new Set([
  '/api/internal/log-ingest',
  '/api/internal/log-cleanup',
  '/api/internal/watchline-flags',
])

const INGEST_SECRET = process.env.INGEST_SECRET || 'watchline-internal'

async function refreshFlags(origin: string) {
  const now = Date.now()
  if (now - lastRefresh < CACHE_TTL) return
  lastRefresh = now
  try {
    const res = await fetch(`${origin}/api/internal/watchline-flags`, {
      headers: { 'x-ingest-secret': INGEST_SECRET },
    })
    if (res.ok) {
      const { school_ids } = await res.json() as { school_ids: number[] }
      monitored.clear()
      school_ids.forEach(id => monitored.add(id))
    }
  } catch { /* cache stays stale — safe */ }
}

function extractSchoolId(req: NextRequest): number | null {
  // Most API routes include school_id as a query param or in the body.
  // For the middleware we only check query params (body can't be read without consuming it).
  const sid = req.nextUrl.searchParams.get('school_id')
  const n = Number(sid)
  return sid && !isNaN(n) ? n : null
}

function extractActorRole(req: NextRequest): string | null {
  // Infer the actor role from which cookie is present — without decoding the JWT
  // (Edge runtime can't use jsonwebtoken; jose is not installed).
  // This gives us the portal type for the log row, not the email.
  if (req.cookies.get('wlyl_admin_token'))   return 'admin'
  if (req.cookies.get('wlyl_teacher_token')) return 'teacher'
  if (req.cookies.get('wlyl_student_token')) return 'student'
  if (req.cookies.get('wlyl_parent_token'))  return 'parent'
  return null
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // Pass through skipped routes with no instrumentation
  if (SKIP_ROUTES.has(pathname)) return NextResponse.next()

  const origin    = req.nextUrl.origin
  const start     = Date.now()
  const schoolId  = extractSchoolId(req)

  // Refresh the flag cache (no-op if within TTL)
  await refreshFlags(origin)

  const shouldLog = schoolId !== null && monitored.has(schoolId)
  const response  = NextResponse.next()

  // After response is constructed, fire log if monitoring is on for this school.
  // status is always 200 here because middleware runs before the route handler —
  // we log the start of the request and rely on the route handler to call logError
  // for any failures (which it does via lib/logger.ts directly in Node runtime).
  // What we capture here: route, method, school, actor, timing.
  if (shouldLog) {
    const actorRole = extractActorRole(req)
    const duration  = Date.now() - start

    // Fire-and-forget — do not await
    fetch(`${origin}/api/internal/log-ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: INGEST_SECRET,
        type: 'request',
        data: {
          school_id:   schoolId,
          route:       pathname,
          method:      req.method,
          status_code: 200, // best estimate at middleware time; errors captured in route
          duration_ms: duration,
          actor_role:  actorRole,
        },
      }),
    }).catch(() => { /* never let logging break the request */ })
  }

  return response
}
