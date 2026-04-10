'use client'

import { useEffect, useState } from 'react'

type Summary = {
  total_students: number
  with_phone: number
  with_name: number
  with_email: number
  phone_coverage_pct: number
}

type AckStat = {
  exam_id: number
  exam_name: string
  exam_date: string | null
  exam_type: string
  grade: string
  section: string
  total_students: number
  acknowledged_count: number
  pending_count: number
  ack_pct: number
}

type ClassCoverage = {
  class_id: number
  grade: string
  section: string
  total_students: number
  with_phone: number
  with_email: number
  phone_pct: number
}

type UnackStudent = {
  student_id: number
  name: string
  grade: string
  section: string
  roll_number: string
  parent_name: string | null
  parent_phone: string | null
  unack_exams: number
}

type EngagementData = {
  summary: Summary
  ack_stats: AckStat[]
  class_coverage: ClassCoverage[]
  unacknowledged: UnackStudent[]
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test', midterm: 'Midterm', final: 'Final',
  quarterly: 'Quarterly', half_yearly: 'Half-Yearly', annual: 'Annual',
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
        {pct}%
      </span>
    </div>
  )
}

export default function ParentEngagement({ schoolId }: { schoolId: number }) {
  const [data, setData]       = useState<EngagementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState<'overview' | 'coverage' | 'unack'>('overview')

  useEffect(() => { load() }, [schoolId])

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/parent/engagement?school_id=${schoolId}`)
      if (!r.ok) throw new Error()
      setData(await r.json())
    } catch {
      setError('Failed to load parent engagement data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
  if (error)   return <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
  if (!data)   return null

  const { summary, ack_stats, class_coverage, unacknowledged } = data

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Parent Engagement</h2>
          <p className="text-sm text-gray-400 mt-0.5">Contact coverage, exam acknowledgements and pending parents</p>
        </div>
        <button onClick={load}
          className="px-3 py-1.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Students',    value: summary.total_students,   color: 'text-gray-800' },
          { label: 'Phone Registered',  value: summary.with_phone,       color: 'text-green-600' },
          { label: 'Phone Coverage',    value: `${summary.phone_coverage_pct}%`, color: summary.phone_coverage_pct >= 80 ? 'text-green-600' : summary.phone_coverage_pct >= 50 ? 'text-amber-500' : 'text-red-500' },
          { label: 'Unack. Results',    value: unacknowledged.length,    color: unacknowledged.length > 0 ? 'text-red-500' : 'text-green-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([
          ['overview', 'Exam Acknowledgements'],
          ['coverage', 'Contact Coverage'],
          ['unack',    'Pending Parents'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
            {key === 'unack' && unacknowledged.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unacknowledged.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── EXAM ACK TAB ──────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Exam Result Acknowledgements</h3>
            <p className="text-xs text-gray-400">Last 10 published exams</p>
          </div>
          {ack_stats.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No published exams yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ack_stats.map(exam => (
                <div key={exam.exam_id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-36 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{exam.exam_name}</p>
                    <p className="text-xs text-gray-400">{exam.grade}-{exam.section} · {EXAM_TYPE_LABELS[exam.exam_type] ?? exam.exam_type}</p>
                  </div>
                  <div className="flex-1">
                    <CoverageBar pct={exam.ack_pct} />
                  </div>
                  <div className="text-right w-32 flex-shrink-0">
                    <p className="text-xs text-gray-600">{exam.acknowledged_count}/{exam.total_students} acknowledged</p>
                    {exam.pending_count > 0 && (
                      <p className="text-[10px] text-red-500 font-medium">{exam.pending_count} pending</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COVERAGE TAB ─────────────────────────────────────────── */}
      {tab === 'coverage' && (
        <div className="space-y-4">
          {/* School-wide contact info */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'With Parent Name',  value: summary.with_name,  total: summary.total_students },
              { label: 'With Phone Number', value: summary.with_phone, total: summary.total_students },
              { label: 'With Email',        value: summary.with_email, total: summary.total_students },
            ].map(k => {
              const pct = k.total > 0 ? Math.round((k.value / k.total) * 100) : 0
              return (
                <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-gray-400 mb-2">{k.label}</p>
                  <CoverageBar pct={pct} />
                  <p className="text-xs text-gray-400 mt-1">{k.value} of {k.total} students</p>
                </div>
              )
            })}
          </div>

          {/* Per-class coverage table */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Coverage by Class</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Class', 'Students', 'Phone Coverage', 'Email Coverage'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {class_coverage.map(cls => {
                    const emailPct = cls.total_students > 0 ? Math.round((cls.with_email / cls.total_students) * 100) : 0
                    return (
                      <tr key={cls.class_id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-gray-800">{cls.grade}-{cls.section}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{cls.total_students}</td>
                        <td className="px-4 py-3 w-48">
                          <CoverageBar pct={cls.phone_pct} />
                          <p className="text-[10px] text-gray-400 mt-0.5">{cls.with_phone}/{cls.total_students}</p>
                        </td>
                        <td className="px-4 py-3 w-48">
                          <CoverageBar pct={emailPct} />
                          <p className="text-[10px] text-gray-400 mt-0.5">{cls.with_email}/{cls.total_students}</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── UNACKNOWLEDGED TAB ───────────────────────────────────── */}
      {tab === 'unack' && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Parents Who Haven't Acknowledged Results</h3>
            <span className="text-xs text-gray-400">{unacknowledged.length} students</span>
          </div>
          {unacknowledged.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-gray-500 text-sm font-medium">All parents have acknowledged results</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Student', 'Class', 'Roll No', 'Parent Name', 'Parent Phone', 'Pending Exams'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unacknowledged.map(s => (
                    <tr key={s.student_id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                          {s.grade}-{s.section}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{s.roll_number ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.parent_name ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {s.parent_phone ? (
                          <a href={`tel:${s.parent_phone}`}
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium transition-colors">
                            {s.parent_phone}
                          </a>
                        ) : (
                          <span className="text-red-400 text-xs">No phone</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.unack_exams >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {s.unack_exams} exam{s.unack_exams > 1 ? 's' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
