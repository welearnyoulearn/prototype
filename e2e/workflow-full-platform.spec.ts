import { test, expect } from '@playwright/test'
import { PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD } from './fixtures/platform-admin'

test.describe.serial('Full Platform Workflow', () => {
  let adminEmail: string
  let schoolTempPass: string
  let schoolId: number
  let schoolName: string

  test('1. Platform Admin — login to admin dashboard', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Platform Admin' })).toBeVisible()

    await page.getByTestId('auth-email-address-input').fill(PLATFORM_ADMIN_EMAIL)
    await page.getByTestId('auth-password-input').fill(PLATFORM_ADMIN_PASSWORD)
    await page.getByTestId('auth-submit-btn').click()

    await page.waitForURL(/\/platform-admin/, { timeout: 20000 })
    await expect(page.getByText('Active Schools', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('2. Platform Admin — create a new school', async ({ page }) => {
    // Login first
    await page.goto('/admin')
    await page.getByTestId('auth-email-address-input').fill(PLATFORM_ADMIN_EMAIL)
    await page.getByTestId('auth-password-input').fill(PLATFORM_ADMIN_PASSWORD)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/platform-admin/, { timeout: 15000 })
    await expect(page.getByText('Active Schools', { exact: true })).toBeVisible({ timeout: 10000 })

    // Add School wizard: School → Tax → Profile → Contacts → Size & needs → Plan → Review
    await page.getByRole('button', { name: 'Add School' }).click()
    await expect(page.getByTestId('add-school-wizard')).toBeVisible()
    const ts = Date.now()
    schoolName = `Sunrise School ${ts}`
    await page.getByTestId('wizard-name').fill(schoolName)
    await page.getByTestId('sd-legalName').fill('Sunrise Educational Trust')
    await page.getByTestId('sd-address').fill('100 MG Road')
    await page.getByTestId('sd-city').fill('Bangalore')
    await page.getByTestId('sd-stateCode').selectOption('29')
    await page.getByTestId('sd-pin').fill('560001')
    await page.getByTestId('wizard-next').click()          // → Tax (optional)
    await page.getByTestId('wizard-next').click()          // → Profile (defaults: CBSE, English, Nursery–10, June)
    await page.getByTestId('wizard-next').click()          // → Contacts
    await page.getByTestId('wizard-admin-name').fill('Sunrise Admin')
    await page.getByTestId('wizard-email').fill(`sunrise${ts}@test.com`)
    await page.getByTestId('wizard-phone').fill('9876512345')
    await page.getByTestId('wizard-next').click()          // → Size & needs
    await page.getByTestId('sd-approxStudents').fill('400')
    await page.getByTestId('sd-approxStaff').fill('25')
    await page.getByTestId('wizard-next').click()          // → Plan
    await page.getByTestId('wizard-plan-none').click()
    await page.getByTestId('wizard-next').click()          // → Review
    await page.getByTestId('wizard-send').click()

    // Wait for credentials modal
    await expect(page.getByText('School Created!')).toBeVisible({ timeout: 15000 })

    // Capture credentials from the success modal
    const credModal = page.locator('.fixed').filter({ hasText: 'School Created!' })
    const codeEl = credModal.locator('code').first()
    adminEmail = ((await codeEl.textContent()) ?? '').trim()
    const passEl = credModal.locator('code').nth(1)
    schoolTempPass = ((await passEl.textContent()) ?? '').trim()

    expect(adminEmail).toBeTruthy()
    expect(schoolTempPass).toBeTruthy()

    // Dismiss modal
    await page.getByRole('button', { name: /Done/ }).click()
    await expect(page.getByText(schoolName)).toBeVisible({ timeout: 5000 })
  })

  test('3. Platform Admin — set school subscription plan', async ({ page }) => {
    // Login
    await page.goto('/admin')
    await page.getByTestId('auth-email-address-input').fill(PLATFORM_ADMIN_EMAIL)
    await page.getByTestId('auth-password-input').fill(PLATFORM_ADMIN_PASSWORD)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/platform-admin/, { timeout: 15000 })
    await expect(page.getByText('Active Schools', { exact: true })).toBeVisible({ timeout: 10000 })

    // Find the exact school row created in test 2
    const schoolRow = page.locator('tr', { hasText: schoolName })
    await expect(schoolRow).toBeVisible({ timeout: 5000 })

    // The plan is a <select> dropdown already visible in the row
    const planSelect = schoolRow.locator('select').first()
    await planSelect.selectOption('premium')

    // Wait for the plan to update (API call happens on change)
    await page.waitForTimeout(2000)
    await expect(planSelect).toHaveValue('premium')
  })

  test('4. School Admin — first login redirects away from login', async ({ page }) => {
    test.skip(!adminEmail, 'School not created in previous test')

    await page.goto('/login?role=school')
    await expect(page.getByText('School Portal Login')).toBeVisible()

    // Login with the admin email + temp password
    await page.getByTestId('auth-email-address-input').fill(adminEmail)
    await page.getByTestId('auth-password-input').fill(schoolTempPass)
    await page.getByTestId('auth-submit-btn').click()

    // Should redirect away from login (change-password or profile-setup)
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 })
    await expect(page.getByTestId('auth-error-text')).not.toBeVisible()
  })
})
