import { test, expect, Page, request as playwrightRequest, APIRequestContext } from '@playwright/test'
import { BASE, platformAdminCookie, createSchool, setSubscription } from './fixtures/platform-admin'
import { db, closeDb } from './fixtures/db'

// Student List pagination (#352): 50-row pages, server-side search/filters, accurate
// counts and grade/section options — while the plain unpaginated read (used by the
// fee screens, which aggregate over the whole roster) still returns everyone.

const ts = Date.now()
let schoolId = 0
let adminEmail = ''
let schoolPass = ''
let adminCookie = ''
let ctx: APIRequestContext
let platformCookie = ''

// 100 active (grade 5 A x40, grade 5 "a" x10 — lowercase on purpose, grade 6 B x50) + 20 removed (grade 7 C)
async function seedStudents() {
  const rows: [string, string, string, string][] = []
  let n = 0
  const add = (count: number, grade: string, section: string, status: string) => {
    for (let i = 0; i < count; i++) { n++; rows.push([`Pgtest ${String(n).padStart(3, '0')}`, grade, section, status]) }
  }
  add(40, '5', 'A', 'active'); add(10, '5', 'a', 'active'); add(50, '6', 'B', 'active'); add(20, '7', 'C', 'inactive')
  for (const [i, [name, grade, section, status]] of rows.entries()) {
    await db().query(
      `INSERT INTO students (school_id, name, grade, section, roll_number, school_roll_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [schoolId, name, grade, section, `pgtest-${schoolId}-${i + 1}`, i + 1, status]
    )
  }
}

async function uiLogin(page: Page) {
  await page.goto('/login?role=school')
  await page.getByPlaceholder('you@school.com').fill(adminEmail)
  await page.getByPlaceholder(/password/i).fill(schoolPass)
  await page.getByTestId('auth-submit-btn').click()
  await page.waitForURL(/\/change-password|\/school-admin/, { timeout: 30000 })
  if (page.url().includes('change-password')) {
    const f = page.locator('input[type="password"]')
    await f.nth(0).fill('UITest@1234'); await f.nth(1).fill('UITest@1234')
    await page.getByRole('button', { name: /change|update|set|save/i }).click()
    await page.waitForURL(/\/school-admin/, { timeout: 20000 })
  }
}

const get = (path: string) => ctx.get(`/api/students?school_id=${schoolId}${path}`, { headers: { Cookie: adminCookie } })

test.describe.configure({ mode: 'serial' })

test.describe('Student List pagination (#352)', () => {
  test.beforeAll(async () => {
    test.setTimeout(180000)
    ctx = await playwrightRequest.newContext({ baseURL: BASE, timeout: 60_000 })
    platformCookie = await platformAdminCookie()
    const school = await createSchool(platformCookie, {
      name: `Pagination Test School ${ts}`, phone: `98765${String(ts).slice(-5)}`,
      email: `school${ts}@pagetest.com`, address: '1 Test Lane',
    })
    schoolId = school.id; adminEmail = school.email; schoolPass = school.temp_password
    await setSubscription(platformCookie, schoolId, 'premium')
    const login = await ctx.post('/api/auth/login', { data: { email: adminEmail, password: schoolPass } })
    if (!login.ok()) throw new Error(`Setup login failed — ${login.status()}`)
    const auth = (await ctx.storageState()).cookies.find(c => c.name === 'wlyl-auth')
    if (!auth) throw new Error('No wlyl-auth cookie after login')
    adminCookie = `wlyl-auth=${auth.value}`
    await seedStudents()
  })

  test.afterAll(async () => {
    test.setTimeout(120000)
    await db().query(`DELETE FROM students WHERE school_id = $1`, [schoolId]).catch(() => {})
    await ctx.delete(`/api/schools/${schoolId}`, { headers: { Cookie: platformCookie } }).catch(() => {})
    await ctx.dispose()
    await closeDb()
  })

  test('1. summary returns accurate counts and the class breakdown', async () => {
    const res = await get('&summary=1')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.counts).toEqual({ total: 120, active: 100, inactive: 20 })
    // Sections are upper-cased so "a" and "A" are one class
    const g5a = body.classes.filter((c: { grade: string; section: string }) => c.grade === '5' && c.section === 'A')
    expect(g5a.reduce((n: number, c: { count: number }) => n + c.count, 0)).toBe(50)
  })

  test('2. paginated read returns 50 rows per page with a total', async () => {
    const p1 = await (await get('&status=active&limit=50&offset=0')).json()
    expect(p1.data).toHaveLength(50)
    expect(p1.total).toBe(100)
    const p2 = await (await get('&status=active&limit=50&offset=50')).json()
    expect(p2.data).toHaveLength(50)
    const ids = new Set([...p1.data, ...p2.data].map((s: { id: number }) => s.id))
    expect(ids.size).toBe(100)
    expect([...p1.data, ...p2.data].every((s: { status: string }) => s.status === 'active')).toBe(true)
  })

  test('3. status, section (case-insensitive) and search filter on the server', async () => {
    expect((await (await get('&status=inactive&limit=50')).json()).total).toBe(20)
    expect((await (await get('&status=all&limit=50')).json()).total).toBe(120)
    // grade 5 section A must include the lowercase "a" rows
    expect((await (await get('&status=active&grade=5&section=A&limit=50')).json()).total).toBe(50)
    const one = await (await get('&status=active&q=Pgtest%20042&limit=50')).json()
    expect(one.total).toBe(1)
    expect(one.data[0].name).toBe('Pgtest 042')
    // LIKE wildcards in the search are literal, not patterns
    expect((await (await get('&status=active&q=%25&limit=50')).json()).total).toBe(0)
    expect((await get('&status=bogus&limit=50')).status()).toBe(400)
  })

  test('4. the plain read still returns the whole roster (fee screens depend on it)', async () => {
    const all = await (await get('')).json()
    expect(Array.isArray(all)).toBe(true)
    expect(all).toHaveLength(120)
  })

  test('5. UI: 50-row pages, next/previous, server-side search and filters', async ({ page }) => {
    test.setTimeout(240000)
    await uiLogin(page)
    await expect(page.getByRole('button', { name: /Student Management/i })).toBeVisible({ timeout: 60000 })
    await page.getByRole('button', { name: /Student Management/i }).click()
    await expect(page.getByText('100 active')).toBeVisible({ timeout: 60000 })

    const rows = page.locator('tbody tr')
    await expect(page.getByTestId('students-page-range')).toHaveText('Showing 1–50 of 100')
    await expect(rows).toHaveCount(50)
    await expect(page.getByTestId('students-prev-page')).toBeDisabled()

    await page.getByTestId('students-next-page').click()
    await expect(page.getByTestId('students-page-range')).toHaveText('Showing 51–100 of 100')
    await expect(page.getByTestId('students-next-page')).toBeDisabled()
    await page.getByTestId('students-prev-page').click()
    await expect(page.getByTestId('students-page-range')).toHaveText('Showing 1–50 of 100')

    // Search runs on the server, over students that were never on this page
    await page.getByPlaceholder('Search by name or ID...').fill('Pgtest 099')
    await expect(rows).toHaveCount(1, { timeout: 15000 })
    await expect(page.getByTestId('students-pagination')).toHaveCount(0)
    await page.getByPlaceholder('Search by name or ID...').fill('')

    // Grade/section options come from the summary, not the visible page
    const grade = page.locator('select').first()
    await expect(grade.locator('option')).toHaveText(['All Grades', 'Grade 5', 'Grade 6'])
    await grade.selectOption('5')
    await expect(rows).toHaveCount(50, { timeout: 15000 })
    await expect(page.getByTestId('students-pagination')).toHaveCount(0)   // exactly one page
    await expect(page.locator('select').nth(1).locator('option')).toHaveText(['All Sections', 'Section A'])

    // Removed tab uses its own counts
    await page.getByRole('button', { name: /^Removed/ }).click()
    await expect(rows).toHaveCount(20, { timeout: 15000 })
  })
})
