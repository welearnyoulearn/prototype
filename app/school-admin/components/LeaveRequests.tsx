'use client'

import { useEffect, useState, useCallback } from 'react'

type Props = { schoolId: number }

type LeaveRequest = {
  id: number
  teacher_id: number
  teacher_name: string
  employee_id: string
  department: string
  leave_type: string
  start_date: string
  end_date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
}

type TimetableSlot = {
  id: number
  class_id: number
  grade: string
  section: string
  day_of_week: string
  period_number: number
  time_from: string
  time_to: string
  subject_name: string | null
  teacher_name: string | null
}

type FreeTeacher = {
  id: number
  name: string
  employee_id: string
  department: string
  subject: string
}

type SubstituteRow = {
  class_id: number
  grade: string
  section: string
  date: string
  day_of_week: string
  period_number: number
  subject_name: string | null
  time_from: string
  time_to: string
  substitute_teacher_id: number | null
  substitute_teacher_subject?: string | null
  substitute_teacher_department?: string | null
}

// Normalise to YYYY-MM-DD regardless of whether Postgres sent a full ISO timestamp
function toDateStr(d: string) { return d.slice(0, 10) }

// Returns an array of YYYY-MM-DD date strings between start and end (inclusive)
function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(toDateStr(start) + 'T00:00:00')
  const last = new Date(toDateStr(end) + 'T00:00:00')
  while (cur <= last) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function dayName(dateStr: string) {
  return new Date(toDateStr(dateStr) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

function fmtDate(dateStr: string) {
  return new Date(toDateStr(dateStr) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysBetween(start: string, end: string) {
  return Math.ceil((new Date(toDateStr(end)).getTime() - new Date(toDateStr(start)).getTime()) / 86400000) + 1
}

// ── Substitute assignment modal ────────────────────────────────────────────────
function SubstituteModal({
  leave,
  schoolId,
  onClose,
  onApproved,
}: {
  leave: LeaveRequest
  schoolId: number
  onClose: () => void
  onApproved: (id: number) => void
}) {
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [subs, setSubs] = useState<SubstituteRow[]>([])
  const [freeTeacherCache, setFreeTeacherCache] = useState<Record<string, FreeTeacher[]>>({})
  const [teacherNameMap, setTeacherNameMap] = useState<Record<number, string>>({})
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'timetable'>('list')
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiSuggLoading, setAiSuggLoading] = useState(false)

  // Load teacher's timetable periods (all classes they teach)
  useEffect(() => {
    async function load() {
      setLoadingSlots(true)
      try {
        const res = await fetch(`/api/class-timetable?school_id=${schoolId}&teacher_id=${leave.teacher_id}`)
        const data = await res.json()
        const teacherSlots: TimetableSlot[] = Array.isArray(data) ? data.filter((s: TimetableSlot) => !s.teacher_name || true) : []

        // Build substitute rows: for each leave date × each teacher period on that day
        const dates = dateRange(leave.start_date, leave.end_date)
        const rows: SubstituteRow[] = []
        for (const date of dates) {
          const dow = dayName(date)
          const daySlots = teacherSlots.filter(s => s.day_of_week === dow)
          for (const slot of daySlots) {
            rows.push({
              class_id: slot.class_id,
              grade: slot.grade,
              section: slot.section,
              date,
              day_of_week: dow,
              period_number: slot.period_number,
              subject_name: slot.subject_name,
              time_from: slot.time_from,
              time_to: slot.time_to,
              substitute_teacher_id: null,
            })
          }
        }
        setSlots(teacherSlots)
        setSubs(rows)
      } catch {
        setError('Failed to load teacher timetable')
      } finally {
        setLoadingSlots(false)
      }
    }
    load()
  }, [leave, schoolId])

  async function loadFreeTeachers(day: string, period: number, date?: string) {
    const key = date ? `${date}_${period}` : `${day}_${period}`
    if (freeTeacherCache[key]) return
    try {
      const dateParam = date ? `&date=${date}` : ''
      const res = await fetch(
        `/api/substitutes?school_id=${schoolId}&day=${encodeURIComponent(day)}&period=${period}&exclude_teacher=${leave.teacher_id}${dateParam}`
      )
      const data: FreeTeacher[] = await res.json()
      if (Array.isArray(data)) {
        setFreeTeacherCache(prev => ({ ...prev, [key]: data }))
        setTeacherNameMap(prev => {
          const next = { ...prev }
          data.forEach(t => { next[t.id] = t.name })
          return next
        })
      } else {
        setFreeTeacherCache(prev => ({ ...prev, [key]: [] }))
      }
    } catch { /* ignore */ }
  }

  async function loadAiSuggestion() {
    setAiSuggLoading(true)
    try {
      const res = await fetch('/api/ai/leave-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, leave_request_id: leave.id }),
      })
      const data = await res.json()
      setAiSuggestion(data.suggestion || 'Could not generate suggestion.')
    } catch { setAiSuggestion('Could not generate suggestion.') }
    setAiSuggLoading(false)
  }

  function setSubTeacher(date: string, period: number, teacherId: number | null) {
    setSubs(prev => prev.map(r =>
      r.date === date && r.period_number === period
        ? { ...r, substitute_teacher_id: teacherId }
        : r
    ))
  }

  async function handleSaveAndApprove() {
    setSaving(true)
    setError('')
    try {
      // 1. Save substitute assignments
      if (subs.some(s => s.substitute_teacher_id)) {
        const res = await fetch('/api/substitutes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            leave_request_id: leave.id,
            original_teacher_id: leave.teacher_id,
            assignments: subs,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error || 'Failed to save substitutes')
        }
      }
      // 2. Approve leave
      const res2 = await fetch(`/api/leave-requests/${leave.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (!res2.ok) throw new Error('Failed to approve leave')
      onApproved(leave.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const dates = dateRange(leave.start_date, leave.end_date)
  const assignedCount = subs.filter(s => s.substitute_teacher_id).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Assign Substitutes & Approve Leave</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {leave.teacher_name} · {leave.leave_type} · {fmtDate(leave.start_date)} – {fmtDate(leave.end_date)} ({daysBetween(leave.start_date, leave.end_date)} day{daysBetween(leave.start_date, leave.end_date) !== 1 ? 's' : ''})
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {/* AI Coverage Suggestion */}
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
            <span className="text-base flex-shrink-0 mt-0.5">✨</span>
            <div className="flex-1">
              {aiSuggestion ? (
                <>
                  <p className="text-xs font-bold text-amber-800 mb-1">AI Coverage Suggestion</p>
                  <p className="text-sm text-amber-800 leading-relaxed">{aiSuggestion}</p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-amber-700">Let AI suggest the best coverage arrangement for this leave</p>
                  <button
                    onClick={loadAiSuggestion}
                    disabled={aiSuggLoading}
                    className="flex-shrink-0 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-semibold"
                  >
                    {aiSuggLoading ? 'Analysing...' : 'AI Suggest'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* View toggle */}
          {!loadingSlots && subs.length > 0 && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-4">
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                List View
              </button>
              <button onClick={() => setViewMode('timetable')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'timetable' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Timetable Preview
              </button>
            </div>
          )}

          {loadingSlots ? (
            <div className="py-12 text-center text-gray-400">Loading teacher&apos;s timetable...</div>
          ) : subs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">No classes to cover</p>
              <p className="text-gray-400 text-sm mt-1">{leave.teacher_name} has no scheduled periods during this leave period.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                <strong>Instructions:</strong> Assign a substitute teacher for each period shown below.
                Only teachers with <span className="font-semibold">no class in that time slot</span> are listed — no conflicts possible.
              </div>

              {/* Timetable preview mode */}
              {viewMode === 'timetable' && (() => {
                const allPeriods = [...new Set(subs.map(s => s.period_number))].sort((a, b) => a - b)
                return (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-20">Period</th>
                          {dates.map(date => (
                            <th key={date} className="bg-slate-800 text-slate-300 px-2 py-2.5 text-center font-medium min-w-[120px]">
                              <span className="block text-white font-semibold">{dayName(date).slice(0, 3)}</span>
                              <span className="text-slate-400 font-normal">{fmtDate(date)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allPeriods.map(pNum => (
                          <tr key={pNum} className="border-b border-gray-100">
                            <td className="px-3 py-2 bg-gray-50 border-r border-gray-100 font-semibold text-gray-600 text-center">P{pNum}</td>
                            {dates.map(date => {
                              const row = subs.find(s => s.date === date && s.period_number === pNum)
                              if (!row) return (
                                <td key={date} className="px-2 py-2 border-r border-gray-100 last:border-r-0 text-center text-gray-200">—</td>
                              )
                              const assigned = !!row.substitute_teacher_id
                              const subName = row.substitute_teacher_id ? teacherNameMap[row.substitute_teacher_id] : undefined
                              return (
                                <td key={date} className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 align-top`}>
                                  <div className={`rounded-lg px-2 py-2 min-h-[56px] ${assigned ? 'bg-amber-50 border-2 border-amber-300' : 'bg-red-50 border border-red-200'}`}>
                                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                      {assigned ? (
                                        <p className="font-semibold text-gray-400 line-through text-xs leading-tight">
                                          {row.subject_name || '—'}
                                        </p>
                                      ) : (
                                        <p className="font-semibold text-gray-800 text-xs leading-tight">
                                          {row.subject_name || '—'}
                                        </p>
                                      )}
                                      {assigned
                                        ? <span className="text-[8px] bg-amber-400 text-white px-1 py-0.5 rounded font-bold">ASSIGNED</span>
                                        : <span className="text-[8px] bg-red-400 text-white px-1 py-0.5 rounded font-bold">PENDING</span>
                                      }
                                    </div>
                                    {assigned && (
                                      <p className="text-[10px] text-amber-700 font-semibold leading-tight truncate">
                                        {row.substitute_teacher_subject || row.substitute_teacher_department || row.subject_name || '—'}
                                      </p>
                                    )}
                                    <p className="text-[10px] text-gray-500">Class {row.grade}-{row.section}</p>
                                    <p className="text-[10px] text-gray-400">{row.time_from}–{row.time_to}</p>
                                    {assigned && (
                                      <p className="text-[10px] text-amber-700 font-semibold mt-0.5 truncate">
                                        {subName || `Teacher #${row.substitute_teacher_id}`}
                                      </p>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {/* List mode */}
              {viewMode === 'list' && dates.map(date => {
                const dow = dayName(date)
                const dayRows = subs.filter(s => s.date === date)
                if (dayRows.length === 0) return (
                  <div key={date} className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-600">{fmtDate(date)} <span className="text-gray-400 font-normal">({dow})</span></p>
                    <p className="text-xs text-gray-400 mt-1">No classes scheduled for this teacher on {dow}</p>
                  </div>
                )
                return (
                  <div key={date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-800">
                        {fmtDate(date)} <span className="text-gray-500 font-normal">· {dow}</span>
                      </p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {dayRows.map((row, rowIdx) => {
                        const key = `${row.date}_${row.period_number}`
                        const freeList = freeTeacherCache[key] || []
                        return (
                          <div key={`${row.date}_${row.period_number}_${row.class_id}_${rowIdx}`}
                            className="px-4 py-3 flex items-center gap-4 flex-wrap">
                            {/* Period info */}
                            <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
                              <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                P{row.period_number}
                              </div>
                              <div className="min-w-0">
                                {row.substitute_teacher_id ? (
                                  <div className="flex items-center gap-1.5 truncate">
                                    <p className="text-sm font-semibold text-gray-400 line-through truncate">
                                      {row.subject_name || 'Free Period'}
                                    </p>
                                    <p className="text-sm font-semibold text-amber-700 truncate">
                                      {row.substitute_teacher_subject || row.substitute_teacher_department || row.subject_name || 'Free Period'}
                                    </p>
                                    <span className="text-xs text-gray-500 flex-shrink-0">— Class {row.grade}-{row.section}</span>
                                  </div>
                                ) : (
                                  <p className="text-sm font-semibold text-gray-800 truncate">
                                    {row.subject_name || 'Free Period'} — Class {row.grade}-{row.section}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400">{row.time_from} – {row.time_to}</p>
                              </div>
                            </div>

                            {/* Arrow */}
                            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>

                            {/* Substitute picker */}
                            <div className="flex-1 min-w-[200px]">
                              <select
                                value={row.substitute_teacher_id ?? ''}
                                onFocus={() => loadFreeTeachers(dow, row.period_number, row.date)}
                                onChange={e => setSubTeacher(row.date, row.period_number, e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                              >
                                <option value="">— Select substitute —</option>
                                {freeList.map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}{t.employee_id ? ` (${t.employee_id})` : ''}{t.department ? ` · ${t.department}` : ''}
                                  </option>
                                ))}
                                {freeList.length === 0 && !freeTeacherCache[key] && (
                                  <option disabled>Loading free teachers...</option>
                                )}
                                {freeList.length === 0 && freeTeacherCache[key] && (
                                  <option disabled>No free teachers available</option>
                                )}
                              </select>
                            </div>

                            {/* Status indicator */}
                            {row.substitute_teacher_id ? (
                              <span className="text-green-600 text-xs font-semibold flex-shrink-0">Assigned</span>
                            ) : (
                              <span className="text-orange-500 text-xs flex-shrink-0">Unassigned</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <div className="text-sm text-gray-500">
            {subs.length > 0 && (
              <span>{assignedCount} of {subs.length} periods assigned</span>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={handleSaveAndApprove}
              disabled={saving || loadingSlots}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : `Approve Leave${assignedCount > 0 ? ` & Save ${assignedCount} Substitute${assignedCount > 1 ? 's' : ''}` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LeaveRequests({ schoolId }: Props) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [substituteModal, setSubstituteModal] = useState<LeaveRequest | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leave-requests?school_id=${schoolId}`)
      const data = await res.json()
      setRequests(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load leave requests')
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { loadData() }, [loadData])

  async function handleReject(id: number) {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected', reviewed_at: data.reviewed_at } : r))
    } catch {
      setError('Failed to reject leave request')
    } finally {
      setActionLoading(null)
    }
  }

  function handleApproved(id: number) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved', reviewed_at: new Date().toISOString() } : r))
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  const statusBadge = (status: string) => {
    if (status === 'pending') return 'bg-orange-100 text-orange-700'
    if (status === 'approved') return 'bg-green-100 text-green-700'
    return 'bg-red-100 text-red-600'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Teacher Leave Requests</h2>
          <p className="text-sm text-gray-500 mt-0.5">Approve or reject leave applications. Approving shows substitute assignment flow.</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">Teachers submit from their portal</span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(filter === s ? 'all' : s)}
            className={`rounded-xl border p-4 text-left transition-all ${filter === s ? 'ring-2 ring-offset-1 ring-blue-400 shadow-sm' : 'hover:shadow-sm'} ${
              s === 'pending'  ? 'border-orange-100 bg-orange-50' :
              s === 'approved' ? 'border-green-100 bg-green-50' :
              'border-red-100 bg-red-50'
            }`}
          >
            <p className="text-xs text-gray-500 capitalize mb-1">{s}</p>
            <p className={`text-3xl font-bold ${
              s === 'pending' ? 'text-orange-600' :
              s === 'approved' ? 'text-green-600' : 'text-red-600'
            }`}>
              {requests.filter(r => r.status === s).length}
            </p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-400">{filter === 'all' ? 'No leave requests yet' : `No ${filter} requests`}</p>
            {filter === 'all' && <p className="text-gray-300 text-sm mt-1">Teachers submit requests from their Teacher portal</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Teacher</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Leave Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Duration</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Reason</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900">{r.teacher_name}</div>
                    {r.employee_id && <div className="text-xs text-gray-400">{r.employee_id}</div>}
                    {r.department && <div className="text-xs text-gray-400">{r.department}</div>}
                  </td>
                  <td className="px-5 py-4 text-gray-700">{r.leave_type}</td>
                  <td className="px-5 py-4">
                    <div className="text-gray-700">
                      {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {daysBetween(r.start_date, r.end_date)} day{daysBetween(r.start_date, r.end_date) !== 1 ? 's' : ''}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-500 max-w-[150px] truncate" title={r.reason}>{r.reason || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                    {r.reviewed_at && (
                      <div className="text-xs text-gray-400 mt-0.5">{fmtDate(r.reviewed_at.slice(0, 10))}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {r.status === 'pending' ? (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setSubstituteModal(r)}
                          disabled={actionLoading === r.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(r.id)}
                          disabled={actionLoading === r.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Reviewed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Substitute assignment modal */}
      {substituteModal && (
        <SubstituteModal
          leave={substituteModal}
          schoolId={schoolId}
          onClose={() => setSubstituteModal(null)}
          onApproved={handleApproved}
        />
      )}
    </div>
  )
}
