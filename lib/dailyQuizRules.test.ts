import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_QUIZ_SETTINGS, quizSettingsSchema, resolveSettings, istNow, istInstant, addDays, inSeason, gradeNumber,
  recentWorkingDays, chooseTopics, quizPhase, lateAllowed, answersVisible, participationAward, accuracyAwards, quizStreak,
} from './dailyQuizRules'

test('settings: defaults are valid; bad values are refused', () => {
  assert.ok(quizSettingsSchema.safeParse(DEFAULT_QUIZ_SETTINGS).success)
  assert.ok(!quizSettingsSchema.safeParse({ ...DEFAULT_QUIZ_SETTINGS, closeTime: '16:00' }).success, 'under 1 hour')
  assert.ok(!quizSettingsSchema.safeParse({ ...DEFAULT_QUIZ_SETTINGS, closeTime: '10:00' }).success, 'close before open')
  assert.ok(!quizSettingsSchema.safeParse({ ...DEFAULT_QUIZ_SETTINGS, seasonEnd: '02-30' }).success, 'not a date')
  assert.ok(!quizSettingsSchema.safeParse({ ...DEFAULT_QUIZ_SETTINGS, openTime: '3:30' }).success)
  assert.ok(!quizSettingsSchema.safeParse({ ...DEFAULT_QUIZ_SETTINGS, grades: [3, 3] }).success)
  assert.ok(!quizSettingsSchema.safeParse({ ...DEFAULT_QUIZ_SETTINGS, grades: [13] }).success)
  assert.ok(!quizSettingsSchema.safeParse({ ...DEFAULT_QUIZ_SETTINGS, extra: 1 }).success, 'strict')
})

test('settings: a school override only replaces the fields it sets', () => {
  const s = resolveSettings(DEFAULT_QUIZ_SETTINGS, { seasonStart: null, seasonEnd: null, openTime: '16:00', closeTime: null, grades: [6, 7] })
  assert.equal(s.openTime, '16:00')
  assert.equal(s.closeTime, '21:00')
  assert.deepEqual(s.grades, [6, 7])
  assert.equal(s.seasonStart, '07-01')
  assert.deepEqual(resolveSettings(DEFAULT_QUIZ_SETTINGS, null), DEFAULT_QUIZ_SETTINGS)
})

test('IST: date and minutes, including the UTC evening that is already tomorrow in India', () => {
  assert.deepEqual(istNow(new Date('2026-10-27T10:00:00Z')), { date: '2026-10-27', minutes: 15 * 60 + 30 })
  assert.deepEqual(istNow(new Date('2026-10-27T19:00:00Z')), { date: '2026-10-28', minutes: 30 })
  assert.equal(istInstant('2026-10-27', '15:30').toISOString(), '2026-10-27T10:00:00.000Z')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')
})

test('season wraps the year end and includes both ends', () => {
  for (const d of ['2026-07-01', '2026-12-31', '2027-01-01', '2027-03-15']) assert.ok(inSeason(d, '07-01', '03-15'), d)
  for (const d of ['2026-06-30', '2027-03-16', '2027-05-01']) assert.ok(!inSeason(d, '07-01', '03-15'), d)
  assert.ok(inSeason('2026-06-10', '06-01', '12-31'))
  assert.ok(!inSeason('2026-05-31', '06-01', '12-31'))
})

test('grade numbers', () => {
  assert.equal(gradeNumber('7'), 7)
  assert.equal(gradeNumber('Grade 10'), 10)
  assert.equal(gradeNumber('class 3'), 3)
  assert.equal(gradeNumber('LKG'), null)
  assert.equal(gradeNumber('13'), null)
})

test('recent working days skip holidays and weekly offs', () => {
  const off = new Set(['2026-10-25', '2026-10-24', '2026-10-20']) // Sun, Sat, a holiday
  const days = recentWorkingDays('2026-10-27', d => !off.has(d))
  assert.deepEqual(days, ['2026-10-27', '2026-10-26', '2026-10-23', '2026-10-22', '2026-10-21'])
})

test('topic choice: newly completed first (newest, then syllabus order), else revision, else skip', () => {
  const t = (topicId: number, coveredDate: string | null, chapterOrder = 1, topicOrder = topicId) => ({ topicId, coveredDate, chapterOrder, topicOrder })
  const today = '2026-10-29'
  // Newest completed topic not yet asked as new → today's topic.
  assert.deepEqual(chooseTopics([t(1, '2026-10-20'), t(2, '2026-10-28'), t(3, '2026-10-27')], new Set(), today), { source: 'covered', topicIds: [2] })
  // Same day: syllabus order (chapter, then topic) decides; the rest follow on later days.
  assert.deepEqual(chooseTopics([t(5, '2026-10-29', 2, 1), t(4, '2026-10-29', 1, 9)], new Set(), today), { source: 'covered', topicIds: [4] })
  assert.deepEqual(chooseTopics([t(5, '2026-10-29', 2, 1), t(4, '2026-10-29', 1, 9)], new Set([4]), today), { source: 'covered', topicIds: [5] })
  // Nothing new (all asked, or completed too long ago, or a future date) → revision of every completed topic.
  assert.deepEqual(chooseTopics([t(2, '2026-10-28'), t(7, '2026-09-01'), t(8, null)], new Set([2]), today), { source: 'revision', topicIds: [2, 7, 8] })
  assert.deepEqual(chooseTopics([t(9, '2026-11-02')], new Set(), today), { source: 'revision', topicIds: [9] })
  // Nothing ever completed → skip the subject.
  assert.equal(chooseTopics([], new Set(), today), null)
})

test('phases, late window and when answers show', () => {
  const opens = istInstant('2026-10-27', '15:30')
  const closes = istInstant('2026-10-27', '21:00')
  assert.equal(quizPhase(istInstant('2026-10-27', '15:29'), opens, closes), 'upcoming')
  assert.equal(quizPhase(istInstant('2026-10-27', '15:30'), opens, closes), 'open')
  assert.equal(quizPhase(istInstant('2026-10-27', '21:00'), opens, closes), 'closed')
  assert.ok(!lateAllowed(istInstant('2026-10-27', '20:59'), '2026-10-27', closes))
  assert.ok(lateAllowed(istInstant('2026-11-03', '23:59'), '2026-10-27', closes), 'day 7 still allowed')
  assert.ok(!lateAllowed(istInstant('2026-11-04', '00:00'), '2026-10-27', closes))
  assert.ok(answersVisible(true), 'right after submit, on time or late (#450)')
  assert.ok(!answersVisible(false), 'never before submit')
})

test('points: participation on submit, accuracy only on time', () => {
  assert.deepEqual(participationAward(false), { action: 'daily_quiz_done', points: 5 })
  assert.deepEqual(participationAward(true), { action: 'daily_quiz_late', points: 3 })
  assert.deepEqual(accuracyAwards(false, 6, 6), [{ action: 'daily_quiz_correct', points: 10 }, { action: 'daily_quiz_perfect', points: 5 }])
  assert.deepEqual(accuracyAwards(false, 2, 6), [{ action: 'daily_quiz_correct', points: 4 }])
  assert.deepEqual(accuracyAwards(false, 0, 6), [])
  assert.deepEqual(accuracyAwards(false, 2, 2), [{ action: 'daily_quiz_correct', points: 4 }], 'perfect needs 3+ questions')
  assert.deepEqual(accuracyAwards(true, 6, 6), [])
})

test('streak counts finished class quizzes; an open one today does not break it', () => {
  assert.equal(quizStreak([]), 0)
  assert.equal(quizStreak([{ done: false, stillOpen: true }, { done: true, stillOpen: false }, { done: true, stillOpen: false }]), 2)
  assert.equal(quizStreak([{ done: true, stillOpen: true }, { done: true, stillOpen: false }, { done: false, stillOpen: false }, { done: true, stillOpen: false }]), 2)
  assert.equal(quizStreak([{ done: false, stillOpen: false }, { done: true, stillOpen: false }]), 0)
})
