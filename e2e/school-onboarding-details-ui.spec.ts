// Add School with full school details, the School details panel and the setup checklist
// (DOCS/SCHOOL-ONBOARDING.md). UI only: every API is mocked — no database.
import { test, expect, type Page } from '@playwright/test'
import jwt from 'jsonwebtoken'

try { process.loadEnvFile('.env.local') } catch { /* fall back to the dev default */ }
const SECRET = process.env.JWT_SECRET || 'wlyl-dev-only-secret-not-for-production'

const plans = [
  { tier: 'basic', name: 'Basic', description: '', monthly: 500, yearly: 5000, staffLimit: 2, schools: 0, shownOnWebsite: true, retired: false },
  { tier: 'standard', name: 'Standard', description: '', monthly: 1000, yearly: 10000, staffLimit: 5, schools: 0, shownOnWebsite: true, retired: false },
]
const stats = { schools: { total: 0, active: 0, inactive: 0, deleted: 0 }, teachers: { total: 0 }, students: { total: 0 }, subscriptions: { basic: 0, standard: 0, premium: 0, none: 0 }, growth: { this_month: 0, last_month: 0 } }

async function platformAdmin(page: Page) {
  const token = jwt.sign({ userId: 1, role: 'platform_admin', firstLogin: false, profileCompleted: true, sid: 'e2e' }, SECRET, { expiresIn: '1h' })
  await page.context().addCookies([{ name: 'wlyl-platform', value: token, url: 'http://localhost:3000' }])
  await page.route('**/api/**', r => r.fulfill({ json: {} }))
  await page.route('**/api/schools?**', r => r.fulfill({ json: [] }))
  await page.route('**/api/platform/plans', r => r.fulfill({ json: plans }))
  await page.route('**/api/platform/stats', r => r.fulfill({ json: stats }))
  await page.route('**/api/platform/admins', r => r.fulfill({ json: [{ id: 7, full_name: 'Kowsik', email: 'k@wlyl.in' }] }))
}

test('Add School: 7 steps with checks at each step; creates with full details', async ({ page }) => {
  await platformAdmin(page)
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/schools', async r => {
    if (r.request().method() !== 'POST') return r.fulfill({ json: [] })
    posts.push(JSON.parse(r.request().postData() ?? '{}'))
    return r.fulfill({ status: 201, json: { id: 42, name: 'Greenwood High', email: 'asha@greenwood.in', setup_email_sent: true } })
  })
  await page.goto('/platform-admin')
  await expect(page.getByRole('heading', { name: 'School directory' })).toBeVisible()
  // Retry the click until the page is interactive (the first dev compile can be slow).
  await expect(async () => {
    await page.getByRole('button', { name: /Add School/ }).first().click()
    await expect(page.getByTestId('add-school-wizard')).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20000 })

  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-error')).toContainText('school name')
  await page.getByTestId('wizard-name').fill('Greenwood High')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-error')).toContainText('legal name')
  await page.getByTestId('sd-legalName').fill('Greenwood Educational Trust')
  await page.getByTestId('sd-address').fill('1 MG Road')
  await page.getByTestId('sd-city').fill('Hyderabad')
  await page.getByTestId('sd-stateCode').selectOption('36')
  await page.getByTestId('sd-pin').fill('5000')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-error')).toContainText('PIN')
  await page.getByTestId('sd-pin').fill('500001')
  await page.getByTestId('wizard-next').click()

  await page.getByTestId('sd-gstin').fill('29ABCDE1234F1Z5')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-error')).toContainText('registered in Karnataka')
  await page.getByTestId('sd-gstin').fill('36ABCDE1234F1Z5')
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('sd-academicStartMonth')).toHaveValue('6')
  await page.getByTestId('sd-classesFrom').selectOption('5')
  await page.getByTestId('sd-classesTo').selectOption('2')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-error')).toContainText('Classes to')
  await page.getByTestId('sd-classesFrom').selectOption('Nursery')
  await page.getByTestId('sd-classesTo').selectOption('10')
  await page.getByTestId('wizard-next').click()

  await page.getByTestId('wizard-admin-name').fill('Asha')
  await page.getByTestId('wizard-email').fill('asha@greenwood.in')
  await page.getByTestId('wizard-phone').fill('12345')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-error')).toContainText('mobile')
  await page.getByTestId('wizard-phone').fill('98765 43210')
  await page.getByTestId('sd-accountant-name').fill('Ravi')
  await page.getByTestId('sd-accountant-mobile').fill('9123456780')
  await page.getByTestId('wizard-next').click()

  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-error')).toContainText('students')
  await page.getByTestId('sd-approxStudents').fill('600')
  await page.getByTestId('sd-approxStaff').fill('40')
  await page.getByTestId('sd-salesOwnerId').selectOption('7')
  await page.getByTestId('wizard-next').click()

  await page.getByTestId('wizard-plan-standard').click()
  await expect(page.getByTestId('wizard-staff-warning')).toContainText('allows 5 staff logins')
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-review')).toContainText('Greenwood Educational Trust')
  await expect(page.getByTestId('wizard-review')).toContainText('Telangana')
  await expect(page.getByTestId('wizard-review')).toContainText('starts in June')
  await page.screenshot({ path: 'test-results/tour/onboarding-review.png', fullPage: true })
  await page.getByTestId('wizard-send').click()
  await expect(page.getByText('School Created!')).toBeVisible()

  expect(posts[0]).toMatchObject({
    name: 'Greenwood High', email: 'asha@greenwood.in', admin_name: 'Asha', admin_mobile: '9876543210', tier: 'standard',
    details: {
      legalName: 'Greenwood Educational Trust', stateCode: '36', pin: '500001', gstin: '36ABCDE1234F1Z5', academicStartMonth: 6,
      classesFrom: 'Nursery', classesTo: '10', approxStudents: 600, approxStaff: 40, salesOwnerId: 7,
      contacts: { accountant: { name: 'Ravi', mobile: '9123456780' } },
    },
  })
})

test('School page: School details panel shows the checklist and saves edits', async ({ page }) => {
  await platformAdmin(page)
  const puts: Record<string, unknown>[] = []
  await page.route('**/api/platform/schools/42/details', async r => {
    if (r.request().method() === 'PUT') { puts.push(JSON.parse(r.request().postData() ?? '{}')); return r.fulfill({ json: { ok: true } }) }
    return r.fulfill({ json: {
      details: { contacts: {} },
      checklist: { done: 1, total: 5, complete: false, items: [
        { key: 'branding', label: 'School logo and receipt header', done: true, hint: '', tab: 'settings' },
        { key: 'classes', label: 'Classes and sections', done: false, hint: '', tab: 'class-management' },
        { key: 'staff', label: 'Staff accounts', done: false, hint: '', tab: 'staff' },
        { key: 'students', label: 'Students and parents', done: false, hint: '', tab: 'students' },
        { key: 'fees', label: 'Fee structure', done: false, hint: '', tab: 'fee-management' },
      ] },
    } })
  })
  await page.route('**/api/schools/42', r => r.fulfill({ json: { id: 42, name: 'Old School', school_code: 'OLD42', type: 'Private', city: 'Kolkata', country: 'India', status: 'active', email: 'a@old.in', created_at: '2026-01-01T00:00:00Z' } }))
  await page.route('**/api/schools/42/subscription', r => r.fulfill({ json: { school_id: 42, tier: 'standard', staff_limit: 5, active_staff: 1, seats_over: 0, plan_status: 'active', plan_start_date: '2026-06-01', plan_end_date: '2027-05-31', term: null } }))
  await page.route('**/api/schools/42/admins', r => r.fulfill({ json: [] }))
  await page.goto('/platform-admin/schools/42')
  await expect(page.getByTestId('school-details-missing-state')).toBeVisible()
  await expect(page.getByTestId('school-details-checklist')).toContainText('1 of 5')
  await page.getByTestId('school-details-edit').click()
  await page.getByTestId('sd-legalName').fill('Old School Trust')
  await page.getByTestId('sd-address').fill('2 Park Street')
  await page.getByTestId('sd-city').fill('Kolkata')
  await page.getByTestId('sd-stateCode').selectOption('19')
  await page.getByTestId('sd-pin').fill('700016')
  await page.getByTestId('sd-approxStudents').fill('300')
  await page.getByTestId('sd-approxStaff').fill('20')
  await page.getByTestId('school-details-save').click()
  await expect(page.getByTestId('school-details-msg')).toContainText('Saved')
  expect(puts[0]).toMatchObject({ legalName: 'Old School Trust', stateCode: '19', pin: '700016' })
})

test('School Overview: setup checklist shows progress; a bad response hides it without breaking the page', async ({ page }) => {
  const token = jwt.sign({ userId: 5, role: 'school_admin', schoolId: 1, schoolCode: 'S1', firstLogin: false, profileCompleted: true, sid: 'e2e' }, SECRET, { expiresIn: '1h' })
  await page.context().addCookies([{ name: 'wlyl-auth', value: token, url: 'http://localhost:3000' }])
  await page.route('**/api/**', r => r.fulfill({ json: {} }))
  await page.route('**/api/auth/me', r => r.fulfill({ json: { role: 'school_admin', school_id: 1, school_name: 'Alpha School' } }))
  await page.route('**/api/schools/1', r => r.fulfill({ json: { id: 1, name: 'Alpha School', status: 'active' } }))
  await page.route('**/api/schools/1/subscription', r => r.fulfill({ json: { tier: 'standard' } }))
  await page.route('**/api/school/enabled-features**', r => r.fulfill({ json: { enabled: ['staff', 'students'] } }))
  await page.route('**/api/plan/status', r => r.fulfill({ json: { role: 'school_admin', school_id: 1, tier: 'standard', plan_status: 'active', days_left: 300, locked: false, can_manage: true } }))
  await page.route('**/api/school/setup-checklist', r => r.fulfill({ json: {
    done: 2, total: 5, complete: false, items: [
      { key: 'branding', label: 'School logo and receipt header', done: true, hint: '', tab: 'settings' },
      { key: 'classes', label: 'Classes and sections', done: true, hint: '', tab: 'class-management' },
      { key: 'staff', label: 'Staff accounts', done: false, hint: 'Add teachers and office staff so they can sign in.', tab: 'staff' },
      { key: 'students', label: 'Students and parents', done: false, hint: 'Import from Excel.', tab: 'students' },
      { key: 'fees', label: 'Fee structure', done: false, hint: 'Fee heads and amounts.', tab: 'fee-management' },
    ] } }))
  await page.goto('/school-admin')
  await expect(page.getByTestId('setup-checklist-progress')).toHaveText('2 of 5 done')
  await expect(page.getByTestId('setup-item-staff')).toHaveAttribute('data-done', 'false')
  await page.screenshot({ path: 'test-results/tour/onboarding-checklist.png' })

  await page.unroute('**/api/school/setup-checklist')
  await page.route('**/api/school/setup-checklist', r => r.fulfill({ json: {} }))
  await page.reload()
  await expect(page.getByTestId('setup-checklist')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'School sections' })).toBeVisible()
})

test('Policy pages and footer links', async ({ page }) => {
  for (const [path, title] of [['/terms', 'Terms & Conditions'], ['/privacy', 'Privacy Policy'], ['/refund-policy', 'Refund & Cancellation Policy'], ['/contact', 'Contact Us']] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.getByText(/WhatsApp|Cashfree/)).toHaveCount(0)
  }
})
