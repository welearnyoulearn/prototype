import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe.serial('School Admin Workflow', () => {
  let schoolCode: string
  let schoolPass: string
  let schoolId: number
  let cookie: string

  test.beforeAll(async () => {
    const ts = Date.now()
    const res = await fetch(`${BASE}/api/schools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Test School ${ts}`,
        type: 'Private',
        city: 'Chennai',
        country: 'India',
        phone: '9876500100',
        email: `admin${ts}@test.com`,
        address: '50 Anna Salai, Chennai',
      }),
    })
    const data = await res.json()
    schoolCode = data.school_code
    schoolPass = data.temp_password
    schoolId = data.id

    // Set premium plan
    await fetch(`${BASE}/api/schools/${schoolId}/subscription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'premium' }),
    })
  })

  test('1. School Admin — login with school code', async ({ page }) => {
    await page.goto('/login?role=school')
    await expect(page.getByText('School Portal Login')).toBeVisible()

    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()

    // First login → change password
    await page.waitForURL(/\/change-password/, { timeout: 10000 })
  })

  test('2. School Admin — change password on first login', async ({ page }) => {
    // Login
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/change-password/, { timeout: 10000 })

    // Fill change password form
    const newPass = 'NewAdmin@1234'
    const passwordFields = page.locator('input[type="password"]')
    await passwordFields.nth(0).fill(newPass)
    await passwordFields.nth(1).fill(newPass)

    await page.getByRole('button', { name: /change|update|set|save/i }).click()

    // Should redirect to profile-setup or school-admin
    await page.waitForURL(/\/profile-setup|\/school-admin/, { timeout: 10000 })

    // Update password for subsequent tests
    schoolPass = newPass
  })

  test.skip('3. School Admin — complete profile setup and access dashboard', async ({ page }) => {
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()

    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 10000 })

    if (page.url().includes('profile-setup')) {
      // Wait for page to fully load user data
      await expect(page.getByText('Step 1 of 2')).toBeVisible({ timeout: 5000 })

      // Step 1: Fill basic info
      await page.getByPlaceholder('Your full name').fill('Test Admin')
      await page.getByPlaceholder('+91 98765 43210').fill('9876500100')
      await page.getByPlaceholder('e.g., Principal, School Admin').fill('Principal')

      // Click Next (type="button", validates fullName)
      await page.getByRole('button', { name: 'Next →' }).click()

      // Wait for Step 2 to appear — retry click if needed
      try {
        await expect(page.getByText('Step 2 of 2')).toBeVisible({ timeout: 3000 })
      } catch {
        await page.getByRole('button', { name: 'Next →' }).click()
        await expect(page.getByText('Step 2 of 2')).toBeVisible({ timeout: 5000 })
      }

      // Click Complete Setup
      await page.getByRole('button', { name: 'Complete Setup →' }).click()

      await page.waitForURL(/\/school-admin/, { timeout: 15000 })
    }

    await expect(page.getByText(/Dashboard|Overview|Classes|school/i).first()).toBeVisible({ timeout: 10000 })
  })

  test.skip('4. School Admin — navigate to Teachers tab and add a teacher', async ({ page }) => {
    // Login and get to dashboard
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 10000 })
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

    // Click Teachers tab/nav
    await page.getByRole('button', { name: /teacher/i }).first().click()
    await page.waitForTimeout(1000)

    // Click Add Teacher button
    const addBtn = page.getByRole('button', { name: /add teacher/i })
    if (await addBtn.isVisible()) {
      await addBtn.click()

      // Fill teacher form
      await page.getByPlaceholder(/name/i).first().fill('Ms. Anita Desai')
      const emailField = page.getByPlaceholder(/email/i).first()
      if (await emailField.isVisible()) {
        await emailField.fill('anita@admintest.com')
      }
      const subjectField = page.getByPlaceholder(/subject/i).first()
      if (await subjectField.isVisible()) {
        await subjectField.fill('English')
      }

      // Submit
      await page.getByRole('button', { name: /save|add|create|submit/i }).last().click()
      await page.waitForTimeout(2000)

      // Verify teacher appears in list
      await expect(page.getByText('Anita Desai')).toBeVisible({ timeout: 5000 })
    }
  })

  test.skip('5. School Admin — navigate to Students tab and add a student', async ({ page }) => {
    // Login
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 10000 })
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

    // Click Students tab
    await page.getByRole('button', { name: /student/i }).first().click()
    await page.waitForTimeout(1000)

    // Click Add Student
    const addBtn = page.getByRole('button', { name: /add student/i })
    if (await addBtn.isVisible()) {
      await addBtn.click()

      // Fill student form
      await page.getByPlaceholder(/name/i).first().fill('Arjun Patel')
      const gradeField = page.locator('select, input').filter({ hasText: /grade/i }).first()
      const gradeInput = page.getByPlaceholder(/grade/i).first()
      if (await gradeInput.isVisible()) {
        await gradeInput.fill('10')
      }

      // Submit
      await page.getByRole('button', { name: /save|add|create|submit/i }).last().click()
      await page.waitForTimeout(2000)

      // Verify student appears
      await expect(page.getByText('Arjun Patel')).toBeVisible({ timeout: 5000 })
    }
  })

  test.skip('6. School Admin — view Fee Management section', async ({ page }) => {
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 10000 })
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

    // Navigate to Fees section
    const feeBtn = page.getByRole('button', { name: /fee/i }).first()
    if (await feeBtn.isVisible()) {
      await feeBtn.click()
      await page.waitForTimeout(1000)
      // Verify fee management UI loaded
      await expect(page.getByText(/fee|category|structure|payment/i).first()).toBeVisible({ timeout: 5000 })
    }
  })

  test.skip('7. School Admin — view Attendance section', async ({ page }) => {
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 10000 })
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

    // Navigate to Attendance
    const attendanceBtn = page.getByRole('button', { name: /attendance/i }).first()
    if (await attendanceBtn.isVisible()) {
      await attendanceBtn.click()
      await page.waitForTimeout(1000)
      await expect(page.getByText(/attendance|present|absent|class/i).first()).toBeVisible({ timeout: 5000 })
    }
  })

  test.skip('8. School Admin — view Timetable section', async ({ page }) => {
    await page.goto('/login?role=school')
    await page.getByPlaceholder(/School ID or email/).fill(schoolCode)
    await page.getByPlaceholder('Enter your password').fill(schoolPass)
    await page.getByTestId('auth-submit-btn').click()
    await page.waitForURL(/\/school-admin|\/profile-setup/, { timeout: 10000 })
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

    // Navigate to Timetable
    const ttBtn = page.getByRole('button', { name: /timetable/i }).first()
    if (await ttBtn.isVisible()) {
      await ttBtn.click()
      await page.waitForTimeout(1000)
      await expect(page.getByText(/timetable|schedule|period/i).first()).toBeVisible({ timeout: 5000 })
    }
  })
})
