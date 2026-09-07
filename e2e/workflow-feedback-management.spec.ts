import { test, expect, Page } from '@playwright/test'
import { platformAdminCookie, createSchool, setSubscription, BASE } from './fixtures/platform-admin'

// Enables feedback-management for a tier — mirrors how a platform admin
// would flip the toggle on /platform-admin/features (POST /api/platform/features).
async function enableFeedbackManagement(cookie: string, tier: string) {
  const res = await fetch(`${BASE}/api/platform/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ assignments: [{ feature_key: 'feedback-management', tier, enabled: true }] }),
  })
  if (!res.ok) throw new Error(`Enable feedback-management failed — status ${res.status}: ${await res.text()}`)
}

async function loginAsSchoolAdmin(page: Page, schoolCode: string, schoolPass: string) {
  await page.goto('/login?role=school')
  await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
  await page.getByPlaceholder('Enter your password').fill(schoolPass)
  await page.getByTestId('auth-submit-btn').click()
  await page.waitForURL(/\/school-admin|\/profile-setup|\/change-password/, { timeout: 10000 })

  if (page.url().includes('change-password')) {
    const newPass = 'NewAdmin@1234'
    const passwordFields = page.locator('input[type="password"]')
    await passwordFields.nth(0).fill(newPass)
    await passwordFields.nth(1).fill(newPass)
    await page.getByRole('button', { name: /change|update|set|save/i }).click()
    await page.waitForURL(/\/profile-setup|\/school-admin/, { timeout: 10000 })
  }

  if (page.url().includes('profile-setup')) {
    await expect(page.getByText('Step 1 of 2')).toBeVisible({ timeout: 5000 })
    await page.getByPlaceholder('Your full name').fill('Test Admin')
    await page.getByPlaceholder('+91 98765 43210').fill('9876500100')
    await page.getByPlaceholder('e.g., Principal, School Admin').fill('Principal')
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Step 2 of 2')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Complete Setup →' }).click()
    await page.waitForURL(/\/school-admin/, { timeout: 15000 })
  }
}

test.describe.serial('Feedback Management Workflow', () => {
  let schoolCode: string
  let schoolPass: string
  let schoolId: number
  let feedbackUrl: string

  test.beforeAll(async () => {
    const platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie)
    schoolCode = school.school_code
    schoolPass = school.temp_password
    schoolId = school.id

    await setSubscription(platformCookie, schoolId, 'premium')
    await enableFeedbackManagement(platformCookie, 'premium')
  })

  test('1. School Admin — find the public feedback link in Settings & QR', async ({ page }) => {
    await loginAsSchoolAdmin(page, schoolCode, schoolPass)

    await page.getByRole('button', { name: /feedback/i }).first().click()
    await expect(page.getByTestId('feedback-tab-settings')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('feedback-tab-settings').click()

    const urlInput = page.getByTestId('feedback-public-url')
    await expect(urlInput).toBeVisible({ timeout: 10000 })
    feedbackUrl = await urlInput.inputValue()
    expect(feedbackUrl).toContain('/feedback/')
  })

  test('2. Public — submit feedback with no login, one low rating', async ({ page }) => {
    expect(feedbackUrl).toBeTruthy()
    await page.goto(feedbackUrl)

    await page.getByTestId('feedback-role-parent-btn').click()
    await page.getByTestId('feedback-anonymous-checkbox').check()
    await page.getByTestId('feedback-identity-continue-btn').click()

    await page.getByTestId('feedback-category-transportation-btn').click()
    await page.getByTestId('feedback-category-continue-btn').click()

    // Rate Transportation 1 star — should surface as a high-priority issue
    await page.getByTestId('feedback-rating-transportation-1-btn').click()
    await page.getByTestId('feedback-rating-next-btn').click()

    await page.getByTestId('feedback-freetext-input').fill('The bus was 45 minutes late again today.')
    await page.getByTestId('feedback-submit-btn').click()

    await expect(page.getByTestId('feedback-thankyou-heading')).toBeVisible({ timeout: 10000 })
  })

  test('3. School Admin — submission appears in Submissions tab', async ({ page }) => {
    await loginAsSchoolAdmin(page, schoolCode, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-submissions').click()

    await expect(page.getByText('The bus was 45 minutes late again today.')).toBeVisible({ timeout: 10000 })
  })

  test('4. School Admin — low rating appears as an open issue and can be resolved', async ({ page }) => {
    await loginAsSchoolAdmin(page, schoolCode, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-issues').click()

    const row = page.locator('[data-testid^="feedback-issue-row-"]').first()
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.getByText('Transportation')).toBeVisible()

    const statusSelect = row.locator('[data-testid^="feedback-issue-status-select-"]')
    await statusSelect.click()
    await page.getByRole('option', { name: 'Resolved' }).click()

    await expect(statusSelect).toContainText('Resolved', { timeout: 10000 })
  })
})
