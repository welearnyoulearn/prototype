import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createAdminSchool, type AdminSchool } from './fixtures/admin-school'

// #518 — students admitted while the parent portal was off get a parent account when it is activated.
// #519 — the activation result shows the Login ID students sign in with.

test.describe.serial('Portal activation (#518, #519)', () => {
  let school: AdminSchool
  const portal = (key: string, enabled: boolean) => pool.query(
    `INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (school_id, feature_key) DO UPDATE SET enabled = $3`, [school.schoolId, key, enabled])
  const status = async () => await (await school.admin.get(`/api/school-admin/students/backfill-portal?school_id=${school.schoolId}`)).json() as { pendingCount: number }
  const activate = async () => {
    const res = await school.admin.post('/api/school-admin/students/backfill-portal', { data: { school_id: school.schoolId, target: 'both' } })
    expect(res.status(), await res.text()).toBe(200)
    return await res.json() as { credentials: { students: Array<{ student_id: number; login: string; temp_password: string }>; parents: Array<{ login: string }> } }
  }
  const row = async (id: number) => (await pool.query<{ roll_number: string; password_hash: string; parents: number }>(
    `SELECT roll_number, password_hash, (SELECT COUNT(*)::int FROM student_parents WHERE student_id = s.id) AS parents FROM students s WHERE id = $1`, [id])).rows[0]

  test.beforeAll(async () => { school = await createAdminSchool('activate') })
  test.afterAll(async () => { await school?.cleanup() })

  test('a missing parent account is counted and created, and the student login is kept', async () => {
    await portal('parent-portal', false)
    const phone = school.phone()
    const created = await school.admin.post('/api/students', { data: {
      school_id: school.schoolId, name: 'Portal Child', grade: '8', section: 'A', school_roll_number: 1, parent_name: 'Portal Parent', parent_phone: phone,
    } })
    expect(created.status(), await created.text()).toBe(201)
    const id = (await created.json()).id as number
    const before = await row(id)
    expect(before.parents).toBe(0)
    expect(before.password_hash).toBeTruthy()
    expect((await status()).pendingCount).toBe(0)

    await portal('parent-portal', true)
    expect((await status()).pendingCount).toBe(1)
    const out = await activate()
    expect(out.credentials.parents).toEqual([expect.objectContaining({ login: phone })])
    expect(out.credentials.students).toEqual([])
    const after = await row(id)
    expect(after.parents).toBe(1)
    expect(after.password_hash).toBe(before.password_hash)
    expect((await status()).pendingCount).toBe(0)
  })

  test('a student without an email gets their Login ID, and it works', async () => {
    const id = await school.addStudent('No Email Child')
    const out = await activate()
    const credential = out.credentials.students.find(s => s.student_id === id)!
    expect(credential.login).toBe((await row(id)).roll_number)
    const res = await school.admin.post('/api/student/auth/login', {
      data: { rollNumber: credential.login, password: credential.temp_password }, headers: { Cookie: '', 'X-Forwarded-For': `10.2.3.${Math.floor(Math.random() * 250)}` },
    })
    expect(res.status()).toBe(200)
  })

  test('running it again changes nothing', async () => {
    const out = await activate()
    expect([out.credentials.students, out.credentials.parents]).toEqual([[], []])
  })
})
