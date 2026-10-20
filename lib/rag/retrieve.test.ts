import test from 'node:test'
import assert from 'node:assert/strict'
import { fuseRankings, keywordQuery } from './retrieve'

test('ids ranked well in both lists beat ids in only one', () => {
  const fused = fuseRankings([[1, 2, 3], [2, 4, 1]])
  assert.deepEqual(fused.map((f) => f.id), [2, 1, 4, 3])
  assert.equal(fused[0].score, 1 / 62 + 1 / 61)
})

test('a single list keeps its order; empty lists are harmless', () => {
  assert.deepEqual(fuseRankings([[7, 5, 9], []]).map((f) => f.id), [7, 5, 9])
  assert.deepEqual(fuseRankings([[], []]), [])
})

test('k controls the score', () => {
  assert.equal(fuseRankings([[1]], 0)[0].score, 1)
})

test('keywordQuery ORs content words and drops stopwords/short words', () => {
  assert.equal(keywordQuery('What is Photosynthesis in plants?'), 'photosynthesis | plants')
  assert.equal(keywordQuery('is it?'), '')
  assert.equal(keywordQuery("x' | & ! (plants)"), 'plants')
})

test('keywordQuery keeps Telugu/Hindi words', () => {
  assert.equal(keywordQuery('प्रकाश संश्लेषण क्या है'), 'प्रकाश | संश्लेषण | क्या')
})
