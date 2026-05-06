'use client'

import { useEffect, useState } from 'react'

type StudentPerf = {
  id: number
  name: string
  roll_number: string
  rank: number
  engagement: number
  attendance_pct: number | null
  task_submission_rate: number | null
  avg_score_pct: number | null
  points: number
  doubts: number
}

type ClassAvg = {
  attendance_pct: number | null
  task_submission_rate: number | null
  avg_score_pct: number | null
  engagement: number | null
}

type PerfData = {
  students: StudentPerf[]
  top_performers: StudentPerf[]
  at_risk: StudentPerf[]
  class_avg: ClassAvg | null
  total_students: number
  period_days: number
}

type Props = {
  classId: number
  schoolId: number
  grade: string
  section: string
}

const PERIODS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

function Pct({ value, low = 40, mid = 70 }: { value: number | null; low?: number; mid?: number }) {
  if (value === null) return <span className="text-gray-300 text-xs">—</span>
  const color = value >= mid ? 'text-emerald-600' : value >= low ? 'text-amber-600' : 'text-red-500'
  return <span className={`text-sm font-semibold ${color}`}>{value}%</span>
}

function MiniBar({ value, low = 40, mid = 70 }: { value: number | null; low?: number; mid?: number }) {
  if (value === null) return <div className="h-1.5 w-20 bg-gray-100 rounded-full" />
  const color = value >= mid ? 'bg-emerald-500' : value >= low ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  )
}

export default function ClassPerformance({ classId, schoolId, grade, section }: Props) {
  const [data, setData] = useState<PerfData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [view, setView] = useState<'overview' | 'full'>('overview')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/classes/${classId}/performance?school_id=${schoolId}&days=${days}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [classId, schoolId, days])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (!data || !data.students.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
        <p className="text-3xl mb-2">📊</p>
        <p className="text-gray-500 text-sm">No performance data yet. Students need attendance and task records.</p>
      </div>
    )
  }

  const { students, top_performers, at_risk, class_avg } = data
  const medals = ['🥇', '🥈', '🥉']
  const medalBg = ['from-yellow-50 to-amber-50 border-amber-200', 'from-gray-50 to-slate-50 border-slate-200', 'from-orange-50 to-amber-50 border-orange-200']

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            Class Performance — Grade {grade} {section}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{data.total_students} students · Engagement = attendance + tasks + scores + points</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                days === p.days
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Class Average Strip */}
      {class_avg && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Avg Attendance', value: class_avg.attendance_pct },
            { label: 'Avg Submission', value: class_avg.task_submission_rate },
            { label: 'Avg Score', value: class_avg.avg_score_pct },
            { label: 'Avg Engagement', value: class_avg.engagement },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${
                value === null ? 'text-gray-300' :
                value >= 70 ? 'text-emerald-600' : value >= 40 ? 'text-amber-500' : 'text-red-500'
              }`}>
                {value !== null ? `${value}%` : '—'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Top Performers Podium */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🏆</span>
          <h3 className="text-sm font-semibold text-gray-700">Top Performers</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {top_performers.map((s, i) => (
            <div
              key={s.id}
              className={`bg-gradient-to-br border rounded-xl p-4 ${medalBg[i] ?? 'from-gray-50 to-white border-gray-100'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-2xl">{medals[i]}</span>
                  <p className="text-sm font-bold text-gray-800 mt-1 leading-tight">{s.name}</p>
                  <p className="text-xs text-gray-400">Roll {s.roll_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-gray-800">{s.engagement}<span className="text-sm font-normal text-gray-400">%</span></p>
                  <p className="text-xs text-gray-400">Engagement</p>
                </div>
              </div>
              <div className="space-y-1.5 pt-3 border-t border-black/5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Attendance</span>
                  <Pct value={s.attendance_pct} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Tasks Done</span>
                  <Pct value={s.task_submission_rate} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Avg Score</span>
                  <Pct value={s.avg_score_pct} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Points</span>
                  <span className="font-semibold text-indigo-600">{s.points} pts</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* At-Risk Students */}
      {at_risk.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">⚠️</span>
            <h3 className="text-sm font-semibold text-red-700">Students Needing Attention</h3>
            <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
              {at_risk.length} student{at_risk.length > 1 ? 's' : ''} &lt;40% engagement
            </span>
          </div>
          <div className="space-y-2">
            {at_risk.map(s => (
              <div key={s.id} className="bg-white border border-red-100 rounded-xl px-4 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-sm font-bold text-red-500 flex-shrink-0">
                  {s.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400">Roll {s.roll_number}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-400">Attend.</p>
                    <Pct value={s.attendance_pct} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Tasks</p>
                    <Pct value={s.task_submission_rate} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Score</p>
                    <Pct value={s.avg_score_pct} />
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className="text-xs font-bold px-2 py-1 bg-red-100 text-red-600 rounded-lg">
                    {s.engagement}% eng.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Rankings Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Full Class Rankings</h3>
          <button
            onClick={() => setView(v => v === 'overview' ? 'full' : 'overview')}
            className="text-xs text-orange-500 font-medium hover:underline"
          >
            {view === 'overview' ? `Show all ${students.length}` : 'Collapse'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Rank</th>
                <th className="text-left px-3 py-3 font-medium">Student</th>
                <th className="text-center px-3 py-3 font-medium">Attendance</th>
                <th className="text-center px-3 py-3 font-medium">Tasks Done</th>
                <th className="text-center px-3 py-3 font-medium">Avg Score</th>
                <th className="text-center px-3 py-3 font-medium">Points</th>
                <th className="text-center px-3 py-3 font-medium">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(view === 'overview' ? students.slice(0, 10) : students).map((s) => {
                const isTop = s.rank <= 3
                const isAtRisk = s.engagement < 40
                return (
                  <tr
                    key={s.id}
                    className={`transition-colors ${
                      isTop ? 'bg-amber-50/50 hover:bg-amber-50' :
                      isAtRisk ? 'bg-red-50/40 hover:bg-red-50' :
                      'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                        s.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                        s.rank === 2 ? 'bg-gray-100 text-gray-600' :
                        s.rank === 3 ? 'bg-orange-100 text-orange-700' :
                        isAtRisk ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {s.rank <= 3 ? medals[s.rank - 1] : s.rank}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">Roll {s.roll_number}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Pct value={s.attendance_pct} />
                        <MiniBar value={s.attendance_pct} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Pct value={s.task_submission_rate} />
                        <MiniBar value={s.task_submission_rate} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Pct value={s.avg_score_pct} />
                        <MiniBar value={s.avg_score_pct} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-semibold text-indigo-600">{s.points}</span>
                      {s.doubts > 0 && (
                        <p className="text-xs text-gray-400">{s.doubts} doubts</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              s.engagement >= 70 ? 'bg-emerald-500' :
                              s.engagement >= 40 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${s.engagement}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${
                          s.engagement >= 70 ? 'text-emerald-600' :
                          s.engagement >= 40 ? 'text-amber-600' : 'text-red-500'
                        }`}>{s.engagement}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {view === 'overview' && students.length > 10 && (
          <div className="px-5 py-3 border-t border-gray-100 text-center">
            <button
              onClick={() => setView('full')}
              className="text-xs text-orange-500 font-medium hover:underline"
            >
              + {students.length - 10} more students
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
