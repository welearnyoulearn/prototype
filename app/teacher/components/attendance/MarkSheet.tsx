'use client'

import { useEffect, useMemo, useState } from 'react'
import { SESSION_LABEL, longDate, timeOf, type Session, type Sheet, type Status } from './types'
import { Skeleton } from '@/components/ui/skeleton'

// Step 2 — one class, one date, one session.
//   open        → mark everyone (all Present by default), tap the exceptions, review, submit
//   locked      → "Already marked by Ms. X at 9:12 AM": read-only for everyone else; the teacher
//                 who marked it may correct it on the same day; anyone can report a mistake
//   holiday     → nothing to mark
// The server enforces every one of these rules; this screen just makes them clear.

const STATUS_BTN: Record<Status, { label: string; on: string; off: string }> = {
  present: { label: 'Present', on: 'bg-green-100 text-green-800 border-green-400 ring-2 ring-green-200', off: 'bg-white text-gray-500 border-gray-200 hover:border-green-300' },
  absent:  { label: 'Absent',  on: 'bg-red-100 text-red-800 border-red-400 ring-2 ring-red-200',       off: 'bg-white text-gray-500 border-gray-200 hover:border-red-300' },
  late:    { label: 'Late',    on: 'bg-amber-100 text-amber-800 border-amber-400 ring-2 ring-amber-200', off: 'bg-white text-gray-500 border-gray-200 hover:border-amber-300' },
}
const STATUS_CHIP: Record<Status, string> = {
  present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700', late: 'bg-amber-100 text-amber-700',
}

type Phase = 'mark' | 'review' | 'view' | 'done'
type Loaded = { key: string; sheet: Sheet | null; error: string }

export default function MarkSheet({ classId, date, session: initialSession, onBack, onChanged }: {
  classId: number
  date: string
  session: Session
  onBack: () => void
  /** Called after a save so the class picker can refresh its badges. */
  onChanged: () => void
}) {
  const [session, setSession] = useState<Session>(initialSession)
  const [reload, setReload] = useState(0)
  const key = `${classId}|${date}|${session}|${reload}`
  const [loaded, setLoaded] = useState<Loaded>({ key: '', sheet: null, error: '' })
  const [phase, setPhase] = useState<Phase>('view')
  const [statuses, setStatuses] = useState<Record<number, Status>>({})
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [done, setDone] = useState<{ saved: number; notified: number; edited: boolean; offline: boolean } | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportNote, setReportNote] = useState('')
  const [reportState, setReportState] = useState<{ sending: boolean; message: string; ok: boolean }>({ sending: false, message: '', ok: false })
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/attendance?view=sheet&class_id=${classId}&date=${date}&session=${session}`, { cache: 'no-store' })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error || 'Could not load this class')
        return body as Sheet
      })
      .then(sheet => {
        if (cancelled) return
        const init: Record<number, Status> = {}
        for (const s of sheet.students) init[s.id] = s.status ?? 'present'
        setStatuses(init)
        setPhase(sheet.canMark ? 'mark' : 'view')
        setLoaded({ key, sheet, error: '' })
      })
      .catch((e: unknown) => { if (!cancelled) setLoaded({ key, sheet: null, error: e instanceof Error ? e.message : 'Could not load this class' }) })
    return () => { cancelled = true }
  }, [classId, date, session, key])

  const loading = loaded.key !== key
  const sheet = loading ? null : loaded.sheet
  const loadError = loading ? '' : loaded.error

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0 }
    for (const v of Object.values(statuses)) c[v]++
    return c
  }, [statuses])

  const shown = useMemo(() => {
    if (!sheet) return []
    const q = filter.trim().toLowerCase()
    return q ? sheet.students.filter(s => s.name.toLowerCase().includes(q) || (s.roll_number ?? '').toLowerCase().includes(q)) : sheet.students
  }, [sheet, filter])

  function switchSession(next: Session) {
    if (next === session) return
    setSession(next); setNotice(null); setDone(null); setReportOpen(false); setCopiedFrom(null)
  }

  async function copyLastDay() {
    try {
      const r = await fetch(`/api/attendance?class_id=${classId}&previous=true&session=${session}`, { cache: 'no-store' })
      const data = await r.json()
      if (data?.records && Array.isArray(data.records)) {
        setStatuses(prev => {
          const next = { ...prev }
          for (const rec of data.records as { student_id: number; status: Status }[]) if (rec.student_id in next) next[rec.student_id] = rec.status
          return next
        })
        setCopiedFrom(new Date(`${data.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }))
      } else setNotice({ tone: 'info', text: 'There is no earlier attendance to copy for this class.' })
    } catch { setNotice({ tone: 'error', text: 'Could not load the previous day.' }) }
  }

  async function submit() {
    if (!sheet) return
    setSaving(true); setNotice(null)
    const editing = !!sheet.lock
    try {
      const res = await fetch('/api/attendance', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId, date, session,
          records: sheet.students.map(s => ({ student_id: s.id, status: statuses[s.id] ?? 'present' })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 202 && data.queued) {           // offline: queued by the service worker
        setDone({ saved: sheet.students.length, notified: 0, edited: editing, offline: true }); setPhase('done'); return
      }
      if (res.ok) {
        setDone({ saved: data.saved, notified: data.notified ?? 0, edited: editing, offline: false })
        setPhase('done'); onChanged(); return
      }
      // Refused: someone else got there first, it became a holiday, or the dates changed.
      // Nothing was overwritten — show why and reload the real state.
      setNotice({ tone: 'error', text: data.error || 'Could not save attendance.' })
      if (['ALREADY_MARKED', 'HOLIDAY', 'WEEKLY_OFF', 'LOCKED', 'TOO_OLD', 'FUTURE'].includes(data.code)) {
        setReload(r => r + 1); onChanged()
      } else setPhase('mark')
    } catch {
      setNotice({ tone: 'error', text: 'Connection problem. Your entries are still here — please try again.' })
      setPhase('mark')
    } finally { setSaving(false) }
  }

  async function sendReport() {
    setReportState({ sending: true, message: '', ok: false })
    try {
      const res = await fetch('/api/attendance/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: classId, date, session, note: reportNote }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setReportState({ sending: false, message: 'Sent. The school admin has been told.', ok: true }); setReportNote('') }
      else setReportState({ sending: false, message: data.error || 'Could not send the report.', ok: false })
    } catch { setReportState({ sending: false, message: 'Connection problem. Please try again.', ok: false }) }
  }

  const title = sheet ? `Class ${sheet.class.grade}-${sheet.class.section}` : 'Attendance'

  return (
    <div className="space-y-4 pb-24" data-testid="att-sheet">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} data-testid="att-back" aria-label="Back to classes"
          className="w-10 h-10 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-lg">‹</button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">{title}</h2>
          <p className="text-xs text-gray-500">{longDate(date)}</p>
        </div>
      </div>

      {/* Session switch */}
      <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-md" role="tablist" aria-label="Session">
        {(['morning', 'afternoon'] as Session[]).map(s => (
          <button key={s} type="button" role="tab" aria-selected={session === s} onClick={() => switchSession(s)} data-testid={`att-session-${s}`}
            className={`py-2 rounded-lg text-sm font-semibold transition ${session === s ? 'bg-white text-gray-900 ' : 'text-gray-500 hover:text-gray-700'}`}>
            {s === 'morning' ? '🌅' : '🌆'} {SESSION_LABEL[s]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3" role="status" aria-live="polite" aria-busy="true" data-testid="att-sheet-loading">
          <span className="sr-only">Loading attendance sheet</span>
          <Skeleton className="h-16" />
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      )}

      {loadError && (
        <div role="alert" data-testid="att-sheet-error" className="bg-red-50 border border-red-200 rounded-lg px-4 py-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={() => setReload(r => r + 1)} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">Try again</button>
        </div>
      )}

      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} data-testid="att-notice"
          className={`rounded-lg px-4 py-3 text-sm border ${notice.tone === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          {notice.text}
        </div>
      )}

      {/* ── Holiday ── */}
      {sheet?.nonWorking && (
        <div data-testid="att-holiday" role="status" className="bg-red-50 border border-red-200 rounded-lg px-5 py-5 flex items-start gap-3">
          <span className="text-3xl" aria-hidden>🎉</span>
          <div>
            <p className="text-base font-bold text-red-800">{sheet.nonWorking.kind === 'holiday' ? `Holiday — ${sheet.nonWorking.title}` : 'Weekly off'}</p>
            <p className="text-sm text-red-700 mt-0.5">Attendance is not taken on this day.</p>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {phase === 'done' && done && (
        <div data-testid="att-done" className="bg-white border border-green-200 rounded-lg px-5 py-8 text-center space-y-3">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto text-2xl" aria-hidden>✓</div>
          <p className="text-lg font-bold text-gray-900">
            {done.offline ? 'Saved on this device' : done.edited ? 'Attendance updated' : 'Attendance saved'}
          </p>
          <p className="text-sm text-gray-500">
            {title} · {SESSION_LABEL[session]} · {done.saved} students
            {done.offline && <><br />It will be sent automatically when you are back online.</>}
            {!done.offline && done.notified > 0 && <><br />{done.notified} parent{done.notified > 1 ? 's' : ''} will be told about the absence{done.notified > 1 ? 's' : ''}.</>}
          </p>
          <div className="flex gap-2 justify-center flex-wrap pt-2">
            <button type="button" onClick={() => switchSession(session === 'morning' ? 'afternoon' : 'morning')} data-testid="att-done-other-session"
              className="text-sm font-semibold border border-gray-200 rounded-md px-4 py-2.5 hover:bg-gray-50">Mark {session === 'morning' ? 'Afternoon' : 'Morning'}</button>
            <button type="button" onClick={onBack} data-testid="att-done-back" className="text-sm font-semibold bg-blue-600 text-white rounded-md px-4 py-2.5">Back to classes</button>
          </div>
        </div>
      )}

      {/* ── Locked / read-only ── */}
      {sheet && !sheet.nonWorking && sheet.lock && phase !== 'done' && phase !== 'mark' && phase !== 'review' && (
        <div data-testid="att-already-marked" role="status"
          className={`rounded-lg px-4 py-4 border ${sheet.lock.byMe ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`text-sm font-bold ${sheet.lock.byMe ? 'text-blue-900' : 'text-amber-900'}`}>
            🔒 {sheet.lock.byMe ? 'You marked this session' : `Already marked by ${sheet.lock.markedBy}`}
            <span className="font-normal"> at {timeOf(sheet.lock.markedAt)}</span>
          </p>
          <p className={`text-xs mt-1 ${sheet.lock.byMe ? 'text-blue-800' : 'text-amber-800'}`}>
            {sheet.canEdit
              ? 'You can correct it until the end of today. The school admin can change it at any time.'
              : sheet.lock.byMe
                ? 'Corrections are only allowed on the day it was marked. Ask the school admin to change it.'
                : 'Only they (on the same day) or the school admin can change it. If something looks wrong, report it below.'}
            {sheet.lock.editedBy && ` Last corrected by ${sheet.lock.editedBy}.`}
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            {sheet.canEdit && (
              <button type="button" onClick={() => { setPhase('mark'); setNotice(null) }} data-testid="att-edit-btn"
                className="text-sm font-semibold bg-blue-600 text-white rounded-lg px-3.5 py-2">Edit attendance</button>
            )}
            {!sheet.lock.byMe || !sheet.canEdit ? (
              <button type="button" onClick={() => setReportOpen(o => !o)} data-testid="att-report-btn"
                className="text-sm font-semibold border border-amber-300 text-amber-900 rounded-lg px-3.5 py-2 hover:bg-amber-100">Report a mistake</button>
            ) : null}
          </div>
          {reportOpen && (
            <div className="mt-3 space-y-2" data-testid="att-report-form">
              <textarea value={reportNote} onChange={e => setReportNote(e.target.value)} rows={3} maxLength={500} data-testid="att-report-note"
                placeholder="What looks wrong? e.g. “Ravi was present but is marked absent.”"
                className="w-full border border-amber-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => void sendReport()} disabled={reportState.sending || reportNote.trim().length < 5} data-testid="att-report-send"
                  className="text-sm font-semibold bg-amber-600 text-white rounded-lg px-3.5 py-2 disabled:opacity-50">{reportState.sending ? 'Sending…' : 'Send to admin'}</button>
                {reportState.message && <span data-testid="att-report-result" className={`text-xs ${reportState.ok ? 'text-green-700' : 'text-red-600'}`}>{reportState.message}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Marking window closed / class empty (not locked, cannot mark) */}
      {sheet && !sheet.nonWorking && !sheet.lock && !sheet.canMark && phase !== 'done' && (
        <div data-testid="att-cannot-mark" role="status" className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4 text-sm text-amber-900">
          {!sheet.window.ok ? sheet.window.message : sheet.students.length === 0 ? 'This class has no active students to mark.' : 'This session cannot be marked.'}
        </div>
      )}

      {/* ── Roster ── */}
      {sheet && !sheet.nonWorking && sheet.students.length > 0 && phase !== 'done' && phase !== 'review' && (
        <>
          <div className="grid grid-cols-3 gap-2" data-testid="att-counts">
            {([['present', counts.present, 'text-green-700 bg-green-50 border-green-200'], ['absent', counts.absent, 'text-red-700 bg-red-50 border-red-200'], ['late', counts.late, 'text-amber-700 bg-amber-50 border-amber-200']] as const).map(([k, n, cls]) => (
              <div key={k} className={`rounded-md border px-3 py-2 text-center ${cls}`}>
                <p className="text-xl font-bold" data-testid={`att-count-${k}`}>{phase === 'view' ? sheet.counts[k] : n}</p>
                <p className="text-xs font-medium capitalize">{k}</p>
              </div>
            ))}
          </div>

          {phase === 'mark' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => { setStatuses(Object.fromEntries(sheet.students.map(s => [s.id, 'present' as Status]))); setCopiedFrom(null) }}
                data-testid="att-all-present" className="text-xs font-semibold border border-green-300 text-green-700 rounded-lg px-3 py-1.5 hover:bg-green-50">All present</button>
              {!sheet.lock && (
                <button type="button" onClick={() => void copyLastDay()} data-testid="att-copy-last"
                  className="text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50">Copy last day</button>
              )}
              {copiedFrom && <span className="text-xs text-muted-foreground">Copied from {copiedFrom} — check before submitting</span>}
              {sheet.students.length > 12 && (
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a student" data-testid="att-filter"
                  className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              )}
            </div>
          )}

          <ul className="space-y-2">
            {shown.map(s => {
              const current = phase === 'view' ? s.status : statuses[s.id]
              return (
                <li key={s.id} data-testid={`att-student-${s.id}`} data-status={current ?? ''}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                    {s.roll_number && <p className="text-xs text-muted-foreground">Roll {s.roll_number}</p>}
                  </div>
                  {phase === 'view' ? (
                    <span className={`self-start sm:self-auto text-xs font-semibold rounded-full px-3 py-1 capitalize ${current ? STATUS_CHIP[current] : 'bg-gray-100 text-muted-foreground'}`}>{current ?? 'not recorded'}</span>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 sm:w-72" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                      {(['present', 'absent', 'late'] as Status[]).map(st => (
                        <button key={st} type="button" role="radio" aria-checked={current === st}
                          data-testid={`att-status-${s.id}-${st}`}
                          onClick={() => setStatuses(prev => ({ ...prev, [s.id]: st }))}
                          className={`py-2.5 rounded-md border text-sm font-semibold transition ${current === st ? STATUS_BTN[st].on : STATUS_BTN[st].off}`}>
                          {STATUS_BTN[st].label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
            {shown.length === 0 && <li className="text-sm text-muted-foreground text-center py-6">No student matches “{filter}”.</li>}
          </ul>
        </>
      )}

      {/* ── Review ── */}
      {phase === 'review' && sheet && (
        <div data-testid="att-review" className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <p className="text-base font-bold text-gray-900">Check before you submit</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-50 rounded-md py-3"><p className="text-2xl font-bold text-green-700">{counts.present}</p><p className="text-xs text-green-700">Present</p></div>
            <div className="bg-red-50 rounded-md py-3"><p className="text-2xl font-bold text-red-700">{counts.absent}</p><p className="text-xs text-red-700">Absent</p></div>
            <div className="bg-amber-50 rounded-md py-3"><p className="text-2xl font-bold text-amber-700">{counts.late}</p><p className="text-xs text-amber-700">Late</p></div>
          </div>
          {counts.absent > 0 && (
            <div data-testid="att-review-absent"><p className="text-xs font-semibold text-red-700 mb-1">Absent — parents will be told</p>
              <p className="text-sm text-gray-700">{sheet.students.filter(s => statuses[s.id] === 'absent').map(s => s.name).join(', ')}</p></div>
          )}
          {counts.late > 0 && (
            <div><p className="text-xs font-semibold text-amber-700 mb-1">Late</p>
              <p className="text-sm text-gray-700">{sheet.students.filter(s => statuses[s.id] === 'late').map(s => s.name).join(', ')}</p></div>
          )}
          <p className="text-xs text-gray-500">
            {sheet.lock
              ? 'This replaces the earlier entry for this session.'
              : 'Once submitted, this session is locked — other teachers will see that you marked it.'}
          </p>
        </div>
      )}

      {/* ── Sticky action bar ── */}
      {sheet && (phase === 'mark' || phase === 'review') && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 md:left-64">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {phase === 'review' ? (
              <>
                <button type="button" onClick={() => setPhase('mark')} disabled={saving} data-testid="att-review-back"
                  className="text-sm font-semibold border border-gray-200 rounded-md px-4 py-3 hover:bg-gray-50 disabled:opacity-50">Back</button>
                <button type="button" onClick={() => void submit()} disabled={saving} data-testid="att-submit"
                  className="flex-1 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-md px-4 py-3 disabled:opacity-50">
                  {saving ? 'Saving…' : sheet.lock ? 'Save changes' : 'Submit attendance'}
                </button>
              </>
            ) : (
              <>
                {sheet.lock && (
                  <button type="button" onClick={() => { setPhase('view'); setReload(r => r + 1) }} data-testid="att-cancel-edit"
                    className="text-sm font-semibold border border-gray-200 rounded-md px-4 py-3 hover:bg-gray-50">Cancel</button>
                )}
                <p className="text-xs text-gray-500 hidden sm:block">{counts.present} present · {counts.absent} absent · {counts.late} late</p>
                <button type="button" onClick={() => setPhase('review')} data-testid="att-review-btn"
                  className="flex-1 sm:flex-none sm:ml-auto text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-md px-6 py-3">Review & submit</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
