import { test, expect } from '@playwright/test'
import pool from '../lib/db'
import { applyStartingTerms, runMonthlyBills } from '../lib/bills'
import { addDays, addYears } from '../lib/planExpiry'
import { todayIST } from '../lib/istDate'
import { BASE, platformAdminCookie, createSchool } from './fixtures/platform-admin'

// A newer plan decision replaces older ones: #497 (cancelled downgrade) and #498 (monthly to yearly).

test.describe.serial('Plan terms are replaced by newer decisions', () => {
  const today = todayIST()
  const nextYear = addDays(addYears(today, 1), -1)
  let cookie = ''

  async function newSchool(tag: string) {
    const ts = Date.now()
    const s = await createSchool(cookie, { name: `Terms ${tag} ${ts}`, email: `terms-${tag}-${ts}@test.invalid`, phone: `9${String(ts).slice(-9)}` })
    return s.id
  }
  async function save(schoolId: number, body: object) {
    const res = await fetch(`${BASE}/api/schools/${schoolId}/subscription`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
    })
    const data = await res.json() as { message?: string; scheduled?: { tier: string } | null }
    expect(res.status, JSON.stringify(data)).toBe(200)
    return data
  }
  const read = async (schoolId: number) => await (await fetch(`${BASE}/api/schools/${schoolId}/subscription`, { headers: { Cookie: cookie } })).json() as
    { tier: string; scheduled: { tier: string; startDate: string } | null }
  const futureTerms = async (schoolId: number) => (await pool.query<{ tier: string; start: string }>(
    `SELECT tier, start_date::text AS start FROM school_plan_terms WHERE school_id = $1 AND start_date > $2::date ORDER BY id`, [schoolId, today])).rows
  const yearly = { tier: 'premium', billingPeriod: 'yearly', agreedPrice: 19990, discountReason: 'test price' }
  const downgrade = { tier: 'basic', billingPeriod: 'yearly', agreedPrice: 4990, discountReason: 'test price' }

  async function schoolWithPendingDowngrade(tag: string) {
    const id = await newSchool(tag)
    await save(id, { ...yearly, plan_end_date: nextYear })
    await save(id, downgrade)
    expect(await futureTerms(id)).toEqual([{ tier: 'basic', start: addDays(nextYear, 1) }])
    return id
  }

  test.beforeAll(async () => { cookie = await platformAdminCookie() })

  test('#497: the waiting downgrade is visible', async () => {
    const id = await schoolWithPendingDowngrade('see')
    expect((await read(id)).scheduled).toMatchObject({ tier: 'basic', startDate: addDays(nextYear, 1) })
  })

  for (const [label, body] of [['renewing', { tier: 'premium', renew: true }], ['saving the current plan again', { tier: 'premium' }]] as const) {
    test(`#497: ${label} cancels the waiting downgrade`, async () => {
      const id = await schoolWithPendingDowngrade('cancel')
      const res = await save(id, body)
      expect(res.message).toContain('cancelled')
      expect(await futureTerms(id)).toEqual([])
      await applyStartingTerms(addDays(nextYear, 1))
      expect((await read(id)).tier).toBe('premium')
    })
  }

  test('#497: choosing a downgrade again leaves only one waiting', async () => {
    const id = await schoolWithPendingDowngrade('twice')
    await save(id, { ...downgrade, tier: 'standard', agreedPrice: 9990 })
    expect((await futureTerms(id)).map(t => t.tier)).toEqual(['standard'])
  })

  test('#497: a downgrade already overtaken by a later saved term is never applied', async () => {
    const id = await schoolWithPendingDowngrade('old-data')
    // Rows as the old code left them: a renewal saved after the downgrade, which stayed in place.
    await pool.query(
      `INSERT INTO school_plan_terms (school_id, tier, start_date, end_date, billing_period, list_price, agreed_price)
       VALUES ($1,'premium',$2,$3,'yearly',19990,19990)`, [id, today, addYears(nextYear, 1)])
    await applyStartingTerms(addDays(nextYear, 1))
    expect((await read(id)).tier).toBe('premium')
  })

  test('an untouched downgrade still starts on its date', async () => {
    const id = await schoolWithPendingDowngrade('apply')
    await applyStartingTerms(addDays(nextYear, 1))
    expect((await read(id)).tier).toBe('basic')
  })

  test('#498: after switching to yearly, the monthly plan fee stops', async () => {
    const monthly = await newSchool('monthly')
    const switched = await newSchool('switched')
    for (const id of [monthly, switched]) {
      await save(id, { tier: 'premium', billingPeriod: 'monthly', agreedPrice: 1999, discountReason: 'test price', plan_end_date: nextYear })
    }
    await save(switched, yearly)

    const month = addDays(today, 62).slice(0, 7)
    await runMonthlyBills(month)
    const planLines = async (id: number) => (await pool.query(
      `SELECT it.description FROM saas_invoice_items it JOIN saas_invoices i ON i.id = it.invoice_id
       WHERE i.school_id = $1 AND i.bill_month = $2::date AND it.description LIKE '% plan, %'`, [id, `${month}-01`])).rowCount
    expect(await planLines(monthly)).toBe(1)
    expect(await planLines(switched)).toBe(0)
  })
})
