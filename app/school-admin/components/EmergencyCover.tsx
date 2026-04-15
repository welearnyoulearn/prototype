'use client'

import { useEffect, useState, useCallback } from 'react'

type Teacher = {
  id: number
  name: string
  employee_id: string
  department: string
  subject: string
  status: string
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
  is_break: boolean
}

type FreeTeacher = {
  id: number
  name: string
  employee_id: string
  department: string
  subject: string
}

type Assignment = {
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
}

type ExistingSub = {
  period_number: number
  substitute_teacher_id: number
  substitute_teacher_name: string | null
}

function todayLocalStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function dayName(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function EmergencyCover({ schoolId }: { schoolId: number }) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayLocalStr())
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [existingSubs, setExistingSubs] = useState<ExistingSub[]>([])
  const [freeTeacherCache, setFreeTeacherCache] = useState<Record<string, FreeTeacher[]>>({})
  const [teacherNameMap, setTeacherNameMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetch(`/api/teachers?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setTeachers([]); return }
        const seen = new Set<number>()
        setTeachers(data.filter((t: Teacher) => {
          if (t.status === 'inactive' || seen.has(t.id)) return false
          seen.add(t.id)
          return true
        }))
      })
      .catch(() => {})
  }, [schoolId])

  const loadPeriods = useCallback(async () => {
    if (!selectedTeacherId || !selectedDate) return
    setLoading(true)
    setError('')
    setAssignments([])
    setExistingSubs([])
    setFreeTeacherCache({})
    try {
      const dow = dayName(selectedDate)
      const [ttData, subData] = await Promise.all([
        fetch(`/api/class-timetable?school_id=${schoolId}&teacher_id=${selectedTeacherId}`).then(r => r.json()),
        fetch(`/api/substitutes?school_id=${schoolId}&date=${selectedDate}`).then(r => r.json()),
      ])

      // Filter timetable to day of absence, skip breaks
      const daySlots: TimetableSlot[] = Array.isArray(ttData)
        ? ttData.filter((s: TimetableSlot) => s.day_of_week === dow && !s.is_break && s.subject_name)
        : []

      // Find already-saved emergency subs for this teacher on this date
      const alreadySaved: ExistingSub[] = Array.isArray(subData)
        ? subData
            .filter((s: { original_teacher_id: number }) => s.original_teacher_id === selectedTeacherId)
            .map((s: { period_number: number; substitute_teacher_id: number; substitute_teacher_name: string | null }) => ({
              period_number: s.period_number,
              substitute_teacher_id: s.substitute_teacher_id,
              substitute_teacher_name: s.substitute_teacher_name,
            }))
        : []

      setExistingSubs(alreadySaved)

      const savedMap = new Map(alreadySaved.map(s => [s.period_number, s.substitute_teacher_id]))

      const rows: Assignment[] = daySlots.map(slot => ({
        class_id: slot.class_id,
        grade: slot.grade,
        section: slot.section,
        date: selectedDate,
        day_of_week: dow,
        period_number: slot.period_number,
        subject_name: slot.subject_name,
        time_from: slot.time_from,
        time_to: slot.time_to,
        substitute_teacher_id: savedMap.get(slot.period_number) ?? null,
      }))

      setAssignments(rows)

      // Pre-populate teacher name map from already saved subs
      const nameMap: Record<number, string> = {}
      alreadySaved.forEach(s => {
        if (s.substitute_teacher_id && s.substitute_teacher_name) {
          nameMap[s.substitute_teacher_id] = s.substitute_teacher_name
        }
      })
      setTeacherNameMap(nameMap)
    } catch {
      setError('Failed to load timetable')
    } finally {
      setLoading(false)
    }
  }, [selectedTeacherId, selectedDate, schoolId])

  useEffect(() => { loadPeriods() }, [loadPeriods])

  async function loadFreeTeachers(dow: string, period: number, date: string) {
    const key = `${date}_${period}`
    if (freeTeacherCache[key]) return
    try {
      const res = await fetch(
        `/api/substitutes?school_id=${schoolId}&day=${encodeURIComponent(dow)}&period=${period}&exclude_teacher=${selectedTeacherId}&date=${date}`
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

  function setSubTeacher(period: number, teacherId: number | null) {
    setAssignments(prev => prev.map(r =>
      r.period_number === period ? { ...r, substitute_teacher_id: teacherId } : r
    ))
  }

  async function handleSave() {
    if (!selectedTeacherId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/substitutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          leave_request_id: null,
          original_teacher_id: selectedTeacherId,
          assignments,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to save')
      }
      const d = await res.json()
      const count = d.saved as number
      setSuccess(`${count} substitute${count !== 1 ? 's' : ''} assigned for ${fmtDate(selectedDate)}.`)
      setTimeout(() => setSuccess(''), 6000)
      loadPeriods()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const selectedTeacher = teachers.find(t => t.id === selectedTeacherId)
  const assignedCount = assignments.filter(a => a.substitute_teacher_id).length
  const dow = selectedDate ? dayName(selectedDate) : ''
  const alreadyCovered = existingSubs.length > 0

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Emergency Cover</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Assign substitutes for an absent teacher — no leave request needed.
          The teacher can apply leave later when they return.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Absence</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            {selectedDate && (
              <p className="text-xs text-gray-400 mt-1">{dow}, {fmtDate(selectedDate)}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Absent Teacher</label>
            <select
              value={selectedTeacherId ?? ''}
              onChange={e => setSelectedTeacherId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">— Select teacher —</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.department ? ` · ${t.department}` : ''}
                </option>
              ))}
            </select>
            {selectedTeacher && (
              <p className="text-xs text-gray-400 mt-1">
                {selectedTeacher.employee_id}{selectedTeacher.subject ? ` · ${selectedTeacher.subject}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">
          ✓ {success}
        </div>
      )}

      {/* Periods */}
      {!selectedTeacherId ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">Select a date and absent teacher</p>
          <p className="text-gray-400 text-sm mt-1">Their timetable for that day loads automatically</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
          Loading timetable...
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">{selectedTeacher?.name} has no classes on {dow}</p>
          <p className="text-gray-400 text-sm mt-1">No substitute assignment needed for this day</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-orange-50 border-b border-orange-100 px-5 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Emergency Cover
                </span>
                {alreadyCovered && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    Partially assigned
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-orange-800 mt-1">
                {selectedTeacher?.name} · {dow}, {fmtDate(selectedDate)}
              </p>
              <p className="text-xs text-orange-600 mt-0.5">
                {assignments.length} period{assignments.length !== 1 ? 's' : ''} to cover
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-600">{assignedCount}<span className="text-sm font-normal text-orange-400">/{assignments.length}</span></p>
              <p className="text-xs text-orange-500">assigned</p>
            </div>
          </div>

          {/* Period rows */}
          <div className="divide-y divide-gray-50">
            {assignments.map(row => {
              const key = `${row.date}_${row.period_number}`
              const freeList = freeTeacherCache[key] || []
              const subName = row.substitute_teacher_id ? teacherNameMap[row.substitute_teacher_id] : null

              return (
                <div key={row.period_number} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                  {/* Period badge */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                    row.substitute_teacher_id ? 'bg-green-600' : 'bg-slate-700'
                  }`}>
                    P{row.period_number}
                  </div>

                  {/* Subject + class info */}
                  <div className="min-w-0 flex-shrink-0 w-44">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {row.subject_name || 'Free Period'}
                    </p>
                    <p className="text-xs text-gray-400">
                      Class {row.grade}-{row.section} · {row.time_from}–{row.time_to}
                    </p>
                    {subName && (
                      <p className="text-xs text-green-600 font-medium mt-0.5">→ {subName}</p>
                    )}
                  </div>

                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>

                  {/* Substitute picker */}
                  <div className="flex-1 min-w-[200px]">
                    <select
                      value={row.substitute_teacher_id ?? ''}
                      onFocus={() => loadFreeTeachers(dow, row.period_number, row.date)}
                      onChange={e => setSubTeacher(row.period_number, e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                    >
                      <option value="">— Select substitute —</option>
                      {freeList.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.employee_id ? ` (${t.employee_id})` : ''}{t.department ? ` · ${t.department}` : ''}
                        </option>
                      ))}
                      {freeList.length === 0 && !freeTeacherCache[key] && (
                        <option disabled>Click to load available teachers...</option>
                      )}
                      {freeList.length === 0 && freeTeacherCache[key] && (
                        <option disabled>No free teachers available</option>
                      )}
                    </select>
                  </div>

                  {/* Status */}
                  {row.substitute_teacher_id ? (
                    <span className="text-green-600 text-xs font-semibold flex-shrink-0">✓ Assigned</span>
                  ) : (
                    <span className="text-orange-400 text-xs flex-shrink-0">Unassigned</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                {assignedCount === 0
                  ? 'Assign at least one substitute to save'
                  : `${assignedCount} of ${assignments.length} periods assigned`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Substitute teachers will be notified immediately
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || assignedCount === 0}
              className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : `Save ${assignedCount} Assignment${assignedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
