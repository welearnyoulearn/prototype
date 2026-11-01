// Points rules for the Daily Newspaper. Pure: no database, no clock.
// Points are one ledger (student_points): quiz, doubts and newspaper points all land in the same balance.

/** Points a child earns from one newspaper: for answering, and a bonus when the answer is right. */
export const NEWS_POINTS = { answered: 2, correct: 3 } as const

export const NEWS_ACTIONS = ['news_answered', 'news_correct'] as const
export type NewsAction = (typeof NEWS_ACTIONS)[number]

export const NEWS_REF = 'news_edition'

/** What a child earns for one newspaper: 0 until they answer, 2 for answering, 5 for answering correctly. */
export function newsPointsEarned(answered: boolean, correct: boolean): number {
  if (!answered) return 0
  return NEWS_POINTS.answered + (correct ? NEWS_POINTS.correct : 0)
}
