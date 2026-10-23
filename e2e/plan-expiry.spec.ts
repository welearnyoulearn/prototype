import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { proxy } from '../proxy'
import { JWT_SECRET, COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from '../lib/auth-constants'
import { BASE, platformAdminCookie, createSchool } from './fixtures/platform-admin'
import { planStatus, nextTerm, renewedEnd, addYears, addDays, isLockedStatus } from '../lib/planExpiry'

// Plan end date (issue #236): a school's term only moves when it starts, is renewed, or the
// platform admin sets a date — re-saving a plan or changing tier mid-term must NOT renew it.

test.describe('Plan term rules (pure)', () => {
  const T = '2026-06-15'
  test('status: active → expiring → grace → expired', () => {
    expect(planStatus('basic', '2027-06-15', T).status).toBe('active')
    expect(planStatus('basic', '2026-07-15', T)).toMatchObject({ status: 'expiring', days_left: 30 })
    expect(planStatus('basic', '2026-06-15', T)).toMatchObject({ status: 'expiring', days_left: 0 })
    expect(planStatus('basic', '2026-06-10', T)).toMatchObject({ status: 'grace', days_left: -5 })
    expect(planStatus('basic', '2026-06-01', T)).toMatchObject({ status: 'grace', grace_ends: '2026-06-15' })   // last grace day
    expect(planStatus('basic', '2026-05-31', T).status).toBe('expired')
    expect(planStatus('none', '2020-01-01', T).status).toBe('none')
    expect(planStatus('basic', null, T).status).toBe('active')                                                    // legacy: no end date, nothing to expire
  })
  test('date helpers handle month ends and leap days', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28')
    expect(addYears('2026-06-15', 1)).toBe('2027-06-15')
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08')
  })
  test('a re-save or mid-term tier change keeps the dates; a new or lapsed plan starts a term', () => {
    const cur = { start: '2026-01-10', end: '2027-01-10' }
    expect(nextTerm('basic', cur, 'basic', null, T)).toEqual({ start: '2026-01-10', end: '2027-01-10', started: false })
    expect(nextTerm('basic', cur, 'premium', null, T)).toEqual({ start: '2026-01-10', end: '2027-01-10', started: false })
    expect(nextTerm('none', cur, 'basic', null, T)).toEqual({ start: T, end: '2027-06-15', started: true })
    expect(nextTerm('basic', { start: '2025-01-01', end: '2026-01-01' }, 'basic', null, T)).toMatchObject({ start: T, started: true })   // lapsed past grace
    expect(nextTerm('basic', { start: '2025-06-01', end: '2026-06-10' }, 'basic', null, T)).toMatchObject({ start: '2025-06-01', started: false })  // still in grace
    expect(nextTerm('basic', cur, 'none', null, T)).toBeNull()
  })
  test('renewal counts from the later of today and the current end', () => {
    expect(renewedEnd('2026-09-01', T)).toBe('2027-09-01')   // early renewal loses no days
    expect(renewedEnd('2026-06-01', T)).toBe('2027-06-15')   // lapsed: from today
    expect(renewedEnd(null, T)).toBe('2027-06-15')
  })
  test('the lock applies only to expired plans, and only when enforcement is on', () => {
    delete process.env.PLAN_EXPIRY_ENFORCED
    expect(isLockedStatus('expired')).toBe(false)
    process.env.PLAN_EXPIRY_ENFORCED = 'true'
    try {
      expect(isLockedStatus('expired')).toBe(true)
      expect(isLockedStatus('grace')).toBe(false)          // grace keeps full access
      expect(isLockedStatus('expiring')).toBe(false)
      expect(isLockedStatus('none')).toBe(false)
    } finally { delete process.env.PLAN_EXPIRY_ENFORCED }
  })
  test('a school can be set to never expire, and stays that way on re-save', () => {
    const cur = { start: '2026-01-10', end: null }
    expect(planStatus('premium', null, T).status).toBe('active')
    expect(nextTerm('premium', { start: '2026-01-10', end: '2026-07-01' }, 'premium', null, T, true)).toEqual({ start: '2026-01-10', end: null, started: false })
    expect(nextTerm('premium', cur, 'premium', null, T)).toEqual({ start: '2026-01-10', end: null, started: false })
    expect(nextTerm('none', cur, 'premium', null, T, true)).toEqual({ start: T, end: null, started: true })
  })
})

test.describe.serial('Plan term via the API', () => {
  const ts = Date.now()
  let cookie: string
  let schoolId = 0
  const put = async (body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/schools/${schoolId}/subscription`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }
  const get = async () => (await fetch(`${BASE}/api/schools/${schoolId}/subscription`, { headers: { Cookie: cookie } })).json()

  test.beforeAll(async () => {
    test.setTimeout(120000)
    cookie = await platformAdminCookie()
    const s = await createSchool(cookie, { name: `Plan Expiry ${ts}`, email: `owner${ts}@planexpiry.test`, phone: `96${String(ts).slice(-8)}` })
    schoolId = s.id
  })
  test.afterAll(async () => {
    if (schoolId) await fetch(`${BASE}/api/schools/${schoolId}`, { method: 'DELETE', headers: { Cookie: cookie } }).catch(() => {})
  })

  test('1. First activation starts a one-year term', async () => {
    expect((await put({ tier: 'basic' })).status).toBe(200)
    const g = await get()
    expect(g.plan_status).toBe('active')
    expect(g.plan_end_date).toBe(addYears(g.plan_start_date, 1))
  })

  test('2. Re-saving the plan or changing tier keeps the same dates', async () => {
    const before = await get()
    expect((await put({ tier: 'basic' })).status).toBe(200)
    expect((await put({ tier: 'premium' })).status).toBe(200)
    const after = await get()
    expect(after.plan_start_date).toBe(before.plan_start_date)
    expect(after.plan_end_date).toBe(before.plan_end_date)
  })

  test('3. Renew adds a year to the current end; an explicit end date is honoured and validated', async () => {
    const before = await get()
    const r = await put({ tier: 'premium', renew: true })
    expect(r.status).toBe(200)
    expect(r.body.plan_end_date).toBe(addYears(before.plan_end_date, 1))

    const soon = addDays(before.plan_start_date, 10)
    expect((await put({ tier: 'premium', plan_end_date: soon })).body.plan_end_date).toBe(soon)
    expect((await get()).plan_status).toBe('expiring')

    expect((await put({ tier: 'premium', plan_end_date: 'not-a-date' })).status).toBe(400)
    expect((await put({ tier: 'premium', plan_end_date: '2026-02-30' })).status).toBe(400)
    expect((await put({ tier: 'premium', plan_end_date: '2000-01-01' })).status).toBe(400)      // before the start
    expect((await put({ tier: 'none', renew: true })).status).toBe(400)                        // no plan, nothing to renew
  })

  test('4. Moving to No plan and back starts a fresh term from today', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    expect((await put({ tier: 'none' })).status).toBe(200)
    const r = await put({ tier: 'basic' })
    expect(r.body.plan_start_date).toBe(today)
    expect(r.body.plan_end_date).toBe(addYears(today, 1))
  })

  test('4b. "No expiry" clears the end date and survives re-saves; it cannot be combined with a date', async () => {
    const r = await put({ tier: 'basic', no_expiry: true })
    expect(r.status).toBe(200)
    expect(r.body.no_expiry).toBe(true)
    const g = await get()
    expect(g.plan_end_date).toBeNull()
    expect(g.plan_status).toBe('active')
    expect(g.days_left).toBeNull()
    expect((await put({ tier: 'premium' })).status).toBe(200)          // a re-save keeps it unlimited
    expect((await get()).plan_end_date).toBeNull()
    expect((await put({ tier: 'premium', no_expiry: true, plan_end_date: '2030-01-01' })).status).toBe(400)
    expect((await put({ tier: 'premium', plan_end_date: '2030-01-01' })).status).toBe(200)   // and a date can be set again
    expect((await get()).plan_end_date).toBe('2030-01-01')
  })

  test('5. Only the platform admin can renew or set a date', async () => {
    const res = await fetch(`${BASE}/api/schools/${schoolId}/subscription`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'basic', renew: true }),
    })
    expect(res.status).toBe(401)
  })
})

// The lock in proxy.ts, exercised directly (no server or database): school 7 is locked, school 8 is not.
test.describe('Lock guard in proxy.ts', () => {
  const realFetch = global.fetch
  test.beforeAll(() => {
    global.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/internal/plan-locked')) return new Response(JSON.stringify({ school_ids: [7] }), { status: 200 })
      return new Response('{}', { status: 200 })
    }) as typeof fetch
  })
  test.afterAll(() => { global.fetch = realFetch })

  const token = (role: string, schoolId: number) => jwt.sign({ userId: 1, role, schoolId, sid: 'x' }, JWT_SECRET)
  const call = async (method: string, path: string, cookies: Record<string, string> = {}) => {
    const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await proxy(new NextRequest(`http://localhost:3000${path}`, { method, headers: cookie ? { cookie } : {} }))
    return { blocked: res.status === 403, res }
  }

  test('refuses every request from a locked school — reads and writes, every portal — with a clear code', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const { blocked, res } = await call(method, '/api/students', { [COOKIE_ADMIN]: token('school_admin', 7) })
      expect(blocked, method).toBe(true)
      expect((await res.json()).code).toBe('PLAN_EXPIRED')
    }
    expect((await call('GET', '/api/teacher/dashboard', { [COOKIE_TEACHER]: token('teacher', 7) })).blocked).toBe(true)
    expect((await call('GET', '/api/student/dashboard', { [COOKIE_STUDENT]: token('student', 7) })).blocked).toBe(true)
    expect((await call('GET', '/api/parent/fees', { [COOKIE_PARENT]: token('parent', 7) })).blocked).toBe(true)
    expect((await call('POST', '/api/parent/fees', { [COOKIE_PARENT]: token('parent', 7) })).blocked).toBe(true)   // no fee payments either
  })

  test('never blocks other schools, anonymous requests or a platform admin', async () => {
    expect((await call('GET', '/api/students', { [COOKIE_ADMIN]: token('school_admin', 8) })).blocked).toBe(false)
    expect((await call('POST', '/api/students', { [COOKIE_ADMIN]: token('school_admin', 8) })).blocked).toBe(false)
    expect((await call('GET', '/api/students')).blocked).toBe(false)
    expect((await call('POST', '/api/students', { [COOKIE_ADMIN]: token('school_admin', 7), [COOKIE_PLATFORM]: token('platform_admin', 0) })).blocked).toBe(false)
  })

  test('keeps only sign-in/out, the plan routes (status, export, renewal request) and usage pings open', async () => {
    const c = { [COOKIE_ADMIN]: token('school_admin', 7) }
    for (const [method, path] of [['POST', '/api/auth/login'], ['POST', '/api/auth/logout'], ['GET', '/api/auth/me'],
      ['GET', '/api/plan/status'], ['GET', '/api/plan/export'], ['POST', '/api/plan/renewal-request'], ['POST', '/api/usage/heartbeat']]) {
      expect((await call(method, path, c)).blocked, path).toBe(false)
    }
    expect((await call('POST', '/api/teacher/auth/logout', { [COOKIE_TEACHER]: token('teacher', 7) })).blocked).toBe(false)
    expect((await call('POST', '/api/parent/auth/logout', { [COOKIE_PARENT]: token('parent', 7) })).blocked).toBe(false)
    // Everything else a school administrator could touch stays refused, including fee routes.
    for (const path of ['/api/fees/payments/verify', '/api/fees/ledger', '/api/attendance/report']) {
      expect((await call('POST', path, c)).blocked, path).toBe(true)
    }
  })

  test('ignores a forged or unsigned token', async () => {
    const forged = jwt.sign({ role: 'school_admin', schoolId: 7 }, 'not-the-secret')
    expect((await call('POST', '/api/students', { [COOKIE_ADMIN]: forged })).blocked).toBe(false)   // the route itself rejects it
  })
})
