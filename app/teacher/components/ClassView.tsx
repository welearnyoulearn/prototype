'use client'

import { useEffect, useRef, useState } from 'react'

type Subject = {
  id: number
  subject_name: string
  teacher_name: string | null
  teacher_id: number | null
  periods_per_week: number
}

type Student = {
  id: number
  name: string
  email: string
  grade: string
  section: string
  roll_number: string
  parent_name: string
  parent_phone: string
  status: string
}

type ClassDetail = {
  id: number
  grade: string
  section: string
  class_teacher_name: string | null
  class_teacher_id: number | null
  subjects: Subject[]
}

type TimetableSlot = {
  id: number
  period_number: number
  time_from: string
  time_to: string
  subject_name: string | null
  teacher_name: string | null
  is_break: boolean
  break_label: string | null
  day_of_week: string
  substitute_teacher_id: number | null
  substitute_teacher_name: string | null
}

type AttendanceRecord = {
  student_id: number
  student_name: string
  roll_number: string
  status: 'present' | 'absent' | 'late'
  date: string
  session?: string
}

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

type ClassSubstitute = {
  id: number
  period_number: number
  subject_name: string | null
  substitute_teacher_id: number | null
  substitute_teacher_name: string | null
  original_teacher_name: string | null
  original_teacher_department: string | null
  date: string
  time_from: string | null
  time_to: string | null
}

type Props = {
  classId: number
  grade: string
  section: string
  schoolId: number
  teacherName: string
  teacherId?: number
  isClassTeacher: boolean
  onBack: () => void
}

const TABS = ['Overview', 'Students', 'Attendance', 'Timetable', 'Marks & Results', 'Tasks', 'Doubts']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function timeToMins(t: string) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function getToday() {
  const d = new Date().getDay()
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d]
}

// Returns the Monday of the "anchor week" (handles Sunday → next week)
function getAnchorMonday(): Date {
  const today = new Date()
  const dow = today.getDay() // 0=Sun, 1=Mon, ...
  const monday = new Date(today)
  if (dow === 0) monday.setDate(today.getDate() + 1)       // Sunday → next Monday
  else monday.setDate(today.getDate() - (dow - 1))          // Mon-Sat → this Monday
  monday.setHours(0, 0, 0, 0)
  return monday
}

// Returns { Monday: 'YYYY-MM-DD', ... } for anchor week + weekOffset weeks
function getWeekDates(weekOffset = 0): Record<string, string> {
  const monday = getAnchorMonday()
  monday.setDate(monday.getDate() + weekOffset * 7)
  const result: Record<string, string> = {}
  DAYS.forEach((d, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    result[d] = date.toISOString().split('T')[0]
  })
  return result
}

// Calculate which week offset a date falls in relative to anchor week
function getWeekOffsetForDate(dateStr: string): number {
  const monday = getAnchorMonday()
  const target = new Date(dateStr + 'T00:00:00')
  const diffMs = target.getTime() - monday.getTime()
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export default function ClassView({ classId, grade, section, schoolId, teacherName, teacherId, isClassTeacher, onBack }: Props) {
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Overview')

  // Today's timetable (for 1st period card + day-wise view)
  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([])
  // Today's attendance (for overview card)
  const [todayAtt, setTodayAtt] = useState<AttendanceRecord[]>([])
  const notifSentRef = useRef(false)

  // All timetable slots (for Timetable tab)
  const [allTimetableSlots, setAllTimetableSlots] = useState<TimetableSlot[]>([])
  // All substitute assignments for this class (for full-week overlay)
  const [classSubstitutes, setClassSubstitutes] = useState<ClassSubstitute[]>([])
  // Week offset for Timetable tab (0 = current/anchor week, 1 = next week, etc.)
  const [ttWeekOffset, setTtWeekOffset] = useState(0)

  // Attendance tab state
  const [attView, setAttView] = useState<'day' | 'monthly'>('day')
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0])
  const [attDayData, setAttDayData] = useState<AttendanceRecord[]>([])
  const [attDayLoading, setAttDayLoading] = useState(false)
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null)
  const [attDaySlots, setAttDaySlots] = useState<TimetableSlot[]>([])
  const [attDaySummary, setAttDaySummary] = useState<SessionSummary>({})

  // Monthly attendance
  const now = new Date()
  const [attMonth, setAttMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [monthlyData, setMonthlyData] = useState<AttendanceRecord[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)

  // Initial load
  useEffect(() => {
    setLoading(true)
    const todayStr = new Date().toISOString().split('T')[0]
    const todayDay = getToday()
    Promise.all([
      fetch(`/api/classes/${classId}`).then(r => r.json()),
      fetch(`/api/students?school_id=${schoolId}&grade=${encodeURIComponent(grade)}&section=${encodeURIComponent(section)}`).then(r => r.json()),
      fetch(`/api/attendance?class_id=${classId}&date=${todayStr}&school_id=${schoolId}`).then(r => r.json()),
      // Timetable without date — all week slots for the grid
      fetch(`/api/class-timetable?class_id=${classId}&school_id=${schoolId}`).then(r => r.json()),
      // All substitute assignments for this class (used for full-week overlay)
      fetch(`/api/substitutes?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()),
    ]).then(([cls, studs, att, tt, subs]) => {
      setClassDetail(cls)
      setStudents(Array.isArray(studs) ? studs.filter((s: Student) => !s.status || s.status === 'active') : [])
      setTodayAtt(Array.isArray(att) ? att : [])
      const allSlots: TimetableSlot[] = Array.isArray(tt) ? tt : []
      setAllTimetableSlots(allSlots)
      const daySlots = allSlots.filter(s => s.day_of_week === todayDay)
        .sort((a, b) => a.period_number - b.period_number)
      setTodaySlots(daySlots)
      setClassSubstitutes(Array.isArray(subs) ? subs : [])
    }).finally(() => setLoading(false))
  }, [classId, schoolId, grade, section])

  // Auto-advance timetable week to show the first upcoming substitute
  useEffect(() => {
    if (classSubstitutes.length === 0) return
    const todayStr = new Date().toISOString().split('T')[0]
    const upcomingDate = classSubstitutes
      .map(s => s.date?.toString().slice(0, 10) || '')
      .filter(d => d >= todayStr)
      .sort()[0]
    if (upcomingDate) {
      setTtWeekOffset(getWeekOffsetForDate(upcomingDate))
    }
  }, [classSubstitutes])

  // Notify class teacher if 1st period started + 15 min but no attendance
  useEffect(() => {
    if (!isClassTeacher || notifSentRef.current) return
    if (todaySlots.length === 0) return
    const firstSlot = todaySlots[0]
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    const startMins = timeToMins(firstSlot.time_from)
    if (nowMins >= startMins + 15 && todayAtt.length === 0) {
      notifSentRef.current = true
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          recipient_teacher_id: classDetail?.class_teacher_id,
          type: 'attendance_reminder',
          title: 'Attendance Not Marked',
          message: `1st period of Class ${grade}-${section} started at ${firstSlot.time_from} — attendance not yet marked.`,
          data: { class_id: classId, grade, section, period: firstSlot.period_number },
        }),
      }).catch(() => {})
    }
  }, [todaySlots, todayAtt, classDetail, isClassTeacher, schoolId, classId, grade, section])

  // Fetch attendance for selected date (Attendance tab - day-wise)
  useEffect(() => {
    if (activeTab !== 'Attendance' || attView !== 'day') return
    setAttDayLoading(true)
    const selectedDay = new Date(attDate + 'T00:00:00')
      .toLocaleDateString('en-US', { weekday: 'long' })
    Promise.all([
      fetch(`/api/attendance?class_id=${classId}&date=${attDate}&school_id=${schoolId}`).then(r => r.json()),
      // Pass attDate so substitute info is overlaid for the selected date
      fetch(`/api/class-timetable?class_id=${classId}&school_id=${schoolId}&date=${attDate}`).then(r => r.json()),
      fetch(`/api/attendance?class_id=${classId}&school_id=${schoolId}&date=${attDate}&summary=true`).then(r => r.json()),
    ]).then(([att, tt, summary]) => {
      setAttDayData(Array.isArray(att) ? att : [])
      const allSlots: TimetableSlot[] = Array.isArray(tt) ? tt : []
      setAttDaySlots(allSlots.filter(s => s.day_of_week === selectedDay).sort((a, b) => a.period_number - b.period_number))
      setAttDaySummary(summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {})
    }).finally(() => setAttDayLoading(false))
  }, [activeTab, attView, attDate, classId, schoolId])

  // Fetch monthly data
  useEffect(() => {
    if (activeTab !== 'Attendance' || attView !== 'monthly') return
    setMonthlyLoading(true)
    fetch(`/api/attendance?class_id=${classId}&month=${attMonth}&school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => setMonthlyData(Array.isArray(data) ? data : []))
      .finally(() => setMonthlyLoading(false))
  }, [activeTab, attView, attMonth, classId, schoolId])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Loading class data...</p></div>
  }

  const className = `Class ${grade}${section}`
  const subjects = classDetail?.subjects || []

  // Split timetable into morning (before break) and afternoon (after break)
  const firstBreakIdx = todaySlots.findIndex(s => s.is_break)
  const morningSlots  = (firstBreakIdx === -1 ? todaySlots : todaySlots.slice(0, firstBreakIdx)).filter(s => !s.is_break)
  const afternoonSlots = (firstBreakIdx === -1 ? [] : todaySlots.slice(firstBreakIdx + 1)).filter(s => !s.is_break)
  const morningFirst   = morningSlots[0] || null
  const afternoonFirst = afternoonSlots[0] || null

  // Today's attendance by session
  const morningAtt   = todayAtt.filter(a => !a.session || a.session === 'morning')
  const afternoonAtt = todayAtt.filter(a => a.session === 'afternoon')

  function sessionStats(att: AttendanceRecord[]) {
    return {
      present: att.filter(a => a.status === 'present').length,
      absent:  att.filter(a => a.status === 'absent').length,
      late:    att.filter(a => a.status === 'late').length,
      total:   att.length,
    }
  }

  // Monthly grid helpers
  const [monthYear, monthNum] = attMonth.split('-').map(Number)
  const daysInMonth = getDaysInMonth(monthYear, monthNum - 1)
  const monthDates = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthStudents = [...new Map(monthlyData.map(r => [r.student_id, { id: r.student_id, name: r.student_name, roll: r.roll_number }])).values()]
    .sort((a, b) => (a.roll || '').localeCompare(b.roll || '') || a.name.localeCompare(b.name))

  // Get per-session status for monthly cell
  function getMonthSessionStatus(studentId: number, day: number, sess: string) {
    const dateStr = `${attMonth}-${String(day).padStart(2, '0')}`
    const rec = monthlyData.find((r: AttendanceRecord) =>
      r.student_id === studentId &&
      r.date?.toString().startsWith(dateStr) &&
      (r.session === sess || (!r.session && sess === 'morning'))
    )
    return rec?.status || null
  }

  // % = (morning_present + afternoon_present + 0.5*late) / total_sessions_taken * 100
  function getStudentMonthPct(studentId: number) {
    const recs = monthlyData.filter(r => r.student_id === studentId)
    if (recs.length === 0) return null
    const score = recs.reduce((acc, r) => {
      if (r.status === 'present') return acc + 1
      if (r.status === 'late')    return acc + 0.5
      return acc  // absent = 0
    }, 0)
    return Math.round((score / recs.length) * 100)
  }

  const StatusSymbol = ({ status }: { status: string | null }) => {
    if (!status) return <span className="text-gray-200 text-xs">·</span>
    if (status === 'present') return <span className="text-green-600 font-bold text-xs">✓</span>
    if (status === 'absent')  return <span className="text-red-500 text-xs">○</span>
    if (status === 'late')    return <span className="text-yellow-500 text-xs">↗</span>
    return <span className="text-gray-400 text-xs">·</span>
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <button onClick={onBack} className="hover:text-blue-600 transition-colors">Smart Snapshot</button>
        <span>/</span>
        <span className="text-gray-700 font-medium">{className}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{className}</h1>
              {isClassTeacher && (
                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-semibold px-3 py-1 rounded-full">★ Class Teacher</span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Academic Year {new Date().getFullYear()}-{String(new Date().getFullYear() + 1).slice(2)} &middot; {students.length} Students &middot; {subjects.length} Subjects
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload Marks
            </button>
            <button className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              Full Analytics
            </button>
            <button className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
              Broadcast Message
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-6 mt-5 border-b border-gray-100 -mb-5">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>{tab}</button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'Overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-4">
            {/* Today's attendance — morning + afternoon 1st period */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 col-span-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Today&apos;s Attendance</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Morning */}
                {(() => {
                  const s = sessionStats(morningAtt)
                  const pct = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
                  return (
                    <div className="bg-orange-50 rounded-lg px-3 py-2.5 border border-orange-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">🌅</span>
                        <p className="text-xs font-semibold text-orange-700">Morning</p>
                        {morningFirst && <span className="text-[10px] text-orange-400 ml-auto">{morningFirst.time_from}</span>}
                      </div>
                      {s.total > 0 ? (
                        <>
                          <p className="text-lg font-bold text-gray-900">{s.present}<span className="text-sm text-gray-400">/{s.total}</span></p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-[10px] text-green-600">{pct}% present</span>
                            {s.absent > 0 && <span className="text-[10px] text-red-500">{s.absent} absent</span>}
                            {s.late > 0 && <span className="text-[10px] text-yellow-600">{s.late} late</span>}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-orange-500 mt-1">Not marked yet</p>
                      )}
                    </div>
                  )
                })()}
                {/* Afternoon */}
                {(() => {
                  const s = sessionStats(afternoonAtt)
                  const pct = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
                  return (
                    <div className="bg-purple-50 rounded-lg px-3 py-2.5 border border-purple-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">🌆</span>
                        <p className="text-xs font-semibold text-purple-700">Afternoon</p>
                        {afternoonFirst && <span className="text-[10px] text-purple-400 ml-auto">{afternoonFirst.time_from}</span>}
                      </div>
                      {s.total > 0 ? (
                        <>
                          <p className="text-lg font-bold text-gray-900">{s.present}<span className="text-sm text-gray-400">/{s.total}</span></p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-[10px] text-green-600">{pct}% present</span>
                            {s.absent > 0 && <span className="text-[10px] text-red-500">{s.absent} absent</span>}
                            {s.late > 0 && <span className="text-[10px] text-yellow-600">{s.late} late</span>}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-purple-500 mt-1">Not marked yet</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Class Average</p>
              <p className="text-3xl font-bold text-gray-900">—</p>
              <p className="text-xs text-gray-400 mt-0.5">Across all subjects</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Pending Tasks</p>
              <p className="text-3xl font-bold text-gray-900">0</p>
              <p className="text-xs text-gray-400 mt-0.5">No tasks assigned</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">At Risk Students</p>
              <p className="text-3xl font-bold text-gray-900">—</p>
              <p className="text-xs text-gray-400 mt-0.5">Marks needed</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Open Doubts</p>
              <p className="text-3xl font-bold text-gray-900">0</p>
              <p className="text-xs text-gray-400 mt-0.5">No doubts raised</p>
            </div>
          </div>

          {/* Subject cards */}
          {subjects.length > 0 && (
            <div className={`grid gap-4 ${subjects.length <= 3 ? 'grid-cols-3' : subjects.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
              {subjects.map(subj => (
                <div key={subj.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-semibold text-gray-800 text-sm leading-tight">{subj.subject_name}</p>
                    <span className="text-sm font-bold text-gray-300 ml-2">—</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{subj.teacher_name || 'No teacher assigned'}</p>
                  <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-gray-300 w-0" /></div>
                  <p className="text-[10px] text-gray-400 mt-1.5">{subj.periods_per_week} periods/week · No marks yet</p>
                </div>
              ))}
            </div>
          )}
          {subjects.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 py-8 text-center text-sm text-gray-400">
              No subjects assigned — add via Class Management
            </div>
          )}

          {/* Student overview + right panels */}
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3 bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">Student Overview</h3>
              </div>
              {students.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No students enrolled</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Student</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Today</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => {
                      const attRec = todayAtt.find(a => a.student_id === student.id)
                      return (
                        <tr key={student.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm flex-shrink-0">
                                {student.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{student.name}</p>
                                {student.roll_number && <p className="text-xs text-gray-400">Roll #{student.roll_number}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {attRec ? (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                attRec.status === 'present' ? 'bg-green-100 text-green-700' :
                                attRec.status === 'absent'  ? 'bg-red-100 text-red-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>{attRec.status}</span>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-3 text-gray-400 text-sm">—</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">Attendance Heatmap</h3>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {Array.from({ length: 35 }).map((_, i) => <div key={i} className="w-full aspect-square rounded-sm bg-gray-100" />)}
                </div>
                <p className="text-xs text-gray-400">No attendance data yet</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">Recent Exam Results</h3>
                <div className="py-6 text-center">
                  <p className="text-xs text-gray-400">No exams published yet</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STUDENTS TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'Students' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">All Students — {className}</h3>
          </div>
          {students.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No students enrolled yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">#</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase">Name</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase">Roll No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase">Email</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase">Parent</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase">Parent Phone</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, idx) => (
                  <tr key={student.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-800">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-500">{student.roll_number || '—'}</td>
                    <td className="px-3 py-3 text-gray-500">{student.email || '—'}</td>
                    <td className="px-3 py-3 text-gray-500">{student.parent_name || '—'}</td>
                    <td className="px-3 py-3 text-gray-500">{student.parent_phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ATTENDANCE TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'Attendance' && (
        <div className="space-y-4">
          {/* View switcher */}
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={() => setAttView('day')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${attView === 'day' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                Day-wise
              </button>
              <button onClick={() => setAttView('monthly')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${attView === 'monthly' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                Monthly
              </button>
            </div>
            {attView === 'day' && (
              <input type="date" value={attDate} max={new Date().toISOString().split('T')[0]}
                onChange={e => setAttDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            )}
            {attView === 'monthly' && (
              <input type="month" value={attMonth} max={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`}
                onChange={e => setAttMonth(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            )}
          </div>

          {/* Session marker info — who marked morning and afternoon */}
          {attView === 'day' && (
            <div className="grid grid-cols-2 gap-3">
              {(['morning', 'afternoon'] as const).map(sess => {
                const info = attDaySummary[sess]
                const markedTime = info?.marked_at
                  ? new Date(info.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                  : null
                return (
                  <div key={sess} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                    info ? (sess === 'morning' ? 'bg-orange-50 border-orange-200' : 'bg-purple-50 border-purple-200') : 'bg-gray-50 border-gray-200'
                  }`}>
                    <span className="text-xl flex-shrink-0">{sess === 'morning' ? '🌅' : '🌆'}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${sess === 'morning' ? 'text-orange-700' : 'text-purple-700'}`}>
                        {sess === 'morning' ? 'Morning Session' : 'Afternoon Session'}
                      </p>
                      {info && markedTime ? (
                        <>
                          <p className="text-xs text-gray-700 truncate">
                            Marked by <span className="font-medium">{info.marked_by_name || 'Unknown'}</span> at {markedTime}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            P:{info.present} · A:{info.absent} · L:{info.late} / {info.total} students
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400">Not marked yet</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── DAY-WISE VIEW ──────────────────────────────────────────────── */}
          {attView === 'day' && (
            attDayLoading ? (
              <div className="py-16 text-center text-gray-400 text-sm">Loading attendance data...</div>
            ) : (
              <div className="space-y-3">
                {attDaySlots.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
                    No timetable periods for this day
                  </div>
                ) : (
                  attDaySlots.map(slot => {
                    const present = attDayData.filter(a => a.status === 'present').length
                    const absent  = attDayData.filter(a => a.status === 'absent').length
                    const late    = attDayData.filter(a => a.status === 'late').length
                    const total   = attDayData.length
                    const isOpen  = expandedPeriod === slot.period_number
                    return (
                      <div key={slot.period_number} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => setExpandedPeriod(isOpen ? null : slot.period_number)}
                          className="w-full flex items-center px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                              P{slot.period_number}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-800">{slot.subject_name || `Period ${slot.period_number}`}</p>
                                {slot.substitute_teacher_name && (
                                  <span className="text-[9px] bg-amber-400 text-white px-1.5 py-0.5 rounded font-bold flex-shrink-0">SUB</span>
                                )}
                              </div>
                              {slot.substitute_teacher_name ? (
                                <p className="text-xs text-amber-700">
                                  {slot.time_from} – {slot.time_to} ·
                                  <span className="line-through text-gray-300 ml-1">{slot.teacher_name}</span>
                                  <span className="ml-1 font-medium">{slot.substitute_teacher_name}</span>
                                </p>
                              ) : (
                                <p className="text-xs text-gray-400">{slot.time_from} – {slot.time_to} · {slot.teacher_name || 'No teacher'}</p>
                              )}
                            </div>
                          </div>
                          {total > 0 ? (
                            <div className="flex items-center gap-4 mr-4">
                              <span className="text-sm font-semibold text-green-600">P:{present}</span>
                              <span className="text-sm font-semibold text-red-500">A:{absent}</span>
                              {late > 0 && <span className="text-sm font-semibold text-yellow-500">L:{late}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-orange-500 font-medium mr-4">Not marked</span>
                          )}
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div className="border-t border-gray-100 px-5 py-3">
                            {attDayData.length === 0 ? (
                              <p className="text-sm text-gray-400 text-center py-4">No attendance recorded for this date</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                {students.map(student => {
                                  const rec = attDayData.find(a => a.student_id === student.id)
                                  const status = rec?.status || null
                                  return (
                                    <div key={student.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                                      status === 'present' ? 'bg-green-50' :
                                      status === 'absent'  ? 'bg-red-50' :
                                      status === 'late'    ? 'bg-yellow-50' : 'bg-gray-50'
                                    }`}>
                                      <span className="text-base"><StatusSymbol status={status} /></span>
                                      <span className="text-xs text-gray-700 font-medium truncate">{student.name}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )
          )}

          {/* ── MONTHLY VIEW ───────────────────────────────────────────────── */}
          {attView === 'monthly' && (
            monthlyLoading ? (
              <div className="py-16 text-center text-gray-400 text-sm">Loading monthly data...</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">
                    {new Date(attMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} — {className}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="text-green-600 font-bold">✓</span> Present</span>
                    <span className="flex items-center gap-1"><span className="text-red-500">○</span> Absent</span>
                    <span className="flex items-center gap-1"><span className="text-yellow-500">↗</span> Late</span>
                    <span className="flex items-center gap-1"><span className="text-gray-300">·</span> Not recorded</span>
                  </div>
                </div>
                {monthStudents.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">No attendance data for this month</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse min-w-max w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-600 min-w-[160px] border-r border-gray-200">Student</th>
                          {monthDates.map(d => {
                            const dateObj = new Date(monthYear, monthNum - 1, d)
                            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6
                            return (
                              <th key={d} className={`px-1 py-2 text-center font-semibold min-w-[36px] ${isWeekend ? 'text-gray-300' : 'text-gray-600'}`}>
                                <span className="block">{d}</span>
                                <span className="block font-normal text-[9px] text-gray-400">{dateObj.toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
                                {!isWeekend && (
                                  <div className="flex justify-center gap-0.5 mt-1">
                                    <span className="text-[8px] text-orange-400 font-normal">M</span>
                                    <span className="text-[8px] text-purple-400 font-normal">A</span>
                                  </div>
                                )}
                              </th>
                            )
                          })}
                          <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[60px] border-l border-gray-200">Att%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthStudents.map((student, idx) => {
                          const pct = getStudentMonthPct(student.id)
                          return (
                            <tr key={student.id} className={`border-b border-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                              <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-800 border-r border-gray-100">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-400 text-[10px] w-5 flex-shrink-0">{student.roll || idx + 1}</span>
                                  <span className="truncate max-w-[110px]">{student.name}</span>
                                </div>
                              </td>
                              {monthDates.map(d => {
                                const dateObj = new Date(monthYear, monthNum - 1, d)
                                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6
                                const mStatus = isWeekend ? null : getMonthSessionStatus(student.id, d, 'morning')
                                const aStatus = isWeekend ? null : getMonthSessionStatus(student.id, d, 'afternoon')
                                return (
                                  <td key={d} className={`px-1 py-1.5 text-center ${isWeekend ? 'bg-gray-50' : ''}`}>
                                    {isWeekend ? (
                                      <span className="text-gray-200 text-xs">—</span>
                                    ) : (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <StatusSymbol status={mStatus} />
                                        <StatusSymbol status={aStatus} />
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                              <td className={`px-3 py-2 text-center font-bold border-l border-gray-100 ${
                                pct === null ? 'text-gray-300' :
                                pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {pct !== null ? `${pct}%` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {/* Legend */}
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[10px] text-gray-500">
                      <span className="font-semibold">Each cell = M (morning) + A (afternoon)</span>
                      <span className="flex items-center gap-1"><span className="text-green-600 font-bold">✓</span> Present</span>
                      <span className="flex items-center gap-1"><span className="text-red-500">○</span> Absent</span>
                      <span className="flex items-center gap-1"><span className="text-yellow-500">↗</span> Late (counts as 50%)</span>
                      <span className="flex items-center gap-1"><span className="text-gray-300">·</span> Not recorded</span>
                      <span className="ml-auto text-gray-400">% = present sessions / total sessions taken</span>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* ── TIMETABLE TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'Timetable' && (() => {
        const maxPeriod = allTimetableSlots.reduce((m, s) => Math.max(m, s.period_number), 0)
        const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1)
        const getSlot = (day: string, period: number) =>
          allTimetableSlots.find(s => s.day_of_week === day && s.period_number === period) || null
        const todayLabel = getToday()
        // Week dates for the currently viewed week (offset from anchor)
        const weekDates = getWeekDates(ttWeekOffset)
        const weekStart = weekDates['Monday']
        const weekEnd   = weekDates['Saturday']

        // Build lookup: date-period → substitute (all weeks)
        const subLookup = new Map<string, ClassSubstitute>()
        classSubstitutes.forEach(s => {
          const dateStr = s.date?.toString().slice(0, 10)
          if (dateStr) subLookup.set(`${dateStr}-${s.period_number}`, s)
        })

        // Count substitutes visible in this week
        const subsThisWeek = classSubstitutes.filter(s => {
          const d = s.date?.toString().slice(0, 10)
          return d && d >= weekStart && d <= weekEnd
        })

        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-gray-800 text-sm">Class {grade}-{section} Timetable</h3>
              <div className="flex items-center gap-3">
                {subsThisWeek.length > 0 && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                    {subsThisWeek.length} substitute{subsThisWeek.length > 1 ? 's' : ''} this week
                  </span>
                )}
                {classSubstitutes.length > 0 && subsThisWeek.length === 0 && (
                  <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                    {classSubstitutes.length} sub{classSubstitutes.length > 1 ? 's' : ''} in other weeks
                  </span>
                )}
                {/* Week navigation */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTtWeekOffset(o => o - 1)}
                    className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">
                    ← Prev
                  </button>
                  <button
                    onClick={() => setTtWeekOffset(0)}
                    className={`text-xs border px-2 py-1 rounded ${ttWeekOffset === 0 ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                    This Week
                  </button>
                  <button
                    onClick={() => setTtWeekOffset(o => o + 1)}
                    className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">
                    Next →
                  </button>
                </div>
              </div>
            </div>
            {allTimetableSlots.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-gray-400">No timetable set up yet</p>
                <p className="text-xs text-gray-300 mt-1">Ask school admin to configure the class timetable</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse min-w-max w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-500 min-w-[80px] border-r border-gray-200 uppercase tracking-wide">Period</th>
                      {DAYS.map(day => (
                        <th key={day} className={`px-3 py-3 text-center font-semibold min-w-[130px] ${day === todayLabel ? 'text-orange-600 bg-orange-50' : 'text-gray-600'}`}>
                          <span className="block">{day.slice(0, 3)}</span>
                          <span className="block text-[9px] font-normal text-gray-400">{weekDates[day]?.slice(5)}</span>
                          {day === todayLabel && <span className="inline-block mt-0.5 text-[9px] bg-orange-500 text-white px-1 py-0.5 rounded">Today</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map(p => (
                      <tr key={p} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-gray-500 border-r border-gray-100 text-center">
                          P{p}
                        </td>
                        {DAYS.map(day => {
                          const slot = getSlot(day, p)
                          const isToday = day === todayLabel
                          const cellDate = weekDates[day]
                          // Look up substitute by this specific calendar date + period
                          const sub = cellDate ? subLookup.get(`${cellDate}-${p}`) : undefined
                          const hasSub = !!sub
                          const isMe = hasSub && teacherId && sub.substitute_teacher_id === teacherId

                          if (!slot) return <td key={day} className="px-3 py-3 text-center text-gray-200">—</td>
                          if (slot.is_break) return (
                            <td key={day} className="px-3 py-3 text-center bg-gray-50">
                              <span className="text-gray-400 text-[10px] font-medium">{slot.break_label || 'Break'}</span>
                            </td>
                          )
                          return (
                            <td key={day} className={`px-3 py-2 ${
                              hasSub ? 'bg-amber-50/60' : isToday ? 'bg-orange-50/40' : ''
                            }`}>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <p className="font-semibold text-gray-800 truncate">
                                    {slot.subject_name || (hasSub ? sub.subject_name || sub.original_teacher_department : null) || '—'}
                                  </p>
                                  {hasSub && (
                                    <span className="flex-shrink-0 text-[9px] bg-amber-400 text-white px-1 py-0.5 rounded font-bold">SUB</span>
                                  )}
                                </div>
                                {hasSub ? (
                                  <>
                                    <p className="text-gray-300 line-through text-[10px] truncate">{slot.teacher_name || sub.original_teacher_name || 'No teacher'}</p>
                                    <p className={`text-[10px] font-semibold truncate ${isMe ? 'text-amber-600' : 'text-blue-600'}`}>
                                      {isMe ? '★ You (Sub)' : `${sub.substitute_teacher_name || 'Substitute'}`}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-gray-400 truncate">{slot.teacher_name || 'No teacher'}</p>
                                )}
                                {slot.time_from && <p className="text-gray-300 mt-0.5">{slot.time_from}–{slot.time_to}</p>}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── OTHER TABS ──────────────────────────────────────────────────────── */}
      {['Marks & Results', 'Tasks', 'Doubts'].includes(activeTab) && (
        <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">{activeTab} — Coming Soon</h3>
          <p className="text-sm text-gray-400">We&apos;re building this feature. Check back soon!</p>
        </div>
      )}
    </div>
  )
}
