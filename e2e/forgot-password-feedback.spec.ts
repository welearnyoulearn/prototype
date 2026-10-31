import { test, expect, type Page } from '@playwright/test'
import { maskEmail, maskPhone } from '../lib/maskContact'
import { classifyIdentifier, forgotPasswordRequestSchema } from '../lib/forgotPassword'
import { dbAvailable } from './fixtures/db'

// #451 — forgot-password tells the user where the link went, or that the
// account isn't registered, on every portal.

test.describe('mask + classify helpers', () => {
  test('maskEmail keeps first letter and domain only', () => {
    expect(maskEmail('kowsik@gmail.com')).toBe('k****@gmail.com')
    expect(maskEmail('nonsense')).toBe('****')
  })

  test('maskPhone keeps last four digits only', () => {
    expect(maskPhone('+91 98765 43210')).toBe('********3210')
    expect(maskPhone('12')).toBe('****')
  })

  test('classifyIdentifier tells email, mobile and ID apart', () => {
    expect(classifyIdentifier('A@b.com').kind).toBe('email')
    expect(classifyIdentifier('+91 98765-43210')).toEqual({ kind: 'phone', value: '9876543210' })
    expect(classifyIdentifier('WLYL-K7M2P9XQ').kind).toBe('other')
  })

  test('request schema accepts legacy field names and rejects empty input', () => {
    expect(forgotPasswordRequestSchema.parse({ rollNumber: ' X1 ' })).toEqual({ identifier: 'X1' })
    expect(forgotPasswordRequestSchema.safeParse({}).success).toBe(false)
    expect(forgotPasswordRequestSchema.safeParse({ identifier: 'x'.repeat(400) }).success).toBe(false)
  })
})

const PORTALS = [
  { name: 'student', path: '/student/forgot-password', api: '**/api/student/auth/forgot-password' },
  { name: 'teacher', path: '/teacher/forgot-password', api: '**/api/teacher/auth/forgot-password' },
  { name: 'parent', path: '/parent/forgot-password', api: '**/api/parent/auth/forgot-password' },
  { name: 'school admin', path: '/forgot-password', api: '**/api/auth/forgot-password' },
  { name: 'platform admin', path: '/forgot-password?role=platform', api: '**/api/auth/forgot-password' },
]

async function submitWith(page: Page, api: string, body: object, status = 200) {
  await page.route(api, route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }))
  await page.getByTestId('forgot-password-identifier-input').fill('someone@example.com')
  await page.getByTestId('forgot-password-submit-btn').click()
}

for (const portal of PORTALS) {
  test.describe(`${portal.name} forgot-password screen`, () => {
    test.beforeEach(async ({ page }) => { await page.goto(portal.path) })

    test('success names the masked address', async ({ page }) => {
      await submitWith(page, portal.api, { status: 'sent', sentTo: ['s****@example.com'] })
      await expect(page.getByTestId('forgot-password-sent-to')).toHaveText('s****@example.com')
      await expect(page.getByTestId('forgot-password-back-to-login')).toBeVisible()
    })

    test('not registered shows a clear message and keeps the form for another try', async ({ page }) => {
      await submitWith(page, portal.api, { status: 'not_found' })
      await expect(page.getByTestId('auth-error-text')).toContainText("couldn't find an account")
      await expect(page.getByTestId('forgot-password-identifier-input')).toHaveValue('someone@example.com')
      await expect(page.getByTestId('forgot-password-submit-btn')).toBeEnabled()
    })

    test('account without an email points to the school office', async ({ page }) => {
      await submitWith(page, portal.api, { status: 'no_contact' })
      await expect(page.getByTestId('auth-error-text')).toContainText('school office')
    })

    test('rate limited asks the user to wait', async ({ page }) => {
      await submitWith(page, portal.api, { status: 'rate_limited' }, 429)
      await expect(page.getByTestId('auth-error-text')).toContainText('Too many attempts')
    })
  })
}

test.describe('forgot-password API (needs database)', () => {
  test.skip(!dbAvailable(), 'no database configured')

  const ENDPOINTS = ['/api/auth/forgot-password', '/api/teacher/auth/forgot-password', '/api/student/auth/forgot-password', '/api/parent/auth/forgot-password']

  for (const endpoint of ENDPOINTS) {
    test(`${endpoint}: unknown account → not_found, empty body → 400`, async ({ request }) => {
      const missing = await request.post(endpoint, { data: { identifier: `nobody-${Date.now()}@nowhere.test` } })
      expect(missing.status()).toBe(200)
      expect(await missing.json()).toEqual({ status: 'not_found' })

      const bad = await request.post(endpoint, { data: {} })
      expect(bad.status()).toBe(400)
    })
  }
})
