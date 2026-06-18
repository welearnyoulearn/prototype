import { type Page, expect } from '@playwright/test'

export class AdminLoginPage {
  constructor(private page: Page) {}

  async goto(role: 'school' | 'platform' = 'school') {
    await this.page.goto(`/login?role=${role}`)
  }

  async login(identifier: string, password: string) {
    await this.page.getByTestId('auth-school-id-or-email-input').fill(identifier)
    await this.page.getByTestId('auth-password-input').fill(password)
    await this.page.getByTestId('auth-submit-btn').click()
  }

  async loginAsPlatformAdmin(email: string, password: string) {
    await this.page.getByTestId('auth-email-address-input').fill(email)
    await this.page.getByTestId('auth-password-input').fill(password)
    await this.page.getByTestId('auth-submit-btn').click()
  }

  async expectError(msg: string) {
    await expect(this.page.getByTestId('auth-error-text')).toContainText(msg, { timeout: 10000 })
  }

  async expectFormVisible() {
    await expect(this.page.getByTestId('login-form')).toBeVisible()
  }
}

export class TeacherLoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/teacher/login')
  }

  async login(email: string, password: string) {
    await this.page.getByTestId('teacher-email-input').fill(email)
    await this.page.getByTestId('auth-password-input').fill(password)
    await this.page.getByTestId('teacher-submit-btn').click()
  }

  async expectError(msg: string) {
    await expect(this.page.getByTestId('auth-error-text')).toContainText(msg, { timeout: 10000 })
  }
}

export class StudentLoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/student/login')
  }

  async login(rollNumber: string, password: string) {
    await this.page.getByTestId('student-roll-input').fill(rollNumber)
    await this.page.getByTestId('auth-password-input').fill(password)
    await this.page.getByTestId('student-submit-btn').click()
  }

  async expectError(msg: string) {
    await expect(this.page.getByTestId('auth-error-text')).toContainText(msg, { timeout: 10000 })
  }
}

export class ParentLoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/parent/login')
  }

  async login(email: string, password: string) {
    await this.page.getByTestId('parent-email-input').fill(email)
    await this.page.getByTestId('auth-password-input').fill(password)
    await this.page.getByTestId('parent-submit-btn').click()
  }

  async expectError(msg: string) {
    await expect(this.page.getByTestId('auth-error-text')).toContainText(msg, { timeout: 10000 })
  }
}
