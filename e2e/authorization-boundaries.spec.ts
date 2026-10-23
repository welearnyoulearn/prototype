import 'dotenv/config'
import { test, expect } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool, { ensureDB } from '../lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production'

function studentCookie(schoolId = 1): string {
  const token = jwt.sign({
    studentId: 999_999_991,
    schoolId,
    role: 'student',
    passwordChanged: true,
    name: 'Security Test Student',
    grade: '10',
    section: 'A',
    rollNumber: 'SECURITY-TEST',
  }, JWT_SECRET, { expiresIn: '5m' })
  return `wlyl-student=${token}`
}

function platformAdminCookie(userId: number, sid: string): string {
  const token = jwt.sign({
    userId,
    role: 'platform_admin',
    firstLogin: false,
    profileCompleted: true,
    sid,
  }, JWT_SECRET, { expiresIn: '5m' })
  return `wlyl-platform=${token}`
}

test.describe('Critical backend authorization boundaries', () => {
  test('unauthenticated callers cannot create or alter notifications', async ({ request }) => {
    const create = await request.post('/api/notifications', {
      data: { school_id: 1, recipient_school_id: 1, type: 'forged' },
    })
    expect([401, 403]).toContain(create.status())

    const markRead = await request.put('/api/notifications', {
      data: { notification_id: -1 },
    })
    expect([401, 403]).toContain(markRead.status())
  })

  test('platform administration APIs require a platform-admin session', async ({ request }) => {
    const stats = await request.get('/api/platform/stats')
    expect([401, 403]).toContain(stats.status())

    const subject = await request.get('/api/platform/subjects/1/full')
    expect([401, 403]).toContain(subject.status())

    const task = await request.post('/api/platform/tasks', { data: {} })
    expect([401, 403]).toContain(task.status())

    const removeTask = await request.delete('/api/platform/tasks?id=-1')
    expect([401, 403]).toContain(removeTask.status())
  })

  test('plan-expiry cron fails closed without valid cron credentials', async ({ request }) => {
    const res = await request.get('/api/cron/plan-expiry')
    expect([401, 503]).toContain(res.status())
  })

  test('textbook APIs reject unauthenticated callers before tenant lookup', async ({ request }) => {
    const list = await request.get('/api/textbooks?school_id=1')
    expect([401, 403]).toContain(list.status())

    const remove = await request.delete('/api/textbooks/-1?school_id=1')
    expect([401, 403]).toContain(remove.status())
  })

  test('student sessions cannot enumerate school-wide people directories', async ({ request }) => {
    const headers = { Cookie: studentCookie() }

    const students = await request.get('/api/students?school_id=1', { headers })
    expect([401, 403]).toContain(students.status())

    const teachers = await request.get('/api/teachers?school_id=1', { headers })
    expect([401, 403]).toContain(teachers.status())
  })

  test('student sessions cannot mint generic upload signatures', async ({ request }) => {
    const res = await request.post('/api/upload/sign', {
      headers: { Cookie: studentCookie() },
      data: { folder: 'school-logos', public_id: 'school-1' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('legacy id-based password routes require the matching portal session', async ({ request }) => {
    const student = await request.post('/api/students/1/change-password', {
      data: { school_id: 1, current_password: 'known', new_password: 'replacement' },
    })
    expect(student.status()).toBe(401)

    const teacher = await request.post('/api/teachers/1/change-password', {
      data: { school_id: 1, current_password: 'known', new_password: 'replacement' },
    })
    expect(teacher.status()).toBe(401)
  })

  test('public health response does not disclose infrastructure configuration', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).not.toHaveProperty('env')
    expect(body).not.toHaveProperty('error')
  })
})

test.describe.serial('Plan entitlements are backend authorization', () => {
  let platformCookie = ''
  let adminCookie = ''
  let schoolId = 0
  let userId = 0
  let platformUserId = 0

  test.beforeAll(async () => {
    await ensureDB()
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const school = await pool.query<{ id: number }>(
      `INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`,
      [`Entitlement Security School ${suffix}`],
    )
    schoolId = school.rows[0].id
    await pool.query(
      `INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'none')`,
      [schoolId],
    )
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users
         (email, school_code, password_hash, role, school_id, first_login, profile_completed, status)
       VALUES ($1, $2, $3, 'school_admin', $4, FALSE, TRUE, 'active')
       RETURNING id`,
      [`entitlement-${suffix}@test.invalid`, `AUTH-${suffix}`, 'not-used', schoolId],
    )
    userId = user.rows[0].id
    const sid = randomUUID()
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [sid, userId],
    )
    const token = jwt.sign({
      userId,
      role: 'school_admin',
      schoolId,
      schoolCode: `AUTH-${suffix}`,
      firstLogin: false,
      profileCompleted: true,
      sid,
    }, JWT_SECRET, { expiresIn: '10m' })
    adminCookie = `wlyl-auth=${token}`

    const platformUser = await pool.query<{ id: number }>(
      `INSERT INTO users
         (email, school_code, password_hash, role, first_login, profile_completed, status)
       VALUES ($1, $2, $3, 'platform_admin', FALSE, TRUE, 'active')
       RETURNING id`,
      [`platform-${suffix}@test.invalid`, `PLATFORM-${suffix}`, 'not-used'],
    )
    platformUserId = platformUser.rows[0].id
    const platformSid = randomUUID()
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [platformSid, platformUserId],
    )
    platformCookie = platformAdminCookie(platformUserId, platformSid)
  })

  test.afterAll(async () => {
    if (schoolId) await pool.query('DELETE FROM schools WHERE id = $1', [schoolId])
    if (platformUserId) await pool.query('DELETE FROM users WHERE id = $1', [platformUserId])
  })

  test('disabled fee feature cannot be bypassed with a direct API request', async ({ request }) => {
    const res = await request.get(`/api/fees/stats?school_id=${schoolId}`, {
      headers: { Cookie: adminCookie },
    })
    expect(res.status()).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'FEATURE_DISABLED', feature: 'fee-management' })
  })

  test('disabled staff feature cannot be bypassed with direct onboarding', async ({ request }) => {
    const res = await request.post('/api/teachers/bulk', {
      headers: { Cookie: adminCookie },
      data: {
        school_id: schoolId,
        teachers: [{ name: 'Blocked Teacher', email: `blocked-${schoolId}@test.invalid`, phone: '9876543210', subject: 'Mathematics', staff_type: 'teaching' }],
      },
    })
    expect(res.status()).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'FEATURE_DISABLED', feature: 'staff' })
  })

  test('platform admin bypasses school plan gating but not platform authentication', async ({ request }) => {
    const res = await request.get('/api/platform/stats', { headers: { Cookie: platformCookie } })
    expect(res.ok()).toBeTruthy()
  })
})
