import 'dotenv/config'
import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool, { ensureDB } from '../lib/db'
import { COOKIE_ADMIN, COOKIE_TEACHER, JWT_SECRET } from '../lib/auth-constants'

test.describe.serial('Class Management security, lifecycle, and data-flow regression', () => {
  let schoolA = 0
  let schoolB = 0
  let teacherA = 0
  let teacherB = 0
  let wrongGradeTeacher = 0
  let adminA: APIRequestContext
  let adminB: APIRequestContext
  let teacherClient: APIRequestContext
  let adminAToken = ''
  const suffix = `${Date.now()}-${randomUUID().slice(0, 6)}`

  async function makeAdmin(schoolId: number, label: string) {
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed, status)
       VALUES ($1,$2,'unused','school_admin',$3,FALSE,TRUE,'active') RETURNING id`,
      [`class-${label}-${suffix}@test.invalid`, `CL-${label}-${suffix}`, schoolId],
    )
    const sid = randomUUID()
    await pool.query(`INSERT INTO user_sessions (id,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 hour')`, [sid, user.rows[0].id])
    const token = jwt.sign({ userId: user.rows[0].id, role: 'school_admin', schoolId, sid, firstLogin: false, profileCompleted: true }, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' })
    if (label === 'a') adminAToken = token
    return playwrightRequest.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
      timeout: 60_000,
      extraHTTPHeaders: { Cookie: `${COOKIE_ADMIN}=${token}` },
    })
  }

  test.beforeAll(async () => {
    await ensureDB()
    const schools = await pool.query<{ id: number }>(
      `INSERT INTO schools (name, status) VALUES ($1,'active'),($2,'active') RETURNING id`,
      [`Class Flow A ${suffix}`, `Class Flow B ${suffix}`],
    )
    schoolA = schools.rows[0].id
    schoolB = schools.rows[1].id
    await pool.query(`INSERT INTO school_subscriptions (school_id,tier) VALUES ($1,'premium'),($2,'premium')`, [schoolA, schoolB])
    await pool.query(
      `INSERT INTO school_feature_overrides (school_id,feature_key,enabled)
       VALUES ($1,'class-management',TRUE),($1,'students',TRUE),($1,'student-portal',FALSE),($1,'parent-portal',FALSE),
              ($2,'class-management',TRUE)`,
      [schoolA, schoolB],
    )
    const teachers = await pool.query<{ id: number }>(
      `INSERT INTO teachers (school_id,name,email,subject,staff_type,teaches_grades,status,password_changed)
       VALUES ($1,'Teacher A',$2,'Mathematics','teaching','6,7','active',TRUE),
              ($3,'Teacher B',$4,'Mathematics','teaching','6,7','active',TRUE),
              ($1,'Wrong Grade',$5,'Mathematics','teaching','10','active',TRUE)
       RETURNING id`,
      [schoolA, `teacher-a-${suffix}@test.invalid`, schoolB, `teacher-b-${suffix}@test.invalid`, `wrong-${suffix}@test.invalid`],
    )
    teacherA = teachers.rows[0].id
    teacherB = teachers.rows[1].id
    wrongGradeTeacher = teachers.rows[2].id
    adminA = await makeAdmin(schoolA, 'a')
    adminB = await makeAdmin(schoolB, 'b')

    const sid = randomUUID()
    await pool.query(
      `INSERT INTO portal_sessions (id,actor_type,actor_id,school_id,expires_at)
       VALUES ($1,'teacher',$2,$3,NOW()+INTERVAL '1 hour')`,
      [sid, teacherA, schoolA],
    )
    const token = jwt.sign({ teacherId: teacherA, schoolId: schoolA, role: 'teacher', passwordChanged: true, sid }, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' })
    teacherClient = await playwrightRequest.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
      timeout: 60_000,
      extraHTTPHeaders: { Cookie: `${COOKIE_TEACHER}=${token}` },
    })
  })

  test.afterAll(async () => {
    await Promise.all([adminA?.dispose(), adminB?.dispose(), teacherClient?.dispose()])
    if (schoolA) await pool.query('DELETE FROM schools WHERE id=$1', [schoolA])
    if (schoolB) await pool.query('DELETE FROM schools WHERE id=$1', [schoolB])
  })

  test('validates class identity and accepts supported pre-primary grades', async () => {
    const invalid = await adminA.post('/api/classes', { data: { school_id: schoolA, grade: '999', section: 'AA' } })
    expect(invalid.status()).toBe(422)

    const created = await adminA.post('/api/classes', { data: { school_id: schoolA, grade: 'Nursery', section: 'a' } })
    expect(created.status()).toBe(201)
    const body = await created.json()
    expect(body).toMatchObject({ grade: 'Nursery', section: 'A' })
    expect(body.subjects_assigned).toBeGreaterThanOrEqual(0)
  })

  test('mobile admin UI exposes accessible pre-primary class creation controls', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.context().addCookies([{
      name: COOKIE_ADMIN,
      value: adminAToken,
      url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    }])
    await page.goto('/school-admin?tab=class-management')
    const add = page.getByRole('button', { name: 'Add class' })
    await expect(add).toBeVisible({ timeout: 60_000 })
    await add.click()
    const grade = page.locator('#new-class-grade')
    await expect(grade).toContainText('Nursery')
    await expect(grade).toContainText('LKG')
    await expect(grade).toContainText('UKG')
    await grade.selectOption('LKG')
    await page.locator('#new-class-section').fill('b')
    await expect(page.locator('#new-class-section')).toHaveValue('B')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })

  test('rejects cross-school and ineligible class-teacher IDs at the API boundary', async () => {
    const created = await adminA.post('/api/classes', { data: { school_id: schoolA, grade: '6', section: 'A' } })
    const cls = await created.json()
    expect((await adminA.put(`/api/classes/${cls.id}`, { data: { class_teacher_id: teacherB } })).status()).toBe(403)
    expect((await adminA.put(`/api/classes/${cls.id}`, { data: { class_teacher_id: wrongGradeTeacher } })).status()).toBe(422)
    expect((await adminB.put(`/api/classes/${cls.id}`, { data: { class_teacher_id: teacherB } })).status()).toBe(403)
    const unchanged = await pool.query('SELECT class_teacher_id FROM classes WHERE id=$1', [cls.id])
    expect(unchanged.rows[0].class_teacher_id).toBeNull()
  })

  test('rejects cross-school and subject-incompatible subject teachers', async () => {
    let cls = (await pool.query(`SELECT id FROM classes WHERE school_id=$1 AND grade='6' AND section='A'`, [schoolA])).rows[0]
    if (!cls) cls = await adminA.post('/api/classes', { data: { school_id: schoolA, grade: '6', section: 'A' } }).then(response => response.json())
    const subject = (await adminA.get(`/api/classes/${cls.id}/subjects`).then(response => response.json()))[0]
    expect(subject).toBeTruthy()
    expect((await adminA.patch(`/api/classes/${cls.id}/subjects`, { data: { subject_id: subject.id, teacher_id: teacherB } })).status()).toBe(403)
    if (subject.subject_name !== 'Mathematics') {
      expect((await adminA.patch(`/api/classes/${cls.id}/subjects`, { data: { subject_id: subject.id, teacher_id: teacherA } })).status()).toBe(422)
    }
    const arbitrary = await adminA.post(`/api/classes/${cls.id}/subjects`, { data: {
      subject_name: `Unconfigured ${suffix}`, teacher_id: null, periods_per_week: 4,
    } })
    expect(arbitrary.status()).toBe(422)
  })

  test('supports multiple class-teacher assignments consistently in teacher APIs', async () => {
    const classA = (await pool.query(`SELECT id FROM classes WHERE school_id=$1 AND grade='6' AND section='A'`, [schoolA])).rows[0].id
    const classBResponse = await adminA.post('/api/classes', { data: { school_id: schoolA, grade: '7', section: 'B', class_teacher_id: teacherA } })
    expect(classBResponse.status()).toBe(201)
    const classB = (await classBResponse.json()).id
    expect((await adminA.put(`/api/classes/${classA}`, { data: { class_teacher_id: teacherA } })).status()).toBe(200)

    const me = await teacherClient.get('/api/teacher/auth/me')
    expect(me.status()).toBe(200)
    const assignments = (await me.json()).class_teacher_assignments as { id: number }[]
    expect(assignments.map(item => item.id)).toEqual(expect.arrayContaining([classA, classB]))
    expect((await teacherClient.get(`/api/classes/${classA}`)).status()).toBe(200)
    expect((await teacherClient.get(`/api/classes/${classB}`)).status()).toBe(200)
    const visible = await teacherClient.get(`/api/classes?school_id=${schoolA}`)
    expect((await visible.json()).map((item: { id: number }) => item.id)).toEqual(expect.arrayContaining([classA, classB]))
  })

  test('student onboarding auto-creates a fully initialized class', async () => {
    const response = await adminA.post('/api/students', { data: {
      school_id: schoolA,
      name: 'Class Flow Student',
      grade: '6',
      section: 'Z',
      parent_name: 'Class Flow Parent',
      parent_phone: '9876543210',
      school_roll_number: 1,
    } })
    expect(response.status()).toBe(201)
    const createdClass = await pool.query<{ id: number }>(
      `SELECT id FROM classes WHERE school_id=$1 AND grade='6' AND section='Z' AND deleted_at IS NULL`, [schoolA],
    )
    expect(createdClass.rowCount).toBe(1)
    const subjects = await pool.query(`SELECT id FROM class_subjects WHERE class_id=$1`, [createdClass.rows[0].id])
    expect(subjects.rowCount).toBeGreaterThan(0)
  })

  test('simultaneous onboarding safely shares one newly initialized class', async () => {
    const student = (name: string, roll: number, phone: string) => ({
      school_id: schoolA,
      name,
      grade: '7',
      section: 'Q',
      parent_name: `${name} Parent`,
      parent_phone: phone,
      school_roll_number: roll,
    })
    const [first, second] = await Promise.all([
      adminA.post('/api/students', { data: student('Concurrent One', 1, '9876543211') }),
      adminA.post('/api/students', { data: student('Concurrent Two', 2, '9876543212') }),
    ])
    expect([first.status(), second.status()]).toEqual([201, 201])
    const classes = await pool.query<{ id: number }>(
      `SELECT id FROM classes WHERE school_id=$1 AND grade='7' AND section='Q'`, [schoolA],
    )
    expect(classes.rowCount).toBe(1)
    expect((await pool.query(`SELECT id FROM class_subjects WHERE class_id=$1`, [classes.rows[0].id])).rowCount).toBeGreaterThan(0)
  })

  test('invalid delete modes are harmless; removed classes restore cleanly', async () => {
    const created = await adminA.post('/api/classes', { data: { school_id: schoolA, grade: '8', section: 'C' } })
    const cls = await created.json()
    expect((await adminA.delete(`/api/classes/${cls.id}`, { data: { mode: 'erase-everything' } })).status()).toBe(400)
    expect((await pool.query('SELECT deleted_at FROM classes WHERE id=$1', [cls.id])).rows[0].deleted_at).toBeNull()

    expect((await adminA.delete(`/api/classes/${cls.id}`, { data: { mode: 'manual' } })).status()).toBe(200)
    expect((await adminA.get(`/api/classes/${cls.id}/subjects`)).status()).toBe(404)
    const restored = await adminA.post(`/api/classes/${cls.id}/restore`)
    expect(restored.status()).toBe(200)
    expect((await restored.json()).subjects_assigned).toBeGreaterThan(0)
    expect((await adminA.get(`/api/classes/${cls.id}/subjects`)).status()).toBe(200)
  })

  test('reassignment is atomic when target roll numbers collide', async () => {
    const source = (await adminA.post('/api/classes', { data: { school_id: schoolA, grade: '9', section: 'A' } }).then(response => response.json())).id
    const target = (await adminA.post('/api/classes', { data: { school_id: schoolA, grade: '9', section: 'B' } }).then(response => response.json())).id
    await pool.query(
      `INSERT INTO students (school_id,name,grade,section,roll_number,school_roll_number,status)
       VALUES ($1,'Source Student','9','A',$2,1,'active'),($1,'Target Student','9','B',$3,1,'active')`,
      [schoolA, `SRC-${suffix}`, `TGT-${suffix}`],
    )
    const move = await adminA.delete(`/api/classes/${source}`, { data: { mode: 'reassign', targetClassId: target } })
    expect(move.status()).toBe(409)
    const sourceState = await pool.query(`SELECT deleted_at FROM classes WHERE id=$1`, [source])
    const studentState = await pool.query(`SELECT section FROM students WHERE school_id=$1 AND roll_number=$2`, [schoolA, `SRC-${suffix}`])
    expect(sourceState.rows[0].deleted_at).toBeNull()
    expect(studentState.rows[0].section).toBe('A')
  })
})
