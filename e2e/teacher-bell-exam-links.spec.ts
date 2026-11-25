import { test, expect } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool from '../lib/db'
import { createExamSchool, type ExamSchool } from './fixtures/exam-school'
import { COOKIE_TEACHER, JWT_SECRET } from '../lib/auth-constants'

// #511 — tapping an exam notification in the teacher bell opens that class's marks, not a blank screen.

test.describe('Teacher bell exam links (#511)', () => {
  let school: ExamSchool
  let exam: { examId: number; subjectId: number }

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createExamSchool('bell')
    exam = await school.openExam('Bell Unit Test')
  })
  test.afterAll(async () => { await school?.cleanup() })

  async function openNotification(page: import('@playwright/test').Page, baseURL: string, type: string, data: object) {
    const title = `Notice ${type} ${randomUUID().slice(0, 6)}`
    // Only the notification under test is unread, so the bell lists it directly instead of grouping.
    await pool.query(`UPDATE notifications SET is_read = TRUE WHERE recipient_teacher_id = $1`, [school.teacherId])
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data) VALUES ($1, $2, $3, $4, 'Open me', $5)`,
      [school.schoolId, school.teacherId, type, title, JSON.stringify(data)])
    const sid = randomUUID()
    await pool.query(
      `INSERT INTO portal_sessions (id, actor_type, actor_id, school_id, expires_at) VALUES ($1, 'teacher', $2, $3, NOW() + INTERVAL '1 hour')`,
      [sid, school.teacherId, school.schoolId])
    await page.context().addCookies([{
      name: COOKIE_TEACHER, url: baseURL,
      value: jwt.sign({ teacherId: school.teacherId, schoolId: school.schoolId, role: 'teacher', passwordChanged: true, sid },
        process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' }),
    }])
    await pool.query(`UPDATE teachers SET date_of_birth = '1990-01-01' WHERE id = $1`, [school.teacherId])
    await page.goto('/teacher')
    await page.getByRole('button', { name: /^Notifications/ }).first().click()
    await page.getByText(title).click()
  }

  for (const type of ['marks_entry_required', 'marks_entry_nudge', 'marks_submitted', 'exam_entry_open', 'ack_completed']) {
    test(`${type} opens the class`, async ({ page, baseURL }) => {
      await openNotification(page, baseURL!, type, { exam_id: exam.examId, class_id: school.classId, subject_name: 'Mathematics' })
      await expect(page).toHaveURL(/tab=class-view/)
      await expect(page.getByText(/Marks & Results/).first()).toBeVisible()
    })
  }

  test('a notice without a class falls back to My Classes', async ({ page, baseURL }) => {
    await openNotification(page, baseURL!, 'marks_submitted', {})
    await expect(page).toHaveURL(/tab=my-classes/)
  })
})
