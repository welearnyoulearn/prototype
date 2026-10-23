import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChecklist, checklistProgress, type ChecklistInput } from './feeYearEndChecklist'

const base: ChecklistInput = {
  year: '2026-27', isClosed: false, openStudents: 0, openTotal: 0,
  signoff: { required: false, waiting: 0, approverName: null },
  statementDone: false, rolledOver: false, registerOverdue: 0,
}
const by = (input: ChecklistInput) => Object.fromEntries(buildChecklist(input).map(s => [s.id, s]))

test('sign-off step only exists when the school has an approver', () => {
  assert.equal(by(base).signoff, undefined)
  assert.equal(by({ ...base, signoff: { required: true, waiting: 0, approverName: 'Priya' } }).signoff.status, 'done')
  const w = by({ ...base, signoff: { required: true, waiting: 2, approverName: 'Priya' } }).signoff
  assert.equal(w.status, 'waiting')
  assert.match(w.detail, /2 write-offs waiting/)
})

test('open students: to-do before closing, a warning after', () => {
  const open = { ...base, openStudents: 3, openTotal: 336600 }
  assert.equal(by(open).resolved.status, 'todo')
  assert.match(by(open).closed.detail, /needs a reason/)
  assert.equal(by({ ...open, isClosed: true }).resolved.status, 'warn')
  const lo = by({ ...open, isClosed: true, registerOverdue: 1 }).leaveopen
  assert.equal(lo.status, 'warn')
  assert.match(lo.detail, /3 students in the open-dues register — 1 past deadline/)
})

test('leave-open is only judged once the year is closed', () => {
  assert.equal(by(base).leaveopen.status, 'todo')
  assert.equal(by({ ...base, isClosed: true }).leaveopen.status, 'done')
})

test('rollover waits for the close', () => {
  assert.equal(by(base).rollover.detail, 'Close the year first')
  assert.equal(by({ ...base, isClosed: true }).rollover.detail, 'Next: run Year Rollover')
  assert.equal(by({ ...base, isClosed: true, rolledOver: true }).rollover.status, 'done')
})

test('the statement step stops nagging once the year is closed', () => {
  assert.equal(by(base).statement.status, 'todo')
  assert.equal(by({ ...base, statementDone: true }).statement.status, 'done')
  assert.equal(by({ ...base, isClosed: true }).statement.status, 'done')
})

test('a finished year shows every step done', () => {
  const steps = buildChecklist({ ...base, isClosed: true, statementDone: true, rolledOver: true, signoff: { required: true, waiting: 0, approverName: 'P' } })
  assert.deepEqual(checklistProgress(steps), { done: steps.length, total: steps.length })
})
