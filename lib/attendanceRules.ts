// The single source of truth for how attendance is counted and shown.
//
// Every portal — admin dashboards, teacher screens, the parent app, the student app, the
// exports — goes through these functions, so one student's numbers can never differ
// between screens. Pure module: no database, no Next imports, safe on the client.
//
// The rules (see docs/DECISIONS.md, #153):
//  • Statuses: present, absent, late. Late counts as attended.
//  • A day has up to two sessions (morning, afternoon). Each MARKED session counts equally.
//  • Attendance % = (present + late) sessions ÷ marked sessions, rounded to a whole number.
//  • Holidays (Academic Calendar) and weekly-off days are not working days: no marking, and
//    anything recorded on them is ignored in every count.
//  • A working day nobody marked is a gap to chase, not an absence — it is left out of the %.

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_SESSIONS = ['morning', 'afternoon'] as const
export type AttendanceSession = (typeof ATTENDANCE_SESSIONS)[number]

export const GOOD_ATTENDANCE_PCT = 90
export const LOW_ATTENDANCE_PCT = 75

/** How many days back (including today) a teacher may still mark a class. Admin: any past day. */
export const TEACHER_BACKDATE_DAYS = 2

export type AttendanceBand = 'good' | 'watch' | 'low' | 'none'

// ─── Dates (all "YYYY-MM-DD" strings; India Standard Time for "today") ─────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function isValidMonthStr(s: unknown): s is string {
  return typeof s === 'string' && MONTH_RE.test(s) && isValidDateStr(`${s}-01`)
}

/** Today's date in India, whatever timezone the server runs in. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function enumerateDates(from: string, to: string, max = 800): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) out.push(d)
  return out
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

export function isAttended(status: AttendanceStatus | string | null | undefined): boolean {
  return status === 'present' || status === 'late'
}

/** The one attendance-percentage formula. `null` when nothing has been marked yet. */
export function attendancePercent(attended: number, marked: number): number | null {
  if (!marked || marked <= 0) return null
  return Math.round((attended / marked) * 100)
}

export function attendanceBand(pct: number | null): AttendanceBand {
  if (pct === null) return 'none'
  if (pct >= GOOD_ATTENDANCE_PCT) return 'good'
  if (pct >= LOW_ATTENDANCE_PCT) return 'watch'
  return 'low'
}

export type SessionCounts = { present: number; late: number; absent: number }

export type AttendanceSummary = SessionCounts & {
  marked: number          // sessions marked (present + late + absent)
  attended: number        // present + late
  pct: number | null
  band: AttendanceBand
}

export function summarizeCounts(c: SessionCounts): AttendanceSummary {
  const marked = c.present + c.late + c.absent
  const attended = c.present + c.late
  const pct = attendancePercent(attended, marked)
  return { ...c, marked, attended, pct, band: attendanceBand(pct) }
}

// ─── Non-working days (holidays + weekly off) ─────────────────────────────────

export type NonWorkingDay = { kind: 'holiday' | 'weekly_off'; title: string; eventId?: number }

export type CalendarHolidayRow = {
  id: number
  title: string
  event_type: string
  event_date: string
  end_date: string | null
}

/**
 * Expands holiday events (a date, or a from–to range) plus the school's weekly-off weekdays
 * into a date → reason map for [from, to]. A named holiday wins over a plain weekly off.
 */
export function expandNonWorkingDays(
  events: CalendarHolidayRow[],
  weeklyOff: number[],
  from: string,
  to: string,
): Map<string, NonWorkingDay> {
  const out = new Map<string, NonWorkingDay>()
  for (const ev of events) {
    if (ev.event_type !== 'holiday') continue
    const start = ev.event_date > from ? ev.event_date : from
    const endRaw = ev.end_date ?? ev.event_date
    const end = endRaw < to ? endRaw : to
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (!out.has(d)) out.set(d, { kind: 'holiday', title: ev.title, eventId: ev.id })
    }
  }
  if (weeklyOff.length > 0) {
    for (const d of enumerateDates(from, to)) {
      if (!out.has(d) && weeklyOff.includes(weekdayOf(d))) {
        out.set(d, { kind: 'weekly_off', title: 'Weekly off' })
      }
    }
  }
  return out
}

// ─── One student's days ───────────────────────────────────────────────────────

export type DayStatus =
  | 'present' | 'late' | 'absent' | 'half'   // half = absent in one session, attended the other
  | 'not_marked' | 'holiday' | 'weekly_off' | 'future' | 'before_joining'

export type SessionRecord = { date: string; session: AttendanceSession | string; status: AttendanceStatus | string }

/** Colour of a single day from its sessions. `null` session = not marked. */
export function dayStatusFor(
  morning: string | null | undefined,
  afternoon: string | null | undefined,
): 'present' | 'late' | 'absent' | 'half' | 'not_marked' {
  const marked = [morning, afternoon].filter((s): s is string => !!s)
  if (marked.length === 0) return 'not_marked'
  const absent = marked.filter(s => s === 'absent').length
  if (absent === marked.length) return 'absent'
  if (absent > 0) return 'half'
  return marked.some(s => s === 'late') ? 'late' : 'present'
}

export type CalendarDay = {
  date: string
  status: DayStatus
  morning: string | null
  afternoon: string | null
  title?: string   // holiday name when status is holiday / weekly_off
}

export type StudentMonth = {
  month: string
  days: CalendarDay[]
  summary: AttendanceSummary
  /** Working days in the month (up to today) that had at least one session marked. */
  daysMarked: number
  /** Days the student missed entirely (absent in every marked session). */
  absentDays: number
  halfDays: number
}

function groupByDate(records: SessionRecord[]): Map<string, { morning: string | null; afternoon: string | null }> {
  const byDate = new Map<string, { morning: string | null; afternoon: string | null }>()
  for (const r of records) {
    const cur = byDate.get(r.date) ?? { morning: null, afternoon: null }
    if (r.session === 'morning') cur.morning = String(r.status)
    else if (r.session === 'afternoon') cur.afternoon = String(r.status)
    byDate.set(r.date, cur)
  }
  return byDate
}

/** Counts only sessions on working days, on or after joining, up to and including today. */
export function countWorkingSessions(
  records: SessionRecord[],
  nonWorking: Map<string, NonWorkingDay>,
  today: string,
  joinDate?: string | null,
): SessionCounts {
  const counts: SessionCounts = { present: 0, late: 0, absent: 0 }
  for (const r of records) {
    if (r.date > today || nonWorking.has(r.date)) continue
    if (joinDate && r.date < joinDate) continue
    if (r.status === 'present') counts.present++
    else if (r.status === 'late') counts.late++
    else if (r.status === 'absent') counts.absent++
  }
  return counts
}

export function buildStudentMonth(params: {
  month: string
  records: SessionRecord[]
  nonWorking: Map<string, NonWorkingDay>
  today: string
  joinDate?: string | null
}): StudentMonth {
  const { month, records, nonWorking, today, joinDate } = params
  const { from, to } = monthBounds(month)
  const byDate = groupByDate(records)
  const days: CalendarDay[] = []
  let daysMarked = 0, absentDays = 0, halfDays = 0

  for (const date of enumerateDates(from, to)) {
    const s = byDate.get(date) ?? { morning: null, afternoon: null }
    const nw = nonWorking.get(date)
    let status: DayStatus
    if (nw) status = nw.kind
    else if (date > today) status = 'future'
    else if (joinDate && date < joinDate) status = 'before_joining'
    else status = dayStatusFor(s.morning, s.afternoon)

    const counted = !nw && date <= today && !(joinDate && date < joinDate) && status !== 'not_marked'
    if (counted) {
      daysMarked++
      if (status === 'absent') absentDays++
      if (status === 'half') halfDays++
    }
    days.push({
      date, status,
      morning: nw || date > today ? null : s.morning,
      afternoon: nw || date > today ? null : s.afternoon,
      ...(nw ? { title: nw.title } : {}),
    })
  }

  // The month's summary counts only this month's sessions.
  const monthCounts = countWorkingSessions(records.filter(r => r.date >= from && r.date <= to), nonWorking, today, joinDate)
  return { month, days, summary: summarizeCounts(monthCounts), daysMarked, absentDays, halfDays }
}

// ─── Marking rules ────────────────────────────────────────────────────────────

export type MarkWindowResult = { ok: true } | { ok: false; code: 'FUTURE' | 'TOO_OLD'; message: string }

/** Can this person still mark/edit attendance for `date`? Nobody marks the future; teachers get a short grace period. */
export function checkMarkingWindow(date: string, today: string, role: 'teacher' | 'admin'): MarkWindowResult {
  if (date > today) return { ok: false, code: 'FUTURE', message: 'Attendance cannot be marked for a future date.' }
  if (role === 'teacher' && date < addDays(today, -(TEACHER_BACKDATE_DAYS)))
    return { ok: false, code: 'TOO_OLD', message: `Teachers can mark attendance for today and the previous ${TEACHER_BACKDATE_DAYS} days. Ask the school admin to add this day.` }
  return { ok: true }
}
