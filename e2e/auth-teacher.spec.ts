import { test, expect } from '@playwright/test'
import { TeacherLoginPage } from './pages/LoginPage'

test.describe('Teacher Login', () => {
  test('renders teacher login form', async ({ page }) => {
    const login = new TeacherLoginPage(page)
    await login.goto()
    await expect(page.getByText('Welcome back, Teacher')).toBeVisible()
    await expect(page.getByTestId('teacher-login-form')).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    const login = new TeacherLoginPage(page)
    await login.goto()
    await login.login('nonexistent@school.edu', 'wrongpassword')
    await expect(page.getByTestId('auth-error-text')).toBeVisible({ timeout: 10000 })
  })

  test('forgot password link is visible', async ({ page }) => {
    const login = new TeacherLoginPage(page)
    await login.goto()
    await expect(page.getByText('Forgot password?')).toBeVisible()
  })

  test('back link navigates to portal selection', async ({ page }) => {
    const login = new TeacherLoginPage(page)
    await login.goto()
    await page.getByText('Back to portal selection').click()
    await expect(page).toHaveURL('/')
  })
})
