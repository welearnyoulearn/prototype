// Self-check of the pure bill maths (#358). Run: npm run check:bills
import assert from 'node:assert/strict'
import { billStatus, gstFor } from '../lib/bills'

assert.equal(gstFor(70.5), 12.69)
assert.equal(70.5 + gstFor(70.5), 83.19)
assert.equal(gstFor(0), 0)
assert.equal(gstFor(0.1), 0.02)          // 0.018 rounds up to the paisa
assert.equal(gstFor(8500), 1530)

assert.equal(billStatus(0, 0, '2026-10-16', '2026-12-01'), 'no_charge')
assert.equal(billStatus(83.19, 0, '2026-10-16', '2026-10-16'), 'due')       // due date itself is not overdue
assert.equal(billStatus(83.19, 0, '2026-10-16', '2026-10-17'), 'overdue')   // the day after is
assert.equal(billStatus(83.19, 40, '2026-10-16', '2026-10-10'), 'part_paid')
assert.equal(billStatus(83.19, 40, '2026-10-16', '2026-10-20'), 'overdue')
assert.equal(billStatus(83.19, 83.19, '2026-10-16', '2026-10-20'), 'paid')

console.log('check-bills OK')
