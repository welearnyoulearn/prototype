import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDialModel, quizRing, type DialInput, type DialToday } from './studentDial'

const CLOSES = '2026-10-28T15:30:00.000Z' // 9:00 PM IST

const ready = (attempt: NonNullable<DialToday['quiz']>['attempt'], phase: 'open' | 'closed' = 'open', late = 0): DialToday => ({
  status: 'ready', opensAt: null, closesAt: CLOSES, late: Array.from({ length: late }, () => ({})),
  quiz: { phase, closesAt: CLOSES, subjects: ['Maths', 'Science', 'English', 'Hindi', 'Social'], attempt },
})

const input = (over: Partial<DialInput> = {}): DialInput => ({
  dailyQuiz: true, doubts: true, attendance: true, calendar: true, today: null, progress: null, doubtList: null, attendancePct: null, ...over,
})

const progress = { totalPoints: 1248, weekPoints: 25, streak: 7, badges: [{}, {}], leaderboard: { me: { rank: 4, points: 25 }, classSize: 31 } }

test('ring: no quiz is empty, not started is 0 of N, in progress counts answers, submitted is full', () => {
  assert.deepEqual(quizRing(null), { done: 0, total: 0, label: '–' })
  assert.deepEqual(quizRing({ status: 'holiday', opensAt: null, closesAt: null, quiz: null, late: [] }), { done: 0, total: 0, label: '–' })
  assert.deepEqual(quizRing(ready(null)), { done: 0, total: 5, label: '0/5' })
  assert.deepEqual(quizRing(ready({ status: 'in_progress', answered: 3, total: 5, correct: null, answersVisible: false })), { done: 3, total: 5, label: '3/5' })
  assert.deepEqual(quizRing(ready({ status: 'submitted', answered: 5, total: 5, correct: null, answersVisible: false })), { done: 5, total: 5, label: '5/5' })
})

test('quiz not started: a to-do with the question count and close time', () => {
  const m = buildDialModel(input({ today: ready(null) }))
  assert.equal(m.tasks[0].title, 'Start today’s quiz')
  assert.match(m.tasks[0].detail, /5 questions · closes 9:00/i)
  assert.equal(m.tasks[0].urgent, true)
  assert.equal(m.badge, 1)
  assert.equal(m.headline, '1 thing to do')
})

test('quiz in progress: says how many are left', () => {
  const m = buildDialModel(input({ today: ready({ status: 'in_progress', answered: 3, total: 5, correct: null, answersVisible: false }) }))
  assert.equal(m.tasks[0].title, 'Finish today’s quiz')
  assert.match(m.tasks[0].detail, /2 of 5 left/)
})

test('quiz finished: shown as done, not a to-do, and the headline is calm', () => {
  // Answers show on finishing (#450): a finished quiz goes straight to its score.
  const done = buildDialModel(input({ today: ready({ status: 'submitted', answered: 5, total: 5, correct: 3, answersVisible: true }) }))
  assert.equal(done.tasks[0].title, 'Quiz done: 3 of 5')
  assert.equal(done.tasks[0].urgent, false)
  assert.equal(done.badge, 0)
  assert.equal(done.headline, 'All done for today')
  const reviewed = buildDialModel(input({ today: ready({ status: 'submitted', answered: 5, total: 5, correct: 4, answersVisible: true }, 'closed') }))
  assert.equal(reviewed.tasks[0].title, 'Quiz done: 4 of 5')
})

test('missed quizzes add to the badge, and a holiday with one still offers a catch-up', () => {
  assert.equal(buildDialModel(input({ today: ready(null, 'open', 2) })).badge, 3)
  const holiday: DialToday = { status: 'holiday', holiday: 'Diwali', opensAt: null, closesAt: null, quiz: null, late: [{}, {}] }
  const m = buildDialModel(input({ today: holiday }))
  assert.equal(m.tasks[0].title, 'Catch up on a quiz')
  assert.equal(m.badge, 3)
  assert.equal(buildDialModel(input({ today: { ...holiday, late: [] } })).tasks.length, 0)
})

test('doubts: a teacher reply is a to-do; a waiting doubt is just information', () => {
  const replied = buildDialModel(input({ doubtList: [{ status: 'explained' }, { status: 'open' }, { status: 'explained' }] }))
  assert.equal(replied.tasks[0].title, 'Your teacher answered 2 doubts')
  assert.equal(replied.badge, 2)
  const waiting = buildDialModel(input({ doubtList: [{ status: 'open' }, { status: 'clarified' }] }))
  assert.equal(waiting.tasks[0].title, '1 doubt with your teacher')
  assert.equal(waiting.tasks[0].urgent, false)
  assert.equal(waiting.badge, 0)
  assert.equal(buildDialModel(input({ doubtList: [{ status: 'clarified' }] })).tasks.length, 0)
})

test('stats: points, streak and rank from the quiz progress', () => {
  const m = buildDialModel(input({ progress }))
  assert.deepEqual(m.stats.map(s => [s.key, s.value, s.sub]), [
    ['points', '1,248', '+25 this week'],
    ['streak', '7', 'school days'],
    ['rank', '#4', 'of 31'],
  ])
  assert.equal(buildDialModel(input()).stats.length, 0, 'nothing until progress has loaded')
  const noRank = buildDialModel(input({ progress: { ...progress, streak: 1, leaderboard: { me: null, classSize: 30 } } }))
  assert.equal(noRank.stats[1].sub, 'school day')
  assert.deepEqual([noRank.stats[2].value, noRank.stats[2].sub], ['–', 'this week'])
})

test('switched-off features hide their rows; Marks is always a shortcut', () => {
  const off = buildDialModel(input({ dailyQuiz: false, doubts: false, attendance: false, calendar: false, today: ready(null), progress, doubtList: [{ status: 'explained' }] }))
  assert.deepEqual([off.tasks.length, off.stats.length, off.links.map(l => l.key)], [0, 0, ['marks']])
  assert.equal(off.badge, 0)
  assert.equal(off.ring.label, '–')
  assert.deepEqual(buildDialModel(input()).links.map(l => l.key), ['marks', 'attendance', 'calendar'])
})

test('attendance shortcut shows this month’s percentage when known', () => {
  assert.equal(buildDialModel(input({ attendancePct: 92 })).links.find(l => l.key === 'attendance')!.detail, '92% this month')
  assert.equal(buildDialModel(input()).links.find(l => l.key === 'attendance')!.detail, 'This month')
})

test('newspaper: unread or unanswered is a to-do with the points; answered shows the points earned', () => {
  const reading = buildDialModel(input({ newspaper: true, newspaperView: { state: 'reading' } }))
  assert.equal(reading.tasks[0].key, 'newspaper')
  assert.equal(reading.tasks[0].title, 'Read today’s newspaper')
  assert.match(reading.tasks[0].detail, /up to 5 points/)
  assert.equal(reading.tasks[0].navKey, 'newspaper')
  assert.equal(reading.badge, 1)
  assert.equal(reading.headline, '1 thing to do')

  const question = buildDialModel(input({ newspaper: true, newspaperView: { state: 'question' } }))
  assert.equal(question.tasks[0].title, 'Answer today’s newspaper question')
  assert.equal(question.tasks[0].urgent, true)

  const done = buildDialModel(input({ newspaper: true, newspaperView: { state: 'done', result: { correct: true, pointsAwarded: 5 } } }))
  assert.equal(done.tasks[0].title, 'Newspaper done: +5 points')
  assert.equal(done.tasks[0].urgent, false)
  assert.equal(done.badge, 0)
  assert.equal(done.headline, 'All done for today')
})

test('newspaper: nothing shows when it is switched off, not ready, or not for this grade', () => {
  assert.equal(buildDialModel(input({ newspaper: false, newspaperView: { state: 'reading' } })).tasks.length, 0)
  assert.equal(buildDialModel(input({ newspaper: true, newspaperView: { state: 'not_ready' } })).tasks.length, 0)
  assert.equal(buildDialModel(input({ newspaper: true, newspaperView: { state: 'unavailable' } })).tasks.length, 0)
  assert.equal(buildDialModel(input({ newspaper: true, newspaperView: null })).tasks.length, 0)
})

test('newspaper sits after the quiz and both count in the badge', () => {
  const m = buildDialModel(input({ today: ready(null), newspaper: true, newspaperView: { state: 'reading' } }))
  assert.deepEqual(m.tasks.map(t => t.key), ['quiz', 'newspaper'])
  assert.equal(m.badge, 2)
  assert.equal(m.headline, '2 things to do')
})
