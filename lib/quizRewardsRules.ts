// Pure rules for Daily Quiz rewards (#434): weeks, streak milestones, ranking, improvement and the class goal.
// Points are a ledger (student_points): every award is one row, the balance is their sum, and a future
// marketplace spends them with negative rows. Tested in lib/quizRewardsRules.test.ts.

import { addDays, quizStreak } from './dailyQuizRules'

export const STREAK_MILESTONES = [
  { days: 5, points: 10, action: 'quiz_streak_5', badge: 'quiz_streak_5' },
  { days: 20, points: 30, action: 'quiz_streak_20', badge: 'quiz_streak_20' },
  { days: 60, points: 75, action: 'quiz_streak_60', badge: 'quiz_streak_60' },
] as const

export const WEEKLY_IMPROVED = { points: 10, minQuizzes: 3, minGainPct: 10 } as const
export const CLASS_GOAL_PCT = 80
export const SHARP_SHOOTER_PERFECTS = 10

/** Point actions that count for the weekly leaderboard: on time only, so late catch-ups never rank. */
export const LEADERBOARD_ACTIONS = ['daily_quiz_done', 'daily_quiz_correct', 'daily_quiz_perfect', 'quiz_streak_5', 'quiz_streak_20', 'quiz_streak_60', 'weekly_improved', 'doubt_proven'] as const

/** Monday of the IST week containing `date` ('YYYY-MM-DD'). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

/** A week as an integer reference id for the ledger (2026-10-26 → 20261026). */
export function weekRef(weekStartDate: string): number {
  return Number(weekStartDate.replaceAll('-', ''))
}

/**
 * Milestones crossed when a quiz is finished: the streak before (that quiz not counted) and after.
 * A late catch-up that closes a gap can cross several at once.
 */
export function milestonesCrossed(before: number, after: number) {
  return STREAK_MILESTONES.filter(m => before < m.days && after >= m.days)
}

/** The streak without one quiz counted: used to tell which milestones that quiz crossed. */
export function streakWithout(quizzes: { quizId: number; done: boolean; stillOpen: boolean }[], quizId: number): number {
  return quizStreak(quizzes.map(q => (q.quizId === quizId ? { done: false, stillOpen: q.stillOpen || q === quizzes[0] } : q)))
}

export type Ranked<T> = T & { rank: number }

/** Competition ranking (1, 2, 2, 4) by points, highest first; ties keep name order. */
export function rankByPoints<T extends { points: number; name: string }>(rows: T[]): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || r.points !== sorted[i - 1].points) rank = i + 1
    return { ...r, rank }
  })
}

/** Accuracy gain in percentage points, or null when either week has too few quizzes to compare. */
export function improvement(prev: { quizzes: number; correct: number; total: number }, cur: { quizzes: number; correct: number; total: number }): number | null {
  if (prev.quizzes < WEEKLY_IMPROVED.minQuizzes || cur.quizzes < WEEKLY_IMPROVED.minQuizzes || !prev.total || !cur.total) return null
  return Math.round((cur.correct / cur.total - prev.correct / prev.total) * 100)
}

/** Share of possible on-time quizzes the class finished this week. Null when no quiz was posted. */
export function participationPct(finishedOnTime: number, quizzes: number, students: number): number | null {
  const possible = quizzes * students
  return possible ? Math.round((finishedOnTime / possible) * 100) : null
}
