import { test, expect } from '@playwright/test'

test.describe('Portal Access Verification', () => {

  test.describe('Teacher Portal', () => {
    test('teacher login page loads and shows correct UI', async ({ page }) => {
      await page.goto('/teacher/login')
      await expect(page.getByText('Welcome back, Teacher')).toBeVisible()
      await expect(page.getByText('Teacher Portal')).toBeVisible()
      await expect(page.getByPlaceholder('your.email@school.edu')).toBeVisible()
      await expect(page.getByTestId('auth-password-input')).toBeVisible()
      await expect(page.getByText('Forgot password?')).toBeVisible()
    })

    test('teacher login shows error for invalid credentials', async ({ page }) => {
      await page.goto('/teacher/login')
      const responsePromise = page.waitForResponse(r => r.url().includes('/api/teacher/auth/login'))
      await page.getByTestId('teacher-email-input').fill('fake@teacher.com')
      await page.getByTestId('auth-password-input').fill('wrongpass')
      await page.getByTestId('teacher-submit-btn').click()
      const res = await responsePromise
      expect(res.status()).toBeGreaterThanOrEqual(400)
    })

    test('teacher forgot password page loads', async ({ page }) => {
      await page.goto('/teacher/forgot-password')
      await expect(page.getByText(/forgot|reset/i).first()).toBeVisible()
      await expect(page.getByPlaceholder(/email/i)).toBeVisible()
    })
  })

  test.describe('Student Portal', () => {
    test('student login page loads with welcome banner', async ({ page }) => {
      await page.goto('/student/login')
      await expect(page.getByText('Student Login')).toBeVisible()
      await expect(page.getByText('Ready to learn something new today?')).toBeVisible()
      await expect(page.getByPlaceholder('e.g. 2024-GR9-001')).toBeVisible()
      await expect(page.getByTestId('auth-password-input')).toBeVisible()
    })

    test('student login shows error for invalid credentials', async ({ page }) => {
      await page.goto('/student/login')
      const responsePromise = page.waitForResponse(r => r.url().includes('/api/student/auth/login'))
      await page.getByPlaceholder('e.g. 2024-GR9-001').fill('FAKE-ROLL-999')
      await page.getByTestId('auth-password-input').fill('wrongpass')
      await page.getByTestId('student-submit-btn').click()
      const res = await responsePromise
      expect(res.status()).toBeGreaterThanOrEqual(400)
    })

    test('student forgot password page loads', async ({ page }) => {
      await page.goto('/student/forgot-password')
      await expect(page.getByText(/forgot|reset/i).first()).toBeVisible()
    })
  })

  test.describe('Parent Portal', () => {
    test('parent login page loads with feature highlights', async ({ page }) => {
      await page.goto('/parent/login')
      await expect(page.getByRole('heading', { name: 'Parent Portal' })).toBeVisible()
      await expect(page.getByText('Exam results')).toBeVisible()
      await expect(page.getByText('Attendance')).toBeVisible()
      await expect(page.getByText('Fee status')).toBeVisible()
      await expect(page.getByText('Homework')).toBeVisible()
      await expect(page.getByPlaceholder('your@email.com')).toBeVisible()
    })

    test('parent login shows error for invalid credentials', async ({ page }) => {
      await page.goto('/parent/login')
      const responsePromise = page.waitForResponse(r => r.url().includes('/api/parent/auth/login'))
      const emailInput = page.locator('input[type="email"]')
      await emailInput.waitFor({ state: 'visible' })
      await emailInput.fill('fake@parent.com')
      await page.getByTestId('auth-password-input').fill('wrongpass')
      await page.getByTestId('parent-submit-btn').click()
      const res = await responsePromise
      expect(res.status()).toBeGreaterThanOrEqual(400)
    })

    test('parent forgot password page loads', async ({ page }) => {
      await page.goto('/parent/forgot-password')
      await expect(page.getByText(/forgot|reset/i).first()).toBeVisible()
    })
  })

  test.describe('Cross-Portal Navigation', () => {
    test('homepage links all lead to correct portals', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByTestId('portal-selection')).toBeVisible()

      // Verify all 4 cards are clickable and lead to correct URLs
      for (const [card, expectedUrl] of [
        ['school-admin', '/login?role=school'],
        ['teacher', '/teacher/login'],
        ['student', '/student/login'],
        ['parent', '/parent/login'],
      ] as const) {
        await page.goto('/')
        await page.getByTestId(`portal-card-${card}`).click()
        await expect(page).toHaveURL(new RegExp(expectedUrl.replace(/[?]/g, '\\?')))
      }
    })

    test('admin portal is accessible at /admin', async ({ page }) => {
      await page.goto('/admin')
      await expect(page.getByRole('heading', { name: 'Platform Admin' })).toBeVisible()
      await expect(page.getByText('Manage schools, subscriptions')).toBeVisible()
    })

    test('all login pages have back-to-portal links', async ({ page }) => {
      for (const loginUrl of ['/login?role=school', '/teacher/login', '/student/login', '/parent/login']) {
        await page.goto(loginUrl)
        const backLink = page.getByText(/back to/i)
        await expect(backLink).toBeVisible()
      }
    })
  })

  test.describe('API Endpoints Health', () => {
    test('health endpoint confirms DB connected', async ({ request }) => {
      const res = await request.get('/api/health')
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.db).toBe('connected')
    })

    test('schools API returns data', async ({ request }) => {
      const res = await request.get('/api/schools?scope=active')
      expect(res.ok()).toBeTruthy()
      const schools = await res.json()
      expect(Array.isArray(schools)).toBe(true)
    })

    test('platform stats API returns data', async ({ request }) => {
      const res = await request.get('/api/platform/stats')
      expect(res.ok()).toBeTruthy()
      const stats = await res.json()
      expect(stats).toHaveProperty('schools')
      expect(stats).toHaveProperty('teachers')
      expect(stats).toHaveProperty('students')
    })
  })
})
