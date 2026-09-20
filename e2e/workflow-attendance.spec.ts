/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, request as pwRequest, APIRequestContext, Browser, BrowserContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'
import { addDays, todayIST, weekdayOf } from '../lib/attendanceRules'

// Student attendance, end to end — every portal, real server, real database.
//
// Seeds one school (classes 10-A, 9-B, 8-C; two teachers; students + parents + logins) and a second
// school for cross-tenant checks, then walks the whole feature:
//   permissions → session locking (incl. a simultaneous-submit race) → corrections → mistake reports
//   → Academic Calendar (holidays block marking, are excluded from numbers, visible to everyone)
//   → the SAME numbers in admin, teacher, parent and student → exports → real-browser checks.
// Everything it creates is deleted at the end (both schools cascade).

type Res = { status: number; body: any }

const OWNER_PASS = 'OwnerPass@123'
const TEACHER_PASS = 'TeacherPass@123'
const STUDENT_PASS = 'StudentPass@123'
const PARENT_PASS = 'ParentPass@123'

async function newCtx(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE })
}

async function call(ctx: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, data?: unknown): Promise<Res> {
  const res = await ctx[method](url, data === undefined ? {} : { data })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* not JSON (e.g. CSV) */ }
  return { status: res.status(), body }
}

const allPresent = (ids: number[], overrides: Record<number, 'absent' | 'late' | 'present'> = {}) =>
  ids.map(id => ({ student_id: id, status: overrides[id] ?? 'present' }))

test.describe.serial('Student attendance — all portals, end to end', () => {
  const ts = Date.now()
  const today = todayIST()
  const yesterday = addDays(today, -1)
  const phone = (n: number) => `9${String(ts + n).slice(-9)}`

  let platformCookie: string
  let schoolId = 0, schoolBId = 0
  let classA = 0, classB = 0, classC = 0
  let teacherAName = '', teacherBName = ''
  let owner: APIRequestContext, ownerB: APIRequestContext
  let teacherA: APIRequestContext, teacherB: APIRequestContext
  let student: APIRequestContext, parent: APIRequestContext, parentOther: APIRequestContext
  const anon: { ctx: APIRequestContext | null } = { ctx: null }
  const ids: Record<string, number> = {}        // student name → id
  const A_IDS = () => [ids.Asha, ids.Bala, ids.Chitra]
  let ownerName = ''
  let attendanceFeatureOn = false

  test.beforeAll(async () => {
    test.setTimeout(300000)
    platformCookie = await platformAdminCookie()

    // ── School A ───────────────────────────────────────────────────────────
    const school = await createSchool(platformCookie, { name: `Attendance E2E ${ts}`, email: `att${ts}@e2etest.com`, phone: `98${String(ts).slice(-8)}` })
    schoolId = school.id
    await setSubscription(platformCookie, schoolId, 'premium')

    // Parent and student portals only show Attendance when the school's plan includes the feature.
    // A brand-new database has no plan features configured; on such a throwaway database set
    // E2E_ENABLE_PLAN_FEATURES=1 and this turns it on. It is never changed otherwise, because it is a
    // platform-wide setting.
    const platform = await newCtx()
    const tier = await call(platform, 'get', '/api/platform/features?tier=premium')
    attendanceFeatureOn = Array.isArray(tier.body?.enabled) && tier.body.enabled.includes('attendance') && tier.body.enabled.includes('calendar')
    if (!attendanceFeatureOn && process.env.E2E_ENABLE_PLAN_FEATURES === '1') {
      const on = await platform.post('/api/platform/features', {
        headers: { Cookie: platformCookie }, data: { assignments: [
          { feature_key: 'attendance', tier: 'premium', enabled: true },
          { feature_key: 'calendar', tier: 'premium', enabled: true },
        ] },
      })
      expect(on.status()).toBe(200)
      attendanceFeatureOn = true
    }
    await platform.dispose()

    owner = await newCtx()
    expect((await call(owner, 'post', '/api/auth/login', { email: school.email, password: school.temp_password })).status).toBe(200)
    expect((await call(owner, 'post', '/api/auth/change-password', { newPassword: OWNER_PASS })).status).toBe(200)
    ownerName = `School Owner ${ts}`
    expect((await call(owner, 'put', '/api/auth/profile', { full_name: ownerName, phone: '9000000031' })).status).toBe(200)
    // Start from "every weekday is a working day" so the run behaves the same on any weekday.
    expect((await call(owner, 'put', '/api/school-calendar/settings', { weekly_off_days: [] })).status).toBe(200)

    const mkClass = async (grade: string, section: string) => {
      const r = await call(owner, 'post', '/api/classes', { school_id: schoolId, grade, section })
      expect([200, 201]).toContain(r.status)
      return r.body.id as number
    }
    classA = await mkClass('10', 'A'); classB = await mkClass('9', 'B'); classC = await mkClass('8', 'C')

    // ── Teachers (two different people) ────────────────────────────────────
    const tEmail = (n: string) => `${n}${ts}@e2etest.com`
    const bulk = await call(owner, 'post', '/api/teachers/bulk', {
      school_id: schoolId,
      teachers: [
        { name: 'Ms Rao', email: tEmail('rao'), phone: phone(11), subject: 'Mathematics', staff_type: 'teaching' },
        { name: 'Mr Khan', email: tEmail('khan'), phone: phone(12), subject: 'Mathematics', staff_type: 'teaching' },
      ],
    })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(201)
    expect(bulk.body.teachers, JSON.stringify(bulk.body)).toHaveLength(2)
    const tList = bulk.body.teachers as { id: number; name: string }[]
    teacherAName = tList[0].name; teacherBName = tList[1].name
    const teacherLogin = async (t: { id: number }, email: string) => {
      const reset = await call(owner, 'post', `/api/teachers/${t.id}/reset-credentials`)
      expect(reset.status).toBe(200)
      const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/teacher/auth/login', { email, password: reset.body.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/teacher/auth/change-password', { currentPassword: reset.body.temp_password, newPassword: TEACHER_PASS })).status).toBe(200)
      return ctx
    }
    teacherA = await teacherLogin(tList[0], tEmail('rao'))
    teacherB = await teacherLogin(tList[1], tEmail('khan'))

    // ── Students + parents ────────────────────────────────────────────────
    const stu = (name: string, grade: string, section: string, roll: number, n: number) => ({
      name, grade, section, school_roll_number: roll,
      parent_name: `Parent of ${name}`, parent_phone: phone(n), parent_email: `p${n}${ts}@e2etest.com`,
    })
    const sb = await call(owner, 'post', '/api/students/bulk', {
      school_id: schoolId,
      students: [
        stu('Asha Rao', '10', 'A', 1, 1), stu('Bala Krishna', '10', 'A', 2, 2), stu('Chitra Devi', '10', 'A', 3, 3),
        stu('Esha Reddy', '9', 'B', 1, 4), stu('Dev Anand', '8', 'C', 1, 5),
      ],
    })
    expect(sb.status).toBe(201)
    expect(sb.body.inserted, JSON.stringify(sb.body)).toBe(5)
    const list = await call(owner, 'get', `/api/students?school_id=${schoolId}`)
    for (const s of list.body as { id: number; name: string }[]) ids[s.name.split(' ')[0]] = s.id

    const sCred = (sb.body.credentials.students as { name: string; login: string; temp_password: string }[]).find(c => c.name.startsWith('Asha'))!
    const pCredFor = (n: number) => (sb.body.credentials.parents as { login: string; temp_password: string }[]).find(c => c.login === `p${n}${ts}@e2etest.com`)!
    expect(sCred, 'student credentials should be issued (student-portal enabled)').toBeTruthy()

    student = await newCtx()
    expect((await call(student, 'post', '/api/student/auth/login', { rollNumber: sCred.login, password: sCred.temp_password })).status).toBe(200)
    expect((await call(student, 'post', '/api/student/auth/change-password', { currentPassword: sCred.temp_password, newPassword: STUDENT_PASS })).status).toBe(200)

    const parentLogin = async (n: number) => {
      const c = pCredFor(n)
      expect(c, `parent ${n} credentials`).toBeTruthy()
      const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/parent/auth/login', { identifier: c.login, password: c.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/parent/auth/change-password', { currentPassword: c.temp_password, newPassword: PARENT_PASS })).status).toBe(200)
      return ctx
    }
    parent = await parentLogin(1)         // Asha's parent
    parentOther = await parentLogin(4)    // Esha's parent (a different family)

    // ── School B (cross-tenant checks) ────────────────────────────────────
    const schoolB = await createSchool(platformCookie, { name: `Attendance E2E B ${ts}`, email: `attb${ts}@e2etest.com`, phone: `97${String(ts).slice(-8)}` })
    schoolBId = schoolB.id
    ownerB = await newCtx()
    expect((await call(ownerB, 'post', '/api/auth/login', { email: schoolB.email, password: schoolB.temp_password })).status).toBe(200)
    expect((await call(ownerB, 'post', '/api/auth/change-password', { newPassword: OWNER_PASS })).status).toBe(200)

    anon.ctx = await newCtx()
  })

  test.afterAll(async () => {
    test.setTimeout(120000)
    const c = await newCtx()
    for (const id of [schoolId, schoolBId]) if (id) await c.delete(`/api/schools/${id}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await c.dispose()
    for (const x of [owner, ownerB, teacherA, teacherB, student, parent, parentOther, anon.ctx]) await x?.dispose()
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Who can do what
  // ═════════════════════════════════════════════════════════════════════════
  test('1. Nobody signed out can read or write attendance or the calendar', async () => {
    const a = anon.ctx!
    expect((await call(a, 'get', `/api/attendance?view=sheet&class_id=${classA}&date=${today}&session=morning`)).status).toBe(401)
    expect((await call(a, 'post', '/api/attendance', { class_id: classA, date: today, session: 'morning', records: [] })).status).toBe(401)
    expect((await call(a, 'get', '/api/school-calendar')).status).toBe(401)
    expect((await call(a, 'post', '/api/school-calendar', { title: 'x', event_type: 'holiday', event_date: today })).status).toBe(403)
    expect((await call(a, 'delete', '/api/school-calendar/1')).status).toBe(403)
    expect((await call(a, 'get', `/api/admin/briefing?school_id=${schoolId}`)).status).toBe(401)
    expect((await call(a, 'get', `/api/export/attendance?mode=absentees&date=${today}`)).status).toBe(401)
  })

  test('2. Students and parents cannot read class attendance or write any attendance', async () => {
    for (const who of [student, parent]) {
      expect((await call(who, 'get', `/api/attendance?view=school&date=${today}`)).status).toBe(401)
      expect((await call(who, 'get', `/api/attendance?class_id=${classA}&month=${today.slice(0, 7)}`)).status).toBe(401)
      expect((await call(who, 'get', `/api/attendance/overview?date=${today}`)).status).toBe(401)
      expect((await call(who, 'post', '/api/attendance', {
        class_id: classA, date: today, session: 'morning', records: allPresent(A_IDS()),
      })).status).toBe(401)
      expect((await call(who, 'get', `/api/attendance/analytics?days=30`)).status).toBe(401)
    }
  })

  test('3. Cross-school access is refused; bad input is rejected (no SQL injection)', async () => {
    expect((await call(teacherA, 'get', `/api/attendance?view=school&date=${today}&school_id=${schoolBId}`)).status).toBe(403)
    expect((await call(ownerB, 'get', `/api/attendance?view=sheet&class_id=${classA}&date=${today}&session=morning`)).status).toBe(404)
    expect((await call(ownerB, 'get', `/api/export/attendance?class_id=${classA}&from=${today}&to=${today}`)).status).toBe(404)
    expect((await call(teacherA, 'get', `/api/attendance?class_id=${classA}&previous=true&session=${encodeURIComponent("morning' OR '1'='1")}`)).status).toBe(400)
    expect((await call(teacherA, 'get', `/api/attendance?class_id=${classA}&date=2026-13-45`)).status).toBe(400)
    expect((await call(teacherA, 'get', `/api/attendance?class_id=${classA};DROP&date=${today}`)).status).toBe(400)
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Marking + session locking
  // ═════════════════════════════════════════════════════════════════════════
  test('4. Every class starts "not marked"; any teacher sees every class', async () => {
    const ov = await call(teacherB, 'get', `/api/attendance/overview?date=${today}`)
    expect(ov.status).toBe(200)
    expect(ov.body.nonWorking).toBeNull()
    expect(ov.body.classes.map((c: any) => c.id).sort()).toEqual([classA, classB, classC].sort())
    for (const c of ov.body.classes) { expect(c.morning.marked).toBe(false); expect(c.afternoon.marked).toBe(false) }
    expect(ov.body.canMark).toBe(true)
  })

  test('5. Teacher A marks 10-A Morning → session is locked and stamped with their name', async () => {
    const r = await call(teacherA, 'post', '/api/attendance', {
      class_id: classA, date: today, session: 'morning', school_id: schoolId, teacher_id: 999999,   // ignored: identity comes from the login
      records: allPresent(A_IDS(), { [ids.Asha]: 'absent', [ids.Bala]: 'late' }),
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.lock.markedBy).toBe(teacherAName)

    const sheet = await call(teacherA, 'get', `/api/attendance?view=sheet&class_id=${classA}&date=${today}&session=morning`)
    expect(sheet.body.lock).toMatchObject({ markedBy: teacherAName, byMe: true })
    expect(sheet.body.canEdit).toBe(true)
    expect(sheet.body.counts).toEqual({ present: 1, late: 1, absent: 1 })
  })

  test('6. Teacher B is told "already marked by Ms Rao" and can NOT overwrite it', async () => {
    const before = await call(teacherB, 'get', `/api/attendance?view=sheet&class_id=${classA}&date=${today}&session=morning`)
    expect(before.body.canMark).toBe(false)
    expect(before.body.canEdit).toBe(false)
    expect(before.body.lock).toMatchObject({ markedBy: teacherAName, byMe: false })

    const attempt = await call(teacherB, 'post', '/api/attendance', { class_id: classA, date: today, session: 'morning', records: allPresent(A_IDS()) })
    expect(attempt.status).toBe(409)
    expect(attempt.body.code).toBe('ALREADY_MARKED')
    expect(attempt.body.markedBy).toBe(teacherAName)
    expect(attempt.body.error).toContain(teacherAName)

    const put = await call(teacherB, 'put', '/api/attendance', { class_id: classA, date: today, session: 'morning', records: allPresent(A_IDS()) })
    expect(put.status).toBe(403)
    expect(put.body.code).toBe('LOCKED')

    // …and the records are untouched.
    const after = await call(teacherB, 'get', `/api/attendance?view=sheet&class_id=${classA}&date=${today}&session=morning`)
    expect(after.body.counts).toEqual({ present: 1, late: 1, absent: 1 })
    expect(after.body.students.find((s: any) => s.id === ids.Asha).status).toBe('absent')
  })

  test('7. Morning and Afternoon lock independently — Teacher B marks 10-A Afternoon', async () => {
    const r = await call(teacherB, 'post', '/api/attendance', {
      class_id: classA, date: today, session: 'afternoon', records: allPresent(A_IDS(), { [ids.Chitra]: 'absent' }),
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const ov = await call(teacherA, 'get', `/api/attendance/overview?date=${today}`)
    const c = ov.body.classes.find((x: any) => x.id === classA)
    expect(c.morning).toMatchObject({ marked: true, markedBy: teacherAName, byMe: true, absent: 1, late: 1, present: 1 })
    expect(c.afternoon).toMatchObject({ marked: true, markedBy: teacherBName, byMe: false, absent: 1, present: 2 })
    expect(ov.body.totals.notMarkedMorning.map((x: any) => x.id).sort()).toEqual([classB, classC].sort())
  })

  test('8. Two teachers submit the same session at the same moment → exactly one wins', async () => {
    const records = allPresent([ids.Esha])
    const [ra, rb] = await Promise.all([
      call(teacherA, 'post', '/api/attendance', { class_id: classB, date: today, session: 'morning', records }),
      call(teacherB, 'post', '/api/attendance', { class_id: classB, date: today, session: 'morning', records }),
    ])
    expect([ra.status, rb.status].sort()).toEqual([201, 409])
    const loser = ra.status === 409 ? ra : rb
    expect(loser.body.code).toBe('ALREADY_MARKED')
    const winnerName = ra.status === 201 ? teacherAName : teacherBName
    expect(loser.body.markedBy).toBe(winnerName)
    const { rows } = { rows: (await call(owner, 'get', `/api/attendance?class_id=${classB}&date=${today}&session=morning`)).body as any[] }
    expect(rows).toHaveLength(1)          // one set of records, not two
  })

  test('9. Only the exact class roster is accepted; dates are policed', async () => {
    const bad = async (body: object, code: string, status: number) => {
      const r = await call(teacherA, 'post', '/api/attendance', { class_id: classC, date: today, session: 'morning', ...body })
      expect(r.status, JSON.stringify(r.body)).toBe(status)
      if (code) expect(r.body.code).toBe(code)
    }
    await bad({ records: [] }, '', 400)                                                              // empty
    await bad({ records: [{ student_id: ids.Dev, status: 'sick' }] }, '', 400)                       // bad status
    await bad({ records: [{ student_id: ids.Asha, status: 'present' }] }, 'INVALID_RECORDS', 400)    // a student from another class
    await bad({ records: [...allPresent([ids.Dev]), ...allPresent([ids.Asha])] }, 'INVALID_RECORDS', 400)
    await bad({ records: [...allPresent([ids.Dev]), ...allPresent([ids.Dev])] }, 'INVALID_RECORDS', 400) // duplicate
    await bad({ date: addDays(today, 1), records: allPresent([ids.Dev]) }, 'FUTURE', 400)            // tomorrow
    await bad({ date: addDays(today, -3), records: allPresent([ids.Dev]) }, 'TOO_OLD', 403)          // teachers: today + 2 days back
    const adminOld = await call(owner, 'post', '/api/attendance', { class_id: classC, date: addDays(today, -3), session: 'morning', records: allPresent([ids.Dev]) })
    expect(adminOld.status, 'the school admin may add older days').toBe(201)
  })

  test('10. The teacher who marked can correct it the same day; the admin can at any time', async () => {
    const edit = await call(teacherA, 'put', '/api/attendance', {
      class_id: classA, date: today, session: 'morning', records: allPresent(A_IDS(), { [ids.Asha]: 'absent', [ids.Bala]: 'late', [ids.Chitra]: 'late' }),
    })
    expect(edit.status, JSON.stringify(edit.body)).toBe(200)
    expect(edit.body.lock.editedBy).toBe(teacherAName)
    const sheet = await call(teacherB, 'get', `/api/attendance?view=sheet&class_id=${classA}&date=${today}&session=morning`)
    expect(sheet.body.counts).toEqual({ present: 0, late: 2, absent: 1 })
    expect(sheet.body.lock.editCount).toBe(1)
    expect(sheet.body.lock.markedBy).toBe(teacherAName)      // still credited to the original marker

    const adminEdit = await call(owner, 'put', '/api/attendance', {
      class_id: classA, date: today, session: 'afternoon', records: allPresent(A_IDS(), { [ids.Chitra]: 'absent' }),
    })
    expect(adminEdit.status, JSON.stringify(adminEdit.body)).toBe(200)

    // The admin can also mark a class nobody has marked, and is shown as the admin.
    const adminMark = await call(owner, 'post', '/api/attendance', { class_id: classC, date: today, session: 'morning', records: allPresent([ids.Dev], { [ids.Dev]: 'absent' }) })
    expect(adminMark.status).toBe(201)
    expect(adminMark.body.lock.markedBy).toBe(ownerName)
  })

  test('11. "Report a mistake" goes to the admin; only teachers report, only the admin reads', async () => {
    const note = 'Chitra was present in the morning but is marked late.'
    expect((await call(teacherB, 'post', '/api/attendance/report', { class_id: classA, date: today, session: 'morning', note })).status).toBe(201)
    expect((await call(teacherB, 'post', '/api/attendance/report', { class_id: classA, date: today, session: 'morning', note })).status).toBe(409)   // no duplicates
    expect((await call(teacherB, 'post', '/api/attendance/report', { class_id: classA, date: today, session: 'morning', note: 'x' })).status).toBe(400)
    expect((await call(teacherB, 'post', '/api/attendance/report', { class_id: classB, date: addDays(today, -1), session: 'afternoon', note })).status).toBe(409) // nothing to report
    expect((await call(teacherA, 'get', '/api/attendance/report')).status).toBe(401)
    expect((await call(parent, 'post', '/api/attendance/report', { class_id: classA, date: today, session: 'morning', note })).status).toBe(403)

    const list = await call(owner, 'get', '/api/attendance/report')
    expect(list.body).toHaveLength(1)
    expect(list.body[0]).toMatchObject({ reported_by_name: teacherBName, marked_by: teacherAName, grade: '10', section: 'A' })
    expect((await call(ownerB, 'patch', '/api/attendance/report', { id: list.body[0].id })).status).toBe(404)   // another school's admin can't touch it
    expect((await call(owner, 'patch', '/api/attendance/report', { id: list.body[0].id })).status).toBe(200)
    expect((await call(owner, 'get', '/api/attendance/report')).body).toHaveLength(0)
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Academic Calendar + holidays
  // ═════════════════════════════════════════════════════════════════════════
  let yesterdayHolidayId = 0

  test('12. Calendar: only the school admin can change it; everyone in the school can read it', async () => {
    for (const who of [teacherA, student, parent]) {
      expect((await call(who, 'post', '/api/school-calendar', { title: 'Nope', event_type: 'holiday', event_date: today })).status).toBe(403)
      expect((await call(who, 'patch', '/api/school-calendar/1', { title: 'Nope' })).status).toBe(403)
      expect((await call(who, 'delete', '/api/school-calendar/1')).status).toBe(403)
      expect((await call(who, 'put', '/api/school-calendar/settings', { weekly_off_days: [0] })).status).toBe(403)
    }
    const staffOnly = await call(owner, 'post', '/api/school-calendar', { title: 'Staff meeting', event_type: 'meeting', event_date: addDays(today, 5), audience: 'staff' })
    expect(staffOnly.status, JSON.stringify(staffOnly.body)).toBe(201)
    const everyone = await call(owner, 'post', '/api/school-calendar', { title: 'Annual Day', event_type: 'event', event_date: addDays(today, 6) })
    expect(everyone.status).toBe(201)

    const range = `from=${today}&to=${addDays(today, 10)}`
    const titles = async (who: APIRequestContext) => ((await call(who, 'get', `/api/school-calendar?${range}`)).body.events as any[]).map(e => e.title)
    expect(await titles(teacherA)).toEqual(expect.arrayContaining(['Staff meeting', 'Annual Day']))
    expect(await titles(owner)).toEqual(expect.arrayContaining(['Staff meeting', 'Annual Day']))
    expect(await titles(student)).toEqual(['Annual Day'])                 // "staff only" is hidden from students…
    expect(await titles(parent)).toEqual(['Annual Day'])                  // …and parents
    expect((await call(student, 'get', `/api/school-calendar?${range}`)).body.canEdit).toBe(false)
    expect((await call(owner, 'get', `/api/school-calendar?${range}`)).body.canEdit).toBe(true)
  })

  test('13. Calendar input is validated', async () => {
    const post = (b: object) => call(owner, 'post', '/api/school-calendar', b)
    expect((await post({ title: '', event_type: 'event', event_date: today })).status).toBe(400)
    expect((await post({ title: 'x', event_type: 'party', event_date: today })).status).toBe(400)
    expect((await post({ title: 'x', event_type: 'event', event_date: '2026-02-30' })).status).toBe(400)
    expect((await post({ title: 'x', event_type: 'event', event_date: today, end_date: addDays(today, -2) })).status).toBe(400)
    expect((await post({ title: 'x', event_type: 'event', event_date: today, end_date: addDays(today, 400) })).status).toBe(400)
    expect((await post({ title: 'x'.repeat(121), event_type: 'event', event_date: today })).status).toBe(400)
    expect((await call(owner, 'put', '/api/school-calendar/settings', { weekly_off_days: [0, 1, 2, 3, 4, 5, 6] })).status).toBe(400)   // at least one working day
    expect((await call(owner, 'put', '/api/school-calendar/settings', { weekly_off_days: [9] })).status).toBe(400)
    // A holiday is always for everyone, whatever the form said.
    const h = await post({ title: 'Audience test', event_type: 'holiday', event_date: addDays(today, 40), audience: 'staff' })
    expect(h.status).toBe(201)
    expect(h.body.audience).toBe('everyone')
    expect((await call(owner, 'delete', `/api/school-calendar/${h.body.id}`)).status).toBe(200)
  })

  test('14. Another school cannot see, change or delete this school\'s calendar', async () => {
    const mine = await call(owner, 'post', '/api/school-calendar', { title: 'Private to A', event_type: 'exam', event_date: addDays(today, 8) })
    expect(mine.status).toBe(201)
    expect((await call(ownerB, 'patch', `/api/school-calendar/${mine.body.id}`, { title: 'hijacked' })).status).toBe(404)
    expect((await call(ownerB, 'delete', `/api/school-calendar/${mine.body.id}`)).status).toBe(404)
    const seenByB = (await call(ownerB, 'get', `/api/school-calendar?from=${today}&to=${addDays(today, 30)}`)).body.events as any[]
    expect(seenByB.find(e => e.title === 'Private to A')).toBeUndefined()
    expect((await call(teacherA, 'get', `/api/school-calendar?school_id=${schoolBId}`)).status).toBe(403)
    expect((await call(owner, 'get', `/api/school-calendar?from=${today}&to=${addDays(today, 30)}`)).body.events.find((e: any) => e.title === 'Private to A')).toBeTruthy()
    expect((await call(owner, 'delete', `/api/school-calendar/${mine.body.id}`)).status).toBe(200)
  })

  test('15. The admin declares a holiday for a past day; it shows up for everyone straight away', async () => {
    const ok = await call(owner, 'post', '/api/school-calendar', { title: 'E2E Special Holiday', event_type: 'holiday', event_date: yesterday })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)          // no attendance on that day → no warning needed
    yesterdayHolidayId = ok.body.id
    for (const who of [() => parent.get(`/api/parent/attendance?student_id=${ids.Asha}&month=${yesterday.slice(0, 7)}`), () => student.get(`/api/student/attendance?month=${yesterday.slice(0, 7)}`)]) {
      const view = JSON.parse(await (await who()).text())
      expect(view.month.days.find((d: any) => d.date === yesterday)).toMatchObject({ status: 'holiday', title: 'E2E Special Holiday', morning: null })
    }
  })

  test('16. A holiday blocks marking — screen state AND server — and tells everyone why', async () => {
    const sheet = await call(teacherB, 'get', `/api/attendance?view=sheet&class_id=${classC}&date=${yesterday}&session=afternoon`)
    expect(sheet.body.nonWorking).toMatchObject({ kind: 'holiday', title: 'E2E Special Holiday' })
    expect(sheet.body.canMark).toBe(false)
    const ov = await call(teacherB, 'get', `/api/attendance/overview?date=${yesterday}`)
    expect(ov.body.nonWorking.title).toBe('E2E Special Holiday')
    expect(ov.body.canMark).toBe(false)
    expect(ov.body.totals.notMarkedMorning).toEqual([])            // no "not marked" nagging on a holiday

    const t = await call(teacherB, 'post', '/api/attendance', { class_id: classC, date: yesterday, session: 'afternoon', records: allPresent([ids.Dev]) })
    expect(t.status).toBe(409)
    expect(t.body.code).toBe('HOLIDAY')
    expect(t.body.error).toContain('E2E Special Holiday')
    const a = await call(owner, 'post', '/api/attendance', { class_id: classC, date: yesterday, session: 'afternoon', records: allPresent([ids.Dev]) })
    expect(a.status, 'even the admin cannot mark a holiday').toBe(409)

    // Teachers, students and parents can all SEE the holiday.
    for (const who of [teacherA, student, parent]) {
      const cal = (await call(who, 'get', `/api/school-calendar?from=${yesterday}&to=${yesterday}`)).body.events as any[]
      expect(cal.map(x => x.title)).toContain('E2E Special Holiday')
    }
  })

  test('17. Weekly off works the same way as a holiday, and can be changed', async () => {
    const wd = weekdayOf(today)
    expect((await call(owner, 'put', '/api/school-calendar/settings', { weekly_off_days: [wd] })).body.weeklyOff).toEqual([wd])
    const ov = await call(teacherA, 'get', `/api/attendance/overview?date=${today}`)
    expect(ov.body.nonWorking).toMatchObject({ kind: 'weekly_off' })
    const blocked = await call(teacherA, 'post', '/api/attendance', { class_id: classB, date: today, session: 'afternoon', records: allPresent([ids.Esha]) })
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('WEEKLY_OFF')
    expect((await call(student, 'get', `/api/student/attendance?month=${today.slice(0, 7)}`)).body.month.days.find((d: any) => d.date === today).status).toBe('weekly_off')
    // Back to normal.
    expect((await call(owner, 'put', '/api/school-calendar/settings', { weekly_off_days: [] })).status).toBe(200)
    expect((await call(teacherA, 'get', `/api/attendance/overview?date=${today}`)).body.nonWorking).toBeNull()
  })

  test('18. A holiday over a day that already has attendance warns first, then ignores those records — and removing it restores them', async () => {
    const ytd = async () => (await call(parent, 'get', `/api/parent/attendance?student_id=${ids.Asha}`)).body
    expect((await ytd()).yearToDate.summary).toMatchObject({ present: 1, absent: 1, marked: 2, pct: 50 })    // Morning absent, Afternoon present

    const warn = await call(owner, 'post', '/api/school-calendar', { title: 'Sudden Closure', event_type: 'holiday', event_date: today })
    expect(warn.status).toBe(409)
    expect(warn.body.code).toBe('ATTENDANCE_EXISTS')
    expect(warn.body.sessions).toBeGreaterThanOrEqual(4)

    const h = await call(owner, 'post', '/api/school-calendar', { title: 'Sudden Closure', event_type: 'holiday', event_date: today, acknowledge_existing_attendance: true })
    expect(h.status).toBe(201)

    const during = await ytd()
    expect(during.month.days.find((d: any) => d.date === today).status).toBe('holiday')
    expect(during.yearToDate.summary).toMatchObject({ marked: 0, pct: null })                              // those records are ignored now
    const brief = await call(owner, 'get', '/api/admin/briefing')
    expect(brief.body.attendance.holiday).toMatchObject({ kind: 'holiday', title: 'Sudden Closure' })
    expect(brief.body.attendance.unmarked_classes).toBe(0)
    expect((await call(teacherA, 'post', '/api/attendance', { class_id: classB, date: today, session: 'afternoon', records: allPresent([ids.Esha]) })).status).toBe(409)
    const reg = await call(owner, 'get', `/api/export/attendance?class_id=${classA}&from=${today}&to=${today}`)
    expect(String(reg.body)).toContain('Holiday: Sudden Closure (ignored in reports)')

    const del = await call(owner, 'delete', `/api/school-calendar/${h.body.id}`)
    expect(del.status).toBe(200)
    expect(del.body.restoredSessions).toBeGreaterThanOrEqual(4)
    expect((await ytd()).yearToDate.summary).toMatchObject({ present: 1, absent: 1, marked: 2, pct: 50 })   // back to normal
    expect((await call(teacherA, 'get', `/api/attendance/overview?date=${today}`)).body.nonWorking).toBeNull()
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 4. One set of numbers everywhere
  // ═════════════════════════════════════════════════════════════════════════
  test('19. Admin, teacher, parent and student all see the SAME numbers for the same child', async () => {
    const month = today.slice(0, 7)
    const viaParent = (await call(parent, 'get', `/api/parent/attendance?student_id=${ids.Asha}&month=${month}`)).body
    const viaStudent = (await call(student, 'get', `/api/student/attendance?month=${month}`)).body
    const viaTeacher = (await call(teacherB, 'get', `/api/attendance?view=student&student_id=${ids.Asha}&month=${month}`)).body
    const viaAdmin = (await call(owner, 'get', `/api/attendance?view=student&student_id=${ids.Asha}&month=${month}`)).body
    const classMonth = (await call(teacherB, 'get', `/api/attendance?view=class-month&class_id=${classA}&month=${month}`)).body

    // Asha: today Morning absent, Afternoon present  → 1 attended of 2 sessions = 50%.
    expect(viaParent.month.summary).toMatchObject({ present: 1, late: 0, absent: 1, marked: 2, attended: 1, pct: 50, band: 'low' })
    for (const other of [viaStudent, viaTeacher, viaAdmin]) {
      expect(other.month.summary).toEqual(viaParent.month.summary)
      expect(other.yearToDate.summary).toEqual(viaParent.yearToDate.summary)
      expect(other.month.days).toEqual(viaParent.month.days)
      expect(other.student.name).toBe('Asha Rao')
    }
    const ashaInClass = classMonth.students.find((s: any) => s.id === ids.Asha)
    expect(ashaInClass).toMatchObject({ pct: 50, attended: 1, marked: 2 })

    // Bala: Morning late + Afternoon present → 100% (late counts as attended).   Chitra: late + absent → 50%.
    expect(classMonth.students.find((s: any) => s.id === ids.Bala)).toMatchObject({ pct: 100, late: 1, present: 1 })
    expect(classMonth.students.find((s: any) => s.id === ids.Chitra)).toMatchObject({ pct: 50 })

    // The admin's class figure is the same rule applied to the class: attended 4 of 6 sessions = 67%.
    const analytics = (await call(owner, 'get', `/api/attendance/analytics?view=month&month=${month}`)).body
    expect(analytics.classes.find((c: any) => c.class_id === classA)).toMatchObject({ present: 4, total: 6, pct: 67 })
    if (yesterday.slice(0, 7) === month) expect(analytics.holidays.map((h: any) => h.date)).toContain(yesterday)
  })

  test('20. Each family sees only its own child; a student sees only themself', async () => {
    expect((await call(parent, 'get', `/api/parent/attendance?student_id=${ids.Asha}`)).status).toBe(200)
    expect((await call(parent, 'get', `/api/parent/attendance?student_id=${ids.Esha}`)).status, 'someone else\'s child').toBe(404)
    expect((await call(parent, 'get', `/api/parent/attendance?student_id=${ids.Bala}`)).status, 'a classmate').toBe(404)
    expect((await call(parent, 'get', '/api/parent/attendance')).status).toBe(400)
    expect((await call(parentOther, 'get', `/api/parent/attendance?student_id=${ids.Esha}`)).status).toBe(200)
    expect((await call(parentOther, 'get', `/api/parent/attendance?student_id=${ids.Asha}`)).status).toBe(404)
    expect((await call(anon.ctx!, 'get', `/api/parent/attendance?student_id=${ids.Asha}`)).status).toBe(401)
    expect((await call(anon.ctx!, 'get', '/api/student/attendance')).status).toBe(401)
    // A student cannot ask for someone else — the id is not even a parameter.
    const sneaky = (await call(student, 'get', `/api/student/attendance?student_id=${ids.Bala}`)).body
    expect(sneaky.student.name).toBe('Asha Rao')
    expect((await call(student, 'get', '/api/student/attendance?month=nope')).status).toBe(400)
    expect(JSON.stringify(sneaky)).not.toContain('Bala')
  })

  test('21. Exports: the absentee list is school-scoped and safe to open in Excel', async () => {
    const csv = await call(owner, 'get', `/api/export/attendance?mode=absentees&date=${today}`)
    expect(csv.status).toBe(200)
    expect(String(csv.body)).toContain('Asha Rao')
    expect(String(csv.body)).toContain('Dev Anand')                  // marked absent by the admin
    expect(String(csv.body)).not.toContain('Esha Reddy')             // present
    expect((await call(owner, 'get', `/api/export/attendance?mode=absentees&date=${yesterday}`)).status).toBe(409)   // holiday
    const reg = await call(owner, 'get', `/api/export/attendance?class_id=${classA}&from=${yesterday}&to=${today}`)
    expect(reg.status).toBe(200)
    expect(String(reg.body)).toContain('Working day')
    expect(String(reg.body)).toContain('Asha Rao')
    expect((await call(teacherA, 'get', `/api/export/attendance?mode=absentees&date=${today}`)).status).toBe(401)
    expect(JSON.stringify((await call(ownerB, 'get', `/api/export/attendance?mode=absentees&date=${today}`)).body)).not.toContain('Asha')
  })

  test('22. Admin dashboards reflect the same day', async () => {
    const brief = (await call(owner, 'get', '/api/admin/briefing')).body
    expect(brief.attendance.holiday).toBeNull()
    expect(brief.attendance.pct).toEqual(expect.any(Number))
    const ov = (await call(owner, 'get', `/api/admin/overview?school_id=${schoolId}&features=attendance`)).body
    expect(ov.attendance.find((c: any) => c.class_id === classA)).toMatchObject({ morning_marked: true })
    expect((await call(ownerB, 'get', `/api/admin/overview?school_id=${schoolId}&features=attendance`)).status).toBe(403)
    expect((await call(ownerB, 'get', `/api/admin/briefing?school_id=${schoolId}`)).status).toBe(403)
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Real browser, each portal
  // ═════════════════════════════════════════════════════════════════════════
  async function browserAs(browser: Browser, who: APIRequestContext): Promise<BrowserContext> {
    const context = await browser.newContext({ baseURL: BASE })
    await context.addCookies((await who.storageState()).cookies)
    return context
  }

  test('23. TEACHER (browser): class picker shows who marked; a locked session is read-only; a holiday shows no marking', async ({ browser }) => {
    test.setTimeout(180000)
    const context = await browserAs(browser, teacherB)
    const page = await context.newPage()
    await page.goto('/teacher?tab=attendance')

    const pill = page.getByTestId(`att-class-${classA}-morning`)
    await expect(pill).toBeVisible({ timeout: 60000 })
    await expect(pill).toHaveAttribute('data-state', 'marked')
    await expect(pill).toContainText(teacherAName)                       // "Ms Rao" is named on the card
    await expect(page.getByTestId(`att-class-${classC}-afternoon`)).toHaveAttribute('data-state', 'open')

    await pill.click()
    await expect(page.getByTestId('att-already-marked')).toContainText(`Already marked by ${teacherAName}`)
    await expect(page.locator('[data-testid^="att-status-"]')).toHaveCount(0)      // no way to change a status
    await expect(page.getByTestId('att-review-btn')).toHaveCount(0)
    await expect(page.getByTestId('att-edit-btn')).toHaveCount(0)
    await expect(page.getByTestId(`att-student-${ids.Asha}`)).toHaveAttribute('data-status', 'absent')

    // Report a mistake from the screen.
    await page.getByTestId('att-report-btn').click()
    await page.getByTestId('att-report-note').fill('Asha was actually present this morning.')
    await page.getByTestId('att-report-send').click()
    await expect(page.getByTestId('att-report-result')).toContainText('admin has been told')

    // Yesterday is a holiday → nothing to mark.
    await page.getByTestId('att-back').click()
    await page.getByTestId('att-date-yesterday').click()
    await expect(page.getByTestId('att-holiday')).toContainText('E2E Special Holiday')
    await expect(page.locator('[data-testid^="att-class-"][data-testid$="-morning"]')).toHaveCount(0)
    await context.close()
  })

  test('24. TEACHER (browser): marking an open session, review, submit, then it is locked', async ({ browser }) => {
    test.setTimeout(180000)
    // Class 9-B Afternoon is open (only Morning was marked).
    const context = await browserAs(browser, teacherB)
    const page = await context.newPage()
    await page.goto('/teacher?tab=attendance')
    await page.getByTestId(`att-class-${classB}-afternoon`).click()

    await expect(page.getByTestId(`att-student-${ids.Esha}`)).toHaveAttribute('data-status', 'present')   // everyone starts Present
    await page.getByTestId(`att-status-${ids.Esha}-late`).click()
    await expect(page.getByTestId('att-count-late')).toHaveText('1')
    await page.getByTestId('att-review-btn').click()
    await expect(page.getByTestId('att-review')).toBeVisible()
    await page.getByTestId('att-submit').click()
    await expect(page.getByTestId('att-done')).toContainText('Attendance saved')

    // Now Teacher A is the one who sees "Already marked by Mr Khan".
    const ctxA = await browserAs(browser, teacherA)
    const pageA = await ctxA.newPage()
    await pageA.goto('/teacher?tab=attendance')
    await pageA.getByTestId(`att-class-${classB}-afternoon`).click()
    await expect(pageA.getByTestId('att-already-marked')).toContainText(`Already marked by ${teacherBName}`)
    await context.close(); await ctxA.close()
  })

  test('25. ADMIN (browser): Academic Calendar — add a holiday; the Attendance page shows it and the report', async ({ browser }) => {
    test.setTimeout(180000)
    const context = await browserAs(browser, owner)
    const page = await context.newPage()
    await page.goto('/school-admin?tab=academic-calendar')
    await expect(page.getByTestId('academic-calendar')).toBeVisible({ timeout: 60000 })

    // A day next month, so the test does not depend on today's date.
    const nextMonthFirst = addDays(`${today.slice(0, 7)}-28`, 5).slice(0, 7) + '-05'
    await page.getByTestId('cal-add-btn').click()
    await page.getByTestId('cal-form-type-holiday').click()
    await expect(page.getByTestId('cal-form-holiday-note')).toBeVisible()
    await page.getByTestId('cal-form-title').fill('Sankranti Holiday')
    await page.getByTestId('cal-form-date').fill(nextMonthFirst)
    await page.getByTestId('cal-form-save').click()
    await expect(page.getByTestId('cal-notice')).toContainText('Holiday added')

    await page.getByTestId('cal-next').click()
    await expect(page.getByTestId(`cal-day-${nextMonthFirst}`)).toHaveAttribute('data-holiday', 'true')

    // Holiday over data that already has attendance → confirmation step.
    await page.getByTestId('cal-add-btn').click()
    await page.getByTestId('cal-form-type-holiday').click()
    await page.getByTestId('cal-form-title').fill('Closure over marked day')
    await page.getByTestId('cal-form-date').fill(today)
    await page.getByTestId('cal-form-save').click()
    await expect(page.getByTestId('cal-attendance-warning')).toContainText('already marked')
    await page.getByTestId('cal-form-cancel').click()

    // Attendance page: progress, and the mistake report the teacher just sent.
    await page.goto('/school-admin?tab=attendance')
    await expect(page.getByTestId('attendance-today-panel')).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('attendance-reports')).toContainText('Asha was actually present')

    // Weekly off card is there and saves.
    await page.goto('/school-admin?tab=academic-calendar')
    await expect(page.getByTestId('academic-calendar')).toBeVisible()
    const spare = [0, 1, 2, 3, 4, 5, 6].find(d => d !== weekdayOf(today) && d !== weekdayOf(yesterday) && d !== weekdayOf(addDays(today, -3)))!
    await page.getByTestId(`weekly-off-${spare}`).click()
    await page.getByTestId('weekly-off-save').click()
    await expect(page.getByTestId('cal-notice')).toContainText('Weekly off')
    await context.close()
  })

  test('26. PARENT (browser): own child\'s calendar with the holiday, the numbers, and the school calendar', async ({ browser }) => {
    test.setTimeout(180000)
    test.skip(!attendanceFeatureOn, 'The attendance plan feature is off in this database (set E2E_ENABLE_PLAN_FEATURES=1 on a throwaway one)')
    const context = await browserAs(browser, parent)
    const page = await context.newPage()
    await page.goto('/parent')
    // The parent portal picks the child and lands on Overview first — then go to the tab.
    await page.getByRole('button', { name: 'Attendance', exact: true }).first().click()
    await expect(page.getByTestId('attendance-calendar')).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('att-summary-month-pct')).toHaveText('50%')
    await expect(page.getByTestId('att-summary-message')).toContainText('below 75%')

    if (yesterday.slice(0, 7) !== today.slice(0, 7)) await page.getByTestId('att-cal-prev').click()
    const hol = page.getByTestId(`att-cal-day-${yesterday}`)
    await expect(hol).toHaveAttribute('data-status', 'holiday')
    await hol.click()
    await expect(page.getByTestId('att-cal-detail')).toContainText('E2E Special Holiday')

    await page.getByRole('button', { name: 'School Calendar', exact: true }).first().click()
    await expect(page.getByTestId('school-calendar')).toBeVisible({ timeout: 60000 })
    await context.close()
  })

  test('27. STUDENT (browser): own attendance, same numbers, no classmates; and it fits a phone', async ({ browser }) => {
    test.setTimeout(180000)
    test.skip(!attendanceFeatureOn, 'The attendance plan feature is off in this database (set E2E_ENABLE_PLAN_FEATURES=1 on a throwaway one)')
    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } })
    await context.addCookies((await student.storageState()).cookies)
    const page = await context.newPage()
    await page.goto('/student')
    await page.getByRole('button', { name: /My Attendance/ }).first().click()
    await expect(page.getByTestId('attendance-calendar')).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('att-summary-month-pct')).toHaveText('50%')
    expect(await page.locator('body').innerText()).not.toContain('Bala')
    await page.setViewportSize({ width: 375, height: 740 })          // now the same screen on a phone
    await expect(page.getByTestId('att-cal-day-' + today)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await context.close()
  })
})
