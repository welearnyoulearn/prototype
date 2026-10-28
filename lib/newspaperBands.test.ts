import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeBand, isGradeBand, GRADE_BANDS, BAND_LABELS } from './newspaperBands'

test('grades 3-5, 6-8 and 9-10 map to their band', () => {
  for (const g of ['3', '4', '5']) assert.equal(gradeBand(g), '3-5')
  for (const g of ['6', '7', '8']) assert.equal(gradeBand(g), '6-8')
  for (const g of ['9', '10']) assert.equal(gradeBand(g), '9-10')
})

test('free-text grades are understood', () => {
  assert.equal(gradeBand(' 6 '), '6-8')
  assert.equal(gradeBand('Grade 7'), '6-8')
  assert.equal(gradeBand('class 10'), '9-10')
  assert.equal(gradeBand('5th'), '3-5')
  assert.equal(gradeBand('Std 9'), '9-10')
})

test('grades without a newspaper return null', () => {
  for (const g of ['Nursery', 'LKG', 'UKG', '1', '2', '11', '12', '', 'abc', '6-B', '0']) assert.equal(gradeBand(g), null, g)
  assert.equal(gradeBand(null), null)
  assert.equal(gradeBand(undefined), null)
})

test('every band has a label and isGradeBand agrees with the list', () => {
  for (const b of GRADE_BANDS) {
    assert.ok(BAND_LABELS[b])
    assert.equal(isGradeBand(b), true)
  }
  assert.equal(isGradeBand('1-2'), false)
})
