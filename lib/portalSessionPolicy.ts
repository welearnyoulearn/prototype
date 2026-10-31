// How long a portal login lasts. Pure (no pg / next imports) so it can be unit-tested and
// shared; lib/auth.ts applies it to the cookie, the JWT and the portal_sessions row.

export const SESSION_IDLE_MINUTES = 20   // no authenticated activity for this long → logged out
export const SESSION_MAX_HOURS    = 12   // hard cap, however active the user is

// The parent mobile app (login sent with `x-wlyl-client: mobile`) stays signed in for life,
// like a chat app: only logout or a password change (both revoke it server-side) end it.
// 50 years rather than "never" so every expiry stays a real date; it also keeps the cookie
// max-age under 2^31 seconds, which phone cookie stores handle safely.
export const MOBILE_SESSION_DAYS  = 50 * 365

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

// A parent logs in with their email or phone, so changing either hands the login to someone
// else: their sessions must not survive it. `fields` are the parent_* entries being saved.
export function parentLoginChanged(
  current: { email: string | null; phone: string | null },
  fields: ReadonlyArray<readonly [string, unknown]>,
): boolean {
  return fields.some(([field, value]) =>
    (field === 'parent_email' && value !== current.email) || (field === 'parent_phone' && value !== current.phone))
}

// lib/push.ts sends to device_tokens without checking for a live session, and a revoked app can
// no longer unregister itself, so a login handed to someone else must take the phones with it.
export async function removeParentDevices(
  db: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  parentId: number,
): Promise<void> {
  await db.query(`DELETE FROM device_tokens WHERE recipient_role = 'parent' AND recipient_id = $1`, [parentId])
}
