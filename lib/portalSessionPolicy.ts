// How long a portal login lasts. Pure (no pg / next imports) so it can be unit-tested and
// shared; lib/auth.ts applies it to the cookie, the JWT and the portal_sessions row.

export const SESSION_IDLE_MINUTES = 20   // no authenticated activity for this long → logged out
export const SESSION_MAX_HOURS    = 12   // hard cap, however active the user is

// The parent mobile app (login sent with `x-wlyl-client: mobile`) stays signed in until the
// parent logs out, like a chat app. Logout and password change still revoke it server-side;
// this is only the safety-net lifetime for a phone that is never used again.
export const MOBILE_SESSION_DAYS  = 365

export const MOBILE_CLIENT_HEADER = 'x-wlyl-client'

export type SessionLimits = {
  idleMinutes: number
  maxHours: number
  // null → a browser-session cookie (no maxAge) that is dropped when the browser closes.
  // A number → a persistent cookie, so a phone's cookie jar keeps it across app restarts.
  cookieMaxAgeSeconds: number | null
}

export function parentSessionLimits(mobile: boolean | undefined): SessionLimits {
  if (!mobile) return { idleMinutes: SESSION_IDLE_MINUTES, maxHours: SESSION_MAX_HOURS, cookieMaxAgeSeconds: null }
  const minutes = MOBILE_SESSION_DAYS * 24 * 60
  return { idleMinutes: minutes, maxHours: MOBILE_SESSION_DAYS * 24, cookieMaxAgeSeconds: minutes * 60 }
}

export function isMobileClient(headerValue: string | null): boolean {
  return headerValue === 'mobile'
}
