import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TUTOR_HANDOFF_KEY, readTutorHandoff, saveTutorHandoff, tutorPrompt, type TutorHandoff } from './tutorHandoff'

const h: TutorHandoff = {
  source: 'daily-quiz', subject: 'Science', topic: 'Photosynthesis', question: 'Plants take in which gas?',
  options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'], chosenIndex: 0, correctIndex: 1,
  explanation: 'Leaves take in carbon dioxide to make food.', message: 'Don’t plants breathe oxygen?', createdAt: '2026-10-29T13:00:00.000Z',
}

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m }
}

test('prompt: question, options, the student’s answer, the right one, the explanation and the confusion', () => {
  const p = tutorPrompt(h)
  assert.match(p, /Science question \(topic: Photosynthesis\)/)
  assert.match(p, /A\. Oxygen\nB\. Carbon dioxide/)
  assert.match(p, /I chose A\.\nThe right answer is B\./)
  assert.match(p, /The explanation says: Leaves take in/)
  assert.match(p, /What confuses me: Don’t plants breathe oxygen\?/)
  assert.match(tutorPrompt({ ...h, chosenIndex: null, topic: null, explanation: null, message: null }), /^I got this Science question in my daily quiz[\s\S]*I did not answer it\./)
})

test('hand-off is read once and only while fresh', () => {
  const s = memory()
  assert.ok(saveTutorHandoff(s, h))
  assert.deepEqual(readTutorHandoff(s, new Date('2026-10-29T13:05:00.000Z')), h)
  assert.equal(readTutorHandoff(s, new Date('2026-10-29T13:05:00.000Z')), null, 'consumed')
  saveTutorHandoff(s, h)
  assert.equal(readTutorHandoff(s, new Date('2026-10-29T13:30:00.000Z')), null, 'stale after 10 minutes')
  assert.equal(s.m.has(TUTOR_HANDOFF_KEY), false)
  s.setItem(TUTOR_HANDOFF_KEY, '{broken')
  assert.equal(readTutorHandoff(s), null, 'bad data ignored')
  assert.equal(saveTutorHandoff({ setItem: () => { throw new Error('private mode') } }, h), false)
})
