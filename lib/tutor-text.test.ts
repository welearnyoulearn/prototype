import test from 'node:test'
import assert from 'node:assert/strict'
import { citedNumbers, citedSources, isTableSeparator, tableCells } from './tutor-text'

test('citedNumbers reads [n], [1, 3] and [1][6] forms', () => {
  assert.deepEqual([...citedNumbers('A [2]. B [1, 3] and [1][6]. Not [x] or [ 4 ].')], [2, 1, 3, 6])
  assert.equal(citedNumbers('No sources here.').size, 0)
})

test('citedSources keeps only cited sources, deduped, in source order, and works on partial streams', () => {
  const sources = [1, 2, 3, 4].map(n => ({ n }))
  assert.deepEqual(citedSources(sources, 'x [3] y [1] z [3]'), [{ n: 1 }, { n: 3 }])
  assert.deepEqual(citedSources(sources, 'streaming [2] and [4'), [{ n: 2 }])
  assert.deepEqual(citedSources(sources, "Your textbooks don't cover this."), [])
})

test('table helpers', () => {
  assert.deepEqual(tableCells('| Unit | **Lessons** |'), ['Unit', '**Lessons**'])
  assert.equal(tableCells('Unit | Lessons'), null)
  assert.equal(isTableSeparator('|---|:---:|'), true)
  assert.equal(isTableSeparator('| --- | --- |'), true)
  assert.equal(isTableSeparator('---'), false)
})
