// Pure rules for the Daily Quiz (#433): settings, IST timing, the season, which topics a subject's
// question comes from, scoring and points, and the working-day streak. No database access here, so
// every rule is unit-tested in lib/dailyQuizRules.test.ts.

import { z } from 'zod'

// ── Settings (Platform Admin only: one global row + optional per-school override) ──────────────
export type QuizSettings = {
  seasonStart: string // 'MM-DD'
  seasonEnd: string   // 'MM-DD'
  openTime: string    // 'HH:MM' IST
  closeTime: string   // 'HH:MM' IST
  grades: number[]
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  seasonStart: '07-01',
  seasonEnd: '03-15',
  openTime: '15:30',
  closeTime: '21:00',
  grades: [3, 4, 5, 6, 7, 8, 9, 10],
}

/** Days a missed quiz can still be taken late. */
export const LATE_DAYS = 7
/** The "not done yet" reminder goes this many minutes before the close. */
export const REMINDER_BEFORE_CLOSE_MIN = 120
/** Default window for "the last N working days" helpers (used by the doubt overdue rule). */
export const RECENT_WORKING_DAYS = 5

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const monthDay = z.string().regex(/^\d{2}-\d{2}$/).refine(v => {
  const [m, d] = v.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= MONTH_DAYS[m - 1]
}, 'Use a real month-day, e.g. 07-01')
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)')

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const quizSettingsSchema = z.object({
  seasonStart: monthDay,
  seasonEnd: monthDay,
  openTime: clock,
  closeTime: clock,
  grades: z.array(z.number().int().min(1).max(12)).max(12),
}).strict().superRefine((s, ctx) => {
  if (minutesOf(s.closeTime) - minutesOf(s.openTime) < 60) {
    ctx.addIssue({ code: 'custom', path: ['closeTime'], message: 'The quiz must stay open at least 1 hour, closing on the same day' })
  }
  if (s.seasonStart === s.seasonEnd) {
    ctx.addIssue({ code: 'custom', path: ['seasonEnd'], message: 'The season must start and end on different days' })
  }
  if (new Set(s.grades).size !== s.grades.length) {
    ctx.addIssue({ code: 'custom', path: ['grades'], message: 'Each grade once' })
  }
})

/** A per-school override: any field left null uses the global setting. */
export type QuizSettingsOverride = { [K in keyof QuizSettings]: QuizSettings[K] | null }

export function resolveSettings(global: QuizSettings, override: QuizSettingsOverride | null): QuizSettings {
  if (!override) return global
  return {
    seasonStart: override.seasonStart ?? global.seasonStart,
    seasonEnd: override.seasonEnd ?? global.seasonEnd,
    openTime: override.openTime ?? global.openTime,
    closeTime: override.closeTime ?? global.closeTime,
    grades: override.grades ?? global.grades,
  }
}

// ── IST time ──────────────────────────────────────────────────────────────────
/** Today's IST date ('YYYY-MM-DD') and minutes since IST midnight. */
export function istNow(now: Date = new Date()): { date: string; minutes: number } {
  const ist = new Date(now.getTime() + 330 * 60_000)
  return { date: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() }
}

/** The instant of an IST wall-clock time on an IST date. */
export function istInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+05:30`)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Is this date inside the season? Seasons may wrap the year end (1 Jul – 15 Mar). Both ends inclusive. */
export function inSeason(date: string, start: string, end: string): boolean {
  const md = date.slice(5)
  return start <= end ? md >= start && md <= end : md >= start || md <= end
}

/** Grade number from a class grade label ('7', 'Grade 7', 'VII' is not supported); null for LKG/UKG etc. */
export function gradeNumber(grade: string): number | null {
  const m = /^\s*(?:grade|class|std\.?)?\s*(\d{1,2})\s*$/i.exec(grade)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 12 ? n : null
}

/** The last `count` working days up to and including `today`, newest first. */
export function recentWorkingDays(today: string, isWorking: (date: string) => boolean, count = RECENT_WORKING_DAYS, lookbackDays = 30): string[] {
  const days: string[] = []
  for (let i = 0; i < lookbackDays && days.length < count; i++) {
    const d = addDays(today, -i)
    if (isWorking(d)) days.push(d)
  }
  return days
}

// ── Topic choice per subject (#444) ───────────────────────────────────────────
export type TopicSource = 'covered' | 'revision'

/** A completed topic only counts as "new" for this long; older ones that were never asked are revision. */
export const NEW_TOPIC_DAYS = 14

/** A topic the teacher marked completed in this class (it has questions). */
export type CompletedTopic = { topicId: number; coveredDate: string | null; chapterOrder: number; topicOrder: number }

/**
 * Which topic(s) a subject's question comes from today:
 *   1. a topic marked completed since the last quiz — i.e. completed recently and not yet asked as a new topic
 *      in this class. Newest first (then syllabus order); the others follow, one per day.
 *   2. none → revision of every completed topic (each student's wrong topics come first when drawing).
 *   3. nothing ever completed → null: skip the subject today.
 */
export function chooseTopics(completed: CompletedTopic[], askedAsNew: Set<number>, today: string): { source: TopicSource; topicIds: number[] } | null {
  const since = addDays(today, -NEW_TOPIC_DAYS)
  const fresh = completed
    .filter(t => t.coveredDate !== null && t.coveredDate >= since && t.coveredDate <= today && !askedAsNew.has(t.topicId))
    .sort((a, b) => (b.coveredDate ?? '').localeCompare(a.coveredDate ?? '') || a.chapterOrder - b.chapterOrder || a.topicOrder - b.topicOrder || a.topicId - b.topicId)
  if (fresh.length) return { source: 'covered', topicIds: [fresh[0].topicId] }
  if (completed.length) return { source: 'revision', topicIds: unique(completed.map(t => t.topicId)) }
  return null
}

function unique(ids: number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b)
}

// ── Attempt state ─────────────────────────────────────────────────────────────
export type QuizPhase = 'upcoming' | 'open' | 'closed'

export function quizPhase(now: Date, opensAt: Date, closesAt: Date): QuizPhase {
  if (now < opensAt) return 'upcoming'
  return now < closesAt ? 'open' : 'closed'
}

/** May a late attempt still be started for a quiz closed at `closesAt`? */
export function lateAllowed(now: Date, quizDate: string, closesAt: Date): boolean {
  return now >= closesAt && istNow(now).date <= addDays(quizDate, LATE_DAYS)
}

/**
 * Answers and explanations are shown as soon as the student finishes (#450): they learn from their mistakes
 * while the quiz is fresh. Each student draws their own questions, so a finished classmate can't simply pass
 * the answers on.
 */
export function answersVisible(submitted: boolean): boolean {
  return submitted
}

// ── Points ────────────────────────────────────────────────────────────────────
export const QUIZ_POINTS = {
  done: 5,
  doneLate: 3, // half of done, rounded up; late quizzes earn no accuracy points
  perCorrect: 2,
  correctCap: 10,
  perfect: 5,
  perfectMinQuestions: 3,
} as const

export type PointAward = { action: string; points: number }

/** Points for finishing (given on submit). */
export function participationAward(isLate: boolean): PointAward {
  return isLate ? { action: 'daily_quiz_late', points: QUIZ_POINTS.doneLate } : { action: 'daily_quiz_done', points: QUIZ_POINTS.done }
}

/** Points for accuracy (given once results are out, so scores never leak before the close). On time only. */
export function accuracyAwards(isLate: boolean, correct: number, total: number): PointAward[] {
  if (isLate || total === 0) return []
  const awards: PointAward[] = []
  const pts = Math.min(correct * QUIZ_POINTS.perCorrect, QUIZ_POINTS.correctCap)
  if (pts > 0) awards.push({ action: 'daily_quiz_correct', points: pts })
  if (correct === total && total >= QUIZ_POINTS.perfectMinQuestions) awards.push({ action: 'daily_quiz_perfect', points: QUIZ_POINTS.perfect })
  return awards
}

/**
 * Working-day streak: consecutive class quizzes (newest first) the student finished, on time or late.
 * Holidays and weekly offs have no quiz, so they never break it. A quiz that is still open today
 * doesn't break it either, since there's still time.
 */
export function quizStreak(quizzesNewestFirst: { done: boolean; stillOpen: boolean }[]): number {
  let streak = 0
  for (const q of quizzesNewestFirst) {
    if (q.done) streak++
    else if (q.stillOpen && streak === 0) continue
    else break
  }
  return streak
}
