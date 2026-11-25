import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createExamSchool, type ExamSchool } from './fixtures/exam-school'

// #500 — an exam for a class without a class teacher can be released.
// #501 — a student joining after marks are submitted does not leave the exam stuck.

const status = async (examId: number) =>
  (await pool.query<{ status: string }>('SELECT status FROM exam_records WHERE id = $1', [examId])).rows[0].status

test.describe.serial('Release without a class teacher (#500)', () => {
  let school: ExamSchool
  let exam: { examId: number; subjectId: number }
  const release = (body: object = {}) => school.admin.post(`/api/exams/${exam.examId}/release`, { data: { school_id: school.schoolId, ...body } })
  const canRelease = async () => (await (await school.admin.get(`/api/exams/${exam.examId}/marks?school_id=${school.schoolId}`)).json()).admin_can_release

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createExamSchool('noct', { classTeacher: false })
    exam = await school.openExam('No Class Teacher')
  })
  test.afterAll(async () => { await school?.cleanup() })

  test('not before every subject is submitted', async () => {
    expect(await canRelease()).toBe(false)
    expect((await release()).status()).toBe(409)
  })

  test('the admin releases once marks are submitted', async () => {
    expect((await school.enter(exam, school.students.map(s => [s, 70]), true)).status()).toBe(200)
    expect(await canRelease()).toBe(true)
    const res = await release()
    expect(res.status(), await res.text()).toBe(200)
    expect(await status(exam.examId)).toBe('released')
  })

  test('a class that has a teacher still needs the review', async () => {
    const other = await createExamSchool('hasct')
    try {
      const e = await other.openExam('Needs Review')
      expect((await other.enter(e, other.students.map(s => [s, 50]), true)).status()).toBe(200)
      expect((await other.admin.post(`/api/exams/${e.examId}/release`, { data: { school_id: other.schoolId } })).status()).toBe(409)
      expect(await status(e.examId)).toBe('collecting')
    } finally { await other.cleanup() }
  })
})

test.describe.serial('A student joins after review (#501)', () => {
  let school: ExamSchool
  let exam: { examId: number; subjectId: number }
  let joiner = 0
  const release = (body: object = {}) => school.admin.post(`/api/exams/${exam.examId}/release`, { data: { school_id: school.schoolId, ...body } })

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createExamSchool('joiner')
    exam = await school.openExam('Late Joiner')
    expect((await school.enter(exam, school.students.map(s => [s, 60]), true)).status()).toBe(200)
    expect((await school.teacher.post(`/api/exams/${exam.examId}/review`, { data: { school_id: school.schoolId } })).status()).toBe(200)
    joiner = await school.addStudent('New Joiner')
  })
  test.afterAll(async () => { await school?.cleanup() })

  test('release asks before leaving anyone out', async () => {
    const res = await release()
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('STUDENTS_WITHOUT_MARKS')
    expect(body.students).toEqual([{ id: joiner, name: 'New Joiner' }])
    expect(await status(exam.examId)).toBe('teacher_reviewed')
  })

  test('after confirming, everyone with marks gets results and the joiner gets none', async () => {
    const res = await release({ confirm_missing: true })
    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).students_released).toBe(2)
    const results = await (await school.admin.get(`/api/exams/${exam.examId}/marks?school_id=${school.schoolId}`)).json()
    expect(results.students.map((s: { student_id: number }) => s.student_id).sort()).toEqual([...school.students].sort())
    const own = async (id: number) => (await (await school.admin.get(`/api/students/${id}/exams?school_id=${school.schoolId}&class_id=${school.classId}`)).json()) as unknown[]
    expect(await own(joiner)).toEqual([])
    expect(await own(school.students[0])).toHaveLength(1)
    const notified = await pool.query(`SELECT 1 FROM notifications WHERE recipient_student_id = $1 AND type = 'marks_released'`, [joiner])
    expect(notified.rowCount).toBe(0)
  })

  test('a student with only some marks blocks review with a clear reason', async () => {
    const two = await createExamSchool('partial')
    try {
      const e = await two.openExam('Partial')
      expect((await two.enter(e, two.students.map(s => [s, 40]), true)).status()).toBe(200)
      // A second submitted subject that one student has no mark in.
      await pool.query(`INSERT INTO exam_subjects (exam_id, school_id, subject_name, teacher_id, max_marks, status)
                        VALUES ($1, $2, 'Science', $3, 100, 'submitted')`, [e.examId, two.schoolId, two.teacherId])
      await pool.query(`INSERT INTO exam_marks (exam_id, school_id, student_id, subject_name, marks_obtained, is_absent)
                        VALUES ($1, $2, $3, 'Science', 50, FALSE)`, [e.examId, two.schoolId, two.students[0]])
      const res = await two.teacher.post(`/api/exams/${e.examId}/review`, { data: { school_id: two.schoolId } })
      expect(res.status()).toBe(400)
      expect((await res.json()).error).toContain('Student B')
    } finally { await two.cleanup() }
  })
})
