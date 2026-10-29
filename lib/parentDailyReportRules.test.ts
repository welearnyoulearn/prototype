import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attendanceDay, quizDayStatus } from './parentDailyReportRules'

const quiz = { opensAt: new Date('2026-10-29T10:00:00Z'), closesAt: new Date('2026-10-29T15:30:00Z') }
const at = (iso: string) => new Date(iso)

test('quiz day status for the parent', () => {
  assert.equal(quizDayStatus({ quiz: null, attempt: null }, at('2026-10-29T12:00:00Z')), 'no_quiz')
  assert.equal(quizDayStatus({ quiz, attempt: null }, at('2026-10-29T09:00:00Z')), 'not_open_yet')
  assert.equal(quizDayStatus({ quiz, attempt: null }, at('2026-10-29T12:00:00Z')), 'not_started')
  assert.equal(quizDayStatus({ quiz, attempt: { status: 'in_progress', isLate: false } }, at('2026-10-29T12:00:00Z')), 'in_progress')
  assert.equal(quizDayStatus({ quiz, attempt: { status: 'submitted', isLate: false } }, at('2026-10-29T12:00:00Z')), 'completed')
  assert.equal(quizDayStatus({ quiz, attempt: null }, at('2026-10-29T15:30:00Z')), 'missed', 'closed and not taken')
  assert.equal(quizDayStatus({ quiz, attempt: { status: 'in_progress', isLate: true } }, at('2026-10-30T12:00:00Z')), 'missed', 'a late attempt still open is not done')
  assert.equal(quizDayStatus({ quiz, attempt: { status: 'submitted', isLate: true } }, at('2026-10-30T12:00:00Z')), 'completed_late')
})

test('attendance: one word for the day', () => {
  assert.equal(attendanceDay([]), 'not_marked')
  assert.equal(attendanceDay(['present', 'present']), 'present')
  assert.equal(attendanceDay(['present', 'late']), 'late')
  assert.equal(attendanceDay(['late', 'absent']), 'absent')
})
