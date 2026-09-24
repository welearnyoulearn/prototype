/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { Pool } from 'pg'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Attendance → Day register → Absentees (issue #208): every absent student in one session, class by class,
// on one page. Plants attendance straight into the database — set E2E_DATABASE_URL to the app's (throwaway) DB.

const DB_URL = process.env.E2E_DATABASE_URL
type Res = { status: number; body: any }
const newCtx = () => pwRequest.newContext({ baseURL: BASE })
async function call(ctx: APIRequestContext, method: 'get' | 'post' | 'put', url: string, data?: unknown): Promise<Res> {
  const res = await ctx[method](url, data === undefined ? {} : { data })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status(), body }
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

test.describe.serial('Day register — absentees on one page', () => {
  test.skip(!DB_URL, "Set E2E_DATABASE_URL to the app's (throwaway) database to run this spec")
  const ts = Date.now() + 31
  const PASS = 'AbsentPass#2026x'
  let platform = ''
  let schoolId = 0, otherId = 0
  let admin: APIRequestContext, adminOther: APIRequestContext, anon: APIRequestContext, teacher: APIRequestContext
  let db: Pool
  let day = '', holiday = ''
  const phone = (n: number) => `9${String(ts + n).slice(-9)}`

  test.beforeAll(async () => {
    test.setTimeout(240000)
    db = new Pool({ connectionString: DB_URL, max: 2 })
    platform = await platformAdminCookie()
    const tier = await (await fetch(`${BASE}/api/platform/features?tier=premium`, { headers: { Cookie: platform } })).json() as { enabled?: string[] }
    const missing = ['attendance', 'calendar', 'students'].filter(k => !(tier.enabled ?? []).includes(k))
    if (missing.length) {
      if (process.env.E2E_ENABLE_PLAN_FEATURES !== '1') throw new Error(`${missing.join(', ')} off for the premium plan — set E2E_ENABLE_PLAN_FEATURES=1 on a throwaway database`)
      const on = await fetch(`${BASE}/api/platform/features`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: platform }, body: JSON.stringify({ assignments: missing.map(feature_key => ({ feature_key, tier: 'premium', enabled: true })) }) })
      if (!on.ok) throw new Error(`could not enable ${missing.join(', ')}: ${on.status}`)
    }
    const mkSchool = async (label: string, n: number, plan: string | null) => {
      const s = await createSchool(platform, { name: `${label} ${ts}`, email: `${label.toLowerCase().replace(/\W/g, '')}${ts}@e2etest.com`, phone: phone(n) })
      if (plan) await setSubscription(platform, s.id, plan)
      const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/auth/login', { email: s.email, password: s.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/auth/change-password', { newPassword: PASS })).status).toBe(200)
      return { id: s.id as number, ctx }
    }
    const a = await mkSchool('Absent School', 90, 'premium'); schoolId = a.id; admin = a.ctx
    const b = await mkSchool('Absent Other', 91, 'premium'); otherId = b.id; adminOther = b.ctx
    anon = await newCtx()
    expect((await call(admin, 'put', '/api/auth/profile', { full_name: 'Absent Principal', phone: '9000000043' })).status).toBe(200)

    const mk = async (grade: string, section: string) => (await call(admin, 'post', '/api/classes', { school_id: schoolId, grade, section })).body.id as number
    const c10a = await mk('10', 'A'), c9b = await mk('9', 'B'), c8c = await mk('8', 'C')
    void c8c
    const bulkT = await call(admin, 'post', '/api/teachers/bulk', { school_id: schoolId, teachers: [{ name: 'Ms Rao', email: `rao${ts}@e2etest.com`, phone: phone(11), subject: 'Mathematics', staff_type: 'teaching' }] })
    const raoId = bulkT.body.teachers[0].id as number
    expect((await call(admin, 'put', `/api/classes/${c10a}`, { class_teacher_id: raoId })).status).toBeLessThan(300)
    const reset = await call(admin, 'post', `/api/teachers/${raoId}/reset-credentials`)
    teacher = await newCtx()
    expect((await call(teacher, 'post', '/api/teacher/auth/login', { email: `rao${ts}@e2etest.com`, password: reset.body.temp_password })).status).toBe(200)

    const stu = (name: string, grade: string, section: string, roll: number, n: number) => ({ name, grade, section, school_roll_number: roll, parent_name: `Parent of ${name}`, parent_phone: phone(n), parent_email: `p${n}${ts}@e2etest.com` })
    const bulk = await call(admin, 'post', '/api/students/bulk', { school_id: schoolId, students: [
      stu('Asha Rao', '10', 'A', 1, 1), stu('Bala Krishna', '10', 'A', 2, 2), stu('Chitra Devi', '10', 'A', 3, 3), stu('Old Student', '10', 'A', 4, 4),
      stu('Esha Reddy', '9', 'B', 1, 5), stu('Dev Anand', '8', 'C', 1, 6),
    ] })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(201)
    const roster = (await call(admin, 'get', `/api/students?school_id=${schoolId}`)).body as { id: number; name: string }[]
    const id = (n: string) => roster.find(s => s.name.startsWith(n))!.id
    await db.query(`UPDATE students SET status = 'graduated' WHERE id = $1`, [id('Old')])

    // A working day in the past (not a Sunday — the default weekly off)
    const d = new Date(); d.setUTCDate(d.getUTCDate() - 3)
    while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1)
    day = iso(d)
    const h = new Date(d); h.setUTCDate(h.getUTCDate() - 1); while (h.getUTCDay() === 0) h.setUTCDate(h.getUTCDate() - 1)
    holiday = iso(h)
    await db.query(`INSERT INTO school_calendar (school_id, title, event_date, event_type) VALUES ($1,'Founders Day',$2,'holiday')`, [schoolId, holiday])

    const mark = async (classId: number, session: 'morning' | 'afternoon', rows: Array<[number, 'present' | 'absent']>) => {
      for (const [sid, status] of rows) await db.query(`INSERT INTO attendance (school_id, class_id, student_id, date, session, status) VALUES ($1,$2,$3,$4,$5,$6)`, [schoolId, classId, sid, day, session, status])
      await db.query(`INSERT INTO attendance_sessions (school_id, class_id, date, session, marked_by_name, marked_by_role) VALUES ($1,$2,$3,$4,'Ms Rao','teacher')`, [schoolId, classId, day, session])
    }
    // 10-A: Bala absent all day, Chitra absent in the morning only, the graduated student "absent" (must not show)
    await mark(c10a, 'morning', [[id('Asha'), 'present'], [id('Bala'), 'absent'], [id('Chitra'), 'absent'], [id('Old'), 'absent']])
    await mark(c10a, 'afternoon', [[id('Asha'), 'present'], [id('Bala'), 'absent'], [id('Chitra'), 'present'], [id('Old'), 'absent']])
    // 9-B: marked in the morning with nobody absent; afternoon not marked. 8-C: nothing marked.
    await mark(c9b, 'morning', [[id('Esha'), 'present']])
  })

  test.afterAll(async () => {
    for (const id of [schoolId, otherId]) if (id) await fetch(`${BASE}/api/schools/${id}`, { method: 'DELETE', headers: { Cookie: platform } }).catch(() => {})
    await db?.end()
  })

  test('1. Morning: every absent student by class, whole-day vs one-session, with parents; unmarked classes flagged', async () => {
    const r = await call(admin, 'get', `/api/attendance/absentees?date=${day}&session=morning`)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ date: day, session: 'morning', non_working: null, totals: { absent: 2, classes: 3, classes_marked: 2, classes_with_absentees: 1 } })
    const a = r.body.classes.find((c: any) => c.grade === '10')
    expect(a).toMatchObject({ section: 'A', class_teacher: 'Ms Rao', marked: true, student_count: 3 })            // the graduated student is not counted
    expect(a.absent.map((s: any) => s.name)).toEqual(['Bala Krishna', 'Chitra Devi'])                          // roll-number order, graduated excluded
    expect(a.absent[0]).toMatchObject({ roll: 2, whole_day: true, parent_name: 'Parent of Bala Krishna' })
    expect(a.absent[0].parent_phone).toBeTruthy()
    expect(a.absent[1]).toMatchObject({ roll: 3, whole_day: false })
    expect(r.body.classes.find((c: any) => c.grade === '9')).toMatchObject({ marked: true, absent: [] })
    expect(r.body.classes.find((c: any) => c.grade === '8')).toMatchObject({ marked: false, absent: [] })      // not marked at all
  })

  test('2. Afternoon is its own list: only Bala, and 9-B has not marked it', async () => {
    const r = await call(admin, 'get', `/api/attendance/absentees?date=${day}&session=afternoon`)
    expect(r.body.totals).toMatchObject({ absent: 1, classes_marked: 1 })
    expect(r.body.classes.find((c: any) => c.grade === '10').absent.map((s: any) => s.name)).toEqual(['Bala Krishna'])
    expect(r.body.classes.find((c: any) => c.grade === '9').marked).toBe(false)
    expect((await call(admin, 'get', `/api/attendance/absentees?date=${day}`)).body.session).toBe('morning')      // default
  })

  test('3. A holiday is reported as a non-working day', async () => {
    const r = await call(admin, 'get', `/api/attendance/absentees?date=${holiday}&session=morning`)
    expect(r.body.non_working).toMatchObject({ kind: 'holiday', title: 'Founders Day' })
  })

  test('4. School admins only, only their own school, valid inputs only', async () => {
    expect((await call(anon, 'get', `/api/attendance/absentees?date=${day}`)).status).toBe(401)
    expect((await call(teacher, 'get', `/api/attendance/absentees?date=${day}`)).status).toBe(401)
    const other = await call(adminOther, 'get', `/api/attendance/absentees?date=${day}&session=morning`)   // the other school has no classes / absentees of ours
    expect(other.status).toBe(200)
    expect(other.body.totals).toMatchObject({ absent: 0, classes: 0 })
    expect(JSON.stringify(other.body)).not.toContain('Bala')
    expect((await call(admin, 'get', `/api/attendance/absentees?date=2026-13-40`)).status).toBe(400)
    expect((await call(admin, 'get', `/api/attendance/absentees?date=${day}&session=evening`)).status).toBe(400)
  })

  test('5. UI: Attendance → Day register → Absentees shows the names class-wise; the session toggle changes the list', async ({ browser }) => {
    test.setTimeout(150000)
    const ctx = await browser.newContext()
    await ctx.addCookies((await admin.storageState()).cookies.map(c => ({ name: c.name, value: c.value, url: BASE })))
    const page = await ctx.newPage()
    await page.goto(`${BASE}/school-admin`)
    await page.getByText('Attendance', { exact: true }).first().click({ timeout: 90000 })
    await page.getByTestId('attendance-tab-daily').click({ timeout: 30000 })
    await page.getByTestId('attendance-date-input').fill(day)
    await page.getByTestId('attendance-daily-view-absentees').click()

    await expect(page.getByTestId('absentees-total')).toHaveText('2', { timeout: 30000 })
    const classCard = page.locator('[data-testid^="absentees-class-"]')
    await expect(classCard).toHaveCount(1)
    await expect(classCard).toContainText('Class 10-A')
    await expect(classCard).toContainText('CT: Ms Rao')
    await expect(classCard).toContainText('Bala Krishna')
    await expect(classCard).toContainText('Chitra Devi')
    await expect(classCard).toContainText('Whole day')
    await expect(classCard).toContainText('Morning only')
    await expect(classCard).not.toContainText('Old Student')
    await expect(page.getByTestId('absentees-not-marked')).toContainText('8-C')          // 8-C has not marked Morning
    await expect(page.getByTestId('absentees-clean')).toContainText('9-B')               // 9-B marked, nobody absent

    await page.getByTestId('absentees-session-afternoon').click()
    await expect(page.getByTestId('absentees-total')).toHaveText('1')
    await expect(classCard).toContainText('Bala Krishna')
    await expect(classCard).not.toContainText('Chitra Devi')
    await expect(page.getByTestId('absentees-not-marked')).toContainText('9-B')

    // the class cards view is still there
    await page.getByTestId('attendance-daily-view-classes').click()
    await expect(page.getByTestId('attendance-day-stats')).toBeVisible()
    await ctx.close()
  })
})
