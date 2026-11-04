import test from 'node:test'
import assert from 'node:assert/strict'
import { NEWS_POINTS, newsPointsEarned } from './rewardRules'

test('newspaper pays 2 for answering and 3 more for a correct answer, nothing before answering', () => {
  assert.equal(newsPointsEarned(false, false), 0)
  assert.equal(newsPointsEarned(false, true), 0)
  assert.equal(newsPointsEarned(true, false), NEWS_POINTS.answered)
  assert.equal(newsPointsEarned(true, true), 5)
})
