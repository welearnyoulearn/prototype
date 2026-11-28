import { test, expect, request as playwrightRequest } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { COOKIE_PARENT, JWT_SECRET } from '../lib/auth-constants'
import pool from '../lib/db'
import { createAdminSchool, type AdminSchool } from './fixtures/admin-school'

// #507 — every bill of a year shares one due date, so money and lists must follow the billing period.

const YEAR = '3080-81'
const MONTHS = ['Apr 3080', 'May 3080', 'Jun 3080', 'Jul 3080', 'Aug 3080', 'Sep 3080', 'Oct 3080', 'Nov 3080', 'Dec 3080', 'Jan 3081', 'Feb 3081', 'Mar 3081']
// Stored in a scrambled order, as rows end up after updates and cancellations.
const SCRAMBLED = ['Aug 3080', 'Jan 3081', 'May 3080', 'Dec 3080', 'Mar 3081', 'Jun 3080', 'Apr 3080', 'Oct 3080', 'Feb 3081', 'Jul 3080', 'Nov 3080', 'Sep 3080']

type Bill = { id: number; period_label: string; amount_paid: string }

test.describe.serial('Fee bills are paid and listed oldest first (#507)', () => {
  let school: AdminSchool
  let monthly = 0
  let quarterly = 0
  let carried = 0

  async function studentWithBills(name: string, category: number, labels: string[], extra: Array<{ label: string; source: string }> = []) {
    const student = await school.addStudent(name)
    const all = [...labels.map(label => ({ label, source: null as string | null, category })), ...extra.map(e => ({ ...e, category: carried }))]
    for (const bill of all) {
      await pool.query(
        `INSERT INTO student_fee_ledger (school_id, student_id, fee_category_id, academic_year, period_label, amount_due, due_date, status, source_academic_year)
         VALUES ($1,$2,$3,$4,$5,1000,'3081-03-31','pending',$6)`,
        [school.schoolId, student, bill.category, YEAR, bill.label, bill.source])
    }
    return student
  }
  /** A signed-in parent of the student, with online payments switched on for the school. */
  async function parentOf(student: number) {
    await pool.query(`INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES ($1,'online-payments',TRUE),($1,'parent-portal',TRUE)
                      ON CONFLICT (school_id, feature_key) DO UPDATE SET enabled = TRUE`, [school.schoolId])
    const parentId = (await pool.query<{ id: number }>(`INSERT INTO parents (school_id, name, phone) VALUES ($1,'Order Parent',$2) RETURNING id`, [school.schoolId, school.phone()])).rows[0].id
    await pool.query('INSERT INTO student_parents (student_id, parent_id) VALUES ($1,$2)', [student, parentId])
    const sid = randomUUID()
    await pool.query(`INSERT INTO portal_sessions (id, actor_type, actor_id, school_id, expires_at) VALUES ($1,'parent',$2,$3,NOW() + INTERVAL '1 hour')`, [sid, parentId, school.schoolId])
    const token = jwt.sign({ parentId, schoolId: school.schoolId, role: 'parent', passwordChanged: true, name: 'Order Parent', email: '', sid }, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' })
    return playwrightRequest.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000', extraHTTPHeaders: { Cookie: `${COOKIE_PARENT}=${token}` } })
  }
  const adminBills = async (student: number) => await (await school.admin.get(
    `/api/fees/ledger?school_id=${school.schoolId}&student_id=${student}&academic_year=${YEAR}`)).json() as Bill[]
  const paid = async (student: number) => Object.fromEntries((await pool.query<{ period_label: string; amount_paid: number }>(
    `SELECT period_label, amount_paid::float8 AS amount_paid FROM student_fee_ledger WHERE student_id = $1 AND amount_paid > 0`, [student])).rows
    .map(r => [r.period_label, r.amount_paid]))
  async function collect(student: number, total: number) {
    const bills = await adminBills(student)
    const res = await school.admin.post('/api/fees/payments', { data: {
      school_id: school.schoolId, student_id: student, ledger_ids: bills.map(b => b.id).reverse(), total_amount: total,
      payment_mode: 'cash', collected_by_name: 'Counter',
    } })
    expect(res.status(), await res.text()).toBe(201)
    return await res.json() as { line_items: Array<{ period_label: string; amount: number }> }
  }

  test.beforeAll(async () => {
    school = await createAdminSchool('billorder')
    await pool.query(`INSERT INTO academic_years (school_id, label, start_date, end_date, is_current) VALUES ($1,$2,'3080-04-01','3081-03-31',TRUE)`, [school.schoolId, YEAR])
    const category = async (name: string, frequency: string) => (await pool.query<{ id: number }>(
      'INSERT INTO fee_categories (school_id, name, frequency) VALUES ($1,$2,$3) RETURNING id', [school.schoolId, name, frequency])).rows[0].id
    monthly = await category('Tuition', 'monthly')
    quarterly = await category('Activity', 'quarterly')
    carried = await category('Previous Year Dues', 'one_time')
  })
  test.afterAll(async () => { await school?.cleanup() })

  test('admin: lists April to March and fills April, May, June', async () => {
    const student = await studentWithBills('Order Monthly', monthly, SCRAMBLED)
    expect((await adminBills(student)).map(b => b.period_label)).toEqual(MONTHS)
    const receipt = await collect(student, 2500)
    expect(receipt.line_items.map(l => [l.period_label, l.amount])).toEqual([['Apr 3080', 1000], ['May 3080', 1000], ['Jun 3080', 500]])
    expect(await paid(student)).toEqual({ 'Apr 3080': 1000, 'May 3080': 1000, 'Jun 3080': 500 })
  })

  test('carried dues go first, then quarters and months by the date they start', async () => {
    const student = await studentWithBills('Order Mixed', quarterly, [`Q3 ${YEAR}`, `Q1 ${YEAR}`, `Q2 ${YEAR}`],
      [{ label: 'Previous Year Dues (3079-80)', source: '3079-80' }])
    expect((await adminBills(student)).map(b => b.period_label)).toEqual(['Previous Year Dues (3079-80)', `Q1 ${YEAR}`, `Q2 ${YEAR}`, `Q3 ${YEAR}`])
    await collect(student, 2500)
    expect(await paid(student)).toEqual({ 'Previous Year Dues (3079-80)': 1000, [`Q1 ${YEAR}`]: 1000, [`Q2 ${YEAR}`]: 500 })
  })

  test('parent: same order in the list, the payment and the other records', async () => {
    const student = await studentWithBills('Order Parent', monthly, SCRAMBLED)
    const query = `school_id=${school.schoolId}&student_id=${student}&academic_year=${YEAR}`
    const parent = await parentOf(student)
    const view = await (await parent.get(`/api/parent/fees?${query}`)).json() as { ledger: Bill[] }
    expect(view.ledger.map(b => b.period_label)).toEqual(MONTHS)

    const res = await parent.post('/api/parent/fees', { data: {
      school_id: school.schoolId, student_id: student, ledger_ids: view.ledger.map(b => b.id).reverse(), total_amount: 1500, transaction_ref: `UTR${Date.now()}`,
    } })
    expect(res.status(), await res.text()).toBeLessThan(300)
    const reported = await pool.query<{ period_label: string; amount: number }>(
      `SELECT l.period_label, p.amount::float8 AS amount FROM fee_payments p JOIN student_fee_ledger l ON l.id = p.ledger_id
       WHERE p.student_id = $1 ORDER BY p.id`, [student])
    expect(reported.rows).toEqual([{ period_label: 'Apr 3080', amount: 1000 }, { period_label: 'May 3080', amount: 500 }])

    const passbook = await (await school.admin.get(`/api/fees/passbook?${query}`)).json() as { ledger: Bill[] }
    expect(passbook.ledger.map(b => b.period_label)).toEqual(MONTHS)
    await parent.dispose()
  })
})
