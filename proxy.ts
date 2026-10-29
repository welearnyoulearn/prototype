import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { JWT_SECRET as JWT_SECRET_RAW, INGEST_SECRET, COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from '@/lib/auth-constants'
import { featureRequirementForApiPath } from '@/lib/featureRoutes'
import { isCrossSiteAuthMutation, parseTrustedOrigins } from '@/lib/crossSite'

// Combined middleware: auth routing (formerly proxy.ts) + Watchline observability logging.
// Edge runtime only — cannot use pg, jsonwebtoken, or lib/auth / lib/db.
// Cookie names and JWT secret come from lib/auth-constants (dependency-free, Edge-safe)
// so they can never drift out of sync with lib/auth.ts's Node-runtime values again.

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW)

async function getTokenPayload(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

const PUBLIC_PREFIXES = [
  '/login',
  '/admin',
  '/forgot-password',
  '/reset-password',
  '/change-password',
  '/profile-setup',
  '/teacher/login',
  '/teacher/forgot-password',
  '/teacher/reset-password',
  '/student/login',
  '/student/forgot-password',
  '/student/reset-password',
  '/parent/login',
  '/parent/forgot-password',
  '/parent/reset-password',
  '/api/',
  '/_next/',
  '/favicon',
  '/firebase-messaging-sw.js',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

// Our own parent app (a PWA that proxies /api/* here) is the one trusted cross-origin caller; see lib/crossSite.ts.
const TRUSTED_APP_ORIGINS = parseTrustedOrigins(process.env.TRUSTED_APP_ORIGINS)

// ── Watchline constants ───────────────────────────────────────────────────────
// INGEST_SECRET now comes from lib/auth-constants too — it had a third hardcoded copy
// of the same default here and in both internal routes. In production without the env
// var it is '' and the routes reject it, so logging goes quiet instead of running on a
// secret that is published in this repo.
const SKIP_ROUTES   = new Set([
  '/api/internal/log-ingest',
  '/api/internal/log-cleanup',
  '/api/internal/watchline-flags',
  '/api/internal/feature-entitlement',
])

const monitored: Set<number> = new Set()
let lastRefresh = 0
const CACHE_TTL = 60_000

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

// ── Locked schools (plan expired past grace) ─────────────────────────────────
// When a school's plan has expired past its grace period, every request its people make to
// /api/ with a school-side session cookie (school staff, teacher, student, parent) is answered
// 403 PLAN_EXPIRED — whatever the method — except the few routes a locked school still needs:
// signing in/out (the teacher / student / parent sign-in routes refuse a locked school
// themselves; staff may still sign in), the plan routes (status, data export, renewal request),
// usage pings, and the platform's own routes. This is the single place that enforces the lock, so
// no individual route can forget it. Nothing is deleted.
//
// The set of locked schools comes from /api/internal/plan-locked (empty unless
// PLAN_EXPIRY_ENFORCED=true) and is cached for LOCKED_TTL. If the refresh fails the previous set
// is kept (fail-open on a cold start), and a renewal takes effect within LOCKED_TTL.
const LOCKED_TTL = 15_000
const LOCKED_EXEMPT_PREFIXES = [
  '/api/auth/', '/api/teacher/auth/', '/api/student/auth/', '/api/parent/auth/', '/api/teacher-auth/',
  '/api/usage/', '/api/internal/', '/api/cron/', '/api/platform/', '/api/plan/',
]
let lockedSchools = new Set<number>()
let lockedFetchedAt = 0
let lockedInflight: Promise<void> | null = null

function refreshLocked(origin: string): Promise<void> {
  if (Date.now() - lockedFetchedAt < LOCKED_TTL) return Promise.resolve()
  if (!lockedInflight) {
    lockedInflight = (async () => {
      try {
        const res = await fetch(`${origin}/api/internal/plan-locked`, { headers: { 'x-ingest-secret': INGEST_SECRET } })
        if (res.ok) {
          const { school_ids } = await res.json() as { school_ids: number[] }
          lockedSchools = new Set(school_ids)
        }
      } catch { /* keep the previous set */ }
      lockedFetchedAt = Date.now()
      lockedInflight = null
    })()
  }
  return lockedInflight
}

async function isLockedRequest(req: NextRequest, pathname: string, origin: string): Promise<boolean> {
  if (!pathname.startsWith('/api/')) return false
  if (LOCKED_EXEMPT_PREFIXES.some(p => pathname.startsWith(p))) return false
  // A Platform Admin session is never restricted, even in a browser that also holds a school login.
  if (req.cookies.get(COOKIE_PLATFORM)) return false
  const tokens = [COOKIE_ADMIN, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT]
    .map(name => req.cookies.get(name)?.value).filter((t): t is string => !!t)
  if (tokens.length === 0) return false
  await refreshLocked(origin)
  if (lockedSchools.size === 0) return false
  for (const token of tokens) {
    const payload = await getTokenPayload(token)
    const schoolId = Number(payload?.schoolId)
    if (Number.isInteger(schoolId) && lockedSchools.has(schoolId)) return true
  }
  return false
}

// ── API feature entitlements ─────────────────────────────────────────────────
// Navigation flags are presentation only. These mappings enforce the same plan
// decisions before a protected API reaches its handler, including direct calls.
// A switch made in Platform Admin applies within ENTITLEMENT_TTL. Under load (#452): requests waiting on the
// same school + feature share one lookup, a failed lookup falls back to the last known answer, and with no
// answer at all the result is null ("unknown") so the caller can say "try again" instead of a false 403.
const entitlementCache = new Map<string, { enabled: boolean; fetchedAt: number }>()
const entitlementInFlight = new Map<string, Promise<boolean | null>>()
const ENTITLEMENT_TTL = 15_000

async function schoolFeatureEnabled(origin: string, schoolId: number, feature: string): Promise<boolean | null> {
  const key = `${schoolId}:${feature}`
  const cached = entitlementCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < ENTITLEMENT_TTL) return cached.enabled
  const pending = entitlementInFlight.get(key)
  if (pending) return pending

  const lookup = (async () => {
    try {
      const url = new URL('/api/internal/feature-entitlement', origin)
      url.searchParams.set('school_id', String(schoolId))
      url.searchParams.set('feature', feature)
      const res = await fetch(url, { headers: { 'x-ingest-secret': INGEST_SECRET } })
      if (!res.ok) throw new Error(`entitlement lookup ${res.status}`)
      const body = await res.json() as { enabled?: boolean }
      const enabled = body.enabled === true
      entitlementCache.set(key, { enabled, fetchedAt: Date.now() })
      return enabled
    } catch {
      return cached ? cached.enabled : null
    } finally {
      entitlementInFlight.delete(key)
    }
  })()
  entitlementInFlight.set(key, lookup)
  return lookup
}

async function requestHasFeature(req: NextRequest, origin: string, feature: string): Promise<boolean | null> {
  const platformToken = req.cookies.get(COOKIE_PLATFORM)?.value
  const platform = platformToken ? await getTokenPayload(platformToken) : null
  if (platform?.role === 'platform_admin') return true

  // Same precedence every route handler already uses to resolve "who is
  // actually making this request" (admin, else teacher, else student, else
  // parent — first cookie present wins, see e.g. GET /api/classes). This
  // used to instead collect the school_id from EVERY portal cookie present
  // in the browser and require all of them entitled — so a leftover cookie
  // from testing a different role or school (never logged out, unrelated to
  // this request) could block a perfectly entitled admin/teacher/student/
  // parent session from ever reaching the route. Checking only the one
  // identity this request will actually resolve to matches reality and
  // still stops a forged/irrelevant cookie from mattering, since the route
  // itself never looks at it either.
  const schoolId = await requestSchoolId(req)

  // Authentication remains the route handler's responsibility — if no
  // recognizable session cookie is present at all, let the request through
  // and let the handler return its own 401.
  if (schoolId === null) return true
  return schoolFeatureEnabled(origin, schoolId, feature)
}

// The school this request resolves to (first school-side cookie wins). Memoised per request
// so the feature check and the request counter share one JWT decode.
const schoolIdByRequest = new WeakMap<NextRequest, Promise<number | null>>()
function requestSchoolId(req: NextRequest): Promise<number | null> {
  let p = schoolIdByRequest.get(req)
  if (!p) {
    p = (async () => {
      for (const cookie of [COOKIE_ADMIN, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT]) {
        const token = req.cookies.get(cookie)?.value
        if (!token) continue
        const id = Number((await getTokenPayload(token))?.schoolId)
        if (Number.isInteger(id) && id > 0) return id
      }
      return null
    })()
    schoolIdByRequest.set(req, p)
  }
  return p
}

// ── API request counting (api.request meter) ─────────────────────────────────
// ponytail: counts are per instance and lost on a cold stop; fine for a track-only signal.
// Skipped: internal/cron/platform routes, and /api/usage/ heartbeats, which would dominate.
const COUNT_SKIP_PREFIXES = ['/api/internal/', '/api/cron/', '/api/platform/', '/api/usage/']
const requestCounts = new Map<number, number>()
let countsFlushedAt = Date.now()

async function countApiRequest(req: NextRequest, origin: string, pathname: string): Promise<void> {
  if (COUNT_SKIP_PREFIXES.some(p => pathname.startsWith(p))) return
  const schoolId = await requestSchoolId(req)
  if (schoolId === null) return
  const n = (requestCounts.get(schoolId) ?? 0) + 1
  requestCounts.set(schoolId, n)
  if (n < 500 && Date.now() - countsFlushedAt < 60_000) return
  const counts = Array.from(requestCounts, ([id, requests]) => ({ schoolId: id, requests }))
  requestCounts.clear()
  countsFlushedAt = Date.now()
  for (let i = 0; i < counts.length; i += 1000) {
    fetch(`${origin}/api/internal/usage-ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': INGEST_SECRET },
      body: JSON.stringify({ counts: counts.slice(i, i + 1000) }),
    }).catch(() => { /* counting must never break the request */ })
  }
}

/** True when any feature is on, false when all are off, null when that couldn't be checked right now. */
async function requestHasAnyFeature(req: NextRequest, origin: string, features: readonly string[]): Promise<boolean | null> {
  let unknown = false
  for (const feature of features) {
    const on = await requestHasFeature(req, origin, feature)
    if (on) return true
    if (on === null) unknown = true
  }
  return unknown ? null : false
}

function extractSchoolId(req: NextRequest): number | null {
  const sid = req.nextUrl.searchParams.get('school_id')
  const n = Number(sid)
  return sid && !isNaN(n) ? n : null
}

function extractActorRole(req: NextRequest): string | null {
  if (req.cookies.get(COOKIE_PLATFORM)) return 'platform_admin'
  if (req.cookies.get(COOKIE_ADMIN))    return 'admin'
  if (req.cookies.get(COOKIE_TEACHER))  return 'teacher'
  if (req.cookies.get(COOKIE_STUDENT))  return 'student'
  if (req.cookies.get(COOKIE_PARENT))   return 'parent'
  return null
}

// ── Main proxy ───────────────────────────────────────────────────────────────
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host         = req.headers.get('host') ?? ''
  const isAdminSubdomain = host.startsWith('admin.')
  const origin       = req.nextUrl.origin

  if (isCrossSiteAuthMutation({
    method: req.method, pathname, secFetchSite: req.headers.get('sec-fetch-site'),
    origin: req.headers.get('origin'), host: req.headers.get('host'), trustedOrigins: TRUSTED_APP_ORIGINS,
  })) {
    return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 })
  }

  // ── admin.welearnyoulearn.com — Platform Admin only ──────────────────────
  if (isAdminSubdomain) {
    if (pathname.startsWith('/_next/') || pathname.startsWith('/api/') || pathname.startsWith('/favicon')) {
      return NextResponse.next()
    }
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/login?role=platform', req.url))
    }
    if (pathname.startsWith('/platform-admin')) {
      const token = req.cookies.get(COOKIE_PLATFORM)?.value
      const payload = token ? await getTokenPayload(token) : null
      if (!payload || !payload.sid || payload.role !== 'platform_admin') {
        return NextResponse.redirect(new URL('/login?role=platform', req.url))
      }
      if (payload.firstLogin) return NextResponse.redirect(new URL('/change-password?first=1&portal=platform', req.url))
      return watchlineAndNext(req, origin, pathname)
    }
    if (pathname.startsWith('/login') || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password') || pathname.startsWith('/change-password')) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/login?role=platform', req.url))
  }

  // ── Main domain ───────────────────────────────────────────────────────────
  if (pathname.startsWith('/platform-admin')) {
    const token = req.cookies.get(COOKIE_PLATFORM)?.value
    const payload = token ? await getTokenPayload(token) : null
    if (!payload || !payload.sid || payload.role !== 'platform_admin') {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
    if (payload.firstLogin) return NextResponse.redirect(new URL('/change-password?first=1&portal=platform', req.url))
    return watchlineAndNext(req, origin, pathname)
  }

  if (await isLockedRequest(req, pathname, origin)) {
    return NextResponse.json({
      error: "Your school's plan has ended, so access is paused. School administrators can still export their data and request a renewal.",
      code: 'PLAN_EXPIRED',
    }, { status: 403 })
  }

  const requirement = featureRequirementForApiPath(pathname, req.method)
  if (requirement) {
    const allowed = await requestHasAnyFeature(req, origin, requirement.anyOf)
    if (allowed === null) {
      return NextResponse.json({ error: 'We are very busy right now. Please try again in a moment.', code: 'FEATURE_CHECK_UNAVAILABLE' }, { status: 503, headers: { 'Retry-After': '5' } })
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: requirement.primary }, { status: 403 })
    }
  }

  if (pathname.startsWith('/api/')) await countApiRequest(req, origin, pathname)

  if (isPublic(pathname) || pathname === '/') return NextResponse.next()

  // ── School Admin ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/school-admin')) {
    const token = req.cookies.get(COOKIE_ADMIN)?.value
    const payload = token ? await getTokenPayload(token) : null
    const schoolRoles = ['school_admin', 'principal', 'vice_principal']
    // `sid` = server-side session id; cookies from before server sessions existed lack it.
    if (!payload || !payload.sid || !schoolRoles.includes(payload.role as string)) {
      return NextResponse.redirect(new URL('/login?role=school', req.url))
    }
    if (payload.firstLogin && pathname !== '/change-password') {
      return NextResponse.redirect(new URL('/change-password?first=1', req.url))
    }
    // Never cache authenticated pages — after logout the Back button must not replay them.
    const res = await watchlineAndNext(req, origin, pathname)
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  // ── Teacher ───────────────────────────────────────────────────────────────
  if (pathname.startsWith('/teacher')) {
    const token = req.cookies.get(COOKIE_TEACHER)?.value
    const payload = token ? await getTokenPayload(token) : null
    if (!payload || !payload.sid || payload.role !== 'teacher') {
      return NextResponse.redirect(new URL('/teacher/login', req.url))
    }
    if (!payload.passwordChanged && pathname === '/teacher') {
      return NextResponse.redirect(new URL('/teacher/change-password', req.url))
    }
    return watchlineAndNext(req, origin, pathname)
  }

  // ── Student ───────────────────────────────────────────────────────────────
  if (pathname.startsWith('/student')) {
    const token = req.cookies.get(COOKIE_STUDENT)?.value
    const payload = token ? await getTokenPayload(token) : null
    if (!payload || !payload.sid || payload.role !== 'student') {
      return NextResponse.redirect(new URL('/student/login', req.url))
    }
    if (!payload.passwordChanged && pathname === '/student') {
      return NextResponse.redirect(new URL('/student/change-password', req.url))
    }
    return watchlineAndNext(req, origin, pathname)
  }

  // ── Parent ────────────────────────────────────────────────────────────────
  if (pathname.startsWith('/parent')) {
    const token = req.cookies.get(COOKIE_PARENT)?.value
    const payload = token ? await getTokenPayload(token) : null
    if (!payload || !payload.sid || payload.role !== 'parent') {
      return NextResponse.redirect(new URL('/parent/login', req.url))
    }
    if (!payload.passwordChanged && pathname === '/parent') {
      return NextResponse.redirect(new URL('/parent/change-password', req.url))
    }
    return watchlineAndNext(req, origin, pathname)
  }

  return NextResponse.next()
}

// Fires Watchline log-ingest (fire-and-forget) then returns NextResponse.next().
// Only logs API routes for schools that have monitoring enabled.
async function watchlineAndNext(req: NextRequest, origin: string, pathname: string): Promise<NextResponse> {
  if (!pathname.startsWith('/api/') || SKIP_ROUTES.has(pathname)) {
    return NextResponse.next()
  }

  const schoolId = extractSchoolId(req)
  const start    = Date.now()

  await refreshFlags(origin)

  const response = NextResponse.next()

  if (schoolId !== null && monitored.has(schoolId)) {
    const actorRole = extractActorRole(req)
    const duration  = Date.now() - start

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
          status_code: 200,
          duration_ms: duration,
          actor_role:  actorRole,
        },
      }),
    }).catch(() => { /* never let logging break the request */ })
  }

  return response
}
