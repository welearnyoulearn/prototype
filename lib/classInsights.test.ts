import test from 'node:test'
import assert from 'node:assert/strict'
import { examInsights, dailyAttendance } from './classInsights'

const exam = (id: number, date: string, rows: Array<[number, number | null]>) => ({
  id, name: `E${id}`, date, passingPct: 35,
  students: rows.map(([student_id, percentage]) => ({ student_id, percentage, pass: percentage === null ? null : percentage >= 35 })),
  subjects: [{ subject_name: 'Maths', avg_marks: 30, max_marks: 50 }],
})

test('no released exams gives empty numbers, not zeroes', () => {
  const out = examInsights([])
  assert.equal(out.classAvgPct, null)
  assert.deepEqual([out.atRisk.length, out.studentAvg.size, out.recent.length], [0, 0, 0])
})

test('averages, at-risk students and newest-first results', () => {
  const out = examInsights([exam(1, '2026-01-10', [[1, 80], [2, 20], [3, null]]), exam(2, '2026-02-10', [[1, 60], [2, 40]])])
  assert.equal(out.classAvgPct, 50)
  assert.equal(out.studentAvg.get(1), 70)
  assert.equal(out.studentAvg.get(2), 30)
  assert.equal(out.studentAvg.has(3), false)
  assert.deepEqual(out.atRisk, [2])
  assert.equal(out.subjectAvg.get('Maths'), 60)
  assert.deepEqual(out.recent.map(r => [r.id, r.passCount, r.failCount]), [[2, 2, 0], [1, 1, 1]])
})

test('daily attendance counts late as attended and skips non-working days', () => {
  const rec = (date: string, status: string) => ({ date, status })
  const days = dailyAttendance(
    [rec('2026-03-02', 'present'), rec('2026-03-02', 'late'), rec('2026-03-02', 'absent'), rec('2026-03-02', 'present'), rec('2026-03-08', 'absent')],
    ['2026-03-08'])
  assert.deepEqual([...days], [['2026-03-02', 75]])
})
