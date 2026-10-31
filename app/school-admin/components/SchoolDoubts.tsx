'use client'

// School Admin → Daily Quiz → Doubts and Star teachers (#435). Read-only: open and overdue doubts per teacher
// (over 2 school days), clarified this month, and this month's WLYL Stars leaders.

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'

type Report = {
  byTeacher: { teacher: string; open: number; overdue: number; explained: number; clarified: number }[]
  starTeachers: { teacher: string; stars: number }[]
}

export default function SchoolDoubts() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/school/doubts-report')
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? 'Could not load doubts'); return d as Report })
      .then(d => { if (!cancelled) setReport(d) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [])
  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
  if (!report) return null
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]" data-testid="school-doubts">
      <section className="overflow-x-auto rounded-xl border bg-white" aria-labelledby="sd-doubts">
        <h2 id="sd-doubts" className="px-4 pt-4 font-semibold text-gray-900">Student doubts</h2>
        <p className="px-4 text-xs text-gray-500">Overdue = waiting more than 2 school days for the teacher.</p>
        {report.byTeacher.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No doubts yet.</p>
        ) : (
          <table className="mt-2 w-full min-w-[480px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-2">Teacher</th><th className="px-4 py-2">Open</th><th className="px-4 py-2">Overdue</th><th className="px-4 py-2">Answered</th><th className="px-4 py-2">Clarified this month</th></tr>
            </thead>
            <tbody className="divide-y">
              {report.byTeacher.map(r => (
                <tr key={r.teacher}>
                  <td className="px-4 py-2 font-medium">{r.teacher}</td>
                  <td className="px-4 py-2">{r.open}</td>
                  <td className={`px-4 py-2 ${r.overdue > 0 ? 'font-semibold text-red-600' : ''}`}>{r.overdue}</td>
                  <td className="px-4 py-2">{r.explained}</td>
                  <td className="px-4 py-2">{r.clarified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="rounded-xl border bg-white p-4" aria-labelledby="sd-stars">
        <h2 id="sd-stars" className="flex items-center gap-1.5 font-semibold text-gray-900"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" /> Star teachers this month</h2>
        <p className="text-xs text-gray-500">WLYL Stars are earned when a student a teacher helped proves they understood.</p>
        {report.starTeachers.length === 0 ? <p className="mt-3 text-sm text-gray-500">No Stars yet this month.</p> : (
          <ol className="mt-3 space-y-1 text-sm">
            {report.starTeachers.map((s, i) => <li key={s.teacher} className="flex justify-between"><span>{i + 1}. {s.teacher}</span><strong>{s.stars} ⭐</strong></li>)}
          </ol>
        )}
      </section>
    </div>
  )
}
