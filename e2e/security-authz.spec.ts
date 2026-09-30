import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { config as loadDotenv } from 'dotenv'
import { proxy } from '../proxy'
import { JWT_SECRET, INGEST_SECRET, COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from '../lib/auth-constants'
import { featureForApiPath, GATED_FEATURE_KEYS } from '../lib/featureRoutes'
import { ALL_FEATURES } from '../lib/features'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// #253 — backend authorization and tenant boundaries, exercised by calling the API directly
// (no frontend), the way an attacker would.

// These deliberately lack a live portal_sessions row. A valid signature must
// still be refused because copied/forged cookies are not the security boundary.
// The dev server reads JWT_SECRET from .env; load the same file so signatures match.
// (Read at call time: lib/auth-constants was already evaluated before this line ran.)
loadDotenv({ quiet: true })
const sign = (payload: Record<string, unknown>) => jwt.sign(payload, process.env.JWT_SECRET || JWT_SECRET)
const studentCookie = (schoolId = 1, studentId = 1) => `${COOKIE_STUDENT}=${sign({ studentId, schoolId, role: 'student', passwordChanged: true })}`
const parentCookie  = (schoolId = 1, parentId = 1)  => `${COOKIE_PARENT}=${sign({ parentId, schoolId, role: 'parent', passwordChanged: true })}`
const teacherCookie = (schoolId = 1, teacherId = 1) => `${COOKIE_TEACHER}=${sign({ teacherId, schoolId, role: 'teacher', passwordChanged: true })}`

test.describe('Unauthenticated requests are refused', () => {
  const cases: [method: string, path: string, body?: unknown][] = [
    ['POST',   '/api/notifications', { school_id: 1, type: 'info', recipient_school_id: 1 }],
    ['PUT',    '/api/notifications', { school_id: 1 }],
    ['POST',   '/api/platform/tasks', { chapter_id: 1, title: 'x' }],
    ['DELETE', '/api/platform/tasks?id=1'],
    ['GET',    '/api/platform/stats'],
    ['GET',    '/api/platform/subjects/1/full'],
    ['GET',    '/api/platform/subjects/1/chapters'],
    ['GET',    '/api/platform/chapters/1/topics'],
    ['GET',    '/api/platform/chapters/1/tasks'],
    ['GET',    '/api/textbooks?school_id=1'],
    ['DELETE', '/api/textbooks/1?school_id=1'],
    ['POST',   '/api/upload/sign', { folder: 'school-logos', public_id: 'school-1' }],
    ['POST',   '/api/students/1/change-password', { school_id: 1, current_password: 'x', new_password: 'yyyyyyyy' }],
    ['POST',   '/api/teachers/1/change-password', { school_id: 1, current_password: 'x', new_password: 'yyyyyyyy' }],
    ['GET',    '/api/academic-year/current?school_id=1'],
    ['POST',   '/api/usage/heartbeat', { usageSessionId: 1 }],
    ['GET',    '/api/internal/feature-denials'],
    ['GET',    '/api/internal/feature-entitlement?school_id=1&feature=expenses'],
  ]
  for (const [method, path, body] of cases) {
    test(`${method} ${path}`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: body })
      expect([401, 403], `${method} ${path} → ${res.status()}`).toContain(res.status())
    })
  }

  test('POST /api/textbooks (multipart) is refused', async ({ request }) => {
    const res = await request.post('/api/textbooks', {
      multipart: { school_id: '1', grade: '../../etc', subject: 'x', file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') } },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('the legacy parent lookup is gone', async ({ request }) => {
    const res = await request.post('/api/parent/lookup', { data: { school_id: 1, roll_number: 'x', parent_phone: '9999999999' } })
    expect(res.status()).toBe(404)
  })
})

test.describe('Students and parents cannot read school directories', () => {
  for (const [who, cookie] of [['student', studentCookie()], ['parent', parentCookie()]] as const) {
    test(`${who}: /api/students and /api/teachers are refused`, async ({ request }) => {
      for (const path of ['/api/students', '/api/students?school_id=1', '/api/teachers', '/api/teachers?school_id=1']) {
        const res = await request.get(path, { headers: { Cookie: cookie } })
        expect([401, 403], path).toContain(res.status())
      }
    })
  }
})

test.describe('Lower-privilege sessions cannot use staff operations', () => {
  test('upload signing refuses teacher, student and parent sessions', async ({ request }) => {
    for (const cookie of [teacherCookie(), studentCookie(), parentCookie()]) {
      const res = await request.post('/api/upload/sign', { headers: { Cookie: cookie }, data: { folder: 'expense-bills' } })
      expect(res.status()).toBe(401)
    }
  })

  test('a student cannot create notifications', async ({ request }) => {
    const res = await request.post('/api/notifications', {
      headers: { Cookie: studentCookie() }, data: { type: 'info', recipient_teacher_id: 1 },
    })
    expect(res.status()).toBe(401)
  })

  test('a student cannot write textbooks, and a teacher cannot delete them', async ({ request }) => {
    expect([401, 403]).toContain((await request.get('/api/textbooks', { headers: { Cookie: studentCookie() } })).status())
    expect([401, 403]).toContain((await request.delete('/api/textbooks/1', { headers: { Cookie: teacherCookie() } })).status())
  })

  test("a teacher cannot change another teacher's password", async ({ request }) => {
    const res = await request.post('/api/teachers/2/change-password', {
      headers: { Cookie: teacherCookie(1, 1) }, data: { current_password: 'x', new_password: 'yyyyyyyy' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test("a student cannot change another student's password", async ({ request }) => {
    const res = await request.post('/api/students/2/change-password', {
      headers: { Cookie: studentCookie(1, 1) }, data: { current_password: 'x', new_password: 'yyyyyyyy' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test("the current academic year is only readable for the caller's own school", async ({ request }) => {
    const res = await request.get('/api/academic-year/current?school_id=2', { headers: { Cookie: studentCookie(1) } })
    expect([401, 403]).toContain(res.status())
  })
})

test.describe('Feature API map (pure)', () => {
  test('maps whole path segments only', () => {
    expect(featureForApiPath('/api/fees')).toBe('fee-management')
    expect(featureForApiPath('/api/fees/ledger')).toBe('fee-management')
    expect(featureForApiPath('/api/feesx')).toBeNull()
    expect(featureForApiPath('/api/expenses/3/attachments')).toBe('expenses')
    expect(featureForApiPath('/api/students')).toBeNull()
  })

  test('every gated key is a real plan feature', () => {
    const keys = new Set(ALL_FEATURES.map(f => f.key))
    for (const k of GATED_FEATURE_KEYS) expect(keys.has(k), k).toBe(true)
  })
})

// The entitlement gate in proxy.ts, exercised directly (no server or database):
// school 7 does not have Expenses; school 8 has everything.
test.describe('Feature gate in proxy.ts', () => {
  const realFetch = global.fetch
  const realNow = Date.now
  test.beforeAll(() => {
    global.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/internal/feature-entitlement')) {
        const url = new URL(String(input))
        const enabled = !(url.searchParams.get('school_id') === '7' && url.searchParams.get('feature') === 'expenses')
        return new Response(JSON.stringify({ enabled }), { status: 200 })
      }
      if (String(input).includes('/api/internal/plan-locked')) return new Response(JSON.stringify({ school_ids: [] }), { status: 200 })
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    // Other specs in this worker may have filled proxy.ts's caches recently; jump past their TTL
    // so this block reads its own mocked denials.
    Date.now = () => realNow() + 10 * 60_000
  })
  test.afterAll(() => { global.fetch = realFetch; Date.now = realNow })

  const token = (role: string, schoolId: number) => jwt.sign({ userId: 1, role, schoolId, sid: 'x' }, JWT_SECRET)
  const call = async (method: string, path: string, cookies: Record<string, string> = {}) => {
    const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await proxy(new NextRequest(`http://localhost:3000${path}`, { method, headers: cookie ? { cookie } : {} }))
    return { blocked: res.status === 403, res }
  }

  test('refuses a feature the school does not have, for every portal, with a clear code', async () => {
    const portals: Record<string, string>[] = [
      { [COOKIE_ADMIN]: token('school_admin', 7) },
      { [COOKIE_TEACHER]: token('teacher', 7) },
      { [COOKIE_STUDENT]: token('student', 7) },
      { [COOKIE_PARENT]: token('parent', 7) },
    ]
    for (const cookies of portals) {
      const { blocked, res } = await call('GET', '/api/expenses', cookies)
      expect(blocked).toBe(true)
      expect(await res.json()).toMatchObject({ code: 'FEATURE_DISABLED', feature: 'expenses' })
    }
    expect((await call('POST', '/api/expenses/3/attachments', { [COOKIE_ADMIN]: token('school_admin', 7) })).blocked).toBe(true)
  })

  test('lets through features the school has, other schools, platform admin, and non-feature routes', async () => {
    expect((await call('GET', '/api/fees/ledger', { [COOKIE_ADMIN]: token('school_admin', 7) })).blocked).toBe(false)
    expect((await call('GET', '/api/expenses', { [COOKIE_ADMIN]: token('school_admin', 8) })).blocked).toBe(false)
    expect((await call('GET', '/api/expenses', { [COOKIE_ADMIN]: token('school_admin', 7), [COOKIE_PLATFORM]: token('platform_admin', 0) })).blocked).toBe(false)
    expect((await call('GET', '/api/students', { [COOKIE_ADMIN]: token('school_admin', 7) })).blocked).toBe(false)
  })

  test('leaves requests without a school session to the route itself', async () => {
    expect((await call('GET', '/api/expenses')).blocked).toBe(false)
  })

  test('ignores a forged token', async () => {
    const forged = jwt.sign({ role: 'school_admin', schoolId: 7 }, 'not-the-secret')
    expect((await call('GET', '/api/expenses', { [COOKIE_ADMIN]: forged })).blocked).toBe(false)
  })
})

// The proxy's denials must agree with what the school's own navigation shows
// (/api/school/enabled-features, which uses schoolHasFeature per key).
test.describe('Feature denials match schoolHasFeature', () => {
  test('for a basic-tier school', async () => {
    const cookie = await platformAdminCookie()
    const school = await createSchool(cookie)
    try {
      await setSubscription(cookie, school.id, 'basic')
      const enabledRes = await fetch(`${BASE}/api/school/enabled-features?school_id=${school.id}&portal=school-admin`, { headers: { Cookie: cookie } })
      expect(enabledRes.ok).toBe(true)
      const { enabled } = await enabledRes.json() as { enabled: string[] }

      const denialsRes = await fetch(`${BASE}/api/internal/feature-denials`, { headers: { 'x-ingest-secret': INGEST_SECRET } })
      expect(denialsRes.ok).toBe(true)
      const { denials } = await denialsRes.json() as { denials: Record<string, string[]> }
      const denied = new Set(denials[school.id] ?? [])

      for (const key of GATED_FEATURE_KEYS) {
        if (!ALL_FEATURES.find(f => f.key === key)?.portals.includes('school-admin')) continue
        expect(denied.has(key), key).toBe(!enabled.includes(key))
      }
    } finally {
      await fetch(`${BASE}/api/schools/${school.id}`, { method: 'DELETE', headers: { Cookie: cookie } }).catch(() => {})
    }
  })
})
