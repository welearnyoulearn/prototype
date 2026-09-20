/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, request as pwRequest, APIRequestContext, Browser } from '@playwright/test'
import { Pool } from 'pg'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'
import { addDays, todayIST } from '../lib/attendanceRules'

// Student 360 (issue #158): the school admin's one-page profile of a student — attendance, marks, fees,
// engagement, and past academic years. Marks, fees and academic years have no public "create" API that is
// quick to script, so this spec plants them straight into the database; set E2E_DATABASE_URL to the SAME
// database the app under test uses (use a throwaway one). Without it the whole spec is skipped.
// It creates its own schools and deletes them (cascade) at the end.

type Res = { status: number; body: any }
const OWNER_PASS = 'OwnerPass@123'
const DB_URL = process.env.E2E_DATABASE_URL

const newCtx = () => pwRequest.newContext({ baseURL: BASE })
async function call(ctx: APIRequestContext, method: 'get' | 'post' | 'put' | 'delete', url: string, data?: unknown): Promise<Res> {
  const res = await ctx[method](url, data === undefined ? {} : { data })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status(), body }
}
async function browserAs(browser: Browser, ctx: APIRequestContext) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } })
  await context.addCookies((await ctx.storageState()).cookies)
  return context
}

test.describe.serial('Student 360 profile — school admin', () => {
  test.skip(!DB_URL, 'Set E2E_DATABASE_URL to the app\'s (throwaway) database to run this spec')

  const ts = Date.now()
  const today = todayIST()
  const yearStartYear = Number(today.slice(0, 4)) - (today.slice(5, 7) >= '04' ? 0 : 1)
  const curLabel = `${yearStartYear}-${String(yearStartYear + 1).slice(2)}`
  const prevLabel = `${yearStartYear - 1}-${String(yearStartYear).slice(2)}`

  let platformCookie = ''
  let schoolId = 0, schoolBId = 0, classA = 0, classB = 0
  let owner: APIRequestContext, ownerB: APIRequestContext
  let anon: APIRequestContext
  let db: Pool
  const ids: Record<string, number> = {}
  let prevYearId = 0

  test.beforeAll(async () => {
    test.setTimeout(300000)
    db = new Pool({ connectionString: DB_URL, max: 2 })
    platformCookie = await platformAdminCookie()

    const school = await createSchool(platformCookie, { name: `Profile E2E ${ts}`, email: `prof${ts}@e2etest.com`, phone: `98${String(ts).slice(-8)}` })
    schoolId = school.id
    await setSubscription(platformCookie, schoolId, 'premium')
    owner = await newCtx()
    expect((await call(owner, 'post', '/api/auth/login', { email: school.email, password: school.temp_password })).status).toBe(200)
    expect((await call(owner, 'post', '/api/auth/change-password', { newPassword: OWNER_PASS })).status).toBe(200)
    expect((await call(owner, 'put', '/api/auth/profile', { full_name: `Owner ${ts}`, phone: '9000000041' })).status).toBe(200)
    expect((await call(owner, 'put', '/api/school-calendar/settings', { weekly_off_days: [] })).status).toBe(200)

    const mk = async (grade: string, section: string) => (await call(owner, 'post', '/api/classes', { school_id: schoolId, grade, section })).body.id as number
    classA = await mk('10', 'A'); classB = await mk('9', 'B')

    const phone = (n: number) => `9${String(ts + n).slice(-9)}`
    const stu = (name: string, grade: string, section: string, roll: number, n: number) => ({
      name, grade, section, school_roll_number: roll,
      parent_name: `Parent of ${name}`, parent_phone: phone(n), parent_email: `p${n}${ts}@e2etest.com`,
    })
    const sb = await call(owner, 'post', '/api/students/bulk', {
      school_id: schoolId,
      students: [stu('Asha Rao', '10', 'A', 1, 1), stu('Bala Krishna', '10', 'A', 2, 2), stu('Esha Reddy', '9', 'B', 1, 3)],
    })
    expect(sb.status, JSON.stringify(sb.body)).toBe(201)
    const list = await call(owner, 'get', `/api/students?school_id=${schoolId}`)
    for (const s of list.body as { id: number; name: string }[]) ids[s.name.split(' ')[0]] = s.id

    // ── Attendance today (as the school admin): Asha absent in the morning, present after; Bala present ──
    const mark = (session: string, asha: string) => call(owner, 'post', '/api/attendance', {
      class_id: classA, date: today, session,
      records: [{ student_id: ids.Asha, status: asha }, { student_id: ids.Bala, status: 'present' }],
    })
    expect((await mark('morning', 'absent')).status).toBe(201)
    expect((await mark('afternoon', 'present')).status).toBe(201)

    // ── Academic years: the current one, and last year in which Asha was in class 9-A ──
    const cur = await db.query(
      `INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
       VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (school_id, label) DO UPDATE SET is_current = TRUE RETURNING id`,
      [schoolId, curLabel, `${yearStartYear}-04-01`, `${yearStartYear + 1}-03-31`])
    const prev = await db.query(
      `INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
       VALUES ($1, $2, $3, $4, FALSE) ON CONFLICT (school_id, label) DO UPDATE SET is_current = FALSE RETURNING id`,
      [schoolId, prevLabel, `${yearStartYear - 1}-04-01`, `${yearStartYear}-03-31`])
    prevYearId = prev.rows[0].id
    await db.query(`UPDATE academic_years SET is_current = (id = $2) WHERE school_id = $1`, [schoolId, cur.rows[0].id])
    await db.query(`INSERT INTO student_class_history (student_id, school_id, academic_year_id, grade, section) VALUES ($1, $2, $3, '9', 'A')`, [ids.Asha, schoolId, prevYearId])

    // ── Marks: two exams this year for class A. Asha 60% then 40%; Bala higher (drives the class average) ──
    const exam = async (name: string, date: string) => {
      const e = await db.query(`INSERT INTO exam_records (school_id, class_id, exam_name, exam_type, exam_date, status) VALUES ($1, $2, $3, 'unit_test', $4, 'published') RETURNING id`, [schoolId, classA, name, date])
      for (const sub of ['Maths', 'Science']) await db.query(`INSERT INTO exam_subjects (exam_id, school_id, subject_name, max_marks) VALUES ($1, $2, $3, 50)`, [e.rows[0].id, schoolId, sub])
      return e.rows[0].id as number
    }
    const put = (examId: number, student: number, subject: string, marks: number) =>
      db.query(`INSERT INTO exam_marks (exam_id, school_id, student_id, subject_name, marks_obtained) VALUES ($1, $2, $3, $4, $5)`, [examId, schoolId, student, subject, marks])
    const ut1 = await exam('Unit Test 1', addDays(today, -40))
    const hy = await exam('Half Yearly', addDays(today, -10))
    await put(ut1, ids.Asha, 'Maths', 40); await put(ut1, ids.Asha, 'Science', 20)      // 60/100
    await put(ut1, ids.Bala, 'Maths', 45); await put(ut1, ids.Bala, 'Science', 40)
    await put(hy, ids.Asha, 'Maths', 25); await put(hy, ids.Asha, 'Science', 15)        // 40/100 → dropped 20 points
    await put(hy, ids.Bala, 'Maths', 40); await put(hy, ids.Bala, 'Science', 35)
    await db.query(`INSERT INTO report_card_remarks (school_id, student_id, exam_id, class_teacher_remark, conduct) VALUES ($1, $2, $3, 'Needs to revise Science', 'Good')`, [schoolId, ids.Asha, hy])

    // ── Fees: Tuition ₹10,000 (₹4,000 paid, overdue) + Transport ₹2,000 (paid) ──
    const cat = async (name: string) => (await db.query(`INSERT INTO fee_categories (school_id, name, frequency) VALUES ($1, $2, 'annual') RETURNING id`, [schoolId, name])).rows[0].id as number
    const tuition = await cat('Tuition'), transport = await cat('Transport')
    const ledger = async (category: number, due: number, paid: number, dueDate: string, status: string) =>
      (await db.query(
        `INSERT INTO student_fee_ledger (school_id, student_id, fee_category_id, academic_year, period_label, amount_due, amount_paid, due_date, status)
         VALUES ($1, $2, $3, $4, 'Term 1', $5, $6, $7, $8) RETURNING id`, [schoolId, ids.Asha, category, curLabel, due, paid, dueDate, status])).rows[0].id as number
    const l1 = await ledger(tuition, 10000, 4000, addDays(today, -20), 'partial')
    const l2 = await ledger(transport, 2000, 2000, addDays(today, -20), 'paid')
    await db.query(`INSERT INTO fee_payments (school_id, student_id, ledger_id, amount, payment_mode, receipt_number, paid_date) VALUES ($1, $2, $3, 4000, 'upi', $4, $5)`, [schoolId, ids.Asha, l1, `R-${ts}-1`, addDays(today, -15)])
    await db.query(`INSERT INTO fee_payments (school_id, student_id, ledger_id, amount, payment_mode, receipt_number, paid_date) VALUES ($1, $2, $3, 2000, 'cash', $4, $5)`, [schoolId, ids.Asha, l2, `R-${ts}-2`, addDays(today, -16)])

    await db.query(`INSERT INTO student_points (student_id, school_id, action_type, points) VALUES ($1, $2, 'quiz', 30)`, [ids.Asha, schoolId])

    // ── A second school, for cross-tenant checks ──
    const b = await createSchool(platformCookie, { name: `Profile E2E B ${ts}`, email: `profb${ts}@e2etest.com`, phone: `97${String(ts).slice(-8)}` })
    schoolBId = b.id
    ownerB = await newCtx()
    expect((await call(ownerB, 'post', '/api/auth/login', { email: b.email, password: b.temp_password })).status).toBe(200)
    expect((await call(ownerB, 'post', '/api/auth/change-password', { newPassword: OWNER_PASS })).status).toBe(200)
    anon = await newCtx()
  })

  test.afterAll(async () => {
    test.setTimeout(120000)
    const c = await newCtx()
    for (const id of [schoolId, schoolBId]) if (id) await c.delete(`/api/schools/${id}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await c.dispose()
    for (const x of [owner, ownerB, anon]) await x?.dispose()
    await db?.end()
  })

  const profile = (ctx: APIRequestContext, id: number, qs = '') => call(ctx, 'get', `/api/students/${id}/profile${qs}`)

  test('1. Only the school admin of THAT school can open a profile; bad ids are rejected', async () => {
    expect((await profile(anon, ids.Asha)).status).toBe(401)
    expect((await profile(ownerB, ids.Asha)).status).toBe(404)          // another school's student
    expect((await profile(owner, 999999999)).status).toBe(404)
    expect((await call(owner, 'get', '/api/students/abc/profile')).status).toBe(400)
    expect((await profile(owner, ids.Asha, '?year=1;DROP')).status).toBe(400)
    expect((await profile(owner, ids.Asha)).status).toBe(200)
  })

  test('2. The profile has the right numbers — attendance, marks, fees, engagement', async () => {
    const p = (await profile(owner, ids.Asha)).body
    expect(p.student).toMatchObject({ name: 'Asha Rao', grade: '10', section: 'A', rollNumber: 1 })
    expect(p.parents[0].name).toBe('Parent of Asha Rao')
    expect(p.year).toMatchObject({ label: curLabel, isCurrent: true })

    // Attendance: absent morning, present afternoon → 1 of 2 = 50%; same as the other screens.
    expect(p.attendance.summary).toMatchObject({ attended: 1, marked: 2, pct: 50, band: 'low' })
    expect(p.attendance.absentDayCount).toBe(1)
    const shared = (await call(owner, 'get', `/api/attendance?view=student&student_id=${ids.Asha}&month=${today.slice(0, 7)}`)).body
    expect(shared.month.summary.pct).toBe(p.attendance.summary.pct)
    expect(shared.yearToDate.summary).toMatchObject({ attended: p.attendance.summary.attended, marked: p.attendance.summary.marked })

    // Marks: 60% then 40% → average 50, dropped 20; Science is the weak subject (35% vs Maths 65%).
    expect(p.marks.exams.map((e: any) => [e.name, e.pct])).toEqual([['Unit Test 1', 60], ['Half Yearly', 40]])
    expect(p.marks.averagePct).toBe(50)
    expect(p.marks.lastChange).toBe(-20)
    expect(p.marks.weakest).toMatchObject({ subject: 'Science', avgPct: 35 })
    expect(p.marks.strongest).toMatchObject({ subject: 'Maths', avgPct: 65 })
    // Class average for Maths in Unit Test 1 = (40 + 45) / 2 = 42.5 of 50 → 85%
    const ut1Maths = p.marks.exams[0].subjects.find((s: any) => s.subject === 'Maths')
    expect(ut1Maths).toMatchObject({ obtained: 40, max: 50, pct: 80, classAvgPct: 85 })
    expect(p.marks.exams[1].remark.teacher).toBe('Needs to revise Science')

    // Fees: 12,000 total, 6,000 paid, 6,000 balance — all of it overdue.
    expect(p.fees.totals).toMatchObject({ due: 12000, paid: 6000, balance: 6000, overdue: 6000, waived: 0 })
    expect(p.fees.payments).toHaveLength(2)
    expect(p.engagement.points).toBe(30)

    // The talking points call out the three real problems.
    const texts = p.flags.map((f: any) => f.text).join(' | ')
    expect(texts).toContain('Marks dropped 20 points')
    expect(texts).toContain('₹6,000 of fees is overdue')
  })

  test('3. Another student\'s data never leaks in: Bala has no fees, and his marks are his own', async () => {
    const p = (await profile(owner, ids.Bala)).body
    expect(p.fees.items).toHaveLength(0)
    expect(p.engagement.points).toBe(0)
    expect(p.marks.exams.map((e: any) => e.pct)).toEqual([85, 75])
    expect(p.attendance.summary).toMatchObject({ pct: 100 })
  })

  test('4. Past academic years: Asha was in 9-A last year and has no data there; an unknown year falls back to the current one', async () => {
    const list = (await profile(owner, ids.Asha)).body.years
    expect(list.map((y: any) => y.label)).toEqual([curLabel, prevLabel])
    const prev = (await profile(owner, ids.Asha, `?year=${prevYearId}`)).body
    expect(prev.year).toMatchObject({ label: prevLabel, isCurrent: false })
    expect(prev.student).toMatchObject({ grade: '9', section: 'A' })
    expect(prev.marks.exams).toHaveLength(0)
    expect(prev.fees.items).toHaveLength(0)
    expect(prev.attendance.summary.marked).toBe(0)
    expect((await profile(owner, ids.Asha, '?year=999999999')).body.year.label).toBe(curLabel)
    // A year that belongs to another school cannot be used to peek at its data.
    const other = await profile(ownerB, ids.Asha, `?year=${prevYearId}`)
    expect(other.status).toBe(404)
  })

  test('5. A student with nothing recorded gets a calm, empty profile (no errors)', async () => {
    const p = (await profile(owner, ids.Esha)).body
    expect(p.marks.exams).toHaveLength(0)
    expect(p.fees.items).toHaveLength(0)
    expect(p.attendance.summary.pct).toBeNull()
    expect(p.flags).toEqual([])
  })

  test('6. ADMIN (browser): open a student from Class Management and read everything', async ({ browser }) => {
    test.setTimeout(180000)
    const context = await browserAs(browser, owner)
    const page = await context.newPage()
    await page.goto('/school-admin?tab=class-management')
    await page.getByText('10-A', { exact: true }).first().click()
    await page.getByRole('button', { name: /^Students/ }).click()
    await page.getByTestId(`class-student-${ids.Asha}`).click()

    await expect(page.getByTestId('student-profile')).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('profile-name')).toHaveText('Asha Rao')
    await expect(page.getByTestId('profile-kpi-attendance')).toHaveText('50%')
    await expect(page.getByTestId('profile-kpi-marks')).toHaveText('50%')
    await expect(page.getByTestId('profile-kpi-fees')).toHaveText('₹6,000')
    await expect(page.getByTestId('profile-flags')).toContainText('₹6,000 of fees is overdue')
    await expect(page.getByTestId('profile-parent-0')).toContainText('Parent of Asha Rao')
    await expect(page.getByTestId('profile-fee-table')).toContainText('Tuition')
    await expect(page.getByTestId('profile-payments')).toContainText(`R-${ts}-1`)

    // Exam detail opens, and shows the class average and the teacher's remark
    await page.getByTestId(/profile-exam-\d+/).first().locator('summary').click()
    await expect(page.getByTestId(/profile-exam-\d+/).first()).toContainText('Needs to revise Science')

    // Switch to last year: different class, empty marks, then close with Esc
    await page.getByTestId('profile-year').selectOption({ label: `${prevLabel} · Class 9-A` })
    await expect(page.getByTestId('profile-section-marks')).toContainText(`No exam marks recorded for ${prevLabel}`)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('student-profile')).toHaveCount(0)
    await context.close()
  })

  test('7. ADMIN (browser): the same profile opens from Student Management and from the attendance dashboard', async ({ browser }) => {
    test.setTimeout(180000)
    const context = await browserAs(browser, owner)
    const page = await context.newPage()
    await page.goto('/school-admin?tab=students')
    await page.getByTestId(`student-name-${ids.Bala}`).click()
    await expect(page.getByTestId('profile-name')).toHaveText('Bala Krishna', { timeout: 60000 })
    await page.getByTestId('student-profile-close').click()

    await page.goto('/school-admin?tab=attendance')
    await page.getByTestId(`att-class-row-${classA}`).click()
    await page.getByTestId(`att-student-row-${ids.Asha}`).click()
    await page.getByTestId('att-open-full-profile').click()
    await expect(page.getByTestId('profile-name')).toHaveText('Asha Rao', { timeout: 60000 })
    await expect(page.getByTestId('student-profile')).toBeVisible()
    await context.close()
  })
})
