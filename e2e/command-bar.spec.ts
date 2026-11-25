import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { createAdminSchool, type AdminSchool } from './fixtures/admin-school'

// #514 — the command bar finds what is typed, and each result opens the right screen.

test.describe.serial('Command bar search (#514)', () => {
  let school: AdminSchool

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    school = await createAdminSchool('cmdk')
    for (const name of ['Aarav First', 'Bala Second', 'Chitra Third', 'Dev Fourth', 'Esha Fifth', 'Zoya Needle']) await school.addStudent(name)
    await pool.query(
      `INSERT INTO teachers (school_id, name, email, phone, subject, status, password_changed)
       VALUES ($1, 'Meera Maths', $2, '9000000011', 'Mathematics', 'active', TRUE), ($1, 'Ravi Science', $3, '9000000012', 'Science', 'active', TRUE)`,
      [school.schoolId, `meera-${school.suffix}@test.invalid`, `ravi-${school.suffix}@test.invalid`])
  })
  test.afterAll(async () => { await school?.cleanup() })

  async function search(page: import('@playwright/test').Page, baseURL: string, text: string) {
    await school.signIn(page, baseURL)
    await page.goto('/school-admin')
    const input = page.getByPlaceholder(/Search anything/)
    await expect(async () => {
      if (!await input.isVisible()) await page.keyboard.press('Control+k')
      await expect(input).toBeVisible({ timeout: 1000 })
    }).toPass()
    await input.fill(text)
    const panel = input.locator('xpath=ancestor::div[2]')
    await expect(panel.getByText(/\d+ results?$|^No results for/)).toBeVisible()
    return panel
  }

  test('nothing matches: no results', async ({ page, baseURL }) => {
    const panel = await search(page, baseURL!, 'zzzzqqq')
    await expect(panel.getByText(/^No results for/)).toBeVisible()
    await expect(panel.getByText('Aarav First')).toHaveCount(0)
  })

  test('finds the typed student only, and opens the student list', async ({ page, baseURL }) => {
    const panel = await search(page, baseURL!, 'needle')
    await expect(panel.getByText('Zoya Needle')).toBeVisible()
    await expect(panel.getByText('Aarav First')).toHaveCount(0)
    await expect(panel.getByText('Meera Maths')).toHaveCount(0)
    await panel.getByText('Zoya Needle').click()
    await expect(page).toHaveURL(/tab=students/)
    await expect(page.getByText('Aarav First')).toBeVisible()
  })

  test('finds the typed teacher and opens staff', async ({ page, baseURL }) => {
    const panel = await search(page, baseURL!, 'ravi')
    await expect(panel.getByText('Meera Maths')).toHaveCount(0)
    await panel.getByText('Ravi Science').click()
    await expect(page).toHaveURL(/tab=staff/)
  })

  test('menu entries are found too', async ({ page, baseURL }) => {
    const panel = await search(page, baseURL!, 'export')
    await expect(panel.getByText('Export Data')).toBeVisible()
    await expect(panel.getByText('1 result', { exact: true })).toBeVisible()
  })
})
