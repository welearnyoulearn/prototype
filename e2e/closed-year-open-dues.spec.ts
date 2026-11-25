import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// #495 — dues left open when a year is closed can still be collected, waived, carried forward or written off.
// Everything else about the closed year stays locked. #509 — a reported payment is never stranded by a decision.

async function api(path: string, method: string, body?: object, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: Record<string, unknown>
  try { data = JSON.parse(text) } catch { data = { text } }
  return { status: res.status, data }
}

type Bill = { id: number; status: string; amount_due: string; amount_paid: string; period_label: string }

test.describe.serial('Open dues in a closed fee year (#495)', () => {
  const ts = Date.now()
  const AY = '3060-61'
  const NEXT = '3061-62'
  let schoolId = 0
  let cookie = ''
  const students: number[] = []
  let earlyPaymentId = 0
  let latePaymentId = 0

  const bills = async (studentId: number, year = AY) =>
    (await api(`/api/fees/ledger?school_id=${schoolId}&student_id=${studentId}&academic_year=${year}`, 'GET', undefined, cookie))
      .data as unknown as Bill[]
  const balance = async (studentId: number, year = AY) => (await pool.query<{ b: number }>(
    `SELECT COALESCE(SUM(GREATEST(amount_due - COALESCE(waiver_amount,0) - amount_paid, 0)),0)::float8 AS b
     FROM student_fee_ledger WHERE school_id = $1 AND student_id = $2 AND academic_year = $3`, [schoolId, studentId, year])).rows[0].b
  const closeRecord = async () => (await pool.query(
    'SELECT closed_at::text, closed_by, is_reopened, close_reason FROM fee_year_close WHERE school_id = $1 AND academic_year = $2', [schoolId, AY])).rows[0]

  const pay = async (studentId: number, amount: number, extra: object = {}) => api('/api/fees/payments', 'POST', {
    school_id: schoolId, student_id: studentId, ledger_id: (await bills(studentId))[0].id, amount, payment_mode: 'cash',
    collected_by_name: 'Counter', ...extra,
  }, cookie)
  const decide = (studentId: number, decision: string) => api('/api/fees/year-end', 'POST',
    { action: 'apply', school_id: schoolId, from_year: AY, to_year: NEXT, decisions: [{ student_id: studentId, decision, reason: 'test decision' }] }, cookie)

  test.beforeAll(async () => {
    test.setTimeout(180000)
    const platform = await platformAdminCookie()
    const school = await createSchool(platform, { name: `Open Dues ${ts}`, email: `opendues-${ts}@test.invalid`, phone: `9${String(ts).slice(-9)}` })
    schoolId = school.id
    await setSubscription(platform, schoolId, 'premium')
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: school.email, password: school.temp_password }),
    })
    cookie = (login.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-auth='))!.split(';')[0]

    for (const [label, start, end] of [[AY, '3060-04-01', '3061-03-31'], [NEXT, '3061-04-01', '3062-03-31']]) {
      expect((await api('/api/academic-years', 'POST', { school_id: schoolId, label, start_date: start, end_date: end }, cookie)).status).toBe(201)
    }
    const bulk = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: ['Asha', 'Bala', 'Chitra', 'Dev'].map((name, i) => ({
        name: `${name} Open`, grade: '8', section: 'A', school_roll_number: i + 1,
        parent_name: 'Open Parent', parent_phone: `8${String(ts + i).slice(-9)}`,
      })),
    }, cookie)
    students.push(...(bulk.data.students as Array<{ id: number }>).map(s => s.id))
    expect(students).toHaveLength(4)
    const cat = await api('/api/fees/categories', 'POST', { school_id: schoolId, name: 'Annual Fee', frequency: 'annual' }, cookie)
    expect((await api('/api/fees/structures', 'POST', {
      school_id: schoolId, academic_year: AY, structures: [{ fee_category_id: cat.data.id, grade: '8', amount: 1000, due_day: 10 }],
    }, cookie)).status).toBe(201)
    const generated = await api('/api/fees/generate', 'POST', { school_id: schoolId, academic_year: AY }, cookie)
    expect(generated.status, JSON.stringify(generated.data)).toBeLessThan(300)

    const early = await pay(students[0], 100)
    expect(early.status).toBe(201)
    earlyPaymentId = early.data.id as number
    const closed = await api('/api/fees/year-end', 'POST', { action: 'close', school_id: schoolId, from_year: AY, reason: 'closing with dues open' }, cookie)
    expect(closed.status, JSON.stringify(closed.data)).toBe(200)
  })

  test('collect: a payment is accepted, and overpaying is still refused', async () => {
    expect((await pay(students[0], 5000)).status).toBeGreaterThanOrEqual(400)
    const res = await pay(students[0], 300)
    expect(res.status, JSON.stringify(res.data)).toBe(201)
    latePaymentId = res.data.id as number
    expect(await balance(students[0])).toBe(600)
  })

  test('cancel: only payments recorded after the close can be undone', async () => {
    const cancel = (id: number) => api('/api/fees/payments/cancel', 'POST', { payment_id: id, action: 'cancel', reason: 'entered by mistake' }, cookie)
    expect((await cancel(earlyPaymentId)).status).toBe(409)
    expect((await cancel(latePaymentId)).status).toBe(200)
    expect(await balance(students[0])).toBe(900)
  })

  test('waive: granted after the close, and can be revoked', async () => {
    const res = await api('/api/fees/waivers', 'POST', {
      school_id: schoolId, student_id: students[0], ledger_id: (await bills(students[0]))[0].id,
      waiver_type: 'fixed_amount', waiver_value: 200, reason: 'hardship',
    }, cookie)
    expect(res.status, JSON.stringify(res.data)).toBeLessThan(300)
    expect(await balance(students[0])).toBe(700)
    const id = (await pool.query<{ id: number }>('SELECT id FROM fee_waivers WHERE student_id = $1 AND is_revoked = FALSE ORDER BY id DESC LIMIT 1', [students[0]])).rows[0].id
    const revoke = await api(`/api/fees/waivers?id=${id}&revoke_reason=mistake&reason=mistake`, 'DELETE', { id, school_id: schoolId, revoke_reason: 'granted in error', reason: 'granted in error' }, cookie)
    expect(revoke.status, JSON.stringify(revoke.data)).toBe(200)
    expect(await balance(students[0])).toBe(900)
  })

  test('carry forward: moves the balance to the next year and leaves the close record alone', async () => {
    const before = await closeRecord()
    const res = await decide(students[1], 'carry')
    expect(res.status, JSON.stringify(res.data)).toBe(200)
    expect(await balance(students[1])).toBe(0)
    expect(await balance(students[1], NEXT)).toBe(1000)
    expect(await closeRecord()).toEqual(before)
    // The system waiver behind a carry cannot be revoked, or the debt would exist twice.
    const id = (await pool.query<{ id: number }>(`SELECT id FROM fee_waivers WHERE student_id = $1 AND waiver_type = 'carry_forward'`, [students[1]])).rows[0].id
    const revoke = await api(`/api/fees/waivers?id=${id}&revoke_reason=mistake&reason=mistake`, 'DELETE', { id, school_id: schoolId, revoke_reason: 'try', reason: 'try' }, cookie)
    expect(revoke.status).toBeGreaterThanOrEqual(400)
  })

  test('write off: clears the balance, and the year stays closed even when nothing is left', async () => {
    const before = await closeRecord()
    expect((await decide(students[2], 'writeoff')).status).toBe(200)
    expect(await balance(students[2])).toBe(0)
    expect(await closeRecord()).toEqual(before)
  })

  test('a reported payment waiting for approval blocks carry and write-off (#509), and can be approved', async () => {
    const reported = await pay(students[3], 400, { payment_status: 'pending_verification', payment_mode: 'upi', transaction_ref: `REF${ts}` })
    expect(reported.status, JSON.stringify(reported.data)).toBe(201)
    for (const decision of ['carry', 'writeoff']) {
      const res = await decide(students[3], decision)
      expect(res.status, decision).toBe(409)
      expect(String(res.data.error)).toContain('waiting for approval')
    }
    expect(await balance(students[3])).toBe(1000)
  })

  test('everything else in the closed year stays locked', async () => {
    expect((await decide(students[0], 'open')).status).toBe(409)
    expect((await decide(students[0], 'passout')).status).toBe(409)
    const generate = await api('/api/fees/generate', 'POST', { school_id: schoolId, academic_year: AY }, cookie)
    expect(generate.status).toBe(409)
    const edit = await api(`/api/fees/ledger/${(await bills(students[0]))[0].id}`, 'PATCH',
      { school_id: schoolId, amount_due: 1, reason: 'try to edit', changed_by: 'x' }, cookie)
    expect(edit.status).toBeGreaterThanOrEqual(400)
    expect(Number((await bills(students[0]))[0].amount_due)).toBe(1000)
  })

  test('the register says where a balance can be carried', async () => {
    const res = await api(`/api/fees/open-dues?school_id=${schoolId}`, 'GET', undefined, cookie)
    const row = (res.data.rows as Array<{ student_id: number; carry_to: string | null }>).find(r => r.student_id === students[0])
    expect(row?.carry_to).toBe(NEXT)
  })
})
