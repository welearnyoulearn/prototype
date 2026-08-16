import { test, expect } from '@playwright/test'
import { PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD } from './fixtures/platform-admin'

test.describe.serial('Full Platform Workflow', () => {
  let schoolCode: string
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

    // Click Add School
    await page.getByRole('button', { name: 'Add School' }).click()
    await expect(page.getByText('Add New School')).toBeVisible()

    // Fill out school form
    const ts = Date.now()
    schoolName = `Sunrise School ${ts}`
    const modal = page.locator('.fixed').filter({ hasText: 'Add New School' })
    await modal.getByPlaceholder('e.g. Greenwood High School').fill(schoolName)
    await modal.getByPlaceholder('Mumbai').fill('Bangalore')
    await modal.locator('select').nth(1).selectOption('India')
    await modal.getByPlaceholder('admin@schoolname.edu').fill(`sunrise${ts}@test.com`)
    await modal.getByPlaceholder('+91 98765 43210').fill('9876512345')
    await modal.getByPlaceholder('Street, Area, City, State, PIN').fill('100 MG Road, Bangalore, KA 560001')

    // Submit
    await page.getByRole('button', { name: 'Create School' }).click()

    // Wait for credentials modal
    await expect(page.getByText('School Created!')).toBeVisible({ timeout: 15000 })

    // Capture credentials from the success modal
    const credModal = page.locator('.fixed').filter({ hasText: 'School Created!' })
    const codeEl = credModal.locator('code').first()
    schoolCode = ((await codeEl.textContent()) ?? '').trim()
    const passEl = credModal.locator('code').nth(1)
    schoolTempPass = ((await passEl.textContent()) ?? '').trim()

    expect(schoolCode).toBeTruthy()
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
    test.skip(!schoolCode, 'School not created in previous test')

    await page.goto('/login?role=school')
    await expect(page.getByText('School Portal Login')).toBeVisible()

    // Login with school code + temp password
    await page.getByTestId('auth-school-id-or-email-input').fill(schoolCode)
    await page.getByTestId('auth-password-input').fill(schoolTempPass)
    await page.getByTestId('auth-submit-btn').click()

    // Should redirect away from login (change-password or profile-setup)
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 })
    await expect(page.getByTestId('auth-error-text')).not.toBeVisible()
  })
})
