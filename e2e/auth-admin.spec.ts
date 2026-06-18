import { test, expect } from '@playwright/test'
import { AdminLoginPage } from './pages/LoginPage'

test.describe('Admin / Platform Admin Login', () => {
  test('school admin login page renders form', async ({ page }) => {
    const login = new AdminLoginPage(page)
    await login.goto('school')
    await login.expectFormVisible()
    await expect(page.getByText('School Portal Login')).toBeVisible()
  })

  test('platform admin login page renders form', async ({ page }) => {
    const login = new AdminLoginPage(page)
    await login.goto('platform')
    await expect(page.getByText('Welcome Back')).toBeVisible()
  })

  test('shows error on invalid school admin credentials', async ({ page }) => {
    const login = new AdminLoginPage(page)
    await login.goto('school')
    await login.login('nonexistent-school', 'wrongpassword')
    await login.expectError('Invalid credentials')
  })

  test('shows error on invalid platform admin credentials', async ({ page }) => {
    const login = new AdminLoginPage(page)
    await login.goto('platform')
    await login.loginAsPlatformAdmin('fake@email.com', 'wrongpassword')
    await login.expectError('Invalid credentials')
  })

  test('platform admin login succeeds and navigates away from login', async ({ page }) => {
    const login = new AdminLoginPage(page)
    await login.goto('platform')
    await login.loginAsPlatformAdmin('ckrishna@startensystems.com', 'Admin@1234')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 })
    await expect(page.getByTestId('auth-error-text')).not.toBeVisible()
  })

  test('forgot password link is visible', async ({ page }) => {
    const login = new AdminLoginPage(page)
    await login.goto('school')
    await expect(page.getByText('Forgot password?')).toBeVisible()
  })

  test('back to portal link navigates home', async ({ page }) => {
    const login = new AdminLoginPage(page)
    await login.goto('school')
    await page.getByText('Back to portal selection').click()
    await expect(page).toHaveURL('/')
  })
})
