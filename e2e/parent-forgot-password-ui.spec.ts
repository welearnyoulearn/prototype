import { test, expect, Page } from '@playwright/test'

// UI behaviour of the parent WhatsApp-OTP password reset and the parent login input rules.
// Every API call is mocked, so this needs only the dev server — no database, no WhatsApp.

const OK_SEND = { ok: true, maskedPhone: '+91 ••••••3210', resendAfter: 2, expiresInMinutes: 5 }
const TOKEN = 'T'.repeat(48)

async function mockSend(page: Page, body: object = OK_SEND, status = 200) {
  await page.route('**/api/parent/auth/otp/send', r => r.fulfill({ status, json: body }))
}

async function typeCode(page: Page, code: string) {
  // fill() on the first box behaves like the OS one-time-code autofill / a paste of the whole code.
  await page.getByTestId('parent-otp-digit-0').fill(code)
}

async function goToCodeStep(page: Page) {
  await mockSend(page)
  await page.goto('/parent/forgot-password')
  await page.getByTestId('parent-otp-phone-input').fill('9876543210')
  await page.getByTestId('parent-otp-send-btn').click()
  await expect(page.getByTestId('parent-forgot-step-code')).toBeVisible()
}

test.describe('Parent forgot password — WhatsApp OTP wizard', () => {
  test('phone step: only digits, cleans a pasted +91 number, enforces a valid Indian mobile', async ({ page }) => {
    await page.goto('/parent/forgot-password')
    const input = page.getByTestId('parent-otp-phone-input')
    const send = page.getByTestId('parent-otp-send-btn')

    await expect(send).toBeDisabled()

    await input.fill('98a76-5')
    await expect(input).toHaveValue('98765')
    await expect(send).toBeDisabled()

    await input.fill('+91 98765 43210')            // pasted with country code
    await expect(input).toHaveValue('9876543210')
    await expect(send).toBeEnabled()
    await expect(page.getByTestId('parent-otp-phone-error')).toHaveCount(0)

    await input.fill('5876543210')                 // 10 digits but starts with 5
    await expect(page.getByTestId('parent-otp-phone-error')).toBeVisible()
    await expect(send).toBeDisabled()
  })

  test('happy path: phone → code (wrong, then right) → new password → sign in', async ({ page }) => {
    await mockSend(page)
    let verifyCalls = 0
    await page.route('**/api/parent/auth/otp/verify', async route => {
      verifyCalls++
      const { code, phone } = route.request().postDataJSON() as { code: string; phone: string }
      expect(phone).toBe('9876543210')
      if (code === '111111') return route.fulfill({ status: 400, json: { error: 'Incorrect code. 4 tries left.', reason: 'incorrect', attemptsLeft: 4 } })
      return route.fulfill({ json: { ok: true, resetToken: TOKEN } })
    })
    let resetBody: Record<string, string> | null = null
    await page.route('**/api/parent/auth/otp/reset', route => {
      resetBody = route.request().postDataJSON() as Record<string, string>
      return route.fulfill({ json: { ok: true } })
    })

    await page.goto('/parent/forgot-password')
    await page.getByTestId('parent-otp-phone-input').fill('98765 43210')
    await page.getByTestId('parent-otp-send-btn').click()

    // Step 2 — code. Number is masked, boxes auto-submit on the 6th digit.
    await expect(page.getByText('+91 ••••••3210')).toBeVisible()   // shown in the subtitle
    await typeCode(page, '111111')
    await expect(page.getByTestId('auth-error-text')).toContainText('4 tries left')
    for (let i = 0; i < 6; i++) await expect(page.getByTestId(`parent-otp-digit-${i}`)).toHaveValue('') // cleared for retry

    await typeCode(page, '482913')
    await expect(page.getByTestId('parent-forgot-step-password')).toBeVisible()
    expect(verifyCalls).toBe(2)

    // Step 3 — password rules gate the button.
    const button = page.getByTestId('parent-otp-reset-btn')
    await expect(button).toBeDisabled()
    await page.getByTestId('parent-otp-new-password-input').fill('short')
    await expect(button).toBeDisabled()
    await page.getByTestId('parent-otp-new-password-input').fill('NewPassw0rd!')
    await page.getByTestId('parent-otp-confirm-password-input').fill('Different123')
    await expect(button).toBeDisabled()
    await page.getByTestId('parent-otp-confirm-password-input').fill('NewPassw0rd!')
    await expect(button).toBeEnabled()
    await button.click()

    await expect(page.getByTestId('parent-otp-success')).toBeVisible()
    expect(resetBody).toEqual({ token: TOKEN, newPassword: 'NewPassw0rd!', confirmPassword: 'NewPassw0rd!' })

    // Then the sign-in page, with a confirmation.
    await page.waitForURL(/\/parent\/login\?reset=1/, { timeout: 10000 })
    await expect(page.getByTestId('parent-password-updated-notice')).toContainText('Password updated')
  })

  test('code step: resend is locked behind a countdown, then works', async ({ page }) => {
    await goToCodeStep(page)
    await expect(page.getByTestId('parent-otp-resend-countdown')).toBeVisible()
    await expect(page.getByTestId('parent-otp-resend-btn')).toHaveCount(0)

    await expect(page.getByTestId('parent-otp-resend-btn')).toBeVisible({ timeout: 6000 })
    await page.getByTestId('parent-otp-resend-btn').click()
    await expect(page.getByTestId('parent-otp-resend-countdown')).toBeVisible() // cooldown restarts
  })

  test('code step: "wrong number" returns to the phone step', async ({ page }) => {
    await goToCodeStep(page)
    await page.getByTestId('parent-otp-change-number-btn').click()
    await expect(page.getByTestId('parent-forgot-step-phone')).toBeVisible()
  })

  test('rate limit / server messages are shown, not swallowed', async ({ page }) => {
    await mockSend(page, { error: 'Too many codes requested for this number. Please try again later.', retryAfter: 1800 }, 429)
    await page.goto('/parent/forgot-password')
    await page.getByTestId('parent-otp-phone-input').fill('9876543210')
    await page.getByTestId('parent-otp-send-btn').click()
    await expect(page.getByTestId('auth-error-text')).toContainText('Too many codes')
    await expect(page.getByTestId('parent-forgot-step-phone')).toBeVisible()
  })

  test('expired reset session offers to start again', async ({ page }) => {
    await mockSend(page)
    await page.route('**/api/parent/auth/otp/verify', r => r.fulfill({ json: { ok: true, resetToken: TOKEN } }))
    await page.route('**/api/parent/auth/otp/reset', r =>
      r.fulfill({ status: 400, json: { error: 'This reset session has expired. Please start again.', reason: 'expired' } }))
    await page.goto('/parent/forgot-password')
    await page.getByTestId('parent-otp-phone-input').fill('9876543210')
    await page.getByTestId('parent-otp-send-btn').click()
    await typeCode(page, '482913')
    await page.getByTestId('parent-otp-new-password-input').fill('NewPassw0rd!')
    await page.getByTestId('parent-otp-confirm-password-input').fill('NewPassw0rd!')
    await page.getByTestId('parent-otp-reset-btn').click()
    await expect(page.getByTestId('auth-error-text')).toContainText('expired')
    await page.getByTestId('parent-otp-start-over-btn').click()
    await expect(page.getByTestId('parent-forgot-step-phone')).toBeVisible()
  })

  test('email fallback sends the existing reset link', async ({ page }) => {
    let body: Record<string, string> | null = null
    await page.route('**/api/parent/auth/forgot-password', r => {
      body = r.request().postDataJSON() as Record<string, string>
      return r.fulfill({ json: { success: true } })
    })
    await page.goto('/parent/forgot-password')
    await page.getByTestId('parent-otp-use-email-btn').click()
    await page.getByTestId('parent-otp-email-input').fill('parent@example.com')
    await page.getByTestId('parent-otp-email-send-btn').click()
    await expect(page.getByTestId('parent-forgot-step-emailSent')).toContainText('parent@example.com')
    expect(body).toEqual({ identifier: 'parent@example.com' })
  })

  test('fits a 375px phone screen with no sideways scrolling on every step', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

    await page.goto('/parent/forgot-password')
    expect(await noOverflow()).toBe(true)

    await page.route('**/api/parent/auth/otp/verify', r => r.fulfill({ json: { ok: true, resetToken: TOKEN } }))
    await mockSend(page)
    await page.getByTestId('parent-otp-phone-input').fill('9876543210')
    await page.getByTestId('parent-otp-send-btn').click()
    await expect(page.getByTestId('parent-otp-digit-5')).toBeVisible()
    expect(await noOverflow()).toBe(true)
    const first = await page.getByTestId('parent-otp-digit-0').boundingBox()
    const last = await page.getByTestId('parent-otp-digit-5').boundingBox()
    expect(first!.x).toBeGreaterThanOrEqual(0)
    expect(last!.x + last!.width).toBeLessThanOrEqual(375)

    await typeCode(page, '482913')
    await expect(page.getByTestId('parent-otp-new-password-input')).toBeVisible()
    expect(await noOverflow()).toBe(true)
  })
})

test.describe('Parent login — phone/email input rules', () => {
  test('a pasted +91 number is cleaned to 10 digits on blur and sent that way', async ({ page }) => {
    let sent: Record<string, string> | null = null
    await page.route('**/api/parent/auth/login', r => {
      sent = r.request().postDataJSON() as Record<string, string>
      return r.fulfill({ status: 401, json: { error: 'Invalid email/phone or password' } })
    })
    await page.goto('/parent/login')
    const id = page.getByTestId('parent-email-input')
    await id.fill('+91 98765-43210')
    await id.blur()
    await expect(id).toHaveValue('9876543210')

    await page.getByTestId('auth-password-input').fill('whatever123')
    await page.getByTestId('parent-submit-btn').click()
    await expect(page.getByTestId('auth-error-text')).toBeVisible()
    expect(sent).toEqual({ identifier: '9876543210', password: 'whatever123' })
  })

  test('a malformed phone is rejected before any request is made', async ({ page }) => {
    let called = false
    await page.route('**/api/parent/auth/login', r => { called = true; return r.fulfill({ status: 401, json: { error: 'x' } }) })
    await page.goto('/parent/login')
    await page.getByTestId('parent-email-input').fill('12345')
    await page.getByTestId('auth-password-input').fill('whatever123')
    await page.getByTestId('parent-submit-btn').click()
    await expect(page.getByTestId('auth-error-text')).toContainText('10-digit Indian mobile')
    expect(called).toBe(false)
  })

  test('an email is sent untouched', async ({ page }) => {
    let sent: Record<string, string> | null = null
    await page.route('**/api/parent/auth/login', r => {
      sent = r.request().postDataJSON() as Record<string, string>
      return r.fulfill({ status: 401, json: { error: 'Invalid email/phone or password' } })
    })
    await page.goto('/parent/login')
    await page.getByTestId('parent-email-input').fill('Parent@Example.com')
    await page.getByTestId('auth-password-input').fill('whatever123')
    await page.getByTestId('parent-submit-btn').click()
    await expect(page.getByTestId('auth-error-text')).toBeVisible()
    expect(sent).toEqual({ identifier: 'Parent@Example.com', password: 'whatever123' })
  })

  test('"Forgot password?" leads to the WhatsApp flow', async ({ page }) => {
    await page.goto('/parent/login')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page).toHaveURL(/\/parent\/forgot-password/)
    await expect(page.getByTestId('parent-otp-phone-input')).toBeVisible()
  })
})
