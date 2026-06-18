import { test, expect } from '@playwright/test'
import { ParentLoginPage } from './pages/LoginPage'

test.describe('Parent Login', () => {
  test('renders parent login form', async ({ page }) => {
    const login = new ParentLoginPage(page)
    await login.goto()
    await expect(page.getByRole('heading', { name: 'Parent Portal' })).toBeVisible()
    await expect(page.getByTestId('parent-login-form')).toBeVisible()
  })

  test('shows feature highlights', async ({ page }) => {
    const login = new ParentLoginPage(page)
    await login.goto()
    await expect(page.getByText('Exam results')).toBeVisible()
    await expect(page.getByText('Attendance')).toBeVisible()
    await expect(page.getByText('Fee status')).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    const login = new ParentLoginPage(page)
    await login.goto()
    await login.login('fake@parent.com', 'wrongpassword')
    await login.expectError('Invalid email or password')
  })

  test('back link navigates to portal selection', async ({ page }) => {
    const login = new ParentLoginPage(page)
    await login.goto()
    await page.getByText('Back to portal selection').click()
    await expect(page).toHaveURL('/')
  })
})
