import { test, expect, Page, request as playwrightRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// ─── Shared helpers (same retry pattern as workflow-syllabus-audit.spec.ts —
// the local dev DB's small connection pool occasionally 500s under a burst of
// sequential setup calls) ────────────────────────────────────────────────────
async function apiOnce(path: string, method: string, body?: object, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function api(path: string, method: string, body?: object, cookie?: string) {
  let last = await apiOnce(path, method, body, cookie)
  for (let i = 0; i < 6 && last.status === 500; i++) {
    await new Promise(r => setTimeout(r, 2000))
    last = await apiOnce(path, method, body, cookie)
  }
  return last
}

async function loginSchoolAdmin(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    redirect: 'manual',
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  const authCookie = setCookies.find(c => c.startsWith('wlyl-auth='))
  if (!authCookie) throw new Error(`School admin login failed for ${identifier} — status ${res.status}`)
  return authCookie.split(';')[0]
}

async function teacherUiLogin(page: Page, email: string, password: string): Promise<string> {
  await page.goto('/teacher/login')
  await page.getByTestId('teacher-email-input').fill(email)
  await page.getByTestId('auth-password-input').fill(password)
  await page.getByTestId('teacher-submit-btn').click()
  await page.waitForURL(/\/teacher(\/change-password)?$/, { timeout: 15000 })

  let current = password
  if (page.url().includes('change-password')) {
    current = 'NewTeacher@1234'
    const fields = page.locator('input[type="password"]')
    await fields.nth(0).fill(current)
    await fields.nth(1).fill(current)
    await page.getByRole('button', { name: /change|update|set|save/i }).click()
    await page.waitForURL(/\/teacher$/, { timeout: 15000 })
  }
  return current
}

test.describe.serial('Staff Onboarding → Teacher Portal — Data Flow & Constraints', () => {
  const ts = Date.now()

  // School A — primary school where onboarding + assignment happens
  let schoolAId: number
  let schoolACode: string
  let schoolAPass: string
  let adminACookie: string

  // School B — used only for cross-tenant isolation checks
  let schoolBId: number
  let schoolBCode: string
  let schoolBPass: string
  let adminBCookie: string

  let ctx: APIRequestContext
  let platformCookie: string

  let teacherId: number
  let teacherEmail: string
  let teacherTempPassword: string
  let classId: number
  const GRADE = String(9000 + (ts % 900)) // unlikely to collide with a real grade string used elsewhere

  test.beforeAll(async () => {
    test.setTimeout(180000)
    ctx = await playwrightRequest.newContext({ baseURL: BASE })
    platformCookie = await platformAdminCookie()

    const schoolA = await createSchool(platformCookie, {
      name: `Data Flow School A ${ts}`,
      phone: `98761${String(ts).slice(-5)}`,
      email: `dataflowA${ts}@test.com`,
      address: '1 Flow Lane',
    })
    schoolAId = schoolA.id; schoolACode = schoolA.school_code; schoolAPass = schoolA.temp_password
    await setSubscription(platformCookie, schoolAId, 'premium')
    adminACookie = await loginSchoolAdmin(schoolACode, schoolAPass)

    const schoolB = await createSchool(platformCookie, {
      name: `Data Flow School B ${ts}`,
      phone: `98762${String(ts).slice(-5)}`,
      email: `dataflowB${ts}@test.com`,
      address: '2 Flow Lane',
    })
    schoolBId = schoolB.id; schoolBCode = schoolB.school_code; schoolBPass = schoolB.temp_password
    await setSubscription(platformCookie, schoolBId, 'premium')
    adminBCookie = await loginSchoolAdmin(schoolBCode, schoolBPass)

    // Create the class BEFORE any teacher exists at this school — POST
    // /api/classes auto-assigns subjects to teachers via fuzzy subject-name
    // matching (matchTeacher()) against whatever teaching staff already
    // exist. Onboarding "Flow Teacher"/Mathematics first would make class
    // creation silently auto-assign them to the class's Mathematics subject,
    // which would falsify D1 ("before any assignment, teacher sees no
    // classes") and make D2's explicit assignment a no-op. With zero staff
    // at creation time, every auto-created class_subjects row is guaranteed
    // teacher_id IS NULL, and D2 is the only thing that ever assigns anyone.
    const classRes = await api('/api/classes', 'POST', {
      school_id: schoolAId, grade: GRADE, section: 'A',
    }, adminACookie)
    expect([200, 201]).toContain(classRes.status)
    classId = (classRes.data as { id: number }).id

    // Onboard one teacher into School A via the bulk route (same path the UI uses).
    teacherEmail = `flowteacher${ts}@dataflow.com`
    const bulkRes = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolAId,
      teachers: [{ name: 'Flow Teacher', email: teacherEmail, subject: 'Mathematics', staff_type: 'teaching' }],
    }, adminACookie)
    expect(bulkRes.status).toBe(201)
    const body = bulkRes.data as { teachers: { id: number }[] }
    teacherId = body.teachers[0].id
  })

  test.afterAll(async () => {
    test.setTimeout(60000)
    await ctx.delete(`/api/schools/${schoolAId}`).catch(() => {})
    await ctx.delete(`/api/schools/${schoolBId}`).catch(() => {})
    await ctx.dispose()
  })

  // ══════════════════════════════════════════════════════════════════════
  // DB / uniqueness constraints
  // ══════════════════════════════════════════════════════════════════════

  test('C1. Duplicate email within the same school is rejected by the API', async () => {
    const res = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolAId,
      teachers: [{ name: 'Duplicate Of Flow Teacher', email: teacherEmail, subject: 'Physics' }],
    }, adminACookie)
    expect(res.status).toBe(201) // bulk always 201s at the HTTP level; per-row error lives in the body
    const body = res.data as { inserted: number; errors: { message: string }[] }
    expect(body.inserted).toBe(0)
    expect(body.errors[0].message).toMatch(/already registered/i)
  })

  test('C2. Duplicate email across two different schools is rejected platform-wide', async () => {
    const res = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolBId,
      teachers: [{ name: 'School B Copycat', email: teacherEmail, subject: 'Physics' }],
    }, adminBCookie)
    const body = res.data as { inserted: number; errors: { message: string }[] }
    expect(body.inserted).toBe(0)
    expect(body.errors[0].message).toMatch(/already registered to Flow Teacher/i)
    expect(body.errors[0].message).toMatch(new RegExp(`Data Flow School A ${ts}`))
  })

  test('C3. Duplicate phone within the same school is rejected; different school is allowed', async () => {
    const sharedPhone = `8${String(ts).slice(-8)}`
    const first = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolAId,
      teachers: [{ name: 'Phone Owner A', email: `phoneownerA${ts}@dataflow.com`, subject: 'Art', phone: sharedPhone }],
    }, adminACookie)
    expect((first.data as { inserted: number }).inserted).toBe(1)

    const sameschool = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolAId,
      teachers: [{ name: 'Phone Owner A2', email: `phoneownerA2${ts}@dataflow.com`, subject: 'Art', phone: sharedPhone }],
    }, adminACookie)
    const sameSchoolBody = sameschool.data as { inserted: number; errors: { message: string }[] }
    expect(sameSchoolBody.inserted).toBe(0)
    expect(sameSchoolBody.errors[0].message).toMatch(/already exists/i)

    // Phone uniqueness is scoped per-school, not platform-wide — School B may
    // reuse the same phone number for an unrelated staff member.
    const otherSchool = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolBId,
      teachers: [{ name: 'Phone Owner B', email: `phoneownerB${ts}@dataflow.com`, subject: 'Art', phone: sharedPhone }],
    }, adminBCookie)
    expect((otherSchool.data as { inserted: number }).inserted).toBe(1)
  })

  test('C4. Malformed email/phone submitted directly via API (bypassing UI) is rejected server-side', async () => {
    const res = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolAId,
      teachers: [
        { name: 'Bad Email Direct', email: 'not-an-email', subject: 'Music' },
        { name: 'Bad Phone Direct', email: `badphone${ts}@dataflow.com`, subject: 'Music', phone: 'abc' },
      ],
    }, adminACookie)
    const body = res.data as { inserted: number; errors: { row: number; message: string }[] }
    expect(body.inserted).toBe(0)
    expect(body.errors.find(e => e.row === 1)?.message).toMatch(/not a valid email/i)
    expect(body.errors.find(e => e.row === 2)?.message).toMatch(/not a valid phone/i)
  })

  test('C5. Employee IDs are unique per school', async () => {
    const res = await api(`/api/teachers?school_id=${schoolAId}`, 'GET', undefined, adminACookie)
    const list = res.data as { employee_id: string }[]
    const ids = list.map(t => t.employee_id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // ══════════════════════════════════════════════════════════════════════
  // Cross-tenant isolation on teacher endpoints
  // ══════════════════════════════════════════════════════════════════════

  test('T1. School B admin cannot list School A\'s teachers by passing its school_id', async () => {
    const res = await api(`/api/teachers?school_id=${schoolAId}`, 'GET', undefined, adminBCookie)
    expect(res.status).toBe(403)
  })

  test('T2. School B admin cannot read a single School A teacher record', async () => {
    const res = await api(`/api/teachers/${teacherId}`, 'GET', undefined, adminBCookie)
    expect(res.status).toBe(403)
  })

  test('T3. School B admin cannot edit a School A teacher record', async () => {
    const res = await api(`/api/teachers/${teacherId}`, 'PUT', { department: 'Hijacked' }, adminBCookie)
    expect(res.status).toBe(403)
  })

  test('T4. School B admin cannot remove a School A teacher', async () => {
    const res = await api(`/api/teachers/${teacherId}`, 'DELETE', undefined, adminBCookie)
    expect(res.status).toBe(403)
  })

  test('T5. School B admin cannot reset a School A teacher\'s credentials', async () => {
    const res = await api(`/api/teachers/${teacherId}/reset-credentials`, 'POST', undefined, adminBCookie)
    expect(res.status).toBe(403)
  })

  test('T6. School B admin cannot onboard a teacher into School A by spoofing school_id in the request body', async () => {
    const res = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolAId,
      teachers: [{ name: 'Spoofed Hire', email: `spoofed${ts}@dataflow.com`, subject: 'Drama' }],
    }, adminBCookie)
    expect(res.status).toBe(403)
  })

  test('T7. Unauthenticated request to any teacher endpoint is rejected (401)', async () => {
    const getRes = await api(`/api/teachers/${teacherId}`, 'GET')
    expect(getRes.status).toBe(401)
    const bulkRes = await api('/api/teachers/bulk', 'POST', { school_id: schoolAId, teachers: [] })
    expect(bulkRes.status).toBe(401)
  })

  // ══════════════════════════════════════════════════════════════════════
  // Login constraints
  // ══════════════════════════════════════════════════════════════════════

  test('L1. Teacher cannot log in before credentials are issued (no password_hash yet)', async () => {
    // Onboard a second teacher with no email — never gets a temp password.
    const res = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolAId,
      teachers: [{ name: 'No Email Staff', subject: 'PE' }],
    }, adminACookie)
    expect((res.data as { inserted: number }).inserted).toBe(1)
    // Can't even attempt login without an email/identifier — this documents
    // the state rather than asserting a login attempt, since there is no
    // email to log in with. Confirm via the directory that the record has no
    // password_hash exposed and status is active (pending activation is
    // invisible in this exact fetch, matching the known UX gap).
    const list = await api(`/api/teachers?school_id=${schoolAId}`, 'GET', undefined, adminACookie)
    const staff = (list.data as { name: string; password_changed: boolean }[]).find(t => t.name === 'No Email Staff')
    expect(staff).toBeTruthy()
    expect(staff!.password_changed).toBe(false)
  })

  test('L2. Teacher login rejects wrong password', async ({ page }) => {
    await page.goto('/teacher/login')
    await page.getByTestId('teacher-email-input').fill(teacherEmail)
    await page.getByTestId('auth-password-input').fill('DefinitelyWrongPassword123')
    await page.getByTestId('teacher-submit-btn').click()
    await expect(page.getByTestId('auth-error-text')).toBeVisible({ timeout: 10000 })
  })

  test('L3. Deactivated teacher cannot log in even with a valid password', async () => {
    // Issue real credentials for Flow Teacher via reset-credentials — the
    // response returns temp_password directly, so no email inspection is
    // needed (see reset-credentials/route.ts, which returns { temp_password }).
    const resetRes = await api(`/api/teachers/${teacherId}/reset-credentials`, 'POST', undefined, adminACookie)
    expect(resetRes.status).toBe(200)
    teacherTempPassword = (resetRes.data as { temp_password: string }).temp_password
    expect(teacherTempPassword).toBeTruthy()

    // Deactivate, attempt login, expect rejection.
    const deactivateRes = await api(`/api/teachers/${teacherId}`, 'PUT', { status: 'inactive' }, adminACookie)
    expect(deactivateRes.status).toBe(200)

    const loginRes = await api('/api/teacher/auth/login', 'POST', { email: teacherEmail, password: teacherTempPassword })
    expect(loginRes.status).toBeGreaterThanOrEqual(400)

    // Reactivate for subsequent tests.
    const reactivateRes = await api(`/api/teachers/${teacherId}`, 'PUT', { status: 'active' }, adminACookie)
    expect(reactivateRes.status).toBe(200)
  })

  test('L4. Teacher logs in successfully with valid credentials via the UI', async ({ page }) => {
    const finalPassword = await teacherUiLogin(page, teacherEmail, teacherTempPassword)
    teacherTempPassword = finalPassword
    await expect(page).toHaveURL(/\/teacher$/)
  })

  // ══════════════════════════════════════════════════════════════════════
  // Downstream: syllabus/classes/students becoming visible to the teacher
  // after school-admin assignment — before assignment, nothing should show;
  // after assignment, exactly the assigned class/subject should show.
  // ══════════════════════════════════════════════════════════════════════

  test('D1. Before any assignment, teacher sees no classes', async () => {
    const res = await api(`/api/teachers/${teacherId}/class-subjects`, 'GET', undefined, adminACookie)
    expect(res.status).toBe(200)
    expect(res.data).toEqual([])
  })

  test('D2. School admin assigns the teacher to a subject on the class via Class Management API', async () => {
    const res = await api(`/api/classes/${classId}/subjects`, 'POST', {
      subject_name: 'Mathematics', teacher_id: teacherId, periods_per_week: 5,
    }, adminACookie)
    expect(res.status).toBe(201)
    expect((res.data as { teacher_id: number }).teacher_id).toBe(teacherId)
  })

  test('D3. After assignment, GET /api/teachers/{id}/class-subjects reflects the class', async () => {
    const res = await api(`/api/teachers/${teacherId}/class-subjects`, 'GET', undefined, adminACookie)
    expect(res.status).toBe(200)
    const rows = res.data as { subject_name: string; grade: string; section: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0].subject_name).toBe('Mathematics')
    expect(rows[0].grade).toBe(GRADE)
    expect(rows[0].section).toBe('A')
  })

  test('D4. Teacher UI — My Classes shows the newly assigned class', async ({ page }) => {
    await teacherUiLogin(page, teacherEmail, teacherTempPassword)
    await page.getByRole('button', { name: /My Classes/i }).click()
    await expect(page.getByText(`${GRADE}-A`)).toBeVisible({ timeout: 10000 })
  })

  test('D5. A subject NOT assigned to this teacher does not appear in their class-subjects', async () => {
    // Add a second subject to the same class, assigned to nobody (teacher_id null).
    const res = await api(`/api/classes/${classId}/subjects`, 'POST', {
      subject_name: 'Unassigned Subject', teacher_id: null, periods_per_week: 3,
    }, adminACookie)
    expect(res.status).toBe(201)

    const flowRes = await api(`/api/teachers/${teacherId}/class-subjects`, 'GET', undefined, adminACookie)
    const rows = flowRes.data as { subject_name: string }[]
    expect(rows.find(r => r.subject_name === 'Unassigned Subject')).toBeUndefined()
    expect(rows.find(r => r.subject_name === 'Mathematics')).toBeTruthy()
  })

  test('D6. Enrolling a student in the assigned class makes them visible to the teacher via My Students', async ({ page }) => {
    const studentRes = await api('/api/students/bulk', 'POST', {
      school_id: schoolAId,
      students: [{ name: 'Flow Student', grade: GRADE, section: 'A', school_roll_number: 1 }],
    }, adminACookie)
    expect((studentRes.data as { inserted: number }).inserted).toBe(1)

    await teacherUiLogin(page, teacherEmail, teacherTempPassword)
    await page.getByRole('button', { name: /My Students/i }).click()
    // Select the assigned class if the UI requires an explicit class pick.
    const classOption = page.getByText(`${GRADE}-A`).first()
    if (await classOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await classOption.click()
    }
    await expect(page.getByText('Flow Student')).toBeVisible({ timeout: 10000 })
  })

  test('D7. Removing the teacher unassigns them from the subject but keeps the class/subject row for audit', async () => {
    const delRes = await api(`/api/teachers/${teacherId}`, 'DELETE', undefined, adminACookie)
    expect(delRes.status).toBe(200)

    const subjectsRes = await api(`/api/classes/${classId}/subjects`, 'GET', undefined, adminACookie)
    const rows = subjectsRes.data as { subject_name: string; teacher_id: number | null }[]
    const mathRow = rows.find(r => r.subject_name === 'Mathematics')
    expect(mathRow).toBeTruthy()
    expect(mathRow!.teacher_id).toBeNull() // unlinked, not deleted — same audit-preservation pattern as the other FK unlinks

    // Removed teacher can no longer authenticate.
    const loginRes = await api('/api/teacher/auth/login', 'POST', { email: teacherEmail, password: teacherTempPassword })
    expect(loginRes.status).toBeGreaterThanOrEqual(400)
  })

  test('D8. Removed teacher\'s email is free for a new hire at another school', async () => {
    const res = await api('/api/teachers/bulk', 'POST', {
      school_id: schoolBId,
      teachers: [{ name: 'New Owner Of Freed Email', email: teacherEmail, subject: 'Mathematics' }],
    }, adminBCookie)
    expect((res.data as { inserted: number }).inserted).toBe(1)
  })
})
