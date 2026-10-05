import { test, expect } from '@playwright/test'
import bcrypt from 'bcryptjs'
import ExcelJS from 'exceljs'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'
import { db, closeDb } from './fixtures/db'

// Year-end process (#343): owner/approver settings, write-off sign-off, close gate, open-dues register,
// year-end pack. One school, run in order — each test builds on the one before.

type Res = { status: number; data: any }
type Caller = (path: string, method?: string, body?: object) => Promise<Res>

async function login(email: string, password: string): Promise<Caller> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), redirect: 'manual' })
  const cookie = ((res.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-auth=')) ?? '').split(';')[0]
  if (!cookie) throw new Error(`Login failed for ${email} — status ${res.status}`)
  return async (path, method = 'GET', body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: cookie }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text(); let data: any; try { data = JSON.parse(t) } catch { data = t }
    return { status: r.status, data }
  }
}

const y = new Date().getFullYear()
const YEAR = `${y}-${String(y + 1).slice(2)}`

let schoolId = 0
let admin: Caller
let principal: Caller
let adminId = 0, principalId = 0
const stu: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 }

const applyWriteoff = (sid: number, reason = 'Hardship — trustee approved') =>
  admin('/api/fees/year-end', 'POST', { school_id: schoolId, from_year: YEAR, action: 'apply', decisions: [{ student_id: sid, decision: 'writeoff', reason }] })
const settings = (body: Record<string, unknown>, who: Caller = admin) =>
  who('/api/fees/year-end/settings', 'PUT', { school_id: schoolId, writeoff_limit: 0, leave_open_days: 30, owner_user_id: null, approver_user_id: null, ...body })

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const pc = await platformAdminCookie()
  const school = await createSchool(pc, { name: `E2E Year-End Process ${Date.now()}`, phone: `9${String(Date.now()).slice(-9)}`, email: `yep${Date.now()}@test.com` })
  schoolId = school.id
  await setSubscription(pc, schoolId, 'premium')
  admin = await login(school.email, school.temp_password)
  await admin('/api/academic-years', 'POST', { school_id: schoolId, label: YEAR, start_date: `${y}-04-01`, end_date: `${y + 1}-03-31` })

  const rows = (['A', 'B', 'C', 'D'] as const).map((k, i) => ({ name: `Student ${k}`, grade: '5', section: 'A', school_roll_number: i + 1, parent_name: `Parent ${k}`, parent_phone: `9${String(Date.now() + i).slice(-9)}` }))
  const en = await admin('/api/students/bulk', 'POST', { school_id: schoolId, students: rows })
  expect(en.status).toBe(201)
  ;(['A', 'B', 'C', 'D'] as const).forEach((k, i) => { stu[k] = en.data.students[i].id })

  const cat = await admin('/api/fees/categories', 'POST', { school_id: schoolId, name: 'Annual Fee', frequency: 'annual', category_type: 'fixed' })
  await admin('/api/fees/structures', 'POST', { school_id: schoolId, academic_year: YEAR, structures: [{ fee_category_id: cat.data.id, grade: '5', amount: 10000, due_day: 10 }] })
  const gen = await admin('/api/fees/generate', 'POST', { school_id: schoolId, academic_year: YEAR })
  expect(gen.status).toBe(200)

  const staff = await admin(`/api/fees/year-end/settings?school_id=${schoolId}`)
  adminId = staff.data.staff[0].id
})

test.afterAll(async () => { await closeDb() })

test('YEP-01 one login: no sign-off step, even if an approver is chosen', async () => {
  const g = await admin(`/api/fees/year-end/settings?school_id=${schoolId}`)
  expect(g.status).toBe(200)
  expect(g.data.approval_required).toBe(false)
  expect(g.data.staff).toHaveLength(1)
  const p = await settings({ owner_user_id: adminId })
  expect(p.status).toBe(200)
  expect(p.data.approval_required).toBe(false)
})

test('YEP-02 one login: a write-off applies straight away', async () => {
  const r = await applyWriteoff(stu.A)
  expect(r.status).toBe(200)
  expect(r.data.writeoff.count).toBe(1)
  expect(r.data.writeoff.total).toBe(10000)
})

test('YEP-03 a second login plus an approver switches sign-off on; only a school admin can change it', async () => {
  const email = `principal.${Date.now()}@test.com`
  const mk = await admin('/api/school-admin/staff-accounts', 'POST', { school_id: schoolId, full_name: 'Test Principal', email, role: 'principal' })
  expect(mk.status).toBe(201)
  const pw = `Pr!${Math.random().toString(36).slice(2, 12)}Q9`
  await db().query(`UPDATE users SET password_hash = $1, first_login = FALSE, status = 'active' WHERE LOWER(email) = LOWER($2)`, [await bcrypt.hash(pw, 10), email])
  principal = await login(email, pw)
  principalId = mk.data.id

  expect((await settings({ owner_user_id: principalId, approver_user_id: adminId }, principal)).status).toBe(403)
  const same = await settings({ owner_user_id: adminId, approver_user_id: adminId })
  expect(same.status).toBe(400)
  expect(same.data.error).toMatch(/different people/)
  const ok = await settings({ owner_user_id: adminId, approver_user_id: principalId, writeoff_limit: 5000 })
  expect(ok.status).toBe(200)
  expect(ok.data.approval_required).toBe(true)
  expect((await principal(`/api/fees/year-end/settings?school_id=${schoolId}`)).status).toBe(200)
})

test('YEP-04 a write-off above the limit needs the approver — and nobody approves their own request', async () => {
  const blocked = await applyWriteoff(stu.B)
  expect(blocked.status).toBe(409)
  expect(blocked.data.needs_approval[0].student_id).toBe(stu.B)

  const noReason = await admin('/api/fees/year-end/writeoff-requests', 'POST', { school_id: schoolId, academic_year: YEAR, items: [{ student_id: stu.B, reason: '' }] })
  expect(noReason.status).toBe(400)
  const rq = await admin('/api/fees/year-end/writeoff-requests', 'POST', { school_id: schoolId, academic_year: YEAR, items: [{ student_id: stu.B, reason: 'Family relocated, uncollectable' }] })
  expect(rq.status).toBe(200)
  expect(rq.data.requested).toBe(1)
  const id = rq.data.requests.find((r: any) => r.student_id === stu.B).id

  expect((await admin('/api/fees/year-end/writeoff-requests', 'PATCH', { school_id: schoolId, id, action: 'approve' })).status).toBe(403)
  expect((await principal(`/api/fees/year-end/writeoff-requests?school_id=${schoolId}&academic_year=${YEAR}`)).data.can_approve).toBe(true)
  expect((await applyWriteoff(stu.B)).status).toBe(409)           // still pending

  expect((await principal('/api/fees/year-end/writeoff-requests', 'PATCH', { school_id: schoolId, id, action: 'approve', note: 'OK' })).status).toBe(200)
  const done = await applyWriteoff(stu.B, 'Family relocated, uncollectable')
  expect(done.status).toBe(200)

  const { rows } = await db().query(`SELECT w.reason FROM fee_waivers w JOIN student_fee_ledger l ON l.id = w.ledger_id WHERE w.student_id = $1 AND w.waiver_type = 'writeoff'`, [stu.B])
  expect(rows[0].reason).toMatch(/approved by Test Principal/)
  const after = await admin(`/api/fees/year-end/writeoff-requests?school_id=${schoolId}&academic_year=${YEAR}`)
  expect(after.data.requests.find((r: any) => r.student_id === stu.B).status).toBe('applied')
})

test('YEP-05 a write-off at or below the limit needs no sign-off', async () => {
  await settings({ owner_user_id: adminId, approver_user_id: principalId, writeoff_limit: 10000 })
  const r = await applyWriteoff(stu.C, 'Small balance')
  expect(r.status).toBe(200)
  expect(r.data.writeoff.count).toBe(1)
})

test('YEP-06 closing with dues still open needs a reason, and registers who is left', async () => {
  const close = (reason?: string) => admin('/api/fees/year-end', 'POST', { school_id: schoolId, from_year: YEAR, action: 'close', ...(reason ? { reason } : {}) })
  const none = await close()
  expect(none.status).toBe(409)
  expect(none.data.needs_reason).toBe(true)
  expect(none.data.students.map((s: any) => s.student_id)).toEqual([stu.D])
  expect((await close('x')).status).toBe(409)
  const ok = await close('Parent will pay after the harvest')
  expect(ok.status).toBe(200)
  expect(ok.data.open_registered).toBe(1)

  const reg = await admin(`/api/fees/open-dues?school_id=${schoolId}`)
  expect(reg.status).toBe(200)
  expect(reg.data.rows).toHaveLength(1)
  const row = reg.data.rows[0]
  expect(row.student_id).toBe(stu.D)
  expect(row.balance_now).toBe(10000)
  expect(row.days_to_deadline).toBe(30)
  expect(row.overdue).toBe(false)
  expect(row.owner_user_id).toBe(adminId)
  expect(reg.data.summary).toMatchObject({ open: 1, overdue: 0, total: 10000 })
})

test('YEP-07 the register can be edited, and rejects an owner who is not a staff login', async () => {
  const row = (await admin(`/api/fees/open-dues?school_id=${schoolId}`)).data.rows[0]
  expect((await admin('/api/fees/open-dues', 'PATCH', { school_id: schoolId, id: row.id, owner_user_id: principalId, promised_date: '2099-01-15', note: 'Called the father' })).status).toBe(200)
  const after = (await admin(`/api/fees/open-dues?school_id=${schoolId}`)).data.rows[0]
  expect(after).toMatchObject({ owner_user_id: principalId, promised_date: '2099-01-15', note: 'Called the father' })
  const bad = await admin('/api/fees/open-dues', 'PATCH', { school_id: schoolId, id: row.id, owner_user_id: 99999999 })
  expect(bad.status).toBe(400)
  expect((await admin('/api/fees/open-dues', 'PATCH', { school_id: schoolId, id: row.id, promised_date: 'soon' })).status).toBe(400)
})

test('YEP-07b the register shows who last collected, and nothing collected yet', async () => {
  const row = (await admin(`/api/fees/open-dues?school_id=${schoolId}`)).data.rows[0]
  expect(row).toMatchObject({ last_collected_by: null, last_collected_on: null, last_collected_amount: null })
  const { rows: [l] } = await db().query(`SELECT id FROM student_fee_ledger WHERE school_id = $1 AND student_id = $2 AND academic_year = $3 LIMIT 1`, [schoolId, row.student_id, YEAR])
  await db().query(`INSERT INTO fee_payments (school_id, student_id, ledger_id, amount, payment_mode, payment_status, paid_date, collected_by_name, receipt_number)
                    VALUES ($1, $2, $3, 250, 'cash', 'completed', CURRENT_DATE, 'Front Desk Meena', $4)`, [schoolId, row.student_id, l.id, `RCP-YEP-${Date.now()}`])
  const after = (await admin(`/api/fees/open-dues?school_id=${schoolId}`)).data.rows[0]
  expect(after).toMatchObject({ last_collected_by: 'Front Desk Meena', last_collected_amount: 250 })
  await db().query(`DELETE FROM fee_payments WHERE school_id = $1 AND collected_by_name = 'Front Desk Meena'`, [schoolId])
})

test('YEP-08 the year-end pack is one workbook that reconciles — and needs a login', async () => {
  const anon = await fetch(`${BASE}/api/fees/year-end/pack?school_id=${schoolId}&academic_year=${YEAR}`)
  expect([401, 403]).toContain(anon.status)
  const { rows: [u] } = await db().query(`SELECT id FROM users WHERE school_id = $1 AND role = 'school_admin' LIMIT 1`, [schoolId])
  const pw = `Pk!${Math.random().toString(36).slice(2, 12)}Z9`
  await db().query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [await bcrypt.hash(pw, 10), u.id])
  const { rows: [em] } = await db().query(`SELECT email FROM users WHERE id = $1`, [u.id])
  const l = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em.email, password: pw }), redirect: 'manual' })
  const cookie = ((l.headers.getSetCookie?.() ?? []).find(c => c.startsWith('wlyl-auth=')) ?? '').split(';')[0]
  const r = await fetch(`${BASE}/api/fees/year-end/pack?school_id=${schoolId}&academic_year=${YEAR}`, { headers: { Cookie: cookie } })
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toContain('spreadsheetml')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await r.arrayBuffer()) as unknown as ArrayBuffer)
  expect(wb.worksheets.map(w => w.name)).toEqual(['Summary', 'Carried dues', 'Write-offs', 'Passout moves', 'Left open'])

  const sum = wb.getWorksheet('Summary')!
  const find = (label: string) => { let found: ExcelJS.Row | undefined; sum.eachRow(row => { if (String(row.getCell(1).value) === label) found = row }); return found }
  expect(find('Reason for closing with dues open')!.getCell(2).value).toBe('Parent will pay after the harvest')
  expect(find('Billed')!.getCell(2).value).toBe(40000)
  expect(find('Less: written off')!.getCell(2).value).toBe(-30000)          // A, B, C
  expect(find('Left open per report')!.getCell(2).value).toBe(10000)

  const wo = wb.getWorksheet('Write-offs')!
  const names: string[] = []; wo.eachRow(row => { const v = String(row.getCell(1).value); if (/^Student [ABC]$/.test(v)) names.push(`${v}|${row.getCell(6).value ?? ''}`) })
  expect(names.sort()).toEqual(['Student A|no approval recorded', 'Student B|Test Principal (Principal)', 'Student C|no approval recorded'])
})

test('YEP-09 resolving a left-open student clears the register row', async () => {
  const reopen = await admin('/api/fees/year-end', 'POST', { school_id: schoolId, from_year: YEAR, action: 'reopen', reason: 'resolve the last student' })
  expect(reopen.status).toBe(200)
  expect((await applyWriteoff(stu.D, 'Parent confirmed they cannot pay')).status).toBe(200)
  const reg = await admin(`/api/fees/open-dues?school_id=${schoolId}&include_resolved=1`)
  expect(reg.data.rows[0].resolved).toBe(true)
  expect(reg.data.summary.open).toBe(0)
  expect((await admin(`/api/fees/open-dues?school_id=${schoolId}`)).data.rows).toHaveLength(0)
})
