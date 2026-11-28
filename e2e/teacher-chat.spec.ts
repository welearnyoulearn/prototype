// Teacher Chat (#558): a student asks, the teacher answers, the parent reads, the school reviews.
// Local only: it seeds its own school straight into the database in DATABASE_URL and removes it afterwards.
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Client } from 'pg'
import { test, expect, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? ''
const local = (url: string) => { try { return ['localhost', '127.0.0.1'].includes(new URL(url).hostname) } catch { return false } }

test.describe.serial('Teacher chat', () => {
  test.skip(!local(BASE) || !local(DB), 'Needs a local app and a local DATABASE_URL')

  const password = `E2e!${randomUUID()}aA1`
  const tag = Date.now().toString(36)
  const logins = {
    student: { url: '/api/student/auth/login', body: { rollNumber: `chat-a-${tag}` } },
    classmate: { url: '/api/student/auth/login', body: { rollNumber: `chat-b-${tag}` } },
    teacher: { url: '/api/teacher/auth/login', body: { email: `chat-t-${tag}@test.invalid` } },
    parent: { url: '/api/parent/auth/login', body: { identifier: `chat-p-${tag}@test.invalid` } },
    admin: { url: '/api/auth/login', body: { email: `chat-s-${tag}@test.invalid` } },
  }
  let db: Client
  let school = 0, klass = 0, child = 0, thread = 0
  // Closed after each test, so earlier screens stop refreshing in the background.
  const open: BrowserContext[] = []
  test.afterEach(async () => { await Promise.all(open.splice(0).map(c => c.close())) })

  async function signIn(browser: Browser, who: keyof typeof logins) {
    const context = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } })
    open.push(context)
    const res = await context.request.post(logins[who].url, { data: { ...logins[who].body, password } })
    expect(res.ok(), `${who} sign-in: ${res.status()}`).toBe(true)
    return context
  }
  type ChatBody = { setup: { available: boolean }; threads: { id: number }[]; reports: unknown[] }
  const json = async (res: Awaited<ReturnType<APIRequestContext['get']>>) => ({ status: res.status(), body: await res.json() as ChatBody })

  test.beforeAll(async () => {
    db = new Client({ connectionString: DB })
    await db.connect()
    const id = async (sql: string, args: unknown[]) => (await db.query<{ id: number }>(`${sql} RETURNING id`, args)).rows[0].id
    const hash = await bcrypt.hash(password, 10)
    school = await id(`INSERT INTO schools (name, school_code) VALUES ('Chat E2E School', $1)`, [`chat-e2e-${tag}`])
    // The school admin screen needs a plan.
    await db.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`, [school])
    // Switched on for this school only, so no other test sees it.
    await db.query(`INSERT INTO school_feature_overrides (school_id, feature_key, enabled) SELECT $1, k, TRUE FROM unnest(ARRAY['teacher-chat','student-portal','parent-portal']) k`, [school])
    const teacher = await id(`INSERT INTO teachers (school_id, name, email, password_hash, password_changed, status) VALUES ($1, 'E2E Teacher', $2, $3, TRUE, 'active')`, [school, logins.teacher.body.email, hash])
    klass = await id(`INSERT INTO classes (school_id, grade, section, class_teacher_id) VALUES ($1, '9', 'A', $2)`, [school, teacher])
    await db.query(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Mathematics', $2)`, [klass, teacher])
    const student = (name: string, roll: string) => id(`INSERT INTO students (school_id, name, grade, section, roll_number, password_hash, password_changed, status) VALUES ($1, $2, '9', 'A', $3, $4, TRUE, 'active')`, [school, name, roll, hash])
    child = await student('E2E Student', logins.student.body.rollNumber)
    await student('E2E Classmate', logins.classmate.body.rollNumber)
    const parent = await id(`INSERT INTO parents (school_id, name, email, password_hash, password_changed) VALUES ($1, 'E2E Parent', $2, $3, TRUE)`, [school, logins.parent.body.identifier, hash])
    await db.query(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [child, parent])
    await db.query(`INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed, status) VALUES ($1, $2, $3, 'school_admin', $4, FALSE, TRUE, 'active')`, [logins.admin.body.email, `chat-e2e-${tag}`, hash, school])
  })

  test.afterAll(async () => {
    if (!db) return
    await db.query(`DELETE FROM users WHERE school_id = $1`, [school])
    await db.query(`DELETE FROM schools WHERE id = $1`, [school])
    await db.end()
  })

  test('chat is closed until the school opens the class', async ({ browser }) => {
    const student = await signIn(browser, 'student')
    const admin = await signIn(browser, 'admin')
    expect((await json(await student.request.get('/api/student/chat'))).body.setup.available).toBe(false)
    expect((await admin.request.put('/api/school/chat/classes', { data: { class_id: klass, enabled: true } })).status()).toBe(200)
    expect((await json(await student.request.get('/api/student/chat'))).body.setup.available).toBe(true)
  })

  test('student asks on screen, teacher answers, ticks turn read', async ({ browser }) => {
    test.setTimeout(180_000)
    const student = await signIn(browser, 'student')
    const page = await student.newPage()
    await page.goto('/student?tab=teacher-chat')
    await page.getByTestId('chat-ask').click({ timeout: 90_000 })
    await page.getByTestId('chat-question').fill('How do I factorise this expression?')
    await page.getByTestId('chat-ask-send').click()
    await expect(page.getByTestId('chat-input')).toBeVisible()
    await expect(page.locator('[data-tick="sent"]')).toBeVisible()
    thread = (await json(await student.request.get('/api/student/chat'))).body.threads[0].id

    const teacher = await signIn(browser, 'teacher')
    const inbox = await teacher.newPage()
    await inbox.goto('/teacher?tab=teacher-chat')
    await inbox.getByTestId(`chat-row-${thread}`).click({ timeout: 90_000 })
    await expect(page.locator('[data-tick="read"]')).toBeVisible({ timeout: 20_000 })
    await inbox.getByTestId('chat-input').fill('Take out the common factor first.')
    await inbox.getByTestId('chat-send').click()
    await inbox.getByTestId('chat-mark-answered').click()
    await page.getByTestId('chat-understood').click({ timeout: 20_000 })
    await expect(page.getByTestId('chat-closed-reason')).toBeVisible({ timeout: 20_000 })
  })

  test('parent reads but cannot write; others cannot read', async ({ browser }) => {
    test.setTimeout(120_000)
    const parent = await signIn(browser, 'parent')
    const page = await parent.newPage()
    await page.goto('/parent?tab=teacher-chat')
    await page.getByTestId(`chat-row-${thread}`).click({ timeout: 90_000 })
    await expect(page.getByTestId('chat-thread')).toContainText('Take out the common factor first.')
    await expect(page.getByTestId('chat-input')).toHaveCount(0)
    const write = await parent.request.post(`/api/parent/chat/${thread}/messages?student_id=${child}`, { data: { body: 'hi', client_message_id: randomUUID() } })
    expect([404, 405]).toContain(write.status())

    const classmate = await signIn(browser, 'classmate')
    expect((await classmate.request.get(`/api/student/chat/${thread}`)).status()).toBe(404)
    expect((await classmate.request.get(`/api/teacher/chat/${thread}`)).status()).toBe(401)
    expect((await classmate.request.get('/api/school/chat')).status()).toBe(403)
  })

  test('contact details are refused and a report reaches the school', async ({ browser }) => {
    const student = await signIn(browser, 'student')
    const refused = await student.request.post('/api/student/chat', { data: { subject: 'Mathematics', body: 'call me on 98765 43210', client_message_id: randomUUID() } })
    expect(refused.status()).toBe(422)
    const parent = await signIn(browser, 'parent')
    const reported = await parent.request.post(`/api/parent/chat/${thread}/report?student_id=${child}`, { data: { message_id: null, reason: 'Please look at this' } })
    expect(reported.status()).toBe(201)
    const admin = await signIn(browser, 'admin')
    const overview = (await json(await admin.request.get('/api/school/chat'))).body
    expect(overview.reports).toHaveLength(1)
    expect((await admin.request.get(`/api/school/chat/${thread}`)).status()).toBe(200)
    const { rows } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM chat_access_log WHERE thread_id = $1`, [thread])
    expect(rows[0].n).toBeGreaterThan(0)
  })

  test('chat hours, online status, saved replies and parent alerts', async ({ browser }) => {
    test.setTimeout(180_000)
    const admin = await signIn(browser, 'admin')
    const office = await admin.newPage()
    await office.goto('/school-admin?tab=teacher-chat')
    await office.getByTestId('school-chat-opens').fill('00:00', { timeout: 90_000 })
    await office.getByTestId('school-chat-closes').fill('23:59')
    await office.getByTestId('school-chat-hours-save').click()
    await expect(office.getByTestId('school-chat-stats')).toContainText('E2E Teacher')

    const student = await signIn(browser, 'student')
    const started = await student.request.post('/api/student/chat', { data: { subject: 'Mathematics', body: 'One more doubt', client_message_id: randomUUID() } })
    expect(started.status()).toBe(201)
    const next = (await started.json() as { threadId: number }).threadId

    const parent = await signIn(browser, 'parent')
    const family = await parent.newPage()
    await family.goto('/parent?tab=teacher-chat')
    await family.getByTestId('chat-parent-instant').check({ timeout: 90_000 })

    const teacher = await signIn(browser, 'teacher')
    const inbox = await teacher.newPage()
    await inbox.goto('/teacher?tab=teacher-chat')
    await inbox.getByTestId('chat-teacher-settings').locator('summary').click({ timeout: 90_000 })
    await inbox.getByTestId('chat-saved-input').fill('Show me your working.')
    await inbox.getByTestId('chat-saved-add').click()
    await expect(inbox.getByTestId('chat-teacher-settings')).toContainText('Show me your working.')
    await inbox.getByTestId(`chat-row-${next}`).click()
    await inbox.locator('[data-testid^="chat-saved-use-"]').click()
    await expect(inbox.getByTestId('chat-input')).toHaveValue('Show me your working.')
    await inbox.getByTestId('chat-send').click()

    const page = await student.newPage()
    await page.goto('/student?tab=teacher-chat')
    await page.getByTestId(`chat-row-${next}`).click({ timeout: 90_000 })
    // Chat days are Monday to Saturday in India.
    const sunday = new Date(Date.now() + 330 * 60_000).getUTCDay() === 0
    if (!sunday) await expect(page.getByTestId('chat-online')).toBeVisible({ timeout: 20_000 })

    await expect.poll(async () => (await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE school_id = $1 AND type = 'chat_parent_reply'`, [school])).rows[0].n, { timeout: 20_000 }).toBe(1)
  })

  test('the daily jobs need the cron secret and are safe to run twice', async ({ request }) => {
    const secret = process.env.CRON_SECRET
    expect((await request.get('/api/cron/teacher-chat?run=summary')).status()).toBe(401)
    test.skip(!secret, 'Set CRON_SECRET to run the jobs')
    const headers = { Authorization: `Bearer ${secret}` }
    for (const job of ['summary', 'summary', 'escalate']) expect((await request.get(`/api/cron/teacher-chat?run=${job}`, { headers })).status()).toBe(200)
    expect((await request.get('/api/cron/teacher-chat?run=other', { headers })).status()).toBe(400)
    const { rows } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM notifications WHERE school_id = $1 AND type = 'chat_parent_summary'`, [school])
    expect(rows[0].n).toBe(1)
  })
})
