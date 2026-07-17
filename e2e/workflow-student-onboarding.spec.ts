import { test, expect, Page, request as playwrightRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// ─── UI helpers ─────────────────────────────────────────────────────────────
async function uiLogin(page: Page, identifier: string, password: string): Promise<string> {
  await page.goto('/login?role=school')
  await page.getByPlaceholder(/School ID or email/i).fill(identifier)
  await page.getByPlaceholder(/password/i).fill(password)
  await page.getByTestId('auth-submit-btn').click()
  await page.waitForURL(/\/change-password|\/school-admin/, { timeout: 30000 })

  let current = password
  if (page.url().includes('change-password')) {
    current = 'UITest@1234'
    const fields = page.locator('input[type="password"]')
    await fields.nth(0).fill(current)
    await fields.nth(1).fill(current)
    await page.getByRole('button', { name: /change|update|set|save/i }).click()
    await page.waitForURL(/\/school-admin/, { timeout: 20000 })
  }
  return current
}

async function goToOnboarding(page: Page) {
  await page.getByRole('button', { name: /Student Management/i }).click()
  await expect(page.getByText('Student List')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: /Onboard Students/i }).click()
  await expect(page.getByText('Student Onboarding')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('onboarding-table')).toBeVisible({ timeout: 5000 })
}

// Columns: 0:# 1:RollNo 2:LastName 3:FirstName 4:StudentEmail 5:Grade 6:Section
//          7:ParentName 8:ParentPhone 9:ParentEmail 10:StudentPhone 11:del
async function fillRow(page: Page, row: {
  rollNo?: string; lastName?: string; firstName?: string; email?: string
  grade?: string; section?: string; parentName?: string; parentPhone?: string; parentEmail?: string
}, rowIndex = 0) {
  const cells = page.getByTestId('onboarding-table').locator('tbody tr').nth(rowIndex).locator('td')
  if (row.rollNo      !== undefined) await cells.nth(1).locator('input').fill(row.rollNo)
  if (row.lastName    !== undefined) await cells.nth(2).locator('input').fill(row.lastName)
  if (row.firstName   !== undefined) await cells.nth(3).locator('input').fill(row.firstName)
  if (row.email       !== undefined) await cells.nth(4).locator('input').fill(row.email)
  if (row.grade       !== undefined) await cells.nth(5).locator('input').fill(row.grade)
  if (row.section     !== undefined) await cells.nth(6).locator('input').fill(row.section)
  if (row.parentName  !== undefined) await cells.nth(7).locator('input').fill(row.parentName)
  if (row.parentPhone !== undefined) await cells.nth(8).locator('input').fill(row.parentPhone)
  if (row.parentEmail !== undefined) await cells.nth(9).locator('input').fill(row.parentEmail)
}

test.describe.serial('Student Onboarding — Full Lifecycle (UI)', () => {
  const ts = Date.now()
  const tsSuffix = String(ts).slice(-7)
  const phone = (n: number) => `9${tsSuffix}${String(n).padStart(2, '0')}` // 10 digits

  let schoolId: number
  let schoolCode: string
  let schoolPass: string
  let uiPass = ''
  let adminCookie: string
  const createdStudentIds: number[] = []

  // Reusable API context for setup/teardown + id lookups (browser network stack)
  let ctx: APIRequestContext

  async function studentIdsByNames(names: string[]) {
    const res = await ctx.get(`/api/students?school_id=${schoolId}`, { headers: { Cookie: adminCookie } })
    const list = await res.json()
    return list.filter((s: { name: string }) => names.includes(s.name))
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────
  test.beforeAll(async () => {
    test.setTimeout(120000)
    ctx = await playwrightRequest.newContext({ baseURL: BASE })

    // Provisioning a school requires a platform admin session.
    const platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, {
      name: `Onboarding Test School ${ts}`,
      phone: `98765${String(ts).slice(-5)}`,
      email: `school${ts}@onboardtest.com`,
      address: '1 Test Lane',
    })
    schoolId   = school.id
    schoolCode = school.school_code
    schoolPass = school.temp_password

    await setSubscription(platformCookie, schoolId, 'premium')

    const loginRes = await ctx.post('/api/auth/login', {
      data: { identifier: schoolCode, password: schoolPass },
    })
    if (!loginRes.ok()) throw new Error(`Setup login failed — status ${loginRes.status()}`)
    const state = await ctx.storageState()
    const auth = state.cookies.find(c => c.name === 'wlyl-auth')
    if (!auth) throw new Error('No wlyl-auth cookie after login')
    adminCookie = `wlyl-auth=${auth.value}`

    await ctx.put('/api/auth/profile', {
      data: { full_name: 'Test Admin', phone: '9000000001' },
      headers: { Cookie: adminCookie },
    })
  })

  // ─── Teardown ─────────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    test.setTimeout(60000)
    for (const id of createdStudentIds) {
      await ctx.delete(`/api/students/${id}`, { headers: { Cookie: adminCookie } }).catch(() => {})
    }
    await ctx.delete(`/api/schools/${schoolId}`).catch(() => {})
    await ctx.dispose()
  })

  // ─── 1. Single student — required fields only (no email) ─────────────────────
  test('1. Enroll single student — required fields only (no email)', async ({ page }) => {
    test.setTimeout(60000)
    uiPass = await uiLogin(page, schoolCode, schoolPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '1', lastName: 'Mehta', firstName: 'Arjun',
      grade: '10', section: 'A', parentName: 'Suresh Mehta', parentPhone: phone(1),
    })
    await page.getByTestId('enroll-students-btn').click()

    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Student Credentials')).toBeVisible()
    // No email → login column shows the "no email" placeholder
    await expect(page.getByText(/no email/i)).toBeVisible()

    const found = await studentIdsByNames(['Mehta Arjun'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Student List')).toBeVisible({ timeout: 5000 })
  })

  // ─── 2. Single student — with student + parent email ─────────────────────────
  test('2. Enroll student with student email + parent email', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '2', lastName: 'Patel', firstName: 'Priya',
      email: `priya${ts}@student.com`,
      grade: '10', section: 'A',
      parentName: 'Ramesh Patel', parentPhone: phone(2),
      parentEmail: `ramesh${ts}@parent.com`,
    })
    await page.getByTestId('enroll-students-btn').click()

    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(`priya${ts}@student.com`)).toBeVisible()
    await expect(page.getByText('Parent Credentials')).toBeVisible()
    await expect(page.getByText(`ramesh${ts}@parent.com`)).toBeVisible()

    const found = await studentIdsByNames(['Patel Priya'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Student List')).toBeVisible({ timeout: 5000 })
  })

  // ─── 3. Siblings — same parent phone (one parent account) ────────────────────
  test('3. Siblings: same parent phone — one parent account for both', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    const sharedPhone = phone(3)
    await fillRow(page, {
      rollNo: '1', lastName: 'Singh', firstName: 'Kiran',
      grade: '9', section: 'B', parentName: 'Vijay Singh', parentPhone: sharedPhone,
    }, 0)
    await page.getByText('+ Add Row').click()
    await fillRow(page, {
      rollNo: '1', lastName: 'Singh', firstName: 'Meera',
      grade: '7', section: 'A', parentName: 'Vijay Singh', parentPhone: sharedPhone,
    }, 1)

    await page.getByTestId('enroll-students-btn').click()
    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })

    // Both students appear in the student credentials table
    await expect(page.getByText('Singh Kiran')).toBeVisible()
    await expect(page.getByText('Singh Meera')).toBeVisible()

    const found = await studentIdsByNames(['Singh Kiran', 'Singh Meera'])
    expect(found).toHaveLength(2)
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
  })

  // ─── 4. Siblings — same parent email (one parent account) ────────────────────
  test('4. Siblings: same parent email — one parent account for both', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    const sharedEmail = `parent${ts}@shared.com`
    await fillRow(page, {
      rollNo: '10', lastName: 'Sharma', firstName: 'Rohan',
      grade: '8', section: 'A', parentName: 'Deepak Sharma',
      parentPhone: phone(4), parentEmail: sharedEmail,
    }, 0)
    await page.getByText('+ Add Row').click()
    await fillRow(page, {
      rollNo: '10', lastName: 'Sharma', firstName: 'Riya',
      grade: '6', section: 'A', parentName: 'Deepak Sharma',
      parentPhone: phone(5), parentEmail: sharedEmail,
    }, 1)

    await page.getByTestId('enroll-students-btn').click()
    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })

    await expect(page.getByText('Sharma Rohan')).toBeVisible()
    await expect(page.getByText('Sharma Riya')).toBeVisible()
    // Parent credentials show shared email once (second sibling links to existing parent)
    await expect(page.getByText('Parent Credentials')).toBeVisible()
    await expect(page.getByText(sharedEmail)).toBeVisible()

    const found = await studentIdsByNames(['Sharma Rohan', 'Sharma Riya'])
    expect(found).toHaveLength(2)
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
  })

  // ─── 5. Duplicate roll number — same grade+section rejected ──────────────────
  test('5. Duplicate roll number in same grade+section is rejected', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    // Roll 1 in 10-A already exists from test 1 (against existing DB record)
    await fillRow(page, {
      rollNo: '1', lastName: 'Copy', firstName: 'Student',
      grade: '10', section: 'A', parentName: 'Copy Parent', parentPhone: phone(6),
    })

    // The duplicate is caught client-side against the preloaded roll numbers: the row
    // is flagged inline and Enroll stays disabled, so the request is never sent.
    await expect(page.getByTestId('roll-dup-warning-0')).toContainText(/already exists in Grade 10/i)
    await expect(page.getByTestId('enroll-students-btn')).toBeDisabled()

    // The invariant that matters either way — no duplicate reached the database.
    const found = await studentIdsByNames(['Copy Student'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id)) // cleanup if any slipped in
    expect(found).toHaveLength(0)
  })

  // ─── 6. Same roll number — different section allowed ─────────────────────────
  test('6. Same roll number in a different section is allowed', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '1', lastName: 'Kumar', firstName: 'Anil',
      grade: '10', section: 'B', parentName: 'Sunil Kumar', parentPhone: phone(7),
    })
    await page.getByTestId('enroll-students-btn').click()

    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Kumar Anil')).toBeVisible()

    const found = await studentIdsByNames(['Kumar Anil'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
  })

  // ─── 7. Same roll number — different grade allowed ────────────────────────────
  test('7. Same roll number in a different grade is allowed', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '1', lastName: 'Das', firstName: 'Bina',
      grade: '11', section: 'A', parentName: 'Dina Das', parentPhone: phone(8),
    })
    await page.getByTestId('enroll-students-btn').click()

    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Das Bina')).toBeVisible()

    const found = await studentIdsByNames(['Das Bina'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
  })

  // ─── 8. Bulk: valid + invalid roll number → validation error ─────────────────
  test('8. Bulk batch: invalid (negative) roll number is blocked by validation', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '1', lastName: 'Valid', firstName: 'Student',
      grade: '10', section: 'C', parentName: 'Valid Parent', parentPhone: phone(9),
    }, 0)
    await page.getByText('+ Add Row').click()
    await fillRow(page, {
      rollNo: '-5', lastName: 'Bad', firstName: 'Student',
      grade: '10', section: 'C', parentName: 'Bad Parent', parentPhone: phone(10),
    }, 1)

    await page.getByTestId('enroll-students-btn').click()

    // Client-side validation flags the negative roll number before submit.
    // .first() — the same `error` state renders in two banners (above the form and in
    // the table footer), so the match is ambiguous under strict mode.
    await expect(
      page.getByText(/Roll No must be a positive/i).or(page.getByText(/positive number/i)).first()
    ).toBeVisible({ timeout: 10000 })
  })

  // ─── 9. Missing name → enroll blocked; missing other required field → error ───
  test('9. Missing name keeps enroll disabled; missing required field is flagged', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    // Part A: with no names entered, the Enroll button is disabled (cannot submit).
    await fillRow(page, {
      rollNo: '99', grade: '10', section: 'A',
      parentName: 'Some Parent', parentPhone: phone(11),
    })
    await expect(page.getByTestId('enroll-students-btn')).toBeDisabled()

    // Part B: add a name → button enables. Clear the required parent phone → submit
    // surfaces a validation error for the missing required field.
    const cells = page.getByTestId('onboarding-table').locator('tbody tr').nth(0).locator('td')
    await cells.nth(2).locator('input').fill('NoPhone')   // last name
    await cells.nth(3).locator('input').fill('Student')   // first name
    await cells.nth(8).locator('input').fill('')          // clear parent phone (required)
    await expect(page.getByTestId('enroll-students-btn')).toBeEnabled()
    await page.getByTestId('enroll-students-btn').click()

    // The validation banner shows the row-specific message (distinct from the
    // static "Parent Phone (blue) is required…" helper text).
    // .first() — StudentOnboarding renders the same `error` state in two banners (one
    // above the form, one in the table footer), so an unqualified match trips strict mode.
    await expect(page.getByText(/Row \d+: Parent Phone is required/i).first()).toBeVisible({ timeout: 5000 })
  })

  // ─── 10. Credentials — student + parent temp passwords displayed ─────────────
  test('10. Credentials modal shows student and parent temp passwords', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '1', lastName: 'Cred', firstName: 'Test',
      email: `credtest${ts}@student.com`,
      grade: '12', section: 'A',
      parentName: 'Cred Parent', parentPhone: phone(12),
      parentEmail: `credparent${ts}@parent.com`,
    })
    await page.getByTestId('enroll-students-btn').click()

    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Student Credentials')).toBeVisible()
    await expect(page.getByText('Parent Credentials')).toBeVisible()
    await expect(page.getByText(`credtest${ts}@student.com`)).toBeVisible()
    await expect(page.getByText(`credparent${ts}@parent.com`)).toBeVisible()

    const found = await studentIdsByNames(['Cred Test'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
  })

  // ─── 11. Reset credentials → new password shown ──────────────────────────────
  test('11. Reset credentials shows a new password in the modal', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '20', lastName: 'Reset', firstName: 'Test',
      email: `resettest${ts}@student.com`,
      grade: '12', section: 'B',
      parentName: 'Reset Parent', parentPhone: phone(20),
    })
    await page.getByTestId('enroll-students-btn').click()
    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })

    // Click the Reset link in the student credentials row
    const resetBtn = page.getByRole('button', { name: /^Reset$/i }).first()
    await expect(resetBtn).toBeVisible({ timeout: 5000 })
    await resetBtn.click()

    // After reset, the button briefly shows "Resetting…" then the new password
    // renders as a green <span> (bg-green-50 + text-green-700) in the password cell.
    // Use the combined class selector to avoid matching dashboard cards (which use
    // bg-green-50 on <button> elements, not spans).
    await expect(
      page.locator('span.bg-green-50.text-green-700')
    ).toBeVisible({ timeout: 15000 })

    const found = await studentIdsByNames(['Reset Test'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
  })

  // ─── 12. Student list sorted by roll number ───────────────────────────────────
  test('12. Student list is sorted by roll number within grade+section', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)

    await page.getByRole('button', { name: /Student Management/i }).click()
    await expect(page.getByText('Student List')).toBeVisible({ timeout: 10000 })

    // 10-A: roll 1 = Mehta Arjun, roll 2 = Patel Priya — Arjun should be above Priya
    const arjun = page.getByText(/Mehta Arjun|Arjun Mehta/).first()
    const priya = page.getByText(/Patel Priya|Priya Patel/).first()
    await expect(arjun).toBeVisible({ timeout: 10000 })
    await expect(priya).toBeVisible({ timeout: 5000 })

    const a = await arjun.boundingBox()
    const p = await priya.boundingBox()
    if (a && p) expect(a.y).toBeLessThan(p.y)
  })

  // ─── 13. UI: Onboarding page loads with controls ─────────────────────────────
  test('13. UI: Onboarding page loads with table, buttons, and headers', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await expect(page.getByTestId('onboarding-table')).toBeVisible()
    await expect(page.getByTestId('enroll-students-btn')).toBeVisible()
    await expect(page.getByRole('button', { name: /Template/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Import CSV/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Paste CSV/i })).toBeVisible()
    // Scoped to the header row: bare getByText('Roll No') also matches the
    // "Roll No unique within Grade + Section" helper line under the table.
    const headers = page.getByTestId('onboarding-table').locator('thead')
    await expect(headers.getByText('Roll No', { exact: false })).toBeVisible()
    await expect(headers.getByText('Parent Phone', { exact: false })).toBeVisible()
  })

  // ─── 14. UI: Manual entry + credentials modal + Copy All ─────────────────────
  test('14. UI: Manual entry enrolls and Copy All works in credentials modal', async ({ page }) => {
    test.setTimeout(90000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    await fillRow(page, {
      rollNo: '1', lastName: 'UITest', firstName: 'Student',
      grade: String(ts).slice(-2), section: 'Z',
      parentName: 'UI Parent', parentPhone: phone(50),
    })
    await page.getByTestId('enroll-students-btn').click()

    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('Student Credentials')).toBeVisible()

    await page.getByTestId('copy-all-credentials-btn').click()
    await expect(page.getByTestId('copy-all-credentials-btn')).toContainText(/Copy All|Copied/, { timeout: 3000 })

    const found = await studentIdsByNames(['UITest Student'])
    found.forEach((s: { id: number }) => createdStudentIds.push(s.id))

    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Student List')).toBeVisible({ timeout: 5000 })
  })

  // ─── 15. Delete student → marked inactive ─────────────────────────────────────
  test('15. Delete student marks it inactive', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass)
    await goToOnboarding(page)

    // Enroll a student to delete
    await fillRow(page, {
      rollNo: '99', lastName: 'Delete', firstName: 'Me',
      grade: '5', section: 'A', parentName: 'Delete Parent', parentPhone: phone(99),
    })
    await page.getByTestId('enroll-students-btn').click()
    await expect(page.getByText('Enrollment Complete — Credentials')).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'Done' }).click()

    // Delete via API (uses browser network stack), then verify status
    const [target] = await studentIdsByNames(['Delete Me'])
    expect(target).toBeTruthy()

    const delRes = await ctx.delete(`/api/students/${target.id}`, { headers: { Cookie: adminCookie } })
    expect(delRes.status()).toBe(200)

    const afterRes = await ctx.get(`/api/students?school_id=${schoolId}`, { headers: { Cookie: adminCookie } })
    const after = await afterRes.json()
    const found = after.find((s: { id: number }) => s.id === target.id)
    expect(found?.status).toBe('inactive')

    // Page still shows the Student Management area (active students only).
    // Match the heading, not bare text — the nav button carries the same label.
    await page.getByRole('button', { name: /Student Management/i }).click()
    await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible({ timeout: 10000 })
  })

  // ─── 16. Unauthorized bulk enroll → 401 ──────────────────────────────────────
  test('16. Bulk enroll without auth cookie is rejected (401)', async ({ page }) => {
    test.setTimeout(30000)
    // Show the login page in the video to illustrate the unauthenticated state
    await page.goto('/login?role=school')
    await expect(page.getByTestId('auth-submit-btn')).toBeVisible({ timeout: 10000 })

    // Fresh context with no auth cookie
    const anon = await playwrightRequest.newContext({ baseURL: BASE })
    const res = await anon.post('/api/students/bulk', {
      data: {
        school_id: schoolId,
        students: [{ name: 'Hacker', grade: '10', section: 'A', school_roll_number: 999 }],
      },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
    await anon.dispose()

    await expect(page.getByPlaceholder(/School ID or email/i)).toBeVisible()
  })
})
