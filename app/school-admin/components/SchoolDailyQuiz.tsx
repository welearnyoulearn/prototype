'use client'

// School Admin → Daily Quiz (#434): how the quiz is going this week, per class and per subject. Read-only:
// when the quiz runs and for which grades is managed by WLYL (Platform Admin), and which subjects are asked
// follows the class's subjects and the published question banks.

import { useEffect, useState, type ReactNode } from 'react'

type ClassRow = {
  classId: number; grade: string; section: string; students: number; quizzes: number
  participationPct: number | null; goalMet: boolean; accuracyPct: number | null
  top: { name: string; points: number }[]; mostImproved: { name: string; gain: number } | null
}
type Report = { weekStart: string; classes: ClassRow[]; subjects: { subject: string; accuracyPct: number; answers: number }[] }

export default function SchoolDailyQuiz({ extra }: { extra?: ReactNode }) {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/school/quiz-report')
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? 'Could not load the report'); return d as Report })
      .then(d => { if (!cancelled) setReport(d) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [])

  const week = report ? new Date(`${report.weekStart}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''
  return (
    <div className="space-y-6" data-testid="school-daily-quiz">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Daily Quiz</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every school day, each student answers one question per subject on what their class covered. This shows the week{week && ` starting ${week}`}.
          The quiz timings and grades are managed by WLYL.
        </p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!report && !error && <p className="text-sm text-gray-500" role="status">Loading…</p>}
      {report && (
        <>
          <section className="overflow-x-auto rounded-xl border bg-white" aria-labelledby="sdq-classes">
            <h2 id="sdq-classes" className="px-4 pt-4 font-semibold text-gray-900">Classes this week</h2>
            {report.classes.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No quizzes yet. Quizzes start once WLYL publishes questions for your classes’ subjects and teachers mark topics covered.</p>
            ) : (
              <table className="mt-2 w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-2">Class</th><th className="px-4 py-2">Took part</th><th className="px-4 py-2">Correct</th><th className="px-4 py-2">Top students</th><th className="px-4 py-2">Most improved</th></tr>
                </thead>
                <tbody className="divide-y">
                  {report.classes.map(c => (
                    <tr key={c.classId} data-testid={`sdq-class-${c.classId}`}>
                      <td className="px-4 py-2 font-medium">{c.grade}-{c.section}<span className="block text-xs text-gray-500">{c.students} students · {c.quizzes} quizzes</span></td>
                      <td className="px-4 py-2">{c.participationPct === null ? '—' : <span className={c.goalMet ? 'font-semibold text-green-700' : 'text-amber-700'}>{c.participationPct}%{c.goalMet ? ' ✓' : ''}</span>}</td>
                      <td className="px-4 py-2">{c.accuracyPct === null ? '—' : `${c.accuracyPct}%`}</td>
                      <td className="px-4 py-2">{c.top.length ? c.top.map(t => `${t.name} (${t.points})`).join(', ') : '—'}</td>
                      <td className="px-4 py-2">{c.mostImproved ? `${c.mostImproved.name} (+${c.mostImproved.gain}%)` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="px-4 pb-4 pt-2 text-xs text-gray-500">Class goal: 80% of students finish each quiz on time.</p>
          </section>
          {report.subjects.length > 0 && (
            <section className="rounded-xl border bg-white p-4" aria-labelledby="sdq-subjects">
              <h2 id="sdq-subjects" className="font-semibold text-gray-900">Correct answers by subject</h2>
              <ul className="mt-3 space-y-2">
                {report.subjects.map(s => (
                  <li key={s.subject} className="text-sm">
                    <div className="flex justify-between"><span className="capitalize">{s.subject}</span><span className="font-semibold">{s.accuracyPct}% <span className="font-normal text-gray-500">of {s.answers}</span></span></div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100"><div className={`h-full rounded-full ${s.accuracyPct >= 70 ? 'bg-green-500' : s.accuracyPct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${s.accuracyPct}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {extra}
        </>
      )}
    </div>
  )
}
