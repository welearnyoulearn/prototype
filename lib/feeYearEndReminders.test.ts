import test from 'node:test'
import assert from 'node:assert/strict'
import { daysBetween, pickYearEndReminder, reminderText } from './feeYearEndReminders'

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-10-05', '2026-10-06'), 1)
  assert.equal(daysBetween('2026-10-05', '2027-03-31'), 177)
  assert.equal(daysBetween('2027-03-31', '2027-03-30'), -1)
})

test('nothing is due outside the last 60 days or after the year ends', () => {
  assert.equal(pickYearEndReminder(120, []), null)
  assert.equal(pickYearEndReminder(61, []), null)
  assert.equal(pickYearEndReminder(-1, []), null)
})

test('each threshold fires once, most urgent first', () => {
  assert.deepEqual(pickYearEndReminder(60, []), { kind: 'ye_60', supersedes: [] })
  assert.equal(pickYearEndReminder(45, ['ye_60']), null)
  assert.deepEqual(pickYearEndReminder(30, ['ye_60']), { kind: 'ye_30', supersedes: ['ye_60'] })
  assert.deepEqual(pickYearEndReminder(7, ['ye_60', 'ye_30']), { kind: 'ye_7', supersedes: ['ye_30', 'ye_60'] })
  assert.equal(pickYearEndReminder(3, ['ye_7']), null)
})

test('a job that was off for weeks sends one reminder, not three', () => {
  // first run at 5 days to go: ye_7, with the bigger ones marked as sent so they never fire later
  assert.deepEqual(pickYearEndReminder(5, []), { kind: 'ye_7', supersedes: ['ye_30', 'ye_60'] })
})

test('reminder text names the year, the date and the owner', () => {
  const t = reminderText('ye_30', { year: '2026-27', endDate: '2027-03-31', owner: 'Priya' })
  assert.match(t.title, /30 days/)
  assert.match(t.message, /2026-27 ends on 2027-03-31/)
  assert.match(t.message, /Year-end owner: Priya/)
  assert.match(reminderText('od_overdue', { year: '2026-27', count: 1, total: 54000 }).message, /1 student left open in 2026-27 \(₹54,000\)/)
  assert.match(reminderText('od_overdue', { year: '2026-27', count: 3, total: 1 }).message, /3 students left open/)
})
