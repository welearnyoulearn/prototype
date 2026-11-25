import { request as playwrightRequest, expect, type APIRequestContext } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool, { ensureDB } from '../../lib/db'
import { COOKIE_ADMIN, COOKIE_STUDENT, COOKIE_TEACHER, JWT_SECRET } from '../../lib/auth-constants'

// A throwaway school with one class (8-A), one Mathematics teacher, students, and signed-in
// API clients, for exam specs.

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const secret = () => process.env.JWT_SECRET || JWT_SECRET

export type ExamSchool = Awaited<ReturnType<typeof createExamSchool>>

export async function createExamSchool(tag: string, opts: { classTeacher?: boolean; students?: number } = {}) {
  await ensureDB()
  const suffix = `${tag}-${Date.now()}-${randomUUID().slice(0, 6)}`
  const one = async (sql: string, params: unknown[]) => (await pool.query<{ id: number }>(sql, params)).rows[0].id

  const schoolId = await one(`INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`, [`Exam ${suffix}`])
  await pool.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`, [schoolId])
  const teacherId = await one(
    `INSERT INTO teachers (school_id, name, email, subject, staff_type, teaches_grades, status, password_changed)
     VALUES ($1, 'Exam Teacher', $2, 'Mathematics', 'teaching', '8', 'active', TRUE) RETURNING id`,
    [schoolId, `exam-${suffix}@test.invalid`])
  const classId = await one(`INSERT INTO classes (school_id, grade, section, class_teacher_id) VALUES ($1, '8', 'A', $2) RETURNING id`,
    [schoolId, opts.classTeacher === false ? null : teacherId])
  await pool.query(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Mathematics', $2)`, [classId, teacherId])

  let made = 0
  const addStudent = (name: string) => one(
    `INSERT INTO students (school_id, name, grade, section, roll_number, status, password_changed)
     VALUES ($1, $2, '8', 'A', $3, 'active', TRUE) RETURNING id`,
    [schoolId, name, `${suffix}-${++made}`])
  const students: number[] = []
  for (let i = 0; i < (opts.students ?? 2); i++) students.push(await addStudent(`Student ${String.fromCharCode(65 + i)}`))

  const clients: APIRequestContext[] = []
  const client = async (cookie: string, payload: object) => {
    const c = await playwrightRequest.newContext({
      baseURL, timeout: 60_000, extraHTTPHeaders: { Cookie: `${cookie}=${jwt.sign(payload, secret(), { expiresIn: '1h' })}` },
    })
    clients.push(c)
    return c
  }
  const portal = async (kind: 'teacher' | 'student', actorId: number) => {
    const sid = randomUUID()
    await pool.query(
      `INSERT INTO portal_sessions (id, actor_type, actor_id, school_id, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')`,
      [sid, kind, actorId, schoolId])
    return client(kind === 'teacher' ? COOKIE_TEACHER : COOKIE_STUDENT,
      { [`${kind}Id`]: actorId, schoolId, role: kind, passwordChanged: true, sid })
  }

  const userId = await one(
    `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed, status)
     VALUES ($1, $2, 'unused', 'school_admin', $3, FALSE, TRUE, 'active') RETURNING id`,
    [`exam-admin-${suffix}@test.invalid`, `EX-${suffix}`, schoolId])
  const adminSid = randomUUID()
  await pool.query(`INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`, [adminSid, userId])
  const adminPayload = { userId, role: 'school_admin', schoolId, sid: adminSid, firstLogin: false, profileCompleted: true }
  const admin = await client(COOKIE_ADMIN, adminPayload)
  const teacher = await portal('teacher', teacherId)

  /** Schedules a Mathematics exam out of `max`, already open for marks entry. */
  async function openExam(name: string, max = 100, scope: { student_ids?: number[] } = {}) {
    const res = await admin.post('/api/exams/schedule', { data: {
      school_id: schoolId, class_ids: [classId], exam_name: name, exam_type: 'unit_test', exam_date: '2099-08-01', passing_pct: 35,
      student_scope: scope.student_ids ? 'specific' : 'all', ...scope,
    } })
    expect(res.status(), await res.text()).toBe(201)
    const examId = await one(`SELECT id FROM exam_records WHERE exam_group_id = $1`, [(await res.json()).exam_group_id])
    const subjectId = await one(`SELECT id FROM exam_subjects WHERE exam_id = $1`, [examId])
    await pool.query(`UPDATE exam_records SET status = 'collecting' WHERE id = $1`, [examId])
    const set = await teacher.patch(`/api/exams/${examId}/subjects/${subjectId}`, { data: { school_id: schoolId, max_marks: max, pass_marks: Math.ceil(max * 0.35) } })
    expect(set.status(), await set.text()).toBe(200)
    return { examId, subjectId }
  }

  const enter = (exam: { examId: number; subjectId: number }, marks: Array<[number, unknown]>, submit = false) =>
    teacher.post(`/api/exams/${exam.examId}/marks`, { data: {
      school_id: schoolId,
      entries: marks.map(([student_id, marks_obtained]) => ({ exam_subject_id: exam.subjectId, student_id, marks_obtained, is_absent: false })),
      ...(submit ? { submit_subject_ids: [exam.subjectId] } : {}),
    } })

  async function cleanup() {
    await Promise.all(clients.map(c => c.dispose()))
    await pool.query(`UPDATE exam_marks SET entered_by = NULL WHERE school_id = $1`, [schoolId])
    await pool.query(`DELETE FROM schools WHERE id = $1`, [schoolId])
  }

  return { schoolId, classId, teacherId, students, admin, teacher, portal, addStudent, openExam, enter, cleanup, adminPayload }
}
