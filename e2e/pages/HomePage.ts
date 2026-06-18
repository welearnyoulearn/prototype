import { type Page, expect } from '@playwright/test'

export class HomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/')
  }

  async expectVisible() {
    await expect(this.page.getByText('WeLearnYouLearn', { exact: true })).toBeVisible()
    await expect(this.page.getByText('Smart School')).toBeVisible()
  }

  async expectAllPortalCards() {
    await expect(this.page.getByTestId('portal-card-school-admin')).toBeVisible()
    await expect(this.page.getByTestId('portal-card-teacher')).toBeVisible()
    await expect(this.page.getByTestId('portal-card-student')).toBeVisible()
    await expect(this.page.getByTestId('portal-card-parent')).toBeVisible()
  }

  async clickPortal(role: 'school-admin' | 'teacher' | 'student' | 'parent') {
    await this.page.getByTestId(`portal-card-${role}`).click()
  }
}
