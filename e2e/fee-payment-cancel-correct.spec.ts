import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// POST /api/fees/payments/cancel — cancel and correct a recorded payment.
// Uses its own school + academic year so it cannot disturb workflow-fee-management.spec.ts.

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

type Ledger = { id: number; status: string; amount_due: string; amount_paid: string }
type Payment = {
  id: number; payment_status: string; receipt_number: string; amount: string
  cancelled_by: string | null; collected_by_name: string | null
}

test.describe.serial('Fee payments — cancel / correct', () => {
  const ts = Date.now()
  const AY = '3050-51'
  let schoolId = 0
  let cookie = ''
  let studentId = 0
  let categoryId = 0

  async function ledger(): Promise<Ledger> {
    const { data } = await api(
      `/api/fees/ledger?school_id=${schoolId}&student_id=${studentId}&academic_year=${AY}`, 'GET', undefined, cookie)
    return (data as Ledger[])[0]
  }
  async function pay(amount: number, mode = 'cash'): Promise<Payment> {
    const l = await ledger()
    const { status, data } = await api('/api/fees/payments', 'POST', {
      school_id: schoolId, student_id: studentId, ledger_id: l.id,
      amount, payment_mode: mode, collected_by_name: 'Counter Staff',
    }, cookie)
    expect(status).toBe(201)
    return data as Payment
  }
  async function payments(): Promise<Payment[]> {
    const { data } = await api(`/api/fees/payments?school_id=${schoolId}&student_id=${studentId}`, 'GET', undefined, cookie)
    return data as Payment[]
  }
  const cancelApi = (body: object, c: string | undefined = cookie) => api('/api/fees/payments/cancel', 'POST', body, c)

  test.beforeAll(async () => {
    test.setTimeout(120000)
    const platformCookie = await platformAdminCookie()
    const s = await createSchool(platformCookie, {
      name: `Cancel Test School ${ts}`,
      phone: `9${String(ts).slice(-9)}`,
      email: `cancelschool${ts}@test.com`,
      address: '1 Cancel Lane',
    })
    schoolId = s.id
    await setSubscription(platformCookie, schoolId, 'premium')
    cookie = await loginSchoolAdmin(s.email, s.temp_password)
    await api('/api/auth/profile', 'PUT', { full_name: 'Cancel Admin', phone: '9000000088' }, cookie)

    const ay = await api('/api/academic-years', 'POST',
      { school_id: schoolId, label: AY, start_date: '3050-04-01', end_date: '3051-03-31' }, cookie)
    expect([201, 409]).toContain(ay.status)

    const stu = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Cancel Student', grade: '9', section: 'A', school_roll_number: 1,
        parent_name: 'Parent', parent_phone: `9${String(ts + 1).slice(-9)}`,
      }],
    }, cookie)
    studentId = (stu.data as { students: Array<{ id: number }> }).students[0].id

    const cat = await api('/api/fees/categories', 'POST',
      { school_id: schoolId, name: 'Annual Fee', frequency: 'annual', category_type: 'fixed' }, cookie)
    categoryId = (cat.data as { id: number }).id
    const st = await api('/api/fees/structures', 'POST', {
      school_id: schoolId, academic_year: AY,
      structures: [{ fee_category_id: categoryId, grade: '9', amount: 5000, due_day: 10 }],
    }, cookie)
    expect(st.status).toBe(201)
    const gen = await api('/api/fees/generate', 'POST', { school_id: schoolId, academic_year: AY }, cookie)
    expect([200, 201]).toContain(gen.status)
  })

  test.afterAll(async () => {
    await api(`/api/schools/${schoolId}`, 'DELETE', undefined, cookie).catch(() => {})
  })

  test('CC-001: cancel a completed payment reverses the ledger', async () => {
    const p = await pay(2000)
    expect(parseFloat((await ledger()).amount_paid)).toBe(2000)

    const { status, data } = await cancelApi({ payment_id: p.id, action: 'cancel', reason: 'Entered by mistake' })
    expect(status).toBe(200)
    expect((data as { reversed_amount: number }).reversed_amount).toBe(2000)

    const l = await ledger()
    expect(parseFloat(l.amount_paid)).toBe(0)
    expect(['pending', 'overdue']).toContain(l.status)
    expect((await payments()).find(x => x.id === p.id)?.payment_status).toBe('cancelled')
  })

  test('CC-002: cancelling an already-cancelled payment → 409, ledger not reversed twice', async () => {
    const cancelled = (await payments()).find(x => x.payment_status === 'cancelled')!
    const { status } = await cancelApi({ payment_id: cancelled.id, action: 'cancel', reason: 'again' })
    expect(status).toBe(409)
    expect(parseFloat((await ledger()).amount_paid)).toBe(0)
  })

  test('CC-003: correct issues a new receipt and the right ledger amount', async () => {
    const p = await pay(1000)
    const { status, data } = await cancelApi({
      payment_id: p.id, action: 'correct', reason: 'Wrong amount', new_amount: 1500, new_payment_mode: 'upi',
    })
    expect(status).toBe(200)
    const d = data as { new_receipt: string; cancelled_receipt: string }
    expect(d.new_receipt).toBeTruthy()
    expect(d.new_receipt).not.toBe(d.cancelled_receipt)
    expect(d.new_receipt).toMatch(/^RCP-\d{3}-\d{4}-\d{6}$/)

    expect(parseFloat((await ledger()).amount_paid)).toBe(1500)
    const all = await payments()
    expect(all.find(x => x.id === p.id)?.payment_status).toBe('cancelled')
    const fresh = all.find(x => x.receipt_number === d.new_receipt)!
    expect(fresh.payment_status).toBe('completed')
    // The original collector stays on the replacement payment (#289).
    expect(fresh.collected_by_name).toBe('Counter Staff')
  })

  test('CC-004: correcting to more than the balance → 400 and nothing changes', async () => {
    const before = await ledger()
    const target = (await payments()).find(x => x.payment_status === 'completed')!
    const { status } = await cancelApi({ payment_id: target.id, action: 'correct', reason: 'too much', new_amount: 999999 })
    expect(status).toBe(400)
    expect(parseFloat((await ledger()).amount_paid)).toBe(parseFloat(before.amount_paid))
    // The whole transaction rolled back — the original is still completed.
    expect((await payments()).find(x => x.id === target.id)?.payment_status).toBe('completed')
  })

  test('CC-005: correct with a malformed or future paid date → 400', async () => {
    const target = (await payments()).find(x => x.payment_status === 'completed')!
    for (const bad of ['not-a-date', '2999-01-01']) {
      const { status } = await cancelApi({ payment_id: target.id, action: 'correct', reason: 'bad date', new_paid_date: bad })
      expect(status).toBe(400)
    }
    expect((await payments()).find(x => x.id === target.id)?.payment_status).toBe('completed')
  })

  test('CC-006: correct with zero amount or an unknown mode → 400', async () => {
    const target = (await payments()).find(x => x.payment_status === 'completed')!
    const zero = await cancelApi({ payment_id: target.id, action: 'correct', reason: 'x', new_amount: 0 })
    expect(zero.status).toBe(400)
    const mode = await cancelApi({ payment_id: target.id, action: 'correct', reason: 'x', new_payment_mode: 'bitcoin' })
    expect(mode.status).toBe(400)
  })

  test('CC-007: a reason is required', async () => {
    const target = (await payments()).find(x => x.payment_status === 'completed')!
    const { status } = await cancelApi({ payment_id: target.id, action: 'cancel' })
    expect(status).toBe(400)
  })

  test('CC-008: unauthenticated request is denied', async () => {
    const target = (await payments())[0]
    const { status } = await cancelApi({ payment_id: target.id, action: 'cancel', reason: 'x' }, undefined)
    expect([401, 403]).toContain(status)
  })

  test('CC-009: the actor comes from the session, not the request body', async () => {
    const p = await pay(500)
    const { status } = await cancelApi({ payment_id: p.id, action: 'cancel', reason: 'actor check', done_by: 'Spoofed Person' })
    expect(status).toBe(200)
    const row = (await payments()).find(x => x.id === p.id)!
    expect(row.cancelled_by).toBeTruthy()
    expect(row.cancelled_by).not.toContain('Spoofed')
  })
})
