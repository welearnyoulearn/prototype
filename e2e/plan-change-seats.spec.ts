import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Plan changes and staff seats (issue #235): what happens to a school's staff accounts when
// the platform admin downgrades or upgrades its plan, or lowers a plan's limit — including
// the deactivate-then-change and change-then-deactivate orders.
//
// The rules under test:
//   • Seats = active accounts only. A plan change never switches anybody off.
//   • A change that would leave a school over its limit is refused until the platform admin
//     confirms it; the school then keeps every account working but can't add or reactivate.
//   • Upgrading frees seats and never reactivates anybody.
//
// The scenario needs the Basic plan's limit to be a small finite number; otherwise the
// tests skip (there is nothing to go over).

const OWNER_PASS = 'OwnerPass@123'

async function newClient(): Promise<APIRequestContext> { return pwRequest.newContext({ baseURL: BASE }) }
async function login(ctx: APIRequestContext, email: string, password: string) {
  return ctx.post('/api/auth/login', { data: { email, password } })
}
async function ownerClient(email: string, tempPass: string): Promise<APIRequestContext> {
  const ctx = await newClient()
  expect((await login(ctx, email, tempPass)).status()).toBe(200)
  expect((await ctx.post('/api/auth/change-password', { data: { newPassword: OWNER_PASS } })).status()).toBe(200)
  expect((await ctx.put('/api/auth/profile', { data: { full_name: 'Owner', phone: '9000000011' } })).status()).toBe(200)
  return ctx
}
type Staff = { id: number; email: string; status: string; role: string }

test.describe.serial('Plan changes and staff seats', () => {
  const ts = Date.now()
  let platformCookie: string
  let schoolId = 0
  let ownerEmail = ''
  let owner: APIRequestContext
  let basicLimit: number | null = null
  let total = 0                                   // active accounts we start with = basicLimit + 2
  const seatsOk = () => basicLimit != null && basicLimit >= 1 && basicLimit <= 5

  const listStaff = async (): Promise<Staff[]> =>
    (await owner.get(`/api/school-admin/staff-accounts?school_id=${schoolId}`)).json()
  const activeCount = async () => (await listStaff()).filter(s => s.status === 'active').length
  const addStaff = (email: string) =>
    owner.post('/api/school-admin/staff-accounts', { data: { full_name: 'Test Person', email, role: 'vice_principal' } })
  const deactivate = (id: number) => owner.delete('/api/school-admin/staff-accounts', { data: { id } })
  const reactivate = (id: number) => owner.patch('/api/school-admin/staff-accounts', { data: { id } })
  const putPlan = async (tier: string, confirm = false) => {
    const res = await fetch(`${BASE}/api/schools/${schoolId}/subscription`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: platformCookie },
      body: JSON.stringify({ tier, confirm_over_limit: confirm || undefined }),
    })
    return { status: res.status, body: await res.json() }
  }
  const schoolPlan = async () => (await owner.get(`/api/schools/${schoolId}/subscription`)).json()
  /** Deactivates non-owner active accounts until exactly `target` remain active. */
  async function deactivateDownTo(target: number) {
    const staff = (await listStaff()).filter(s => s.status === 'active' && s.email !== ownerEmail)
    let active = await activeCount()
    for (const s of staff) {
      if (active <= target) break
      expect((await deactivate(s.id)).status()).toBe(200)
      active--
    }
    expect(await activeCount()).toBe(target)
  }

  test.beforeAll(async () => {
    test.setTimeout(240000)
    platformCookie = await platformAdminCookie()
    const cfg = await (await fetch(`${BASE}/api/platform/features`, { headers: { Cookie: platformCookie } })).json()
    basicLimit = cfg.staffLimits?.basic ?? null
    if (!seatsOk()) return

    const s = await createSchool(platformCookie, {
      name: `Plan Change Seats ${ts}`, email: `owner${ts}@planchange.test`, phone: `97${String(ts).slice(-8)}`,
    })
    schoolId = s.id
    ownerEmail = s.email
    await setSubscription(platformCookie, schoolId, 'premium')
    owner = await ownerClient(s.email, s.temp_password)

    // Fill the school to exactly two more active accounts than Basic allows.
    total = (basicLimit as number) + 2
    for (let i = 0; i < total - 1; i++) {
      expect((await addStaff(`seat${i}${ts}@planchange.test`)).status()).toBe(201)
    }
    expect(await activeCount()).toBe(total)
  })

  test.afterAll(async () => {
    test.setTimeout(240000)
    if (schoolId) {
      const c = await newClient()
      await c.delete(`/api/schools/${schoolId}`, { headers: { Cookie: platformCookie } }).catch(() => {})
      await c.dispose()
    }
    await owner?.dispose()
  })

  test('1. A downgrade that would go over the limit needs confirmation and changes nothing', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    const r = await putPlan('basic')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('OVER_SEAT_LIMIT')
    expect(r.body).toMatchObject({ tier: 'basic', limit: basicLimit, active: total, excess: 2 })
    expect((await schoolPlan()).tier).toBe('premium')          // untouched
    expect(await activeCount()).toBe(total)
  })

  test('2. Lowering a plan\'s limit lists the schools it would push over, and saves nothing', async () => {
    test.skip(!seatsOk() || (basicLimit as number) < 2, 'Needs a Basic limit of at least 2 to lower it')
    // Move the school to Basic first (confirmed) so it is one of the schools on that plan.
    expect((await putPlan('basic', true)).status).toBe(200)
    const before = await (await fetch(`${BASE}/api/platform/features`, { headers: { Cookie: platformCookie } })).json()
    const res = await fetch(`${BASE}/api/platform/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: platformCookie },
      body: JSON.stringify({ assignments: [], staffLimits: { basic: '1' } }),
    })
    if (res.status === 200) {
      // The guard failed and the lowered limit really was saved — put it back before failing,
      // so a bug here can't leave the shared plan configuration changed.
      await fetch(`${BASE}/api/platform/features`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: platformCookie },
        body: JSON.stringify({ assignments: [], staffLimits: { basic: String(basicLimit) } }),
      })
    }
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('OVER_SEAT_LIMIT')
    expect(body.affected.find((a: { tier: string }) => a.tier === 'basic')?.count).toBeGreaterThanOrEqual(1)
    const after = await (await fetch(`${BASE}/api/platform/features`, { headers: { Cookie: platformCookie } })).json()
    expect(after.staffLimits).toEqual(before.staffLimits)      // nothing was saved
  })

  test('3. A confirmed downgrade goes through — nobody is disabled, the school is over its limit', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    if ((await schoolPlan()).tier !== 'basic') expect((await putPlan('basic', true)).status).toBe(200)
    const plan = await schoolPlan()
    expect(plan.tier).toBe('basic')
    expect(plan).toMatchObject({ staff_limit: basicLimit, active_staff: total, seats_over: 2 })
    expect(await activeCount()).toBe(total)                    // every account still active
  })

  test('4. The plan change is recorded with who made it and the seat numbers', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    const { logs } = await (await fetch(`${BASE}/api/platform/audit?limit=200`, { headers: { Cookie: platformCookie } })).json()
    const entry = logs.find((l: { action: string; entity_id: number; details: { to?: string; confirmed_over_limit?: boolean } }) =>
      l.action === 'update_subscription' && l.entity_id === schoolId && l.details?.to === 'basic' && l.details?.confirmed_over_limit === true)
    expect(entry, 'a confirmed downgrade to basic should be in the audit log').toBeTruthy()
    expect(entry.details).toMatchObject({ from: 'premium', active_staff: total, over_by: 2 })
    expect(entry.actor_email).toBeTruthy()
  })

  test('5. While over the limit, adding and reactivating are both refused', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    const victim = (await listStaff()).find(s => s.status === 'active' && s.email !== ownerEmail)!
    expect((await deactivate(victim.id)).status()).toBe(200)   // over by 1 now, still over
    expect((await schoolPlan()).seats_over).toBe(1)

    const add = await addStaff(`blocked${ts}@planchange.test`)
    expect(add.status()).toBe(403)
    expect((await add.json()).error).toMatch(/limit/i)
    expect((await reactivate(victim.id)).status()).toBe(403)
  })

  test('6. Deactivating down to exactly the limit clears the warning but still leaves no free seat', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    await deactivateDownTo(basicLimit as number)
    expect((await schoolPlan()).seats_over).toBe(0)
    expect((await addStaff(`full${ts}@planchange.test`)).status()).toBe(403)   // at the limit, no room
  })

  test('7. Upgrading frees seats but reactivates nobody', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    const inactiveBefore = (await listStaff()).filter(s => s.status === 'inactive').length
    expect(inactiveBefore).toBeGreaterThan(0)

    expect((await putPlan('premium')).status).toBe(200)         // an upgrade never needs confirmation
    const inactiveAfter = (await listStaff()).filter(s => s.status === 'inactive')
    expect(inactiveAfter.length).toBe(inactiveBefore)           // still deactivated — nobody came back by themselves

    // Now there is room: add someone new, and bring one deactivated person back.
    expect((await addStaff(`room${ts}@planchange.test`)).status()).toBe(201)
    expect((await reactivate(inactiveAfter[0].id)).status()).toBe(200)
  })

  test('8. Deactivating BEFORE the downgrade means no warning at all', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    await deactivateDownTo(basicLimit as number)
    const r = await putPlan('basic')                            // no confirm flag
    expect(r.status).toBe(200)
    expect(r.body.seats).toMatchObject({ limit: basicLimit, active: basicLimit, over: 0 })
    expect((await schoolPlan()).seats_over).toBe(0)
  })

  test('9. Staying on the same plan never asks for confirmation', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    expect((await putPlan('basic')).status).toBe(200)
  })

  test('10. Only the platform admin can confirm or change a plan', async () => {
    test.skip(!seatsOk(), 'Needs a finite Basic staff limit between 1 and 5')
    const res = await owner.put(`/api/schools/${schoolId}/subscription`, { data: { tier: 'premium', confirm_over_limit: true } })
    expect(res.status()).toBe(401)
    expect((await schoolPlan()).tier).toBe('basic')
  })
})
