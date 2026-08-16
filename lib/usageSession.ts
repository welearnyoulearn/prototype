'use client'

// Client-side handle for the usage_sessions row created at login. Kept in
// sessionStorage (not localStorage) deliberately — it should die with the
// tab/browser session the same way a "session" conceptually should, and
// should never leak across tabs the way localStorage would.
const KEY = 'wlyl_usage_session_id'

export function setUsageSessionId(id: number | null | undefined) {
  if (typeof window === 'undefined') return
  try {
    if (id == null) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, String(id))
  } catch { /* storage unavailable (private mode, etc.) — non-critical */ }
}

export function getUsageSessionId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const v = sessionStorage.getItem(KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function clearUsageSessionId() {
  setUsageSessionId(null)
}
