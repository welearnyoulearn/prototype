import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'
import { db, dbAvailable, closeDb } from './fixtures/db'
import { addDays, addYears } from '../lib/planExpiry'

// What a school experiences as its plan ends (issue #236):
//   grace    → everything still works, the school is told
//   expired  → LOCKED (only when the server runs with PLAN_EXPIRY_ENFORCED=true — the locked tests
//              switch on what /api/plan/status reports and skip otherwise): teachers, students and
//              parents lose portal access, the school administrator can only export data and ask
//              for a renewal; everything else is refused with 403 PLAN_EXPIRED
//   renewal  → the request lands in Platform Admin → Renewals; applying the next plan there closes
//              it, records what was agreed, and restores full access with nothing to restore
// Plan dates are moved straight in the database (the API refuses an end date before the start
// date), so this needs DB access. Run with PLAN_EXPIRY_ENFORCED=true to cover the lock itself.

const OWNER_PASS = 'OwnerPass@123'
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
async function newClient(): Promise<APIRequestContext> { return pwRequest.newContext({ baseURL: BASE }) }

test.describe.serial('Plan expiry: grace, lock, export, renewal queue', () => {
  const ts = Date.now()
  let platformCookie: string
  let schoolId = 0
  let ownerEmail = ''
  let owner: APIRequestContext
  let requestId = 0
  const skipNoDb = () => test.skip(!dbAvailable(), 'Needs database access to move the plan dates')

  const setDates = (startDaysAgo: number, endDaysFromToday: number) =>
    db().query(`UPDATE schools SET plan_start_date = $1, plan_end_date = $2 WHERE id = $3`,
      [addDays(today(), -startDaysAgo), addDays(today(), endDaysFromToday), schoolId])
  const status = async () => (await owner.get('/api/plan/status')).json()
  const addStaff = (tag: string) =>
    owner.post('/api/school-admin/staff-accounts', { data: { full_name: 'Test Person', email: `${tag}${ts}@planlock.test`, role: 'vice_principal' } })
  const platform = (path: string, init: RequestInit = {}) =>
    fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: platformCookie, ...(init.headers ?? {}) } })

  test.beforeAll(async () => {
    test.setTimeout(180000)
    if (!dbAvailable()) return
    platformCookie = await platformAdminCookie()
    const s = await createSchool(platformCookie, { name: `Plan Lock ${ts}`, email: `owner${ts}@planlock.test`, phone: `95${String(ts).slice(-8)}` })
    schoolId = s.id
    ownerEmail = s.email
    await setSubscription(platformCookie, schoolId, 'premium')
    owner = await newClient()
    expect((await owner.post('/api/auth/login', { data: { email: s.email, password: s.temp_password } })).status()).toBe(200)
    expect((await owner.post('/api/auth/change-password', { data: { newPassword: OWNER_PASS } })).status()).toBe(200)
    expect((await owner.put('/api/auth/profile', { data: { full_name: 'Owner', phone: '9000000012' } })).status()).toBe(200)
  })

  test.afterAll(async () => {
    test.setTimeout(120000)
    if (schoolId) await fetch(`${BASE}/api/schools/${schoolId}`, { method: 'DELETE', headers: { Cookie: platformCookie } }).catch(() => {})
    await owner?.dispose()
    await closeDb()
  })

  test('1. Ending soon: the school is told, and can still change things', async () => {
    skipNoDb()
    await setDates(350, 10)
    expect(await status()).toMatchObject({ plan_status: 'expiring', days_left: 10, locked: false, can_manage: true, renewal_requested_at: null })
    expect((await addStaff('soon')).status()).toBe(201)
  })

  test('2. Grace period: still full access, status says grace', async () => {
    skipNoDb()
    await setDates(370, -3)
    const st = await status()
    expect(st.plan_status).toBe('grace')
    expect(st.locked).toBe(false)
    expect((await addStaff('grace')).status()).toBe(201)
  })

  test('3. The school administrator can export data at any time; other people and unknown datasets are refused', async () => {
    skipNoDb()
    const res = await owner.get('/api/plan/export?dataset=staff')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('spreadsheetml')
    expect((await res.body()).subarray(0, 2).toString()).toBe('PK')                    // an .xlsx is a zip
    expect((await owner.get('/api/plan/export?dataset=all')).status()).toBe(200)
    expect((await owner.get('/api/plan/export?dataset=nope')).status()).toBe(400)
    const anon = await newClient()
    expect((await anon.get('/api/plan/export?dataset=students')).status()).toBe(403)
    await anon.dispose()
    // The export is in the audit log.
    const { logs } = await (await platform('/api/platform/audit?limit=100')).json()
    expect(logs.some((l: { action: string; entity_id: number }) => l.action === 'school_data_export' && l.entity_id === schoolId)).toBe(true)
  })

  test('4. Expired: the status says so', async () => {
    skipNoDb()
    await setDates(400, -30)
    expect((await status()).plan_status).toBe('expired')
  })

  test('5. Locked: every other request is refused with a clear message (enforcement on)', async () => {
    skipNoDb()
    test.skip(!(await status()).locked, 'Server is not running with PLAN_EXPIRY_ENFORCED=true')
    for (const res of [
      await owner.get(`/api/school-admin/staff-accounts?school_id=${schoolId}`),
      await addStaff('blocked'),
      await owner.get('/api/students'),
      await owner.get(`/api/schools/${schoolId}/subscription`),
    ]) {
      expect(res.status()).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('PLAN_EXPIRED')
      expect(body.error).toMatch(/plan has ended/i)
    }
  })

  test('6. Locked: the administrator can still sign in, see the plan status, export, and ask for a renewal', async () => {
    skipNoDb()
    const st = await status()
    expect(st.plan_status).toBe('expired')
    const fresh = await newClient()
    expect((await fresh.post('/api/auth/login', { data: { email: ownerEmail, password: OWNER_PASS } })).status()).toBe(200)
    expect((await fresh.get('/api/plan/export?dataset=students')).status()).toBe(200)
    await fresh.dispose()
    const res = await owner.post('/api/plan/renewal-request')
    expect(res.status()).toBe(200)
    expect((await status()).renewal_requested_at).toBeTruthy()
  })

  test('7. A second request while one is waiting is refused, not duplicated', async () => {
    skipNoDb()
    const again = await owner.post('/api/plan/renewal-request')
    expect(again.status()).toBe(429)
    expect((await again.json()).code).toBe('ALREADY_REQUESTED')
    const { rows } = await db().query(`SELECT count(*)::int AS n FROM plan_renewal_requests WHERE school_id = $1`, [schoolId])
    expect(rows[0].n).toBe(1)
  })

  test('8. The request shows in the platform admin Renewals queue, and can be worked', async () => {
    skipNoDb()
    const list = await (await platform('/api/platform/renewals?status=active')).json()
    const mine = list.requests.find((r: { school_id: number }) => r.school_id === schoolId)
    expect(mine, 'the school\'s request should be in the queue').toBeTruthy()
    expect(mine).toMatchObject({ status: 'open', plan_status: 'expired', school_name: `Plan Lock ${ts}`, requested_by_email: ownerEmail })
    expect(list.open_count).toBeGreaterThanOrEqual(1)
    requestId = mine.id

    expect((await platform(`/api/platform/renewals/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status: 'bogus' }) })).status).toBe(400)
    const ok = await platform(`/api/platform/renewals/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status: 'contacted', note: 'Spoke to the principal' }) })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ status: 'contacted', note: 'Spoke to the principal' })

    // Only the platform admin can see or work the queue.
    expect((await owner.get('/api/platform/renewals')).status()).toBe(401)
    const anon = await newClient()
    expect((await anon.patch(`/api/platform/renewals/${requestId}`, { data: { status: 'dismissed' } })).status()).toBe(401)
    await anon.dispose()
  })

  test('9. Expiry deleted nothing: every staff account is still there and active', async () => {
    skipNoDb()
    const { rows } = await db().query(
      `SELECT count(*)::int AS n FROM users WHERE school_id = $1 AND COALESCE(status, 'active') = 'active'`, [schoolId])
    expect(rows[0].n).toBe(3)                                     // owner + the two added in tests 1 and 2
  })

  test('10. Applying the next plan renews the school, closes the request and records what was agreed', async () => {
    skipNoDb()
    const nextEnd = addYears(today(), 2)
    const put = await platform(`/api/schools/${schoolId}/subscription`, { method: 'PUT', body: JSON.stringify({ tier: 'premium', plan_end_date: nextEnd }) })
    expect(put.status).toBe(200)
    const applied = await put.json()
    expect(applied).toMatchObject({ plan_start_date: today(), plan_end_date: nextEnd })

    const all = await (await platform('/api/platform/renewals?status=renewed')).json()
    const done = all.requests.find((r: { id: number }) => r.id === requestId)
    expect(done).toMatchObject({ status: 'renewed', next_tier: 'premium', next_end_date: nextEnd })
    expect(done.handled_by_email).toBeTruthy()

    const st = await status()
    expect(st).toMatchObject({ plan_status: 'active', locked: false, renewal_requested_at: null })
    // The proxy caches the locked list for a few seconds; the lift is live within that window.
    await expect.poll(async () => (await addStaff('renewed')).status(), { timeout: 30000, intervals: [2000] }).toBe(201)
  })

  test('11. A new request after the renewal starts a fresh entry', async () => {
    skipNoDb()
    await setDates(400, -30)
    expect((await owner.post('/api/plan/renewal-request')).status()).toBe(200)
    const { rows } = await db().query(`SELECT count(*)::int AS n FROM plan_renewal_requests WHERE school_id = $1`, [schoolId])
    expect(rows[0].n).toBe(2)
  })

  test('12. A platform admin is never restricted by a school being locked', async () => {
    skipNoDb()
    const res = await platform(`/api/schools/${schoolId}/subscription`)
    expect(res.status).toBe(200)
  })

  test('13. Unauthenticated users see no plan status and cannot ask for a renewal', async () => {
    const anon = await newClient()
    expect((await anon.get('/api/plan/status')).status()).toBe(401)
    expect((await anon.post('/api/plan/renewal-request')).status()).toBe(403)
    await anon.dispose()
  })
})
