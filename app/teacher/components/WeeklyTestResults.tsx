'use client'

import { useEffect, useState, useCallback } from 'react'

type StudentResult = {
  student_id: number
  student_name: string
  roll_number: string
  test_id: number | null
  status: 'available' | 'submitted' | null
  score: number | null
  max_score: number | null
  submitted_at: string | null
}

type ClassResults = {
  week_start: string
  total_students: number
  submitted_count: number
  avg_score_pct: number | null
  students: StudentResult[]
}

type Props = { classId: number; schoolId: number; grade: string; section: string }

function getWeekStart(offsetWeeks = 0): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff - offsetWeeks * 7)
  return d.toISOString().slice(0, 10)
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WeeklyTestResults({ classId, schoolId, grade, section }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [data, setData] = useState<ClassResults | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (offset: number) => {
    setLoading(true)
    const week = getWeekStart(offset)
    try {
      const r = await fetch(`/api/weekly-test/class-results?school_id=${schoolId}&class_id=${classId}&week_start=${week}`)
      const d = await r.json()
      setData(r.ok ? d : null)
    } catch { setData(null) }
    setLoading(false)
  }, [schoolId, classId])

  useEffect(() => { load(weekOffset) }, [load, weekOffset])

  const submitted  = data?.students.filter(s => s.status === 'submitted') ?? []
  const notStarted = data?.students.filter(s => !s.test_id) ?? []
  const inProgress = data?.students.filter(s => s.test_id && s.status !== 'submitted') ?? []

  function scoreColor(pct: number) {
    if (pct >= 80) return 'text-green-600'
    if (pct >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }
  function scoreBg(pct: number) {
    if (pct >= 80) return 'bg-green-50 border-green-200'
    if (pct >= 50) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div className="space-y-5">
      {/* Header + week navigation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Weekly AI Tests</h2>
            <p className="text-sm text-gray-500">Grade {grade}{section} · AI-generated from covered syllabus</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
              {weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Last week' : `${weekOffset} weeks ago`}
            </span>
            <button
              onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
              disabled={weekOffset === 0}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {data && !loading && (
          <p className="text-xs text-gray-400">Week of {fmt(data.week_start)}</p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : !data ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <p className="text-sm text-yellow-800 font-medium">No test data for this week</p>
          <p className="text-xs text-yellow-600 mt-1">Tests generate when students open their portal</p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Submitted</p>
              <p className="text-3xl font-black text-blue-600">{data.submitted_count}</p>
              <p className="text-xs text-gray-400 mt-1">of {data.total_students} students</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Participation</p>
              <p className={`text-3xl font-black ${scoreColor(Math.round(data.submitted_count / data.total_students * 100))}`}>
                {data.total_students > 0 ? Math.round(data.submitted_count / data.total_students * 100) : 0}%
              </p>
              <p className="text-xs text-gray-400 mt-1">{notStarted.length} not started</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Class Avg</p>
              {data.avg_score_pct !== null ? (
                <>
                  <p className={`text-3xl font-black ${scoreColor(data.avg_score_pct)}`}>{data.avg_score_pct}%</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {data.avg_score_pct >= 80 ? 'Excellent' : data.avg_score_pct >= 50 ? 'Good' : 'Needs attention'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-gray-300">—</p>
                  <p className="text-xs text-gray-400 mt-1">No submissions yet</p>
                </>
              )}
            </div>
          </div>

          {/* Score distribution bar */}
          {submitted.length > 0 && (() => {
            const high = submitted.filter(s => (s.score! / s.max_score!) >= 0.8).length
            const mid  = submitted.filter(s => (s.score! / s.max_score!) >= 0.5 && (s.score! / s.max_score!) < 0.8).length
            const low  = submitted.filter(s => (s.score! / s.max_score!) < 0.5).length
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Score Distribution</p>
                <div className="flex rounded-full overflow-hidden h-4 mb-2">
                  {high > 0 && <div className="bg-green-400 transition-all" style={{ width: `${high / submitted.length * 100}%` }} title={`≥80%: ${high}`} />}
                  {mid  > 0 && <div className="bg-yellow-400 transition-all" style={{ width: `${mid / submitted.length * 100}%` }} title={`50-79%: ${mid}`} />}
                  {low  > 0 && <div className="bg-red-400 transition-all" style={{ width: `${low / submitted.length * 100}%` }} title={`<50%: ${low}`} />}
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />≥80%: {high}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />50–79%: {mid}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />&lt;50%: {low}</span>
                </div>
              </div>
            )
          })()}

          {/* Students table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Student Results</p>
              {notStarted.length > 0 && (
                <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                  {notStarted.length} haven&apos;t started
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-50">
              {data.students.map(s => {
                const pct = s.score !== null && s.max_score ? Math.round(s.score / s.max_score * 100) : null
                return (
                  <div key={s.student_id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-8">{s.roll_number}</span>
                      <span className="text-sm font-medium text-gray-800">{s.student_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.status === 'submitted' && pct !== null ? (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${scoreBg(pct)} ${scoreColor(pct)}`}>
                          {s.score}/{s.max_score} · {pct}%
                        </span>
                      ) : s.status === 'available' ? (
                        <span className="text-xs font-medium text-yellow-600 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full">
                          In progress
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
                          Not started
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Not started section */}
          {notStarted.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-orange-800 mb-2">
                Students who haven&apos;t started ({notStarted.length})
              </p>
              <p className="text-xs text-orange-600 leading-relaxed">
                {notStarted.map(s => s.student_name).join(', ')}
              </p>
              <p className="text-xs text-orange-500 mt-2">Tests generate the first time each student opens their portal</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
