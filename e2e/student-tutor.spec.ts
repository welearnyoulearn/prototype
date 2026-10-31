import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'

// Student AI tutor (issue #407): API guards, and the chat UI rendering a streamed
// NDJSON answer with its textbook source chips (the model call itself is mocked).

test('unauthenticated POST /api/student/tutor → 401', async ({ request }) => {
  const res = await request.post('/api/student/tutor', { data: { message: 'What is photosynthesis?' } })
  expect(res.status()).toBe(401)
})

test.describe.serial('Student AI tutor — signed-in student on an AI Pro school', () => {
  const ts = Date.now()
  const PASS = 'Tutor#2026x'
  let platform = ''
  let schoolId = 0
  let student: APIRequestContext | null = null
  let setupError = ''

  test.beforeAll(async () => {
    test.setTimeout(180000)
    try {
      platform = await platformAdminCookie()
      const school = await createSchool(platform, { name: `Tutor School ${ts}`, email: `tutor${ts}@e2etest.com`, phone: `9${String(ts).slice(-9)}` })
      schoolId = school.id
      await setSubscription(platform, schoolId, 'premium')
      const ai = await fetch(`${BASE}/api/schools/${schoolId}/ai-access`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: platform }, body: JSON.stringify({ tier: 'ai_pro' }) })
      if (!ai.ok) throw new Error(`could not set ai_pro: ${ai.status}`)

      const admin = await pwRequest.newContext({ baseURL: BASE })
      if ((await admin.post('/api/auth/login', { data: { email: school.email, password: school.temp_password } })).status() !== 200) throw new Error('admin login failed')
      if ((await admin.post('/api/auth/change-password', { data: { currentPassword: school.temp_password, newPassword: PASS } })).status() !== 200) throw new Error('admin password change failed')
      await admin.post('/api/classes', { data: { school_id: schoolId, grade: '9', section: 'A' } })
      const bulk = await admin.post('/api/students/bulk', { data: { school_id: schoolId, students: [
        { name: 'Tara Tutor', grade: '9', section: 'A', school_roll_number: 1, parent_name: 'Parent of Tara', parent_phone: `8${String(ts).slice(-9)}`, parent_email: `tp${ts}@e2etest.com` },
      ] } })
      if (bulk.status() !== 201) throw new Error(`student bulk create failed: ${bulk.status()}`)
      const cred = ((await bulk.json()) as { credentials: { students: { login: string; temp_password: string }[] } }).credentials.students[0]

      student = await pwRequest.newContext({ baseURL: BASE })
      if ((await student.post('/api/student/auth/login', { data: { rollNumber: cred.login, password: cred.temp_password } })).status() !== 200) throw new Error('student login failed')
      if ((await student.post('/api/student/auth/change-password', { data: { currentPassword: cred.temp_password, newPassword: PASS } })).status() !== 200) throw new Error('student password change failed')
    } catch (err) {
      setupError = err instanceof Error ? err.message : String(err)
    }
  })

  test.afterAll(async () => {
    if (schoolId) await fetch(`${BASE}/api/schools/${schoolId}`, { method: 'DELETE', headers: { Cookie: platform } }).catch(() => {})
  })

  test('invalid body → 400; someone else\'s session → 404', async () => {
    test.skip(!student, `No AI Pro student in this environment: ${setupError}`)
    expect((await student!.post('/api/student/tutor', { data: { message: '   ' } })).status()).toBe(400)
    expect((await student!.post('/api/student/tutor', { data: { message: 'x'.repeat(1001) } })).status()).toBe(400)
    expect((await student!.post('/api/student/tutor', { data: { message: 'Hi', sessionId: -1 } })).status()).toBe(400)
    expect((await student!.post('/api/student/tutor', { data: { message: 'Hi', sessionId: 2147483000 } })).status()).toBe(404)
    expect((await student!.get('/api/student/tutor')).status()).toBe(200)
  })

  test('chat renders a streamed answer and its source chip', async ({ browser }) => {
    test.setTimeout(120000)
    test.skip(!student, `No AI Pro student in this environment: ${setupError}`)
    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } })
    await context.addCookies((await student!.storageState()).cookies)
    const page = await context.newPage()

    await page.route('**/api/student/tutor**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { sessions: [] } })
      const lines = [
        { type: 'sources', sources: [{ n: 1, title: 'Science Class 9', materialType: 'textbook', subject: 'Science', page: 42, url: '/api/materials/file?key=sci9.pdf#page=42' }] },
        { type: 'delta', text: 'Plants make food using **sunlight** ' },
        { type: 'delta', text: 'in their leaves [1].' },
        { type: 'done', sessionId: 1 },
      ]
      await route.fulfill({ status: 200, contentType: 'text/x-ndjson', body: lines.map(l => JSON.stringify(l)).join('\n') + '\n' })
    })

    await page.goto('/student')
    await page.getByTestId('student-nav-ai-hub').click()
    await expect(page.getByTestId('tutor-chat')).toBeVisible({ timeout: 60000 })
    await page.getByTestId('tutor-input').fill('How do plants make food?')
    await page.getByTestId('tutor-input').press('Enter')

    await expect(page.getByTestId('tutor-message-user')).toHaveText('How do plants make food?')
    await expect(page.getByTestId('tutor-message-assistant')).toContainText('Plants make food using sunlight in their leaves [1].')
    await expect(page.getByTestId('tutor-message-assistant').locator('strong')).toHaveText('sunlight')
    const chip = page.getByTestId('tutor-source-1')
    await expect(chip).toContainText('Science Class 9')
    await expect(chip).toHaveAttribute('href', '/api/materials/file?key=sci9.pdf#page=42')
    await expect(chip).toHaveAttribute('target', '_blank')
    await context.close()
  })
})
