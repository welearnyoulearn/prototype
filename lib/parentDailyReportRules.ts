// Parent Daily Report (#450): the pure rules, so they can be unit-tested without a database.

export type QuizDayStatus =
  | 'no_quiz'       // holiday, weekly off, no topics yet, or the feature started later
  | 'not_open_yet'  // today, before the opening time
  | 'not_started'   // open now, nothing answered yet
  | 'in_progress'   // started, not finished
  | 'completed'     // finished before the close
  | 'completed_late'// finished after the close (within the 7 days)
  | 'missed'        // closed and not finished

export type QuizDayInput = {
  quiz: { opensAt: Date; closesAt: Date } | null
  attempt: { status: 'in_progress' | 'submitted'; isLate: boolean } | null
}

/** Where the child stands with one day's quiz. */
export function quizDayStatus({ quiz, attempt }: QuizDayInput, now: Date): QuizDayStatus {
  if (!quiz) return 'no_quiz'
  if (attempt?.status === 'submitted') return attempt.isLate ? 'completed_late' : 'completed'
  if (now < quiz.opensAt) return 'not_open_yet'
  if (now >= quiz.closesAt) return 'missed'
  return attempt ? 'in_progress' : 'not_started'
}

export const QUIZ_STATUS_TEXT: Record<QuizDayStatus, string> = {
  no_quiz: 'No quiz this day',
  not_open_yet: 'Not open yet',
  not_started: 'Not started yet',
  in_progress: 'Started, not finished',
  completed: 'Completed ✓',
  completed_late: 'Completed late ✓',
  missed: 'Missed',
}

export type AttendanceDay = 'present' | 'absent' | 'late' | 'not_marked'

/** One word for the day from the attendance sessions (morning / afternoon …): absent anywhere wins, then late. */
export function attendanceDay(statuses: string[]): AttendanceDay {
  if (!statuses.length) return 'not_marked'
  if (statuses.includes('absent')) return 'absent'
  if (statuses.includes('late')) return 'late'
  return 'present'
}

/** How far back a parent can look. */
export const REPORT_MAX_DAYS_BACK = 30
