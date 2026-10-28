import test from 'node:test'
import assert from 'node:assert/strict'
import { MONTHLY_REDEEM_LIMIT, NEWS_POINTS, STARTER_ITEMS, newsPointsEarned, withinMonthlyLimit } from './rewardRules'

test('newspaper pays 2 for answering and 3 more for a correct answer, nothing before answering', () => {
  assert.equal(newsPointsEarned(false, false), 0)
  assert.equal(newsPointsEarned(false, true), 0)
  assert.equal(newsPointsEarned(true, false), NEWS_POINTS.answered)
  assert.equal(newsPointsEarned(true, true), 5)
})

test('the monthly limit allows exactly up to 500 points ordered', () => {
  assert.equal(MONTHLY_REDEEM_LIMIT, 500)
  assert.equal(withinMonthlyLimit(0, 500), true)
  assert.equal(withinMonthlyLimit(350, 150), true)
  assert.equal(withinMonthlyLimit(351, 150), false)
  assert.equal(withinMonthlyLimit(500, 1), false)
  assert.equal(withinMonthlyLimit(0, 100, 50), false)
})

test('the pilot catalog is 7 simple items, none dearer than the monthly limit', () => {
  assert.equal(STARTER_ITEMS.length, 7)
  const byName = Object.fromEntries(STARTER_ITEMS.map(i => [i.name, i.pointsCost]))
  assert.deepEqual(byName, { Pencil: 150, Eraser: 150, Sharpener: 150, 'Blue pen': 250, 'Black pen': 400, Ruler: 500, 'Glue stick': 500 })
  for (const item of STARTER_ITEMS) assert.ok(item.pointsCost <= MONTHLY_REDEEM_LIMIT, item.name)
  assert.equal(new Set(STARTER_ITEMS.map(i => i.name.toLowerCase())).size, STARTER_ITEMS.length)
})

test('no item costs WLYL more than about 2 paise per point', () => {
  for (const item of STARTER_ITEMS) {
    const paisePerPoint = item.unitCostPaise / item.pointsCost
    assert.ok(paisePerPoint <= 2.01, `${item.name}: ${paisePerPoint.toFixed(2)} paise per point`)
  }
})
