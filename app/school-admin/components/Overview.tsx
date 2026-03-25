'use client'

import { useEffect, useState } from 'react'

type Props = { schoolId: number; onNavigate?: (key: string) => void }

type Stats = {
  teachers: number
  students: number
  classes: number
  pendingLeaves: number
}

type UncoveredPeriod = {
  class_id: number
  grade: string
  section: string
  period_number: number
  subject_name: string | null
  time_from: string
  time_to: string
  teacher_id: number
  teacher_name: string
  department: string
  leave_request_id: number
  leave_type: string
}

export default function Overview({ schoolId, onNavigate }: Props) {
  const [stats, setStats] = useState<Stats>({ teachers: 0, students: 0, classes: 0, pendingLeaves: 0 })
  const [loading, setLoading] = useState(true)
  const [uncoveredPeriods, setUncoveredPeriods] = useState<UncoveredPeriod[]>([])

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toISOString().split('T')[0]
      try {
        const [t, s, c, l, unc] = await Promise.all([
          fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/students?school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
          fetch(`/api/leave-requests?school_id=${schoolId}&status=pending`).then(r => r.json()),
          fetch(`/api/substitutes?school_id=${schoolId}&date=${todayStr}&uncovered=true`).then(r => r.json()),
        ])
        setStats({
          teachers: Array.isArray(t) ? t.length : 0,
          students: Array.isArray(s) ? s.length : 0,
          classes: Array.isArray(c) ? c.length : 0,
          pendingLeaves: Array.isArray(l) ? l.length : 0,
        })
        setUncoveredPeriods(Array.isArray(unc) ? unc : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [schoolId])

  const cards = [
    { label: 'Total Teachers', value: stats.teachers, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', nav: 'teachers', icon: '👩‍🏫' },
    { label: 'Total Students', value: stats.students, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', nav: 'students', icon: '🎒' },
    { label: 'Classes', value: stats.classes, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', nav: 'class-management', icon: '🏫' },
    { label: 'Pending Leaves', value: stats.pendingLeaves, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', nav: 'leave-requests', icon: '📋' },
  ]

  if (loading) return <div className="py-12 text-center text-gray-400">Loading overview...</div>

  // Group uncovered periods by teacher for display
  const uncoveredByTeacher = new Map<number, { name: string; leave_type: string; periods: UncoveredPeriod[] }>()
  for (const p of uncoveredPeriods) {
    if (!uncoveredByTeacher.has(p.teacher_id)) {
      uncoveredByTeacher.set(p.teacher_id, { name: p.teacher_name, leave_type: p.leave_type, periods: [] })
    }
    uncoveredByTeacher.get(p.teacher_id)!.periods.push(p)
  }

  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Overview</h2>
      <p className="text-sm text-gray-400 mb-6">Click any card to navigate</p>

      {/* ── Uncovered periods alert ── */}
      {uncoveredPeriods.length > 0 && (
        <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-2xl overflow-hidden">
          {/* Alert header */}
          <div className="px-5 py-4 bg-red-500 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-sm">
                  {uncoveredPeriods.length} uncovered period{uncoveredPeriods.length > 1 ? 's' : ''} today — {todayLabel}
                </p>
                <p className="text-red-100 text-xs mt-0.5">
                  {uncoveredByTeacher.size} teacher{uncoveredByTeacher.size > 1 ? 's are' : ' is'} on approved leave with no substitute assigned
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate?.('leave-requests')}
              className="bg-white text-red-600 hover:bg-red-50 font-semibold text-xs px-4 py-2 rounded-lg transition-colors flex-shrink-0">
              Assign Substitutes →
            </button>
          </div>

          {/* Per-teacher breakdown */}
          <div className="px-5 py-4 space-y-4">
            {Array.from(uncoveredByTeacher.values()).map(({ name, leave_type, periods }) => (
              <div key={name}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-red-700 font-bold text-[10px]">{name.charAt(0)}</span>
                  </div>
                  <p className="text-sm font-semibold text-red-800">{name}</p>
                  <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">{leave_type}</span>
                  <span className="text-xs text-red-500">{periods.length} period{periods.length > 1 ? 's' : ''} uncovered</span>
                </div>
                <div className="flex gap-2 flex-wrap ml-8">
                  {periods.map((p, i) => (
                    <div key={`${p.class_id}-${p.period_number}-${i}`}
                      className="flex items-center gap-1.5 bg-white border border-red-200 rounded-lg px-3 py-1.5 text-xs">
                      <span className="font-bold text-gray-700">P{p.period_number}</span>
                      {p.subject_name && <span className="text-gray-600">{p.subject_name}</span>}
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-600 font-medium">Cl.{p.grade}-{p.section}</span>
                      {p.time_from && <span className="text-gray-400">{p.time_from}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(card => (
          <button
            key={card.label}
            onClick={() => onNavigate?.(card.nav)}
            className={`rounded-xl border ${card.border} ${card.bg} p-5 text-left hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer group`}
          >
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm text-gray-500">{card.label}</p>
              <span className="text-lg opacity-60 group-hover:opacity-100 transition-opacity">{card.icon}</span>
            </div>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to view →</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-700 mb-3">Quick Info</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            {stats.teachers} teacher{stats.teachers !== 1 ? 's' : ''} onboarded
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            {stats.students} student{stats.students !== 1 ? 's' : ''} enrolled
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            {stats.classes} class{stats.classes !== 1 ? 'es' : ''} configured
          </li>
          {stats.pendingLeaves > 0 && (
            <li className="flex items-center gap-2 text-orange-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              {stats.pendingLeaves} leave request{stats.pendingLeaves !== 1 ? 's' : ''} awaiting review
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
