'use client'

import { useEffect, useState } from 'react'

// The school admin's "how is the day going?" panel at the top of the Attendance page:
//  • a clear banner when the chosen date is a holiday / weekly off (nothing to mark),
//  • otherwise how many classes have marked Morning / Afternoon and which have NOT (with the
//    teacher to ask),
//  • mistakes teachers have reported on locked attendance, ready to fix and resolve.

export type OverviewNotMarked = { id: number; grade: string; section: string; classTeacher: string | null }

export type AttendanceOverview = {
  date: string
  today: string
  nonWorking: { kind: 'holiday' | 'weekly_off'; title: string } | null
  totals: { classes: number; morningMarked: number; afternoonMarked: number; notMarkedMorning: OverviewNotMarked[]; openReports: number }
}

type Report = {
  id: number; class_id: number; grade: string; section: string; date: string; session: string
  reported_by_name: string; note: string; marked_by: string | null; created_at: string
}

const PREFILL_KEY = 'wlyl_calendar_prefill'

function fmt(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default function AttendanceTodayPanel({ overview, onNavigate, onOpenClass }: {
  overview: AttendanceOverview | null
  onNavigate?: (key: string) => void
  onOpenClass?: (classId: number) => void
}) {
  const [reports, setReports] = useState<Report[]>([])
  const [reportsError, setReportsError] = useState('')
  const [resolving, setResolving] = useState<number | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/attendance/report?status=open', { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error(); return r.json() as Promise<Report[]> })
      .then(rows => { if (!cancelled) { setReports(Array.isArray(rows) ? rows : []); setReportsError('') } })
      .catch(() => { if (!cancelled) setReportsError('Could not load mistake reports.') })
    return () => { cancelled = true }
  }, [reload])

  async function resolve(id: number) {
    setResolving(id)
    try {
      const res = await fetch('/api/attendance/report', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      if (res.ok) setReload(r => r + 1)
    } finally { setResolving(null) }
  }

  function markHoliday() {
    if (!overview) return
    try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ event_type: 'holiday', event_date: overview.date })) } catch { /* storage unavailable */ }
    onNavigate?.('academic-calendar')
  }

  if (!overview) return null
  const { nonWorking, totals } = overview
  const isFuture = overview.date > overview.today
  const pct = totals.classes > 0 ? Math.round((totals.morningMarked / totals.classes) * 100) : 0

  return (
    <div className="space-y-3 mb-5" data-testid="attendance-today-panel">
      {nonWorking ? (
        <div data-testid="attendance-holiday-banner" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🎉</span>
            <div>
              <p className="text-sm font-bold text-red-800">
                {nonWorking.kind === 'holiday' ? `Holiday — ${nonWorking.title}` : 'Weekly off'}
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                No attendance is taken on {fmt(overview.date)}. Teachers cannot mark it, and it is left out of every percentage.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => onNavigate?.('academic-calendar')} data-testid="attendance-open-calendar"
            className="text-xs font-semibold text-red-700 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">
            Open Academic Calendar →
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-4" data-testid="attendance-progress">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                {isFuture ? 'This date has not come yet' : `${totals.morningMarked} of ${totals.classes} classes have marked Morning`}
              </p>
              {!isFuture && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Afternoon: {totals.afternoonMarked} of {totals.classes}
                </p>
              )}
            </div>
            {!isFuture && (
              <button type="button" onClick={markHoliday} data-testid="attendance-mark-holiday-btn"
                className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                Mark {overview.date === overview.today ? 'today' : fmt(overview.date)} as a holiday
              </button>
            )}
          </div>
          {!isFuture && totals.classes > 0 && (
            <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Classes marked">
              <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
            </div>
          )}
          {!isFuture && totals.notMarkedMorning.length > 0 && (
            <div className="mt-3" data-testid="attendance-not-marked">
              <p className="text-xs font-semibold text-amber-700 mb-1.5">Not marked yet (Morning)</p>
              <div className="flex flex-wrap gap-1.5">
                {totals.notMarkedMorning.slice(0, 14).map(c => (
                  <button key={c.id} type="button" onClick={() => onOpenClass?.(c.id)}
                    title={c.classTeacher ? `Class teacher: ${c.classTeacher}` : 'No class teacher assigned'}
                    className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1 hover:bg-amber-100">
                    {c.grade}-{c.section}{c.classTeacher ? ` · ${c.classTeacher}` : ''}
                  </button>
                ))}
                {totals.notMarkedMorning.length > 14 && <span className="text-xs text-gray-400 self-center">+{totals.notMarkedMorning.length - 14} more</span>}
              </div>
            </div>
          )}
          {!isFuture && totals.classes > 0 && totals.notMarkedMorning.length === 0 && (
            <p data-testid="attendance-all-marked" className="mt-3 text-xs font-medium text-green-700">✓ Every class has marked Morning attendance.</p>
          )}
        </div>
      )}

      {reportsError && <p className="text-xs text-red-600">{reportsError}</p>}
      {reports.length > 0 && (
        <div className="bg-white border border-orange-200 rounded-2xl p-4" data-testid="attendance-reports">
          <p className="text-sm font-semibold text-orange-800 mb-2">
            {reports.length} mistake report{reports.length > 1 ? 's' : ''} from teachers
          </p>
          <ul className="divide-y divide-gray-100">
            {reports.map(r => (
              <li key={r.id} className="py-2.5 flex items-start justify-between gap-3" data-testid={`attendance-report-${r.id}`}>
                <div className="min-w-0 text-sm">
                  <p className="text-gray-800">
                    <span className="font-semibold">Class {r.grade}-{r.section}</span> · {fmt(r.date)} · {r.session}
                    {r.marked_by && <span className="text-gray-400"> (marked by {r.marked_by})</span>}
                  </p>
                  <p className="text-gray-600 mt-0.5">“{r.note}” <span className="text-xs text-gray-400">— {r.reported_by_name}</span></p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button type="button" onClick={() => onOpenClass?.(r.class_id)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">View class</button>
                  <button type="button" onClick={() => void resolve(r.id)} disabled={resolving === r.id} data-testid={`attendance-report-resolve-${r.id}`}
                    className="text-xs font-semibold bg-orange-600 text-white rounded-lg px-2.5 py-1 disabled:opacity-50">{resolving === r.id ? '…' : 'Resolved'}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
