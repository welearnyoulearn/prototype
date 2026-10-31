'use client'

/**
 * Parent portal → Daily Report (#450): how the selected child's school day went, in one place — attendance,
 * the Daily Quiz done or not (no points, streak or rank), doubts still waiting, and what was taught in class.
 * Sections the school hasn't switched on are left out by the server.
 */

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, CalendarCheck, ChevronLeft, ChevronRight, Loader2, MessageCircleQuestion, Brain } from 'lucide-react'
import { QUIZ_STATUS_TEXT, REPORT_MAX_DAYS_BACK, type AttendanceDay, type QuizDayStatus } from '@/lib/parentDailyReportRules'
import type { DailyReport } from '@/lib/parentDailyReport'

const ATTENDANCE_TEXT: Record<AttendanceDay, string> = { present: 'Present', absent: 'Absent', late: 'Late', not_marked: 'Not marked yet' }
const GOOD = 'bg-emerald-50 text-emerald-800 border-emerald-200'
const WARN = 'bg-amber-50 text-amber-800 border-amber-200'
const BAD = 'bg-red-50 text-red-800 border-red-200'
const PLAIN = 'bg-gray-50 text-gray-700 border-gray-200'
const QUIZ_TONE: Record<QuizDayStatus, string> = {
  completed: GOOD, completed_late: GOOD, in_progress: WARN, not_started: WARN, missed: BAD, not_open_yet: PLAIN, no_quiz: PLAIN,
}
const ATTENDANCE_TONE: Record<AttendanceDay, string> = { present: GOOD, late: WARN, absent: BAD, not_marked: PLAIN }

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === shiftDate(today, -1)) return 'Yesterday'
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

function Tile({ icon, title, value, tone, testId, children }: { icon: React.ReactNode; title: string; value: string; tone: string; testId: string; children?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border p-4 ${tone}`} data-testid={testId}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">{icon}{title}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {children}
    </section>
  )
}

export default function ParentDailyReport({ studentId, studentName }: { studentId: number; studentName: string }) {
  const [date, setDate] = useState<string | null>(null)
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const first = studentName.split(' ')[0]

  const load = useCallback(async (d: string | null) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/parent/daily-report?student_id=${studentId}${d ? `&date=${d}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load the daily report.')
      setReport(data as DailyReport)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [studentId])

  useEffect(() => {
    const t = setTimeout(() => { void load(date) }, 0)
    return () => clearTimeout(t)
  }, [load, date])

  const today = report?.today ?? null
  const shown = report?.date ?? date
  const canBack = !!(shown && today && shown > shiftDate(today, -REPORT_MAX_DAYS_BACK))
  const canForward = !!(shown && today && shown < today)

  return (
    <div className="max-w-3xl space-y-5" data-testid="parent-daily-report">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">How {first}’s school day went, in one place.</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Choose a day">
          <button type="button" disabled={!canBack || loading} onClick={() => shown && setDate(shiftDate(shown, -1))}
            className="rounded-md border p-2 disabled:opacity-40" aria-label="Previous day" data-testid="daily-report-prev">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-28 text-center text-sm font-semibold" data-testid="daily-report-date">{shown && today ? dayLabel(shown, today) : '…'}</span>
          <button type="button" disabled={!canForward || loading} onClick={() => shown && setDate(shiftDate(shown, 1))}
            className="rounded-md border p-2 disabled:opacity-40" aria-label="Next day" data-testid="daily-report-next">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {loading && !report && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>}

      {report && (
        <div className={`space-y-5 ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-3">
            {report.attendance && (
              <Tile icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />} title="Attendance" value={ATTENDANCE_TEXT[report.attendance]} tone={ATTENDANCE_TONE[report.attendance]} testId="daily-report-attendance" />
            )}
            {report.quiz && (
              <Tile icon={<Brain className="h-4 w-4" aria-hidden="true" />} title="Daily quiz" value={QUIZ_STATUS_TEXT[report.quiz.status]} tone={QUIZ_TONE[report.quiz.status]} testId="daily-report-quiz">
                {report.quiz.status === 'missed' && <p className="mt-1 text-xs">It can still be taken late for 7 days.</p>}
                {report.quiz.subjects.length > 0 && <p className="mt-1 text-xs opacity-80">{report.quiz.subjects.join(' · ')}</p>}
              </Tile>
            )}
            {report.doubts && (
              <Tile icon={<MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />} title="Doubts"
                value={report.doubts.waiting + report.doubts.answered === 0 ? 'None open' : `${report.doubts.waiting + report.doubts.answered} not clarified yet`}
                tone={report.doubts.waiting + report.doubts.answered === 0 ? GOOD : WARN} testId="daily-report-doubts">
                {report.doubts.waiting > 0 && <p className="mt-1 text-xs">{report.doubts.waiting} waiting for the teacher</p>}
                {report.doubts.answered > 0 && <p className="mt-1 text-xs">{report.doubts.answered} answered — {first} still has to confirm</p>}
              </Tile>
            )}
          </div>

          {report.quizWeek && report.quizWeek.length > 0 && (
            <section className="rounded-xl border bg-white p-4" data-testid="daily-report-quiz-week">
              <h2 className="text-sm font-semibold">Daily quiz — last {report.quizWeek.length} quiz days</h2>
              <ol className="mt-3 flex flex-wrap gap-2">
                {report.quizWeek.map(d => (
                  <li key={d.date} className={`rounded-lg border px-3 py-2 text-xs ${QUIZ_TONE[d.status]}`} data-testid={`daily-report-quiz-day-${d.date}`}>
                    <span className="block font-semibold">{shortDay(d.date)}</span>
                    <span>{QUIZ_STATUS_TEXT[d.status]}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {report.taught && (
            <section className="rounded-xl border bg-white p-4" data-testid="daily-report-taught">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4" aria-hidden="true" /> Taught in class</h2>
              {report.taught.length === 0
                ? <p className="mt-2 text-sm text-muted-foreground">No topics were marked as taught this day.</p>
                : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {report.taught.map((t, i) => <li key={i}><span className="font-medium">{t.subject}</span> — {t.topic}</li>)}
                  </ul>
                )}
            </section>
          )}

          {report.doubts && report.doubts.items.length > 0 && (
            <section className="rounded-xl border bg-white p-4" data-testid="daily-report-doubt-list">
              <h2 className="text-sm font-semibold">{first}’s open doubts</h2>
              <ul className="mt-2 divide-y">
                {report.doubts.items.map(d => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-2 text-sm" data-testid={`daily-report-doubt-${d.id}`}>
                    <span className="min-w-0"><span className="font-medium">{d.subject}</span> — {d.question}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${d.status === 'open' ? WARN : PLAIN}`}>{d.status === 'open' ? 'Waiting for teacher' : 'Answered'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

/** A small card for the parent home: today's quiz done or not and open doubts, one tap to the Daily Report. */
export function ParentDailyReportCard({ studentId, studentName, onOpen }: { studentId: number; studentName: string; onOpen: () => void }) {
  const [report, setReport] = useState<DailyReport | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/parent/daily-report?student_id=${studentId}`).then(r => r.ok ? r.json() : null).then(d => { if (!cancelled && d) setReport(d as DailyReport) }).catch(() => {})
    return () => { cancelled = true }
  }, [studentId])
  if (!report?.quiz && !report?.doubts) return null
  const first = studentName.split(' ')[0]
  const openDoubts = report.doubts ? report.doubts.waiting + report.doubts.answered : 0
  const parts = [
    report.quiz && report.quiz.status !== 'no_quiz' ? `Daily quiz: ${QUIZ_STATUS_TEXT[report.quiz.status]}` : null,
    openDoubts ? `${openDoubts} doubt${openDoubts > 1 ? 's' : ''} not clarified` : null,
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <button type="button" onClick={onOpen} data-testid="parent-daily-report-card"
      className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition hover:shadow-sm ${report.quiz ? QUIZ_TONE[report.quiz.status] : PLAIN}`}>
      <Brain className="h-6 w-6 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">{first}’s day</span>
        <span className="mt-0.5 block font-semibold">{parts.join(' · ')}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold underline">Daily Report</span>
    </button>
  )
}
