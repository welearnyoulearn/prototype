import { test, expect, Page, request as playwrightRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// End-to-end coverage for the CSV *file upload* import path on Student Onboarding —
// distinct from the manual-row-entry flow already covered by
// workflow-student-onboarding.spec.ts. Nothing in the existing suite drives an
// actual file through the hidden <input type="file">, so this is the first test
// to exercise Import CSV → parsed preview table → submit end to end.

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

function uploadCsv(page: Page, contents: string, name = 'students.csv') {
  return page.getByTestId('student-import-file-input').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(contents, 'utf-8'),
  })
}

test.describe.serial('Student Onboarding — CSV File Import (UI)', () => {
  const ts = Date.now()
  const tsSuffix = String(ts).slice(-7)
  const phone = (n: number) => `9${tsSuffix}${String(n).padStart(2, '0')}` // 10 digits

  let schoolId: number
  let schoolCode: string
  let schoolPass: string
  let uiPass = ''
  let adminCookie: string
  const createdStudentIds: number[] = []
  let ctx: APIRequestContext

  test.beforeAll(async () => {
    test.setTimeout(120000)
    ctx = await playwrightRequest.newContext({ baseURL: BASE })

    const platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, {
      name: `CSV Import Test School ${ts}`,
      phone: `98764${String(ts).slice(-5)}`,
      email: `csvimport${ts}@onboardtest.com`,
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
      data: { full_name: 'Test Admin', phone: '9000000002' },
      headers: { Cookie: adminCookie },
    })
  })

  test.afterAll(async () => {
    test.setTimeout(60000)
    for (const id of createdStudentIds) {
      await ctx.delete(`/api/students/${id}`, { headers: { Cookie: adminCookie } }).catch(() => {})
    }
    await ctx.delete(`/api/schools/${schoolId}`).catch(() => {})
    await ctx.dispose()
  })

  // ─── 1. Happy path: upload → parsed preview → submit → credentials ──────────
  test('1. Uploading a CSV file populates the row grid and enrolls the students', async ({ page }) => {
    test.setTimeout(60000)
    uiPass = await uiLogin(page, schoolCode, schoolPass)
    await goToOnboarding(page)

    const csv = [
      'roll_no,last_name,first_name,email,grade,section,parent_name,parent_phone,parent_email,phone',
      `1,Rao,${`Ananya${tsSuffix}`},,10,A,Suresh Rao,${phone(1)},,`,
      `2,Iyer,${`Kabir${tsSuffix}`},,10,A,Meena Iyer,${phone(2)},,`,
    ].join('\n')

    await uploadCsv(page, csv)

    // File import always lands the parsed rows back in manual/grid mode, not
    // the raw-paste CSV mode — this is the assertion that the file actually
    // got parsed rather than silently no-op'ing.
    const table = page.getByTestId('onboarding-table')
    await expect(table.locator('tbody tr')).toHaveCount(2)
    await expect(table.locator('tbody tr').nth(0).locator('td').nth(2).locator('input')).toHaveValue('Rao')
    await expect(table.locator('tbody tr').nth(0).locator('td').nth(3).locator('input')).toHaveValue(`Ananya${tsSuffix}`)
    await expect(table.locator('tbody tr').nth(1).locator('td').nth(2).locator('input')).toHaveValue('Iyer')

    await page.getByTestId('enroll-students-btn').click()
    await expect(page.getByTestId('copy-all-credentials-btn')).toBeVisible({ timeout: 15000 })

    const created = await studentIdsByNames([`Rao Ananya${tsSuffix}`, `Iyer Kabir${tsSuffix}`])
    expect(created.length).toBe(2)
    createdStudentIds.push(...created.map((s: { id: number }) => s.id))
  })

  // ─── 2. Guard: a Staff CSV uploaded here is rejected, not silently mis-imported ──
  test('2. Uploading a Staff CSV into Student Onboarding is rejected with a warning', async ({ page }) => {
    test.setTimeout(60000)
    await uiLogin(page, schoolCode, uiPass || schoolPass)
    await goToOnboarding(page)

    const staffCsv = [
      'last_name,first_name,email,department,qualification,staff_type,subject,employee_id,teaches_grades',
      'Kumar,Anil,anil@staff.com,Science,M.Sc,teaching,Physics,EMP001,10;11',
    ].join('\n')

    await uploadCsv(page, staffCsv, 'staff.csv')
    await expect(page.getByText(/looks like a Staff CSV/i)).toBeVisible({ timeout: 5000 })

    // Rejected file must not silently populate the student grid with staff columns.
    const table = page.getByTestId('onboarding-table')
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.locator('tbody tr').nth(0).locator('td').nth(2).locator('input')).toHaveValue('')
  })

  async function studentIdsByNames(names: string[]) {
    const res = await ctx.get(`/api/students?school_id=${schoolId}`, { headers: { Cookie: adminCookie } })
    const list = await res.json()
    return list.filter((s: { name: string }) => names.includes(s.name))
  }
})
