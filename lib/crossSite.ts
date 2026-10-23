// Cross-site guard for sign-in / sign-out / password routes (used by proxy.ts, so it must stay dependency-free
// and Edge-safe).
//
// A browser POST to an auth route from another site is refused: that is how login CSRF works. The one
// legitimate cross-origin caller is our own installed parent app (wlyl-parent-app), a PWA that proxies
// /api/* to this platform. Its browser sends the PWA's origin while the proxied request reaches us with our
// own host, so the origin and host never match. Its origin is listed in TRUSTED_APP_ORIGINS (comma-separated,
// exact origins such as https://parent.example.com) and nothing else is trusted.

const AUTH_PATH = /^\/api\/(auth|teacher\/auth|student\/auth|parent\/auth|teacher-auth)(\/|$)/
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Normalised origins from a TRUSTED_APP_ORIGINS value; anything that is not a valid http(s) origin is ignored. */
export function parseTrustedOrigins(raw: string | undefined): Set<string> {
  const out = new Set<string>()
  for (const part of (raw ?? '').split(',')) {
    const value = part.trim()
    if (!value) continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' || url.protocol === 'http:') out.add(url.origin)
    } catch { /* not a URL: ignore */ }
  }
  return out
}

export type CrossSiteInput = {
  method: string
  pathname: string
  secFetchSite: string | null
  origin: string | null
  host: string | null
  trustedOrigins: Set<string>
}

export function isCrossSiteAuthMutation({ method, pathname, secFetchSite, origin, host, trustedOrigins }: CrossSiteInput): boolean {
  if (!MUTATING.has(method)) return false
  if (!AUTH_PATH.test(pathname)) return false
  if (origin) {
    try {
      if (trustedOrigins.has(new URL(origin).origin)) return false
    } catch { /* malformed Origin: handled below */ }
  }
  if (secFetchSite === 'cross-site') return true
  if (!origin) return false // non-browser clients do not always send Origin
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}
