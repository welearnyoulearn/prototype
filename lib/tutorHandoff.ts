// Hand-off from a reviewed Daily Quiz question to the student AI Tutor (#450). Pure and browser-safe.
//
// The Daily Quiz does not answer doubts with AI itself. When a student is still confused after the explanation,
// "Ask the AI Tutor" saves a TutorHandoff in sessionStorage under TUTOR_HANDOFF_KEY and opens the AI Hub. The
// tutor chat reads it once (readTutorHandoff), starts the chat in that subject with tutorPrompt(...) as the
// student's first message, and the handoff is gone. Until the tutor chat does that, the button stays hidden:
// set NEXT_PUBLIC_QUIZ_TUTOR_HANDOFF=1 to show it.

export const TUTOR_HANDOFF_KEY = 'wlyl-tutor-handoff'
/** Student portal section of the AI Tutor. */
export const TUTOR_NAV_KEY = 'ai-hub'

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

/** Is the AI Tutor ready to take quiz questions? Read at build time, so it works in the browser. */
export function tutorHandoffEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QUIZ_TUTOR_HANDOFF === '1'
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

/** Saves the hand-off for the tutor. False when storage is unavailable (private mode). */
export function saveTutorHandoff(storage: Pick<Storage, 'setItem'>, h: TutorHandoff): boolean {
  try { storage.setItem(TUTOR_HANDOFF_KEY, JSON.stringify(h)); return true } catch { return false }
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
