import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createAdminSchool, type AdminSchool } from './fixtures/admin-school'

// #515 — before removing a teacher the admin is shown what will be unassigned.

test.describe.serial('Teacher removal warning (#515)', () => {
  let school: AdminSchool
  let teacherId = 0
  const one = async (sql: string, p: unknown[]) => (await pool.query<{ id: number }>(sql, p)).rows[0].id

  test.beforeAll(async () => {
    school = await createAdminSchool('removal')
    teacherId = await one(
      `INSERT INTO teachers (school_id, name, email, phone, subject, staff_type, status, password_changed)
       VALUES ($1, 'Leaving Teacher', $2, '9000000021', 'Mathematics', 'teaching', 'active', TRUE) RETURNING id`,
      [school.schoolId, `leaving-${school.suffix}@test.invalid`])
    const classId = await one(`INSERT INTO classes (school_id, grade, section, class_teacher_id) VALUES ($1, '8', 'A', $2) RETURNING id`, [school.schoolId, teacherId])
    await pool.query(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Mathematics', $2)`, [classId, teacherId])
  })
  test.afterAll(async () => { await school?.cleanup() })

  const expected = {
    subjects_teaching: [{ subject_name: 'Mathematics', grade: '8', section: 'A' }],
    class_teacher_of: [{ grade: '8', section: 'A' }],
  }

  test('the preview lists the assignments and removes nothing', async () => {
    const res = await school.admin.get(`/api/teachers/${teacherId}?consequences=true`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual(expected)
    expect((await pool.query('SELECT status FROM teachers WHERE id = $1', [teacherId])).rows[0].status).toBe('active')
  })

  test('another school cannot see the preview', async () => {
    const other = await createAdminSchool('removal-other')
    try {
      expect((await other.admin.get(`/api/teachers/${teacherId}?consequences=true`)).status()).toBe(403)
    } finally { await other.cleanup() }
  })

  test('the remove dialog shows them instead of "Safe to remove"', async ({ page, baseURL }) => {
    await school.signIn(page, baseURL!)
    await page.goto('/school-admin?tab=staff')
    await page.getByText('Leaving Teacher').first().click()
    await page.getByRole('button', { name: /remove from school/i }).first().click()
    await expect(page.getByText(/Mathematics/).last()).toBeVisible()
    await expect(page.getByText(/class teacher/i).last()).toBeVisible()
    await expect(page.getByText('No active assignments found. Safe to remove.')).toHaveCount(0)
  })
})
