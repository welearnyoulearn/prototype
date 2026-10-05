import test from 'node:test'
import assert from 'node:assert/strict'
import { isCarriedEntry, carriedBalance, carriedBilled, summarizeCarriedNotes } from '../app/school-admin/components/fee-management/dues'

test('a bill is carried-in when it has a source year or a system category', () => {
  assert.equal(isCarriedEntry({ source_academic_year: '2026-27' }), true)
  assert.equal(isCarriedEntry({ category_name: 'Passout Dues' }), true)
  assert.equal(isCarriedEntry({ category_name: 'Tuition Fee', source_academic_year: null }), false)
})

test('carried balance and billed only count carried-in bills', () => {
  const e = [
    { category_name: 'Previous Year Dues', source_academic_year: '2026-27', balance: '48000', amount_due: '48000' },
    { category_name: 'Tuition Fee', source_academic_year: null, balance: '5500', amount_due: '5500' },
  ]
  assert.equal(carriedBalance(e), 48000)
  assert.equal(carriedBilled(e), 48000)
})

test('the carry-forward note collapses into a short range', () => {
  const months = ['Apr 2026', 'May 2026', 'Jun 2026']
  const notes = 'Carried from 2026-27: ' + months.map(m => `Tuition Fee - ${m}`).join(', ')
  assert.equal(summarizeCarriedNotes(notes, 'x'), 'Tuition Fee Apr 2026 – Jun 2026 (3 bills)')
  assert.equal(summarizeCarriedNotes('Carried from 2026-27: Books Fee - 2026-27', 'x'), 'Books Fee 2026-27')
  assert.equal(summarizeCarriedNotes(null, 'Previous Year Dues (2026-27)'), 'Previous Year Dues (2026-27)')
  assert.equal(summarizeCarriedNotes('Something unexpected', 'x'), 'Something unexpected')
})

import { thisYearFees } from '../app/school-admin/components/fee-management/dues'

test('this-year collection leaves carried dues out of both sides', () => {
  // ₹3,59,000 of this year's fees + ₹1,62,000 carried; ₹10,000 paid, all of it on carried dues
  const r = thisYearFees({ total_due: 521000, total_collected: 10000, total_waived: 0, discretionary_waived: 0, carried_in_due: 162000, carried_in_collected: 10000 })
  assert.deepEqual(r, { collected: 0, net: 359000 })
  // no carried dues: plain collected / (due − waived)
  assert.deepEqual(thisYearFees({ total_due: 1000, total_collected: 400, total_waived: 100 }), { collected: 400, net: 900 })
})

import { carriedOriginYears } from '../app/school-admin/components/fee-management/dues'

test('a bill carried twice names both the oldest source year and the year it was carried out of', () => {
  assert.deepEqual(carriedOriginYears({ source_academic_year: '2026-27', period_label: 'Previous Year Dues (2027-28)' }), ['2026-27', '2027-28'])
  assert.deepEqual(carriedOriginYears({ source_academic_year: '2027-28', period_label: 'Previous Year Dues (2027-28)' }), ['2027-28'])
  assert.deepEqual(carriedOriginYears({ source_academic_year: null, period_label: 'Tuition Fee' }), [])
})
