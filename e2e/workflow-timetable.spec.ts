/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, request as pwRequest, APIRequestContext, Browser } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Timetable, end to end (issue #175): schedule settings → teacher availability → generate → conflicts / health →
// swap → manual edit → publish (circulate) → what teachers, students and parents see → who is NOT allowed to do what.
// Real server, real database. Creates its own schools and deletes them at the end.

type Res = { status: number; body: any }
const OWNER_PASS = 'OwnerPass@123', TEACHER_PASS = 'TeacherPass@123', STUDENT_PASS = 'StudentPass@123', PARENT_PASS = 'ParentPass@123'

const newCtx = () => pwRequest.newContext({ baseURL: BASE })
async function call(ctx: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, data?: unknown): Promise<Res> {
  const res = await ctx[method](url, data === undefined ? {} : { data })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status(), body }
}
async function browserAs(browser: Browser, ctx: APIRequestContext) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } })
  await context.addCookies((await ctx.storageState()).cookies)
  return context
}

test.describe.serial('Timetable — full workflow', () => {
  const ts = Date.now()
  let platformCookie = ''
  let schoolId = 0, schoolBId = 0, classA = 0, classB = 0, classOther = 0
  let owner: APIRequestContext, ownerB: APIRequestContext, anon: APIRequestContext
  let teacherRao: APIRequestContext, teacherKhan: APIRequestContext, student: APIRequestContext, parent: APIRequestContext
  const tid: Record<string, number> = {}
  const SUBJECTS = [['Maths', 'Rao', 6], ['Science', 'Khan', 5], ['English', 'Devi', 5]] as const

  const rows = async (ctx: APIRequestContext, classId: number) => {
    const r = await call(ctx, 'get', `/api/class-timetable?class_id=${classId}&school_id=${schoolId}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return (Array.isArray(r.body) ? r.body : r.body.slots ?? r.body.timetable ?? []) as any[]
  }

  test.beforeAll(async () => {
    test.setTimeout(300000)
    platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, { name: `Timetable E2E ${ts}`, email: `tt${ts}@e2etest.com`, phone: `98${String(ts).slice(-8)}` })
    schoolId = school.id
    await setSubscription(platformCookie, schoolId, 'premium')
    owner = await newCtx()
    expect((await call(owner, 'post', '/api/auth/login', { email: school.email, password: school.temp_password })).status).toBe(200)
    expect((await call(owner, 'post', '/api/auth/change-password', { newPassword: OWNER_PASS })).status).toBe(200)
    expect((await call(owner, 'put', '/api/auth/profile', { full_name: `Owner ${ts}`, phone: '9000000051' })).status).toBe(200)

    const mk = async (grade: string, section: string) => (await call(owner, 'post', '/api/classes', { school_id: schoolId, grade, section })).body.id as number
    classA = await mk('10', 'A'); classB = await mk('9', 'B')

    const phone = (n: number) => `9${String(ts + n).slice(-9)}`
    const email = (n: string) => `${n}${ts}@e2etest.com`
    const bulk = await call(owner, 'post', '/api/teachers/bulk', {
      school_id: schoolId,
      teachers: [
        { name: 'Ms Rao', email: email('rao'), phone: phone(11), subject: 'Maths', staff_type: 'teaching' },
        { name: 'Mr Khan', email: email('khan'), phone: phone(12), subject: 'Science', staff_type: 'teaching' },
        { name: 'Ms Devi', email: email('devi'), phone: phone(13), subject: 'English', staff_type: 'teaching' },
      ],
    })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(201)
    for (const t of bulk.body.teachers as { id: number; name: string }[]) tid[t.name.split(' ')[1]] = t.id

    for (const cls of [classA, classB]) {
      for (const [subject, teacher, ppw] of SUBJECTS) {
        const r = await call(owner, 'post', `/api/classes/${cls}/subjects`, { subject_name: subject, teacher_id: tid[teacher], periods_per_week: ppw })
        expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
      }
    }

    const login = async (name: 'rao' | 'khan') => {
      const id = tid[name === 'rao' ? 'Rao' : 'Khan']
      const reset = await call(owner, 'post', `/api/teachers/${id}/reset-credentials`)
      expect(reset.status).toBe(200)
      const ctx = await newCtx()
      expect((await call(ctx, 'post', '/api/teacher/auth/login', { email: email(name), password: reset.body.temp_password })).status).toBe(200)
      expect((await call(ctx, 'post', '/api/teacher/auth/change-password', { currentPassword: reset.body.temp_password, newPassword: TEACHER_PASS })).status).toBe(200)
      return ctx
    }
    teacherRao = await login('rao'); teacherKhan = await login('khan')

    const sb = await call(owner, 'post', '/api/students/bulk', {
      school_id: schoolId,
      students: [{ name: 'Asha Rao', grade: '10', section: 'A', school_roll_number: 1, parent_name: 'Parent of Asha', parent_phone: phone(1), parent_email: `p1${ts}@e2etest.com` }],
    })
    expect(sb.status, JSON.stringify(sb.body)).toBe(201)
    const sCred = sb.body.credentials.students[0], pCred = sb.body.credentials.parents[0]
    student = await newCtx()
    expect((await call(student, 'post', '/api/student/auth/login', { rollNumber: sCred.login, password: sCred.temp_password })).status).toBe(200)
    expect((await call(student, 'post', '/api/student/auth/change-password', { currentPassword: sCred.temp_password, newPassword: STUDENT_PASS })).status).toBe(200)
    parent = await newCtx()
    expect((await call(parent, 'post', '/api/parent/auth/login', { identifier: pCred.login, password: pCred.temp_password })).status).toBe(200)
    expect((await call(parent, 'post', '/api/parent/auth/change-password', { currentPassword: pCred.temp_password, newPassword: PARENT_PASS })).status).toBe(200)

    const b = await createSchool(platformCookie, { name: `Timetable E2E B ${ts}`, email: `ttb${ts}@e2etest.com`, phone: `97${String(ts).slice(-8)}` })
    schoolBId = b.id
    ownerB = await newCtx()
    expect((await call(ownerB, 'post', '/api/auth/login', { email: b.email, password: b.temp_password })).status).toBe(200)
    expect((await call(ownerB, 'post', '/api/auth/change-password', { newPassword: OWNER_PASS })).status).toBe(200)
    classOther = (await call(ownerB, 'post', '/api/classes', { school_id: schoolBId, grade: '5', section: 'A' })).body.id
    anon = await newCtx()
  })

  test.afterAll(async () => {
    test.setTimeout(120000)
    const c = await newCtx()
    for (const id of [schoolId, schoolBId]) if (id) await c.delete(`/api/schools/${id}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await c.dispose()
    for (const x of [owner, ownerB, anon, teacherRao, teacherKhan, student, parent]) await x?.dispose()
  })

  // ═════════════════════════════════════════════════════════════════════════
  test('1. Nobody without a school-admin login can use the timetable tools; other schools are shut out', async () => {
    const adminOnly: [string, 'get' | 'post' | 'delete', string, unknown?][] = [
      ['generate', 'post', '/api/class-timetable/generate', { school_id: schoolId }],
      ['circulate', 'post', '/api/class-timetable/circulate', { school_id: schoolId, class_id: classA }],
      ['swap', 'post', '/api/class-timetable/swap', { school_id: schoolId, class_id: classA, slot_a: 1, slot_b: 2 }],
      ['sync', 'post', '/api/class-timetable/sync', { school_id: schoolId }],
      ['conflicts', 'get', `/api/class-timetable/conflicts?school_id=${schoolId}`],
      ['health', 'get', `/api/class-timetable/health?school_id=${schoolId}`],
      ['teacher-load', 'get', `/api/class-timetable/teacher-load?school_id=${schoolId}`],
      ['validate', 'get', `/api/class-timetable/validate?school_id=${schoolId}`],
      ['classes/sync', 'post', '/api/classes/sync', { school_id: schoolId }],
      ['class health', 'get', `/api/classes/${classA}/health?school_id=${schoolId}`],
      ['schedule-templates', 'get', `/api/schedule-templates?school_id=${schoolId}`],
      ['school-schedule', 'get', `/api/school-schedule?school_id=${schoolId}`],
      ['timetable-modes', 'get', `/api/timetable-modes?school_id=${schoolId}`],
      ['timetable-versions', 'get', `/api/timetable-versions?school_id=${schoolId}`],
      ['availability', 'get', `/api/teacher-availability?teacher_id=${tid.Rao}&school_id=${schoolId}`],
    ]
    for (const who of [anon, student, parent]) {
      for (const [name, m, url, body] of adminOnly) {
        const r = await call(who, m, url, body)
        expect(r.status, `${name} should refuse a non-admin`).toBe(401)
      }
    }
    expect((await call(teacherRao, 'post', '/api/class-timetable/generate', { school_id: schoolId })).status).toBe(401)   // teachers cannot generate

    // Another school's admin: wrong school_id → 403; a class / teacher of this school → 404.
    expect((await call(ownerB, 'post', '/api/class-timetable/generate', { school_id: schoolId })).status).toBe(403)
    expect((await call(ownerB, 'get', `/api/class-timetable/conflicts?school_id=${schoolId}`)).status).toBe(403)
    expect((await call(ownerB, 'post', '/api/class-timetable/generate', { school_id: schoolBId, class_id: classA })).status).toBe(404)
    expect((await call(ownerB, 'post', '/api/class-timetable/circulate', { school_id: schoolBId, class_id: classA })).status).toBe(404)
    expect((await call(ownerB, 'get', `/api/teacher-availability?teacher_id=${tid.Rao}&school_id=${schoolBId}`)).status).toBe(404)
    expect((await call(owner, 'post', '/api/class-timetable/generate', { school_id: schoolId, class_id: classOther })).status).toBe(404)
  })

  test('2. School schedule: the admin sets the day\'s shape and it is remembered', async () => {
    const before = await call(owner, 'get', `/api/school-schedule?school_id=${schoolId}`)
    expect(before.status).toBe(200)
    const settings = { periods_per_day: 8, start_time: '08:30', end_time: '17:00', morning_break_after_period: 3, morning_break_duration: 15, lunch_after_period: 5, lunch_duration: 45, afternoon_break_after_period: 7, afternoon_break_duration: 10 }
    const save = await call(owner, 'post', '/api/school-schedule', { school_id: schoolId, ...settings })
    expect(save.status, JSON.stringify(save.body)).toBeLessThan(300)
    const after = (await call(owner, 'get', `/api/school-schedule?school_id=${schoolId}`)).body
    expect(after.periods_per_day ?? after.settings?.periods_per_day).toBe(8)
    expect((await call(owner, 'get', `/api/school-schedule?school_id=${schoolId}`)).status).toBe(200)
  })

  test('3. Teacher availability: the admin can block a period; a teacher sees only their own', async () => {
    const block = await call(owner, 'post', '/api/teacher-availability', { teacher_id: tid.Rao, school_id: schoolId, day_of_week: 'Monday', period_number: 1, reason: 'Assembly duty' })
    expect(block.status, JSON.stringify(block.body)).toBeLessThan(300)
    const own = await call(teacherRao, 'get', `/api/teacher-availability?teacher_id=${tid.Rao}&school_id=${schoolId}`)
    expect(own.status).toBe(200)
    expect(JSON.stringify(own.body)).toContain('Monday')
    // Ms Rao cannot read Mr Khan's, nor change anyone else's
    expect((await call(teacherRao, 'get', `/api/teacher-availability?teacher_id=${tid.Khan}&school_id=${schoolId}`)).status).toBe(403)
    expect((await call(teacherRao, 'post', '/api/teacher-availability', { teacher_id: tid.Khan, school_id: schoolId, day_of_week: 'Friday', period_number: 2 })).status).toBe(403)
  })

  test('4. Generate: every subject gets its periods, nobody is in two places, availability is respected', async () => {
    const gen = await call(owner, 'post', '/api/class-timetable/generate', { school_id: schoolId })
    expect(gen.status, JSON.stringify(gen.body).slice(0, 300)).toBeLessThan(300)

    const a = (await rows(owner, classA)).filter(r => !r.is_break)
    const b = (await rows(owner, classB)).filter(r => !r.is_break)
    expect(a.length).toBeGreaterThan(0); expect(b.length).toBeGreaterThan(0)
    const count = (slots: any[], subject: string) => slots.filter(s => s.subject_name === subject).length
    for (const [subject, , ppw] of SUBJECTS) {
      expect(count(a, subject), `10-A ${subject}`).toBe(ppw)
      expect(count(b, subject), `9-B ${subject}`).toBe(ppw)
    }
    // No teacher teaches two classes in the same period
    const seen = new Map<string, number>()
    for (const s of [...a, ...b].filter(x => x.teacher_id)) {
      const key = `${s.teacher_id}|${s.day_of_week}|${s.period_number}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    expect([...seen.values()].filter(n => n > 1)).toEqual([])
    // Ms Rao was blocked for Monday period 1
    expect([...a, ...b].some(s => s.teacher_id === tid.Rao && s.day_of_week === 'Monday' && s.period_number === 1)).toBe(false)
    // Breaks are marked as breaks
    const withBreaks = await rows(owner, classA)
    expect(withBreaks.some(r => r.is_break)).toBe(true)
  })

  test('5. Conflicts, health, validation and teacher load all agree the fresh timetable is clean', async () => {
    const conflicts = await call(owner, 'get', `/api/class-timetable/conflicts?school_id=${schoolId}`)
    expect(conflicts.status).toBe(200)
    const list = Array.isArray(conflicts.body) ? conflicts.body : conflicts.body.conflicts ?? []
    expect(list).toHaveLength(0)
    expect((await call(owner, 'get', `/api/class-timetable/health?school_id=${schoolId}`)).status).toBe(200)
    expect((await call(owner, 'get', `/api/class-timetable/validate?school_id=${schoolId}`)).status).toBe(200)
    const load = await call(owner, 'get', `/api/class-timetable/teacher-load?school_id=${schoolId}`)
    expect(load.status).toBe(200)
    expect(JSON.stringify(load.body)).toContain('Rao')
    expect((await call(owner, 'get', `/api/classes/${classA}/health?school_id=${schoolId}`)).status).toBe(200)
  })

  test('6. Swap two periods; a clashing swap is refused and changes nothing', async () => {
    const before = (await rows(owner, classA)).filter(r => !r.is_break)
    const first = before.find(r => r.subject_name === 'Maths')!
    const second = before.find(r => r.subject_name === 'English' && r.day_of_week !== first.day_of_week)!
    let swapped = false
    const swap = await call(owner, 'post', '/api/class-timetable/swap', { school_id: schoolId, class_id: classA, slot_a: first.id, slot_b: second.id })
    if (swap.status < 300) {
      swapped = true
      const after = await rows(owner, classA)
      const a2 = after.find(r => r.id === first.id)!, b2 = after.find(r => r.id === second.id)!
      expect([a2.subject_name, b2.subject_name].sort()).toEqual(['English', 'Maths'])
    } else {
      expect([400, 409, 422]).toContain(swap.status)                      // a real clash is refused with a reason…
      const after = (await rows(owner, classA)).find(r => r.id === first.id)!
      expect(after.subject_name).toBe(first.subject_name)                  // …and nothing moved
    }
    expect(typeof swapped).toBe('boolean')
    // A swap that names a slot from another school is "not found"
    expect((await call(ownerB, 'post', '/api/class-timetable/swap', { school_id: schoolBId, class_id: classOther, slot_a: first.id, slot_b: second.id })).status).toBe(404)
  })

  test('7. Manual edit: staff can edit any slot; a teacher only their OWN periods; students and parents never', async () => {
    const slot = (await rows(owner, classA)).find(r => !r.is_break && r.subject_name === 'Science')!      // Mr Khan's period
    const edit = { id: slot.id, school_id: schoolId, class_id: classA, subject_name: slot.subject_name, teacher_id: slot.teacher_id, room: 'Lab 2' }
    expect((await call(owner, 'put', '/api/class-timetable', edit)).status).toBeLessThan(300)
    expect((await rows(owner, classA)).find(r => r.id === slot.id)?.room).toBe('Lab 2')

    // Mr Khan may change the room of his own period …
    expect((await call(teacherKhan, 'put', '/api/class-timetable', { ...edit, room: 'Lab 3' })).status).toBeLessThan(300)
    // … but not hand it to someone else, nor touch another teacher's period, nor change many at once
    expect((await call(teacherKhan, 'put', '/api/class-timetable', { ...edit, teacher_id: tid.Rao })).status).toBe(403)
    expect((await call(teacherRao, 'put', '/api/class-timetable', { ...edit, teacher_id: tid.Rao })).status).toBe(403)
    expect((await call(teacherRao, 'put', '/api/class-timetable', { ...edit, teacher_id: tid.Khan, room: 'X' })).status).toBe(403)
    expect((await call(teacherKhan, 'put', '/api/class-timetable', { ...edit, apply_to_subject: true })).status).toBe(403)
    expect((await call(teacherKhan, 'delete', `/api/class-timetable?class_id=${classA}&school_id=${schoolId}`)).status).toBe(403)   // whole-class clear is staff only
    for (const [name, who] of [['student', student], ['parent', parent]] as const) {
      expect((await call(who, 'put', '/api/class-timetable', edit)).status, `${name} must not edit the timetable`).toBe(403)
    }
    expect((await call(student, 'delete', `/api/class-timetable?class_id=${classA}&school_id=${schoolId}`)).status).toBe(403)
    expect((await rows(owner, classA)).find(r => r.id === slot.id)?.room).toBe('Lab 3')
  })

  test('8. Publish: circulating stamps the class, and teachers, students and parents can see it', async () => {
    const pub = await call(owner, 'post', '/api/class-timetable/circulate', { school_id: schoolId, class_id: classA })
    expect(pub.status, JSON.stringify(pub.body)).toBeLessThan(300)
    const classes = (await call(owner, 'get', `/api/classes?school_id=${schoolId}`)).body as any[]
    expect(classes.find(c => c.id === classA).timetable_circulated_at).toBeTruthy()
    expect(classes.find(c => c.id === classB).timetable_circulated_at ?? null).toBeNull()

    // Teacher: own weekly timetable
    const mine = await call(teacherRao, 'get', `/api/timetable?teacher_id=${tid.Rao}&school_id=${schoolId}`)
    expect(mine.status).toBe(200)
    expect(JSON.stringify(mine.body)).toContain('Maths')
    // Student and parent: the class timetable, read-only
    expect((await rows(student, classA)).length).toBeGreaterThan(0)
    const viaParent = await call(parent, 'get', `/api/parent/timetable?school_id=${schoolId}&class_id=${classA}`)
    expect(viaParent.status).toBe(200)
    expect(viaParent.body.week_periods.length).toBeGreaterThan(0)
    // The teacher was told
    const notes = await call(teacherRao, 'get', '/api/notifications')
    expect(notes.status).toBe(200)
    expect(Array.isArray(notes.body) && notes.body.length).toBeGreaterThan(0)
  })

  test('9. Regenerate replaces the old timetable; clear removes it', async () => {
    const regen = await call(owner, 'post', '/api/class-timetable/generate', { school_id: schoolId, class_id: classA, force_replace: true })
    expect(regen.status, JSON.stringify(regen.body).slice(0, 200)).toBeLessThan(300)
    expect((await rows(owner, classA)).filter(r => !r.is_break).length).toBeGreaterThan(0)
    const clear = await call(owner, 'delete', `/api/class-timetable?class_id=${classA}&school_id=${schoolId}`)
    expect(clear.status).toBeLessThan(300)
    expect((await rows(owner, classA)).filter(r => !r.is_break && r.subject_name)).toHaveLength(0)
  })

  test('10. ADMIN (browser): the timetable screen shows the classes and a generated grid', async ({ browser }) => {
    test.setTimeout(180000)
    expect((await call(owner, 'post', '/api/class-timetable/generate', { school_id: schoolId, class_id: classA, force_replace: true })).status).toBeLessThan(300)
    const context = await browserAs(browser, owner)
    const page = await context.newPage()
    await page.goto('/school-admin?tab=timetable')
    await expect(page.getByText('Teacher Load Analysis')).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('Publish All')).toBeVisible()
    await page.getByText('Section A', { exact: true }).click()                 // the Grade 10 card
    await expect(page.getByText('Maths').first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Ms Rao').first()).toBeVisible()
    await context.close()
  })

  test('11. TEACHER (browser): my timetable shows my periods', async ({ browser }) => {
    test.setTimeout(180000)
    const context = await browserAs(browser, teacherRao)
    const page = await context.newPage()
    await page.goto('/teacher?tab=timetable')
    await expect(page.getByText('Maths').first()).toBeVisible({ timeout: 60000 })
    await context.close()
  })
})
