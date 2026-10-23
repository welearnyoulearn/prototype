import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFeeReportMonths } from './feeReportMonths'

test('merges billed and collected values and sorts across years and IST month boundaries', () => {
  const months = buildFeeReportMonths([
    { month: 'Dec 2026', month_start: '2026-11-30T18:30:00.000Z', collected: '400' },
    { month: 'Jan 2001', month_start: '2000-12-31T18:30:00.000Z', collected: '200' },
    { month: 'Apr 2026', month_start: '2026-03-31T18:30:00.000Z', collected: 100 },
  ], [
    { month: 'Mar 2027', month_start: '2027-02-28T18:30:00.000Z', billed: '1000' },
    { month: 'Apr 2026', month_start: '2026-03-31T18:30:00.000Z', billed: '500' },
  ])
  assert.deepEqual(months.map(m => m.month), ['Jan 2001', 'Apr 2026', 'Dec 2026', 'Mar 2027'])
  assert.deepEqual(months.map(m => [m.billed, m.collected]), [[0, 200], [500, 100], [0, 400], [1000, 0]])
  assert.equal(new Date(months[1].month_start!).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }), 'Apr')
})

test('keeps billed-only and undated months without requiring a collection', () => {
  const months = buildFeeReportMonths([], [
    { month: 'Unscheduled', month_start: null, billed: 50 },
    { month: 'Apr 2026', month_start: '2026-03-31T18:30:00.000Z', billed: 100 },
  ])
  assert.deepEqual(months.map(m => m.billed), [100, 50])
  assert.deepEqual(buildFeeReportMonths([], []), [])
})
