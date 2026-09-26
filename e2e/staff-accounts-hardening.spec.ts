import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'
import { dbAvailable, closeDb, latestInviteToken } from './fixtures/db'

// Staff accounts (School Administrator / Principal / Vice Principal logins) and the
// plan seat limits that cap them. Regression tests for issue #234. Each school here is
// created by the test and deleted afterwards; nothing touches shared fixtures.
//
// Not covered here: two administrators deactivating each other at the SAME instant (the
// last-administrator guard) — that needs two live sessions racing, which this
// single-process harness can't do deterministically. Sequentially the self-deactivation
// rule already prevents it; the guard exists for the race.

const OWNER_PASS = 'OwnerPass@123'
const STAFF_PASS = 'StaffPass@123'

async function newClient(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE })
}
async function login(ctx: APIRequestContext, email: string, password: string) {
  return ctx.post('/api/auth/login', { data: { email, password } })
}
/** First login with the temp password, then set a real one (mirrors the staff-sessions spec). */
async function ownerClient(email: string, tempPass: string): Promise<APIRequestContext> {
  const ctx = await newClient()
  expect((await login(ctx, email, tempPass)).status()).toBe(200)
  expect((await ctx.post('/api/auth/change-password', { data: { newPassword: OWNER_PASS } })).status()).toBe(200)
  expect((await ctx.put('/api/auth/profile', { data: { full_name: 'Owner', phone: '9000000011' } })).status()).toBe(200)
  return ctx
}
type Staff = { id: number; email: string; status: string; role: string }
async function listStaff(ctx: APIRequestContext, schoolId: number): Promise<Staff[]> {
  return (await ctx.get(`/api/school-admin/staff-accounts?school_id=${schoolId}`)).json()
}
async function addStaff(ctx: APIRequestContext, email: string, role = 'principal', extra: object = {}) {
  return ctx.post('/api/school-admin/staff-accounts', { data: { full_name: 'Test Person', email, role, ...extra } })
}
async function planTier(platformCookie: string, schoolId: number): Promise<string> {
  const res = await fetch(`${BASE}/api/schools/${schoolId}/subscription`, { headers: { Cookie: platformCookie } })
  return (await res.json()).tier
}

test.describe.serial('Staff accounts — plan security, seat limits, deactivation', () => {
  const ts = Date.now()
  let platformCookie: string
  const schools: number[] = []
  let a: { id: number; email: string; pass: string }   // basic plan (seat-limited)
  let b: { id: number; email: string; pass: string }   // premium (unlimited) — used as "the other school"
  let ownerA: APIRequestContext
  let ownerB: APIRequestContext
  // Tests 7-9 fill and overflow the basic plan's seats, so they only make sense (and only
  // stay cheap) when that limit is a small finite number. They share one gate so they
  // skip together — 9 depends on the account 7 and 8 create and deactivate.
  let seatLimit: number | null = null
  const seatTestsOk = () => seatLimit != null && seatLimit >= 2 && seatLimit <= 6

  test.beforeAll(async () => {
    test.setTimeout(180000)
    platformCookie = await platformAdminCookie()
    const mk = async (label: string, tier: string) => {
      const s = await createSchool(platformCookie, {
        name: `Staff Hardening ${label} ${ts}`, email: `owner${label}${ts}@hardening.test`,
        phone: `98${label === 'A' ? '1' : '2'}${String(ts).slice(-7)}`,
      })
      schools.push(s.id)
      await setSubscription(platformCookie, s.id, tier)
      return { id: s.id, email: s.email, pass: s.temp_password }
    }
    a = await mk('A', 'basic')
    b = await mk('B', 'premium')
    ownerA = await ownerClient(a.email, a.pass)
    ownerB = await ownerClient(b.email, b.pass)
    seatLimit = (await (await ownerA.get(`/api/schools/${a.id}/subscription`)).json()).staff_limit ?? null
  })

  test.afterAll(async () => {
    test.setTimeout(240000)
    const c = await newClient()
    for (const id of schools) await c.delete(`/api/schools/${id}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await c.dispose(); await ownerA?.dispose(); await ownerB?.dispose()
    await closeDb()
  })

  // ── A school's plan can't be read or changed by strangers ──────────────────────

  test('1. Reading a school\'s plan needs a login', async () => {
    const anon = await newClient()
    expect((await anon.get(`/api/schools/${a.id}/subscription`)).status()).toBe(401)
    await anon.dispose()
  })

  test('2. Changing a plan without logging in is refused and changes nothing', async () => {
    const anon = await newClient()
    const res = await anon.put(`/api/schools/${a.id}/subscription`, { data: { tier: 'premium' } })
    expect(res.status()).toBe(401)
    expect(await planTier(platformCookie, a.id)).toBe('basic')
    await anon.dispose()
  })

  test('3. A school administrator cannot change their own plan', async () => {
    const res = await ownerA.put(`/api/schools/${a.id}/subscription`, { data: { tier: 'premium' } })
    expect(res.status()).toBe(401)
    expect(await planTier(platformCookie, a.id)).toBe('basic')
  })

  test('4. Staff can read their own school\'s plan, not another school\'s', async () => {
    const own = await ownerA.get(`/api/schools/${a.id}/subscription`)
    expect(own.status()).toBe(200)
    expect((await own.json()).tier).toBe('basic')
    expect((await ownerA.get(`/api/schools/${b.id}/subscription`)).status()).toBe(401)
  })

  // ── Staff can only be created in your own school ───────────────────────────────

  test('5. Sending another school\'s id cannot create an account there', async () => {
    const before = (await listStaff(ownerB, b.id)).length
    const res = await addStaff(ownerA, `intruder${ts}@hardening.test`, 'school_admin', { school_id: b.id })
    expect(res.status()).toBe(403)
    expect((await listStaff(ownerB, b.id)).length).toBe(before)
  })

  // ── Platform staff limits: validated, never silently "unlimited" ───────────────

  test('6. Bad staff-limit values are rejected instead of becoming unlimited', async () => {
    const post = (staffLimits: object) => fetch(`${BASE}/api/platform/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: platformCookie },
      body: JSON.stringify({ assignments: [], staffLimits }),
    })
    const read = async () => (await (await fetch(`${BASE}/api/platform/features`, { headers: { Cookie: platformCookie } })).json()).staffLimits
    const before = await read()
    for (const bad of [{ basic: '0' }, { basic: '-3' }, { basic: 'abc' }, { basic: '2.5' }, { basic: '99999' }, { nonsense: '3' }]) {
      const res = await post(bad)
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
    // Nothing above changed any limit.
    expect(await read()).toEqual(before)
  })

  // ── Seat limits ────────────────────────────────────────────────────────────────

  test('7. A new account is returned as active (so the list shows the right buttons)', async () => {
    test.skip(!seatTestsOk(), 'Needs a finite basic-plan staff limit between 2 and 6')
    const res = await addStaff(ownerA, `first${ts}@hardening.test`)
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('active')
    expect(body.first_login).toBe(true)
  })

  test('8. Seats can\'t be exceeded — including by reactivating an old account', async () => {
    test.skip(!seatTestsOk(), 'Needs a finite basic-plan staff limit between 2 and 6')
    const limit = seatLimit as number

    // Fill every seat (owner + test 7's account already hold two).
    let staff = await listStaff(ownerA, a.id)
    let active = staff.filter(s => s.status === 'active').length
    for (let i = 0; active < limit; i++, active++) {
      expect((await addStaff(ownerA, `fill${i}${ts}@hardening.test`, 'vice_principal')).status()).toBe(201)
    }
    // One more is refused.
    const over = await addStaff(ownerA, `over${ts}@hardening.test`)
    expect(over.status()).toBe(403)
    expect((await over.json()).error).toMatch(/limit/i)

    // Free a seat, give it to someone new, then try to bring the old one back.
    staff = await listStaff(ownerA, a.id)
    const victim = staff.find(s => s.email === `first${ts}@hardening.test`)!
    expect((await ownerA.delete('/api/school-admin/staff-accounts', { data: { id: victim.id } })).status()).toBe(200)
    expect((await addStaff(ownerA, `replacement${ts}@hardening.test`)).status()).toBe(201)

    const back = await ownerA.patch('/api/school-admin/staff-accounts', { data: { id: victim.id } })
    expect(back.status()).toBe(403)                        // used to sail through, going over the limit
    expect((await back.json()).error).toMatch(/limit/i)
    const after = await listStaff(ownerA, a.id)
    expect(after.filter(s => s.status === 'active').length).toBe(limit)
    expect(after.find(s => s.id === victim.id)!.status).toBe('inactive')
  })

  test('9. A deactivated email is told to use Reactivate, not "already registered"', async () => {
    test.skip(!seatTestsOk(), 'Needs a finite basic-plan staff limit between 2 and 6')
    const res = await addStaff(ownerA, `first${ts}@hardening.test`)
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toMatch(/reactivate/i)
  })

  test('10. You cannot deactivate yourself', async () => {
    const me = (await listStaff(ownerA, a.id)).find(s => s.email === a.email)!
    expect((await ownerA.delete('/api/school-admin/staff-accounts', { data: { id: me.id } })).status()).toBe(400)
  })

  // ── Needs the DB to read the emailed invite links ─────────────────────────────

  test.describe('roles, invite links and recovery', () => {
    let c: { id: number; email: string; pass: string }
    let ownerC: APIRequestContext

    test.beforeAll(async () => {
      test.setTimeout(120000)
      test.skip(!dbAvailable(), 'Needs DB access to read the emailed invite token')
      const s = await createSchool(platformCookie, {
        name: `Staff Hardening C ${ts}`, email: `ownerC${ts}@hardening.test`, phone: `983${String(ts).slice(-7)}`,
      })
      schools.push(s.id)
      await setSubscription(platformCookie, s.id, 'premium')
      c = { id: s.id, email: s.email, pass: s.temp_password }
      ownerC = await ownerClient(c.email, c.pass)
    })
    test.afterAll(async () => { await ownerC?.dispose() })

    async function acceptInvite(email: string): Promise<APIRequestContext> {
      const { token } = await latestInviteToken(email)
      const anon = await newClient()
      expect((await anon.post('/api/auth/reset-password', { data: { token, newPassword: STAFF_PASS } })).status()).toBe(200)
      await anon.dispose()
      const ctx = await newClient()
      expect((await login(ctx, email, STAFF_PASS)).status()).toBe(200)
      return ctx
    }

    test('11. A vice principal cannot add, deactivate or reactivate accounts', async () => {
      const vpEmail = `vp${ts}@hardening.test`
      expect((await addStaff(ownerC, vpEmail, 'vice_principal')).status()).toBe(201)
      const vp = await acceptInvite(vpEmail)

      // The escalation this used to allow: creating a second School Administrator.
      expect((await addStaff(vp, `sneaky${ts}@hardening.test`, 'school_admin')).status()).toBe(403)
      expect((await addStaff(vp, `sneaky2${ts}@hardening.test`, 'principal')).status()).toBe(403)

      const owner = (await listStaff(vp, c.id)).find(s => s.email === c.email)!   // they can still see the list
      expect((await vp.delete('/api/school-admin/staff-accounts', { data: { id: owner.id } })).status()).toBe(403)
      expect((await vp.patch('/api/school-admin/staff-accounts', { data: { id: owner.id } })).status()).toBe(403)
      await vp.dispose()
    })

    test('12. Deactivating voids the unused invite link and blocks password reset', async () => {
      const email = `pending${ts}@hardening.test`
      expect((await addStaff(ownerC, email)).status()).toBe(201)
      const { token } = await latestInviteToken(email)
      const target = (await listStaff(ownerC, c.id)).find(s => s.email === email)!
      expect((await ownerC.delete('/api/school-admin/staff-accounts', { data: { id: target.id } })).status()).toBe(200)

      await expect(latestInviteToken(email)).rejects.toThrow()                 // link no longer usable
      const anon = await newClient()
      expect((await anon.post('/api/auth/reset-password', { data: { token, newPassword: STAFF_PASS } })).status()).toBe(400)

      // …and asking for a fresh reset link while deactivated does not create one.
      expect((await anon.post('/api/auth/forgot-password', { data: { identifier: email } })).status()).toBe(200)
      await expect(latestInviteToken(email)).rejects.toThrow()
      await anon.dispose()
    })

    test('13. Platform reset gets a deactivated owner back in', async () => {
      const adminEmail = `admin2${ts}@hardening.test`
      expect((await addStaff(ownerC, adminEmail, 'school_admin')).status()).toBe(201)
      const admin2 = await acceptInvite(adminEmail)

      const owner = (await listStaff(admin2, c.id)).find(s => s.email === c.email)!
      expect((await admin2.delete('/api/school-admin/staff-accounts', { data: { id: owner.id } })).status()).toBe(200)
      const stale = await newClient()
      expect((await login(stale, c.email, OWNER_PASS)).status()).toBe(403)
      await stale.dispose()

      const reset = await fetch(`${BASE}/api/platform/schools/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: platformCookie },
        body: JSON.stringify({ school_id: c.id }),
      })
      expect(reset.status).toBe(200)
      const { temp_password } = await reset.json()
      const back = await newClient()
      expect((await login(back, c.email, temp_password)).status()).toBe(200)   // reactivated and can sign in
      await back.dispose(); await admin2.dispose()
    })
  })
})
