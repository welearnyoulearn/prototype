import { test, expect } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { createExamSchool, type ExamSchool } from './fixtures/exam-school'
import { COOKIE_ADMIN, JWT_SECRET } from '../lib/auth-constants'

// #499 — printing report cards shows every card and nothing else.

test.describe('Report card printing (#499)', () => {
  let school: ExamSchool

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createExamSchool('print', { students: 3 })
    const exam = await school.openExam('Print Test')
    expect((await school.enter(exam, school.students.map(s => [s, 72]), true)).status()).toBe(200)
    expect((await school.teacher.post(`/api/exams/${exam.examId}/review`, { data: { school_id: school.schoolId } })).status()).toBe(200)
    expect((await school.admin.post(`/api/exams/${exam.examId}/release`, { data: { school_id: school.schoolId } })).status()).toBe(200)
  })
  test.afterAll(async () => { await school?.cleanup() })

  test('print view holds one card per student', async ({ page, context, baseURL }) => {
    await context.addCookies([{
      name: COOKIE_ADMIN, url: baseURL!,
      value: jwt.sign(school.adminPayload, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' }),
    }])
    await page.goto('/school-admin?tab=export')
    await page.getByRole('button', { name: /report cards/i }).first().click()
    await page.locator('select').filter({ hasText: 'Print Test' }).selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Generate' }).click()
    const preview = page.getByTestId('report-card-preview')
    await expect(preview.locator('.print-page')).toHaveCount(3)
    await expect(page.locator('#report-card-root')).toBeHidden()

    await page.emulateMedia({ media: 'print' })
    const cards = page.locator('#report-card-root .print-page')
    await expect(cards).toHaveCount(3)
    for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toBeVisible()
    await expect(preview).toBeHidden()
    const printed = await page.evaluate(() => document.body.innerText)
    expect(printed).toContain('Student A')
    expect(printed).toContain('Student C')
    expect(printed).not.toContain('Select Exam')
    const pdf = await page.pdf({ format: 'A4' })
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(3)
  })
})
