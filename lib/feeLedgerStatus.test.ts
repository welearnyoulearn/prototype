import test from 'node:test'
import assert from 'node:assert/strict'
import { computeLedgerStatus as s } from './feeLedgerStatus'

test('fully paid in cash is paid', () => assert.equal(s({ due: 1000, paid: 1000, waiver: 0, yearEnded: false }), 'paid'))
test('paid + waiver covering the bill is waived', () => assert.equal(s({ due: 1000, paid: 750, waiver: 250, yearEnded: false }), 'waived'))
test('fully waived is waived', () => assert.equal(s({ due: 1000, paid: 0, waiver: 1000, yearEnded: true }), 'waived'))
test('part payment is partial', () => assert.equal(s({ due: 1000, paid: 400, waiver: 0, yearEnded: true }), 'partial'))
test('part waiver only is partial', () => assert.equal(s({ due: 1000, paid: 0, waiver: 100, yearEnded: false }), 'partial'))
test('nothing covered: pending in-year, overdue after year end', () => {
  assert.equal(s({ due: 1000, paid: 0, waiver: 0, yearEnded: false }), 'pending')
  assert.equal(s({ due: 1000, paid: 0, waiver: 0, yearEnded: true }), 'overdue')
})
