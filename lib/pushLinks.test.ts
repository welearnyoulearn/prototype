import test from 'node:test'
import assert from 'node:assert/strict'
import { mobilePushLink, pushLinkFor, teacherAppLink } from './pushLinks'

test('parents get a deep link into the parent app; other portals get none', () => {
  assert.equal(pushLinkFor('teacher', 'exam_scheduled', null), null)
  assert.equal(pushLinkFor('student', 'marks_released', { exam_id: 4 }), null)
  assert.equal(pushLinkFor('school', 'fee_writeoff_request', null), null)
})

test('result notifications open that exam\'s mark sheet', () => {
  assert.equal(pushLinkFor('parent', 'marks_released', { exam_id: 12, student_id: 3 }), '/exams/12')
  assert.equal(pushLinkFor('parent', 'ack_nudge', { exam_id: 7 }), '/exams/7')
})

test('a result notification without a usable exam id falls back to the exam list', () => {
  for (const data of [null, undefined, {}, { exam_id: 'abc' }, { exam_id: 0 }, { exam_id: -3 }, { exam_id: 1.5 }, 'x']) {
    assert.equal(pushLinkFor('parent', 'marks_released', data), '/exams')
  }
})

test('schedule, update, cancel and reminder notifications open the exam list', () => {
  for (const type of ['exam_scheduled', 'exam_updated', 'exam_cancelled', 'exam_reminder_7day', 'exam_reminder_1day', 'exam_reminder_today']) {
    assert.equal(pushLinkFor('parent', type, { exam_id: 9 }), '/exams', type)
  }
})

test('anything else (broadcasts, birthdays, unknown types) opens the notification list', () => {
  for (const type of ['teacher_broadcast', 'birthday', 'something_new']) assert.equal(pushLinkFor('parent', type, null), '/notifications', type)
})

test('the mobile app gets a screen it can open: exam detail links become the exam list', () => {
  assert.equal(mobilePushLink('/exams/12'), '/exams')
  assert.equal(mobilePushLink('/exams'), '/exams')
  assert.equal(mobilePushLink('/notifications'), '/notifications')
  assert.equal(mobilePushLink(null), '/notifications')
})

test('teacher pushes open the matching teacher-app screen', () => {
  assert.equal(teacherAppLink('marks_entry_required', { class_id: 14, exam_id: 3 }), '/class/14?tab=marks&examId=3')
  assert.equal(teacherAppLink('marks_entry_nudge', { class_id: 14 }), '/class/14?tab=marks')
  assert.equal(teacherAppLink('ack_completed', null), '/classes')
  for (const type of ['exam_scheduled', 'exam_updated', 'exam_cancelled', 'exam_reminder_1day']) assert.equal(teacherAppLink(type, { exam_id: 1 }), '/exam-schedule', type)
  for (const type of ['doubt_new', 'doubt_reopened', 'doubt_clarified']) assert.equal(teacherAppLink(type, null), '/doubts', type)
  assert.equal(teacherAppLink('syllabus_behind_nudge', null), '/syllabus')
  for (const type of ['teacher_broadcast', 'substitute_needed', 'something_new']) assert.equal(teacherAppLink(type, null), '/notifications', type)
  assert.equal(teacherAppLink('marks_submitted', { class_id: 'abc' }), '/classes')
})
