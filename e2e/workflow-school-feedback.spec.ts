import { test, expect } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Admin-side assertions use direct API calls with the school admin's session
// cookie (same approach as workflow-fee-management.spec.ts) rather than
// driving the school-admin UI through login → change-password → profile-setup:
// that browser flow is already known-flaky in this suite (see the test.skip
// entries in workflow-school-admin.spec.ts) and API login on a fresh school
// works immediately, without requiring a password change first.
async function loginSchoolAdmin(identifier: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    redirect: 'manual',
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  const authCookie = setCookies.find(c => c.startsWith('wlyl-auth='))
  if (!authCookie) throw new Error(`Login failed for ${identifier} — status ${res.status}`)
  return authCookie.split(';')[0]
}

test.describe.serial('School Feedback', () => {
  let schoolId: number
  let schoolCode: string
  let schoolPass: string
  let adminCookie: string

  test.beforeAll(async () => {
    const platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie)
    schoolId = school.id
    schoolCode = school.school_code
    schoolPass = school.temp_password
    await setSubscription(platformCookie, schoolId, 'premium')
    adminCookie = await loginSchoolAdmin(schoolCode, schoolPass)
  })

  test('1. Public form — submit feedback with no login', async ({ page }) => {
    await page.goto(`/feedback/${schoolId}`)
    await expect(page.getByTestId('feedback-card')).toBeVisible()

    await page.getByTestId('feedback-category-select').selectOption('facilities')
    await page.getByTestId('feedback-message-input').fill('The playground equipment needs repair.')
    await page.getByTestId('feedback-submit-btn').click()

    await expect(page.getByTestId('feedback-success')).toBeVisible({ timeout: 10000 })
  })

  test('2. Public form — bogus school id shows not-found', async ({ page }) => {
    await page.goto('/feedback/999999999')
    await expect(page.getByTestId('feedback-not-found')).toBeVisible()
  })

  test('3. School admin — sees the submission with category filter and pagination shape', async () => {
    const res = await fetch(`${BASE}/api/feedback?school_id=${schoolId}&limit=20&offset=0`, {
      headers: { Cookie: adminCookie },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBeGreaterThanOrEqual(1)
    expect(body.data.some((f: { category: string; message: string }) =>
      f.category === 'facilities' && f.message.includes('playground')
    )).toBe(true)

    const filtered = await fetch(`${BASE}/api/feedback?school_id=${schoolId}&category=academics&limit=20&offset=0`, {
      headers: { Cookie: adminCookie },
    })
    const filteredBody = await filtered.json()
    expect(filteredBody.data.every((f: { category: string }) => f.category === 'academics')).toBe(true)
  })

  test('4. School admin — QR endpoint returns a PNG for their own school, forbidden for another', async () => {
    const ok = await fetch(`${BASE}/api/feedback/qr?school_id=${schoolId}`, { headers: { Cookie: adminCookie } })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')

    const other = await fetch(`${BASE}/api/feedback/qr?school_id=${schoolId + 1}`, { headers: { Cookie: adminCookie } })
    expect(other.status).toBe(403)
  })

  test('5. School admin — list endpoint requires auth', async () => {
    const res = await fetch(`${BASE}/api/feedback?school_id=${schoolId}`)
    expect(res.status).toBe(403)
  })

  test('6. Form config — defaults match v1 (category only), config endpoints require auth', async () => {
    const noAuth = await fetch(`${BASE}/api/feedback/config?school_id=${schoolId}`)
    expect(noAuth.status).toBe(403)

    const res = await fetch(`${BASE}/api/feedback/config?school_id=${schoolId}`, { headers: { Cookie: adminCookie } })
    expect(res.status).toBe(200)
    const { field_config } = await res.json()
    expect(field_config.category).toEqual({ enabled: true, required: true })
    expect(field_config.name).toEqual({ enabled: false, required: false })
    expect(field_config.photo).toEqual({ enabled: false, required: false })
  })

  test('7. Form config — enabling a required field is enforced end-to-end, disabled fields are dropped server-side', async () => {
    const put = await fetch(`${BASE}/api/feedback/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ school_id: schoolId, field_config: { name: { enabled: true, required: true } } }),
    })
    expect(put.status).toBe(200)

    // Public form now renders a required Name input.
    const meta = await (await fetch(`${BASE}/api/feedback/meta?school_id=${schoolId}`)).json()
    expect(meta.fields.name).toEqual({ enabled: true, required: true })

    // Submitting without name is rejected...
    const missingName = await fetch(`${BASE}/api/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, category: 'academics', message: 'no name given' }),
    })
    expect(missingName.status).toBe(400)

    // ...but a disabled field's value (phone, never enabled for this school) is silently
    // dropped server-side rather than stored, even though the client sent one.
    const withExtra = await fetch(`${BASE}/api/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, category: 'academics', message: 'has name', name: 'Test Visitor', phone: '9999999999' }),
    })
    expect(withExtra.status).toBe(201)

    const list = await fetch(`${BASE}/api/feedback?school_id=${schoolId}&limit=20&offset=0`, { headers: { Cookie: adminCookie } })
    const { data } = await list.json()
    const stored = data.find((f: { message: string }) => f.message === 'has name')
    expect(stored.name).toBe('Test Visitor')
    expect(stored.phone).toBeNull()
  })

  test('8. Public form — dynamically renders the Name field once enabled', async ({ page }) => {
    await page.goto(`/feedback/${schoolId}`)
    await expect(page.getByTestId('feedback-name-input')).toBeVisible()
    await expect(page.getByTestId('feedback-phone-input')).not.toBeAttached()
  })
})
