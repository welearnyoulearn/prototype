// End to end: Daily Newspaper + Rewards Marketplace through all four portals, with real logins.
//
//   platform admin builds today's editions → student reads, says "I've read it", answers, earns points →
//   student orders a pencil → parent orders an eraser for the child → WLYL sees the counts, closes the run and
//   marks the school's parcel sent → school admin taps "Parcel arrived", hands out one item and cannot deliver
//   the other → the student sees "Collected" and the refunded points.
//
// It seeds its own school and users straight into the database, so it only runs against a throwaway LOCAL
// database and refuses anything else:
//   E2E_LOCAL_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/wlyl_e2e PLAYWRIGHT_BASE_URL=http://localhost:3400 \
//     npx playwright test e2e/newspaper-rewards.spec.ts
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
// Serial (each step builds on the last) and generous: in dev mode a portal's first visit compiles for 10-20 s,
// and the newspaper itself makes the student wait 20 s before "I've read it".
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const RUN = `${Date.now()}`.slice(-7)
const PASSWORD = 'E2e-Test-Pass-123'
const ids = { school: 0, student: 0, parent: 0 }
const who = {
  platform: `e2e-platform-${RUN}@test.invalid`,
  admin: `e2e-admin-${RUN}@test.invalid`,
  parent: `e2e-parent-${RUN}@test.invalid`,
  roll: `e2e-stu-${RUN}`,
}
let pool: Pool

const balance = async () => (await pool.query<{ b: number }>(
  `SELECT COALESCE(SUM(points), 0)::int AS b FROM student_points WHERE student_id = $1`, [ids.student])).rows[0].b

test.beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL, ssl: false, max: 2 })
  const hash = await bcrypt.hash(PASSWORD, 10)
  ids.school = (await pool.query<{ id: number }>(`INSERT INTO schools (name, city) VALUES ($1, 'Hyderabad') RETURNING id`, [`E2E Newspaper School ${RUN}`])).rows[0].id
  await pool.query(`INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`, [ids.school])
  for (const key of ['student-portal', 'parent-portal', 'daily-newspaper', 'rewards-marketplace']) {
    await pool.query(`INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES ($1, $2, TRUE)`, [ids.school, key])
  }
  await pool.query(`INSERT INTO classes (school_id, grade, section) VALUES ($1, '6', 'A')`, [ids.school])
  for (const [email, role, schoolId] of [[who.platform, 'platform_admin', null], [who.admin, 'school_admin', ids.school]] as const) {
    await pool.query(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed, status, full_name)
       VALUES ($1, $2, $3, $4, $5, FALSE, TRUE, 'active', $6)`,
      [email, `E2E-${role}-${RUN}`, hash, role, schoolId, `E2E ${role}`])
  }
  ids.student = (await pool.query<{ id: number }>(
    `INSERT INTO students (school_id, name, grade, section, roll_number, school_roll_number, password_hash, password_changed, date_of_birth, status)
     VALUES ($1, 'Anaya Test', '6', 'A', $2, 5, $3, TRUE, '2014-05-01', 'active') RETURNING id`, [ids.school, who.roll, hash])).rows[0].id
  ids.parent = (await pool.query<{ id: number }>(
    `INSERT INTO parents (school_id, name, email, phone, password_hash, password_changed, date_of_birth) VALUES ($1, 'Parent Test', $2, $3, $4, TRUE, '1985-03-01') RETURNING id`,
    [ids.school, who.parent, `9${RUN.padStart(9, '0')}`, hash])).rows[0].id
  await pool.query(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [ids.student, ids.parent])
  // Enough points for a pencil (150) from the start, as if the child had been reading for a while.
  await pool.query(`INSERT INTO student_points (student_id, school_id, action_type, points) VALUES ($1, $2, 'e2e_seed', 300)`, [ids.student, ids.school])
  // A clean run for this test: close any run left open by earlier runs.
  await pool.query(`UPDATE reward_runs SET closed_at = NOW() WHERE closed_at IS NULL`)
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
  await expect(ack).toBeEnabled({ timeout: 30_000 })
  await ack.click()
  await expect(page.getByTestId('newspaper-question')).toBeVisible()
  await page.getByTestId('newspaper-option-0').click()
  await page.getByTestId('newspaper-submit').click()
  await expect(page.getByTestId('newspaper-result')).toBeVisible()
  await expect(page.getByTestId('newspaper-points')).toHaveText(/\+(2|5) points/)
  expect([302, 305]).toContain(await balance())
})

test('student orders a pencil and is told to collect it from the school office', async ({ page }) => {
  await login(page, '/api/student/auth/login', { rollNumber: who.roll, password: PASSWORD })
  await page.goto('/student?tab=rewards')
  const pencil = page.locator('[data-testid^="rewards-item-"]', { hasText: 'Pencil' })
  await pencil.getByRole('button', { name: 'Get it' }).click()
  await pencil.getByRole('button', { name: /Use 150 points/ }).click()
  await expect(page.getByTestId('rewards-notice')).toContainText('school office')
  await expect(page.locator('[data-testid^="rewards-order-row-"]').first()).toContainText('Pencil')
})

test('parent orders an eraser for the child', async ({ page }) => {
  await login(page, '/api/parent/auth/login', { identifier: who.parent, password: PASSWORD })
  await page.goto('/parent')
  // Choosing the child resets the parent portal to Overview, so open Rewards from the menu as a parent would.
  // Wait for the child's dashboard first: clicking earlier is undone when the portal selects the child.
  await expect(page.getByText('Your Child')).toBeVisible({ timeout: 90_000 })
  await page.getByText('Rewards', { exact: true }).first().click()
  const eraser = page.locator('[data-testid^="rewards-item-"]', { hasText: 'Eraser' })
  await eraser.getByRole('button', { name: 'Get it' }).click({ timeout: 30_000 })
  await eraser.getByRole('button', { name: /Use 150 points/ }).click()
  await expect(page.getByTestId('rewards-notice')).toContainText('for Anaya')
  const placedBy = (await pool.query<{ placed_by: string }>(`SELECT placed_by FROM reward_orders WHERE student_id = $1 ORDER BY id`, [ids.student])).rows.map(r => r.placed_by)
  expect(placedBy).toEqual(['student', 'parent'])
})

test('WLYL sees the item counts, closes the run and marks the parcel sent', async ({ page }) => {
  await login(page, '/api/auth/login', { email: who.platform, password: PASSWORD })
  await page.goto('/platform-admin/rewards')
  await expect(page.getByTestId(`rewards-open-school-${ids.school}`)).toContainText(/Eraser ×1/)
  await expect(page.getByTestId(`rewards-open-school-${ids.school}`)).toContainText(/Pencil ×1/)
  await page.getByTestId('rewards-close-run').click()
  await page.getByRole('button', { name: 'Close run' }).last().click()
  await expect(page.getByTestId('rewards-admin-note')).toBeVisible()
  const sent = page.locator(`[data-testid^="rewards-mark-sent-"][data-testid$="-${ids.school}"]`)
  await sent.click()
  await page.getByRole('button', { name: 'Mark sent' }).click()
  await expect(sent).toHaveCount(0)
  const notice = await pool.query(`SELECT 1 FROM notifications WHERE recipient_school_id = $1 AND type = 'reward_parcel'`, [ids.school])
  expect(notice.rowCount).toBe(1)
})

test('school admin: parcel arrived, one collected, one cannot be delivered', async ({ page }) => {
  await login(page, '/api/auth/login', { email: who.admin, password: PASSWORD })
  await page.goto('/school-admin?tab=rewards')
  await page.locator('[data-testid^="rewards-arrived-"]').click({ timeout: 90_000 })
  await expect(page.locator('[data-testid^="rewards-arrived-"]')).toHaveCount(0)
  const orders = (await pool.query<{ id: number; item_name: string }>(`SELECT id, item_name FROM reward_orders WHERE student_id = $1 ORDER BY id`, [ids.student])).rows
  const pencil = orders.find(o => o.item_name === 'Pencil')!
  const eraser = orders.find(o => o.item_name === 'Eraser')!
  await page.getByTestId(`rewards-tick-${pencil.id}`).check()
  await page.getByTestId('rewards-collect-selected').click()
  await expect(page.getByTestId(`rewards-tick-${pencil.id}`)).toHaveCount(0)
  const before = await balance()
  await page.getByTestId(`rewards-cant-${eraser.id}`).click()
  await page.getByRole('button', { name: 'Return the points' }).click()
  await expect(page.getByTestId(`rewards-tick-${eraser.id}`)).toHaveCount(0)
  expect(await balance()).toBe(before + 150)
})

test('the student sees Collected and was told at every step', async ({ page }) => {
  await login(page, '/api/student/auth/login', { rollNumber: who.roll, password: PASSWORD })
  await page.goto('/student?tab=rewards')
  const rows = page.locator('[data-testid^="rewards-order-row-"]')
  await expect(rows.filter({ hasText: 'Pencil' }).locator('[aria-current="step"]')).toHaveText('Collected')
  await expect(rows.filter({ hasText: 'Eraser' })).toContainText('points returned')
  const messages = (await pool.query<{ message: string }>(
    `SELECT message FROM notifications WHERE recipient_student_id = $1 AND type = 'reward_order' ORDER BY id`, [ids.student])).rows.map(r => r.message)
  expect(messages.some(m => m.includes('points held'))).toBe(true)
  expect(messages.some(m => m.includes('on the way'))).toBe(true)
  expect(messages.some(m => m.includes('Collect it from your school management (school office)'))).toBe(true)
  expect(messages.some(m => m.startsWith('✓ Collected'))).toBe(true)
  expect(messages.some(m => m.includes('points are back'))).toBe(true)
})
