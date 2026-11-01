import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weekStart, weekRef, milestonesCrossed, streakWithout, rankByPoints, improvement, participationPct } from './quizRewardsRules'

test('weeks start on Monday (IST dates)', () => {
  assert.equal(weekStart('2026-10-27'), '2026-10-26') // Tuesday
  assert.equal(weekStart('2026-10-26'), '2026-10-26') // Monday
  assert.equal(weekStart('2026-11-01'), '2026-10-26') // Sunday belongs to the week before
  assert.equal(weekStart('2027-01-01'), '2026-12-28') // across the year end
  assert.equal(weekRef('2026-10-26'), 20261026)
})

test('streak milestones: only those crossed, several at once after a catch-up', () => {
  assert.deepEqual(milestonesCrossed(4, 5).map(m => m.days), [5])
  assert.deepEqual(milestonesCrossed(5, 6), [])
  assert.deepEqual(milestonesCrossed(3, 21).map(m => m.days), [5, 20])
})

test('streak without a quiz: the newest is skipped, an older one is a gap', () => {
  const q = (quizId: number, done: boolean, stillOpen = false) => ({ quizId, done, stillOpen })
  const list = [q(5, true), q(4, true), q(3, true), q(2, true), q(1, true)]
  assert.equal(streakWithout(list, 5), 4, 'finishing today took it from 4 to 5')
  assert.equal(streakWithout(list, 3), 2, 'a late catch-up of an older quiz joined 2 and 2')
})

test('ranking: competition ranks, ties share a rank', () => {
  const r = rankByPoints([{ name: 'B', points: 10 }, { name: 'A', points: 20 }, { name: 'C', points: 10 }, { name: 'D', points: 0 }])
  assert.deepEqual(r.map(x => `${x.name}${x.rank}`), ['A1', 'B2', 'C2', 'D4'])
})

test('improvement needs 3 quizzes in both weeks', () => {
  assert.equal(improvement({ quizzes: 3, correct: 9, total: 18 }, { quizzes: 4, correct: 18, total: 24 }), 25)
  assert.equal(improvement({ quizzes: 2, correct: 1, total: 12 }, { quizzes: 4, correct: 24, total: 24 }), null)
  assert.equal(improvement({ quizzes: 3, correct: 18, total: 18 }, { quizzes: 3, correct: 9, total: 18 }), -50)
})

test('class participation', () => {
  assert.equal(participationPct(16, 5, 4), 80)
  assert.equal(participationPct(0, 0, 30), null)
})
