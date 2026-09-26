import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool } from './fixtures/platform-admin'
import { planStatus, nextTerm, renewedEnd, addYears, addDays, effectiveTier } from '../lib/planExpiry'

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
  test('enforcement is off unless PLAN_EXPIRY_ENFORCED=true', () => {
    delete process.env.PLAN_EXPIRY_ENFORCED
    expect(effectiveTier('premium', '2020-01-01', T)).toBe('premium')
    process.env.PLAN_EXPIRY_ENFORCED = 'true'
    try {
      expect(effectiveTier('premium', '2020-01-01', T)).toBe('none')
      expect(effectiveTier('premium', '2026-06-10', T)).toBe('premium')   // grace
    } finally { delete process.env.PLAN_EXPIRY_ENFORCED }
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

  test('5. Only the platform admin can renew or set a date', async () => {
    const res = await fetch(`${BASE}/api/schools/${schoolId}/subscription`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'basic', renew: true }),
    })
    expect(res.status).toBe(401)
  })
})
