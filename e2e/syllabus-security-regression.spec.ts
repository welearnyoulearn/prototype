import 'dotenv/config'
import { test, expect } from '@playwright/test'
import bcrypt from 'bcryptjs'
import pool, { ensureDB } from '../lib/db'
import { BASE } from './fixtures/platform-admin'

test.describe.serial('Syllabus record-level authorization and integrity', () => {
  test.setTimeout(120000)
  let schoolId = 0
  let otherSchoolId = 0
  let classA = 0
  let classB = 0
  let teacherId = 0
  let studentId = 0
  let parentId = 0
  let topicId = 0
  let otherTopicId = 0
  let studentRoll = ''
  let teacherCookie = ''
  let studentCookie = ''
  let parentCookie = ''
  const year = '2099-00'
  const password = 'Syllabus!Test123'

  async function login(path: string, body: object, cookieName: string) {
    const response = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const cookie = response.headers.getSetCookie().find(value => value.startsWith(`${cookieName}=`))
    if (!cookie) throw new Error(`Login failed at ${path}: ${response.status} ${await response.text()}`)
    return cookie.split(';')[0]
  }

  test.beforeAll(async () => {
    test.setTimeout(120000)
    await ensureDB()
    const marker = `syllabus-security-${Date.now()}`
    schoolId = (await pool.query(`INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`, [marker])).rows[0].id
    otherSchoolId = (await pool.query(`INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`, [`${marker}-other`])).rows[0].id
    await pool.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium'), ($2, 'premium')`, [schoolId, otherSchoolId])
    const passwordHash = await bcrypt.hash(password, 12)
    classA = (await pool.query(`INSERT INTO classes (school_id, grade, section) VALUES ($1, '10', 'A') RETURNING id`, [schoolId])).rows[0].id
    classB = (await pool.query(`INSERT INTO classes (school_id, grade, section) VALUES ($1, '10', 'B') RETURNING id`, [schoolId])).rows[0].id
    teacherId = (await pool.query(
      `INSERT INTO teachers (school_id, name, email, subject, phone, employee_id, status, password_changed, password_hash)
       VALUES ($1, 'Assigned Teacher', $2, 'Mathematics', '9000000001', $3, 'active', TRUE, $4) RETURNING id`,
      [schoolId, `${marker}@test.invalid`, `EMP-${Date.now()}`, passwordHash],
    )).rows[0].id
    const otherTeacher = (await pool.query(
      `INSERT INTO teachers (school_id, name, email, subject, phone, employee_id, status, password_changed, password_hash)
       VALUES ($1, 'Science Teacher', $2, 'Science', '9000000002', $3, 'active', TRUE, $4) RETURNING id`,
      [schoolId, `${marker}-science@test.invalid`, `EMP-S-${Date.now()}`, passwordHash],
    )).rows[0].id
    await pool.query(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Mathematics', $2), ($1, 'Science', $3)`, [classA, teacherId, otherTeacher])

    studentRoll = `ROLL-${Date.now()}`
    studentId = (await pool.query(
      `INSERT INTO students (school_id, name, grade, section, roll_number, status, password_changed, password_hash)
       VALUES ($1, 'Student A', '10', 'A', $2, 'active', TRUE, $3) RETURNING id`,
      [schoolId, studentRoll, passwordHash],
    )).rows[0].id
    const parentPhone = `91${Date.now().toString().slice(-8)}`
    parentId = (await pool.query(`INSERT INTO parents (school_id, name, phone, password_changed, password_hash) VALUES ($1, 'Parent A', $2, TRUE, $3) RETURNING id`, [schoolId, parentPhone, passwordHash])).rows[0].id
    await pool.query(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [studentId, parentId])

    const mathSubject = (await pool.query(
      `INSERT INTO school_subjects (school_id, subject_name, grade, academic_year) VALUES ($1, 'Mathematics', '10', $2) RETURNING id`,
      [schoolId, year],
    )).rows[0].id
    await pool.query(`INSERT INTO school_subjects (school_id, subject_name, grade, academic_year) VALUES ($1, 'Science', '10', $2)`, [schoolId, year])
    const chapterId = (await pool.query(
      `INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, book_type, audience) VALUES ($1, 'Numbers', 0, 'textbook', 'student') RETURNING id`,
      [mathSubject],
    )).rows[0].id
    topicId = (await pool.query(`INSERT INTO school_topics (school_chapter_id, topic_name, topic_order) VALUES ($1, 'Integers', 0) RETURNING id`, [chapterId])).rows[0].id

    const otherSubject = (await pool.query(
      `INSERT INTO school_subjects (school_id, subject_name, grade, academic_year) VALUES ($1, 'Mathematics', '10', $2) RETURNING id`,
      [otherSchoolId, year],
    )).rows[0].id
    const otherChapter = (await pool.query(`INSERT INTO school_chapters (school_subject_id, chapter_name) VALUES ($1, 'Private') RETURNING id`, [otherSubject])).rows[0].id
    otherTopicId = (await pool.query(`INSERT INTO school_topics (school_chapter_id, topic_name) VALUES ($1, 'Private topic') RETURNING id`, [otherChapter])).rows[0].id

    teacherCookie = await login('/api/teacher/auth/login', { email: `${marker}@test.invalid`, password }, 'wlyl-teacher')
    studentCookie = await login('/api/student/auth/login', { rollNumber: studentRoll, password }, 'wlyl-student')
    parentCookie = await login('/api/parent/auth/login', { identifier: parentPhone, password }, 'wlyl-parent')
  })

  test.afterAll(async () => {
    if (schoolId) await pool.query(`DELETE FROM schools WHERE id = $1`, [schoolId])
    if (otherSchoolId) await pool.query(`DELETE FROM schools WHERE id = $1`, [otherSchoolId])
    await pool.end()
  })

  async function api(path: string, cookie: string, method = 'GET', body?: object) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, data: await response.json() }
  }

  test('teacher sees only assigned subjects and cannot use another class', async () => {
    const own = await api(`/api/syllabus?school_id=${schoolId}&class_id=${classA}&academic_year=${year}`, teacherCookie)
    expect(own.status).toBe(200)
    expect(own.data.subjects.map((s: { subject: string }) => s.subject)).toEqual(['Mathematics'])
    expect((await api(`/api/syllabus?school_id=${schoolId}&class_id=${classB}&academic_year=${year}`, teacherCookie)).status).toBe(403)
  })

  test('students and parents can read only their linked class', async () => {
    expect((await api(`/api/syllabus?school_id=${schoolId}&class_id=${classA}&academic_year=${year}`, studentCookie)).status).toBe(200)
    expect((await api(`/api/syllabus?school_id=${schoolId}&class_id=${classB}&academic_year=${year}`, studentCookie)).status).toBe(403)
    expect((await api(`/api/syllabus?school_id=${schoolId}&class_id=${classA}&academic_year=${year}`, parentCookie)).status).toBe(200)
    expect((await api(`/api/syllabus?school_id=${schoolId}&class_id=${classB}&academic_year=${year}`, parentCookie)).status).toBe(403)
  })

  test('topic mutation is bound to topic tenant, class, subject and valid status', async () => {
    expect((await api(`/api/syllabus/${topicId}`, teacherCookie, 'PATCH', { school_id: schoolId, class_id: classB, status: 'covered' })).status).toBe(403)
    expect((await api(`/api/syllabus/${otherTopicId}`, teacherCookie, 'PATCH', { school_id: schoolId, class_id: classA, status: 'covered' })).status).toBe(403)
    expect((await api(`/api/syllabus/${topicId}`, teacherCookie, 'PATCH', { school_id: schoolId, class_id: classA, status: 'invalid' })).status).toBe(400)
    expect((await api(`/api/syllabus/${topicId}`, teacherCookie, 'PATCH', { school_id: schoolId, class_id: classA, status: 'covered', covered_by: 999999 })).status).toBe(200)
    const progress = await pool.query(`SELECT status, covered_by FROM school_topic_progress WHERE class_id = $1 AND school_topic_id = $2`, [classA, topicId])
    expect(progress.rows[0]).toMatchObject({ status: 'covered', covered_by: teacherId })
  })

  test('re-import merges topics without deleting progress-bearing topic IDs', async () => {
    const imported = await api(`/api/school/syllabus/bulk-import?academic_year=${year}`, teacherCookie, 'POST', {
      school_id: schoolId,
      class_id: classA,
      subject: 'Mathematics',
      json: JSON.stringify([{ title: 'Numbers', topics: [{ title: 'Integers', subtopics: ['Signed values'] }, { title: 'Fractions' }] }]),
    })
    expect(imported.status).toBe(200)
    expect(imported.data.existing_topics_preserved).toBe(true)
    const progress = await pool.query(`SELECT status FROM school_topic_progress WHERE class_id = $1 AND school_topic_id = $2`, [classA, topicId])
    expect(progress.rows[0]?.status).toBe('covered')
  })

  test('student cannot read the administrative master catalog', async () => {
    expect((await api('/api/platform/subjects', studentCookie)).status).toBe(403)
  })
})
