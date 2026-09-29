import 'dotenv/config'
import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool, { ensureDB } from '../lib/db'
import { COOKIE_ADMIN, COOKIE_PARENT, COOKIE_STUDENT, COOKIE_TEACHER, JWT_SECRET } from '../lib/auth-constants'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

test.describe.serial('Exams and results authorization, targeting, and atomicity', () => {
  test.setTimeout(120_000)
  const suffix = `${Date.now()}-${randomUUID().slice(0, 6)}`
  let schoolId = 0
  let classId = 0
  let otherClassId = 0
  let teacherId = 0
  let unrelatedTeacherId = 0
  let adminUserId = 0
  let student1 = 0
  let student2 = 0
  let untargetedStudent = 0
  let parentId = 0
  let examId = 0
  let subjectId = 0
  let admin: APIRequestContext
  let teacher: APIRequestContext
  let unrelatedTeacher: APIRequestContext
  let student: APIRequestContext
  let parent: APIRequestContext

  async function context(cookie: string, token: string) {
    return playwrightRequest.newContext({ baseURL, timeout: 60_000, extraHTTPHeaders: { Cookie: `${cookie}=${token}` } })
  }

  async function portalContext(kind: 'teacher' | 'student' | 'parent', actorId: number, cookie: string) {
    const sid = randomUUID()
    await pool.query(
      `INSERT INTO portal_sessions (id, actor_type, actor_id, school_id, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')`,
      [sid, kind, actorId, schoolId],
    )
    const identity = kind === 'teacher' ? { teacherId: actorId } : kind === 'student' ? { studentId: actorId } : { parentId: actorId }
    const token = jwt.sign({ ...identity, schoolId, role: kind, passwordChanged: true, sid }, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' })
    return context(cookie, token)
  }

  test.beforeAll(async () => {
    await ensureDB()
    schoolId = (await pool.query(`INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`, [`Exam Hardening ${suffix}`])).rows[0].id
    await pool.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`, [schoolId])
    const teachers = await pool.query(`
      INSERT INTO teachers (school_id, name, email, subject, staff_type, teaches_grades, status, password_changed)
      VALUES ($1, 'Exam Teacher', $2, 'Mathematics', 'teaching', '8', 'active', TRUE),
             ($1, 'Unrelated Teacher', $3, 'Science', 'teaching', '9', 'active', TRUE)
      RETURNING id
    `, [schoolId, `exam-teacher-${suffix}@test.invalid`, `unrelated-${suffix}@test.invalid`])
    teacherId = teachers.rows[0].id
    unrelatedTeacherId = teachers.rows[1].id
    classId = (await pool.query(`INSERT INTO classes (school_id, grade, section, class_teacher_id) VALUES ($1, '8', 'A', $2) RETURNING id`, [schoolId, teacherId])).rows[0].id
    otherClassId = (await pool.query(`INSERT INTO classes (school_id, grade, section, class_teacher_id) VALUES ($1, '9', 'B', $2) RETURNING id`, [schoolId, unrelatedTeacherId])).rows[0].id
    await pool.query(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Mathematics', $2), ($3, 'Science', $4)`, [classId, teacherId, otherClassId, unrelatedTeacherId])
    const students = await pool.query(`
      INSERT INTO students (school_id, name, grade, section, roll_number, status, password_changed)
      VALUES ($1, 'Target One', '8', 'A', $2, 'active', TRUE),
             ($1, 'Target Two', '8', 'A', $3, 'active', TRUE),
             ($1, 'Not Targeted', '8', 'A', $4, 'active', TRUE)
      RETURNING id
    `, [schoolId, `E1-${suffix}`, `E2-${suffix}`, `E3-${suffix}`])
    student1 = students.rows[0].id
    student2 = students.rows[1].id
    untargetedStudent = students.rows[2].id
    parentId = (await pool.query(`INSERT INTO parents (school_id, name, phone, password_changed) VALUES ($1, 'Parent', $2, TRUE) RETURNING id`, [schoolId, `9${Date.now().toString().slice(-9)}`])).rows[0].id
    await pool.query(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [untargetedStudent, parentId])

    const user = await pool.query(`
      INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed, status)
      VALUES ($1, $2, 'unused', 'school_admin', $3, FALSE, TRUE, 'active') RETURNING id
    `, [`exam-admin-${suffix}@test.invalid`, `EX-${suffix}`, schoolId])
    adminUserId = user.rows[0].id
    const adminSid = randomUUID()
    await pool.query(`INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`, [adminSid, adminUserId])
    const adminToken = jwt.sign({ userId: adminUserId, role: 'school_admin', schoolId, sid: adminSid, firstLogin: false, profileCompleted: true }, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' })
    admin = await context(COOKIE_ADMIN, adminToken)
    teacher = await portalContext('teacher', teacherId, COOKIE_TEACHER)
    unrelatedTeacher = await portalContext('teacher', unrelatedTeacherId, COOKIE_TEACHER)
    student = await portalContext('student', student1, COOKIE_STUDENT)
    parent = await portalContext('parent', parentId, COOKIE_PARENT)

    const scheduled = await admin.post('/api/exams/schedule', { data: {
      school_id: schoolId, class_ids: [classId], exam_name: 'Security Regression Exam', exam_type: 'unit_test',
      exam_date: '2099-08-01', passing_pct: 35, student_scope: 'specific', student_ids: [student1, student2],
    } })
    expect(scheduled.status()).toBe(201)
    const groupId = (await scheduled.json()).exam_group_id
    examId = (await pool.query(`SELECT id FROM exam_records WHERE exam_group_id = $1`, [groupId])).rows[0].id
    subjectId = (await pool.query(`SELECT id FROM exam_subjects WHERE exam_id = $1`, [examId])).rows[0].id
    await pool.query(`UPDATE exam_records SET status = 'collecting' WHERE id = $1`, [examId])
    const configured = await teacher.patch(`/api/exams/${examId}/subjects/${subjectId}`, { data: { school_id: schoolId, max_marks: 100, pass_marks: 40 } })
    expect(configured.status()).toBe(200)
  })

  test.afterAll(async () => {
    await Promise.all([admin?.dispose(), teacher?.dispose(), unrelatedTeacher?.dispose(), student?.dispose(), parent?.dispose()])
    if (schoolId) await pool.query(`UPDATE exam_marks SET entered_by = NULL WHERE school_id = $1`, [schoolId])
    if (schoolId) await pool.query(`DELETE FROM schools WHERE id = $1`, [schoolId])
  })

  test('blocks operational exam data from students and unrelated teachers', async () => {
    expect((await student.get(`/api/exams/${examId}?school_id=${schoolId}`)).status()).toBe(403)
    expect((await unrelatedTeacher.get(`/api/exams/${examId}?school_id=${schoolId}`)).status()).toBe(403)
    expect((await unrelatedTeacher.get(`/api/exams/${examId}/marks?school_id=${schoolId}`)).status()).toBe(403)
  })

  test('rejects out-of-scope students and rolls back a failed submit', async () => {
    const outside = await teacher.post(`/api/exams/${examId}/marks`, { data: {
      school_id: schoolId,
      entries: [{ exam_subject_id: subjectId, student_id: untargetedStudent, marks_obtained: 90, is_absent: false }],
    } })
    expect(outside.status()).toBe(400)
    expect(Number((await pool.query(`SELECT COUNT(*) AS count FROM exam_marks WHERE exam_id = $1`, [examId])).rows[0].count)).toBe(0)

    const incomplete = await teacher.post(`/api/exams/${examId}/marks`, { data: {
      school_id: schoolId,
      entries: [{ exam_subject_id: subjectId, student_id: student1, marks_obtained: 38, is_absent: false }],
      submit_subject_ids: [subjectId],
    } })
    expect(incomplete.status()).toBe(400)
    expect(Number((await pool.query(`SELECT COUNT(*) AS count FROM exam_marks WHERE exam_id = $1`, [examId])).rows[0].count)).toBe(0)
  })

  test('completes targeted release with consistent subject pass rules', async () => {
    const submitted = await teacher.post(`/api/exams/${examId}/marks`, { data: {
      school_id: schoolId,
      entries: [
        { exam_subject_id: subjectId, student_id: student1, marks_obtained: 38, is_absent: false },
        { exam_subject_id: subjectId, student_id: student2, marks_obtained: 75, is_absent: false },
      ],
      submit_subject_ids: [subjectId],
    } })
    expect(submitted.status()).toBe(200)
    expect((await teacher.post(`/api/exams/${examId}/review`, { data: { school_id: schoolId } })).status()).toBe(200)
    expect((await admin.post(`/api/exams/${examId}/release`, { data: { school_id: schoolId } })).status()).toBe(200)

    const own = await student.get(`/api/students/${student1}/exams?school_id=${schoolId}&class_id=${classId}`)
    expect(own.status()).toBe(200)
    const ownResults = await own.json()
    expect(ownResults[0].subjects[0]).toMatchObject({ marks_obtained: 38, pass: false })

    const untargeted = await admin.get(`/api/students/${untargetedStudent}/exams?school_id=${schoolId}&class_id=${classId}`)
    expect(await untargeted.json()).toEqual([])
    expect((await parent.post(`/api/exams/${examId}/acknowledge`, { data: { school_id: schoolId, student_id: untargetedStudent } })).status()).toBe(403)
  })

  test('parent-only summary rejects a student session', async () => {
    expect((await student.get(`/api/parent/child-summary?school_id=${schoolId}&student_id=${student1}&class_id=${classId}`)).status()).toBe(403)
  })
})
