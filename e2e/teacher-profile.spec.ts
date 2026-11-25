import { test, expect } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool from '../lib/db'
import { createExamSchool, type ExamSchool } from './fixtures/exam-school'
import { COOKIE_TEACHER, JWT_SECRET } from '../lib/auth-constants'

// #504 — a teacher can save their own contact details, and only those.

test.describe.serial('Teacher own profile (#504)', () => {
  let school: ExamSchool
  const row = async (id = school.teacherId) => (await pool.query(
    `SELECT name, email, phone, qualification, subject, date_of_joining::text AS joined FROM teachers WHERE id = $1`, [id])).rows[0]
  const save = (data: object) => school.teacher.put('/api/teacher/profile', { data })

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createExamSchool('profile')
    await pool.query(
      `UPDATE teachers SET phone = '9000000001', qualification = 'B.Ed', date_of_joining = '2024-06-01', date_of_birth = '1990-01-01' WHERE id = $1`,
      [school.teacherId])
  })
  test.afterAll(async () => { await school?.cleanup() })

  test('the profile the portal loads includes the saved details', async () => {
    const me = await (await school.teacher.get('/api/teacher/auth/me')).json()
    expect(me).toMatchObject({ phone: '9000000001', qualification: 'B.Ed', date_of_joining: '2024-06-01' })
  })

  test('phone and qualification save', async () => {
    const res = await save({ phone: '+91 90000-00002', qualification: 'M.Sc, B.Ed' })
    expect(res.status(), await res.text()).toBe(200)
    expect(await row()).toMatchObject({ phone: '+919000000002', qualification: 'M.Sc, B.Ed' })
  })

  test('other details cannot be changed here', async () => {
    const before = await row()
    for (const body of [{ email: 'taken@test.invalid' }, { name: 'Someone Else' }, { subject: 'Science', phone: '9000000003' }, { status: 'inactive' }]) {
      expect((await save(body)).status(), JSON.stringify(body)).toBe(400)
    }
    expect(await row()).toEqual(before)
  })

  test('bad values are refused', async () => {
    for (const body of [{ phone: '' }, { phone: 'abc' }, { phone: '123' }, { qualification: 'x'.repeat(201) }, { phone: 12345678 }, {}]) {
      expect((await save(body)).status(), JSON.stringify(body).slice(0, 40)).toBeGreaterThanOrEqual(400)
    }
    await pool.query(
      `INSERT INTO teachers (school_id, name, email, phone, status, password_changed) VALUES ($1, 'Other Teacher', $2, '9000000009', 'active', TRUE)`,
      [school.schoolId, `other-${randomUUID()}@test.invalid`])
    expect((await save({ phone: '9000000009' })).status()).toBe(409)
  })

  test('only a signed-in teacher can use it', async () => {
    expect((await school.admin.put('/api/teacher/profile', { data: { phone: '9000000004' } })).status()).toBe(401)
  })

  test('editing on the My Profile screen saves', async ({ page, baseURL }) => {
    const sid = randomUUID()
    await pool.query(
      `INSERT INTO portal_sessions (id, actor_type, actor_id, school_id, expires_at) VALUES ($1, 'teacher', $2, $3, NOW() + INTERVAL '1 hour')`,
      [sid, school.teacherId, school.schoolId])
    await page.context().addCookies([{
      name: COOKIE_TEACHER, url: baseURL!,
      value: jwt.sign({ teacherId: school.teacherId, schoolId: school.schoolId, role: 'teacher', passwordChanged: true, sid },
        process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' }),
    }])
    await page.goto('/teacher')
    await page.getByRole('button', { name: 'My Profile' }).click()
    await expect(page.getByText('B.Ed', { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Edit Profile' }).click()
    await expect(page.getByLabel('Full Name')).toHaveCount(0)
    await page.getByLabel('Phone').fill('9000000005')
    await page.getByLabel('Qualification').fill('M.Ed')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Profile updated successfully')).toBeVisible()
    await expect(page.getByText('9000000005')).toBeVisible()
    expect(await row()).toMatchObject({ phone: '9000000005', qualification: 'M.Ed' })
  })
})
