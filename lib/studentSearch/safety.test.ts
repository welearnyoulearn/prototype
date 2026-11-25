import test from 'node:test'
import assert from 'node:assert/strict'
import { checkQuery, STUDENT_MESSAGES, SEARCH_FLAGS } from './safety'

test('stops unsuitable searches with the right reason', () => {
  assert.equal(checkQuery('porn videos'), 'adult')
  assert.equal(checkQuery('i want to die'), 'support')
  assert.equal(checkQuery('how to make a bomb'), 'danger')
  assert.equal(checkQuery('online casino'), 'gambling')
})

test('stops personal details', () => {
  for (const q of ['my number is 9876543210', '+91 98765 43210', 'mail me at a.b@example.com', '1234 5678 9012']) assert.equal(checkQuery(q), 'personal', q)
})

test('lets schoolwork through', () => {
  for (const q of ['photosynthesis', 'sex determination in humans', 'drug abuse essay', 'suicide prevention day', 'how to make a paper boat',
    'speed of light 299792458', 'population 1428627663', 'date 2026-11-25']) assert.equal(checkQuery(q), null, q)
})

test('every reason has a message for the student', () => {
  for (const flag of SEARCH_FLAGS) assert.ok(STUDENT_MESSAGES[flag].title && STUDENT_MESSAGES[flag].body, flag)
})
