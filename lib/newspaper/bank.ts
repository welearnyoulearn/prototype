// The fallback: when fewer than 3 live notes pass the checks (feeds down, model down, a bad day), the edition is one
// "Today's Big Idea" from the 64 reviewed topics in lib/newspaper-topics.ts, which already come with a question. A
// child always gets something and unchecked text is never published. The topic rotates by date; the right answer's
// position in the options is fixed by the date too, so the same edition always looks the same.
import { NEWSPAPER_TOPICS } from '../newspaper-topics'
import type { EditionNote } from './writer'

export const BANK_SOURCE_NAME = 'WLYL Knowledge Bank'
export const BANK_CATEGORY = 'Today’s Big Idea'

/** Whole days since 1970-01-01 for a 'YYYY-MM-DD' date, so the rotation never repeats across a year boundary. */
export function dayIndex(editionDate: string): number {
  const [y, m, d] = editionDate.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function bankNote(editionDate: string): EditionNote {
  const day = dayIndex(editionDate)
  const topic = NEWSPAPER_TOPICS[day % NEWSPAPER_TOPICS.length]
  const [correct, ...wrong] = topic.quiz_options
  const correctIndex = day % 4
  const options = [...wrong]
  options.splice(correctIndex, 0, correct)
  return {
    category: BANK_CATEGORY,
    headline: topic.title,
    note: topic.content,
    whyItMatters: `Did you know? ${topic.fun_fact}`,
    tryIt: null,
    sourceName: BANK_SOURCE_NAME,
    sourceUrl: null,
    question: { stem: topic.quiz_question, options, correctIndex, explanation: `The answer is: ${topic.quiz_answer}.` },
  }
}
