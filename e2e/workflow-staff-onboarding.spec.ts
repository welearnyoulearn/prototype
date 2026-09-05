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
    // Change-password → /school-admin also compiles that route cold in dev
    // mode (webpack) on the very first hit of this run — same class of delay
    // as the sidebar settle below, just one step earlier in first-login flow.
    await page.waitForURL(/\/school-admin/, { timeout: 60000 })
  }
  // Sidebar nav items (including "Staff Management") only render once the
  // school's enabled-feature flags have loaded — an async fetch that lands
  // after the URL itself changes, behind a "Loading your dashboard…" splash.
  // networkidle is unreliable here (Next.js dev mode keeps background network
  // activity going), so wait for a nav item that's guaranteed to always be
  // present (Overview) as the concrete signal the sidebar has actually
  // painted. Generous timeout — dev-mode (webpack) cold compiles of this
  // route have been observed taking well over 30s under load.
  await page.getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible', timeout: 60000 })
  return current
}

// Supabase's PgBouncer session-mode pool was capped at the Nano-tier default
// of 15, shared with the platform's own baseline services — under any real
// query burst (school/admin provisioning immediately followed by the
// Overview dashboard's parallel fan-out, then a bulk insert on top) that was
// too small and every submit failed with EMAXCONNSESSION. Raised to 35 in
// the Supabase dashboard (Project Settings → Database → Connection Pooling),
// which cleared it — confirmed no EMAXCONNSESSION errors since. A
// retry-the-click loop was tried as a workaround before the real fix and
// made things worse (the button stays disabled mid-request, so re-clicking
// too early just hangs waiting for it to re-enable) — removed now that the
// underlying cause is fixed. One click, one wait.
async function submitAndExpect(page: Page, testId: string, successPattern: RegExp) {
  await page.getByTestId(testId).click()
  await expect(page.getByText(successPattern)).toBeVisible({ timeout: 30000 })
}

async function goToStaffOnboarding(page: Page) {
  // Right after uiLogin() returns, the URL is already /school-admin but the
  // dashboard shell (sidebar nav) can still be hydrating — the default 15s
  // actionability wait on the click itself isn't always enough on a cold
  // load, so wait for the button to actually exist first.
  await expect(page.getByRole('button', { name: /Staff Management/i })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: /Staff Management/i }).click()
  await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Onboard Staff' }).click()
  // StaffOnboarding is a next/dynamic lazy-loaded chunk (see school-admin/page.tsx)
  // — its first mount fetches the chunk plus /api/school/subjects and
  // /api/platform/subjects, which can be slow under DB pool contention. 10s
  // wasn't enough and left the page on its loading skeleton.
  await expect(page.getByRole('heading', { name: 'Staff Onboarding' })).toBeVisible({ timeout: 30000 })
}

async function goToStaffDirectory(page: Page) {
  await expect(page.getByRole('button', { name: /Staff Management/i })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: /Staff Management/i }).click()
  await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Staff Directory' }).click()
  // TeachersManagement no longer has an internal Directory/Credentials
  // toggle (removed along with the manual reset UI) — the staff-type tabs
  // are the first thing it renders, so they're the waypoint now.
  await expect(page.getByTestId('staff-type-tab-teaching')).toBeVisible({ timeout: 30000 })
}

// Columns rendered by StaffOnboarding.tsx's manual grid, row i.
async function fillStaffRow(page: Page, row: {
  name?: string; email?: string; subject?: string; phone?: string
  department?: string; qualification?: string
}, rowIndex = 0) {
  // The name/email inputs must actually be attached and empty before typing
  // into them — a stale/mid-transition render (e.g. right after navigating
  // in) can otherwise silently no-op a .fill() on a row that hasn't mounted
  // its real, interactive state yet.
  if (rowIndex === 0) await expect(page.getByTestId('staff-row-name-0')).toHaveValue('', { timeout: 10000 })
  if (row.name       !== undefined) {
    await page.getByTestId(`staff-row-name-${rowIndex}`).fill(row.name)
    await expect(page.getByTestId(`staff-row-name-${rowIndex}`)).toHaveValue(row.name)
  }
  if (row.email      !== undefined) {
    await page.getByTestId(`staff-row-email-${rowIndex}`).fill(row.email)
    await expect(page.getByTestId(`staff-row-email-${rowIndex}`)).toHaveValue(row.email)
  }
  if (row.phone      !== undefined) {
    const cells = page.locator('table tbody tr').nth(rowIndex).locator('td')
    await cells.nth(4).locator('input').fill(row.phone)
  }
  if (row.department !== undefined) {
    const cells = page.locator('table tbody tr').nth(rowIndex).locator('td')
    await cells.nth(5).locator('input').fill(row.department)
  }
  if (row.qualification !== undefined) {
    const cells = page.locator('table tbody tr').nth(rowIndex).locator('td')
    await cells.nth(6).locator('input').fill(row.qualification)
  }
  if (row.subject !== undefined) {
    // Subject cell is either a <select> (subscribed subjects present) or an
    // <input> (free text). School creation on the premium tier appears to
    // auto-provision a subscribed subject list, so this can be either —
    // handle both rather than assuming free text.
    const cells = page.locator('table tbody tr').nth(rowIndex).locator('td').nth(3)
    const input = cells.locator('input')
    if (await input.count() > 0) await input.fill(row.subject)
    else await cells.locator('select').selectOption({ label: row.subject })
  }
}

test.describe.serial('Staff Onboarding — Full Lifecycle (UI)', () => {
  const ts = Date.now()
  const tsSuffix = String(ts).slice(-7)
  const phone = (n: number) => `8${tsSuffix}${String(n).padStart(2, '0')}` // 10 digits, distinct range from student spec's 9-prefix

  let schoolId: number
  let schoolCode: string
  let schoolPass: string
  let uiPass = ''
  let adminCookie: string

  let ctx: APIRequestContext

  async function teachersByNames(names: string[]) {
    const res = await ctx.get(`/api/teachers?school_id=${schoolId}`, { headers: { Cookie: adminCookie } })
    const list = await res.json()
    return list.filter((t: { name: string }) => names.includes(t.name))
  }

  test.beforeAll(async () => {
    test.setTimeout(120000)
    ctx = await playwrightRequest.newContext({ baseURL: BASE })

    const platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, {
      name: `Staff Onboarding Test School ${ts}`,
      phone: `98764${String(ts).slice(-5)}`,
      email: `staffschool${ts}@onboardtest.com`,
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
    test.setTimeout(240000)
    await ctx.delete(`/api/schools/${schoolId}`).catch(() => {})
    await ctx.dispose()
  })

  // ─── 1. Single staff member — required fields only ────────────────────────
  test('1. Onboard single teacher — required fields only', async ({ page }) => {
    test.setTimeout(240000)
    uiPass = await uiLogin(page, schoolCode, schoolPass)
    await goToStaffOnboarding(page)

    await fillStaffRow(page, {
      name: 'Priya Sharma', email: `priya${ts}@staffschool.com`, subject: 'Mathematics',
    })
    await submitAndExpect(page, 'staff-onboard-submit', /staff member.*onboarded/i)
    // The success banner (and the new employee ID) must stay visible until
    // the admin dismisses it, not vanish the instant it appears — see the
    // fix in StaffOnboarding.tsx/page.tsx moving onRefresh (which switches
    // the visible sub-tab) off handleSubmit and onto this Dismiss click.
    await expect(page.getByText(/First ID:/)).toBeVisible()
    await page.getByTestId('staff-onboard-dismiss-result').click()
    // First navigation to the Directory sub-tab compiles the TeachersManagement
    // lazy chunk in dev mode (visible as "Compiling…" in the corner) — slower
    // than a normal render, same class of delay as goToStaffOnboarding's chunk.
    await expect(page.getByTestId('staff-type-tab-teaching')).toBeVisible({ timeout: 30000 })

    const found = await teachersByNames(['Priya Sharma'])
    expect(found).toHaveLength(1)
    expect(found[0].employee_id).toBeTruthy()
    expect(found[0].staff_type).toBe('teaching')
  })

  // ─── 2. Non-teaching staff — subject not required ─────────────────────────
  test('2. Onboard non-teaching staff — subject not required', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    await fillStaffRow(page, { name: 'Suresh Patel', email: `suresh${ts}@staffschool.com` }, 0)
    const staffTypeSelect = page.locator('table tbody tr').nth(0).locator('td').nth(8).locator('select')
    await staffTypeSelect.selectOption('non_teaching')
    await submitAndExpect(page, 'staff-onboard-submit', /staff member.*onboarded/i)

    const found = await teachersByNames(['Suresh Patel'])
    expect(found).toHaveLength(1)
    expect(found[0].staff_type).toBe('non_teaching')
    expect(found[0].subject).toBeFalsy()
  })

  // ─── 3. Multiple rows in one submission ───────────────────────────────────
  test('3. Onboard multiple staff in one submission', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    await fillStaffRow(page, { name: 'Raj Kumar', email: `raj${ts}@staffschool.com`, subject: 'Physics' }, 0)
    await page.getByTestId('staff-add-row').click()
    await fillStaffRow(page, { name: 'Anita Nair', email: `anita${ts}@staffschool.com`, subject: 'Chemistry' }, 1)

    await submitAndExpect(page, 'staff-onboard-submit', /2 staff members onboarded/i)

    const found = await teachersByNames(['Raj Kumar', 'Anita Nair'])
    expect(found).toHaveLength(2)
  })

  // ─── 4. Client-side validation — missing name blocks submit ───────────────
  test('4. Missing name is blocked before submit', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    // Fill everything except name, submit anyway — the row is silently
    // excluded (StaffOnboarding filters rows.filter(r => r.name.trim())
    // before validating), so with only this one nameless row the "at least
    // one staff member with a name" error fires.
    await fillStaffRow(page, { email: `noname${ts}@staffschool.com`, subject: 'Biology' })
    await page.getByTestId('staff-onboard-submit').click()

    await expect(page.getByText(/at least one staff member with a name is required/i)).toBeVisible({ timeout: 5000 })

    const found = await teachersByNames(['']) // sanity: nothing with an empty name should ever exist
    expect(found).toHaveLength(0)
  })

  // ─── 5. Client-side validation — invalid email format ─────────────────────
  test('5. Invalid email format is blocked before submit', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    await fillStaffRow(page, { name: 'Bad Email Test', email: 'not-an-email', subject: 'History' })
    await page.getByTestId('staff-onboard-submit').click()

    await expect(page.getByText(/invalid email/i)).toBeVisible({ timeout: 5000 })

    const found = await teachersByNames(['Bad Email Test'])
    expect(found).toHaveLength(0)
  })

  // ─── 6. Client-side validation — teaching staff missing subject ───────────
  test('6. Teaching staff without a subject is blocked before submit', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    await fillStaffRow(page, { name: 'No Subject Test', email: `nosubject${ts}@staffschool.com` })
    await page.getByTestId('staff-onboard-submit').click()

    await expect(page.getByText(/subject required for teaching staff/i)).toBeVisible({ timeout: 5000 })

    const found = await teachersByNames(['No Subject Test'])
    expect(found).toHaveLength(0)
  })

  // ─── 7. Duplicate email within the same batch is rejected per-row ─────────
  test('7. Duplicate email within the same upload batch is rejected', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    const dupEmail = `batchdup${ts}@staffschool.com`
    await fillStaffRow(page, { name: 'Batch Dup One', email: dupEmail, subject: 'Geography' }, 0)
    await page.getByTestId('staff-add-row').click()
    await fillStaffRow(page, { name: 'Batch Dup Two', email: dupEmail, subject: 'Geography' }, 1)

    // Partial success: first row inserted, second row rejected as an
    // in-batch duplicate — result banner shows both the success count and
    // the per-row error.
    await submitAndExpect(page, 'staff-onboard-submit', /1 staff member.*onboarded/i)
    await expect(page.getByText(/duplicated earlier in this same upload/i)).toBeVisible()

    const found = await teachersByNames(['Batch Dup One', 'Batch Dup Two'])
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('Batch Dup One')
  })

  // ─── 8. Failed rows are retained in the grid for correction ───────────────
  test('8. Failed row stays in the grid after partial-success submit', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    // Row 0 succeeds; row 1 reuses an email already onboarded in test 1
    // (cross-batch duplicate, checked server-side against the DB).
    await fillStaffRow(page, { name: 'Retain Success', email: `retainok${ts}@staffschool.com`, subject: 'Art' }, 0)
    await page.getByTestId('staff-add-row').click()
    await fillStaffRow(page, { name: 'Retain Fail', email: `priya${ts}@staffschool.com`, subject: 'Art' }, 1)

    await submitAndExpect(page, 'staff-onboard-submit', /1 staff member.*onboarded/i)
    await expect(page.getByText(/already registered/i)).toBeVisible()

    // The failed row's data should still be sitting in the grid — not wiped.
    await expect(page.getByTestId('staff-row-name-0')).toHaveValue('Retain Fail')
    await expect(page.getByTestId('staff-row-email-0')).toHaveValue(`priya${ts}@staffschool.com`)

    const found = await teachersByNames(['Retain Success', 'Retain Fail'])
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('Retain Success')
  })

  // ─── 9. Cross-school email conflict shows the owning school in the error ──
  test('9. Duplicate email already active at another school is rejected with school name', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    // priya@... was onboarded to THIS school in test 1 — reusing it here
    // (same school) already exercises the duplicate path; the platform-wide
    // rule is exercised for real in staff-teacher-data-flow.spec.ts against a
    // second school. This test only confirms the message includes a school
    // attribution, which the same-school path also produces via the DB dup
    // check (school_name is always joined in).
    await fillStaffRow(page, { name: 'Cross Dup', email: `priya${ts}@staffschool.com`, subject: 'Art' })
    await submitAndExpect(page, 'staff-onboard-submit', new RegExp(`already registered to Priya Sharma at .*Staff Onboarding Test School ${ts}`, 'i'))
  })

  // ─── 10. Staff Directory shows onboarded staff, filterable by type ────────
  test('10. Staff Directory lists onboarded staff and filters by type', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffDirectory(page)

    await expect(page.getByText('Priya Sharma')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('staff-type-tab-non_teaching').click()
    await expect(page.getByText('Suresh Patel')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Priya Sharma')).not.toBeVisible()
  })

  // ─── 11. Search by name/employee ID ────────────────────────────────────────
  test('11. Staff Directory search filters by name', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffDirectory(page)

    await page.getByTestId('staff-search-input').fill('Raj Kumar')
    await expect(page.getByText('Raj Kumar')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Anita Nair')).not.toBeVisible()
  })

  // ─── 12. Edit a staff member's details ─────────────────────────────────────
  test('12. Edit staff details updates the record', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffDirectory(page)

    await page.getByTestId('staff-search-input').fill('Raj Kumar')
    await page.getByText('Raj Kumar').click()
    await page.getByTestId('staff-edit-details').click()

    const deptInput = page.locator('input[placeholder="e.g. Science"]')
    await deptInput.fill('Science Department')
    await page.getByTestId('staff-save-edit').click()

    await expect(page.getByTestId('staff-edit-details')).toBeVisible({ timeout: 10000 })

    const found = await teachersByNames(['Raj Kumar'])
    expect(found[0].department).toBe('Science Department')
  })

  // ─── 13. Deactivate then reactivate ────────────────────────────────────────
  test('13. Deactivate and reactivate a staff member', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffDirectory(page)

    await page.getByTestId('staff-search-input').fill('Anita Nair')
    await page.getByText('Anita Nair').click()
    await page.getByTestId('staff-toggle-status').click()

    let found = await teachersByNames(['Anita Nair'])
    expect(found[0].status).toBe('inactive')

    // Reopen — reactivate
    await page.getByTestId('staff-toggle-status').click()
    found = await teachersByNames(['Anita Nair'])
    expect(found[0].status).toBe('active')
  })

  // ─── 14. Remove a staff member (soft-delete) ───────────────────────────────
  test('14. Remove staff member marks them removed, not hard-deleted', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffDirectory(page)

    await page.getByTestId('staff-search-input').fill('Anita Nair')
    await page.getByText('Anita Nair').click()
    await page.getByTestId('staff-remove').click()

    await expect(page.getByText(/No active assignments found|Class Teacher of:|Teaching \d+ subject/)).toBeVisible({ timeout: 10000 })
    await page.getByTestId('confirm-remove-staff').click()

    await expect(page.getByText(/Anita Nair removed/i)).toBeVisible({ timeout: 10000 })

    const found = await teachersByNames(['Anita Nair'])
    expect(found).toHaveLength(1)
    expect(found[0].status).toBe('removed')
  })

  // ─── 15. Removed staff's email frees up for reuse ──────────────────────────
  test('15. A removed staff member\'s email can be reused for a new hire', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page, schoolCode, uiPass)
    await goToStaffOnboarding(page)

    // Anita Nair (removed in test 14) freed up her email — the partial
    // unique index is scoped WHERE removed_at IS NULL, so this must succeed.
    await fillStaffRow(page, { name: 'New Hire Reused Email', email: `anita${ts}@staffschool.com`, subject: 'Chemistry' })
    await submitAndExpect(page, 'staff-onboard-submit', /1 staff member.*onboarded/i)
    const found = await teachersByNames(['New Hire Reused Email'])
    expect(found).toHaveLength(1)
  })

  // ─── 17. Unauthorized bulk onboarding call → 401 ──────────────────────────
  test('17. Bulk onboarding without auth cookie is rejected (401)', async ({ page }) => {
    test.setTimeout(30000)
    await page.goto('/login?role=school')
    await expect(page.getByTestId('auth-submit-btn')).toBeVisible({ timeout: 10000 })

    const anon = await playwrightRequest.newContext({ baseURL: BASE })
    const res = await anon.post('/api/teachers/bulk', {
      data: { school_id: schoolId, teachers: [{ name: 'Hacker', email: `hacker${ts}@evil.com`, subject: 'Math' }] },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })
})
