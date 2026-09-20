'use client'

import { SESSION_LABEL, longDate, timeOf, type Overview, type Session, type SessionState } from './types'

// Step 1 — every class in the school, with the state of its Morning and Afternoon attendance.
// Any teacher can mark any class. A session that someone has already marked shows who did and
// when, and opens read-only for everyone else.

function SessionPill({ label, state, classId, session, onOpen, disabled }: {
  label: string; state: SessionState; classId: number; session: Session
  onOpen: (classId: number, session: Session) => void; disabled: boolean
}) {
  const marked = state.marked
  return (
    <button
      type="button" disabled={disabled}
      onClick={() => onOpen(classId, session)}
      data-testid={`att-class-${classId}-${session}`} data-state={marked ? (state.byMe ? 'marked-by-me' : 'marked') : 'open'}
      className={`w-full text-left rounded-xl border px-3 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed ${
        marked
          ? 'bg-green-50 border-green-200 hover:border-green-300'
          : 'bg-white border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800">{session === 'morning' ? '🌅' : '🌆'} {label}</span>
        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${marked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {marked ? '🔒 Marked' : 'Not marked'}
        </span>
      </div>
      {marked ? (
        <>
          <p className="text-xs text-gray-600 mt-1 truncate" title={state.markedBy ?? ''}>
            {state.byMe ? 'You' : state.markedBy}{state.markedAt ? ` · ${timeOf(state.markedAt)}` : ''}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            <span className="text-green-700 font-semibold">P {state.present}</span>
            <span className="text-red-600 font-semibold ml-2">A {state.absent}</span>
            {state.late > 0 && <span className="text-amber-600 font-semibold ml-2">L {state.late}</span>}
          </p>
        </>
      ) : (
        <p className="text-xs text-blue-600 mt-1">Tap to mark</p>
      )}
    </button>
  )
}

export default function ClassPicker({ overview, loading, error, date, minDate, today, onDateChange, onOpen, onRetry }: {
  overview: Overview | null
  loading: boolean
  error: string
  date: string
  minDate: string
  today: string
  onDateChange: (d: string) => void
  onOpen: (classId: number, session: Session) => void
  onRetry: () => void
}) {
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
  const nw = overview?.nonWorking ?? null

  return (
    <div className="space-y-5" data-testid="att-picker">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Attendance for</p>
          <p data-testid="att-date-label" className="text-base font-bold text-gray-900">{longDate(date)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {([['Today', today], ['Yesterday', yesterday]] as const).filter(([, d]) => d >= minDate).map(([label, d]) => (
            <button key={label} type="button" onClick={() => onDateChange(d)} data-testid={`att-date-${label.toLowerCase()}`}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${date === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{label}</button>
          ))}
          <input type="date" value={date} min={minDate} max={today} data-testid="att-date-input"
            onChange={e => e.target.value && onDateChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>

      {nw && (
        <div data-testid="att-holiday" role="status" className="bg-red-50 border border-red-200 rounded-2xl px-5 py-5 flex items-start gap-3">
          <span className="text-3xl" aria-hidden>🎉</span>
          <div>
            <p className="text-base font-bold text-red-800">{nw.kind === 'holiday' ? `${date === today ? 'Today is a holiday' : 'Holiday'} — ${nw.title}` : 'Weekly off'}</p>
            <p className="text-sm text-red-700 mt-0.5">There is no school on this day, so attendance is not taken.</p>
          </div>
        </div>
      )}

      {!nw && overview && !overview.window.ok && (
        <div data-testid="att-window-closed" role="status" className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-900">
          {overview.window.message}
        </div>
      )}

      {error && (
        <div role="alert" data-testid="att-error" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">Try again</button>
        </div>
      )}

      {loading && !error && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse" aria-busy="true">
          {[1, 2, 3].map(i => <div key={i} className="h-44 bg-gray-100 rounded-2xl" />)}
        </div>
      )}

      {!loading && !error && overview && overview.classes.length === 0 && (
        <div className="text-center py-14 bg-white border border-gray-200 rounded-2xl">
          <p className="text-3xl mb-2" aria-hidden>🏫</p>
          <p className="text-sm font-semibold text-gray-700">No classes set up yet</p>
          <p className="text-xs text-gray-400 mt-1">Ask the school admin to create classes first.</p>
        </div>
      )}

      {!loading && !error && overview && overview.classes.length > 0 && !nw && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {overview.classes.map(c => (
            <div key={c.id} data-testid={`att-class-${c.id}`} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-gray-900">Class {c.grade}-{c.section}</p>
                  <p className="text-xs text-gray-400">{c.studentCount} student{c.studentCount === 1 ? '' : 's'}{c.classTeacher ? ` · CT: ${c.classTeacher}` : ''}</p>
                </div>
              </div>
              {c.studentCount === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">No students in this class yet.</p>
              ) : (
                <div className="space-y-2">
                  <SessionPill label={SESSION_LABEL.morning} state={c.morning} classId={c.id} session="morning" onOpen={onOpen} disabled={false} />
                  <SessionPill label={SESSION_LABEL.afternoon} state={c.afternoon} classId={c.id} session="afternoon" onOpen={onOpen} disabled={false} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
