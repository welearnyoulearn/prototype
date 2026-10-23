'use client'

import { useEffect, useState } from 'react'
import { addDays, monthBounds, todayIST, weekdayOf } from '@/lib/attendanceRules'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { StudentAlert, StudentPageIntro } from '@/app/student/components/StudentExperience'
import { Sticker, type Tone } from '@/app/student/components/stickers'

// The school's Academic Calendar, READ-ONLY, for teachers, students and parents.
// (The school admin manages it in the admin portal.) Holidays are shown in red because they
// are the days with no school and no attendance.

export type CalendarEvent = {
  id: number
  title: string
  event_date: string
  end_date: string | null
  event_type: 'holiday' | 'exam' | 'event' | 'meeting' | 'other'
  description: string | null
  audience: 'everyone' | 'staff'
  created_by_name?: string | null   // only sent to the school admin
}

export const CALENDAR_TYPE_UI: Record<CalendarEvent['event_type'], { label: string; chip: string; dot: string; cell: string }> = {
  holiday: { label: 'Holiday', chip: 'bg-red-100 text-red-700',       dot: 'bg-red-500',    cell: 'bg-red-50 border-red-200' },
  exam:    { label: 'Exam',    chip: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', cell: 'bg-orange-50 border-orange-200' },
  event:   { label: 'Event',   chip: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500',   cell: 'bg-blue-50 border-blue-200' },
  meeting: { label: 'Meeting', chip: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', cell: 'bg-purple-50 border-purple-200' },
  other:   { label: 'Other',   chip: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400',   cell: 'bg-gray-50 border-gray-200' },
}

const TYPE_TONE: Record<CalendarEvent['event_type'], Tone> = { holiday: 'coral', exam: 'orange', event: 'blue', meeting: 'violet', other: 'paper' }

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function eventCoversDate(ev: { event_date: string; end_date: string | null }, date: string): boolean {
  return ev.event_date <= date && date <= (ev.end_date ?? ev.event_date)
}

export function fmtShort(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function fmtRange(ev: { event_date: string; end_date: string | null }): string {
  return ev.end_date ? `${fmtShort(ev.event_date)} – ${fmtShort(ev.end_date)}` : fmtShort(ev.event_date)
}

export function fmtLong(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

type Loaded = { key: string; events: CalendarEvent[]; weeklyOff: number[]; error: string | null }

/** Loads [from, to] of the calendar. `loading` is derived, so no state is set synchronously in an effect. */
export function useCalendarRange(from: string, to: string, reloadToken = 0) {
  const key = `${from}|${to}|${reloadToken}`
  const [data, setData] = useState<Loaded>({ key: '', events: [], weeklyOff: [0], error: null })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/school-calendar?from=${from}&to=${to}`, { cache: 'no-store' })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error || 'Could not load the calendar')
        return body as { events: CalendarEvent[]; weeklyOff: number[] }
      })
      .then(b => { if (!cancelled) setData({ key, events: b.events, weeklyOff: b.weeklyOff, error: null }) })
      .catch((e: unknown) => { if (!cancelled) setData({ key, events: [], weeklyOff: [0], error: e instanceof Error ? e.message : 'Could not load the calendar' }) })
    return () => { cancelled = true }
  }, [from, to, key])

  // `ready` = at least one load has finished, so `weeklyOff` is the school's real setting (before that it is only a placeholder).
  return { events: data.key === key ? data.events : [], weeklyOff: data.weeklyOff, loading: data.key !== key, ready: data.key !== '', error: data.key === key ? data.error : null }
}

export default function SchoolCalendarView({ experience = 'shared' }: { experience?: 'student' | 'shared' }) {
  const today = todayIST()
  const currentMonth = today.slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const [selected, setSelected] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const { from, to } = monthBounds(month)
  const cal = useCalendarRange(from, to, reload)
  const upcoming = useCalendarRange(today, addDays(today, 60), reload)

  const [yy, mm] = month.split('-').map(Number)
  const lead = weekdayOf(from)
  const days = Array.from({ length: Number(to.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)

  function go(delta: number) {
    setMonth(new Date(Date.UTC(yy, mm - 1 + delta, 1)).toISOString().slice(0, 7))
    setSelected(null)
  }

  const eventsOn = (d: string) => cal.events.filter(e => eventCoversDate(e, d))
  const selectedEvents = selected ? eventsOn(selected) : []
  const upcomingList = upcoming.events.filter(e => (e.end_date ?? e.event_date) >= today).slice(0, 8)

  if (experience === 'student') {
    return (
      <div data-testid="school-calendar" className="max-w-4xl space-y-8">
        <StudentPageIntro eyebrow="Plan what’s ahead" title="School calendar" sticker="spiral-calendar" tone="blue"
          description="Exams, events, holidays and other dates shared by your school."
          aside={<span className="sb-chip" data-size="lg" data-tone="paper"><Sticker name="pushpin" size="xs" />School schedule</span>} />

        <div className="sb-month-bar">
          <button type="button" onClick={() => go(-1)} aria-label="Previous month" data-testid="cal-prev" className="sb-icon-btn"><ChevronLeft size={20} aria-hidden="true" /></button>
          <div className="text-center">
            <p data-testid="cal-month-label" className="sb-month">{MONTH_NAMES[mm - 1]} {yy}</p>
            {month !== currentMonth && (
              <button type="button" onClick={() => { setMonth(currentMonth); setSelected(null) }} data-testid="cal-today" className="sb-link min-h-0 text-xs">Back to this month</button>
            )}
          </div>
          <button type="button" onClick={() => go(1)} aria-label="Next month" data-testid="cal-next" className="sb-icon-btn"><ChevronRight size={20} aria-hidden="true" /></button>
        </div>

        {cal.error && <StudentAlert testId="cal-error" onRetry={() => setReload(r => r + 1)}>{cal.error}</StudentAlert>}

        <section className="sb-planner" aria-busy={cal.loading} aria-label="Month planner">
          <div className="sb-weekdays" aria-hidden>{WEEKDAY_SHORT.map(d => <div key={d}>{d}</div>)}</div>
          <div className={`sb-days ${cal.loading ? 'opacity-50' : ''}`}>
            {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
            {days.map(d => {
              const evs = eventsOn(d)
              const holiday = evs.find(e => e.event_type === 'holiday')
              const off = !holiday && cal.weeklyOff.includes(weekdayOf(d))
              return (
                <button
                  key={d} type="button" onClick={() => setSelected(selected === d ? null : d)}
                  data-testid={`cal-day-${d}`} data-holiday={holiday ? 'true' : 'false'} data-off={off} data-today={d === today} data-selected={selected === d}
                  aria-pressed={selected === d}
                  aria-label={`${fmtLong(d)}${evs.length ? ': ' + evs.map(e => e.title).join(', ') : ''}${off ? ': weekly off' : ''}`}
                  className="sb-day sb-cal-day"
                >
                  <span>{Number(d.slice(8))}</span>
                  <span className="mt-auto flex gap-1 sm:hidden">
                    {evs.slice(0, 3).map(e => <span key={e.id} className="sb-dot" data-tone={TYPE_TONE[e.event_type]} />)}
                  </span>
                  <span className="hidden w-full flex-col gap-1 sm:flex">
                    {evs.slice(0, 2).map(e => <span key={e.id} className="sb-washi" data-tone={TYPE_TONE[e.event_type]}>{e.title}</span>)}
                    {evs.length > 2 && <span className="text-[11px] font-extrabold">+{evs.length - 2} more</span>}
                  </span>
                </button>
              )
            })}
          </div>

          <div data-testid="cal-detail" className="sb-say mt-6">
            {selected ? (
              selectedEvents.length > 0 ? (
                <ul className="space-y-2">
                  <li className="font-extrabold">{fmtLong(selected)}</li>
                  {selectedEvents.map(e => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      <span className="sb-chip" data-tone={TYPE_TONE[e.event_type]}>{CALENDAR_TYPE_UI[e.event_type].label}</span>
                      <span className="font-bold">{e.title}</span>
                      <span className="text-xs font-semibold text-[#6b604f]">{fmtRange(e)}</span>
                      {e.description && <p className="w-full text-[#4a4034]">{e.description}</p>}
                      {e.event_type === 'holiday' && <p className="w-full text-xs font-bold">No school and no attendance on this day.</p>}
                    </li>
                  ))}
                </ul>
              ) : <span>{fmtLong(selected)} — {cal.weeklyOff.includes(weekdayOf(selected)) ? 'weekly off.' : 'nothing scheduled.'}</span>
            ) : <span className="sb-hand text-lg">tap a day to see what’s planned</span>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="Legend">
            {(Object.keys(CALENDAR_TYPE_UI) as CalendarEvent['event_type'][]).map(t => (
              <span key={t} className="sb-chip" data-tone="paper"><span className="sb-dot" data-tone={TYPE_TONE[t]} />{CALENDAR_TYPE_UI[t].label}</span>
            ))}
            <span className="sb-chip" data-tone="paper"><span className="sb-swatch" data-status="weekly_off" />Weekly off</span>
          </div>
        </section>

        <section className="sb-card p-5" data-tone="paper" data-testid="cal-upcoming">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="sb-display text-2xl">Coming up</h2>
            <span className="sb-hand">the next 60 days</span>
          </div>
          {upcoming.loading ? <p className="mt-3 text-sm font-semibold" role="status">Checking the next 60 days…</p>
            : upcomingList.length === 0 ? (
              <div className="mt-3 flex items-center gap-3"><Sticker name="sleeping-face" size="md" /><p className="text-sm font-semibold">Nothing scheduled in the next 60 days.</p></div>
            ) : (
              <ul className="mt-4 space-y-3">
                {upcomingList.map(e => (
                  <li key={e.id} className="flex items-center gap-4">
                    <span className="sb-leaf" data-tone={TYPE_TONE[e.event_type]}><span>{MONTH_NAMES[Number(e.event_date.slice(5, 7)) - 1].slice(0, 3)}</span><strong>{Number(e.event_date.slice(8))}</strong></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-extrabold">{e.title}</span>
                      <span className="mt-1 flex flex-wrap gap-2">
                        <span className="sb-chip" data-tone={TYPE_TONE[e.event_type]}>{CALENDAR_TYPE_UI[e.event_type].label}</span>
                        <span className="text-xs font-semibold text-[#6b604f]">{fmtRange(e)}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>
    )
  }

  return (
    <div data-testid="school-calendar" className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between border-y border-gray-200 bg-white/65 px-3 py-2">
        <button type="button" onClick={() => go(-1)} aria-label="Previous month" data-testid="cal-prev"
          className="w-10 h-10 rounded-md text-gray-500 hover:bg-gray-100 text-lg">‹</button>
        <div className="text-center">
          <p data-testid="cal-month-label" className="text-base font-bold text-gray-900">{MONTH_NAMES[mm - 1]} {yy}</p>
          {month !== currentMonth && (
            <button type="button" onClick={() => { setMonth(currentMonth); setSelected(null) }} data-testid="cal-today"
              className="text-xs font-semibold text-[#8b4a10] hover:underline">Back to this month</button>
          )}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Next month" data-testid="cal-next"
          className="w-10 h-10 rounded-md text-gray-500 hover:bg-gray-100 text-lg">›</button>
      </div>

      {cal.error && (
        <div role="alert" data-testid="cal-error" className="bg-red-50 border border-red-200 rounded-lg px-4 py-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{cal.error}</span>
          <button type="button" onClick={() => setReload(r => r + 1)} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">Try again</button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4" aria-busy={cal.loading}>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5" aria-hidden>
          {WEEKDAY_SHORT.map(d => <div key={d} className="text-center text-xs font-semibold text-muted-foreground">{d}</div>)}
        </div>
        <div className={`grid grid-cols-7 gap-1 sm:gap-1.5 ${cal.loading ? 'opacity-50' : ''}`}>
          {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
          {days.map(d => {
            const evs = eventsOn(d)
            const holiday = evs.find(e => e.event_type === 'holiday')
            const off = !holiday && cal.weeklyOff.includes(weekdayOf(d))
            const isToday = d === today
            return (
              <button
                key={d} type="button" onClick={() => setSelected(selected === d ? null : d)}
                data-testid={`cal-day-${d}`} data-holiday={holiday ? 'true' : 'false'}
                aria-label={`${fmtLong(d)}${evs.length ? ': ' + evs.map(e => e.title).join(', ') : ''}${off ? ': weekly off' : ''}`}
                className={`min-h-12 sm:min-h-20 rounded-lg sm:rounded-md border p-1 sm:p-1.5 text-left flex flex-col transition ${
                  holiday ? CALENDAR_TYPE_UI.holiday.cell : off ? 'bg-slate-50 border-slate-100 text-muted-foreground' : 'bg-white border-gray-100 hover:border-gray-300'
                } ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${selected === d ? 'outline outline-2 outline-gray-900' : ''}`}
              >
                <span className={`text-xs sm:text-sm font-semibold ${holiday ? 'text-red-700' : ''}`}>{Number(d.slice(8))}</span>
                {/* phones: coloured dots · larger screens: titles */}
                <span className="flex gap-0.5 mt-auto sm:hidden">
                  {evs.slice(0, 3).map(e => <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${CALENDAR_TYPE_UI[e.event_type].dot}`} />)}
                </span>
                <span className="hidden sm:flex flex-col gap-0.5 mt-0.5 w-full">
                  {evs.slice(0, 2).map(e => (
                    <span key={e.id} className={`truncate text-xs leading-tight rounded px-1 py-0.5 ${CALENDAR_TYPE_UI[e.event_type].chip}`}>{e.title}</span>
                  ))}
                  {evs.length > 2 && <span className="text-xs text-muted-foreground">+{evs.length - 2} more</span>}
                </span>
              </button>
            )
          })}
        </div>

        <div data-testid="cal-detail" className="mt-3 rounded-md bg-gray-50 border border-gray-100 px-3 py-2.5 text-sm">
          {selected ? (
            selectedEvents.length > 0 ? (
              <ul className="space-y-2">
                <li className="font-semibold text-gray-700">{fmtLong(selected)}</li>
                {selectedEvents.map(e => (
                  <li key={e.id}>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 mr-2 ${CALENDAR_TYPE_UI[e.event_type].chip}`}>{CALENDAR_TYPE_UI[e.event_type].label}</span>
                    <span className="font-medium text-gray-800">{e.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">{fmtRange(e)}</span>
                    {e.description && <p className="text-gray-500 mt-0.5">{e.description}</p>}
                    {e.event_type === 'holiday' && <p className="text-xs text-red-600 mt-0.5">No school and no attendance on this day.</p>}
                  </li>
                ))}
              </ul>
            ) : <span className="text-gray-500">{fmtLong(selected)} — {cal.weeklyOff.includes(weekdayOf(selected)) ? 'weekly off.' : 'nothing scheduled.'}</span>
          ) : <span className="text-muted-foreground">Tap a day to see what is planned.</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500" aria-label="Legend">
          {(Object.keys(CALENDAR_TYPE_UI) as CalendarEvent['event_type'][]).map(t => (
            <span key={t} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${CALENDAR_TYPE_UI[t].dot}`} />{CALENDAR_TYPE_UI[t].label}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-slate-100 bg-slate-50" />Weekly off</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4" data-testid="cal-upcoming">
        <p className="text-sm font-semibold text-gray-800 mb-2">Coming up (next 60 days)</p>
        {upcoming.loading ? <p className="text-sm text-muted-foreground" role="status">Checking the next 60 days…</p>
          : upcomingList.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled in the next 60 days.</p>
          : (
            <ul className="divide-y divide-gray-100">
              {upcomingList.map(e => (
                <li key={e.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 mr-2 ${CALENDAR_TYPE_UI[e.event_type].chip}`}>{CALENDAR_TYPE_UI[e.event_type].label}</span>
                    <span className="text-sm text-gray-800">{e.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtRange(e)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  )
}
