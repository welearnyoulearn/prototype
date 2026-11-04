// End to end: the Daily Newspaper with real logins.
//
//   platform admin builds today's editions → student reads, says "I've read it", answers and earns points →
//   the result stays after a reload and a second answer is refused → platform admin pulls the edition and the
//   student no longer sees it.
//
// It seeds its own school and users straight into the database, so it only runs against a throwaway LOCAL
// database and refuses anything else:
//   E2E_LOCAL_DATABASE_URL=postgresql://postgres@127.0.0.1:55444/wlyl_e2e PLAYWRIGHT_BASE_URL=http://localhost:3400 \
//     npx playwright test e2e/newspaper.spec.ts
// The app under test must use the same database. Without GROQ_API_KEY the build uses the reviewed topic bank
// (the one-note fallback), which is exactly what a failed night looks like.
import { test, expect as baseExpect, type Page } from '@playwright/test'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

// In dev mode every route compiles on its first request (often 5-10 s), so assertions wait up to 30 s.
const expect = baseExpect.configure({ timeout: 30_000 })

const DB_URL = process.env.E2E_LOCAL_DATABASE_URL
const isLocal = !!DB_URL && ['127.0.0.1', 'localhost'].includes(new URL(DB_URL).hostname)
test.skip(!isLocal, 'set E2E_LOCAL_DATABASE_URL to a throwaway local database (the spec seeds data directly)')
// Serial (each step builds on the last) and generous: a portal's first visit in dev mode compiles for 10-30 s,
// and the newspaper itself makes the student wait 20 s before "I've read it".
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const RUN = `${Date.now()}`.slice(-7)
const PASSWORD = 'E2e-Test-Pass-123'
const ids = { school: 0, student: 0 }
const who = { platform: `e2e-platform-${RUN}@test.invalid`, roll: `e2e-stu-${RUN}` }
let pool: Pool

const balance = async () => (await pool.query<{ b: number }>(
  `SELECT COALESCE(SUM(points), 0)::int AS b FROM student_points WHERE student_id = $1`, [ids.student])).rows[0].b

test.beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, ssl: false, max: 2 })
  const hash = await bcrypt.hash(PASSWORD, 10)
  ids.school = (await pool.query<{ id: number }>(`INSERT INTO schools (name, city) VALUES ($1, 'Hyderabad') RETURNING id`, [`E2E Newspaper School ${RUN}`])).rows[0].id
  await pool.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`, [ids.school])
  for (const key of ['student-portal', 'daily-newspaper']) {
    await pool.query(`INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES ($1, $2, TRUE)`, [ids.school, key])
  }
  await pool.query(`INSERT INTO classes (school_id, grade, section) VALUES ($1, '6', 'A')`, [ids.school])
  await pool.query(
    `INSERT INTO users (email, school_code, password_hash, role, first_login, profile_completed, status, full_name)
     VALUES ($1, $2, $3, 'platform_admin', FALSE, TRUE, 'active', 'E2E platform')`,
    [who.platform, `E2E-platform_admin-${RUN}`, hash])
  ids.student = (await pool.query<{ id: number }>(
    `INSERT INTO students (school_id, name, grade, section, roll_number, school_roll_number, password_hash, password_changed, date_of_birth, status)
     VALUES ($1, 'Anaya Test', '6', 'A', $2, 5, $3, TRUE, '2014-05-01', 'active') RETURNING id`, [ids.school, who.roll, hash])).rows[0].id
})

test.afterAll(async () => { await pool?.end() })

async function login(page: Page, url: string, body: Record<string, string>) {
  const res = await page.request.post(url, { data: body })
  expect(res.status(), `${url} → ${await res.text()}`).toBe(200)
}

test('platform admin builds today\'s newspaper', async ({ page }) => {
  await login(page, '/api/auth/login', { email: who.platform, password: PASSWORD })
  await page.goto('/platform-admin/newspaper')
  await page.getByTestId('newspaper-build-now').click()
  await expect(page.getByTestId('newspaper-build-report')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('[data-testid^="newspaper-edition-"]').first()).toBeVisible()
})

test('student reads, says "I\'ve read it", answers and earns points', async ({ page }) => {
  const hourIST = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))
  test.skip(hourIST < 6, 'before 06:00 IST students still see yesterday\'s edition')
  await login(page, '/api/student/auth/login', { rollNumber: who.roll, password: PASSWORD })
  await page.goto('/student?tab=newspaper')
  await expect(page.getByTestId('newspaper-item-1')).toBeVisible({ timeout: 90_000 })
  const ack = page.getByTestId('newspaper-ack')
  await expect(ack).toBeDisabled()
  await expect(ack).toBeEnabled()
  await ack.click()
  await expect(page.getByTestId('newspaper-question')).toBeVisible()
  await page.getByTestId('newspaper-option-0').click()
  await page.getByTestId('newspaper-submit').click()
  await expect(page.getByTestId('newspaper-result')).toBeVisible()
  await expect(page.getByTestId('newspaper-points')).toHaveText(/\+(2|5) points/)
  expect([2, 5]).toContain(await balance())
})

test('the result stays after a reload and a second answer pays nothing', async ({ page }) => {
  await login(page, '/api/student/auth/login', { rollNumber: who.roll, password: PASSWORD })
  const before = await balance()
  await page.goto('/student?tab=newspaper')
  await expect(page.getByTestId('newspaper-result')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('newspaper-ack')).toHaveCount(0)
  const again = await page.request.post('/api/student/newspaper/answer', { data: { selected_index: 1 } })
  expect(again.status()).toBe(409)
  expect(await balance()).toBe(before)
})

test('a pulled edition disappears for the student', async ({ page }) => {
  await login(page, '/api/auth/login', { email: who.platform, password: PASSWORD })
  await page.goto('/platform-admin/newspaper')
  const { rows: [ed] } = await pool.query<{ id: number }>(
    `SELECT e.id FROM news_attempts a JOIN news_editions e ON e.id = a.edition_id WHERE a.student_id = $1`, [ids.student])
  await page.getByTestId(`newspaper-pull-edition-${ed.id}`).click()
  await page.getByRole('button', { name: 'Pull it' }).click()
  await expect(page.getByTestId(`newspaper-pull-edition-${ed.id}`)).toHaveText(/Restore edition/)

  await login(page, '/api/student/auth/login', { rollNumber: who.roll, password: PASSWORD })
  await page.goto('/student?tab=newspaper')
  await expect(page.getByTestId('newspaper-not-ready')).toBeVisible({ timeout: 90_000 })

  // Put it back so a later run on the same database starts from the same state.
  await pool.query(`UPDATE news_editions SET status = 'published' WHERE id = $1`, [ed.id])
})
