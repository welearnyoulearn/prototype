import { test, expect } from '@playwright/test'
import { HomePage } from './pages/HomePage'

test.describe('Home Page — Portal Selection', () => {
  test('displays branding and all 4 portal cards', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()
    await home.expectVisible()
    await home.expectAllPortalCards()
  })

  test('school admin card navigates to admin login', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()
    await home.clickPortal('school-admin')
    await expect(page).toHaveURL(/\/login\?role=school/)
  })

  test('teacher card navigates to teacher login', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()
    await home.clickPortal('teacher')
    await expect(page).toHaveURL(/\/teacher\/login/)
  })

  test('student card navigates to student login', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()
    await home.clickPortal('student')
    await expect(page).toHaveURL(/\/student\/login/)
  })

  test('parent card navigates to parent login', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()
    await home.clickPortal('parent')
    await expect(page).toHaveURL(/\/parent\/login/)
  })
})
