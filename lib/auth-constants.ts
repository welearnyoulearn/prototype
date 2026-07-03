// Shared between lib/auth.ts (Node runtime) and proxy.ts (Edge runtime).
// Keep this file free of pg/jsonwebtoken imports so proxy.ts can import it directly —
// that's what previously caused the cookie names and JWT secret fallback to drift
// out of sync between the two runtimes (each had its own hardcoded copy).

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET env var is not set — auth cookies will not work correctly')
}

export const JWT_SECRET = process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production'

export const COOKIE_ADMIN   = 'wlyl-auth'
export const COOKIE_TEACHER = 'wlyl-teacher'
export const COOKIE_STUDENT = 'wlyl-student'
export const COOKIE_PARENT  = 'wlyl-parent'
