// Hand-off from a reviewed Daily Quiz question to the student AI Tutor (#450, #476). Pure and browser-safe.
//
// The Daily Quiz does not answer doubts with AI itself. When a student is still confused after the explanation,
// "Ask the AI Tutor" saves a TutorHandoff in sessionStorage under TUTOR_HANDOFF_KEY, tells the page with
// TUTOR_HANDOFF_EVENT and opens the AI Hub. The tutor chat takes it once (readTutorHandoff), starts a new chat in
// that subject with tutorPromptWithin(...) as the student's first message, and the handoff is gone. The button is
// shown to students who have the tutor (AI Pro), see StudentDailyQuiz.

export const TUTOR_HANDOFF_KEY = 'wlyl-tutor-handoff'
/** Fired on window after a hand-off is saved, for a tutor chat that is already mounted. */
export const TUTOR_HANDOFF_EVENT = 'wlyl:tutor-handoff'
/** Student portal section of the AI Tutor. */
export const TUTOR_NAV_KEY = 'ai-hub'
/** The tutor refuses a message longer than this (StudentTutorChat MAX_CHARS). */
export const TUTOR_MESSAGE_MAX_CHARS = 1000

export type TutorHandoff = {
  source: 'daily-quiz'
  subject: string
  topic: string | null
  question: string
  options: string[]
  chosenIndex: number | null
  correctIndex: number
  explanation: string | null
  /** What the student says is confusing, if anything. */
  message: string | null
  createdAt: string
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** The student's first message to the tutor, in plain words. */
export function tutorPrompt(h: TutorHandoff): string {
  const lines = [
    `I got this ${h.subject} question${h.topic ? ` (topic: ${h.topic})` : ''} in my daily quiz and I don't understand it.`,
    '',
    h.question,
    ...h.options.map((o, i) => `${LETTERS[i] ?? i + 1}. ${o}`),
    '',
    h.chosenIndex === null ? 'I did not answer it.' : `I chose ${LETTERS[h.chosenIndex] ?? h.chosenIndex + 1}.`,
    `The right answer is ${LETTERS[h.correctIndex] ?? h.correctIndex + 1}.`,
  ]
  if (h.explanation) lines.push(`The explanation says: ${h.explanation}`)
  if (h.message) lines.push('', `What confuses me: ${h.message}`)
  lines.push('', 'Please explain it step by step.')
  return lines.join('\n')
}

/**
 * tutorPrompt that fits the tutor's message limit. Too long: first the explanation goes (the tutor can work it out),
 * then what confuses the student is kept but the question is shortened as a last resort. Never empty, never over max.
 */
export function tutorPromptWithin(h: TutorHandoff, max = TUTOR_MESSAGE_MAX_CHARS): string {
  const full = tutorPrompt(h)
  if (full.length <= max) return full
  const withoutExplanation = tutorPrompt({ ...h, explanation: null })
  if (withoutExplanation.length <= max) return withoutExplanation
  const slim = tutorPrompt({ ...h, explanation: null, question: h.question.slice(0, Math.max(60, h.question.length - (withoutExplanation.length - max) - 1)).trimEnd() + '…' })
  return slim.length <= max ? slim : slim.slice(0, max)
}

/** Saves the hand-off for the tutor. False when storage is unavailable (private mode). */
export function saveTutorHandoff(storage: Pick<Storage, 'setItem'>, h: TutorHandoff): boolean {
  try { storage.setItem(TUTOR_HANDOFF_KEY, JSON.stringify(h)) } catch { return false }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TUTOR_HANDOFF_EVENT))
  return true
}

/** For the tutor chat: takes the pending hand-off (at most once) if it is recent, else null. */
export function readTutorHandoff(storage: Pick<Storage, 'getItem' | 'removeItem'>, now: Date = new Date(), maxAgeMs = 10 * 60_000): TutorHandoff | null {
  let raw: string | null = null
  try { raw = storage.getItem(TUTOR_HANDOFF_KEY); storage.removeItem(TUTOR_HANDOFF_KEY) } catch { return null }
  if (!raw) return null
  try {
    const h = JSON.parse(raw) as TutorHandoff
    if (h.source !== 'daily-quiz' || typeof h.question !== 'string' || !Array.isArray(h.options)) return null
    if (now.getTime() - new Date(h.createdAt).getTime() > maxAgeMs) return null
    return h
  } catch { return null }
}
