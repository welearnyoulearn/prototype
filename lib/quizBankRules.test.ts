import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChapterPrompt, draftFromLegacy, draftsFromChapterOutput, estimateCostUsd, fingerprint, keepAgreeing,
  languageForSubject, normalizeStem, spreadAnswerPosition, subjectLanguage, topicNeeds, validateDraft, MIN_READY_PER_TOPIC, TARGET_PER_TOPIC,
} from './quizBankRules'

const good = {
  stem: 'What gas do plants take in for photosynthesis?',
  options: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'],
  correct_index: 0,
  explanation: 'Plants use carbon dioxide and water to make food in sunlight.',
  difficulty: 'easy',
}

test('language follows the subject: language subjects in their own script, everything else English', () => {
  assert.equal(languageForSubject('Telugu'), 'telugu')
  assert.equal(languageForSubject('Second Language Hindi'), 'hindi')
  assert.equal(languageForSubject('Mathematics'), 'english')
  assert.equal(languageForSubject('English'), 'english')
})

test('fingerprint ignores case, punctuation and spacing, and keeps non-Latin scripts', () => {
  assert.equal(fingerprint('What is 2 + 2?'), fingerprint('  what is 2 2 '))
  assert.notEqual(fingerprint('What is 2 + 2?'), fingerprint('What is 2 + 3?'))
  assert.equal(normalizeStem('మొక్కలు ఏమి తీసుకుంటాయి?'), 'మొక్కలు ఏమి తీసుకుంటాయి')
  assert.notEqual(fingerprint('మొక్కలు'), fingerprint('పువ్వులు'))
})

test('a valid question passes; broken ones are rejected', () => {
  assert.ok(validateDraft(good))
  assert.equal(validateDraft({ ...good, options: ['A', 'B', 'C'] }), null, 'three options')
  assert.equal(validateDraft({ ...good, options: ['A', 'a', 'C', 'D'] }), null, 'duplicate options')
  assert.equal(validateDraft({ ...good, correct_index: 4 }), null, 'answer out of range')
  assert.equal(validateDraft({ ...good, stem: 'Short?' }), null, 'stem too short')
  assert.equal(validateDraft({ ...good, options: ['A', 'B', 'C', 'None of the above'] }), null, 'none of the above')
  assert.equal(validateDraft({ ...good, difficulty: 'tricky' }), null, 'unknown difficulty')
  assert.ok(validateDraft({ ...good, explanation: null }), 'explanation may be missing')
})

test('legacy curriculum questions import only when they are clean 4-option questions', () => {
  const d = draftFromLegacy({ q: good.stem, options: good.options, answer: 2 })
  assert.equal(d?.correct_index, 2)
  assert.equal(d?.explanation, null)
  assert.equal(draftFromLegacy({ q: good.stem, options: ['A', 'B'], answer: 0 }), null)
  assert.equal(draftFromLegacy({ q: '', options: good.options, answer: 0 }), null)
  assert.equal(draftFromLegacy('junk'), null)
})

test('spreading the answer position keeps the same correct option text, and is stable', () => {
  const d = validateDraft(good)!
  const a = spreadAnswerPosition(d)
  assert.equal(a.options[a.correct_index], 'Carbon dioxide')
  assert.deepEqual([...a.options].sort(), [...d.options].sort())
  assert.deepEqual(spreadAnswerPosition(d), a)
})

test('answer positions spread across all four slots over many questions', () => {
  const counts = [0, 0, 0, 0]
  for (let i = 0; i < 400; i++) {
    const d = validateDraft({ ...good, stem: `Question number ${i} about plants and food?` })!
    counts[spreadAnswerPosition(d).correct_index]++
  }
  for (const c of counts) assert.ok(c > 60, `each slot used often enough: ${counts.join(',')}`)
})

test('topic needs count up to the target and skip full topics', () => {
  const needs = topicNeeds([
    { topicId: 1, chapterId: 10, activeCount: 0 },
    { topicId: 2, chapterId: 10, activeCount: TARGET_PER_TOPIC },
    { topicId: 3, chapterId: 11, activeCount: 5 },
  ])
  assert.deepEqual(needs.map(n => [n.topicId, n.need]), [[1, TARGET_PER_TOPIC], [3, TARGET_PER_TOPIC - 5]])
})

test('chapter output: valid questions kept per topic, invalid/duplicate/unknown-topic ones rejected', () => {
  const output = {
    topics: [
      { topic_id: 1, questions: [good, { ...good, stem: 'Which part of the plant makes food?' }, { ...good, options: ['A', 'B', 'C', 'D', 'E'] }] },
      { topic_id: 1, questions: [{ ...good, stem: 'WHAT gas do plants take in for photosynthesis' }] },
      { topic_id: 99, questions: [{ ...good, stem: 'A question for a topic not in this chapter?' }] },
    ],
  }
  const existing = new Set([fingerprint('Which part of the plant makes food?')])
  const r = draftsFromChapterOutput(output, new Set([1]), existing)
  assert.equal(r.generated, 5)
  assert.equal(r.byTopic.get(1)?.length, 1)
  assert.equal(r.rejected, 4)
  assert.equal(r.byTopic.has(99), false)
})

test('malformed chapter output yields nothing instead of throwing', () => {
  assert.equal(draftsFromChapterOutput({ nope: true }, new Set([1]), new Set()).byTopic.size, 0)
  assert.equal(draftsFromChapterOutput(null, new Set([1]), new Set()).generated, 0)
})

test('only questions the checker answered the same way are kept', () => {
  const items = [{ key: 'a', correct_index: 1 }, { key: 'b', correct_index: 2 }, { key: 'c', correct_index: 0 }]
  const kept = keepAgreeing(items, new Map([['a', 1], ['b', 3], ['c', -1]]))
  assert.deepEqual(kept.map(k => k.key), ['a'])
})

test('chapter prompt names every topic with its count, the language and the source', () => {
  const p = buildChapterPrompt({
    board: 'CBSE', grade: '7', subject: 'Science', language: 'english', chapterName: 'Nutrition in Plants', withTextbook: true,
    topics: [
      { topicId: 5, name: 'Photosynthesis', subtopics: ['Chlorophyll'], notes: null, need: 12, existingStems: ['Old question?'] },
      { topicId: 6, name: 'Parasites', subtopics: [], notes: 'Cuscuta example', need: 1, existingStems: [] },
    ],
  })
  assert.match(p, /topic_id 5: "Photosynthesis" — write 12 new questions/)
  assert.match(p, /topic_id 6: "Parasites" — write 1 new question\b/)
  assert.match(p, /attached PDF/)
  assert.match(p, /Already existing/)
  assert.match(p, /English/)
  const te = buildChapterPrompt({ board: 'TS_SSC', grade: '6', subject: 'Telugu', language: 'telugu', chapterName: 'X', withTextbook: false, topics: [] })
  assert.match(te, /Telugu script/)
  assert.match(te, /no textbook attached/)
})

test('cost estimate grows with the textbook and the number of questions', () => {
  const small = estimateCostUsd({ chapters: 10, questionsNeeded: 500, textbookTokens: null })
  const book = estimateCostUsd({ chapters: 10, questionsNeeded: 500, textbookTokens: 300_000 })
  assert.ok(small > 0)
  assert.ok(book > small)
  // 10 chapters × 303k input tokens × $2/M + (500×450 + 10×8000) output × $10/M
  assert.equal(book, Math.ceil((10 * 303_000 / 1e6 * 2 + (500 * 450 + 10 * 8000) / 1e6 * 10) * 100) / 100)
})

test('#444: 8 questions per topic, minimum 5; the subject language setting wins over the name', () => {
  assert.equal(TARGET_PER_TOPIC, 8)
  assert.equal(MIN_READY_PER_TOPIC, 5)
  assert.equal(subjectLanguage('telugu', 'First Language'), 'telugu', 'a subject named without "Telugu" is still Telugu when set')
  assert.equal(subjectLanguage('english', 'Telugu Grammar'), 'english', 'the setting overrides the name')
  assert.equal(subjectLanguage(null, 'Hindi'), 'hindi', 'unset falls back to the name')
  assert.equal(subjectLanguage('french', 'Science'), 'english', 'unknown settings are ignored')
})

test('#444: a school chapter prompt uses its topics and notes, not the board syllabus', () => {
  const p = buildChapterPrompt({
    board: 'CBSE', grade: '7', subject: 'Science', language: 'english', chapterName: 'Our Local Pond', withTextbook: false, custom: true,
    topics: [{ topicId: 41, name: 'Pond life', subtopics: ['Frogs'], notes: 'Visit to the school pond', need: 8, existingStems: [] }],
  })
  assert.match(p, /school's own addition/)
  assert.doesNotMatch(p, /standard CBSE Grade 7 Science syllabus/)
  assert.match(p, /topic_id 41: "Pond life" — write 8 new questions/)
})
