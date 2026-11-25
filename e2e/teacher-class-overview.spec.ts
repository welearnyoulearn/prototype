import { test, expect, type Page } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool from '../lib/db'
import { createExamSchool, type ExamSchool } from './fixtures/exam-school'
import { COOKIE_ADMIN, COOKIE_TEACHER, JWT_SECRET } from '../lib/auth-constants'
import { todayIST } from '../lib/attendanceRules'

// #505 — late counts as attended on every screen that shows a percentage.
// #503 — the teacher's class overview shows real results and attendance.

test.describe.serial('Teacher class overview and attendance percentages (#503, #505)', () => {
  let school: ExamSchool
  const today = todayIST()
  const secret = () => process.env.JWT_SECRET || JWT_SECRET

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    school = await createExamSchool('overview', { students: 5 })
    // Three present, one late, one absent: 80% attended.
    await pool.query(
      `INSERT INTO attendance_sessions (school_id, class_id, date, session, marked_by_teacher_id, marked_by_name, marked_by_role, marked_at)
       VALUES ($1, $2, $3, 'morning', $4, 'Exam Teacher', 'teacher', NOW())`,
      [school.schoolId, school.classId, today, school.teacherId])
    for (const [i, status] of ['present', 'present', 'present', 'late', 'absent'].entries()) {
      await pool.query(
        `INSERT INTO attendance (school_id, class_id, student_id, date, session, status) VALUES ($1, $2, $3, $4, 'morning', $5)`,
        [school.schoolId, school.classId, school.students[i], today, status])
    }
    // Released results: 90, 70, 50, 40 and 20 out of 100, pass mark 35%.
    const exam = await school.openExam('Overview Unit Test')
    expect((await school.enter(exam, school.students.map((s, i) => [s, [90, 70, 50, 40, 20][i]]), true)).status()).toBe(200)
    expect((await school.teacher.post(`/api/exams/${exam.examId}/review`, { data: { school_id: school.schoolId } })).status()).toBe(200)
    expect((await school.admin.post(`/api/exams/${exam.examId}/release`, { data: { school_id: school.schoolId } })).status()).toBe(200)
  })
  test.afterAll(async () => { await school?.cleanup() })

  async function openClass(page: Page, baseURL: string) {
    const sid = randomUUID()
    await pool.query(
      `INSERT INTO portal_sessions (id, actor_type, actor_id, school_id, expires_at) VALUES ($1, 'teacher', $2, $3, NOW() + INTERVAL '1 hour')`,
      [sid, school.teacherId, school.schoolId])
    await pool.query(`UPDATE teachers SET date_of_birth = '1990-01-01' WHERE id = $1`, [school.teacherId])
    await page.context().addCookies([{
      name: COOKIE_TEACHER, url: baseURL,
      value: jwt.sign({ teacherId: school.teacherId, schoolId: school.schoolId, role: 'teacher', passwordChanged: true, sid }, secret(), { expiresIn: '1h' }),
    }])
    await page.goto('/teacher')
    await page.getByText('Grade 8', { exact: false }).last().click()
    await expect(page).toHaveURL(/tab=class-view/)
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-open.png') })
  }

  test('today card counts the late student as attended', async ({ page, baseURL }) => {
    await openClass(page, baseURL!)
    await expect(page.getByText('80% attended')).toBeVisible()
    await expect(page.getByText('60% present')).toHaveCount(0)
  })

  test('overview shows results, at-risk students and the heatmap', async ({ page, baseURL }) => {
    await openClass(page, baseURL!)
    await expect(page.getByTestId('class-average')).toContainText('54%')
    await expect(page.getByTestId('class-at-risk')).toContainText('1')
    await expect(page.getByTestId(`class-student-avg-${school.students[0]}`)).toHaveText('90%')
    await expect(page.getByTestId('class-recent-results')).toContainText('Overview Unit Test')
    await expect(page.getByTestId('class-recent-results')).toContainText('4 passed · 1 failed')
    await expect(page.getByTestId('class-heatmap').locator(`[data-date="${today}"]`)).toHaveAttribute('title', /80% attended/)
    await expect(page.getByText('No exams published yet')).toHaveCount(0)
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true })
    await page.setViewportSize({ width: 375, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThan(100)
  })

  test('admin day register shows the same 80%', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: COOKIE_ADMIN, url: baseURL!, value: jwt.sign(school.adminPayload, secret(), { expiresIn: '1h' }) }])
    await page.goto('/school-admin?tab=attendance')
    await page.getByText('Day register', { exact: true }).click()
    await expect(page.getByText('80%').first()).toBeVisible()
    await expect(page.getByText('60%')).toHaveCount(0)
  })
})
