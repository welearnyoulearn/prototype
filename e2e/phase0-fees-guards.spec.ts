import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Phase 0 fee regressions (#397):
//   1. payments/cancel 'correct' accepted no new_paid_date at all (regex lacked backslashes).
//   2. PATCH /api/fees/ledger/[id] for another school's bill 500'd (double client.release) instead of 403.
//   4. PATCH /api/fees/waivers for another school's waiver must 403 (auth now runs before any lock).
// Two throwaway schools; school B's admin attacks school A's rows.

async function api(path: string, method: string, body?: object, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function loginSchoolAdmin(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: identifier, password }),
    redirect: 'manual',
  })
  const authCookie = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-auth='))
  if (!authCookie) throw new Error(`Login failed for ${identifier} — status ${res.status}`)
  return authCookie.split(';')[0]
}

type Ledger = { id: number; amount_due: string; amount_paid: string }

test.describe.serial('Phase 0 fee guards', () => {
  const ts = Date.now()
  const AY = '3060-61'
  const schools: Array<{ id: number; cookie: string }> = []
  let studentId = 0
  let ledgerId = 0

  async function setupSchool(platformCookie: string, n: number): Promise<{ id: number; cookie: string }> {
    const s = await createSchool(platformCookie, {
      name: `Phase0 Fee School ${n} ${ts}`,
      phone: `9${String(ts + n).slice(-9)}`,
      email: `phase0fee${n}_${ts}@test.com`,
      address: '1 Guard Lane',
    })
    await setSubscription(platformCookie, s.id, 'premium')
    const cookie = await loginSchoolAdmin(s.email, s.temp_password)
    await api('/api/auth/profile', 'PUT', { full_name: `Phase0 Admin ${n}`, phone: `90000001${n}0` }, cookie)
    return { id: s.id, cookie }
  }

  test.beforeAll(async () => {
    test.setTimeout(180000)
    const platformCookie = await platformAdminCookie()
    schools.push(await setupSchool(platformCookie, 1), await setupSchool(platformCookie, 2))
    const [a] = schools

    const ay = await api('/api/academic-years', 'POST',
      { school_id: a.id, label: AY, start_date: '3060-04-01', end_date: '3061-03-31' }, a.cookie)
    expect([201, 409]).toContain(ay.status)
    const stu = await api('/api/students/bulk', 'POST', {
      school_id: a.id,
      students: [{
        name: 'Phase0 Student', grade: '9', section: 'A', school_roll_number: 1,
        parent_name: 'Parent', parent_phone: `9${String(ts + 7).slice(-9)}`,
      }],
    }, a.cookie)
    studentId = (stu.data as { students: Array<{ id: number }> }).students[0].id
    const cat = await api('/api/fees/categories', 'POST',
      { school_id: a.id, name: 'Annual Fee', frequency: 'annual', category_type: 'fixed' }, a.cookie)
    const categoryId = (cat.data as { id: number }).id
    const st = await api('/api/fees/structures', 'POST', {
      school_id: a.id, academic_year: AY,
      structures: [{ fee_category_id: categoryId, grade: '9', amount: 5000, due_day: 10 }],
    }, a.cookie)
    expect(st.status).toBe(201)
    const gen = await api('/api/fees/generate', 'POST', { school_id: a.id, academic_year: AY }, a.cookie)
    expect([200, 201]).toContain(gen.status)
    const { data } = await api(
      `/api/fees/ledger?school_id=${a.id}&student_id=${studentId}&academic_year=${AY}`, 'GET', undefined, a.cookie)
    ledgerId = (data as Ledger[])[0].id
  })

  test.afterAll(async () => {
    for (const s of schools) await api(`/api/schools/${s.id}`, 'DELETE', undefined, s.cookie).catch(() => {})
  })

  test('P0-1: correct accepts a valid new_paid_date and rejects an impossible one', async () => {
    const [a] = schools
    const pay = await api('/api/fees/payments', 'POST', {
      school_id: a.id, student_id: studentId, ledger_id: ledgerId,
      amount: 1000, payment_mode: 'cash', collected_by_name: 'Counter Staff',
    }, a.cookie)
    expect(pay.status).toBe(201)
    const paymentId = (pay.data as { id: number }).id

    const bad = await api('/api/fees/payments/cancel', 'POST', {
      payment_id: paymentId, action: 'correct', reason: 'Wrong date', new_paid_date: '2025-02-30',
    }, a.cookie)
    expect(bad.status).toBe(400)

    const ok = await api('/api/fees/payments/cancel', 'POST', {
      payment_id: paymentId, action: 'correct', reason: 'Wrong date', new_paid_date: '2025-01-15',
    }, a.cookie)
    expect(ok.status).toBe(200)
    expect((ok.data as { new_receipt: string | null }).new_receipt).toBeTruthy()
  })

  test('P0-2: PATCH another school\'s ledger entry returns 403, not 500', async () => {
    const [a, b] = schools
    const res = await api(`/api/fees/ledger/${ledgerId}`, 'PATCH',
      { school_id: a.id, new_amount: 1, reason: 'cross-tenant' }, b.cookie)
    expect(res.status).toBe(403)
    // The connection must be back in the pool: a follow-up request from the owner still works.
    const own = await api(`/api/fees/ledger/${ledgerId}`, 'PATCH',
      { school_id: a.id, new_amount: 6000, reason: 'raise' }, a.cookie)
    expect(own.status).toBe(200)
  })

  test('P0-4: PATCH another school\'s waiver returns 403 and leaves it untouched', async () => {
    const [a, b] = schools
    const w = await api('/api/fees/waivers', 'POST', {
      school_id: a.id, student_id: studentId, ledger_id: ledgerId,
      waiver_type: 'fixed_amount', waiver_value: 100, reason: 'Scholarship',
    }, a.cookie)
    expect(w.status).toBe(201)
    const waiverId = (w.data as { id: number }).id

    const res = await api('/api/fees/waivers', 'PATCH',
      { id: waiverId, new_waiver_amount: 50, reason: 'cross-tenant' }, b.cookie)
    expect(res.status).toBe(403)

    const owner = await api('/api/fees/waivers', 'PATCH',
      { id: waiverId, new_waiver_amount: 150, reason: 'Correction' }, a.cookie)
    expect(owner.status).toBe(200)
  })
})
