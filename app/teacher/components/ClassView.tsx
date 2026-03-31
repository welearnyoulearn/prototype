'use client'

import { useEffect, useRef, useState } from 'react'
import Tasks from './Tasks'
import ClassDoubts from './ClassDoubts'
import ClassPerformance from './ClassPerformance'
import ExamMarks from './ExamMarks'
import { SCHEDULE } from '@/lib/schedule'

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
  room: string | null
  is_break: boolean
  break_label: string | null
  day_of_week: string
  substitute_teacher_id: number | null
  substitute_teacher_name: string | null
  substitute_teacher_subject?: string | null
  substitute_teacher_department?: string | null
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
  substitute_teacher_subject?: string | null
  substitute_teacher_department?: string | null
  original_teacher_name: string | null
  original_teacher_department: string | null
  date: string
  time_from: string | null
  time_to: string | null
}

type TeacherObj = {
  id: number
  name: string
  subject: string
  department: string
  class_teacher_grade: string | null
  class_teacher_section: string | null
}

type Props = {
  classId: number
  grade: string
  section: string
  schoolId: number
  teacherName: string
  teacherId?: number
  isClassTeacher: boolean
  teacher?: TeacherObj
  onBack: () => void
  initialTab?: string
  openExamId?: number
}

const CLASS_TEACHER_TABS = ['Overview', 'Students', 'Performance', 'Attendance', 'Timetable', 'Marks & Results', 'Tasks', 'Doubts']
const SUBJECT_TEACHER_TABS = ['My Overview', 'Marks & Results', 'Tasks', 'Doubts', 'Timetable']
const TABS = CLASS_TEACHER_TABS // kept for reference

// API returns: { id, exam_name, exam_type, exam_date, status, subject_name, subject_status, max_marks, ... }
type MyExamRow = {
  id: number; exam_name: string; exam_type: string; exam_date: string | null
  status: string; subject_name: string; subject_status: string; max_marks: number
  total_subjects: number; submitted_subjects: number
}
type MyTask = { id: number; title: string; subject: string; task_type: string; due_date: string; submission_count: number; total_students: number }
type MyDoubt = { id: number; question: string; student_name: string; created_at: string; subject: string; status: string }

const EXAM_LABELS: Record<string, string> = { unit_test: 'Unit Test', mid_term: 'Mid Term', final_exam: 'Final Exam', practical: 'Practical' }
const EXAM_COLORS: Record<string, string> = { unit_test: 'bg-red-100 text-red-700', mid_term: 'bg-orange-100 text-orange-700', final_exam: 'bg-purple-100 text-purple-700', practical: 'bg-blue-100 text-blue-700' }

function SubjectTeacherOverview({
  classId, schoolId, grade, section, teacher, onGoToMarks, onGoToTasks, onGoToDoubts,
}: {
  classId: number; schoolId: number; grade: string; section: string
  teacher: TeacherObj
  onGoToMarks: () => void; onGoToTasks: () => void; onGoToDoubts: () => void
}) {
  const [myExams, setMyExams]     = useState<MyExamRow[]>([])
  const [myTasks, setMyTasks]     = useState<MyTask[]>([])
  const [myDoubts, setMyDoubts]   = useState<MyDoubt[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      // Exams where this teacher has a subject in this class
      fetch(`/api/exams?school_id=${schoolId}&class_id=${classId}&teacher_id=${teacher.id}`)
        .then(r => r.json()).catch(() => []),
      // Tasks this teacher created for this class
      fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}&teacher_id=${teacher.id}`)
        .then(r => r.json()).catch(() => []),
      // Open doubts from this class related to this teacher's subject
      fetch(`/api/doubts?school_id=${schoolId}&class_id=${classId}&status=open&subject=${encodeURIComponent(teacher.subject || '')}`)
        .then(r => r.json()).catch(() => []),
    ]).then(([examsData, tasksData, doubtsData]) => {
      setMyExams(Array.isArray(examsData) ? examsData : [])
      setMyTasks(Array.isArray(tasksData) ? tasksData : [])
      setMyDoubts(Array.isArray(doubtsData) ? doubtsData.slice(0, 5) : [])
      setLoading(false)
    })
  }, [classId, schoolId, teacher.id, teacher.subject])

  const pendingExams = myExams.filter(e => e.subject_status !== 'submitted')
  const submittedExams = myExams.filter(e => e.subject_status === 'submitted')

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Role banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-4 text-white flex items-center justify-between">
        <div>
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">Subject Teacher</p>
          <p className="text-white font-bold text-base mt-0.5">{teacher.subject} · Grade {grade}-{section}</p>
          <p className="text-indigo-200 text-xs mt-0.5">{teacher.department}</p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className={`text-xl font-black ${pendingExams.length > 0 ? 'text-amber-300' : 'text-white'}`}>{pendingExams.length}</div>
            <div className="text-indigo-200 text-[10px]">Pending Marks</div>
          </div>
          <div>
            <div className="text-xl font-black">{myTasks.length}</div>
            <div className="text-indigo-200 text-[10px]">Tasks</div>
          </div>
          <div>
            <div className={`text-xl font-black ${myDoubts.length > 0 ? 'text-yellow-300' : 'text-white'}`}>{myDoubts.length}</div>
            <div className="text-indigo-200 text-[10px]">Open Doubts</div>
          </div>
        </div>
      </div>

      {/* Pending marks entry — urgent alert */}
      {pendingExams.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <p className="text-sm font-bold text-amber-900">
                  {pendingExams.length} exam{pendingExams.length > 1 ? 's' : ''} waiting for your marks
                </p>
              </div>
              <div className="space-y-1.5">
                {pendingExams.map(e => (
                  <div key={`${e.id}-${e.subject_name}`} className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${EXAM_COLORS[e.exam_type] || 'bg-gray-100 text-gray-600'}`}>
                      {EXAM_LABELS[e.exam_type] || e.exam_type}
                    </span>
                    <span className="text-xs text-amber-800 font-medium">{e.exam_name}</span>
                    <span className="text-xs text-amber-600">— {e.subject_name}</span>
                    {e.exam_date && <span className="text-[10px] text-amber-500 ml-auto">{e.exam_date}</span>}
                  </div>
                ))}
              </div>
            </div>
            <button onClick={onGoToMarks}
              className="shrink-0 bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-amber-700 whitespace-nowrap">
              Enter Marks →
            </button>
          </div>
        </div>
      )}

      {/* Quick action tiles */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={onGoToMarks}
          className={`rounded-xl p-4 text-left transition-all group border ${pendingExams.length > 0 ? 'bg-amber-50 border-amber-200 hover:border-amber-400' : 'bg-white border-gray-200 hover:border-orange-300 hover:bg-orange-50'}`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${pendingExams.length > 0 ? 'bg-amber-100' : 'bg-orange-100'}`}>
            <svg className={`w-5 h-5 ${pendingExams.length > 0 ? 'text-amber-700' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-800">Marks Entry</p>
          <p className={`text-xs mt-0.5 font-medium ${pendingExams.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
            {pendingExams.length > 0 ? `${pendingExams.length} pending` : submittedExams.length > 0 ? 'All submitted ✓' : 'No exams yet'}
          </p>
        </button>

        <button onClick={onGoToTasks}
          className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-300 hover:bg-blue-50 transition-all group">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-200">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-800">Tasks</p>
          <p className="text-xs text-gray-400 mt-0.5">{myTasks.length} assigned</p>
        </button>

        <button onClick={onGoToDoubts}
          className={`rounded-xl p-4 text-left transition-all group border ${myDoubts.length > 0 ? 'bg-yellow-50 border-yellow-200 hover:border-yellow-400' : 'bg-white border-gray-200 hover:border-purple-300 hover:bg-purple-50'}`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${myDoubts.length > 0 ? 'bg-yellow-100' : 'bg-purple-100'}`}>
            <svg className={`w-5 h-5 ${myDoubts.length > 0 ? 'text-yellow-700' : 'text-purple-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-800">Doubts</p>
          <p className={`text-xs mt-0.5 font-medium ${myDoubts.length > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
            {myDoubts.length > 0 ? `${myDoubts.length} open` : 'None open'}
          </p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent tasks */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Recent Tasks</p>
            <button onClick={onGoToTasks} className="text-xs text-blue-500 font-medium hover:underline">View all</button>
          </div>
          {myTasks.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-gray-400">No tasks assigned to this class yet</p>
              <button onClick={onGoToTasks} className="mt-2 text-xs text-blue-600 font-semibold hover:underline">+ Create task</button>
            </div>
          ) : (
            <div className="space-y-2">
              {myTasks.slice(0, 4).map(t => (
                <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 font-medium truncate">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.task_type} · {t.due_date}</p>
                  </div>
                  {t.total_students > 0 && (
                    <span className="text-[10px] font-bold text-gray-500 ml-2">
                      {t.submission_count}/{t.total_students}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open doubts */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Open Doubts</p>
            <button onClick={onGoToDoubts} className="text-xs text-purple-500 font-medium hover:underline">View all</button>
          </div>
          {myDoubts.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-gray-400">No open doubts from this class</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myDoubts.map(d => (
                <div key={d.id} className="py-1.5 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-700 line-clamp-2">{d.question}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{d.student_name} · {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Submitted exams */}
      {submittedExams.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Submitted Marks</p>
          <div className="space-y-2">
            {submittedExams.map(e => (
              <div key={`${e.id}-sub`} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700">{e.exam_name}</p>
                  <p className="text-xs text-gray-400">{e.subject_name} · {EXAM_LABELS[e.exam_type] || e.exam_type}{e.exam_date ? ` · ${e.exam_date}` : ''}</p>
                </div>
                <span className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">✓ Submitted</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
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

export default function ClassView({ classId, grade, section, schoolId, teacherName, teacherId, isClassTeacher, teacher, onBack, initialTab, openExamId }: Props) {
  const tabs = isClassTeacher ? CLASS_TEACHER_TABS : SUBJECT_TEACHER_TABS
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : tabs[0])

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
    Promise.all([
      fetch(`/api/attendance?class_id=${classId}&date=${attDate}&school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/attendance?class_id=${classId}&school_id=${schoolId}&date=${attDate}&summary=true`).then(r => r.json()),
    ]).then(([att, summary]) => {
      setAttDayData(Array.isArray(att) ? att : [])
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
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>{tab}</button>
          ))}
        </div>
      </div>

      {/* ── SUBJECT TEACHER MY OVERVIEW ─────────────────────────────────────── */}
      {activeTab === 'My Overview' && !isClassTeacher && (
        <SubjectTeacherOverview
          classId={classId}
          schoolId={schoolId}
          grade={grade}
          section={section}
          teacher={teacher!}
          onGoToMarks={() => setActiveTab('Marks & Results')}
          onGoToTasks={() => setActiveTab('Tasks')}
          onGoToDoubts={() => setActiveTab('Doubts')}
        />
      )}

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

      {/* ── PERFORMANCE TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'Performance' && (
        <ClassPerformance
          classId={classId}
          schoolId={schoolId}
          grade={grade}
          section={section}
        />
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

          {/* ── DAY-WISE VIEW — Morning + Afternoon session cards ── */}
          {attView === 'day' && (
            attDayLoading ? (
              <div className="py-16 text-center text-gray-400 text-sm">Loading attendance data...</div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {(['morning', 'afternoon'] as const).map(sess => {
                  const info = attDaySummary[sess]
                  const sessAtt = sess === 'morning' ? morningAtt : afternoonAtt
                  const markedTime = info?.marked_at
                    ? new Date(info.marked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                    : null
                  const isMarked = !!(info && markedTime)
                  const isMorning = sess === 'morning'
                  return (
                    <div key={sess} className={`rounded-2xl border-2 overflow-hidden ${
                      isMarked
                        ? isMorning ? 'border-orange-200' : 'border-purple-200'
                        : 'border-gray-200'
                    }`}>
                      {/* Session header */}
                      <div className={`px-5 py-4 ${
                        isMarked
                          ? isMorning ? 'bg-orange-50 border-b border-orange-100' : 'bg-purple-50 border-b border-purple-100'
                          : 'bg-gray-50 border-b border-gray-100'
                      }`}>
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="text-xl">{isMorning ? '🌅' : '🌆'}</span>
                          <p className={`font-bold text-sm ${isMorning ? 'text-orange-800' : 'text-purple-800'}`}>
                            {isMorning ? 'Morning Session' : 'Afternoon Session'}
                          </p>
                          {isMarked && (
                            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isMorning ? 'bg-orange-200 text-orange-700' : 'bg-purple-200 text-purple-700'
                            }`}>MARKED</span>
                          )}
                        </div>
                        {isMarked ? (
                          <>
                            <p className="text-sm text-gray-700">
                              Marked by{' '}
                              <span className="font-semibold text-gray-900">{info!.marked_by_name || 'Unknown'}</span>
                              <span className="text-gray-400 mx-1">at</span>
                              <span className={`font-bold ${isMorning ? 'text-orange-600' : 'text-purple-600'}`}>{markedTime}</span>
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-sm font-semibold text-green-600">Present: {info!.present}</span>
                              <span className="text-gray-200">|</span>
                              <span className="text-sm font-semibold text-red-500">Absent: {info!.absent}</span>
                              {info!.late > 0 && (
                                <>
                                  <span className="text-gray-200">|</span>
                                  <span className="text-sm font-semibold text-yellow-500">Late: {info!.late}</span>
                                </>
                              )}
                              <span className="text-xs text-gray-400 ml-auto">of {info!.total}</span>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 mt-1">Attendance not marked yet</p>
                        )}
                      </div>

                      {/* Student list */}
                      {isMarked && sessAtt.length > 0 ? (
                        <div className="p-3 bg-white">
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                            {students.map(student => {
                              const rec = sessAtt.find(a => a.student_id === student.id)
                              const status = rec?.status || null
                              return (
                                <div key={student.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
                                  status === 'present' ? 'bg-green-50 text-green-800' :
                                  status === 'absent'  ? 'bg-red-50 text-red-700' :
                                  status === 'late'    ? 'bg-yellow-50 text-yellow-700' :
                                  'bg-gray-50 text-gray-400'
                                }`}>
                                  <span className="font-bold flex-shrink-0">
                                    {status === 'present' ? '✓' : status === 'absent' ? '✗' : status === 'late' ? '↗' : '—'}
                                  </span>
                                  <span className="truncate font-medium">{student.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : !isMarked ? (
                        <div className="px-5 py-8 text-center bg-white">
                          <p className="text-xs text-gray-300">No data recorded for this date</p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
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
                    <tr className="bg-slate-800">
                      <th className="sticky left-0 bg-slate-800 px-3 py-3 text-left font-semibold text-slate-200 min-w-[100px] border-r border-slate-700">
                        Slot / Time
                      </th>
                      {DAYS.map(day => (
                        <th key={day} className={`px-3 py-3 text-center font-semibold min-w-[120px] border-r border-slate-700 last:border-r-0 ${day === todayLabel ? 'bg-orange-600 text-white' : 'text-slate-300'}`}>
                          <span className="block">{day.slice(0, 3)}</span>
                          <span className="block text-[9px] font-normal opacity-70">{weekDates[day]?.slice(5)}</span>
                          {day === todayLabel && <span className="block text-[9px] font-normal text-orange-200">Today</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULE.map(schedSlot => {
                      if (schedSlot.is_break) {
                        return (
                          <tr key={schedSlot.slot} className="bg-amber-50 border-y border-amber-100">
                            <td className="sticky left-0 bg-amber-50 px-3 py-2 border-r border-amber-100 z-10">
                              <span className="font-semibold text-amber-600 text-[11px]">{schedSlot.break_label}</span>
                              <span className="block text-amber-400 text-[10px]">{schedSlot.time_from}–{schedSlot.time_to}</span>
                            </td>
                            <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-2 text-[11px]">
                              {schedSlot.break_label} · {schedSlot.time_from} – {schedSlot.time_to}
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={schedSlot.slot} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="sticky left-0 bg-gray-50 px-3 py-2 border-r border-gray-100 z-10">
                            <span className="font-bold text-gray-700 text-[11px] block">{schedSlot.short}</span>
                            <span className="text-gray-400 text-[10px]">{schedSlot.time_from}–{schedSlot.time_to}</span>
                          </td>
                          {DAYS.map(day => {
                            const slot = allTimetableSlots.find(s =>
                              s.day_of_week === day && Math.round(Number(s.period_number)) === schedSlot.slot && !s.is_break
                            )
                            const isToday = day === todayLabel
                            const cellDate = weekDates[day]
                            const sub = cellDate ? subLookup.get(`${cellDate}-${schedSlot.slot}`) : undefined
                            const hasSub = !!sub
                            const isMe = hasSub && teacherId && sub.substitute_teacher_id === teacherId

                            if (!slot) {
                              return (
                                <td key={day} className="px-2 py-2 border-r border-gray-100 last:border-r-0">
                                  <div className={`rounded min-h-[42px] flex items-center justify-center ${isToday ? 'bg-orange-50/30' : 'bg-gray-50'} border border-gray-100`}>
                                    <span className="text-gray-200 text-[10px] italic">Free</span>
                                  </div>
                                </td>
                              )
                            }

                            return (
                              <td key={day} className={`px-2 py-2 border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-orange-50/20' : ''}`}>
                                <div className={`rounded px-2 py-1.5 min-h-[42px] ${hasSub ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-100'}`}>
                                  <div className="flex items-start justify-between gap-1">
                                    <p className={`font-semibold text-[11px] leading-tight ${hasSub ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                      {slot.subject_name || '—'}
                                    </p>
                                    {hasSub && <span className="text-[9px] bg-amber-400 text-white px-1 py-0.5 rounded font-bold flex-shrink-0">SUB</span>}
                                  </div>
                                  {hasSub ? (
                                    <>
                                      <p className="text-gray-300 line-through text-[10px]">{slot.teacher_name || 'No teacher'}</p>
                                      <p className={`text-[10px] font-semibold ${isMe ? 'text-amber-600' : 'text-blue-600'}`}>
                                        {isMe ? '★ You (Sub)' : sub.substitute_teacher_name || 'Substitute'}
                                      </p>
                                    </>
                                  ) : (
                                    <p className="text-gray-400 text-[10px] mt-0.5">{slot.teacher_name || 'No teacher'}</p>
                                  )}
                                  {slot.room && <p className="text-gray-300 text-[10px]">{slot.room}</p>}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── TASKS TAB ───────────────────────────────────────────────────────── */}
      {activeTab === 'Tasks' && teacher && (
        <Tasks
          classId={classId}
          grade={grade}
          section={section}
          schoolId={schoolId}
          teacher={teacher}
        />
      )}
      {activeTab === 'Tasks' && !teacher && (
        <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
          <p className="text-sm text-gray-400">Loading teacher info...</p>
        </div>
      )}

      {activeTab === 'Doubts' && teacher && (
        <ClassDoubts
          classId={classId}
          grade={grade}
          section={section}
          schoolId={schoolId}
          teacher={teacher}
        />
      )}
      {activeTab === 'Doubts' && !teacher && (
        <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
          <p className="text-sm text-gray-400">Loading teacher info...</p>
        </div>
      )}

      {/* ── OTHER TABS ──────────────────────────────────────────────────────── */}
      {activeTab === 'Marks & Results' && teacher && (
        <ExamMarks
          classId={classId}
          schoolId={schoolId}
          grade={grade}
          section={section}
          teacher={teacher}
          isClassTeacher={isClassTeacher}
          openExamId={openExamId}
        />
      )}
      {activeTab === 'Marks & Results' && !teacher && (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center">
          <p className="text-sm text-gray-400">Loading teacher info...</p>
        </div>
      )}
    </div>
  )
}
