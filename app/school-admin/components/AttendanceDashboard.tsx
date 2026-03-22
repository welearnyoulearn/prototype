'use client'

import { useEffect, useState, useCallback } from 'react'

type Props = { schoolId: number }

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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState<ClassAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [substitutes, setSubstitutes] = useState<SubstituteRecord[]>([])

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

  const totalClasses = data.length
  const morningDone = data.filter(c => !!c.morning_total).length
  const afternoonDone = data.filter(c => !!c.afternoon_total).length
  const notMarkedAny = data.filter(c => !c.morning_total && !c.afternoon_total).length

  const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Attendance Dashboard</h2>
          <p className="text-sm text-gray-500 mt-0.5">School-wide attendance overview — all classes at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button onClick={() => load(date)} className="text-sm text-blue-600 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-50">
            Refresh
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">{dateFormatted}</p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
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
              <div key={cls.id} className={`bg-white rounded-xl border p-4 ${
                bothMarked ? 'border-green-200' :
                noneMarked ? 'border-red-200' :
                'border-orange-200'
              }`}>
                {/* Class header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      Class {cls.grade}-{cls.section}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      CT: {cls.class_teacher_name || 'Not assigned'}
                    </p>
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
                  <SessionCell
                    session="morning"
                    total={cls.morning_total}
                    present={cls.morning_present}
                    absent={cls.morning_absent}
                    late={cls.morning_late}
                    markedBy={cls.morning_marked_by}
                    markedAt={cls.morning_marked_at}
                  />
                  <SessionCell
                    session="afternoon"
                    total={cls.afternoon_total}
                    present={cls.afternoon_present}
                    absent={cls.afternoon_absent}
                    late={cls.afternoon_late}
                    markedBy={cls.afternoon_marked_by}
                    markedAt={cls.afternoon_marked_at}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
