// Self-check of the pure usage/billing maths (#358). Run: npm run check:usage
import assert from 'node:assert/strict'
import { computeCharge, monthBoundsIST, nextMonth } from '../lib/usage'

const wa = { included: 1000, unitPrice: 0.2, unitSize: 1 }
assert.deepEqual(computeCharge(0, wa), { extraUnits: 0, amount: 0 })
assert.deepEqual(computeCharge(1000, wa), { extraUnits: 0, amount: 0 })
assert.equal(computeCharge(1240, wa).amount, 48)
const ai = { included: 1_000_000, unitPrice: 0.05, unitSize: 1000 }
assert.equal(computeCharge(1_450_000, ai).amount, 22.5)
assert.equal(computeCharge(1_450_500, ai).amount, 22.53)
assert.equal(computeCharge(1_450_500, ai).extraUnits, 450.5)

assert.deepEqual(monthBoundsIST('2026-02'), { month: '2026-02', start: '2026-02-01', end: '2026-03-01' })
assert.equal(monthBoundsIST('2026-12').end, '2027-01-01')
for (const bad of ['2026-13', '2026-1', '26-01', '2026-00', 'x']) assert.throws(() => monthBoundsIST(bad))
assert.match(monthBoundsIST().month, /^\d{4}-\d{2}$/)
assert.equal(nextMonth('2026-01'), '2026-02')
assert.equal(nextMonth('2026-12'), '2027-01')
assert.throws(() => nextMonth('2026-13'))

console.log('check-usage OK')
