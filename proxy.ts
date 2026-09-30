import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { JWT_SECRET as JWT_SECRET_RAW, INGEST_SECRET, COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from '@/lib/auth-constants'

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
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

function isCrossSiteAuthMutation(req: NextRequest, pathname: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false
  if (!/^\/api\/(auth|teacher\/auth|student\/auth|parent\/auth|teacher-auth)(\/|$)/.test(pathname)) return false
  if (req.headers.get('sec-fetch-site') === 'cross-site') return true
  const origin = req.headers.get('origin')
  if (!origin) return false // non-browser clients do not always send Origin
  try {
    return new URL(origin).host !== req.headers.get('host')
  } catch {
    return true
  }
}

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
function apiFeature(pathname: string): string | null {
  if (pathname.startsWith('/api/teachers')) return 'staff'
  if (pathname.startsWith('/api/fees/') || pathname === '/api/fees' || pathname.startsWith('/api/parent/fees')) return 'fee-management'
  if (pathname.startsWith('/api/expenses')) return 'expenses'
  if (pathname.startsWith('/api/attendance') || pathname.startsWith('/api/parent/attendance') || pathname.startsWith('/api/student/attendance')) return 'attendance'
  if (pathname.startsWith('/api/exams') || /^\/api\/students\/[^/]+\/exams(?:\/|$)/.test(pathname)) return 'exam-marks'
  if (pathname.startsWith('/api/syllabus') || pathname.startsWith('/api/school/custom/') || pathname.startsWith('/api/school/subjects')) return 'curriculum'
  if (pathname.startsWith('/api/school/library') || pathname.startsWith('/api/textbooks') || pathname.startsWith('/api/materials/')) return 'library'
  if (pathname.startsWith('/api/school-calendar')) return 'calendar'
  if (pathname.startsWith('/api/data-export')) return 'export'
  if (pathname.startsWith('/api/feedback/') && !pathname.startsWith('/api/feedback/resolve') && !pathname.startsWith('/api/feedback/submit') && !pathname.startsWith('/api/feedback/voice-upload-url')) return 'feedback-management'
  if (pathname.startsWith('/api/announcements')) return 'announcements'
  if (pathname.startsWith('/api/academic-years/rollover') || pathname.startsWith('/api/students/promote')) return 'year-rollover'
  return null
}

const entitlementCache = new Map<string, { enabled: boolean; fetchedAt: number }>()
const ENTITLEMENT_TTL = 15_000

async function schoolFeatureEnabled(origin: string, schoolId: number, feature: string): Promise<boolean> {
  const key = `${schoolId}:${feature}`
  const cached = entitlementCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < ENTITLEMENT_TTL) return cached.enabled

  try {
    const url = new URL('/api/internal/feature-entitlement', origin)
    url.searchParams.set('school_id', String(schoolId))
    url.searchParams.set('feature', feature)
    const res = await fetch(url, { headers: { 'x-ingest-secret': INGEST_SECRET } })
    if (!res.ok) return false
    const body = await res.json() as { enabled?: boolean }
    const enabled = body.enabled === true
    entitlementCache.set(key, { enabled, fetchedAt: Date.now() })
    return enabled
  } catch {
    return false
  }
}

async function requestHasFeature(req: NextRequest, origin: string, feature: string): Promise<boolean> {
  const platformToken = req.cookies.get(COOKIE_PLATFORM)?.value
  const platform = platformToken ? await getTokenPayload(platformToken) : null
  if (platform?.role === 'platform_admin') return true

  const schoolIds = new Set<number>()
  for (const cookie of [COOKIE_ADMIN, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT]) {
    const token = req.cookies.get(cookie)?.value
    if (!token) continue
    const payload = await getTokenPayload(token)
    const schoolId = Number(payload?.schoolId)
    if (Number.isInteger(schoolId) && schoolId > 0) schoolIds.add(schoolId)
  }

  // Authentication remains the route handler's responsibility. When valid
  // school sessions are present, every one must be entitled, preventing a
  // second cookie from another school being used to piggy-back on access.
  if (schoolIds.size === 0) return true
  const checks = await Promise.all([...schoolIds].map(id => schoolFeatureEnabled(origin, id, feature)))
  return checks.every(Boolean)
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

  if (isCrossSiteAuthMutation(req, pathname)) {
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

  const requiredFeature = apiFeature(pathname)
  if (requiredFeature && !await requestHasFeature(req, origin, requiredFeature)) {
    return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: requiredFeature }, { status: 403 })
  }

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
