import { request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool, { ensureDB } from '../../lib/db'
import { COOKIE_ADMIN, JWT_SECRET } from '../../lib/auth-constants'

// A throwaway premium school with a signed-in school admin, for people and setup specs.

export type AdminSchool = Awaited<ReturnType<typeof createAdminSchool>>

export async function createAdminSchool(tag: string) {
  await ensureDB()
  const suffix = `${tag}-${Date.now()}-${randomUUID().slice(0, 6)}`
  const one = async (sql: string, params: unknown[]) => (await pool.query<{ id: number }>(sql, params)).rows[0].id
  const schoolId = await one(`INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`, [`Admin ${suffix}`])
  await pool.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`, [schoolId])
  const userId = await one(
    `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed, status)
     VALUES ($1, $2, 'unused', 'school_admin', $3, FALSE, TRUE, 'active') RETURNING id`,
    [`admin-${suffix}@test.invalid`, `AD-${suffix}`, schoolId])
  const sid = randomUUID()
  await pool.query(`INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`, [sid, userId])
  const token = jwt.sign({ userId, role: 'school_admin', schoolId, sid, firstLogin: false, profileCompleted: true },
    process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' })
  const admin: APIRequestContext = await playwrightRequest.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000', timeout: 60_000,
    extraHTTPHeaders: { Cookie: `${COOKIE_ADMIN}=${token}` },
  })

  let made = 0
  /** Inserts a student directly. `extra` sets further columns. */
  const addStudent = (name: string, extra: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      school_id: schoolId, name, grade: '8', section: 'A', roll_number: `${suffix}-${++made}`, status: 'active', ...extra,
    }
    const columns = Object.keys(row)
    return one(`INSERT INTO students (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(row))
  }
  /** A 10-digit Indian mobile number that no other call returns. */
  const phone = () => `9${String(Date.now()).slice(-6)}${String(++made).padStart(3, '0')}`

  const signIn = (page: Page, baseURL: string) => page.context().addCookies([{ name: COOKIE_ADMIN, value: token, url: baseURL }])

  async function cleanup() {
    await admin.dispose()
    await pool.query(`DELETE FROM schools WHERE id = $1`, [schoolId])
  }
  return { schoolId, userId, admin, suffix, addStudent, phone, signIn, cleanup }
}
