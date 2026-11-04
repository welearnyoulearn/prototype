import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeBand, isGradeBand, GRADE_BANDS, BAND_LABELS } from './newspaperBands'

test('grades 6 to 10 all share the one band', () => {
  assert.deepEqual([...GRADE_BANDS], ['6-10'])
  for (const g of ['6', '7', '8', '9', '10']) assert.equal(gradeBand(g), '6-10', g)
})

test('free-text grades are understood', () => {
  assert.equal(gradeBand(' 6 '), '6-10')
  assert.equal(gradeBand('Grade 7'), '6-10')
  assert.equal(gradeBand('class 10'), '6-10')
  assert.equal(gradeBand('8th'), '6-10')
  assert.equal(gradeBand('Std 9'), '6-10')
})

test('grades without a newspaper return null', () => {
  for (const g of ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '5th', '11', '12', '', 'abc', '6-B', '0']) assert.equal(gradeBand(g), null, g)
  assert.equal(gradeBand(null), null)
  assert.equal(gradeBand(undefined), null)
})

test('every band has a label and isGradeBand agrees with the list', () => {
  for (const b of GRADE_BANDS) {
    assert.ok(BAND_LABELS[b])
    assert.equal(isGradeBand(b), true)
  }
  for (const old of ['3-5', '6-8', '9-10', '1-2']) assert.equal(isGradeBand(old), false, old)
})
