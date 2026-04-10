'use client'

import { useEffect, useState, useCallback } from 'react'

type Props = { schoolId: number }

type ClassRow = {
  id: number; grade: string; section: string
  class_teacher_name: string | null
  timetable_generated_at: string | null
  timetable_circulated_at: string | null
}

type StudentPerf = {
  id: number; name: string; roll_number: string; rank: number
  attendance_pct: number | null
  task_submission_rate: number | null
  avg_score_pct: number | null
  points: number; doubts: number; engagement: number
}

type ClassPerfData = {
  students: StudentPerf[]
  top_performers: StudentPerf[]
  at_risk: StudentPerf[]
  class_avg: { attendance_pct: number | null; task_submission_rate: number | null; avg_score_pct: number | null; engagement: number | null }
  total_students: number
  period_days: number
}

type ClassHealth = {
  class_id: number; conflict_count: number; no_teacher_count: number
  subjects_unassigned: number; timetable_exists: boolean
}

type Subject = { subject_name: string; teacher_name: string | null; periods_per_week: number }

function Pill({ value, suffix = '%', good = 80, warn = 60 }: { value: number | null; suffix?: string; good?: number; warn?: number }) {
  if (value === null) return <span className="text-xs text-gray-300">—</span>
  const color = value >= good ? 'bg-emerald-100 text-emerald-700' : value >= warn ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{value}{suffix}</span>
}

function EngBar({ value }: { value: number }) {
  const color = value >= 75 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-500">{value}</span>
    </div>
  )
}

export default function ClassAnalytics({ schoolId }: Props) {
  const [classes, setClasses]         = useState<ClassRow[]>([])
  const [health, setHealth]           = useState<Record<number, ClassHealth>>({})
  const [selected, setSelected]       = useState<ClassRow | null>(null)
  const [perf, setPerf]               = useState<ClassPerfData | null>(null)
  const [subjects, setSubjects]       = useState<Subject[]>([])
  const [loading, setLoading]         = useState(true)
  const [perfLoading, setPerfLoading] = useState(false)
  const [days, setDays]               = useState(30)
  const [view, setView]               = useState<'overview' | 'students'>('overview')

  useEffect(() => {
    Promise.all([
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/class-timetable/health?school_id=${schoolId}`).then(r => r.json()),
    ]).then(([cls, hlt]) => {
      const clsList: ClassRow[] = Array.isArray(cls) ? cls : []
      setClasses(clsList)
      const hMap: Record<number, ClassHealth> = {}
      if (Array.isArray(hlt)) hlt.forEach((h: ClassHealth) => { hMap[h.class_id] = h })
      setHealth(hMap)
      if (clsList.length > 0) loadClass(clsList[0], days)
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId])

  const loadClass = useCallback(async (cls: ClassRow, d: number) => {
    setSelected(cls); setPerfLoading(true); setPerf(null); setSubjects([])
    try {
      const [perfData, subData] = await Promise.all([
        fetch(`/api/classes/${cls.id}/performance?school_id=${schoolId}&days=${d}`).then(r => r.json()),
        fetch(`/api/classes/${cls.id}/subjects?school_id=${schoolId}`).then(r => r.json()),
      ])
      setPerf(perfData.students ? perfData : null)
      setSubjects(Array.isArray(subData) ? subData : [])
    } finally { setPerfLoading(false) }
  }, [schoolId])

  function handleDaysChange(d: number) {
    setDays(d)
    if (selected) loadClass(selected, d)
  }

  const byGrade: Record<string, ClassRow[]> = {}
  classes.forEach(c => {
    if (!byGrade[c.grade]) byGrade[c.grade] = []
    byGrade[c.grade].push(c)
  })

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">Loading classes...</div>
  if (classes.length === 0) return (
    <div className="py-16 text-center text-gray-400">
      <p className="text-sm">No classes configured yet.</p>
    </div>
  )

  const h = selected ? health[selected.id] : null
  const avg = perf?.class_avg

  return (
    <div className="flex gap-5">

      {/* ── Sidebar: class list ── */}
      <div className="w-52 flex-shrink-0 space-y-2">
        {Object.entries(byGrade).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([grade, gradeClasses]) => (
          <div key={grade} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Grade {grade}</span>
            </div>
            {gradeClasses.map(c => {
              const ch = health[c.id]
              const dot = !ch ? 'bg-gray-200'
                : ch.conflict_count > 0 ? 'bg-red-500'
                : !ch.timetable_exists ? 'bg-gray-300'
                : (ch.no_teacher_count > 0 || ch.subjects_unassigned > 0) ? 'bg-amber-400'
                : 'bg-emerald-400'
              return (
                <button key={c.id} onClick={() => loadClass(c, days)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-b-0 flex items-center justify-between transition-colors ${selected?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'}`}>
                  <span className={`text-sm font-semibold ${selected?.id === c.id ? 'text-blue-700' : 'text-gray-800'}`}>Section {c.section}</span>
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <p className="text-gray-400 text-sm">Select a class to view analytics</p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Class header */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-gray-900">Grade {selected.grade} – Section {selected.section}</h3>
                {selected.class_teacher_name && (
                  <p className="text-xs text-gray-400 mt-0.5">Class Teacher: {selected.class_teacher_name}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Days filter */}
                <div className="flex gap-1">
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => handleDaysChange(d)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${days === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {(['overview', 'students'] as const).map(v => (
                    <button key={v} onClick={() => setView(v)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${view === v ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {perfLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : !perf ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                <p className="text-gray-400 text-sm">No performance data available for this class yet.</p>
              </div>
            ) : view === 'overview' ? (
              <>
                {/* ── Avg KPI row ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Avg Attendance', value: avg?.attendance_pct ?? null, good: 80, warn: 60 },
                    { label: 'Task Completion', value: avg?.task_submission_rate ?? null, good: 70, warn: 50 },
                    { label: 'Avg Score', value: avg?.avg_score_pct ?? null, good: 60, warn: 40 },
                    { label: 'Engagement Score', value: avg?.engagement ?? null, good: 70, warn: 50 },
                  ].map(({ label, value, good, warn }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      {value === null ? (
                        <p className="text-2xl font-black text-gray-300">—</p>
                      ) : (
                        <p className={`text-2xl font-black ${value >= good ? 'text-emerald-600' : value >= warn ? 'text-amber-500' : 'text-red-500'}`}>{value}%</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">Last {days} days · {perf.total_students} students</p>
                    </div>
                  ))}
                </div>

                {/* ── Top performers + at risk ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="font-bold text-gray-800 text-sm mb-3">Top Performers</p>
                    {perf.top_performers.length === 0 ? (
                      <p className="text-xs text-gray-400">No data yet</p>
                    ) : (
                      <div className="space-y-2.5">
                        {perf.top_performers.map((s, i) => (
                          <div key={s.id} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : 'bg-orange-200 text-orange-700'}`}>{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                              <p className="text-[10px] text-gray-400">{s.roll_number}</p>
                            </div>
                            <EngBar value={s.engagement} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="font-bold text-gray-800 text-sm mb-1">At Risk</p>
                    <p className="text-[10px] text-gray-400 mb-3">Engagement score below 40</p>
                    {perf.at_risk.length === 0 ? (
                      <p className="text-xs text-emerald-600 font-medium">No at-risk students — great!</p>
                    ) : (
                      <div className="space-y-2.5">
                        {perf.at_risk.map(s => (
                          <div key={s.id} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-red-600 text-xs font-bold">{s.name.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                              <div className="flex gap-2 mt-0.5 flex-wrap">
                                {s.attendance_pct !== null && s.attendance_pct < 75 && (
                                  <span className="text-[10px] text-red-500">Att: {s.attendance_pct}%</span>
                                )}
                                {s.task_submission_rate !== null && s.task_submission_rate < 50 && (
                                  <span className="text-[10px] text-amber-500">Tasks: {s.task_submission_rate}%</span>
                                )}
                              </div>
                            </div>
                            <EngBar value={s.engagement} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Subjects + health ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {subjects.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="font-bold text-gray-800 text-sm mb-3">Subjects & Teachers</p>
                      <div className="space-y-2">
                        {subjects.map((s, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                              <p className="text-sm text-gray-700 truncate">{s.subject_name}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {s.teacher_name ? (
                                <span className="text-xs text-gray-500">{s.teacher_name}</span>
                              ) : (
                                <span className="text-xs text-amber-500 font-medium">No teacher</span>
                              )}
                              <span className="text-[10px] text-gray-300">{s.periods_per_week}pw</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {h && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="font-bold text-gray-800 text-sm mb-3">Timetable Status</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Timetable</span>
                          <span className={`text-xs font-semibold ${h.timetable_exists ? 'text-emerald-600' : 'text-gray-400'}`}>{h.timetable_exists ? 'Generated' : 'Not generated'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Teacher conflicts</span>
                          <span className={`text-xs font-semibold ${h.conflict_count > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{h.conflict_count > 0 ? `${h.conflict_count} conflict(s)` : 'None'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Slots without teacher</span>
                          <span className={`text-xs font-semibold ${h.no_teacher_count > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>{h.no_teacher_count > 0 ? h.no_teacher_count : 'None'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Subjects unassigned</span>
                          <span className={`text-xs font-semibold ${h.subjects_unassigned > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>{h.subjects_unassigned > 0 ? h.subjects_unassigned : 'None'}</span>
                        </div>
                        {selected.timetable_circulated_at && (
                          <div className="flex items-center justify-between text-sm pt-1 border-t border-gray-50">
                            <span className="text-gray-600">Last circulated</span>
                            <span className="text-xs text-emerald-600 font-semibold">{new Date(selected.timetable_circulated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ── All students table ── */
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-bold text-gray-800 text-sm">All Students — Last {days} days</p>
                  <span className="text-xs text-gray-400">{perf.total_students} students</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Rank</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Name</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Attendance</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Tasks</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Avg Score</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Points</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Engagement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {perf.students.map(s => (
                        <tr key={s.id} className={`hover:bg-gray-50/50 ${s.engagement < 40 ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">#{s.rank}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{s.name}</p>
                            <p className="text-[10px] text-gray-400">{s.roll_number}</p>
                          </td>
                          <td className="px-4 py-2.5 text-center"><Pill value={s.attendance_pct} good={80} warn={60} /></td>
                          <td className="px-4 py-2.5 text-center"><Pill value={s.task_submission_rate} good={70} warn={50} /></td>
                          <td className="px-4 py-2.5 text-center"><Pill value={s.avg_score_pct} good={60} warn={40} /></td>
                          <td className="px-4 py-2.5 text-center"><span className="text-xs font-semibold text-violet-600">{s.points}</span></td>
                          <td className="px-4 py-2.5 text-center"><EngBar value={s.engagement} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
