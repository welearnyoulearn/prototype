import test from 'node:test'
import assert from 'node:assert/strict'
import { needsRewrite, parseRewrite, rewritePrompt } from './rewrite'

test('needsRewrite skips plain English questions with three or more content words', () => {
  assert.equal(needsRewrite('What are the factors affecting friction in machines?'), false)
  assert.equal(needsRewrite('How does the kidney filter blood?'), false)
  assert.equal(needsRewrite('What is friction?'), true)
})

test('needsRewrite fires for short, misspelt, romanised or non-Latin messages', () => {
  assert.equal(needsRewrite('photosinthesis'), true)
  assert.equal(needsRewrite('what was mendels experiment'), true)
  assert.equal(needsRewrite('photosynthesis ante enti in plants leaves'), true)
  assert.equal(needsRewrite('light ka refraction kya hai mirror lens'), true)
  assert.equal(needsRewrite('ఘర్షణ అంటే ఏమిటి'), true)
  assert.equal(needsRewrite('प्रकाश संश्लेषण क्या है'), true)
})

const subjects = ['Science & Science', 'Biological Science', 'Mathematics']

test('parseRewrite reads JSON (even wrapped in prose/fences), caps keywords, matches the subject case-insensitively', () => {
  const r = parseRewrite('```json\n{"query":"What is friction?","keywords":["friction"," ఘర్షణ ","friction","a","b","c","d","e","f","g"],"subject":"science & science"}\n```', subjects)
  assert.deepEqual(r, { query: 'What is friction?', keywords: ['friction', 'ఘర్షణ', 'a', 'b', 'c', 'd', 'e', 'f'], subject: 'Science & Science' })
})

test('parseRewrite drops an unknown subject and rejects malformed output', () => {
  assert.equal(parseRewrite('{"query":"photosynthesis","keywords":[],"subject":"Botany"}', subjects)?.subject, null)
  assert.equal(parseRewrite('{"query":"photosynthesis"}', subjects)?.keywords.length, 0)
  assert.equal(parseRewrite('not json', subjects), null)
  assert.equal(parseRewrite('{"query":""}', subjects), null)
  assert.equal(parseRewrite('{"keywords":["x"]}', subjects), null)
})

test('rewritePrompt includes the grade subjects and the previous question only when given', () => {
  assert.match(rewritePrompt('equation?', '10', subjects, 'What is photosynthesis?'), /previous question: "What is photosynthesis\?"/)
  assert.doesNotMatch(rewritePrompt('friction', '8', subjects), /Their previous question/)
  assert.match(rewritePrompt('friction', '8', subjects), /Science & Science, Biological Science, Mathematics/)
})
