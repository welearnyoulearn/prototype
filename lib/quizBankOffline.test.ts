import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptQuestions, answerKey, blindItems, parseAnswers, passageQuery, pickTopics } from './quizBankOffline'

const q = (stem: string, correct = 0) => ({
  stem, options: ['Right answer', 'Wrong one', 'Wrong two', 'Wrong three'], correct_index: correct,
  explanation: 'Because the right answer is the right one here.', difficulty: 'easy' as const,
})
const output = { topics: [{ topic_id: 7, questions: [q('What is the first question about?'), q('What is the second question about?', 2)] }, { topic_id: 99, questions: [q('A question for an unknown topic?')] }] }

test('passageQuery: topic words joined with OR, short words and duplicates dropped, any script kept', () => {
  assert.equal(passageQuery('Period 1: Reading Comprehension'), 'reading | comprehension')
  assert.equal(passageQuery('1.2 The Fundamental Theorem of Arithmetic', '1 Real Numbers'), 'fundamental | theorem | arithmetic | real | numbers')
  assert.equal(passageQuery('1.1 Introduction', '1 Real Numbers'), 'real | numbers', 'a generic title falls back to the chapter words')
  assert.equal(passageQuery('Summary'), 'summary', 'only generic words: keep them rather than search for nothing')
  assert.equal(passageQuery('Photosynthesis, photosynthesis in Plants!'), 'photosynthesis | plants')
  assert.equal(passageQuery('కాంతి సంశ్లేషణ'), 'కాంతి | సంశ్లేషణ')
  assert.equal(passageQuery('A to B'), null)
  assert.equal(passageQuery('one two three four five six seven eight nine ten')?.split(' | ').length, 8)
})

test('pickTopics: first topics in syllabus order that still need questions', () => {
  const t = (id: number, chapterOrder: number, topicOrder: number, active = 0) => ({ id, chapterId: chapterOrder, chapterOrder, topicOrder, active })
  const picked = pickTopics([t(3, 2, 1), t(1, 1, 1), t(2, 1, 2, 5), t(4, 1, 3, 2), t(5, 2, 2)], 3, 5)
  assert.deepEqual(picked.map(p => [p.id, p.need]), [[1, 5], [4, 3], [3, 5]], 'topic 2 already has 5, so it is skipped')
  assert.deepEqual(pickTopics([], 4, 5), [])
})

test('blindItems never contains the answer, only valid questions of known topics', () => {
  const items = blindItems(output, new Set([7]))
  assert.equal(items.length, 2)
  assert.ok(items.every(i => !('correct_index' in i) && i.options.length === 4))
  assert.equal(items[0].key, answerKey('What is the first question about?'))
})

test('parseAnswers accepts an object or a list and ignores nonsense', () => {
  assert.deepEqual([...parseAnswers({ a: 1, b: 3, c: 4, d: 'x', e: 1.5 })], [['a', 1], ['b', 3]])
  assert.deepEqual([...parseAnswers([{ key: 'k', answer: 2 }, { key: 'z', answer: 9 }, null])], [['k', 2]])
  assert.equal(parseAnswers('nope').size, 0)
})

test('acceptQuestions keeps only questions the checker agreed with, drops stored duplicates and unknown topics', () => {
  const answers = new Map([[answerKey('What is the first question about?'), 0], [answerKey('What is the second question about?'), 1]])
  const r = acceptQuestions(output, new Set([7]), new Set(), answers)
  assert.equal(r.written, 3)
  assert.equal(r.valid, 2, 'the unknown topic is dropped')
  assert.equal(r.agreed, 1, 'the second question was answered differently by the checker')
  assert.equal(r.byTopic.get(7)?.length, 1)
  const noChecker = acceptQuestions(output, new Set([7]), new Set(), null)
  assert.equal(noChecker.agreed, 2)
})
