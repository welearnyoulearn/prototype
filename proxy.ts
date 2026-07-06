import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { JWT_SECRET as JWT_SECRET_RAW, COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from '@/lib/auth-constants'

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

// ── Watchline constants ───────────────────────────────────────────────────────
const INGEST_SECRET = process.env.INGEST_SECRET || 'watchline-internal'
const SKIP_ROUTES   = new Set([
  '/api/internal/log-ingest',
  '/api/internal/log-cleanup',
  '/api/internal/watchline-flags',
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
      if (!payload || payload.role !== 'platform_admin') {
        return NextResponse.redirect(new URL('/login?role=platform', req.url))
      }
      return watchlineAndNext(req, origin, pathname)
    }
    if (pathname.startsWith('/login') || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/login?role=platform', req.url))
  }

  // ── Main domain ───────────────────────────────────────────────────────────
  if (pathname.startsWith('/platform-admin')) {
    const token = req.cookies.get(COOKIE_PLATFORM)?.value
    const payload = token ? await getTokenPayload(token) : null
    if (!payload || payload.role !== 'platform_admin') {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
    return watchlineAndNext(req, origin, pathname)
  }

  if (isPublic(pathname) || pathname === '/') return NextResponse.next()

  // ── School Admin ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/school-admin')) {
    const token = req.cookies.get(COOKIE_ADMIN)?.value
    const payload = token ? await getTokenPayload(token) : null
    const schoolRoles = ['school_admin', 'principal', 'vice_principal']
    if (!payload || !schoolRoles.includes(payload.role as string)) {
      return NextResponse.redirect(new URL('/login?role=school', req.url))
    }
    if (payload.firstLogin && pathname !== '/change-password') {
      return NextResponse.redirect(new URL('/change-password?first=1', req.url))
    }
    return watchlineAndNext(req, origin, pathname)
  }

  // ── Teacher ───────────────────────────────────────────────────────────────
  if (pathname.startsWith('/teacher')) {
    const token = req.cookies.get(COOKIE_TEACHER)?.value
    const payload = token ? await getTokenPayload(token) : null
    if (!payload || payload.role !== 'teacher') {
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
    if (!payload || payload.role !== 'student') {
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
    if (!payload || payload.role !== 'parent') {
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
