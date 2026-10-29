// What the student portal's floating "Today" panel shows (#442). Pure: the component fetches, this decides the copy,
// the counts and which rows exist, so the rules can be unit-tested without a browser.

/** The parts of GET /api/student/quiz/today the panel reads. */
export type DialToday = {
  status: string
  opensAt: string | null
  closesAt: string | null
  holiday?: string
  quiz: { phase: 'upcoming' | 'open' | 'closed'; closesAt: string; subjects: string[]; attempt: { status: 'in_progress' | 'submitted'; answered: number; total: number; correct: number | null; answersVisible: boolean } | null } | null
  late: unknown[]
}

/** The parts of GET /api/student/quiz/progress the panel reads. */
export type DialProgress = {
  totalPoints: number
  weekPoints: number
  streak: number
  badges: unknown[]
  leaderboard: { me: { rank: number; points: number } | null; classSize: number } | null
}

export type DialDoubt = { status: 'open' | 'explained' | 'clarified' }

export type DialInput = {
  dailyQuiz: boolean
  doubts: boolean
  attendance: boolean
  calendar: boolean
  today: DialToday | null
  progress: DialProgress | null
  doubtList: DialDoubt[] | null
  /** This month's attendance %, when the school has attendance and something is recorded. */
  attendancePct: number | null
}

export type DialTask = {
  key: 'quiz' | 'doubts'
  navKey: string
  title: string
  detail: string
  /** Needs the student to act now (drives the badge and the amber state). */
  urgent: boolean
}

export type DialStat = { key: 'points' | 'streak' | 'rank'; label: string; value: string; sub: string }
export type DialLink = { key: 'marks' | 'attendance' | 'calendar'; navKey: string; label: string; detail: string }
export type DialRing = { done: number; total: number; label: string }

export type DialModel = {
  ring: DialRing
  /** Items that need the student now: the badge on the floating button. */
  badge: number
  headline: string
  tasks: DialTask[]
  stats: DialStat[]
  links: DialLink[]
}

function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Today's quiz as a progress ring: finished counts as full, no quiz as empty. */
export function quizRing(today: DialToday | null): DialRing {
  const quiz = today?.quiz
  if (!quiz) return { done: 0, total: 0, label: '–' }
  const a = quiz.attempt
  if (!a) return { done: 0, total: quiz.subjects.length, label: `0/${quiz.subjects.length}` }
  if (a.status === 'submitted') return { done: a.total, total: a.total, label: `${a.total}/${a.total}` }
  return { done: a.answered, total: a.total, label: `${a.answered}/${a.total}` }
}

function quizTask(today: DialToday): DialTask | null {
  const late = today.late.length
  const lateNote = late > 0 ? ` · ${plural(late, 'missed quiz', 'missed quizzes')} to catch up` : ''
  const quiz = today.quiz
  const a = quiz?.attempt ?? null
  const base = { key: 'quiz', navKey: 'daily-quiz' } as const

  if (today.status === 'upcoming' && today.opensAt) {
    return { ...base, title: 'Today’s quiz is coming', detail: `Opens at ${istTime(today.opensAt)}${lateNote}`, urgent: late > 0 }
  }
  if (quiz && !a && quiz.phase === 'open') {
    return { ...base, title: 'Start today’s quiz', detail: `${plural(quiz.subjects.length, 'question')} · closes ${istTime(quiz.closesAt)}${lateNote}`, urgent: true }
  }
  if (quiz && a?.status === 'in_progress') {
    return { ...base, title: 'Finish today’s quiz', detail: `${a.total - a.answered} of ${a.total} left · closes ${istTime(quiz.closesAt)}${lateNote}`, urgent: true }
  }
  if (quiz && a?.status === 'submitted' && !a.answersVisible) {
    return { ...base, title: 'Quiz done', detail: `Answers come out at ${istTime(quiz.closesAt)}${lateNote}`, urgent: late > 0 }
  }
  if (a?.status === 'submitted' && a.answersVisible) {
    return { ...base, title: `Quiz done: ${a.correct ?? 0} of ${a.total}`, detail: `See the answers${lateNote}`, urgent: late > 0 }
  }
  if (late > 0) return { ...base, title: 'Catch up on a quiz', detail: `${plural(late, 'missed quiz', 'missed quizzes')} still open`, urgent: true }
  return null
}

function doubtsTask(list: DialDoubt[] | null): DialTask | null {
  const doubts = list ?? []
  const answered = doubts.filter(d => d.status === 'explained').length
  const waiting = doubts.filter(d => d.status === 'open').length
  const base = { key: 'doubts', navKey: 'daily-quiz' } as const
  if (answered > 0) return { ...base, title: answered === 1 ? 'Your teacher answered a doubt' : `Your teacher answered ${answered} doubts`, detail: 'Read the reply and check you’ve got it', urgent: true }
  if (waiting > 0) return { ...base, title: plural(waiting, 'doubt') + ' with your teacher', detail: 'Waiting for a reply', urgent: false }
  return null
}

/** Everything the Today panel shows, for the features this school has. */
export function buildDialModel(input: DialInput): DialModel {
  const tasks: DialTask[] = []
  if (input.dailyQuiz && input.today) {
    const t = quizTask(input.today)
    if (t) tasks.push(t)
  }
  if (input.doubts) {
    const t = doubtsTask(input.doubtList)
    if (t) tasks.push(t)
  }

  const stats: DialStat[] = []
  const p = input.progress
  if (input.dailyQuiz && p) {
    stats.push({ key: 'points', label: 'Points', value: p.totalPoints.toLocaleString('en-IN'), sub: `+${p.weekPoints} this week` })
    stats.push({ key: 'streak', label: 'Streak', value: String(p.streak), sub: p.streak === 1 ? 'school day' : 'school days' })
    const me = p.leaderboard?.me
    stats.push({ key: 'rank', label: 'Rank', value: me ? `#${me.rank}` : '–', sub: me ? `of ${p.leaderboard?.classSize ?? 0}` : 'this week' })
  }

  const links: DialLink[] = [{ key: 'marks', navKey: 'my-marks', label: 'Marks', detail: 'Exams and results' }]
  if (input.attendance) links.push({ key: 'attendance', navKey: 'attendance', label: 'Attendance', detail: input.attendancePct === null ? 'This month' : `${input.attendancePct}% this month` })
  if (input.calendar) links.push({ key: 'calendar', navKey: 'calendar', label: 'Calendar', detail: 'Exams and events' })

  const badge = tasks.filter(t => t.urgent).reduce((n, t) => n + (t.key === 'quiz' ? 1 + (input.today?.late.length ?? 0) : countAnswered(input.doubtList)), 0)
  const todo = tasks.filter(t => t.urgent).length
  const headline = todo > 0 ? (todo === 1 ? '1 thing to do' : `${todo} things to do`) : 'All done for today'

  return { ring: input.dailyQuiz ? quizRing(input.today) : { done: 0, total: 0, label: '–' }, badge, headline, tasks, stats, links }
}

function countAnswered(list: DialDoubt[] | null): number {
  return (list ?? []).filter(d => d.status === 'explained').length
}
