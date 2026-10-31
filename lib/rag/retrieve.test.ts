import test from 'node:test'
import assert from 'node:assert/strict'
import { bookSubjects, fuseRankings, keywordQuery, pickChunks } from './retrieve'

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

test('keywordQuery keeps Telugu/Hindi content words and drops their question words', () => {
  assert.equal(keywordQuery('प्रकाश संश्लेषण क्या है'), 'प्रकाश | संश्लेषण')
  assert.equal(keywordQuery('సమాఖ్య వ్యవస్థ అంటే ఏమిటి?'), 'సమాఖ్య | వ్యవస్థ')
})

test('bookSubjects maps class subjects to the book subjects they cover', () => {
  assert.deepEqual(bookSubjects('Biology'), ['biological science', 'science & science'])
  assert.ok(bookSubjects(' social  Science ').includes('history'))
  assert.ok(bookSubjects('English').includes('telugu & hindi & english'))
  assert.deepEqual(bookSubjects('Mathematics'), ['mathematics'])
  assert.deepEqual(bookSubjects('Telugu'), ['telugu'])
})

const cand = (id: number, score: number, subject = 'Physics', materialType: 'textbook' | 'handbook' = 'handbook', content = `chunk ${id}`) =>
  ({ id, score, subject, materialType, content })

test('pickChunks ranks a textbook above a handbook of similar relevance, not far above', () => {
  const ids = (xs: { id: number }[]) => xs.map((x) => x.id)
  assert.deepEqual(ids(pickChunks([cand(1, 1 / 61), cand(2, 1 / 62, 'Physics', 'textbook')], { limit: 6 })), [2, 1])
  assert.deepEqual(ids(pickChunks([cand(1, 2 / 61), cand(2, 1 / 61, 'Physics', 'textbook')], { limit: 6 })), [1, 2])
})

test('pickChunks keeps only anchor subjects when given, else everything', () => {
  const cs = [cand(1, 0.03, 'Physics'), cand(2, 0.02, 'Hindi'), cand(3, 0.01, 'Science & Science')]
  assert.deepEqual(pickChunks(cs, { limit: 6, anchorSubjects: ['Physics', 'Science & Science'] }).map((c) => c.id), [1, 3])
  assert.deepEqual(pickChunks(cs, { limit: 2, anchorSubjects: [] }).map((c) => c.id), [1, 2])
})

test('pickChunks collapses chunks with the same text and respects the limit', () => {
  const cs = [cand(1, 0.03, 'Hindi', 'textbook', 'मीरा ने  भगवान को...'), cand(2, 0.02, 'Hindi', 'handbook', 'मीरा ने भगवान को'), cand(3, 0.01)]
  assert.deepEqual(pickChunks(cs, { limit: 6 }).map((c) => c.id), [1, 3])
  assert.equal(pickChunks(cs, { limit: 1 }).length, 1)
})

test('pickChunks nudges the hinted subject up without dropping others', () => {
  const cs = [cand(1, 1 / 61, 'Physics'), cand(2, 1 / 62, 'Science & Science')]
  assert.deepEqual(pickChunks(cs, { limit: 6, hintSubjects: ['Science & Science'] }).map((c) => c.id), [2, 1])
  assert.deepEqual(pickChunks([cand(1, 2 / 61, 'Physics'), cand(2, 1 / 61, 'Hindi')], { limit: 6, hintSubjects: ['Hindi'] }).map((c) => c.id), [1, 2])
})
