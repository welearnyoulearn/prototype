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
  const setCookies = res.headers.getSetCookie?.() ?? []
  const authCookie = setCookies.find(c => c.startsWith('wlyl-auth='))
  if (!authCookie) throw new Error(`School admin login failed for ${identifier} — status ${res.status}`)
  return authCookie.split(';')[0]
}

test.describe.serial('Student Onboarding — Full Lifecycle', () => {
  const ts = Date.now()
  // 7-digit suffix unique per run, used to build unique 10-digit phone numbers
  const tsSuffix = String(ts).slice(-7)
  const phone = (n: number) => `9${tsSuffix}${String(n).padStart(2, '0')}` // always 10 digits
  let schoolId: number
  let schoolCode: string
  let schoolPass: string
  let uiPass = ''       // password after first-login change (set in test 13)
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

    // Complete profile setup so UI tests don't hit the profile-setup redirect
    await api('/api/auth/profile', 'PUT', { full_name: 'Test Admin', phone: '9000000000' }, adminCookie)
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
        parent_phone: phone(1),
      }],
    }, adminCookie)

    expect(status).toBe(201)
    expect(data.inserted).toBe(1)
    expect(data.errors).toHaveLength(0)
    expect(data.credentials.students).toHaveLength(1)
    expect(data.credentials.students[0].login).toContain('no email')
    expect(data.credentials.students[0].temp_password).toBeTruthy()
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
        parent_phone: phone(2),
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
    const sharedPhone = phone(3)
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
          parent_phone: phone(4),
          parent_email: sharedEmail,
        },
        {
          name: 'Riya Sharma',
          grade: '6',
          section: 'A',
          school_roll_number: 10,
          parent_name: 'Deepak Sharma',
          parent_phone: phone(5),
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
        parent_phone: phone(6),
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
        parent_phone: phone(7),
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
        parent_phone: phone(8),
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
          parent_phone: phone(9),
        },
        {
          name: 'Bad Roll Student',
          grade: '10',
          section: 'C',
          school_roll_number: -5, // invalid
          parent_name: 'Bad Parent',
          parent_phone: phone(10),
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
        parent_phone: phone(11),
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
        parent_phone: phone(12),
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

  // Helper: login via UI and land on school-admin dashboard
  async function uiLogin(page: import('@playwright/test').Page, identifier: string, password: string) {
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/i).fill(identifier)
    await page.getByPlaceholder(/password/i).fill(password)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/change-password|\/school-admin/, { timeout: 20000 })
    if (page.url().includes('change-password')) {
      uiPass = 'UITest@1234'
      const fields = page.locator('input[type="password"]')
      await fields.nth(0).fill(uiPass)
      await fields.nth(1).fill(uiPass)
      await page.getByRole('button', { name: /change|update|set|save/i }).click()
      await page.waitForURL(/\/school-admin/, { timeout: 20000 })
    }
  }

  // ─── 13. UI: Onboarding page loads and shows table ──────────────────────────
  test('13. UI: Student onboarding page loads correctly', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, schoolPass)

    // Click Students tab in sidebar
    await page.getByRole('button', { name: /Student Management/i }).click()
    await expect(page.getByText('Student List')).toBeVisible({ timeout: 10000 })

    // Click "Onboard Students" sub-tab
    await page.getByRole('button', { name: /Onboard Students/i }).click()

    // Onboarding table should be visible
    await expect(page.getByText('Student Onboarding')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('enroll-students-btn')).toBeVisible()
  })

  // ─── 14. UI: Fill manual row and submit ─────────────────────────────────────
  test('14. UI: Manual entry row enrolls student and shows credentials modal', async ({ page }) => {
    test.setTimeout(90000)
    await uiLogin(page, schoolCode, uiPass || schoolPass)

    await page.getByRole('button', { name: /Student Management/i }).click()
    await expect(page.getByText('Student List')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /Onboard Students/i }).click()
    await expect(page.getByText('Student Onboarding')).toBeVisible({ timeout: 10000 })

    // Wait for the onboarding table to be ready
    const table = page.getByTestId('onboarding-table')
    await expect(table).toBeVisible({ timeout: 5000 })
    const row = table.locator('tbody tr:first-child')
    const cells = row.locator('td')

    // Columns: # | Roll No | Last Name | First Name | Student Email | Grade | Section | Parent Name | Parent Phone | Parent Email | Student Phone | del
    await cells.nth(1).locator('input').fill('1')                    // Roll No
    await cells.nth(2).locator('input').fill('UITest')               // Last Name
    await cells.nth(3).locator('input').fill('Student')              // First Name
    // Skip student email (optional, nth 4)
    await cells.nth(5).locator('input').fill(String(ts).slice(-2))  // Grade (unique per run)
    await cells.nth(6).locator('input').fill('Z')                    // Section (unique)
    await cells.nth(7).locator('input').fill('UI Parent')            // Parent Name
    await cells.nth(8).locator('input').fill(phone(50))              // Parent Phone (unique)

    await page.getByTestId('enroll-students-btn').click()

    // Credentials modal should appear (allow up to 30s for API + DB on cold start)
    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Student Credentials')).toBeVisible()

    // Copy All button should work (text changes to "Copied!" briefly)
    await page.getByTestId('copy-all-credentials-btn').click()
    await expect(page.getByTestId('copy-all-credentials-btn')).toContainText(/Copy All|Copied/, { timeout: 3000 })

    // Close modal — navigates back to student list
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Student List')).toBeVisible({ timeout: 5000 })
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
        parent_phone: phone(99),
      }],
    }, adminCookie)
    const studentId = createData.students[0].id
    expect(studentId).toBeTruthy()

    // Delete (soft delete — sets status to inactive)
    const { status } = await api(`/api/students/${studentId}`, 'DELETE', undefined, adminCookie)
    expect(status).toBe(200)

    // Verify student is now inactive
    const { data: listData } = await api(
      `/api/students?school_id=${schoolId}`, 'GET', undefined, adminCookie
    )
    const found = listData.find((s: { id: number }) => s.id === studentId)
    expect(found?.status).toBe('inactive')
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
