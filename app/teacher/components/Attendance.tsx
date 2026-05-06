'use client'

import { useEffect, useState } from 'react'

type ClassInfo = {
  id: number
  grade: string
  section: string
  class_teacher_name: string | null
}

type ClassDaySummary = {
  id: number
  morning_marked_by: string | null
  morning_total: number | null
  morning_present: number | null
  afternoon_marked_by: string | null
  afternoon_total: number | null
  afternoon_present: number | null
}

type Student = {
  id: number
  name: string
  roll_number: string
  parent_name: string
  parent_email: string
  status: string
}

type AttendanceRecord = {
  student_id: number
  session?: string
  status: 'present' | 'absent' | 'late'
}

type TimetableSlot = {
  period_number: number
  time_from: string
  time_to: string
  is_break: boolean
  day_of_week: string
}

type Session = 'morning' | 'afternoon'

type SessionSummaryItem = {
  total: number
  present: number
  absent: number
  late: number
  marked_by_name: string | null
  marked_at: string | null
}

type SessionSummary = {
  morning?: SessionSummaryItem
  afternoon?: SessionSummaryItem
}

type Props = {
  teacherId: number
  schoolId: number
}

type Step = 'select' | 'mark' | 'preview' | 'done'

const STATUS_CONFIG = {
  present: { label: '✓ Present', active: 'bg-green-100 text-green-700 border-green-400 ring-2 ring-green-200', idle: 'bg-white text-gray-400 border-gray-200 hover:border-green-300 hover:text-green-600' },
  absent:  { label: '✗ Absent',  active: 'bg-red-100 text-red-700 border-red-400 ring-2 ring-red-200',       idle: 'bg-white text-gray-400 border-gray-200 hover:border-red-300 hover:text-red-600'   },
  late:    { label: '◑ Late',    active: 'bg-yellow-100 text-yellow-700 border-yellow-400 ring-2 ring-yellow-200', idle: 'bg-white text-gray-400 border-gray-200 hover:border-yellow-300 hover:text-yellow-600' },
}

function timeToMins(t: string) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function getToday() {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
}

// Detect morning/afternoon from timetable slots
// Morning = before first break, Afternoon = after first break
function detectSession(slots: TimetableSlot[]): Session {
  const today = getToday()
  const daySlots = slots.filter(s => s.day_of_week === today).sort((a, b) => a.period_number - b.period_number)
  const firstBreak = daySlots.find(s => s.is_break)
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()

  if (!firstBreak) return 'morning'
  const breakStart = timeToMins(firstBreak.time_from)
  return nowMins < breakStart ? 'morning' : 'afternoon'
}

// Find 1st period of morning (period before break) and 1st period of afternoon (period after break)
function getSessionPeriods(slots: TimetableSlot[], day: string) {
  const daySlots = slots.filter(s => s.day_of_week === day).sort((a, b) => a.period_number - b.period_number)
  const firstBreakIdx = daySlots.findIndex(s => s.is_break)

  const morningPeriods = firstBreakIdx === -1 ? daySlots.filter(s => !s.is_break) : daySlots.slice(0, firstBreakIdx).filter(s => !s.is_break)
  const afternoonPeriods = firstBreakIdx === -1 ? [] : daySlots.slice(firstBreakIdx + 1).filter(s => !s.is_break)

  return {
    morningFirst: morningPeriods[0] || null,
    afternoonFirst: afternoonPeriods[0] || null,
  }
}

type HistoryRecord = {
  student_name: string
  roll_number: string
  status: 'present' | 'absent' | 'late'
  session: string
}

export default function Attendance({ teacherId, schoolId }: Props) {
  const [mode, setMode] = useState<'mark' | 'history'>('mark')
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [step, setStep] = useState<Step>('select')

  // History mode state
  const [histClass, setHistClass] = useState<ClassInfo | null>(null)
  const [histDate, setHistDate] = useState(new Date().toISOString().split('T')[0])
  const [histRecords, setHistRecords] = useState<HistoryRecord[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState('')
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [session, setSession] = useState<Session>('morning')
  const [sessionPeriod, setSessionPeriod] = useState<TimetableSlot | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ saved: number; notified: number } | null>(null)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [previousDate, setPreviousDate] = useState<string | null>(null)

  // Timetable for session auto-detect
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([])
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({})

  // School-wide per-class attendance status for the selected date
  const [daySummary, setDaySummary] = useState<Record<number, ClassDaySummary>>({})

  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        const list: ClassInfo[] = Array.isArray(data) ? data : []
        list.sort((a, b) => {
          const ga = parseInt(a.grade) || 0, gb = parseInt(b.grade) || 0
          return ga !== gb ? ga - gb : a.section.localeCompare(b.section)
        })
        setClasses(list)
      })
      .finally(() => setLoadingClasses(false))
  }, [schoolId])

  // Fetch who-marked summary for all classes on the selected date
  useEffect(() => {
    if (!selectedDate) return
    fetch(`/api/attendance?school_id=${schoolId}&date=${selectedDate}&view=school`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        const map: Record<number, ClassDaySummary> = {}
        data.forEach((row: ClassDaySummary) => { map[row.id] = row })
        setDaySummary(map)
      })
      .catch(() => {})
  }, [schoolId, selectedDate])

  async function handleSelectClass(cls: ClassInfo) {
    setSelectedClass(cls)
    setLoadingStudents(true)
    setError('')
    try {
      const [studRes, ttRes, summaryRes] = await Promise.all([
        fetch(`/api/students?school_id=${schoolId}&grade=${encodeURIComponent(cls.grade)}&section=${encodeURIComponent(cls.section)}`).then(r => r.json()),
        fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/attendance?class_id=${cls.id}&school_id=${schoolId}&date=${selectedDate}&summary=true`).then(r => r.json()),
      ])
      const studs: Student[] = Array.isArray(studRes) ? studRes.filter((s: Student) => !s.status || s.status === 'active') : []
      setStudents(studs)

      const slots: TimetableSlot[] = Array.isArray(ttRes) ? ttRes : []
      setTimetableSlots(slots)

      setSessionSummary(summaryRes && typeof summaryRes === 'object' && !Array.isArray(summaryRes) ? summaryRes : {})

      // Auto-detect session
      const detectedSession = detectSession(slots)
      setSession(detectedSession)

      // Get session period info
      const today = getToday()
      const { morningFirst, afternoonFirst } = getSessionPeriods(slots, today)
      setSessionPeriod(detectedSession === 'morning' ? morningFirst : afternoonFirst)

      // Load existing attendance for that session
      await loadAttendanceForSession(cls, selectedDate, detectedSession, studs)
    } catch {
      setError('Failed to load class data')
    } finally {
      setLoadingStudents(false)
    }
    setStep('mark')
  }

  async function refreshSessionSummary(cls: ClassInfo, date: string) {
    try {
      const res = await fetch(`/api/attendance?class_id=${cls.id}&school_id=${schoolId}&date=${date}&summary=true`)
      const data = await res.json()
      setSessionSummary(data && typeof data === 'object' && !Array.isArray(data) ? data : {})
    } catch { /* ignore */ }
  }

  async function loadAttendanceForSession(cls: ClassInfo, date: string, sess: Session, studs: Student[]) {
    const attRes = await fetch(`/api/attendance?class_id=${cls.id}&date=${date}&school_id=${schoolId}&session=${sess}`).then(r => r.json())
    const existingRecs: AttendanceRecord[] = Array.isArray(attRes) ? attRes : []
    setIsEditing(existingRecs.length > 0)
    const initial = studs.map(s => {
      const prev = existingRecs.find(e => e.student_id === s.id)
      return { student_id: s.id, status: prev ? prev.status as 'present' | 'absent' | 'late' : 'present' as const }
    })
    setRecords(initial)
    setPreviousDate(null)
  }

  async function handleSessionChange(sess: Session) {
    setSession(sess)
    const today = getToday()
    const { morningFirst, afternoonFirst } = getSessionPeriods(timetableSlots, today)
    setSessionPeriod(sess === 'morning' ? morningFirst : afternoonFirst)
    if (selectedClass && students.length > 0) {
      await loadAttendanceForSession(selectedClass, selectedDate, sess, students)
    }
  }

  async function loadPreviousAttendance() {
    if (!selectedClass) return
    try {
      const res = await fetch(`/api/attendance?class_id=${selectedClass.id}&school_id=${schoolId}&previous=true&session=${session}`)
      const data = await res.json()
      if (data.records && Array.isArray(data.records)) {
        const dateLabel = data.date ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null
        setPreviousDate(dateLabel)
        setRecords(prev => prev.map(r => {
          const match = data.records.find((pr: AttendanceRecord) => pr.student_id === r.student_id)
          return match ? { ...r, status: match.status } : r
        }))
      }
    } catch {
      setError('Failed to load previous attendance')
    }
  }

  function setStatus(studentId: number, status: 'present' | 'absent' | 'late') {
    setRecords(prev => prev.map(r => r.student_id === studentId ? { ...r, status } : r))
  }

  function setAllPresent() {
    setRecords(prev => prev.map(r => ({ ...r, status: 'present' })))
    setPreviousDate(null)
  }

  async function handleSubmit() {
    if (!selectedClass) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: selectedClass.id, teacher_id: teacherId, date: selectedDate, session, records }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setResult({ saved: data.saved, notified: data.notified })
      if (selectedClass) await refreshSessionSummary(selectedClass, selectedDate)
      // Refresh who-marked badges on class grid
      fetch(`/api/attendance?school_id=${schoolId}&date=${selectedDate}&view=school`)
        .then(r => r.json()).then(rows => {
          if (!Array.isArray(rows)) return
          const map: Record<number, ClassDaySummary> = {}
          rows.forEach((row: ClassDaySummary) => { map[row.id] = row })
          setDaySummary(map)
        }).catch(() => {})
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setStep('mark')
    } finally {
      setSubmitting(false)
    }
  }

  async function loadHistory(cls: ClassInfo, date: string) {
    setHistLoading(true); setHistError(''); setHistRecords([])
    try {
      const res = await fetch(`/api/attendance?class_id=${cls.id}&school_id=${schoolId}&date=${date}`)
      const data = await res.json()
      setHistRecords(Array.isArray(data) ? data : [])
    } catch {
      setHistError('Failed to load attendance history')
    } finally {
      setHistLoading(false)
    }
  }

  const presentCount = records.filter(r => r.status === 'present').length
  const absentCount  = records.filter(r => r.status === 'absent').length
  const lateCount    = records.filter(r => r.status === 'late').length
  const absentStudents = students.filter(s => records.find(r => r.student_id === s.id)?.status === 'absent')
  const lateStudents   = students.filter(s => records.find(r => r.student_id === s.id)?.status === 'late')
  const sessionLabel = session === 'morning' ? 'Morning' : 'Afternoon'
  const dateFormatted = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // ─── HISTORY MODE ──────────────────────────────────────────────────────────
  if (mode === 'history') {
    const histPresent = histRecords.filter(r => r.status === 'present').length
    const histAbsent  = histRecords.filter(r => r.status === 'absent').length
    const histLate    = histRecords.filter(r => r.status === 'late').length
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Attendance History</h2>
            <p className="text-sm text-gray-500 mt-0.5">View past attendance by class and date</p>
          </div>
          <button onClick={() => setMode('mark')}
            className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 font-medium">
            ← Mark Attendance
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
            <select
              value={histClass?.id ?? ''}
              onChange={e => {
                const cls = classes.find(c => c.id === Number(e.target.value)) || null
                setHistClass(cls)
                if (cls) loadHistory(cls, histDate)
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">Select class…</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={histDate} max={new Date().toISOString().split('T')[0]}
              onChange={e => {
                setHistDate(e.target.value)
                if (histClass) loadHistory(histClass, e.target.value)
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        </div>

        {histError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{histError}</div>
        )}

        {!histClass ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
            Select a class above to view attendance records
          </div>
        ) : histLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
            Loading...
          </div>
        ) : histRecords.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
            No attendance marked for Class {histClass.grade}-{histClass.section} on this date
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-green-700">{histPresent}</p>
                <p className="text-xs text-green-600">Present</p>
              </div>
              <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-red-700">{histAbsent}</p>
                <p className="text-xs text-red-600">Absent</p>
              </div>
              <div className="bg-yellow-50 rounded-xl border border-yellow-200 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-yellow-700">{histLate}</p>
                <p className="text-xs text-yellow-600">Late</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">
                  Class {histClass.grade}-{histClass.section} · {new Date(histDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {histRecords.map((r, i) => (
                  <div key={i} className="flex items-center px-5 py-3 gap-3">
                    <span className="text-sm text-gray-400 w-7">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm">
                      {r.student_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{r.student_name}</p>
                      {r.roll_number && <p className="text-xs text-gray-400">Roll #{r.roll_number}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      r.status === 'present' ? 'bg-green-100 text-green-700' :
                      r.status === 'absent'  ? 'bg-red-100 text-red-700' :
                                               'bg-yellow-100 text-yellow-700'
                    }`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                    {r.session && <span className="text-xs text-gray-400">{r.session}</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ─── SELECT CLASS ──────────────────────────────────────────────────────────
  if (step === 'select') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Mark Attendance</h2>
            <p className="text-sm text-gray-500 mt-1">Select a class and date</p>
          </div>
          <button onClick={() => setMode('history')}
            className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">
            View History →
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Date:</label>
          <input type="date" value={selectedDate} max={new Date().toISOString().split('T')[0]}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <span className="text-sm text-gray-500">{dateFormatted}</span>
        </div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Select Class</h3>
        {loadingClasses ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading classes...</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {classes.map(cls => {
              const ds = daySummary[cls.id]
              const morningDone  = !!(ds?.morning_marked_by)
              const afternoonDone = !!(ds?.afternoon_marked_by)
              const fullyDone = morningDone && afternoonDone
              return (
                <button key={cls.id} onClick={() => handleSelectClass(cls)} disabled={loadingStudents}
                  className={`text-left rounded-xl border p-5 hover:shadow-md transition-all disabled:opacity-50 ${
                    fullyDone ? 'bg-green-50 border-green-300 hover:border-green-400' :
                    morningDone || afternoonDone ? 'bg-blue-50 border-blue-200 hover:border-blue-400' :
                    'bg-white border-gray-200 hover:border-blue-300'
                  }`}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-2xl font-bold text-gray-900">{cls.grade}-{cls.section}</p>
                    {fullyDone && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Both</span>}
                    {!fullyDone && morningDone && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">½ AM</span>}
                    {!fullyDone && afternoonDone && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">½ PM</span>}
                  </div>
                  {cls.class_teacher_name && <p className="text-xs text-gray-400 mb-2">CT: {cls.class_teacher_name}</p>}
                  {morningDone && (
                    <p className="text-[11px] text-green-700 font-medium">
                      ☀ AM: {ds.morning_present}/{ds.morning_total} · by {ds.morning_marked_by}
                    </p>
                  )}
                  {afternoonDone && (
                    <p className="text-[11px] text-purple-700 font-medium mt-0.5">
                      🌙 PM: {ds.afternoon_present}/{ds.afternoon_total} · by {ds.afternoon_marked_by}
                    </p>
                  )}
                  {!morningDone && !afternoonDone && (
                    <p className="text-xs text-blue-600 font-medium mt-1">→ Mark Attendance</p>
                  )}
                  {(morningDone || afternoonDone) && (
                    <p className="text-[10px] text-gray-400 mt-1">Click to {fullyDone ? 'edit' : 'complete'}</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ─── DONE ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Attendance Saved!</h2>
        <p className="text-gray-500 text-sm mb-1">Class {selectedClass?.grade}-{selectedClass?.section} · {sessionLabel} Session</p>
        <p className="text-gray-400 text-xs mb-4">{dateFormatted}</p>
        {sessionPeriod && (
          <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full inline-block mb-4">
            {sessionLabel} 1st Period · {sessionPeriod.time_from}–{sessionPeriod.time_to}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-green-50 rounded-xl py-3 px-4">
            <p className="text-2xl font-bold text-green-700">{presentCount}</p>
            <p className="text-xs text-green-600">Present</p>
          </div>
          <div className="bg-red-50 rounded-xl py-3 px-4">
            <p className="text-2xl font-bold text-red-700">{absentCount}</p>
            <p className="text-xs text-red-600">Absent</p>
          </div>
          <div className="bg-yellow-50 rounded-xl py-3 px-4">
            <p className="text-2xl font-bold text-yellow-700">{lateCount}</p>
            <p className="text-xs text-yellow-600">Late</p>
          </div>
        </div>
        {result && result.notified > 0 && (
          <p className="text-sm text-gray-500 mb-5">Email notifications sent to {result.notified} parent(s)</p>
        )}
        <div className="flex gap-3 justify-center flex-wrap">
          <button onClick={() => { setStep('select'); setSelectedClass(null); setResult(null); setPreviousDate(null) }}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Mark Another Class
          </button>
          <button onClick={() => { setStep('mark'); setResult(null) }}
            className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Edit Attendance
          </button>
          {session === 'morning' && (
            <button onClick={() => { handleSessionChange('afternoon'); setStep('mark'); setResult(null) }}
              className="px-5 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors">
              Mark Afternoon →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── PREVIEW ───────────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('mark')} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Preview & Confirm</h2>
            <p className="text-sm text-gray-500">
              Class {selectedClass?.grade}-{selectedClass?.section} · <span className={`font-semibold ${session === 'morning' ? 'text-orange-600' : 'text-purple-600'}`}>{sessionLabel} Session</span> · {dateFormatted}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-green-700">{presentCount}</p>
            <p className="text-xs text-green-600">Present</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-red-700">{absentCount}</p>
            <p className="text-xs text-red-600">Absent</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-yellow-700">{lateCount}</p>
            <p className="text-xs text-yellow-600">Late</p>
          </div>
        </div>

        {absentStudents.length > 0 && (
          <div className="bg-white rounded-xl border border-red-200">
            <div className="px-5 py-3 border-b border-red-100 bg-red-50 rounded-t-xl">
              <p className="text-sm font-semibold text-red-700">{absentStudents.length} Absent — parents will be notified by email</p>
            </div>
            <div className="divide-y divide-gray-50">
              {absentStudents.map(s => (
                <div key={s.id} className="flex items-center px-5 py-3 gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">{s.name.charAt(0)}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.parent_email || 'No parent email — notification skipped'}</p>
                  </div>
                  <button onClick={() => setStatus(s.id, 'present')}
                    className="text-xs text-blue-600 border border-blue-200 px-2 py-1 rounded hover:bg-blue-50">
                    Mark Present
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {lateStudents.length > 0 && (
          <div className="bg-white rounded-xl border border-yellow-200">
            <div className="px-5 py-3 border-b border-yellow-100 bg-yellow-50 rounded-t-xl">
              <p className="text-sm font-semibold text-yellow-700">{lateStudents.length} Late</p>
            </div>
            <div className="divide-y divide-gray-50">
              {lateStudents.map(s => (
                <div key={s.id} className="flex items-center px-5 py-3 gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 font-bold text-sm">{s.name.charAt(0)}</div>
                  <p className="text-sm font-medium text-gray-800 flex-1">{s.name}</p>
                  <button onClick={() => setStatus(s.id, 'present')}
                    className="text-xs text-blue-600 border border-blue-200 px-2 py-1 rounded hover:bg-blue-50">
                    Mark Present
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {absentStudents.length === 0 && lateStudents.length === 0 && (
          <div className="bg-green-50 rounded-xl border border-green-200 px-5 py-4 text-center">
            <p className="text-green-700 font-medium text-sm">All {presentCount} students are present!</p>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4">
          <button onClick={() => setStep('mark')} className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Edit Attendance</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {submitting ? 'Saving...' : 'Confirm & Submit'}
          </button>
        </div>
      </div>
    )
  }

  // ─── MARK ATTENDANCE ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('select')} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Class {selectedClass?.grade}-{selectedClass?.section}</h2>
            <p className="text-sm text-gray-500">{dateFormatted}{isEditing ? ' · Editing existing' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {previousDate && (
            <span className="text-xs bg-purple-50 text-purple-600 px-3 py-1 rounded-full border border-purple-200">
              Loaded from {previousDate}
            </span>
          )}
          <button onClick={loadPreviousAttendance}
            className="text-sm text-purple-600 border border-purple-200 bg-purple-50 px-3 py-1.5 rounded-lg font-medium">
            Same as Previous
          </button>
          <button onClick={setAllPresent}
            className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg font-medium">
            Mark All Present
          </button>
        </div>
      </div>

      {/* Session selector */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Select Session</p>
        <div className="flex gap-3">
          {(['morning', 'afternoon'] as Session[]).map(sess => {
            const today = getToday()
            const { morningFirst, afternoonFirst } = getSessionPeriods(timetableSlots, today)
            const periodInfo = sess === 'morning' ? morningFirst : afternoonFirst
            const summary = sessionSummary[sess]
            const markedTime = summary?.marked_at
              ? new Date(summary.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              : null
            return (
              <button key={sess} onClick={() => handleSessionChange(sess)}
                className={`flex-1 flex items-start gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  session === sess
                    ? sess === 'morning'
                      ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200'
                      : 'border-purple-400 bg-purple-50 ring-2 ring-purple-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                <span className="text-2xl mt-0.5">{sess === 'morning' ? '🌅' : '🌆'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${session === sess ? (sess === 'morning' ? 'text-orange-700' : 'text-purple-700') : 'text-gray-700'}`}>
                    {sess === 'morning' ? 'Morning Session' : 'Afternoon Session'}
                  </p>
                  {periodInfo ? (
                    <p className="text-xs text-gray-400">1st period: {periodInfo.time_from} – {periodInfo.time_to}</p>
                  ) : (
                    <p className="text-xs text-gray-400">No timetable set</p>
                  )}
                  {summary && markedTime ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                      <p className="text-xs text-green-700 font-medium truncate">
                        Marked by {summary.marked_by_name || 'a teacher'} at {markedTime}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Not yet marked</p>
                  )}
                  {summary && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      P:{summary.present} A:{summary.absent} L:{summary.late}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{students.length}</p>
          <p className="text-xs text-gray-400">Total</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-700">{presentCount}</p>
          <p className="text-xs text-green-600">Present</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-red-700">{absentCount}</p>
          <p className="text-xs text-red-600">Absent</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-yellow-700">{lateCount}</p>
          <p className="text-xs text-yellow-600">Late</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Student list */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">{students.length} Students · <span className={session === 'morning' ? 'text-orange-600' : 'text-purple-600'}>{sessionLabel} Session</span></p>
          <p className="text-xs text-gray-400">Tap a button to mark status</p>
        </div>
        {students.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No students enrolled</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {students.map((student, idx) => {
              const status = records.find(r => r.student_id === student.id)?.status || 'present'
              return (
                <div key={student.id} className="flex items-center px-5 py-3">
                  <span className="text-sm text-gray-400 w-7 flex-shrink-0">{idx + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm mr-3 flex-shrink-0">
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="font-medium text-gray-800 text-sm">{student.name}</p>
                    {student.roll_number && <p className="text-xs text-gray-400">Roll #{student.roll_number}</p>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {(['present', 'absent', 'late'] as const).map(s => (
                      <button key={s} onClick={() => setStatus(student.id, s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                          status === s ? STATUS_CONFIG[s].active : STATUS_CONFIG[s].idle
                        }`}>
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4">
        <p className="text-sm text-gray-500">
          {absentCount > 0 ? `${absentCount} absent — parents will be notified` : 'All students present'}
        </p>
        <button onClick={() => setStep('preview')} disabled={students.length === 0}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          Preview & Submit →
        </button>
      </div>
    </div>
  )
}
