'use client'

import { useEffect, useState } from 'react'
import { TrendChart } from './attendance-dashboard/parts'
import {
  todayIST, weekdayOf, monthBounds, LOW_ATTENDANCE_PCT, GOOD_ATTENDANCE_PCT,
  type AttendanceBand, type CalendarDay, type DayStatus,
} from '@/lib/attendanceRules'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarCheck2, Clock3, Flame } from 'lucide-react'

// One student's attendance: month calendar, percentages, six-month trend, upcoming holidays.
// Used by the PARENT app (one of their children) and the STUDENT app (themselves) — the same
// component over the same API shape, so both always show the same thing.

type Summary = { present: number; late: number; absent: number; marked: number; attended: number; pct: number | null; band: AttendanceBand }

type View = {
  student: { id: number; name: string; grade: string | null; section: string | null }
  today: string
  month: { month: string; days: CalendarDay[]; summary: Summary; daysMarked: number; absentDays: number; halfDays: number }
  yearToDate: { from: string; summary: Summary }
  trend: { month: string; summary: Summary }[]
  upcomingHolidays: { title: string; event_date: string; end_date: string | null }[]
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DAY_STYLE: Record<DayStatus, { cell: string; label: string }> = {
  present:        { cell: 'bg-green-100 text-green-800 border-green-200', label: 'Present' },
  late:           { cell: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Late' },
  absent:         { cell: 'bg-red-100 text-red-800 border-red-200', label: 'Absent' },
  half:           { cell: 'bg-gradient-to-br from-red-100 to-green-100 text-gray-800 border-red-200', label: 'Half day' },
  not_marked:     { cell: 'bg-white text-gray-400 border-dashed border-gray-300', label: 'Not marked' },
  holiday:        { cell: 'bg-slate-200 text-slate-700 border-slate-300', label: 'Holiday' },
  weekly_off:     { cell: 'bg-slate-50 text-slate-400 border-slate-100', label: 'Weekly off' },
  future:         { cell: 'bg-white text-gray-300 border-gray-100', label: '' },
  before_joining: { cell: 'bg-gray-50 text-gray-300 border-gray-100', label: 'Before joining' },
}

const BAND_TEXT: Record<AttendanceBand, string> = {
  good: 'text-green-600', watch: 'text-amber-600', low: 'text-red-600', none: 'text-gray-400',
}
function bandMessage(pct: number | null, who: 'parent' | 'student' | 'staff'): string {
  if (pct === null) return 'No attendance has been recorded this month yet.'
  if (who === 'staff') {
    if (pct >= GOOD_ATTENDANCE_PCT) return 'Attendance is good this month.'
    if (pct >= LOW_ATTENDANCE_PCT) return 'Attendance is a little low — keep an eye on it.'
    return `Attendance is below ${LOW_ATTENDANCE_PCT}% — consider speaking with the family.`
  }
  if (pct >= GOOD_ATTENDANCE_PCT) return who === 'parent' ? 'Excellent attendance this month. Keep it up!' : 'Excellent attendance this month. Keep it up!'
  if (pct >= LOW_ATTENDANCE_PCT) return who === 'parent' ? 'Attendance is a little low. Try to avoid further absences.' : 'Your attendance is a little low. Try not to miss more days.'
  return who === 'parent'
    ? `Attendance is below ${LOW_ATTENDANCE_PCT}%. Please speak with the class teacher.`
    : `Your attendance is below ${LOW_ATTENDANCE_PCT}%. Please speak with your class teacher.`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const sessionLabel = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Not marked')

export default function AttendanceCalendar({ endpoint, who }: {
  /** e.g. "/api/parent/attendance?student_id=12" or "/api/student/attendance" — `month` is appended. */
  endpoint: string
  who: 'parent' | 'student' | 'staff'
}) {
  const currentMonth = todayIST().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const [result, setResult] = useState<{ key: string; view: View | null; error: string | null }>({ key: '', view: null, error: null })
  const [selected, setSelected] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const key = `${endpoint}|${month}|${attempt}`
  const loading = result.key !== key

  useEffect(() => {
    let cancelled = false
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}month=${month}`
    fetch(url, { cache: 'no-store' })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Could not load attendance')
        return data as View
      })
      .then(view => { if (!cancelled) setResult({ key, view, error: null }) })
      .catch((e: unknown) => { if (!cancelled) setResult({ key, view: null, error: e instanceof Error ? e.message : 'Could not load attendance' }) })
    return () => { cancelled = true }
  }, [endpoint, month, attempt, key])

  const view = result.key === key ? result.view : null
  const error = result.key === key ? result.error : null
  const [yy, mm] = month.split('-').map(Number)

  function go(delta: number) {
    setMonth(m => shiftMonth(m, delta))
    setSelected(null)
  }

  const selectedDay = view?.month.days.find(d => d.date === selected) ?? null

  // Days in a row (up to the latest marked day this month) with both sessions present.
  const streak = (() => {
    const marked = (view?.month.days ?? []).filter(d => ['present', 'late', 'absent', 'half'].includes(d.status))
    let n = 0
    for (let i = marked.length - 1; i >= 0 && marked[i].status === 'present'; i--) n++
    return n
  })()

  // Leading blanks so the 1st lands on the right weekday.
  const lead = weekdayOf(monthBounds(month).from)

  return (
    <div data-testid="attendance-calendar" className="space-y-5">
      {who === 'student' && (
        <header className="student-page-intro">
          <div>
            <p className="student-eyebrow">Your consistency</p>
            <h1>My attendance</h1>
            <p className="student-page-description">See your daily record, understand this month’s pattern, and keep track of the days ahead.</p>
          </div>
          <div className="student-page-aside flex items-center gap-2 text-xs font-medium text-[#68736b]"><CalendarCheck2 size={17} className="text-[#a85f16]" aria-hidden="true" />School record</div>
        </header>
      )}
      {/* Month switcher */}
      <div className="flex items-center justify-between border-y border-gray-200 bg-white/65 px-3 py-2">
        <button type="button" onClick={() => go(-1)} aria-label="Previous month" data-testid="att-cal-prev"
          className="w-10 h-10 rounded-md text-gray-500 hover:bg-gray-100 text-lg">‹</button>
        <div className="text-center">
          <p data-testid="att-cal-month-label" className="text-base font-bold text-gray-900">{MONTH_NAMES[mm - 1]} {yy}</p>
          {view && <p className="text-xs text-muted-foreground">{view.student.name}{view.student.grade ? ` · Class ${view.student.grade}${view.student.section ? '-' + view.student.section : ''}` : ''}</p>}
        </div>
        <button type="button" onClick={() => go(1)} disabled={month >= currentMonth} aria-label="Next month" data-testid="att-cal-next"
          className="w-10 h-10 rounded-md text-gray-500 hover:bg-gray-100 text-lg disabled:opacity-30 disabled:hover:bg-transparent">›</button>
      </div>

      {error && (
        <div role="alert" data-testid="att-cal-error" className="bg-red-50 border border-red-200 rounded-lg px-4 py-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setAttempt(a => a + 1)} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">Try again</button>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-4" role="status" aria-live="polite" aria-busy="true" data-testid="att-cal-loading">
          <span className="sr-only">Loading attendance calendar</span>
          <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-72" />
        </div>
      )}

      {view && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 overflow-hidden border-y border-gray-200 bg-white/55 sm:grid-cols-4 sm:divide-x sm:divide-gray-200">
            <div className="border-b border-r border-gray-200 p-4 text-center sm:border-b-0 sm:border-r-0">
              <p data-testid="att-summary-month-pct" className={`text-3xl font-semibold ${BAND_TEXT[view.month.summary.band]}`}>
                {view.month.summary.pct === null ? '—' : `${view.month.summary.pct}%`}
              </p>
              <p className="text-xs text-gray-500 mt-1">This month</p>
              <p className="text-xs text-muted-foreground">{view.month.summary.attended} of {view.month.summary.marked} attended</p>
            </div>
            <div className="border-b border-gray-200 p-4 text-center sm:border-b-0">
              <p data-testid="att-summary-year-pct" className={`text-3xl font-semibold ${BAND_TEXT[view.yearToDate.summary.band]}`}>
                {view.yearToDate.summary.pct === null ? '—' : `${view.yearToDate.summary.pct}%`}
              </p>
              <p className="text-xs text-gray-500 mt-1">This year</p>
              <p className="text-xs text-muted-foreground">since {shortDate(view.yearToDate.from)}</p>
            </div>
            <div className="border-r border-gray-200 p-4 text-center sm:border-r-0">
              <p data-testid="att-summary-absent-days" className={`text-3xl font-semibold ${view.month.absentDays > 0 ? 'text-red-600' : 'text-gray-800'}`}>{view.month.absentDays}</p>
              <p className="text-xs text-gray-500 mt-1">Days absent</p>
              {view.month.halfDays > 0 && <p className="text-xs text-muted-foreground">+ {view.month.halfDays} half day{view.month.halfDays > 1 ? 's' : ''}</p>}
            </div>
            <div className="p-4 text-center">
              <p data-testid="att-summary-streak" className={`flex items-center justify-center gap-1.5 text-3xl font-semibold ${streak >= 5 ? 'text-green-700' : 'text-gray-800'}`}>{streak >= 5 && <Flame size={20} aria-hidden="true" />}{streak}</p>
              <p className="text-xs text-gray-500 mt-1">Full days in a row</p>
              <p className="text-xs text-muted-foreground">{view.month.summary.late > 0 ? `${view.month.summary.late} late this month` : 'no late arrivals'}</p>
            </div>
          </div>
          <p data-testid="att-summary-message" className={`text-sm rounded-md px-4 py-2.5 border ${
            view.month.summary.band === 'low' ? 'bg-red-50 border-red-200 text-red-700'
              : view.month.summary.band === 'watch' ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-green-50 border-green-200 text-green-800'}`}>
            {bandMessage(view.month.summary.pct, who)}
          </p>

          {/* Calendar */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5" aria-hidden>
              {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-muted-foreground">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
              {view.month.days.map(d => {
                const st = DAY_STYLE[d.status]
                const isToday = d.date === view.today
                const dayNo = Number(d.date.slice(8))
                const isSelected = selected === d.date
                return (
                  <button
                    key={d.date} type="button"
                    onClick={() => setSelected(isSelected ? null : d.date)}
                    data-testid={`att-cal-day-${d.date}`} data-status={d.status}
                    aria-label={`${longDate(d.date)}: ${d.title ?? st.label}`}
                    aria-pressed={isSelected}
                    className={`relative aspect-square rounded-lg sm:rounded-md border text-sm font-semibold flex flex-col items-center justify-center transition ${st.cell} ${
                      isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${isSelected ? 'outline outline-2 outline-gray-900' : ''}`}
                  >
                    <span>{dayNo}</span>
                    {(d.status === 'holiday') && <span className="hidden sm:block text-xs leading-none mt-0.5 px-1 truncate max-w-full">{d.title}</span>}
                    {d.status === 'late' && <Clock3 className="absolute right-1 top-1 h-3 w-3" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>

            {/* What was tapped */}
            <div data-testid="att-cal-detail" className="mt-3 min-h-10 rounded-md bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-600">
              {selectedDay ? (
                selectedDay.status === 'holiday' || selectedDay.status === 'weekly_off'
                  ? <><strong>{longDate(selectedDay.date)}</strong> — {selectedDay.status === 'holiday' ? `Holiday: ${selectedDay.title}` : 'Weekly off'}. No attendance is taken.</>
                  : selectedDay.status === 'future' ? <><strong>{longDate(selectedDay.date)}</strong> — upcoming.</>
                  : selectedDay.status === 'before_joining' ? <><strong>{longDate(selectedDay.date)}</strong> — before joining the school.</>
                  : selectedDay.status === 'not_marked' ? <><strong>{longDate(selectedDay.date)}</strong> — attendance was not recorded.</>
                  : <><strong>{longDate(selectedDay.date)}</strong> — Morning: <b>{sessionLabel(selectedDay.morning)}</b>{selectedDay.afternoon ? <> · Afternoon: <b>{sessionLabel(selectedDay.afternoon)}</b></> : null}</>
              ) : <span className="text-muted-foreground">Tap a day to see the details.</span>}
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500" aria-label="Legend">
              {(['present', 'late', 'absent', 'half', 'holiday', 'weekly_off', 'not_marked'] as DayStatus[]).map(s => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={`w-3.5 h-3.5 rounded border ${DAY_STYLE[s].cell}`} />{DAY_STYLE[s].label}
                </span>
              ))}
            </div>
          </div>

          {/* Trend */}
          {view.trend.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4" data-testid="att-trend">
              <p className="text-sm font-semibold text-gray-800 mb-1">Last months</p>
              <p className="text-xs text-muted-foreground mb-2">Attendance % each month — green line is 90%, red is 75%.</p>
              <TrendChart bucket="month" points={view.trend.map(t => ({ key: t.month, ...t.summary }))} />
            </div>
          )}

          {/* Upcoming holidays */}
          {view.upcomingHolidays.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4" data-testid="att-upcoming-holidays">
              <p className="text-sm font-semibold text-gray-800 mb-2">Upcoming holidays</p>
              <ul className="space-y-1.5">
                {view.upcomingHolidays.slice(0, 5).map(h => (
                  <li key={`${h.title}-${h.event_date}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{h.title}</span>
                    <span className="text-xs text-muted-foreground">{shortDate(h.event_date)}{h.end_date ? ` – ${shortDate(h.end_date)}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
