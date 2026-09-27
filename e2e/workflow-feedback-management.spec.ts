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

async function loginAsSchoolAdmin(page: Page, adminEmail: string, schoolPass: string) {
  await page.goto('/login?role=school')
  await page.getByPlaceholder('you@school.com').fill(adminEmail)
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
  let adminEmail: string
  let schoolPass: string
  let schoolId: number
  let feedbackUrl: string
  let eventQrUrl: string

  test.beforeAll(async () => {
    const platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie)
    adminEmail = school.email
    schoolPass = school.temp_password
    schoolId = school.id

    await setSubscription(platformCookie, schoolId, 'premium')
    await enableFeedbackManagement(platformCookie, 'premium')
  })

  test('1. School Admin — find the public feedback link in Settings & QR', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)

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

  test('3. School Admin — submission appears in the school-wide folder', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-submissions').click()
    await page.getByTestId('feedback-folder-general').click()

    await expect(page.getByText('The bus was 45 minutes late again today.')).toBeVisible({ timeout: 10000 })
  })

  test('4. School Admin — low rating appears as an open issue and can be resolved', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)
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

  test('5. School Admin — create an event QR scoped to parents + one category', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-qr-points').click()
    await page.getByTestId('feedback-new-qr-point-btn').click()

    const editor = page.getByTestId('feedback-qr-point-editor')
    await page.getByTestId('feedback-qr-point-kind-event').click()
    await page.getByTestId('feedback-qr-point-title-input').fill('Annual Day 2026')
    await page.getByTestId('feedback-qr-point-venue-input').fill('Main Ground')
    await page.getByTestId('feedback-qr-point-form-rating').click()
    // Audience defaults to Parent only; pin the parent "Food" category
    await editor.getByText('Food', { exact: false }).first().click()
    await page.getByTestId('feedback-qr-point-save-btn').click()

    const card = page.locator('[data-testid^="feedback-qr-point-card-"]', { hasText: 'Annual Day 2026' })
    await expect(card).toBeVisible({ timeout: 10000 })
    await card.locator('[data-testid^="feedback-qr-point-poster-btn-"]').click()
    await expect(page.getByTestId('feedback-qr-point-poster-preview')).toBeVisible({ timeout: 10000 })
    eventQrUrl = (await page.getByTestId('feedback-qr-point-url').textContent()) ?? ''
    expect(eventQrUrl).toContain('/feedback/')
    expect(eventQrUrl).not.toBe(feedbackUrl)
  })

  test('6. Public — event QR shows the event and goes straight to its pinned category', async ({ page }) => {
    expect(eventQrUrl).toBeTruthy()
    await page.goto(eventQrUrl)

    await expect(page.getByTestId('feedback-qr-point-header')).toContainText('Annual Day 2026')
    // Only one audience → no role picker
    await expect(page.getByTestId('feedback-role-student-btn')).toHaveCount(0)
    await page.getByTestId('feedback-start-btn').click()
    await page.getByTestId('feedback-anonymous-checkbox').check()
    await page.getByTestId('feedback-identity-continue-btn').click()

    await page.getByTestId('feedback-rating-food-2-btn').click()
    await page.getByTestId('feedback-rating-next-btn').click()
    await page.getByTestId('feedback-freetext-input').fill('Food stall queues at Annual Day were too long.')
    await page.getByTestId('feedback-submit-btn').click()

    await expect(page.getByTestId('feedback-thankyou-heading')).toBeVisible({ timeout: 10000 })
  })

  test('7. School Admin — event responses are tagged and separable from the school-wide QR', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-qr-points').click()

    const card = page.locator('[data-testid^="feedback-qr-point-card-"]', { hasText: 'Annual Day 2026' })
    await card.locator('[data-testid^="feedback-qr-point-responses-btn-"]').click()
    await expect(page.getByText('Food stall queues at Annual Day were too long.')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('The bus was 45 minutes late again today.')).toHaveCount(0)

    await expect(page.getByTestId('feedback-folder-name')).toContainText('Annual Day 2026')

    // Back to the folder list, then into the school-wide folder
    await page.getByTestId('feedback-folders-back-btn').click()
    await page.getByTestId('feedback-folder-general').click()
    await expect(page.getByText('The bus was 45 minutes late again today.')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Food stall queues at Annual Day were too long.')).toHaveCount(0)
  })

  test('8. School Admin — pausing the event QR closes its public form', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-qr-points').click()

    const card = page.locator('[data-testid^="feedback-qr-point-card-"]', { hasText: 'Annual Day 2026' })
    await card.locator('[data-testid^="feedback-qr-point-toggle-btn-"]').click()
    await expect(card).toContainText('Paused', { timeout: 10000 })

    await page.goto(eventQrUrl)
    await expect(page.getByTestId('feedback-closed')).toContainText('Annual Day 2026', { timeout: 10000 })
  })

  test('9. School Admin — deleting the event folder removes its feedback and kills the QR', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-submissions').click()

    const folder = page.locator('[data-testid^="feedback-folder-"]', { hasText: 'Annual Day 2026' }).first()
    await folder.click()
    await page.getByTestId('feedback-folder-delete-btn').click()

    const confirmBtn = page.getByTestId('feedback-delete-folder-confirm-btn')
    await expect(confirmBtn).toBeDisabled()
    await page.getByTestId('feedback-delete-folder-confirm-input').fill('DELETE')
    await confirmBtn.click()

    await expect(page.getByTestId('feedback-submission-folders')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('feedback-submission-folders')).not.toContainText('Annual Day 2026')

    await page.goto(eventQrUrl)
    await expect(page.getByTestId('feedback-not-found')).toBeVisible({ timeout: 10000 })
  })

  test('10. School Admin — Clear folder needs an Excel download first, then archives; Archive can restore', async ({ page }) => {
    await loginAsSchoolAdmin(page, adminEmail, schoolPass)
    await page.getByRole('button', { name: /feedback/i }).first().click()
    await page.getByTestId('feedback-tab-submissions').click()
    await page.getByTestId('feedback-folder-general').click()
    await page.getByTestId('feedback-folder-clear-btn').click()

    const archiveBtn = page.getByTestId('feedback-clear-archive-btn')
    await expect(archiveBtn).toBeDisabled()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('feedback-clear-download-btn').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^feedback-school-wide-qr-.*\.xlsx$/)
    await expect(archiveBtn).toBeEnabled()
    await archiveBtn.click()

    await expect(page.getByTestId('feedback-folder-notice')).toContainText('moved to the')
    await expect(page.getByTestId('feedback-submissions-empty')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('feedback-folders-back-btn').click()
    await page.getByTestId('feedback-folder-archived').click()
    await expect(page.getByText('The bus was 45 minutes late again today.')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('feedback-archive-restore-btn').click()
    await page.getByTestId('feedback-archive-action-confirm-btn').click()
    await expect(page.getByTestId('feedback-folder-notice')).toContainText('restored')
  })
})
