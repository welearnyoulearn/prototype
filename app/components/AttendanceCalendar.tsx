'use client'

import { useEffect, useState } from 'react'
import {
  todayIST, weekdayOf, monthBounds, LOW_ATTENDANCE_PCT, GOOD_ATTENDANCE_PCT,
  type AttendanceBand, type CalendarDay, type DayStatus,
} from '@/lib/attendanceRules'

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
const BAND_BAR: Record<AttendanceBand, string> = {
  good: 'bg-green-500', watch: 'bg-amber-400', low: 'bg-red-500', none: 'bg-gray-200',
}

function bandMessage(pct: number | null, who: 'parent' | 'student'): string {
  if (pct === null) return 'No attendance has been recorded this month yet.'
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
  who: 'parent' | 'student'
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

  // Leading blanks so the 1st lands on the right weekday.
  const lead = weekdayOf(monthBounds(month).from)

  return (
    <div data-testid="attendance-calendar" className="space-y-5">
      {/* Month switcher */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-3 py-2">
        <button type="button" onClick={() => go(-1)} aria-label="Previous month" data-testid="att-cal-prev"
          className="w-10 h-10 rounded-xl text-gray-500 hover:bg-gray-100 text-lg">‹</button>
        <div className="text-center">
          <p data-testid="att-cal-month-label" className="text-base font-bold text-gray-900">{MONTH_NAMES[mm - 1]} {yy}</p>
          {view && <p className="text-xs text-gray-400">{view.student.name}{view.student.grade ? ` · Class ${view.student.grade}${view.student.section ? '-' + view.student.section : ''}` : ''}</p>}
        </div>
        <button type="button" onClick={() => go(1)} disabled={month >= currentMonth} aria-label="Next month" data-testid="att-cal-next"
          className="w-10 h-10 rounded-xl text-gray-500 hover:bg-gray-100 text-lg disabled:opacity-30 disabled:hover:bg-transparent">›</button>
      </div>

      {error && (
        <div role="alert" data-testid="att-cal-error" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setAttempt(a => a + 1)} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">Try again</button>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-4 animate-pulse" aria-busy="true" data-testid="att-cal-loading">
          <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}</div>
          <div className="h-72 bg-gray-100 rounded-2xl" />
        </div>
      )}

      {view && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
              <p data-testid="att-summary-month-pct" className={`text-3xl font-black ${BAND_TEXT[view.month.summary.band]}`}>
                {view.month.summary.pct === null ? '—' : `${view.month.summary.pct}%`}
              </p>
              <p className="text-xs text-gray-500 mt-1">This month</p>
              <p className="text-[11px] text-gray-400">{view.month.summary.attended} of {view.month.summary.marked} attended</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
              <p data-testid="att-summary-year-pct" className={`text-3xl font-black ${BAND_TEXT[view.yearToDate.summary.band]}`}>
                {view.yearToDate.summary.pct === null ? '—' : `${view.yearToDate.summary.pct}%`}
              </p>
              <p className="text-xs text-gray-500 mt-1">This year</p>
              <p className="text-[11px] text-gray-400">since {shortDate(view.yearToDate.from)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
              <p data-testid="att-summary-absent-days" className={`text-3xl font-black ${view.month.absentDays > 0 ? 'text-red-600' : 'text-gray-800'}`}>{view.month.absentDays}</p>
              <p className="text-xs text-gray-500 mt-1">Days absent</p>
              {view.month.halfDays > 0 && <p className="text-[11px] text-gray-400">+ {view.month.halfDays} half day{view.month.halfDays > 1 ? 's' : ''}</p>}
            </div>
          </div>
          <p data-testid="att-summary-message" className={`text-sm rounded-xl px-4 py-2.5 border ${
            view.month.summary.band === 'low' ? 'bg-red-50 border-red-200 text-red-700'
              : view.month.summary.band === 'watch' ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-green-50 border-green-200 text-green-800'}`}>
            {bandMessage(view.month.summary.pct, who)}
          </p>

          {/* Calendar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5" aria-hidden>
              {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-semibold text-gray-400">{d}</div>)}
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
                    className={`relative aspect-square rounded-lg sm:rounded-xl border text-sm font-semibold flex flex-col items-center justify-center transition ${st.cell} ${
                      isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${isSelected ? 'outline outline-2 outline-gray-900' : ''}`}
                  >
                    <span>{dayNo}</span>
                    {(d.status === 'holiday') && <span className="hidden sm:block text-[9px] leading-none mt-0.5 px-1 truncate max-w-full">{d.title}</span>}
                    {d.status === 'late' && <span className="absolute top-0.5 right-1 text-[9px]" aria-hidden>⏰</span>}
                  </button>
                )
              })}
            </div>

            {/* What was tapped */}
            <div data-testid="att-cal-detail" className="mt-3 min-h-10 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-600">
              {selectedDay ? (
                selectedDay.status === 'holiday' || selectedDay.status === 'weekly_off'
                  ? <><strong>{longDate(selectedDay.date)}</strong> — {selectedDay.status === 'holiday' ? `Holiday: ${selectedDay.title}` : 'Weekly off'}. No attendance is taken.</>
                  : selectedDay.status === 'future' ? <><strong>{longDate(selectedDay.date)}</strong> — upcoming.</>
                  : selectedDay.status === 'before_joining' ? <><strong>{longDate(selectedDay.date)}</strong> — before joining the school.</>
                  : selectedDay.status === 'not_marked' ? <><strong>{longDate(selectedDay.date)}</strong> — attendance was not recorded.</>
                  : <><strong>{longDate(selectedDay.date)}</strong> — Morning: <b>{sessionLabel(selectedDay.morning)}</b>{selectedDay.afternoon ? <> · Afternoon: <b>{sessionLabel(selectedDay.afternoon)}</b></> : null}</>
              ) : <span className="text-gray-400">Tap a day to see the details.</span>}
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500" aria-label="Legend">
              {(['present', 'late', 'absent', 'half', 'holiday', 'weekly_off', 'not_marked'] as DayStatus[]).map(s => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={`w-3.5 h-3.5 rounded border ${DAY_STYLE[s].cell}`} />{DAY_STYLE[s].label}
                </span>
              ))}
            </div>
          </div>

          {/* Trend */}
          {view.trend.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-gray-800 mb-3">Last months</p>
              <div className="flex items-end gap-2 h-28" data-testid="att-trend">
                {view.trend.map(t => (
                  <div key={t.month} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                    <span className="text-[11px] font-semibold text-gray-600">{t.summary.pct === null ? '—' : `${t.summary.pct}%`}</span>
                    <div className={`w-full rounded-t-md ${BAND_BAR[t.summary.band]}`} style={{ height: `${Math.max(t.summary.pct ?? 0, 4)}%` }} />
                    <span className="text-[10px] text-gray-400">{MONTH_NAMES[Number(t.month.slice(5)) - 1].slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming holidays */}
          {view.upcomingHolidays.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4" data-testid="att-upcoming-holidays">
              <p className="text-sm font-semibold text-gray-800 mb-2">Upcoming holidays</p>
              <ul className="space-y-1.5">
                {view.upcomingHolidays.slice(0, 5).map(h => (
                  <li key={`${h.title}-${h.event_date}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{h.title}</span>
                    <span className="text-xs text-gray-400">{shortDate(h.event_date)}{h.end_date ? ` – ${shortDate(h.end_date)}` : ''}</span>
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
