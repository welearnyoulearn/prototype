import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalRequired, writeoffNeedsApproval, validateSettings, DEFAULT_SETTINGS, type StaffLogin } from './feeYearEnd'

const staff = (n: number): StaffLogin[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, full_name: `S${i + 1}`, email: `s${i + 1}@x.com`, role: 'school_admin' }))

test('a school with one login never needs sign-off, even if an approver is set', () => {
  assert.equal(approvalRequired({ ...DEFAULT_SETTINGS, approver_user_id: 1 }, staff(1)), false)
})

test('sign-off needs a chosen approver who still has an active login, and at least two logins', () => {
  assert.equal(approvalRequired({ ...DEFAULT_SETTINGS }, staff(3)), false)
  assert.equal(approvalRequired({ ...DEFAULT_SETTINGS, approver_user_id: 99 }, staff(3)), false)   // approver deactivated
  assert.equal(approvalRequired({ ...DEFAULT_SETTINGS, approver_user_id: 2 }, staff(3)), true)
})

test('a limit of 0 sends every write-off for approval; otherwise only those above the limit', () => {
  assert.equal(writeoffNeedsApproval(500, { ...DEFAULT_SETTINGS, writeoff_limit: 0 }), true)
  assert.equal(writeoffNeedsApproval(500, { ...DEFAULT_SETTINGS, writeoff_limit: 1000 }), false)
  assert.equal(writeoffNeedsApproval(1000, { ...DEFAULT_SETTINGS, writeoff_limit: 1000 }), false)
  assert.equal(writeoffNeedsApproval(1001, { ...DEFAULT_SETTINGS, writeoff_limit: 1000 }), true)
  assert.equal(writeoffNeedsApproval(0, DEFAULT_SETTINGS), false)
})

test('settings validation', () => {
  const ok = { owner_user_id: 1, approver_user_id: 2, writeoff_limit: 0, leave_open_days: 30 }
  assert.equal(validateSettings(ok, staff(2)), null)
  assert.match(validateSettings({ ...ok, approver_user_id: 1 }, staff(2))!, /different people/)
  assert.match(validateSettings({ ...ok, owner_user_id: 9 }, staff(2))!, /owner/)
  assert.match(validateSettings({ ...ok, approver_user_id: 9 }, staff(2))!, /approver/)
  assert.match(validateSettings({ ...ok, writeoff_limit: -1 }, staff(2))!, /limit/)
  assert.match(validateSettings({ ...ok, leave_open_days: 0 }, staff(2))!, /days/)
  assert.equal(validateSettings({ owner_user_id: null, approver_user_id: null, writeoff_limit: 0, leave_open_days: 30 }, staff(1)), null)
})
