import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createExamSchool, type ExamSchool } from './fixtures/exam-school'

// #506 — the marks CSV lists only the students in the exam, and gives no result to a student without marks.

test.describe.serial('Marks CSV (#506)', () => {
  let school: ExamSchool
  let exam: { examId: number; subjectId: number }
  const rows = async () => {
    const res = await school.admin.get(`/api/export/marks?school_id=${school.schoolId}&exam_id=${exam.examId}`)
    expect(res.status()).toBe(200)
    return (await res.text()).split('\r\n').slice(3).map(line => line.slice(1, -1).split('","'))
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createExamSchool('csv', { students: 5 })
    exam = await school.openExam('Selected Students', 100, { student_ids: school.students.slice(0, 2) })
  })
  test.afterAll(async () => { await school?.cleanup() })

  test('only the selected students, with blank totals before any marks', async () => {
    const out = await rows()
    expect(out.map(r => r[0])).toEqual(['Student A', 'Student B'])
    for (const r of out) expect(r.slice(2)).toEqual(['—', '', '', ''])
  })

  test('a student with marks gets a result; one without still does not', async () => {
    expect((await school.enter(exam, [[school.students[0], 20]])).status()).toBe(200)
    const out = await rows()
    expect(out[0].slice(2)).toEqual(['20.00', '20', '20.0%', 'FAIL'])
    expect(out[1].slice(2)).toEqual(['—', '', '', ''])
  })

  test('a whole-class exam still lists the whole class', async () => {
    // Cancel the first exam so a second one at the same time is not a schedule conflict.
    await pool.query(`UPDATE exam_records SET status = 'cancelled' WHERE id = $1`, [exam.examId])
    exam = await school.openExam('Everyone')
    expect(await rows()).toHaveLength(5)
  })
})
