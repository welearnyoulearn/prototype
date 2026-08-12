// Shared between lib/auth.ts (Node runtime) and proxy.ts (Edge runtime).
// Keep this file free of pg/jsonwebtoken imports so proxy.ts can import it directly —
// that's what previously caused the cookie names and JWT secret fallback to drift
// out of sync between the two runtimes (each had its own hardcoded copy).

// `next build` evaluates route handlers (and therefore this module) with
// NODE_ENV=production but without the deployment's runtime secrets, so the guards
// below must not fire during the build. NEXT_PHASE is set only by `next build`;
// Next.js itself uses this same check internally (server/web/globals.js) for the
// same reason. Runtime secrets are never inlined into the bundle (Next only inlines
// NEXT_PUBLIC_* and next.config `env`), so process.env is re-read for real in every
// serving process — Node server and Edge isolate alike.
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build'
const IS_PROD  = process.env.NODE_ENV === 'production' && !IS_BUILD

// Fail closed at module load rather than warn-and-continue. The check has to live at
// module scope because JWT_SECRET must stay a plain `string`: proxy.ts consumes it
// once at its own module load (`new TextEncoder().encode(...)`), so a lazy accessor
// would be forced to evaluate there anyway and would only add an indirection.
// Consequence, accepted deliberately: in a misconfigured production deploy every
// request 500s, including /login and the Edge middleware. That is the safer failure —
// the fallback below is committed to this repo, so running on it lets anyone mint a
// token for any role and any school (see the payload shape in lib/auth.ts). A hard,
// loud outage beats silently serving forgeable sessions.
if (IS_PROD && !process.env.JWT_SECRET) {
  throw new Error(
    '[FATAL] JWT_SECRET is not set. Refusing to start on the public dev fallback — ' +
    'set JWT_SECRET to a long random string in the deployment environment.',
  )
}

// Dev-only fallback so local development works with no env setup — that convenience is
// the only reason it exists. Unreachable in production traffic: the throw above runs
// first, and during the build phase nothing signs or verifies a real request.
export const JWT_SECRET: string = process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production'

// Shared secret for the internal Watchline endpoints (log-ingest, watchline-flags).
// Defined here for the same reason as the cookie names: the three hardcoded copies of
// the old 'watchline-internal' default (proxy.ts + both routes) are exactly the drift
// this module exists to prevent.
// In production a missing env var resolves to '' — never a guessable literal — and
// isValidIngestSecret() refuses '' outright, so the endpoints reject every caller
// instead of honouring a default that is readable in this repo. Deliberately not a
// throw: this gates observability only, and killing the whole app over a missing log
// secret would be a worse failure than logging nothing.
export const INGEST_SECRET: string = process.env.INGEST_SECRET || (IS_PROD ? '' : 'watchline-internal')

// The single comparison used by both internal routes, so the "unset means reject"
// rule can't be re-derived (and got wrong) in two places.
export function isValidIngestSecret(candidate: unknown): boolean {
  return INGEST_SECRET !== '' && candidate === INGEST_SECRET
}

// COOKIE_ADMIN is for school-side staff (school_admin/principal/vice_principal) only.
// Platform Admin gets its own cookie so logging into one portal in a browser
// can never silently overwrite/invalidate a session in the other.
export const COOKIE_ADMIN    = 'wlyl-auth'
export const COOKIE_PLATFORM = 'wlyl-platform'
export const COOKIE_TEACHER  = 'wlyl-teacher'
export const COOKIE_STUDENT  = 'wlyl-student'
export const COOKIE_PARENT   = 'wlyl-parent'
