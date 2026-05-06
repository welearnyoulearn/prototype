'use client'

import { useEffect, useState } from 'react'

type Alert = { level: 'critical' | 'warning' | 'info'; message: string; action: string }

type BriefingData = {
  date: string
  attendance: {
    pct: number | null
    present: number
    absent: number
    unmarked_classes: number
    total_classes: number
  }
  leave_pending: number
  uncovered_periods: number
  exams_today: { exam_name: string; grade: string; section: string }[]
  exams_upcoming: { exam_name: string; exam_date: string; grade: string; section: string }[]
  overdue_tasks: number
  chronic_absentees: number
  active_announcements: number
  low_syllabus_classes: number
  alerts: Alert[]
}

const ALERT_STYLES: Record<string, { bg: string; border: string; icon: string; text: string }> = {
  critical: { bg: 'bg-red-50',    border: 'border-red-200',    icon: '🚨', text: 'text-red-800' },
  warning:  { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: '⚠️', text: 'text-amber-800' },
  info:     { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'ℹ️', text: 'text-blue-800' },
}

function AttendanceRing({ pct }: { pct: number | null }) {
  const val = pct ?? 0
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - val / 100)
  const color = val >= 85 ? '#22c55e' : val >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="text-center">
        {pct != null ? (
          <>
            <p className="text-xl font-black text-gray-800">{pct}%</p>
            <p className="text-[10px] text-gray-400 leading-tight">present</p>
          </>
        ) : (
          <p className="text-xs text-gray-400">No data</p>
        )}
      </div>
    </div>
  )
}

export default function DailyBriefing({
  schoolId,
  onNavigate,
}: {
  schoolId: number
  onNavigate?: (key: string) => void
}) {
  const [data, setData]       = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => { load() }, [schoolId])

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/admin/briefing?school_id=${schoolId}`)
      if (!r.ok) throw new Error()
      setData(await r.json())
      setLastRefresh(new Date())
    } catch {
      setError('Failed to load briefing')
    } finally {
      setLoading(false)
    }
  }

  function nav(key: string) {
    onNavigate?.(key)
  }

  function fmtDate(s: string) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Daily Briefing</h2>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Last updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button onClick={load} disabled={loading}
            className={`px-3 py-1.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors ${loading ? 'opacity-50' : ''}`}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {loading && !data && (
        <div className="text-center py-16 text-gray-400 text-sm">Loading briefing…</div>
      )}

      {data && (
        <>
          {/* ── Alerts strip ──────────────────────────────────────── */}
          {data.alerts.length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((alert, i) => {
                const s = ALERT_STYLES[alert.level]
                return (
                  <div key={i}
                    onClick={() => nav(alert.action)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.bg} ${s.border} cursor-pointer hover:opacity-90 transition-opacity`}>
                    <span className="text-base flex-shrink-0">{s.icon}</span>
                    <p className={`text-sm font-medium flex-1 ${s.text}`}>{alert.message}</p>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )
              })}
            </div>
          )}

          {data.alerts.length === 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-100 rounded-xl">
              <span className="text-lg">✅</span>
              <p className="text-sm font-medium text-green-700">All clear — no issues to action today</p>
            </div>
          )}

          {/* ── Main grid ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

            {/* Attendance card */}
            <div className="col-span-1 bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex flex-col items-center gap-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => nav('attendance')}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide self-start">Today's Attendance</p>
              <AttendanceRing pct={data.attendance.pct} />
              <div className="grid grid-cols-2 gap-2 w-full text-center">
                <div className="bg-green-50 rounded-lg py-2">
                  <p className="text-lg font-bold text-green-600">{data.attendance.present}</p>
                  <p className="text-[10px] text-gray-400">Present</p>
                </div>
                <div className="bg-red-50 rounded-lg py-2">
                  <p className="text-lg font-bold text-red-500">{data.attendance.absent}</p>
                  <p className="text-[10px] text-gray-400">Absent</p>
                </div>
              </div>
              {data.attendance.unmarked_classes > 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  ⚠ {data.attendance.unmarked_classes} class{data.attendance.unmarked_classes > 1 ? 'es' : ''} unmarked
                </p>
              )}
            </div>

            {/* Ops quick-stats */}
            <div className="col-span-2 grid grid-cols-2 gap-4">
              {[
                {
                  label: 'Leave Pending',
                  value: data.leave_pending,
                  icon: '📅',
                  action: 'leave-requests',
                  urgent: data.leave_pending > 0,
                  color: data.leave_pending > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white',
                  valueColor: data.leave_pending > 0 ? 'text-amber-600' : 'text-gray-400',
                },
                {
                  label: 'Uncovered Periods',
                  value: data.uncovered_periods,
                  icon: '🚨',
                  action: 'emergency-cover',
                  urgent: data.uncovered_periods > 0,
                  color: data.uncovered_periods > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white',
                  valueColor: data.uncovered_periods > 0 ? 'text-red-600' : 'text-gray-400',
                },
                {
                  label: 'Chronic Absentees',
                  value: data.chronic_absentees,
                  icon: '📉',
                  action: 'attendance',
                  urgent: data.chronic_absentees > 0,
                  color: data.chronic_absentees > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white',
                  valueColor: data.chronic_absentees > 0 ? 'text-amber-600' : 'text-gray-400',
                },
                {
                  label: 'Overdue Tasks',
                  value: data.overdue_tasks,
                  icon: '📋',
                  action: 'academic-analytics',
                  urgent: data.overdue_tasks > 0,
                  color: data.overdue_tasks > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white',
                  valueColor: data.overdue_tasks > 0 ? 'text-orange-600' : 'text-gray-400',
                },
              ].map(k => (
                <div key={k.label}
                  onClick={() => nav(k.action)}
                  className={`rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-all ${k.color}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">{k.icon}</span>
                    {k.urgent && k.value > 0 && (
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </div>
                  <p className={`text-3xl font-black ${k.valueColor}`}>{k.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{k.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Exams today ───────────────────────────────────────── */}
          {data.exams_today.length > 0 && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">📝 Exams Today</p>
              <div className="flex gap-2 flex-wrap">
                {data.exams_today.map((e, i) => (
                  <span key={i} className="text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-medium">
                    {e.exam_name} — {e.grade}-{e.section}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Upcoming exams ────────────────────────────────────── */}
          {data.exams_upcoming.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Upcoming Exams (next 7 days)</h3>
                <button onClick={() => nav('exam-schedule')} className="text-xs text-indigo-600 hover:text-indigo-800">View all →</button>
              </div>
              <div className="divide-y divide-gray-50">
                {data.exams_upcoming.map((e, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-16 text-center bg-indigo-50 rounded-lg py-1">
                      <p className="text-[10px] text-indigo-500 font-semibold uppercase">
                        {new Date(e.exam_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}
                      </p>
                      <p className="text-lg font-black text-indigo-700">
                        {new Date(e.exam_date + 'T00:00:00').getDate()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{e.exam_name}</p>
                      <p className="text-xs text-gray-400">Grade {e.grade}-{e.section}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Bottom stat row ───────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Active Announcements', value: data.active_announcements, action: 'announcements', icon: '📢' },
              { label: 'Low Syllabus Coverage', value: data.low_syllabus_classes, action: 'academic-analytics', icon: '📚', warn: data.low_syllabus_classes > 0 },
              { label: 'Classes Today', value: data.attendance.total_classes, action: 'class-management', icon: '🏫' },
            ].map(k => (
              <div key={k.label}
                onClick={() => nav(k.action)}
                className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all ${k.warn ? 'border-amber-200' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg">{k.icon}</span>
                </div>
                <p className={`text-2xl font-bold ${k.warn ? 'text-amber-600' : 'text-gray-800'}`}>{k.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
