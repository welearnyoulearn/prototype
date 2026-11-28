import { test, expect } from '@playwright/test'

// The WLYL Student app's Google Play listing points at these pages, so they must open for anyone,
// signed in or not — never redirect to the student sign-in (#569).
test.describe('Student app legal pages', () => {
  test('privacy policy is public and links to account deletion', async ({ page }) => {
    const res = await page.goto('/privacy/student-app')
    expect(res?.status()).toBe(200)
    await expect(page).toHaveURL(/\/privacy\/student-app$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('WLYL Student app — Privacy Policy')
    await page.getByTestId('student-app-delete-link').click()
    await expect(page).toHaveURL(/\/privacy\/student-app\/delete-account$/)
  })

  test('account deletion page is public with an email request', async ({ page }) => {
    const res = await page.goto('/privacy/student-app/delete-account')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete a WLYL Student account')
    await expect(page.getByTestId('student-app-delete-email')).toHaveAttribute('href', /^mailto:.+subject=Delete%20my%20WLYL%20Student%20account$/)
  })
})
