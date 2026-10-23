'use client'

import { useCallback, useEffect, useState } from 'react'

// Which parents have acknowledged a released exam's result for their child, and a Nudge button for
// the ones who haven't. Shared by the class teacher (Teacher portal) and the school admin; the API
// (GET /api/exams/[id]/acknowledgements, POST /api/exams/[id]/nudge-parent) only allows the exam's
// class teacher or an admin, and only for released exams.

type AckRow = { student_id: number; student_name: string; roll_number: string; school_roll_number: number | null; acknowledged_at: string | null; parent_name: string | null; last_nudged_at: string | null }
type AckData = { total: number; acknowledged: number; unacknowledged: number; students: AckRow[] }

function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default function ParentAckTracker({ examId, schoolId }: { examId: number; schoolId: number }) {
  const [data, setData] = useState<AckData | null>(null)
  const [loading, setLoading] = useState(true)
  const [nudging, setNudging] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/exams/${examId}/acknowledgements?school_id=${schoolId}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not load acknowledgements')
      setData(d)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load acknowledgements')
    } finally { setLoading(false) }
  }, [examId, schoolId])

  useEffect(() => {
    const initial = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(initial)
  }, [load])

  async function nudge(studentId: number) {
    setNudging(studentId)
    try {
      await fetch(`/api/exams/${examId}/nudge-parent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, student_id: studentId }),
      })
      await load()
    } finally { setNudging(null) }
  }

  if (loading) return <div className="bg-white rounded-md border border-gray-200 py-8 text-center text-sm text-muted-foreground" data-testid="ack-tracker-loading">Loading acknowledgements…</div>
  if (error || !data) {
    return (
      <div className="bg-white rounded-md border border-gray-200 px-5 py-4 text-sm text-red-600 flex items-center justify-between gap-3" data-testid="ack-tracker-error">
        <span>{error || 'Could not load acknowledgements'}</span>
        <button onClick={() => { setLoading(true); void load() }} className="text-xs font-semibold underline">Retry</button>
      </div>
    )
  }

  const pct = data.total > 0 ? Math.round((data.acknowledged / data.total) * 100) : 0
  // Everyone in the class, with the ones still waiting first so they are not buried under 40 green rows.
  const rows = [...data.students].sort((a, b) => Number(!!a.acknowledged_at) - Number(!!b.acknowledged_at))

  return (
    <div className="bg-white rounded-md border border-gray-200 overflow-hidden" data-testid="ack-tracker">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="font-bold text-gray-800 text-sm">Parent Acknowledgements</p>
        <span data-testid="ack-tracker-summary" className={`text-xs font-bold px-2 py-1 rounded-full ${pct === 100 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
          {data.acknowledged}/{data.total} acknowledged ({pct}%)
        </span>
      </div>
      {data.unacknowledged === 0 && data.total > 0 && (
        <div className="px-5 py-3 text-center text-sm text-emerald-600 font-medium border-b border-gray-50">Every parent has acknowledged this result 🎉</div>
      )}
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50" data-testid="ack-tracker-list">
        {rows.map(s => {
          const done = !!s.acknowledged_at
          return (
            <div key={s.student_id} className="px-5 py-2.5 flex items-center justify-between gap-3" data-testid={`ack-row-${s.student_id}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${done ? 'bg-emerald-500' : 'bg-red-400'}`} />
                <div className="min-w-0">
                  <p className="text-xs text-gray-800 truncate">
                    <span className="font-semibold">{s.student_name}</span>
                    {s.parent_name && <span className="ml-1.5 text-[11px] font-normal text-gray-400">· {s.parent_name}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.school_roll_number != null ? `Roll ${s.school_roll_number}` : s.roll_number}
                    {done
                      ? ` · acknowledged ${timeAgo(s.acknowledged_at!)}`
                      : s.last_nudged_at ? ` · nudged ${timeAgo(s.last_nudged_at)}` : ''}
                  </p>
                </div>
              </div>
              {done ? (
                <span data-testid={`ack-status-${s.student_id}`} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex-shrink-0">✓ Acknowledged</span>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span data-testid={`ack-status-${s.student_id}`} className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">Not yet</span>
                  <button onClick={() => nudge(s.student_id)} disabled={nudging === s.student_id} data-testid={`nudge-parent-${s.student_id}`}
                    className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50">
                    {nudging === s.student_id ? 'Nudging…' : 'Nudge'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
