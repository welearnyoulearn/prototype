// Shared bootstrap for specs that need to provision a school.
//
// POST /api/schools requires a platform admin session. The credentials cannot be
// derived at runtime (setup-admin only creates the *first* admin, and only when
// SETUP_SECRET is set), so they come from the environment. Defaults match the
// values the specs previously hardcoded, so existing environments are unchanged;
// point E2E_PLATFORM_ADMIN_* at a local admin when running against a local DB.

import 'dotenv/config'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import pool, { ensureDB } from '../../lib/db'

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
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: 'manual',
  })
  const cookie = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-platform='))
  if (cookie) return cookie.split(';')[0]

  // Local E2E runs must not depend on a developer's mutable real password.
  // This creates a database-backed test-only session (the same session checks
  // production requests use); it is deliberately unavailable for remote URLs.
  const baseUrl = new URL(BASE)
  if (!['localhost', '127.0.0.1'].includes(baseUrl.hostname)) {
    throw new Error(
      `Platform admin login failed for ${EMAIL} — status ${res.status}. ` +
      `Set E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD for this environment.`,
    )
  }
  await ensureDB()
  const testEmail = `e2e-platform-${process.pid}@test.invalid`
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, school_code, password_hash, role, first_login, profile_completed, status)
     VALUES ($1,$2,'test-session-only','platform_admin',FALSE,TRUE,'active')
     ON CONFLICT (school_code) DO UPDATE SET email=EXCLUDED.email, role='platform_admin', first_login=FALSE, profile_completed=TRUE, status='active'
     RETURNING id`,
    [testEmail, `E2E-PLATFORM-${process.pid}`],
  )
  const sid = randomUUID()
  await pool.query(
    `INSERT INTO user_sessions (id,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '4 hours')`,
    [sid, user.rows[0].id],
  )
  const token = jwt.sign({
    userId: user.rows[0].id,
    role: 'platform_admin',
    firstLogin: false,
    profileCompleted: true,
    sid,
  }, process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production', { expiresIn: '4h' })
  return `wlyl-platform=${token}`
}

// `email` is the school's first admin login (the School ID is not a login credential).
export type SeededSchool = { id: number; school_code: string; email: string; temp_password: string }

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
  const school = await res.json() as Omit<SeededSchool, 'temp_password'>
  const baseUrl = new URL(BASE)
  if (!['localhost', '127.0.0.1'].includes(baseUrl.hostname)) {
    throw new Error('Remote E2E school setup requires an email-backed password setup flow; automatic test passwords are local-only.')
  }
  const tempPassword = `E2e!${randomUUID()}aA1`
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  await pool.query(
    `UPDATE users SET password_hash=$1, first_login=FALSE, profile_completed=TRUE WHERE school_id=$2 AND role='school_admin'`,
    [passwordHash, school.id],
  )
  return { ...school, temp_password: tempPassword }
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
