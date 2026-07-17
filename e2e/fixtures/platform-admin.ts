// Shared bootstrap for specs that need to provision a school.
//
// POST /api/schools requires a platform admin session. The credentials cannot be
// derived at runtime (setup-admin only creates the *first* admin, and only when
// SETUP_SECRET is set), so they come from the environment. Defaults match the
// values the specs previously hardcoded, so existing environments are unchanged;
// point E2E_PLATFORM_ADMIN_* at a local admin when running against a local DB.

export const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export const PLATFORM_ADMIN_EMAIL    = process.env.E2E_PLATFORM_ADMIN_EMAIL ?? 'ckrishna@startensystems.com'
export const PLATFORM_ADMIN_PASSWORD = process.env.E2E_PLATFORM_ADMIN_PASSWORD ?? 'Admin@1234'

const EMAIL    = PLATFORM_ADMIN_EMAIL
const PASSWORD = PLATFORM_ADMIN_PASSWORD

/** Logs in as platform admin and returns the `wlyl-platform=…` cookie pair. */
export async function platformAdminCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
    redirect: 'manual',
  })
  const cookie = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-platform='))
  if (!cookie) {
    throw new Error(
      `Platform admin login failed for ${EMAIL} — status ${res.status}. ` +
      `Set E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD for this environment.`,
    )
  }
  return cookie.split(';')[0]
}

export type SeededSchool = { id: number; school_code: string; temp_password: string }

/** Creates a school as platform admin. Throws loudly rather than yielding undefined fields. */
export async function createSchool(cookie: string, overrides: Record<string, unknown> = {}): Promise<SeededSchool> {
  const ts = Date.now()
  const res = await fetch(`${BASE}/api/schools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: `Test School ${ts}`,
      type: 'Private',
      city: 'Chennai',
      country: 'India',
      phone: '9876500100',
      email: `admin${ts}@test.com`,
      address: '50 Anna Salai, Chennai',
      ...overrides,
    }),
  })
  if (!res.ok) throw new Error(`Create school failed — status ${res.status}: ${await res.text()}`)
  return res.json()
}

/** Sets a school's subscription tier. Also platform-admin only. */
export async function setSubscription(cookie: string, schoolId: number, tier = 'premium'): Promise<void> {
  const res = await fetch(`${BASE}/api/schools/${schoolId}/subscription`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ tier }),
  })
  if (!res.ok) throw new Error(`Set subscription failed — status ${res.status}: ${await res.text()}`)
}
