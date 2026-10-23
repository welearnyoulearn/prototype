'use client'

import { useEffect, useState } from 'react'
import { todayIST, weekdayOf, monthBounds } from '@/lib/attendanceRules'
import {
  CALENDAR_TYPE_UI, MONTH_NAMES, WEEKDAY_SHORT, eventCoversDate, fmtLong, fmtRange, useCalendarRange,
  type CalendarEvent,
} from '@/app/components/SchoolCalendarView'

// Academic Calendar — the school admin's tool. Whatever is entered here is what teachers,
// students and parents see (read-only) in their own portals. A HOLIDAY additionally stops
// attendance from being marked on those dates and removes them from every percentage.

type AdminEvent = CalendarEvent
type EventType = CalendarEvent['event_type']

type FormState = {
  id: number | null
  event_type: EventType
  title: string
  event_date: string
  multi: boolean
  end_date: string
  audience: 'everyone' | 'staff'
  description: string
}

const TYPES: EventType[] = ['holiday', 'exam', 'event', 'meeting', 'other']
const PREFILL_KEY = 'wlyl_calendar_prefill'
const emptyForm = (date: string, type: EventType = 'event'): FormState => ({
  id: null, event_type: type, title: '', event_date: date, multi: false, end_date: '', audience: 'everyone', description: '',
})

export default function AcademicCalendar({ schoolId }: { schoolId: number }) {
  void schoolId // the school comes from the login; the prop only keeps this screen's signature stable
  const today = todayIST()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState<string | null>(today)
  const [filter, setFilter] = useState<'all' | EventType>('all')
  const [reload, setReload] = useState(0)

  const year = month.slice(0, 4)
  const cal = useCalendarRange(`${year}-01-01`, `${year}-12-31`, reload)
  const events = cal.events as AdminEvent[]

  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null)   // server warning about existing attendance
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // The admin's unsaved edit of the weekly-off days. `null` = not editing, so the screen simply shows what the
  // server has. (It used to start from a placeholder, so a quick click before the load finished saved a wrong list.)
  const [weeklyDraft, setWeeklyDraft] = useState<number[] | null>(null)
  const [weeklySaving, setWeeklySaving] = useState(false)
  const [weeklyError, setWeeklyError] = useState('')

  // The "Mark today as holiday" button on the Attendance page hands over a prefilled form.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY)
      if (!raw) return
      sessionStorage.removeItem(PREFILL_KEY)
      const p = JSON.parse(raw) as { event_type?: EventType; event_date?: string }
      // Deferred a tick so this is not a synchronous state update inside the effect body.
      queueMicrotask(() => setForm(emptyForm(p.event_date ?? today, p.event_type ?? 'holiday')))
    } catch { /* storage unavailable */ }
  }, [today])

  const weeklyOff = weeklyDraft ?? cal.weeklyOff
  const weeklyDirty = weeklyDraft !== null

  const [yy, mm] = month.split('-').map(Number)
  const { from, to } = monthBounds(month)
  const lead = weekdayOf(from)
  const days = Array.from({ length: Number(to.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  const visible = events.filter(e => filter === 'all' || e.event_type === filter)
  const eventsOn = (d: string) => visible.filter(e => eventCoversDate(e, d))
  const selectedEvents = selected ? eventsOn(selected) : []
  const upcoming = events.filter(e => (e.end_date ?? e.event_date) >= today && (filter === 'all' || e.event_type === filter)).slice(0, 10)
  const holidaysThisYear = events.filter(e => e.event_type === 'holiday').length

  function go(delta: number) {
    setMonth(new Date(Date.UTC(yy, mm - 1 + delta, 1)).toISOString().slice(0, 7))
    setSelected(null)
  }

  function openAdd(date: string | null) {
    setFormError(''); setNeedsConfirm(null); setNotice('')
    setForm(emptyForm(date ?? today))
  }

  function openEdit(e: AdminEvent) {
    setFormError(''); setNeedsConfirm(null); setNotice('')
    setForm({
      id: e.id, event_type: e.event_type, title: e.title, event_date: e.event_date,
      multi: !!e.end_date, end_date: e.end_date ?? '', audience: e.audience, description: e.description ?? '',
    })
  }

  async function save(acknowledge = false) {
    if (!form) return
    if (!form.title.trim()) { setFormError('Please enter a title.'); return }
    if (!form.event_date) { setFormError('Please choose a date.'); return }
    if (form.multi && !form.end_date) { setFormError('Please choose the last date, or turn off "Several days".'); return }
    setSaving(true); setFormError('')
    try {
      const res = await fetch(form.id ? `/api/school-calendar/${form.id}` : '/api/school-calendar', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(), event_type: form.event_type, event_date: form.event_date,
          end_date: form.multi ? form.end_date : null,
          audience: form.event_type === 'holiday' ? 'everyone' : form.audience,
          description: form.description.trim() || null,
          acknowledge_existing_attendance: acknowledge || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.code === 'ATTENDANCE_EXISTS') { setNeedsConfirm(data.error); return }
      if (!res.ok) { setFormError(data.error || 'Could not save. Please try again.'); return }
      setNotice(form.id ? 'Entry updated.' : form.event_type === 'holiday' ? 'Holiday added. Attendance is now closed on those dates.' : 'Entry added.')
      setForm(null); setNeedsConfirm(null)
      setSelected(form.event_date.slice(0, 7) === month ? form.event_date : selected)
      setReload(r => r + 1)
    } catch {
      setFormError('Connection problem. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    setDeleting(true); setNotice('')
    try {
      const res = await fetch(`/api/school-calendar/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setNotice(data.error || 'Could not delete.'); return }
      setNotice(data.restoredSessions > 0
        ? `Holiday removed. ${data.restoredSessions} already-marked attendance session${data.restoredSessions > 1 ? 's' : ''} now count in reports again.`
        : 'Entry deleted.')
      setConfirmDelete(null)
      setReload(r => r + 1)
    } catch { setNotice('Connection problem. Please try again.') }
    finally { setDeleting(false) }
  }

  async function saveWeeklyOff() {
    setWeeklySaving(true); setWeeklyError('')
    try {
      const res = await fetch('/api/school-calendar/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_off_days: weeklyOff }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setWeeklyError(data.error || 'Could not save.'); return }
      setWeeklyDraft(null); setNotice('Weekly off days saved.'); setReload(r => r + 1)
    } catch { setWeeklyError('Connection problem. Please try again.') }
    finally { setWeeklySaving(false) }
  }

  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500'

  return (
    <div data-testid="academic-calendar" className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Academic Calendar</h2>
          <p className="text-sm text-gray-500 mt-0.5">Holidays, exams, events and meetings. Teachers, students and parents see this calendar.</p>
        </div>
        <button type="button" onClick={() => openAdd(selected)} data-testid="cal-add-btn"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
          + Add to calendar
        </button>
      </div>

      {notice && (
        <div role="status" data-testid="cal-notice" className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss" className="text-green-700 hover:text-green-900">✕</button>
        </div>
      )}
      {cal.error && (
        <div role="alert" data-testid="cal-error" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{cal.error}</span>
          <button type="button" onClick={() => setReload(r => r + 1)} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">Try again</button>
        </div>
      )}

      {/* Add / edit form */}
      {form && (
        <form
          data-testid="cal-form"
          onSubmit={e => { e.preventDefault(); void save(false) }}
          className="bg-white border border-blue-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">{form.id ? 'Edit entry' : 'Add to calendar'}</h3>
            <button type="button" onClick={() => setForm(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">What is it?</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
              {TYPES.map(t => (
                <button key={t} type="button" role="radio" aria-checked={form.event_type === t}
                  data-testid={`cal-form-type-${t}`} onClick={() => setForm(f => f && ({ ...f, event_type: t }))}
                  className={`text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                    form.event_type === t ? `${CALENDAR_TYPE_UI[t].chip} border-transparent ring-2 ring-offset-1 ring-gray-300` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {CALENDAR_TYPE_UI[t].label}
                </button>
              ))}
            </div>
            {form.event_type === 'holiday' && (
              <p data-testid="cal-form-holiday-note" className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                A holiday is shown to everyone. Teachers cannot mark attendance on these dates, and they are left out of attendance percentages.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="cal-title" className="block text-xs font-semibold text-gray-500 mb-1.5">Title</label>
            <input id="cal-title" data-testid="cal-form-title" className={input} value={form.title} maxLength={120}
              placeholder={form.event_type === 'holiday' ? 'e.g. Diwali' : form.event_type === 'exam' ? 'e.g. Unit Test 1' : 'e.g. Annual Day'}
              onChange={e => setForm(f => f && ({ ...f, title: e.target.value }))} autoFocus />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cal-date" className="block text-xs font-semibold text-gray-500 mb-1.5">{form.multi ? 'From' : 'Date'}</label>
              <input id="cal-date" type="date" data-testid="cal-form-date" className={input} value={form.event_date}
                onChange={e => setForm(f => f && ({ ...f, event_date: e.target.value, end_date: f.end_date && f.end_date < e.target.value ? e.target.value : f.end_date }))} />
            </div>
            {form.multi && (
              <div>
                <label htmlFor="cal-end" className="block text-xs font-semibold text-gray-500 mb-1.5">To (last day)</label>
                <input id="cal-end" type="date" data-testid="cal-form-end-date" className={input} value={form.end_date} min={form.event_date}
                  onChange={e => setForm(f => f && ({ ...f, end_date: e.target.value }))} />
              </div>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" data-testid="cal-form-multi" checked={form.multi}
              onChange={e => setForm(f => f && ({ ...f, multi: e.target.checked, end_date: e.target.checked ? (f.end_date || f.event_date) : '' }))} />
            Several days (e.g. Dasara break)
          </label>

          {form.event_type !== 'holiday' && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Who can see it?</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Audience">
                {([['everyone', 'Everyone (staff, students, parents)'], ['staff', 'Staff only (admin and teachers)']] as const).map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={form.audience === v} data-testid={`cal-form-audience-${v}`}
                    onClick={() => setForm(f => f && ({ ...f, audience: v }))}
                    className={`text-sm px-3 py-1.5 rounded-full border ${form.audience === v ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' : 'bg-white border-gray-200 text-gray-600'}`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="cal-desc" className="block text-xs font-semibold text-gray-500 mb-1.5">Note (optional)</label>
            <textarea id="cal-desc" data-testid="cal-form-description" className={input} rows={2} maxLength={500} value={form.description}
              onChange={e => setForm(f => f && ({ ...f, description: e.target.value }))} />
          </div>

          {formError && <p role="alert" data-testid="cal-form-error" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>}

          {needsConfirm && (
            <div role="alertdialog" data-testid="cal-attendance-warning" className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 space-y-2">
              <p className="text-sm text-amber-900">{needsConfirm}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void save(true)} disabled={saving} data-testid="cal-confirm-anyway"
                  className="text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">Save anyway</button>
                <button type="button" onClick={() => setNeedsConfirm(null)} className="text-sm border border-amber-300 text-amber-800 rounded-lg px-3 py-1.5">Go back</button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || !!needsConfirm} data-testid="cal-form-save"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50">
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add'}
            </button>
            <button type="button" onClick={() => setForm(null)} data-testid="cal-form-cancel"
              className="text-sm text-gray-600 border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* Month grid */}
        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 space-y-3" aria-busy={cal.loading}>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => go(-1)} aria-label="Previous month" data-testid="cal-prev" className="w-10 h-10 rounded-xl text-gray-500 hover:bg-gray-100 text-lg">‹</button>
            <div className="text-center">
              <p data-testid="cal-month-label" className="text-base font-bold text-gray-900">{MONTH_NAMES[mm - 1]} {yy}</p>
              {month !== today.slice(0, 7) && (
                <button type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today) }} className="text-xs text-blue-600 hover:underline">Back to this month</button>
              )}
            </div>
            <button type="button" onClick={() => go(1)} aria-label="Next month" data-testid="cal-next" className="w-10 h-10 rounded-xl text-gray-500 hover:bg-gray-100 text-lg">›</button>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
            {(['all', ...TYPES] as const).map(t => (
              <button key={t} type="button" onClick={() => setFilter(t)} data-testid={`cal-filter-${t}`} aria-pressed={filter === t}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${filter === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {t === 'all' ? 'All' : CALENDAR_TYPE_UI[t].label}
              </button>
            ))}
          </div>

          <div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5" aria-hidden>
              {WEEKDAY_SHORT.map(d => <div key={d} className="text-center text-[11px] font-semibold text-gray-400">{d}</div>)}
            </div>
            <div className={`grid grid-cols-7 gap-1 sm:gap-1.5 ${cal.loading ? 'opacity-50' : ''}`}>
              {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
              {days.map(d => {
                const evs = eventsOn(d)
                const holiday = evs.find(e => e.event_type === 'holiday')
                const off = !holiday && weeklyOff.includes(weekdayOf(d))
                return (
                  <button key={d} type="button" onClick={() => setSelected(selected === d ? null : d)}
                    data-testid={`cal-day-${d}`} data-holiday={holiday ? 'true' : 'false'}
                    aria-label={`${fmtLong(d)}${evs.length ? ': ' + evs.map(e => e.title).join(', ') : ''}`}
                    className={`min-h-12 sm:min-h-20 rounded-lg sm:rounded-xl border p-1 sm:p-1.5 text-left flex flex-col transition ${
                      holiday ? CALENDAR_TYPE_UI.holiday.cell : off ? 'bg-slate-50 border-slate-100 text-slate-400' : 'bg-white border-gray-100 hover:border-gray-300'
                    } ${d === today ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${selected === d ? 'outline outline-2 outline-gray-900' : ''}`}>
                    <span className={`text-xs sm:text-sm font-semibold ${holiday ? 'text-red-700' : ''}`}>{Number(d.slice(8))}</span>
                    <span className="flex gap-0.5 mt-auto sm:hidden">
                      {evs.slice(0, 3).map(e => <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${CALENDAR_TYPE_UI[e.event_type].dot}`} />)}
                    </span>
                    <span className="hidden sm:flex flex-col gap-0.5 mt-0.5 w-full">
                      {evs.slice(0, 2).map(e => <span key={e.id} className={`truncate text-[10px] leading-tight rounded px-1 py-0.5 ${CALENDAR_TYPE_UI[e.event_type].chip}`}>{e.title}</span>)}
                      {evs.length > 2 && <span className="text-[10px] text-gray-400">+{evs.length - 2} more</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected day */}
          <div data-testid="cal-detail" className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 text-sm space-y-2">
            {selected ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-700">{fmtLong(selected)}</p>
                  <button type="button" onClick={() => openAdd(selected)} data-testid="cal-add-on-day" className="text-xs font-semibold text-blue-600 hover:underline">+ Add on this day</button>
                </div>
                {selectedEvents.length === 0
                  ? <p className="text-gray-500">{weeklyOff.includes(weekdayOf(selected)) ? 'Weekly off.' : 'Nothing scheduled.'}</p>
                  : selectedEvents.map(e => (
                    <div key={e.id} className="flex items-start justify-between gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2" data-testid={`cal-entry-${e.id}`}>
                      <div className="min-w-0">
                        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 mr-2 ${CALENDAR_TYPE_UI[e.event_type].chip}`}>{CALENDAR_TYPE_UI[e.event_type].label}</span>
                        <span className="font-medium text-gray-800">{e.title}</span>
                        <span className="text-xs text-gray-400 ml-2">{fmtRange(e)}</span>
                        {e.audience === 'staff' && <span className="text-[11px] text-gray-500 ml-2">· staff only</span>}
                        {e.description && <p className="text-gray-500 text-xs mt-0.5">{e.description}</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {confirmDelete === e.id ? (
                          <>
                            <button type="button" onClick={() => void remove(e.id)} disabled={deleting} data-testid={`cal-delete-confirm-${e.id}`}
                              className="text-xs font-semibold bg-red-600 text-white rounded-lg px-2.5 py-1 disabled:opacity-50">{deleting ? '…' : 'Delete'}</button>
                            <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1">Keep</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => openEdit(e)} data-testid={`cal-entry-edit-${e.id}`} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">Edit</button>
                            <button type="button" onClick={() => setConfirmDelete(e.id)} data-testid={`cal-entry-delete-${e.id}`} className="text-xs border border-red-200 text-red-600 rounded-lg px-2.5 py-1 hover:bg-red-50">Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </>
            ) : <span className="text-gray-400">Tap a day to see or add entries.</span>}
          </div>
        </div>

        {/* Side: upcoming + weekly off */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-2xl p-4" data-testid="cal-upcoming">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-semibold text-gray-800">Coming up</p>
              <p className="text-[11px] text-gray-400">{holidaysThisYear} holiday{holidaysThisYear === 1 ? '' : 's'} in {year}</p>
            </div>
            {cal.loading ? <p className="text-sm text-gray-400">Loading…</p>
              : upcoming.length === 0 ? <p className="text-sm text-gray-400">Nothing scheduled yet. Add the year&apos;s holidays so teachers and parents can plan.</p>
              : (
                <ul className="divide-y divide-gray-100">
                  {upcoming.map(e => (
                    <li key={e.id} className="py-2">
                      <button type="button" onClick={() => { setMonth(e.event_date.slice(0, 7)); setSelected(e.event_date) }} className="w-full text-left flex items-start justify-between gap-2">
                        <span><span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 mr-1.5 ${CALENDAR_TYPE_UI[e.event_type].chip}`}>{CALENDAR_TYPE_UI[e.event_type].label}</span><span className="text-sm text-gray-800">{e.title}</span></span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{fmtRange(e)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4" data-testid="weekly-off-card">
            <p className="text-sm font-semibold text-gray-800">Weekly off</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">These weekdays are never school days: no attendance, and not counted in percentages.</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekly off days">
              {WEEKDAY_SHORT.map((label, i) => (
                <button key={label} type="button" aria-pressed={cal.ready && weeklyOff.includes(i)} data-testid={`weekly-off-${i}`}
                  disabled={!cal.ready}
                  onClick={() => setWeeklyDraft(w => { const cur = w ?? cal.weeklyOff; return cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i] })}
                  className={`disabled:opacity-40 text-xs font-semibold w-11 h-9 rounded-lg border ${weeklyOff.includes(i) ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{label}</button>
              ))}
            </div>
            {weeklyError && <p role="alert" data-testid="weekly-off-error" className="text-xs text-red-600 mt-2">{weeklyError}</p>}
            {weeklyDirty && (
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => void saveWeeklyOff()} disabled={weeklySaving} data-testid="weekly-off-save"
                  className="text-sm font-semibold bg-blue-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">{weeklySaving ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => { setWeeklyDraft(null); setWeeklyError('') }} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">Reset</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
