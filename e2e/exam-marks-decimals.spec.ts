import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createExamSchool, type ExamSchool } from './fixtures/exam-school'

// #502 — every mark with up to two decimals is accepted.

test.describe.serial('Exam marks with decimals (#502)', () => {
  let school: ExamSchool
  let exam: { examId: number; subjectId: number }

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createExamSchool('decimals')
    exam = await school.openExam('Decimal Test', 80)
  })
  test.afterAll(async () => { await school?.cleanup() })

  const stored = async () => Number((await pool.query(
    'SELECT marks_obtained FROM exam_marks WHERE exam_id = $1 AND student_id = $2', [exam.examId, school.students[0]])).rows[0].marks_obtained)

  for (const mark of [64.1, 8.2, 16.4, 1.1, 4.35, 0.07, 80, 0, '57.30']) {
    test(`accepts ${JSON.stringify(mark)}`, async () => {
      const res = await school.enter(exam, [[school.students[0], mark]])
      expect(res.status(), await res.text()).toBe(200)
      expect(await stored()).toBe(Number(mark))
    })
  }

  for (const mark of [1.005, 64.123, 80.01, -0.1, 'abc']) {
    test(`still refuses ${JSON.stringify(mark)}`, async () => {
      expect((await school.enter(exam, [[school.students[0], mark]])).status()).toBe(400)
    })
  }
})
