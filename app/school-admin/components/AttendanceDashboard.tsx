'use client'

import { useEffect, useState, useCallback } from 'react'
import { useOfflineAttendance } from '../hooks/useOfflineAttendance'

type Props = { schoolId: number }

// Analytics types
type ChronicAbsentee = {
  student_id: number; name: string; grade: string; section: string
  roll_number: string; absent_days: number; last_absent_date: string
}
type WeeklyTrend = { week_start: string; present: number; total: number }
type ClassSummary  = { class_id: number; grade: string; section: string; present: number; total: number; pct: number | null }

type SubstituteRecord = {
  id: number
  period_number: number
  subject_name: string | null
  grade: string
  section: string
  original_teacher_name: string | null
  substitute_teacher_name: string | null
  time_from: string | null
  time_to: string | null
  date: string
}

type ClassAttendance = {
  id: number
  grade: string
  section: string
  class_teacher_name: string | null
  morning_total: number | null
  morning_present: number | null
  morning_absent: number | null
  morning_late: number | null
  morning_marked_by: string | null
  morning_marked_at: string | null
  afternoon_total: number | null
  afternoon_present: number | null
  afternoon_absent: number | null
  afternoon_late: number | null
  afternoon_marked_by: string | null
  afternoon_marked_at: string | null
}

type StudentRecord = {
  student_id: number
  student_name: string
  roll_number: string
  session: string
  status: 'present' | 'absent' | 'late'
}

function fmt(t: string | null) {
  if (!t) return null
  return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function pct(present: number | null, total: number | null) {
  if (!total || !present) return null
  return Math.round((present / total) * 100)
}

function SessionCell({ total, present, absent, late, markedBy, markedAt, session }: {
  total: number | null
  present: number | null
  absent: number | null
  late: number | null
  markedBy: string | null
  markedAt: string | null
  session: 'morning' | 'afternoon'
}) {
  const marked = !!total
  const pctVal = pct(present, total)
  const time = fmt(markedAt)

  if (!marked) {
    return (
      <div className={`rounded-lg px-3 py-2 border ${session === 'morning' ? 'bg-orange-50/40 border-orange-100' : 'bg-purple-50/40 border-purple-100'}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs">{session === 'morning' ? '🌅' : '🌆'}</span>
          <span className={`text-[10px] font-semibold ${session === 'morning' ? 'text-orange-400' : 'text-purple-400'}`}>
            {session === 'morning' ? 'Morning' : 'Afternoon'}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 font-medium">Not marked</p>
      </div>
    )
  }

  return (
    <div className={`rounded-lg px-3 py-2 border ${session === 'morning' ? 'bg-orange-50 border-orange-200' : 'bg-purple-50 border-purple-200'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs">{session === 'morning' ? '🌅' : '🌆'}</span>
        <span className={`text-[10px] font-semibold ${session === 'morning' ? 'text-orange-600' : 'text-purple-600'}`}>
          {session === 'morning' ? 'Morning' : 'Afternoon'}
        </span>
        {pctVal !== null && (
          <span className={`ml-auto text-[10px] font-bold ${pctVal >= 75 ? 'text-green-600' : pctVal >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
            {pctVal}%
          </span>
        )}
      </div>
      <div className="flex gap-2 text-[10px]">
        <span className="text-green-700 font-semibold">P:{present ?? 0}</span>
        <span className="text-red-600 font-semibold">A:{absent ?? 0}</span>
        {(late ?? 0) > 0 && <span className="text-yellow-600 font-semibold">L:{late}</span>}
      </div>
      {markedBy && (
        <p className="text-[9px] text-gray-400 mt-0.5 truncate" title={markedBy}>
          by {markedBy}{time ? ` · ${time}` : ''}
        </p>
      )}
    </div>
  )
}

export default function AttendanceDashboard({ schoolId }: Props) {
  const { isOnline, queue, retryFailed } = useOfflineAttendance()
  const [tab, setTab]           = useState<'daily' | 'analytics'>('daily')
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])
  const [data, setData]         = useState<ClassAttendance[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [substitutes, setSubstitutes] = useState<SubstituteRecord[]>([])
  // Analytics state
  const [analyticsDays, setAnalyticsDays]   = useState(30)
  const [analytics, setAnalytics]           = useState<{ chronic_absentees: ChronicAbsentee[]; weekly_trend: WeeklyTrend[]; class_summary: ClassSummary[] } | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  // Class detail modal
  const [modalClass, setModalClass]         = useState<ClassAttendance | null>(null)
  const [modalRecords, setModalRecords]     = useState<StudentRecord[]>([])
  const [modalLoading, setModalLoading]     = useState(false)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError('')
    try {
      const [attRes, subRes] = await Promise.all([
        fetch(`/api/attendance?school_id=${schoolId}&date=${d}&view=school`),
        fetch(`/api/substitutes?school_id=${schoolId}&date=${d}`),
      ])
      const attJson = await attRes.json()
      if (!attRes.ok) throw new Error(attJson.error)
      setData(Array.isArray(attJson) ? attJson : [])
      const subJson = await subRes.json()
      setSubstitutes(Array.isArray(subJson) ? subJson : [])
    } catch {
      setError('Failed to load attendance data')
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { load(date) }, [load, date])

  async function loadAnalytics(days: number) {
    setAnalyticsLoading(true); setAnalytics(null)
    try {
      const data = await fetch(`/api/attendance/analytics?school_id=${schoolId}&days=${days}`).then(r => r.json())
      if (data.chronic_absentees) setAnalytics(data)
    } finally { setAnalyticsLoading(false) }
  }

  async function openClassDetail(cls: ClassAttendance) {
    setModalClass(cls)
    setModalRecords([])
    setModalLoading(true)
    try {
      const res = await fetch(`/api/attendance?class_id=${cls.id}&school_id=${schoolId}&date=${date}`)
      const rows = await res.json()
      setModalRecords(Array.isArray(rows) ? rows : [])
    } catch { /* ignore */ }
    finally { setModalLoading(false) }
  }

  const totalClasses = data.length
  const morningDone = data.filter(c => !!c.morning_total).length
  const afternoonDone = data.filter(c => !!c.afternoon_total).length
  const notMarkedAny = data.filter(c => !c.morning_total && !c.afternoon_total).length

  const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div>
      {/* Offline banner */}
      {!isOnline && !modalClass && (
        <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 text-lg">📶</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Offline mode — attendance will sync when reconnected</p>
              {queue.filter(q => q.status === 'pending').length > 0 && (
                <p className="text-xs text-amber-600">{queue.filter(q => q.status === 'pending').length} submission{queue.filter(q => q.status === 'pending').length > 1 ? 's' : ''} queued</p>
              )}
            </div>
          </div>
        </div>
      )}
      {isOnline && queue.length > 0 && !modalClass && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-800">Back online — syncing queued attendance</p>
            <div className="flex gap-3 mt-1">
              {queue.map(q => (
                <span key={q.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  q.status === 'synced' ? 'bg-green-100 text-green-700' :
                  q.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {q.status === 'synced' ? '✓ Synced' : q.status === 'failed' ? '✗ Failed' : '⏳ Pending'}
                </span>
              ))}
            </div>
          </div>
          {queue.some(q => q.status === 'failed') && (
            <button onClick={retryFailed} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg">Retry Failed</button>
          )}
        </div>
      )}

      {/* Header — hidden when viewing class detail */}
      <div className={`flex items-center justify-between mb-5 flex-wrap gap-3 ${modalClass ? 'hidden' : ''}`}>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Attendance</h2>
          <p className="text-sm text-gray-500 mt-0.5">Daily register and attendance analytics</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'daily' && (
            <>
              <input type="date" value={date} max={new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <button onClick={() => load(date)} className="text-sm text-blue-600 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-50">Refresh</button>
            </>
          )}
          {tab === 'analytics' && (
            <div className="flex gap-1">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => { setAnalyticsDays(d); loadAnalytics(d) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${analyticsDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {d}d
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['daily', 'analytics'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); if (t === 'analytics' && !analytics) loadAnalytics(analyticsDays) }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'daily' ? 'Daily View' : 'Analytics'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'daily' && !modalClass && <p className="text-sm text-gray-500 mb-4">{dateFormatted}</p>}

      {tab === 'analytics' && (
        <AttendanceAnalyticsPanel
          analytics={analytics}
          loading={analyticsLoading}
          days={analyticsDays}
        />
      )}

      {/* ── Class Detail Full Page View ── */}
      {tab === 'daily' && modalClass && (
        <div>
          {/* Back header */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => setModalClass(null)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Class {modalClass.grade}-{modalClass.section}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {modalClass.class_teacher_name && ` · CT: ${modalClass.class_teacher_name}`}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Session summary */}
            <div className="grid grid-cols-2 gap-3">
              {/* Morning */}
              <div className={`rounded-xl border p-4 ${modalClass.morning_total ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-sm font-bold text-gray-700 mb-2">🌅 Morning Session</p>
                {modalClass.morning_total ? (
                  <>
                    <div className="flex gap-4 mb-2">
                      <div><p className="text-2xl font-black text-green-600">{modalClass.morning_present ?? 0}</p><p className="text-[10px] text-gray-400">Present</p></div>
                      <div><p className="text-2xl font-black text-red-500">{modalClass.morning_absent ?? 0}</p><p className="text-[10px] text-gray-400">Absent</p></div>
                      <div><p className="text-2xl font-black text-yellow-500">{modalClass.morning_late ?? 0}</p><p className="text-[10px] text-gray-400">Late</p></div>
                      <div><p className="text-2xl font-black text-gray-700">{modalClass.morning_total}</p><p className="text-[10px] text-gray-400">Total</p></div>
                    </div>
                    {modalClass.morning_marked_by && (
                      <p className="text-xs text-gray-500">Marked by <span className="font-semibold text-gray-800">{modalClass.morning_marked_by}</span>
                        {modalClass.morning_marked_at && <span className="text-gray-400"> · {fmt(modalClass.morning_marked_at)}</span>}
                      </p>
                    )}
                  </>
                ) : <p className="text-xs text-gray-400">Not marked yet</p>}
              </div>
              {/* Afternoon */}
              <div className={`rounded-xl border p-4 ${modalClass.afternoon_total ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-sm font-bold text-gray-700 mb-2">🌆 Afternoon Session</p>
                {modalClass.afternoon_total ? (
                  <>
                    <div className="flex gap-4 mb-2">
                      <div><p className="text-2xl font-black text-green-600">{modalClass.afternoon_present ?? 0}</p><p className="text-[10px] text-gray-400">Present</p></div>
                      <div><p className="text-2xl font-black text-red-500">{modalClass.afternoon_absent ?? 0}</p><p className="text-[10px] text-gray-400">Absent</p></div>
                      <div><p className="text-2xl font-black text-yellow-500">{modalClass.afternoon_late ?? 0}</p><p className="text-[10px] text-gray-400">Late</p></div>
                      <div><p className="text-2xl font-black text-gray-700">{modalClass.afternoon_total}</p><p className="text-[10px] text-gray-400">Total</p></div>
                    </div>
                    {modalClass.afternoon_marked_by && (
                      <p className="text-xs text-gray-500">Marked by <span className="font-semibold text-gray-800">{modalClass.afternoon_marked_by}</span>
                        {modalClass.afternoon_marked_at && <span className="text-gray-400"> · {fmt(modalClass.afternoon_marked_at)}</span>}
                      </p>
                    )}
                  </>
                ) : <p className="text-xs text-gray-400">Not marked yet</p>}
              </div>
            </div>

            {/* Student list */}
            {modalLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Loading student records...</div>
            ) : modalRecords.length === 0 ? (
              <div className="py-10 text-center bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-gray-400 text-sm">No attendance marked for this class on this date</p>
              </div>
            ) : (() => {
              const studentMap = new Map<number, { name: string; roll: string; morning: string | null; afternoon: string | null }>()
              modalRecords.forEach(r => {
                if (!studentMap.has(r.student_id)) {
                  studentMap.set(r.student_id, { name: r.student_name, roll: r.roll_number, morning: null, afternoon: null })
                }
                const entry = studentMap.get(r.student_id)!
                if (r.session === 'morning') entry.morning = r.status
                if (r.session === 'afternoon') entry.afternoon = r.status
              })
              const students = Array.from(studentMap.values())
              const absent = students.filter(s => s.morning === 'absent' || s.afternoon === 'absent')
              const late   = students.filter(s => (s.morning === 'late' || s.afternoon === 'late') && s.morning !== 'absent' && s.afternoon !== 'absent')

              const statusBadge = (st: string | null) => {
                if (!st) return <span className="text-[10px] text-gray-300">—</span>
                return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  st === 'present' ? 'bg-green-100 text-green-700' :
                  st === 'absent'  ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
              }

              return (
                <div className="space-y-3">
                  {(absent.length > 0 || late.length > 0) && (
                    <div className="flex gap-3">
                      {absent.length > 0 && (
                        <div className="flex-1 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                          <p className="text-xs font-bold text-red-700 mb-2">Absent · {absent.length}</p>
                          <div className="space-y-1">
                            {absent.map((s, i) => (
                              <p key={i} className="text-xs text-gray-700">{s.name} <span className="text-gray-400">#{s.roll}</span></p>
                            ))}
                          </div>
                        </div>
                      )}
                      {late.length > 0 && (
                        <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                          <p className="text-xs font-bold text-yellow-700 mb-2">Late · {late.length}</p>
                          <div className="space-y-1">
                            {late.map((s, i) => (
                              <p key={i} className="text-xs text-gray-700">{s.name} <span className="text-gray-400">#{s.roll}</span></p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 grid grid-cols-[1fr_80px_80px] text-[10px] font-semibold text-gray-500 uppercase">
                      <span>Student</span>
                      <span className="text-center">Morning</span>
                      <span className="text-center">Afternoon</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {students.map((s, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-2.5">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{s.name}</p>
                            {s.roll && <p className="text-[10px] text-gray-400">#{s.roll}</p>}
                          </div>
                          <div className="text-center">{statusBadge(s.morning)}</div>
                          <div className="text-center">{statusBadge(s.afternoon)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {tab === 'daily' && !modalClass && <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-gray-900">{totalClasses}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Classes</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-orange-700">{morningDone}</p>
          <p className="text-xs text-orange-500 mt-0.5">Morning Marked</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-purple-700">{afternoonDone}</p>
          <p className="text-xs text-purple-500 mt-0.5">Afternoon Marked</p>
        </div>
        <div className={`rounded-xl px-4 py-3 border ${notMarkedAny > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <p className={`text-2xl font-bold ${notMarkedAny > 0 ? 'text-red-700' : 'text-green-700'}`}>{notMarkedAny}</p>
          <p className={`text-xs mt-0.5 ${notMarkedAny > 0 ? 'text-red-500' : 'text-green-600'}`}>
            {notMarkedAny > 0 ? 'Not Marked Yet' : 'All Marked'}
          </p>
        </div>
      </div>

      {/* Substitutes active on selected date */}
      {substitutes.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-800">Substitute Assignments</span>
              <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">{substitutes.length} period{substitutes.length > 1 ? 's' : ''}</span>
            </div>
            <p className="text-xs text-amber-600">Teachers covering for absent staff on this date</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-amber-100/50">
                  <th className="text-left px-4 py-2 font-semibold text-amber-700">Class</th>
                  <th className="text-left px-3 py-2 font-semibold text-amber-700">Period</th>
                  <th className="text-left px-3 py-2 font-semibold text-amber-700">Subject</th>
                  <th className="text-left px-3 py-2 font-semibold text-amber-700">Time</th>
                  <th className="text-left px-3 py-2 font-semibold text-amber-700">Absent Teacher</th>
                  <th className="text-left px-3 py-2 font-semibold text-amber-700">Substitute</th>
                </tr>
              </thead>
              <tbody>
                {substitutes.map(s => (
                  <tr key={s.id} className="border-t border-amber-100 hover:bg-amber-50">
                    <td className="px-4 py-2 font-semibold text-gray-800">Class {s.grade}-{s.section}</td>
                    <td className="px-3 py-2 text-gray-600">P{s.period_number}</td>
                    <td className="px-3 py-2 text-gray-700">{s.subject_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{s.time_from ? `${s.time_from}–${s.time_to}` : '—'}</td>
                    <td className="px-3 py-2 text-red-600">{s.original_teacher_name || '—'}</td>
                    <td className="px-3 py-2 text-green-700 font-medium">{s.substitute_teacher_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alert: classes with no attendance */}
      {notMarkedAny > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">
              {notMarkedAny} class{notMarkedAny > 1 ? 'es have' : ' has'} no attendance marked for today
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              {data.filter(c => !c.morning_total && !c.afternoon_total).map(c => `${c.grade}-${c.section}`).join(', ')}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400">Loading...</div>
      ) : data.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
          <p className="text-gray-400">No classes found for this school</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map(cls => {
            const bothMarked = !!cls.morning_total && !!cls.afternoon_total
            const noneMarked = !cls.morning_total && !cls.afternoon_total
            return (
              <button key={cls.id} onClick={() => openClassDetail(cls)}
                className={`text-left bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer w-full ${
                  bothMarked ? 'border-green-200 hover:border-green-400' :
                  noneMarked ? 'border-red-200 hover:border-red-400' :
                  'border-orange-200 hover:border-orange-400'
                }`}>
                {/* Class header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-lg font-bold text-gray-900">Class {cls.grade}-{cls.section}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">CT: {cls.class_teacher_name || 'Not assigned'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    bothMarked ? 'bg-green-100 text-green-700' :
                    noneMarked ? 'bg-red-100 text-red-600' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {bothMarked ? 'Complete' : noneMarked ? 'Pending' : 'Partial'}
                  </span>
                </div>
                {/* Morning + Afternoon side by side */}
                <div className="grid grid-cols-2 gap-2">
                  <SessionCell session="morning" total={cls.morning_total} present={cls.morning_present} absent={cls.morning_absent} late={cls.morning_late} markedBy={cls.morning_marked_by} markedAt={cls.morning_marked_at} />
                  <SessionCell session="afternoon" total={cls.afternoon_total} present={cls.afternoon_present} absent={cls.afternoon_absent} late={cls.afternoon_late} markedBy={cls.afternoon_marked_by} markedAt={cls.afternoon_marked_at} />
                </div>
                <p className="text-[10px] text-gray-300 mt-2 text-right">Click for details →</p>
              </button>
            )
          })}
        </div>
      )}
      </> /* end daily tab */}

    </div>
  )
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────
function AttendanceAnalyticsPanel({
  analytics, loading, days,
}: {
  analytics: { chronic_absentees: ChronicAbsentee[]; weekly_trend: WeeklyTrend[]; class_summary: ClassSummary[] } | null
  loading: boolean
  days: number
}) {
  if (loading) return (
    <div className="py-20 text-center">
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  )
  if (!analytics) return (
    <div className="py-16 text-center text-gray-400 text-sm">No analytics data available.</div>
  )

  const { chronic_absentees, weekly_trend, class_summary } = analytics
  const maxPresent = Math.max(...weekly_trend.map(w => w.total), 1)
  const classesWithData = class_summary.filter(c => c.total > 0)
  const worstClasses = [...classesWithData].sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100)).slice(0, 5)
  const bestClasses  = [...classesWithData].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 5)

  return (
    <div className="space-y-5">
      {/* Weekly trend chart */}
      {weekly_trend.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-bold text-gray-800 text-sm mb-4">Weekly Attendance Trend — Last {days} days</p>
          <div className="flex items-end gap-2 h-28">
            {weekly_trend.map(w => {
              const p = w.total > 0 ? Math.round((w.present / w.total) * 100) : 0
              const h = Math.max(4, Math.round((p / 100) * 100))
              const label = new Date(w.week_start + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              return (
                <div key={w.week_start} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-gray-500">{p}%</span>
                  <div className="w-full flex items-end justify-center">
                    <div className="w-full max-w-[40px] rounded-t-md transition-all"
                      style={{
                        height: `${h}px`,
                        backgroundColor: p >= 85 ? '#10b981' : p >= 70 ? '#f59e0b' : '#ef4444',
                      }} />
                  </div>
                  <span className="text-[9px] text-gray-400 whitespace-nowrap">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chronic absentees */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <p className="font-bold text-gray-800 text-sm">Chronic Absentees</p>
            <span className="text-xs text-gray-400 ml-auto">3+ absences in {days} days</span>
          </div>
          {chronic_absentees.length === 0 ? (
            <p className="text-xs text-emerald-600 font-medium text-center py-6">No chronic absentees — great attendance!</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {chronic_absentees.map(s => (
                <div key={s.student_id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                    <p className="text-[10px] text-gray-400">Gr.{s.grade}-{s.section} · {s.roll_number}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${s.absent_days >= 7 ? 'text-red-600' : s.absent_days >= 5 ? 'text-orange-500' : 'text-amber-500'}`}>
                      {s.absent_days} days
                    </p>
                    <p className="text-[10px] text-gray-400">Last: {new Date(s.last_absent_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Class performance split */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-bold text-gray-800 text-sm mb-3">Class Attendance (Last {days} days)</p>
          {classesWithData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No data recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {class_summary
                .filter(c => c.total > 0)
                .sort((a, b) => parseInt(a.grade) - parseInt(b.grade))
                .map(c => (
                  <div key={c.class_id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-14 flex-shrink-0">Gr.{c.grade}-{c.section}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${c.pct ?? 0}%`,
                          backgroundColor: (c.pct ?? 0) >= 85 ? '#10b981' : (c.pct ?? 0) >= 70 ? '#f59e0b' : '#ef4444',
                        }} />
                    </div>
                    <span className={`text-xs font-bold w-10 text-right flex-shrink-0 ${(c.pct ?? 0) >= 85 ? 'text-emerald-600' : (c.pct ?? 0) >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                      {c.pct ?? 0}%
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Best vs worst */}
      {classesWithData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <p className="text-xs font-bold text-emerald-700 mb-3">Best Attendance</p>
            <div className="space-y-2">
              {bestClasses.map((c, i) => (
                <div key={c.class_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400 font-bold w-4">#{i+1}</span>
                    <span className="text-sm font-semibold text-gray-800">Grade {c.grade} – Sec {c.section}</span>
                  </div>
                  <span className="text-sm font-black text-emerald-600">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <p className="text-xs font-bold text-red-600 mb-3">Needs Attention</p>
            <div className="space-y-2">
              {worstClasses.map((c, i) => (
                <div key={c.class_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-300 font-bold w-4">#{i+1}</span>
                    <span className="text-sm font-semibold text-gray-800">Grade {c.grade} – Sec {c.section}</span>
                  </div>
                  <span className="text-sm font-black text-red-500">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
