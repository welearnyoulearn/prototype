import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

async function api(path: string, method: string, body?: object, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

async function loginSchoolAdmin(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    redirect: 'manual',
  })
  const cookies = res.headers.getSetCookie?.() ?? []
  const authCookie = cookies.find(c => c.includes('wlyl_admin_token'))
  if (!authCookie) throw new Error(`School admin login failed: ${identifier}`)
  return authCookie.split(';')[0]
}

test.describe.serial('Student Onboarding — Full Lifecycle', () => {
  const ts = Date.now()
  let schoolId: number
  let schoolCode: string
  let schoolPass: string
  let adminCookie: string

  // Tracks IDs created during tests for cleanup
  const createdStudentIds: number[] = []

  // ─── Setup: create fresh school ─────────────────────────────────────────────
  test.beforeAll(async () => {
    const { data } = await api('/api/schools', 'POST', {
      name: `Onboarding Test School ${ts}`,
      type: 'Private',
      city: 'Chennai',
      country: 'India',
      phone: `98765${String(ts).slice(-5)}`,
      email: `school${ts}@onboardtest.com`,
      address: '1 Test Lane',
    })
    schoolId = data.id
    schoolCode = data.school_code
    schoolPass = data.temp_password

    // Set premium plan so all features available
    await api(`/api/schools/${schoolId}/subscription`, 'PUT', { tier: 'premium' })

    adminCookie = await loginSchoolAdmin(schoolCode, schoolPass)
  })

  // ─── Cleanup: delete all created students ────────────────────────────────────
  test.afterAll(async () => {
    for (const id of createdStudentIds) {
      await api(`/api/students/${id}`, 'DELETE', undefined, adminCookie).catch(() => {})
    }
    // Delete the school itself
    await api(`/api/schools/${schoolId}`, 'DELETE').catch(() => {})
  })

  // ─── 1. Single student — minimal required fields only ───────────────────────
  test('1. Enroll single student with required fields only (no email)', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Arjun Mehta',
        grade: '10',
        section: 'A',
        school_roll_number: 1,
        parent_name: 'Suresh Mehta',
        parent_phone: `9000${ts}01`.slice(0, 10),
      }],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(1)
    expect(data.errors).toHaveLength(0)
    expect(data.credentials.students).toHaveLength(1)
    expect(data.credentials.students[0].login).toContain('no email')
    expect(data.credentials.students[0].temp_password).toBeTruthy()
    // Parent with no email — no parent credentials since only phone (no email for welcome email)
    createdStudentIds.push(data.students[0].id)
  })

  // ─── 2. Single student — with student email + parent email ──────────────────
  test('2. Enroll student with student email + parent email', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Priya Patel',
        email: `priya${ts}@student.com`,
        grade: '10',
        section: 'A',
        school_roll_number: 2,
        parent_name: 'Ramesh Patel',
        parent_phone: `9000${ts}02`.slice(0, 10),
        parent_email: `ramesh${ts}@parent.com`,
      }],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(1)
    expect(data.credentials.students[0].login).toBe(`priya${ts}@student.com`)
    expect(data.credentials.students[0].temp_password).toBeTruthy()
    expect(data.credentials.parents).toHaveLength(1)
    expect(data.credentials.parents[0].login).toBe(`ramesh${ts}@parent.com`)
    expect(data.credentials.parents[0].temp_password).toBeTruthy()
    createdStudentIds.push(data.students[0].id)
  })

  // ─── 3. Siblings — same parent phone, two students ──────────────────────────
  test('3. Siblings: same parent phone links both children to one parent account', async () => {
    const sharedPhone = `9000${ts}03`.slice(0, 10)
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [
        {
          name: 'Kiran Singh',
          grade: '9',
          section: 'B',
          school_roll_number: 1,
          parent_name: 'Vijay Singh',
          parent_phone: sharedPhone,
        },
        {
          name: 'Meera Singh',
          grade: '7',
          section: 'A',
          school_roll_number: 1,
          parent_name: 'Vijay Singh',
          parent_phone: sharedPhone,
        },
      ],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(2)
    expect(data.errors).toHaveLength(0)
    // Only ONE new parent account (second sibling finds existing by phone)
    expect(data.credentials.parents.filter((p: { is_new: boolean }) => p.is_new)).toHaveLength(1)
    data.students.forEach((s: { id: number }) => createdStudentIds.push(s.id))
  })

  // ─── 4. Siblings — same parent email ────────────────────────────────────────
  test('4. Siblings: same parent email links both children to one parent account', async () => {
    const sharedEmail = `parent${ts}@shared.com`
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [
        {
          name: 'Rohan Sharma',
          grade: '8',
          section: 'A',
          school_roll_number: 10,
          parent_name: 'Deepak Sharma',
          parent_phone: `9000${ts}04`.slice(0, 10),
          parent_email: sharedEmail,
        },
        {
          name: 'Riya Sharma',
          grade: '6',
          section: 'A',
          school_roll_number: 10,
          parent_name: 'Deepak Sharma',
          parent_phone: `9000${ts}05`.slice(0, 10),
          parent_email: sharedEmail,
        },
      ],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(2)
    expect(data.errors).toHaveLength(0)
    // Second sibling finds parent by email — only one parent credential entry
    expect(data.credentials.parents.filter((p: { is_new: boolean }) => p.is_new)).toHaveLength(1)
    data.students.forEach((s: { id: number }) => createdStudentIds.push(s.id))
  })

  // ─── 5. Duplicate roll number — same grade+section should fail ───────────────
  test('5. Duplicate roll number in same grade+section is rejected', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Copy Student',
        grade: '10',
        section: 'A',
        school_roll_number: 1, // roll 1 in 10-A already used in test 1
        parent_name: 'Copy Parent',
        parent_phone: `9000${ts}06`.slice(0, 10),
      }],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(0)
    expect(data.errors).toHaveLength(1)
    expect(data.errors[0].message).toMatch(/Roll No 1 already exists/i)
  })

  // ─── 6. Duplicate roll number — different section is allowed ─────────────────
  test('6. Same roll number in different section is allowed', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Anil Kumar',
        grade: '10',
        section: 'B', // different section
        school_roll_number: 1,
        parent_name: 'Sunil Kumar',
        parent_phone: `9000${ts}07`.slice(0, 10),
      }],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(1)
    expect(data.errors).toHaveLength(0)
    createdStudentIds.push(data.students[0].id)
  })

  // ─── 7. Duplicate roll number — different grade is allowed ───────────────────
  test('7. Same roll number in different grade is allowed', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Bina Das',
        grade: '11', // different grade
        section: 'A',
        school_roll_number: 1,
        parent_name: 'Dina Das',
        parent_phone: `9000${ts}08`.slice(0, 10),
      }],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(1)
    expect(data.errors).toHaveLength(0)
    createdStudentIds.push(data.students[0].id)
  })

  // ─── 8. Bulk — mixed valid + invalid rows ────────────────────────────────────
  test('8. Bulk batch: valid rows enrolled, invalid rows reported as errors', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [
        {
          name: 'Valid Student',
          grade: '10',
          section: 'C',
          school_roll_number: 1,
          parent_name: 'Valid Parent',
          parent_phone: `9000${ts}09`.slice(0, 10),
        },
        {
          name: 'Bad Roll Student',
          grade: '10',
          section: 'C',
          school_roll_number: -5, // invalid
          parent_name: 'Bad Parent',
          parent_phone: `9000${ts}10`.slice(0, 10),
        },
      ],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(1)
    expect(data.errors).toHaveLength(1)
    expect(data.errors[0].message).toMatch(/positive integer/i)
    data.students.forEach((s: { id: number }) => createdStudentIds.push(s.id))
  })

  // ─── 9. Missing required fields ──────────────────────────────────────────────
  test('9. Missing name is rejected', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: '',
        grade: '10',
        section: 'A',
        school_roll_number: 99,
        parent_name: 'Some Parent',
        parent_phone: `9000${ts}11`.slice(0, 10),
      }],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(0)
    expect(data.errors[0].message).toMatch(/name is required/i)
  })

  // ─── 10. Credentials returned — student + parent temp passwords present ──────
  test('10. Credentials returned with temp passwords for all new accounts', async () => {
    const { status, data } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Cred Test Student',
        email: `credtest${ts}@student.com`,
        grade: '12',
        section: 'A',
        school_roll_number: 1,
        parent_name: 'Cred Parent',
        parent_phone: `9000${ts}12`.slice(0, 10),
        parent_email: `credparent${ts}@parent.com`,
      }],
    }, adminCookie)

    expect(status).toBe(201)
    const stuCred = data.credentials.students[0]
    const parCred = data.credentials.parents[0]
    expect(stuCred.temp_password.length).toBeGreaterThanOrEqual(8)
    expect(parCred.temp_password.length).toBeGreaterThanOrEqual(8)
    // Passwords should be different
    expect(stuCred.temp_password).not.toBe(parCred.temp_password)
    createdStudentIds.push(data.students[0].id)
  })

  // ─── 11. Reset credentials API ───────────────────────────────────────────────
  test('11. Reset credentials generates new password for student', async () => {
    // Use student from test 2 (has email)
    const { data: listData } = await api(
      `/api/students?school_id=${schoolId}&grade=10&section=A`, 'GET', undefined, adminCookie
    )
    const priya = listData.find((s: { name: string }) => s.name === 'Priya Patel')
    expect(priya).toBeTruthy()

    const { status, data } = await api(
      `/api/students/${priya.id}/reset-credentials`, 'POST', undefined, adminCookie
    )
    expect(status).toBe(200)
    expect(data.temp_password).toBeTruthy()
    expect(data.temp_password.length).toBeGreaterThanOrEqual(8)
  })

  // ─── 12. Fetch students — sorted by roll number ──────────────────────────────
  test('12. Students list sorted by roll number within grade+section', async () => {
    const { status, data } = await api(
      `/api/students?school_id=${schoolId}&grade=10&section=A`, 'GET', undefined, adminCookie
    )
    expect(status).toBe(200)
    const rolls = data
      .filter((s: { school_roll_number: number | null }) => s.school_roll_number != null)
      .map((s: { school_roll_number: number }) => s.school_roll_number)
    const sorted = [...rolls].sort((a, b) => a - b)
    expect(rolls).toEqual(sorted)
  })

  // ─── 13. UI: Onboarding page loads and shows table ──────────────────────────
  test('13. UI: Student onboarding page loads correctly', async ({ page }) => {
    // Login as school admin via UI
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/i).fill(schoolCode)
    await page.getByPlaceholder(/password/i).fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()

    // May redirect to change-password on first UI login — skip if so
    await page.waitForURL(/\/change-password|\/school-admin/, { timeout: 10000 })
    if (page.url().includes('change-password')) {
      const fields = page.locator('input[type="password"]')
      await fields.nth(0).fill('UITest@1234')
      await fields.nth(1).fill('UITest@1234')
      await page.getByRole('button', { name: /change|update|set|save/i }).click()
      await page.waitForURL(/\/school-admin/, { timeout: 10000 })
    }

    // Navigate to Students section
    await page.getByTestId('nav-students').click().catch(async () => {
      await page.goto('/school-admin?tab=students')
    })

    // Onboarding table should be visible
    await expect(page.getByText('Student Onboarding')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('enroll-students-btn')).toBeVisible()
  })

  // ─── 14. UI: Fill manual row and submit ─────────────────────────────────────
  test('14. UI: Manual entry row enrolls student and shows credentials modal', async ({ page }) => {
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/i).fill(schoolCode)
    await page.getByPlaceholder(/password/i).fill('UITest@1234')
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin/, { timeout: 10000 })

    await page.getByTestId('nav-students').click().catch(async () => {
      await page.goto('/school-admin?tab=students')
    })
    await expect(page.getByText('Student Onboarding')).toBeVisible({ timeout: 10000 })

    // Fill first row
    const rows = page.locator('tbody tr')
    const firstRow = rows.first()
    await firstRow.locator('input[type="number"]').fill('50')
    await firstRow.locator('input[placeholder="Last name"]').fill('UITest')
    await firstRow.locator('input[placeholder="First name"]').fill('Student')
    await firstRow.locator('input[placeholder="10"]').fill('10')
    await firstRow.locator('input[placeholder="A"]').fill('D')
    await firstRow.locator('input[placeholder="Parent name"]').fill('UI Parent')
    await firstRow.locator('input[placeholder*="Phone *"]').fill('9111222333')

    await page.getByTestId('enroll-students-btn').click()

    // Credentials modal should appear
    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Student Credentials')).toBeVisible()

    // Copy All button should work
    await page.getByTestId('copy-all-credentials-btn').click()
    await expect(page.getByText('Copied!')).toBeVisible({ timeout: 3000 })

    // Close modal
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('view-credentials-btn')).toBeVisible()
  })

  // ─── 15. Delete student ──────────────────────────────────────────────────────
  test('15. Delete student removes from school', async () => {
    // Create a student to delete
    const { data: createData } = await api('/api/students/bulk', 'POST', {
      school_id: schoolId,
      students: [{
        name: 'Delete Me Student',
        grade: '5',
        section: 'A',
        school_roll_number: 99,
        parent_name: 'Delete Parent',
        parent_phone: `9000${ts}99`.slice(0, 10),
      }],
    }, adminCookie)
    const studentId = createData.students[0].id
    expect(studentId).toBeTruthy()

    // Delete
    const { status } = await api(`/api/students/${studentId}`, 'DELETE', undefined, adminCookie)
    expect(status).toBe(200)

    // Verify gone
    const { data: listData } = await api(
      `/api/students?school_id=${schoolId}`, 'GET', undefined, adminCookie
    )
    const found = listData.find((s: { id: number }) => s.id === studentId)
    expect(found).toBeUndefined()
  })

  // ─── 16. Unauthorized access blocked ─────────────────────────────────────────
  test('16. Bulk enroll without auth cookie is rejected', async () => {
    const res = await fetch(`${BASE}/api/students/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        students: [{ name: 'Hacker', grade: '10', section: 'A', school_roll_number: 999 }],
      }),
    })
    expect(res.status).toBe(401)
  })
})
