import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_ADMIN, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from '@/lib/auth'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'wlyl-super-secret-key-change-in-production'

function getTokenPayload(token: string): Record<string, unknown> | null {
  try {
    return jwt.verify(token, JWT_SECRET) as Record<string, unknown>
  } catch {
    return null
  }
}

const PUBLIC_PREFIXES = [
  '/login',
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

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname) || pathname === '/') return NextResponse.next()

  // ── Platform Admin ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/platform-admin')) {
    const token = req.cookies.get(COOKIE_ADMIN)?.value
    const payload = token ? getTokenPayload(token) : null
    if (!payload || payload.role !== 'platform_admin') {
      return NextResponse.redirect(new URL('/login?role=platform', req.url))
    }
    return NextResponse.next()
  }

  // ── School Admin ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/school-admin')) {
    const token = req.cookies.get(COOKIE_ADMIN)?.value
    const payload = token ? getTokenPayload(token) : null
    if (!payload || payload.role !== 'school_admin') {
      return NextResponse.redirect(new URL('/login?role=school', req.url))
    }
    if (payload.firstLogin && pathname !== '/change-password') {
      return NextResponse.redirect(new URL('/change-password?first=1', req.url))
    }
    return NextResponse.next()
  }

  // ── Teacher portal ────────────────────────────────────────────────────────
  if (pathname.startsWith('/teacher')) {
    const token = req.cookies.get(COOKIE_TEACHER)?.value
    const payload = token ? getTokenPayload(token) : null
    if (!payload || payload.role !== 'teacher') {
      return NextResponse.redirect(new URL('/teacher/login', req.url))
    }
    if (!payload.passwordChanged && pathname === '/teacher') {
      return NextResponse.redirect(new URL('/teacher/change-password', req.url))
    }
    return NextResponse.next()
  }

  // ── Student portal ────────────────────────────────────────────────────────
  if (pathname.startsWith('/student')) {
    const token = req.cookies.get(COOKIE_STUDENT)?.value
    const payload = token ? getTokenPayload(token) : null
    if (!payload || payload.role !== 'student') {
      return NextResponse.redirect(new URL('/student/login', req.url))
    }
    if (!payload.passwordChanged && pathname === '/student') {
      return NextResponse.redirect(new URL('/student/change-password', req.url))
    }
    return NextResponse.next()
  }

  // ── Parent portal ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/parent')) {
    const token = req.cookies.get(COOKIE_PARENT)?.value
    const payload = token ? getTokenPayload(token) : null
    if (!payload || payload.role !== 'parent') {
      return NextResponse.redirect(new URL('/parent/login', req.url))
    }
    if (!payload.passwordChanged && pathname === '/parent') {
      return NextResponse.redirect(new URL('/parent/change-password', req.url))
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
