import { test, expect } from '@playwright/test'
import { StudentLoginPage } from './pages/LoginPage'

test.describe('Student Login', () => {
  test('renders student login form', async ({ page }) => {
    const login = new StudentLoginPage(page)
    await login.goto()
    await expect(page.getByText('Student Login')).toBeVisible()
    await expect(page.getByTestId('student-login-form')).toBeVisible()
  })

  test('shows welcome banner', async ({ page }) => {
    const login = new StudentLoginPage(page)
    await login.goto()
    await expect(page.getByText('Ready to learn something new today?')).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    const login = new StudentLoginPage(page)
    await login.goto()
    const responsePromise = page.waitForResponse(r => r.url().includes('/api/student/auth/login'))
    await login.login('FAKE-ROLL-001', 'wrongpassword')
    const res = await responsePromise
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('back link navigates to portal selection', async ({ page }) => {
    const login = new StudentLoginPage(page)
    await login.goto()
    await page.getByText('Back to portal selection').click()
    await expect(page).toHaveURL('/')
  })
})
