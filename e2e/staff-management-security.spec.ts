import 'dotenv/config'
import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import ExcelJS from 'exceljs'
import pool, { ensureDB } from '../lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production'

test.describe.serial('Staff Management security and integrity regression', () => {
  let schoolId = 0
  let otherSchoolId = 0
  let adminCookie = ''
  let adminRequest: APIRequestContext
  const suffix = `${Date.now()}-${randomUUID().slice(0, 6)}`
  const masterSubject = `Master Staff ${suffix}`
  const ownCustomSubject = `Own Custom ${suffix}`
  const otherCustomSubject = `Other School Secret ${suffix}`

  test.beforeAll(async () => {
    await ensureDB()
    const school = await pool.query<{ id: number }>(
      `INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`, [`Staff Security ${suffix}`],
    )
    schoolId = school.rows[0].id
    const otherSchool = await pool.query<{ id: number }>(
      `INSERT INTO schools (name, status) VALUES ($1, 'active') RETURNING id`, [`Other Staff School ${suffix}`],
    )
    otherSchoolId = otherSchool.rows[0].id
    await pool.query(
      `INSERT INTO master_subjects (board, grade, subject_name) VALUES ($1, '1', $2)`,
      [`TEST-${suffix}`, masterSubject],
    )
    await pool.query(
      `INSERT INTO school_subjects (school_id, subject_name, grade, academic_year) VALUES ($1,$2,'1','2026-27'),($3,$4,'1','2026-27')`,
      [schoolId, ownCustomSubject, otherSchoolId, otherCustomSubject],
    )
    await pool.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`, [schoolId])
    await pool.query(`INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES ($1, 'staff', TRUE)`, [schoolId])
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed, status)
       VALUES ($1,$2,'unused','school_admin',$3,FALSE,TRUE,'active') RETURNING id`,
      [`staff-sec-${suffix}@test.invalid`, `STAFF-${suffix}`, schoolId],
    )
    const sid = randomUUID()
    await pool.query(`INSERT INTO user_sessions (id,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 hour')`, [sid, user.rows[0].id])
    adminCookie = `wlyl-auth=${jwt.sign({ userId: user.rows[0].id, role: 'school_admin', schoolId, schoolCode: `STAFF-${suffix}`, firstLogin: false, profileCompleted: true, sid }, JWT_SECRET, { expiresIn: '1h' })}`
    adminRequest = await playwrightRequest.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000', extraHTTPHeaders: { Cookie: adminCookie } })
  })

  test.afterAll(async () => {
    await adminRequest?.dispose()
    if (schoolId) await pool.query('DELETE FROM schools WHERE id=$1', [schoolId])
    if (otherSchoolId) await pool.query('DELETE FROM schools WHERE id=$1', [otherSchoolId])
    await pool.query('DELETE FROM master_subjects WHERE board=$1', [`TEST-${suffix}`])
  })

  test('subject catalog includes all master and only this school custom subjects', async () => {
    const response = await adminRequest.get(`/api/teachers/subject-options?school_id=${schoolId}`)
    expect(response.status()).toBe(200)
    const options = (await response.json()).subjects as { name: string; source: string }[]
    expect(options).toContainEqual({ name: masterSubject, source: 'master' })
    expect(options).toContainEqual({ name: ownCustomSubject, source: 'custom' })
    expect(options.some(option => option.name === otherCustomSubject)).toBe(false)
    expect((await adminRequest.get(`/api/teachers/subject-options?school_id=${otherSchoolId}`)).status()).toBe(403)
  })

  test('mixed-validity batch is rejected atomically', async () => {
    const res = await adminRequest.post('/api/teachers/bulk', { data: {
      school_id: schoolId,
      teachers: [
        { name: 'Atomic Valid', email: `valid-${suffix}@test.invalid`, phone: '9876500101', subject: 'Mathematics', staff_type: 'teaching' },
        { name: 'Atomic Invalid', email: 'broken', phone: '9876500102', subject: 'Science', staff_type: 'teaching' },
      ],
    } })
    expect(res.status()).toBe(422)
    expect((await res.json()).inserted).toBe(0)
    const count = await pool.query(`SELECT COUNT(*)::int AS count FROM teachers WHERE school_id=$1 AND name LIKE 'Atomic %'`, [schoolId])
    expect(count.rows[0].count).toBe(0)
  })

  test('Excel-only template retains dropdowns and round-trips through the importer', async () => {
    const template = await adminRequest.get(`/api/teachers/template?school_id=${schoolId}`)
    expect(template.status()).toBe(200)
    expect(template.headers()['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const buffer = await template.body()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.getWorksheet('Staff')!
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining(['Name *', 'Email *', 'Subject *', 'Phone *']))
    expect(sheet.getCell('C2').dataValidation.type).toBe('list')
    expect(sheet.getCell('H2').dataValidation.formulae).toEqual(['"teaching,non_teaching"'])
    expect(workbook.getWorksheet('_subjects')?.state).toBe('veryHidden')
    expect(workbook.getWorksheet('_grades')?.state).toBe('veryHidden')
    const subjectValues = workbook.getWorksheet('_subjects')!.getColumn(1).values
    expect(subjectValues).toContain(masterSubject)
    expect(subjectValues).toContain(ownCustomSubject)
    expect(subjectValues).not.toContain(otherCustomSubject)

    const parsed = await adminRequest.post('/api/teachers/parse-import', {
      multipart: { file: { name: 'staff_template.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer } },
    })
    expect(parsed.status()).toBe(200)
    const body = await parsed.json()
    expect(body.rows).toHaveLength(2)
    expect(body.rows[0]).toMatchObject({ name: 'Priya Sharma', phone: '9876543210', staff_type: 'teaching' })
    expect(body.rows[1]).toMatchObject({ name: 'Suresh Patel', phone: '9876543212', staff_type: 'non_teaching' })
  })

  test('bulk API canonicalizes allowed subjects and rejects arbitrary or cross-school custom values', async () => {
    const accepted = await adminRequest.post('/api/teachers/bulk', { data: {
      school_id: schoolId,
      teachers: [
        { name: 'Master Catalog Teacher', email: `master-${suffix}@test.invalid`, phone: '9876500106', subject: masterSubject.toLowerCase(), staff_type: 'teaching' },
        { name: 'Custom Catalog Teacher', email: `custom-${suffix}@test.invalid`, phone: '9876500107', subject: ownCustomSubject.toLowerCase(), staff_type: 'teaching' },
      ],
    } })
    expect(accepted.status()).toBe(201)
    expect((await accepted.json()).teachers.map((teacher: { subject: string }) => teacher.subject)).toEqual([masterSubject, ownCustomSubject])

    for (const [subject, phone] of [[otherCustomSubject, '9876500108'], [`Arbitrary ${suffix}`, '9876500109']]) {
      const rejected = await adminRequest.post('/api/teachers/bulk', { data: {
        school_id: schoolId,
        teachers: [{ name: 'Rejected Subject Teacher', email: `${phone}-${suffix}@test.invalid`, phone, subject, staff_type: 'teaching' }],
      } })
      expect(rejected.status()).toBe(422)
      expect((await rejected.json()).inserted).toBe(0)
    }
  })

  test('bulk API rejects more than 500 rows before doing work', async () => {
    const teachers = Array.from({ length: 501 }, (_, index) => ({
      name: `Limit Teacher ${index}`,
      email: `limit-${index}-${suffix}@test.invalid`,
      phone: `8${String(index).padStart(9, '0')}`,
      subject: 'Mathematics',
      staff_type: 'teaching',
    }))
    const response = await adminRequest.post('/api/teachers/bulk', { data: { school_id: schoolId, teachers } })
    expect(response.status()).toBe(413)
    const count = await pool.query(`SELECT COUNT(*)::int AS count FROM teachers WHERE school_id=$1 AND name LIKE 'Limit Teacher %'`, [schoolId])
    expect(count.rows[0].count).toBe(0)
  })

  test('invalid direct updates cannot corrupt status, type or contact fields', async () => {
    const create = await adminRequest.post('/api/teachers/bulk', { data: {
      school_id: schoolId,
      teachers: [{ name: 'Integrity Teacher', email: `integrity-${suffix}@test.invalid`, phone: '9876500103', subject: 'Mathematics', staff_type: 'teaching' }],
    } })
    expect(create.status()).toBe(201)
    const teacher = (await create.json()).teachers[0]
    const update = await adminRequest.put(`/api/teachers/${teacher.id}`, { data: { status: 'superuser', staff_type: 'root', email: 'broken', phone: 'x' } })
    expect(update.status()).toBe(422)
    const crossTenantSubject = await adminRequest.put(`/api/teachers/${teacher.id}`, { data: { subject: otherCustomSubject } })
    expect(crossTenantSubject.status()).toBe(422)
    const saved = await pool.query(`SELECT status,staff_type,email,phone FROM teachers WHERE id=$1`, [teacher.id])
    expect(saved.rows[0]).toMatchObject({ status: 'active', staff_type: 'teaching', email: `integrity-${suffix}@test.invalid`, phone: '9876500103' })
  })

  test('deactivation and reactivation never resurrect an old teacher session', async () => {
    const create = await adminRequest.post('/api/teachers/bulk', { data: {
      school_id: schoolId,
      teachers: [{ name: 'Session Teacher', email: `session-${suffix}@test.invalid`, phone: '9876500104', subject: 'Mathematics', staff_type: 'teaching' }],
    } })
    const created = await create.json()
    const teacher = created.teachers[0]
    const credential = created.credentials[0]
    const teacherRequest = await playwrightRequest.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000' })
    expect((await teacherRequest.post('/api/teacher/auth/login', { data: { email: credential.email, password: credential.temp_password } })).status()).toBe(200)
    expect((await teacherRequest.post('/api/teacher/auth/change-password', { data: { newPassword: 'StaffSecurity@1234' } })).status()).toBe(200)
    expect((await teacherRequest.get('/api/teacher/auth/me')).status()).toBe(200)
    expect((await adminRequest.put(`/api/teachers/${teacher.id}`, { data: { status: 'inactive' } })).status()).toBe(200)
    expect((await teacherRequest.get('/api/teacher/auth/me')).status()).toBe(401)
    const reactivate = await adminRequest.put(`/api/teachers/${teacher.id}`, { data: { status: 'active' } })
    expect(reactivate.status()).toBe(200)
    expect((await teacherRequest.get('/api/teacher/auth/me')).status()).toBe(401)
    const fresh = (await reactivate.json()).temporary_credential
    const newSession = await playwrightRequest.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000' })
    expect((await newSession.post('/api/teacher/auth/login', { data: { email: fresh.email, password: fresh.temp_password } })).status()).toBe(200)
    await newSession.dispose(); await teacherRequest.dispose()
  })

  test('simultaneous duplicate submissions create exactly one teacher', async () => {
    const data = { school_id: schoolId, teachers: [{ name: 'Race Teacher', email: `race-${suffix}@test.invalid`, phone: '9876500105', subject: 'Mathematics', staff_type: 'teaching' }] }
    const responses = await Promise.all([adminRequest.post('/api/teachers/bulk', { data }), adminRequest.post('/api/teachers/bulk', { data })])
    expect(responses.map(response => response.status()).sort()).toEqual([201, 409])
    const count = await pool.query(`SELECT COUNT(*)::int AS count FROM teachers WHERE school_id=$1 AND LOWER(email)=LOWER($2)`, [schoolId, `race-${suffix}@test.invalid`])
    expect(count.rows[0].count).toBe(1)
  })
})
