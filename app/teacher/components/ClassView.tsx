'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Tasks from './Tasks'
import ClassDoubts from './ClassDoubts'
import ExamMarks from './ExamMarks'
import { SCHEDULE } from '@/lib/schedule'
import { BookOpen, ChevronDown, Check, Loader2, X, Upload, Hash, Trash2, Pencil } from 'lucide-react'
import { INK, GOLD, PURPLE, GREEN, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { ProgressBar, Toast } from '@/app/components/ulearn/primitives'
import { InlineLoader } from '@/components/loaders'
import { BulkImportPanel } from '@/app/components/ulearn/BulkImportPanel'
import { useToast } from '@/app/components/ulearn/useToast'
import { useFeature } from '@/lib/features-context'
import { syllabusPrompt, SYLLABUS_EXAMPLE } from '@/lib/syllabus/chatgpt-prompt'
import StudentDetail from './StudentDetail'

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
  email: string | null
  grade: string
  section: string
  roll_number: string
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
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

export type TeacherObj = {
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
  // Which academic year the teacher has chosen to VIEW (Profile tab
  // selector) — only affects the Syllabus tab for now. readOnly disables
  // every write action there (mark covered, add topic, bootstrap import)
  // when the selected year isn't the school's current one.
  academicYear?: string
  readOnly?: boolean
}

const CLASS_TEACHER_TABS = ['Overview', 'Students', 'Attendance', 'Timetable', 'Marks & Results', 'Homework', 'Doubts', 'Syllabus']
const SUBJECT_TEACHER_TABS = ['My Overview', 'Students', 'Marks & Results', 'Homework', 'Doubts', 'Timetable', 'Syllabus']

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
      <InlineLoader portal="teacher" label="" />
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
            <div className="text-indigo-200 text-[10px]">Homework</div>
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
          <p className="text-sm font-bold text-gray-800">Homework</p>
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

// ─── Syllabus Tracking ────────────────────────────────────────────────────────
type SylQuestion = { q: string; options: string[]; answer: number; source?: string }
type SylResource = { id: number; title: string; url: string; resource_type: string }
type SylTopic = {
  id: number
  topic_name: string
  topic_order: number
  chapter_name: string
  chapter_order: number
  status: string
  covered_date: string | null
  covered_by_name: string | null
  target_date?: string | null
  delay_reason?: string | null
  content_text?: string
  content_pdf_url?: string
  questions?: SylQuestion[] | string | null
  resources?: SylResource[] | null
  is_custom?: boolean
}

type SylChapter = {
  school_chapter_id?: number
  chapter_name: string
  chapter_order: number
  semester?: string | null
  book_type?: string | null
  audience?: string | null
  book_name?: string | null
  is_custom?: boolean
  // Per-class semester grouping from the teacher's own Setup screen —
  // distinct from `semester` above (school_chapters' shared column driving
  // the pre-existing book-tab switcher). Drives the real Semester 1/2 tabs.
  class_semester_label?: string | null
  total: number
  covered: number
  topics: SylTopic[]
}

type SylSubject = {
  subject: string
  board: string | null
  total: number
  covered: number
  completion_pct: number
  chapters: SylChapter[]
  setup_completed_at?: string | null
  semester_mode?: boolean
  semester_count?: number | null
}

// Shape returned by GET /api/syllabus/setup and POST /api/syllabus/setup/apply
// — deliberately separate from SylChapter/SylTopic (no progress fields at
// all, since Setup is a selection screen, not a tracking screen).
type SetupTopic = {
  school_topic_id: number
  topic_name: string
  topic_order: number
  is_custom: boolean
  is_active: boolean
}
type SetupChapter = {
  school_chapter_id: number
  chapter_name: string
  chapter_order: number
  book_type: string | null
  audience: string | null
  book_name: string | null
  is_custom: boolean
  is_active: boolean
  // Per-class semester grouping assigned in the Setup screen itself — see
  // the "Semester Wise" mode toggle below. Distinct from school_chapters'
  // own shared `semester` column (used elsewhere for admin's book tabs).
  semester_label: string | null
  topics: SetupTopic[]
}

export function SyllabusTracking({
  classId, schoolId, grade, teacher, isClassTeacher, allowedSubjects, academicYear, readOnly,
}: {
  classId: number
  schoolId: number
  grade: string
  teacher: TeacherObj | undefined
  isClassTeacher: boolean
  // Subject names this teacher is assigned to for this class via
  // Class Management's class_subjects table. Class teachers see every
  // subject for their own class regardless (kept — a common real-school
  // expectation); everyone else is gated strictly to their assignments.
  allowedSubjects?: string[]
  // Which academic year to view (Profile tab selector) — defaults to the
  // school's current year server-side when omitted. readOnly disables every
  // write action here (mark covered, add topic/chapter, bootstrap import)
  // when the selected year isn't the school's current one.
  academicYear?: string
  readOnly?: boolean
}) {
  const [subjects, setSubjects] = useState<SylSubject[]>([])
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  // Which of THIS class's own Semester 1/2/... splits is showing. Only
  // relevant when currentSubject.semester_mode is true.
  const [activeClassSemester, setActiveClassSemester] = useState<string>('')
  // "Inactive Chapters" tab — chapters the teacher excluded via Setup.
  // GET /api/syllabus only ever returns active chapters (that's the point
  // of visibility filtering), so this reuses the Setup screen's own data
  // source (GET /api/syllabus/setup, which carries is_active for
  // everything) fetched on demand only when this tab is opened, rather than
  // changing the tracking route's contract.
  const [showInactiveChapters, setShowInactiveChapters] = useState(false)
  const [inactiveChaptersTree, setInactiveChaptersTree] = useState<SetupChapter[] | null>(null)
  const [inactiveChaptersLoading, setInactiveChaptersLoading] = useState(false)
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<number | null>(null)
  const { toast, flash, copyPrompt } = useToast()

  // Add-custom-topic form — one open at a time, keyed by chapter name so a
  // teacher can add topics to a chapter before or after marking others taught,
  // same as school-admin's per-chapter "+ Custom Topic" in the Syllabus
  // Customizer. Uses POST /api/syllabus, which finds-or-creates the chapter
  // by name, so it works even for a chapter that has zero topics yet.
  const [addTopicChapter, setAddTopicChapter] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  // Add-chapter form — subject-level, mirrors the add-custom-topic pattern
  // above. Uses POST /api/syllabus/chapters (auto-numbers chapter_order via
  // MAX+1), separate from POST /api/syllabus which only ever creates a
  // chapter as a side effect of adding its first topic.
  const [addingChapter, setAddingChapter] = useState(false)
  const [newChapterName, setNewChapterName] = useState('')
  const [creatingChapter, setCreatingChapter] = useState(false)

  // Empty-subject bootstrap (Part D) — shown only when the selected subject
  // has zero chapters. Two entry points into the same subject: paste
  // ChatGPT-generated JSON (POST /api/school/syllabus/bulk-import), or enter
  // a chapter count for dummy "Chapter N" placeholders to rename later
  // (POST /api/school/syllabus/bootstrap-chapters). Both just populate
  // school_chapters/school_topics — after that this subject renders through
  // the normal chapter accordion above, same as any other subject.
  const [bootstrapMode, setBootstrapMode] = useState<'none' | 'import' | 'count'>('none')
  const [bootstrapError, setBootstrapError] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [chapterCount, setChapterCount] = useState('')

  // Class Syllabus Setup — a one-time-per-(class,subject) curation checkpoint.
  // setupStatus[subject] caches whether that subject has EVER completed
  // Apply for this class (null = not yet checked, undefined-key = unknown).
  // A subject with zero chapters skips Setup entirely and goes straight to
  // the existing bootstrap panel below — there's nothing to curate yet.
  const [setupStatus, setSetupStatus] = useState<Record<string, string | null>>({})
  const [setupTree, setSetupTree] = useState<SetupChapter[] | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  // Per-item checked state, keyed by school_chapter_id / school_topic_id —
  // separate from setupTree's own is_active so the UI can diverge from the
  // last-saved DB state while the teacher is still checking boxes, without
  // writing anything until Apply is actually clicked.
  const [setupChapterChecked, setSetupChapterChecked] = useState<Record<number, boolean>>({})
  const [setupTopicChecked, setSetupTopicChecked] = useState<Record<number, boolean>>({})
  // 'sibling-prompt': another class in this grade already completed Setup
  // for this subject — offer to copy it before falling through to a blank
  // first-time Setup. 'sibling-preview': the teacher picked one of those
  // sibling classes and is looking at its read-only chapter/topic tree
  // before confirming the copy.
  const [setupMode, setSetupMode] = useState<'closed' | 'sibling-prompt' | 'sibling-preview' | 'first-time' | 'edit'>('closed')
  const [applyingSetup, setApplyingSetup] = useState(false)
  const [setupError, setSetupError] = useState('')

  // Sibling-setup copy prompt — populated by the first-time-Setup check
  // effect below, alongside (not instead of) the normal first-time flow.
  type SiblingSetup = {
    class_id: number; grade: string; section: string
    setup_completed_at: string; setup_by_name: string | null
    semester_mode: boolean; semester_count: number | null
    active_chapters: number
  }
  const [siblingSetups, setSiblingSetups] = useState<SiblingSetup[]>([])
  const [siblingSchoolSubjectId, setSiblingSchoolSubjectId] = useState<number | null>(null)
  const [previewSibling, setPreviewSibling] = useState<SiblingSetup | null>(null)
  const [previewTree, setPreviewTree] = useState<SetupChapter[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [copyingSibling, setCopyingSibling] = useState(false)

  // Full Syllabus (flat list, today's default) vs Semester Wise (chapters
  // grouped under Semester 1/2/... headers the teacher assigns per chapter).
  // Purely an organization aid on top of the same select/deselect flow —
  // semesterOrg === 'semester' just changes how the tree renders and adds
  // one more field (semester_label) to the Apply payload; the actual
  // active/inactive selection logic is identical either way.
  const [setupOrg, setSetupOrg] = useState<'full' | 'semester'>('full')
  const [setupSemesterCount, setSetupSemesterCount] = useState('')
  const [setupSemesterLabels, setSetupSemesterLabels] = useState<Record<number, string>>({})
  // Drag-and-drop for semester assignment — a chapter card dragged into a
  // Semester N section (or back into Unassigned) sets its semester_label the
  // same way the select dropdown does; both write to the same state, so
  // either input method works interchangeably. draggedChapterId also drives
  // the drop-target highlight while a drag is in progress.
  const [draggedChapterId, setDraggedChapterId] = useState<number | null>(null)
  const [dragOverLabel, setDragOverLabel] = useState<string | null>(null)

  const loadSyllabus = useCallback(async () => {
    setLoading(true)
    try {
      // Always fetch every subject for this class, never scoped to
      // selectedSubject — this function is also called to refresh after any
      // mutation (add chapter/topic, bootstrap, mark complete), and a
      // subject-scoped response here would silently truncate `subjects` down
      // to just the one being edited, dropping every other subject's tab.
      const yearParam = academicYear ? `&academic_year=${encodeURIComponent(academicYear)}` : ''
      const res = await fetch(`/api/syllabus?school_id=${schoolId}&class_id=${classId}${yearParam}`)
      const data = await res.json()
      const fetched: SylSubject[] = Array.isArray(data.subjects) ? data.subjects : []
      // Class teachers see every subject for their own class; everyone else
      // is gated to exactly what Class Management assigned them.
      const list = (!isClassTeacher && allowedSubjects)
        ? fetched.filter(s => allowedSubjects.includes(s.subject))
        : fetched
      setSubjects(list)
      // Auto-select: first (and usually only) subject this teacher is allowed to see
      if (!selectedSubject && list.length > 0) {
        const own = teacher && !isClassTeacher ? list.find(s => s.subject === teacher.subject) : null
        setSelectedSubject(own ? own.subject : list[0].subject)
      }
    } finally {
      setLoading(false)
    }
  }, [classId, schoolId, selectedSubject, teacher, isClassTeacher, allowedSubjects, academicYear])

  useEffect(() => { loadSyllabus() }, [classId, schoolId, academicYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentSubject = subjects.find(s => s.subject === selectedSubject)

  // Class Syllabus Setup — check whether the active subject needs the
  // first-time Setup screen. Only relevant once a subject actually HAS
  // chapters (a genuinely empty subject goes to the bootstrap panel below
  // instead, same as before this feature existed — Setup is for curating
  // existing content, not gating an empty one). Checked once per subject per
  // mount (cached in setupStatus so switching subject tabs back and forth
  // doesn't re-fetch every time), and re-checked after loadSyllabus() so a
  // freshly-bootstrapped subject (0 -> N chapters) picks up the gate on its
  // next render instead of silently skipping Setup forever.
  useEffect(() => {
    if (!selectedSubject || !currentSubject || currentSubject.chapters.length === 0 || readOnly) return
    if (selectedSubject in setupStatus) return
    let cancelled = false
    const yearParam = academicYear ? `&academic_year=${encodeURIComponent(academicYear)}` : ''
    ;(async () => {
      try {
        const res = await fetch(`/api/syllabus/setup?school_id=${schoolId}&class_id=${classId}&subject=${encodeURIComponent(selectedSubject)}${yearParam}`)
        const data: { setup_completed_at: string | null; chapters?: SetupChapter[] } = await res.json()

        // Resolve the sibling check (if needed) BEFORE writing setupStatus —
        // setupStatus is this effect's own dependency, so writing it triggers
        // an immediate re-run whose cleanup sets `cancelled = true`. Writing
        // it first (as the previous version of this effect did) raced the
        // cleanup against this same async chain's still-pending sibling
        // fetch: by the time the fetch resolved, `cancelled` was already
        // true and setSetupMode('sibling-prompt') silently never ran,
        // leaving the whole tracking view blank (needsSetup still true, but
        // no Setup screen and no sibling prompt ever opened either). Doing
        // every step that depends on `cancelled` first, and writing
        // setupStatus only once as the very last state update, avoids the
        // self-cancellation entirely.
        let nextMode: 'first-time' | 'sibling-prompt' | null = null
        if (!data.setup_completed_at && Array.isArray(data.chapters)) {
          if (cancelled) return
          setSetupTree(data.chapters)
          setSetupChapterChecked({})
          setSetupTopicChecked({})
          setSetupOrg('full')
          setSetupSemesterCount('')
          setSetupSemesterLabels({})

          nextMode = 'first-time'
          try {
            const siblingRes = await fetch(`/api/syllabus/setup/siblings?school_id=${schoolId}&class_id=${classId}&subject=${encodeURIComponent(selectedSubject)}${yearParam}`)
            const siblingData = await siblingRes.json()
            if (cancelled) return
            if (Array.isArray(siblingData.siblings) && siblingData.siblings.length > 0) {
              setSiblingSetups(siblingData.siblings)
              setSiblingSchoolSubjectId(siblingData.school_subject_id ?? null)
              nextMode = 'sibling-prompt'
            }
          } catch { /* fall through to the normal first-time flow */ }
        }

        if (cancelled) return
        if (nextMode) setSetupMode(nextMode)
        setSetupStatus(prev => ({ ...prev, [selectedSubject]: data.setup_completed_at ?? null }))
      } catch {
        if (!cancelled) setSetupStatus(prev => ({ ...prev, [selectedSubject]: 'error' }))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, currentSubject?.chapters.length, readOnly, setupStatus])

  // Hard gate: a subject with real chapters that has never completed Setup
  // shows NOTHING of the normal tracking view — no chapter list, no book
  // tabs, no progress bar — until the teacher runs Setup at least once. This
  // is stronger than gating on setupMode alone (which depends on the
  // separate fetch effect above having already resolved): currentSubject's
  // own setup_completed_at comes back on the very same GET /api/syllabus
  // response that populated `subjects`, so this is true synchronously with
  // the data itself, closing any timing gap where the tracking view could
  // flash before the Setup-check effect fires. A genuinely empty subject
  // (0 chapters) is unaffected — that still goes to the bootstrap panel,
  // which is a prerequisite to Setup, not an alternative to it.
  const needsSetup = !!currentSubject && currentSubject.chapters.length > 0 && !currentSubject.setup_completed_at && !readOnly

  // This class's own Semester 1/2/... tabs — only shown when the teacher
  // actually ran Setup in Semester Wise mode for this subject. Filters
  // BEFORE the book-tab split below, since a class's semester grouping
  // spans every book in the subject, not just one.
  const classSemesterChoices = currentSubject?.semester_mode && currentSubject.semester_count
    ? Array.from({ length: currentSubject.semester_count }, (_, i) => `Semester ${i + 1}`)
    : []
  const effectiveClassSemester = classSemesterChoices.includes(activeClassSemester)
    ? activeClassSemester
    : (classSemesterChoices[0] || '')
  const chaptersForClassSemester = currentSubject
    ? (classSemesterChoices.length > 0
        ? currentSubject.chapters.filter(c => c.class_semester_label === effectiveClassSemester)
        : currentSubject.chapters)
    : []

  // Group chapters by the board's own semester column when the subject uses
  // it — falls back to a single flat bucket (no header) otherwise.
  const semesterGroups: { semester: string | null; chapters: SylChapter[] }[] = currentSubject
    ? (chaptersForClassSemester.some(c => c.semester)
      ? Object.values(
          chaptersForClassSemester.reduce((acc, ch) => {
            const key = ch.semester || ' none'
            if (!acc[key]) acc[key] = { semester: ch.semester || null, chapters: [] }
            acc[key].chapters.push(ch)
            return acc
          }, {} as Record<string, { semester: string | null; chapters: SylChapter[] }>)
        )
      : [{ semester: null, chapters: chaptersForClassSemester }])
    : []

  // Textbooks/handbooks uploaded once per subject on the platform side —
  // teachers see both types (unlike students, who only ever get textbooks).
  const [materials, setMaterials] = useState<{ id: number; material_type: 'textbook' | 'handbook'; title: string; file_url: string }[]>([])
  useEffect(() => {
    if (!selectedSubject) { setMaterials([]); return }
    const params = new URLSearchParams({ school_id: String(schoolId), grade, subject_name: selectedSubject })
    fetch(`/api/school/subjects/materials?${params}`)
      .then(r => r.json())
      .then(data => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]))
  }, [schoolId, grade, selectedSubject])

  async function addCustomTopic(chapter: SylChapter) {
    const name = newTopicName.trim()
    if (!name) return
    setAddingTopic(true)
    try {
      const res = await fetch('/api/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          class_id: classId,
          subject: selectedSubject,
          chapter_name: chapter.chapter_name,
          chapter_order: chapter.chapter_order,
          // Only matters if the chapter genuinely doesn't exist yet server-side
          // (find-or-create) — passed through so it never silently starts a
          // new book group in that edge case, matching the fix in
          // addCustomChapter() below.
          book_type: chapter.book_type,
          book_name: chapter.book_name,
          audience: chapter.audience,
          topic_name: name,
          topic_order: chapter.topics.length,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add topic')
      flash(`"${name}" added to ${chapter.chapter_name}`)
      setNewTopicName('')
      await loadSyllabus()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Failed to add topic')
    } finally {
      setAddingTopic(false)
    }
  }

  async function addCustomChapter() {
    const name = newChapterName.trim()
    if (!name || !selectedSubject) return
    setCreatingChapter(true)
    try {
      // Inherit the subject's own book_type/book_name/audience rather than
      // leaving them NULL, so a new custom chapter lines up with the rest of
      // the subject's chapters instead of drifting to different values.
      const sourceChapter = currentSubject?.chapters[0]
      const res = await fetch('/api/syllabus/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          class_id: classId,
          subject: selectedSubject,
          chapter_name: name,
          book_type: sourceChapter?.book_type,
          book_name: sourceChapter?.book_name,
          audience: sourceChapter?.audience,
          // Auto-assign to whichever Semester tab the teacher is currently
          // viewing — otherwise a subject in Semester Wise mode would create
          // this chapter active but invisible under every semester tab until
          // a separate trip through Edit Syllabus Setup to assign it one.
          semester_label: classSemesterChoices.length > 0 ? effectiveClassSemester : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add chapter')
      flash(`"${name}" added to ${selectedSubject}`)
      setNewChapterName('')
      setAddingChapter(false)
      setExpandedChapter(name)
      await loadSyllabus()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Failed to add chapter')
    } finally {
      setCreatingChapter(false)
    }
  }

  // Delete a custom chapter/topic — mirrors the guardrails the API already
  // enforces (board-mandated content can never be deleted; only this class's
  // own assigned teacher for the subject can delete its custom content), so
  // these buttons are simply not rendered for anything the request would be
  // rejected for anyway. Cascades away any progress recorded against a
  // deleted chapter's topics — irreversible, hence the confirm().
  const [deletingChapter, setDeletingChapter] = useState<string | null>(null)
  const [deletingTopicId, setDeletingTopicId] = useState<number | null>(null)

  // Rename any chapter — board-mandated or custom, per explicit product
  // direction: this only ever edits the school's own school_chapters copy,
  // never the platform-wide master_chapters catalog other schools draw
  // from, so there's no cross-school leakage risk in opening this up.
  // Non-destructive, so it skips delete's confirm().
  const [renamingChapterId, setRenamingChapterId] = useState<number | null>(null)
  const [renameChapterName, setRenameChapterName] = useState('')
  const [savingChapterRename, setSavingChapterRename] = useState(false)

  async function saveChapterRename(chapter: SylChapter) {
    const name = renameChapterName.trim()
    if (!name || !chapter.school_chapter_id) return
    setSavingChapterRename(true)
    try {
      const res = await fetch(`/api/syllabus/chapters/${chapter.school_chapter_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, chapter_name: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to rename chapter')
      flash(`Renamed to "${name}"`)
      setRenamingChapterId(null)
      if (expandedChapter === chapter.chapter_name) setExpandedChapter(name)
      await loadSyllabus()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Failed to rename chapter')
    } finally {
      setSavingChapterRename(false)
    }
  }

  // Rename any topic — same "board-mandated or custom, school's own copy
  // only" reasoning as chapter rename above. Mirrors saveChapterRename's
  // shape exactly, just against PATCH /api/syllabus/:id instead.
  const [renamingTopicId, setRenamingTopicId] = useState<number | null>(null)
  const [renameTopicName, setRenameTopicName] = useState('')
  const [savingTopicRename, setSavingTopicRename] = useState(false)

  async function saveTopicRename(topic: SylTopic) {
    const name = renameTopicName.trim()
    if (!name) return
    setSavingTopicRename(true)
    try {
      const res = await fetch(`/api/syllabus/${topic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, topic_name: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to rename topic')
      flash(`Renamed to "${name}"`)
      setRenamingTopicId(null)
      await loadSyllabus()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Failed to rename topic')
    } finally {
      setSavingTopicRename(false)
    }
  }

  async function deleteCustomChapter(chapter: SylChapter) {
    if (!selectedSubject) return
    if (!window.confirm(`Delete "${chapter.chapter_name}" and all its topics? This can't be undone.`)) return
    setDeletingChapter(chapter.chapter_name)
    try {
      const params = new URLSearchParams({
        school_id: String(schoolId), class_id: String(classId),
        subject: selectedSubject, chapter_name: chapter.chapter_name,
      })
      const res = await fetch(`/api/syllabus?${params}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete chapter')
      flash(`"${chapter.chapter_name}" deleted`)
      await loadSyllabus()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Failed to delete chapter')
    } finally {
      setDeletingChapter(null)
    }
  }

  async function deleteCustomTopic(topic: SylTopic) {
    if (!window.confirm(`Delete "${topic.topic_name}"? This can't be undone.`)) return
    setDeletingTopicId(topic.id)
    try {
      const params = new URLSearchParams({ school_id: String(schoolId), class_id: String(classId) })
      const res = await fetch(`/api/syllabus/${topic.id}?${params}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete topic')
      flash(`"${topic.topic_name}" deleted`)
      await loadSyllabus()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Failed to delete topic')
    } finally {
      setDeletingTopicId(null)
    }
  }

  // "Edit Syllabus Setup" re-entry — reopens the same screen, but PRE-FILLED
  // with the teacher's actual current selection (checked = currently
  // active), never blank. The unchecked-by-default behavior is exclusive to
  // the very first setup pass, handled by the auto-open effect above.
  async function openEditSetup() {
    if (!selectedSubject) return
    setSetupError('')
    setSetupLoading(true)
    setSetupMode('edit')
    try {
      const yearParam = academicYear ? `&academic_year=${encodeURIComponent(academicYear)}` : ''
      const res = await fetch(`/api/syllabus/setup?school_id=${schoolId}&class_id=${classId}&subject=${encodeURIComponent(selectedSubject)}${yearParam}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load syllabus setup')
      const tree: SetupChapter[] = Array.isArray(data.chapters) ? data.chapters : []
      setSetupTree(tree)
      const chChecked: Record<number, boolean> = {}
      const tpChecked: Record<number, boolean> = {}
      const semLabels: Record<number, string> = {}
      for (const ch of tree) {
        chChecked[ch.school_chapter_id] = ch.is_active
        if (ch.semester_label) semLabels[ch.school_chapter_id] = ch.semester_label
        for (const t of ch.topics) tpChecked[t.school_topic_id] = t.is_active
      }
      setSetupChapterChecked(chChecked)
      setSetupTopicChecked(tpChecked)
      setSetupSemesterLabels(semLabels)
      setSetupOrg(data.semester_mode ? 'semester' : 'full')
      setSetupSemesterCount(data.semester_count ? String(data.semester_count) : '')
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : 'Failed to load syllabus setup')
      setSetupMode('closed')
    } finally {
      setSetupLoading(false)
    }
  }

  // "Inactive Chapters" tab — fetched on demand the first time it's opened
  // per subject switch (see the subject-tab onClick, which clears the cache).
  async function loadInactiveChapters() {
    if (!selectedSubject || inactiveChaptersTree) return
    setInactiveChaptersLoading(true)
    try {
      const yearParam = academicYear ? `&academic_year=${encodeURIComponent(academicYear)}` : ''
      const res = await fetch(`/api/syllabus/setup?school_id=${schoolId}&class_id=${classId}&subject=${encodeURIComponent(selectedSubject)}${yearParam}`)
      const data = await res.json()
      setInactiveChaptersTree(Array.isArray(data.chapters) ? data.chapters : [])
    } catch {
      setInactiveChaptersTree([])
    } finally {
      setInactiveChaptersLoading(false)
    }
  }

  function toggleSetupChapter(chapter: SetupChapter, checked: boolean) {
    setSetupChapterChecked(prev => ({ ...prev, [chapter.school_chapter_id]: checked }))
    // Checking a chapter auto-checks all its topics, and unchecking it
    // auto-unchecks all its topics — "I want this chapter" defaults to
    // "and everything in it," matching what a teacher actually expects
    // (checking a chapter but leaving every topic under it unchecked
    // previously submitted the chapter with zero visible topics on Apply,
    // which read as broken). A teacher can still uncheck individual topics
    // afterward to exclude just one within an otherwise-included chapter —
    // that per-topic override is untouched by this.
    setSetupTopicChecked(prev => {
      const next = { ...prev }
      for (const t of chapter.topics) next[t.school_topic_id] = checked
      return next
    })
  }

  function toggleSetupTopic(topicId: number, checked: boolean) {
    setSetupTopicChecked(prev => ({ ...prev, [topicId]: checked }))
  }

  async function applySetup() {
    if (!selectedSubject || !setupTree) return
    const anyChapterChecked = setupTree.some(ch => setupChapterChecked[ch.school_chapter_id])
    if (!anyChapterChecked) {
      const ok = window.confirm('This will hide the entire subject from your class — continue?')
      if (!ok) return
    }
    if (setupOrg === 'semester') {
      const count = parseInt(setupSemesterCount, 10)
      if (!count || count < 1) {
        setSetupError('Enter how many semesters this subject has.')
        return
      }
      // Only checked chapters need a semester — an unchecked chapter is
      // hidden from the class either way, so which semester it "would have
      // been in" doesn't matter.
      const missing = setupTree.some(ch => setupChapterChecked[ch.school_chapter_id] && !setupSemesterLabels[ch.school_chapter_id])
      if (missing) {
        setSetupError('Assign a semester to every selected chapter before applying.')
        return
      }
    }
    setApplyingSetup(true)
    setSetupError('')
    try {
      const payload = {
        school_id: schoolId,
        class_id: classId,
        subject: selectedSubject,
        academic_year: academicYear,
        semester_mode: setupOrg === 'semester',
        semester_count: setupOrg === 'semester' ? parseInt(setupSemesterCount, 10) : null,
        chapters: setupTree.map(ch => ({
          school_chapter_id: ch.school_chapter_id,
          is_active: !!setupChapterChecked[ch.school_chapter_id],
          semester_label: setupOrg === 'semester' ? (setupSemesterLabels[ch.school_chapter_id] || null) : null,
          topics: ch.topics.map(t => ({
            school_topic_id: t.school_topic_id,
            is_active: !!setupTopicChecked[t.school_topic_id],
          })),
        })),
      }
      const res = await fetch('/api/syllabus/setup/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to apply syllabus setup')
      setSetupStatus(prev => ({ ...prev, [selectedSubject]: data.setup_completed_at ?? new Date().toISOString() }))
      setSetupMode('closed')
      setSetupTree(null)
      flash('Syllabus setup saved')
      await loadSyllabus()
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : 'Failed to apply syllabus setup')
    } finally {
      setApplyingSetup(false)
    }
  }

  function cancelSetup() {
    // Only escapable on a re-edit — the very first setup pass for a subject
    // has no tracking view to fall back to yet (nothing has ever been
    // selected), so there's nothing sensible to cancel back to.
    if (setupMode !== 'edit') return
    setSetupMode('closed')
    setSetupTree(null)
    setSetupError('')
  }

  // Loads the read-only preview tree for a sibling class's setup — same data
  // source (GET /api/syllabus/setup) the teacher's own Setup screen and
  // admin's drill-down already use, just pointed at the sibling's class_id.
  async function openSiblingPreview(sibling: SiblingSetup) {
    setPreviewSibling(sibling)
    setPreviewTree(null)
    setPreviewLoading(true)
    setSetupMode('sibling-preview')
    try {
      const yearParam = academicYear ? `&academic_year=${encodeURIComponent(academicYear)}` : ''
      const res = await fetch(`/api/syllabus/setup?school_id=${schoolId}&class_id=${sibling.class_id}&subject=${encodeURIComponent(selectedSubject)}${yearParam}`)
      const data = await res.json()
      setPreviewTree(Array.isArray(data.chapters) ? data.chapters : [])
    } catch {
      setPreviewTree([])
    } finally {
      setPreviewLoading(false)
    }
  }

  async function confirmSiblingCopy() {
    if (!previewSibling || !siblingSchoolSubjectId) return
    setCopyingSibling(true)
    setSetupError('')
    try {
      const res = await fetch('/api/syllabus/setup/copy-from-sibling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          source_class_id: previewSibling.class_id,
          target_class_id: classId,
          school_subject_id: siblingSchoolSubjectId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to copy syllabus setup')
      setSetupStatus(prev => ({ ...prev, [selectedSubject]: data.setup_completed_at ?? new Date().toISOString() }))
      setSetupMode('closed')
      setSetupTree(null)
      setPreviewSibling(null)
      setPreviewTree(null)
      setSiblingSetups([])
      flash(`Copied Section ${previewSibling.section}'s syllabus setup`)
      await loadSyllabus()
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : 'Failed to copy syllabus setup')
    } finally {
      setCopyingSibling(false)
    }
  }

  async function handleBootstrapImport(json: string) {
    if (!selectedSubject) return
    setBootstrapError('')
    setBootstrapping(true)
    try {
      const res = await fetch('/api/school/syllabus/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: classId, subject: selectedSubject, json }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      flash(`Imported ${data.chapters} chapter${data.chapters === 1 ? '' : 's'} into ${selectedSubject}`)
      setBootstrapMode('none')
      await loadSyllabus()
    } catch (err: unknown) {
      setBootstrapError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBootstrapping(false)
    }
  }

  async function handleBootstrapCount() {
    if (!selectedSubject) return
    const n = Number(chapterCount)
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      setBootstrapError('Enter a whole number between 1 and 50.')
      return
    }
    setBootstrapError('')
    setBootstrapping(true)
    try {
      const res = await fetch('/api/school/syllabus/bootstrap-chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: classId, subject: selectedSubject, count: n }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create chapters')
      flash(`Created ${data.chapters.length} chapter${data.chapters.length === 1 ? '' : 's'} — rename them to match your textbook`)
      setBootstrapMode('none')
      setChapterCount('')
      await loadSyllabus()
    } catch (err: unknown) {
      setBootstrapError(err instanceof Error ? err.message : 'Failed to create chapters')
    } finally {
      setBootstrapping(false)
    }
  }


  // "Mark taught" — flips school_topic_progress.status between covered/pending
  // via PATCH /api/syllabus/:id, the only real progress state the API supports.
  // TODO(syllabus-unlock): the Ulearn prototype's "mark taught auto-unlocks the
  // next topic + opens its quiz to students" has no backing today — there is no
  // locked/unlocked column, ordering gate, or quiz-visibility gate in the schema
  // or API (TopicContentViewer already shows every topic's quiz unconditionally
  // to students regardless of status). Marking a topic taught here only updates
  // this topic's own progress row; it does not lock/unlock siblings. Needs new
  // schema + API work before that flow can be real.
  async function markCovered(topic: SylTopic) {
    if (!teacher || readOnly) return
    const newStatus = topic.status === 'covered' ? 'pending' : 'covered'
    setMarkingId(topic.id)
    try {
      await fetch(`/api/syllabus/${topic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: classId, status: newStatus, covered_by: teacher.id }),
      })
      flash(newStatus === 'covered' ? `"${topic.topic_name}" marked taught` : `"${topic.topic_name}" marked pending`)
      // Reload to sync counts — loadSyllabus always fetches every subject
      // for this class, so this can't truncate `subjects` down to just the
      // one being edited.
      await loadSyllabus()
    } finally {
      setMarkingId(null)
    }
  }

  if (loading) return (
    <div className="py-16 text-center">
      <Loader2 size={22} className="animate-spin mx-auto mb-3" style={{ color: GOLD }} />
      <p className="text-gray-400 text-sm">Loading syllabus...</p>
    </div>
  )

  if (subjects.length === 0) return (
    <div className="bg-white rounded-2xl border border-dashed py-14 text-center" style={{ borderColor: BORDER }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: '#FCEBDB' }}>
        <BookOpen size={22} style={{ color: GOLD }} />
      </div>
      <p className="font-medium mb-1" style={{ color: INK }}>No syllabus loaded yet</p>
      <p className="text-gray-400 text-sm">Ask the school admin to load the board syllabus in School Settings.</p>
    </div>
  )

  return (
    <div>
      {/* Subject tabs */}
      {subjects.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-5">
          {subjects.map(s => {
            const active = selectedSubject === s.subject
            return (
              <button key={s.subject}
                onClick={() => { setSelectedSubject(s.subject); setExpandedChapter(null); setShowInactiveChapters(false); setInactiveChaptersTree(null) }}
                data-testid={`syllabus-subject-${s.subject}`}
                className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
                style={{ background: active ? GOLD : 'white', color: active ? 'white' : INK, borderColor: active ? GOLD : BORDER }}>
                {s.subject}
                <span className="ml-2 text-xs" style={{ color: active ? 'white' : '#9ca3af', opacity: active ? 0.85 : 1 }}>
                  {s.completion_pct}%
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Sibling-setup copy prompt — shown instead of the blank first-time
          Setup screen when another class in this grade already completed
          Setup for this subject. "No" falls through to the exact same
          blank first-time flow as before this feature existed. */}
      {setupMode === 'sibling-prompt' && currentSubject && (
        <div className="mb-5 bg-white rounded-2xl border shadow-sm" style={{ borderColor: PURPLE }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: BORDER }}>
            <div className="text-sm font-semibold flex items-center gap-2" style={{ color: INK }}>
              <BookOpen size={15} style={{ color: PURPLE }} />
              Already set up for this grade
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {siblingSetups.length === 1
                ? `${siblingSetups[0].setup_by_name ?? 'A teacher'} already set up ${selectedSubject} for Grade ${siblingSetups[0].grade} (Section ${siblingSetups[0].section}). Use the same setup for this class?`
                : `${siblingSetups.length} other sections of Grade ${siblingSetups[0]?.grade} already have ${selectedSubject} set up. Copy one of them, or set up this class on your own.`}
            </p>
          </div>
          <div className="p-5 space-y-2">
            {siblingSetups.map(s => (
              <div key={s.class_id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: BORDER }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: INK }}>Section {s.section}{s.setup_by_name ? ` — ${s.setup_by_name}` : ''}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.active_chapters} chapter{s.active_chapters === 1 ? '' : 's'}{s.semester_mode && s.semester_count ? ` · ${s.semester_count} semesters` : ''}
                  </p>
                </div>
                <button
                  onClick={() => openSiblingPreview(s)}
                  data-testid={`setup-sibling-preview-${s.class_id}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex-shrink-0"
                  style={{ background: PURPLE }}>
                  Preview & use this
                </button>
              </div>
            ))}
            <button
              onClick={() => setSetupMode('first-time')}
              data-testid="setup-sibling-decline"
              className="text-xs font-semibold px-3 py-2 rounded-lg border mt-1"
              style={{ borderColor: BORDER, color: INK }}>
              No, set up this class on my own
            </button>
          </div>
        </div>
      )}

      {/* Sibling-setup preview — read-only, same visual as admin's own
          per-class Setup drill-down, so the teacher sees exactly what
          they're about to copy before confirming. */}
      {setupMode === 'sibling-preview' && previewSibling && currentSubject && (
        <div className="mb-5 bg-white rounded-2xl border shadow-sm" style={{ borderColor: PURPLE }}>
          <div className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: BORDER }}>
            <div>
              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: INK }}>
                <BookOpen size={15} style={{ color: PURPLE }} />
                Section {previewSibling.section}&apos;s setup — {selectedSubject}
              </div>
              <p className="text-xs text-gray-400 mt-1">Read-only preview. Confirm to copy this exact setup to your class.</p>
            </div>
            <button onClick={() => setSetupMode('sibling-prompt')} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0" aria-label="Back">
              <X size={15} />
            </button>
          </div>
          <div className="p-5 space-y-3">
            {previewLoading || !previewTree ? (
              <p className="text-xs text-gray-400 py-4">Loading…</p>
            ) : (() => {
              const active = previewTree.filter(ch => ch.is_active).sort((a, b) => a.chapter_order - b.chapter_order)
              const inactive = previewTree.filter(ch => !ch.is_active).sort((a, b) => a.chapter_order - b.chapter_order)
              return (
                <>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {active.map(ch => (
                      <div key={ch.school_chapter_id} className="rounded-xl border p-3" style={{ borderColor: BORDER, background: SURFACE }}>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-semibold" style={{ color: INK }}>{ch.chapter_name}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {ch.topics.filter(t => t.is_active).length}/{ch.topics.length} topics
                            {ch.semester_label ? ` · ${ch.semester_label}` : ''}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {ch.topics.filter(t => t.is_active).sort((a, b) => a.topic_order - b.topic_order).map(t => (
                            <div key={t.school_topic_id} className="text-[11px] px-2 py-1 rounded-lg" style={{ background: 'white', color: INK }}>
                              {t.topic_name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {inactive.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-gray-400 select-none">
                        {inactive.length} inactive chapter{inactive.length === 1 ? '' : 's'}
                      </summary>
                      <div className="mt-1.5 space-y-0.5">
                        {inactive.map(ch => (
                          <div key={ch.school_chapter_id} className="line-through text-gray-400 text-[11px]">{ch.chapter_name}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )
            })()}
          </div>
          <div className="px-5 py-4 border-t flex items-center gap-2" style={{ borderColor: BORDER }}>
            <button onClick={confirmSiblingCopy} disabled={copyingSibling || previewLoading}
              data-testid="setup-sibling-confirm"
              className="text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-50"
              style={{ background: PURPLE }}>
              {copyingSibling ? 'Applying…' : 'Use this setup'}
            </button>
            <button onClick={() => setSetupMode('sibling-prompt')} className="text-sm px-3 py-2 rounded-xl border" style={{ borderColor: BORDER, color: INK }}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* Class Syllabus Setup — a one-time-per-(class,subject) curation
          checkpoint, reusing the same dashed/solid-card visual pattern as
          the empty-subject bootstrap panel below. First-time: opened
          automatically by the effect above, everything unchecked, teacher
          actively opts in. Re-edit (via "Edit Syllabus Setup"): pre-filled
          with the actual current selection. Either way, nothing is written
          to class_chapter_visibility/class_topic_visibility until Apply. */}
      {(setupMode === 'first-time' || setupMode === 'edit') && currentSubject && (
        <div className="mb-5">
          {setupLoading || !setupTree ? (
            <div className="bg-white rounded-2xl border py-10 text-center" style={{ borderColor: BORDER }}>
              <Loader2 size={20} className="animate-spin mx-auto mb-2" style={{ color: PURPLE }} />
              <p className="text-gray-400 text-sm">Loading syllabus setup…</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border shadow-sm" style={{ borderColor: PURPLE }}>
              <div className="px-5 py-4 border-b flex items-start justify-between gap-3" style={{ borderColor: BORDER }}>
                <div>
                  <div className="text-sm font-semibold flex items-center gap-2" style={{ color: INK }}>
                    <BookOpen size={15} style={{ color: PURPLE }} />
                    {setupMode === 'first-time' ? `Set up ${selectedSubject} for this class` : `Edit syllabus setup — ${selectedSubject}`}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {setupMode === 'first-time'
                      ? 'Pick which chapters and topics your class should see. Nothing is shown to you or students until you Apply — the import isn’t always accurate, so start from what actually applies here.'
                      : 'Your class’s current selection is pre-filled below. Change anything and Apply to update it.'}
                  </p>
                </div>
                {setupMode === 'edit' && (
                  <button onClick={cancelSetup} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0" aria-label="Cancel">
                    <X size={15} />
                  </button>
                )}
              </div>

              {setupError && (
                <div className="mx-5 mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: '#FEECEC', color: '#B42318' }}>
                  {setupError}
                </div>
              )}

              {/* Full Syllabus vs Semester Wise — purely how the list below
                  organizes itself; the select/deselect flow is identical
                  either way. */}
              <div className="px-5 pt-4 flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: SURFACE }}>
                  {(['full', 'semester'] as const).map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setSetupOrg(mode)}
                      data-testid={`setup-org-${mode}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: setupOrg === mode ? PURPLE : 'transparent', color: setupOrg === mode ? 'white' : '#6b7280' }}>
                      {mode === 'full' ? 'Full Syllabus' : 'Semester Wise'}
                    </button>
                  ))}
                </div>
                {setupOrg === 'semester' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">No. of semesters</span>
                    <input type="number" min={1} max={6}
                      value={setupSemesterCount}
                      onChange={e => setSetupSemesterCount(e.target.value)}
                      data-testid="setup-semester-count-input"
                      placeholder="e.g. 2"
                      className="w-16 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2"
                      style={{ borderColor: BORDER, color: INK }} />
                  </div>
                )}
              </div>

              {(() => {
                const semesterCountNum = parseInt(setupSemesterCount, 10) || 0
                const semesterChoices = Array.from({ length: semesterCountNum }, (_, i) => `Semester ${i + 1}`)
                const draggable = setupOrg === 'semester' && semesterCountNum > 0

                // Dropping a chapter onto a semester box (or the Unassigned
                // box) checks it (a chapter can't usefully belong to a
                // semester while deselected) and sets/clears its
                // semester_label — dropping on Unassigned clears the label
                // rather than deleting the chapter from the payload.
                const dropOn = (label: string | null) => (e: React.DragEvent) => {
                  e.preventDefault()
                  setDragOverLabel(null)
                  if (draggedChapterId == null) return
                  if (label) {
                    // Same "checking a chapter checks its topics" default as
                    // toggleSetupChapter — a drag-drop is a check action too,
                    // it just also sets the semester in the same gesture.
                    const draggedChapter = setupTree!.find(c => c.school_chapter_id === draggedChapterId)
                    setSetupChapterChecked(prev => ({ ...prev, [draggedChapterId]: true }))
                    if (draggedChapter) {
                      setSetupTopicChecked(prev => {
                        const next = { ...prev }
                        for (const t of draggedChapter.topics) next[t.school_topic_id] = true
                        return next
                      })
                    }
                    setSetupSemesterLabels(prev => ({ ...prev, [draggedChapterId]: label }))
                  } else {
                    setSetupSemesterLabels(prev => {
                      const next = { ...prev }
                      delete next[draggedChapterId]
                      return next
                    })
                  }
                  setDraggedChapterId(null)
                }

                const dropBoxStyle = (label: string) => ({
                  background: dragOverLabel === label ? '#F3F0FA' : SURFACE,
                  outline: dragOverLabel === label ? `2px dashed ${PURPLE}` : `1px solid ${BORDER}`,
                  outlineOffset: '-1px',
                })

                const renderChapterRow = (ch: SetupChapter) => {
                  const chChecked = !!setupChapterChecked[ch.school_chapter_id]
                  const isDragging = draggedChapterId === ch.school_chapter_id
                  const assignedLabel = setupSemesterLabels[ch.school_chapter_id]
                  return (
                    <div key={ch.school_chapter_id} className="px-5 py-3"
                      draggable={draggable}
                      onDragStart={draggable ? (e => {
                        setDraggedChapterId(ch.school_chapter_id)
                        e.dataTransfer.effectAllowed = 'move'
                      }) : undefined}
                      onDragEnd={draggable ? (() => { setDraggedChapterId(null); setDragOverLabel(null) }) : undefined}
                      style={{ opacity: isDragging ? 0.4 : 1, cursor: draggable ? 'grab' : undefined }}
                    >
                      <label className="flex items-center gap-3 cursor-pointer">
                        {draggable && (
                          <span className="text-gray-300 flex-shrink-0 select-none" aria-hidden="true" title="Drag up to a semester box">⠿</span>
                        )}
                        <input type="checkbox" checked={chChecked}
                          onChange={e => toggleSetupChapter(ch, e.target.checked)}
                          data-testid={`setup-chapter-${ch.school_chapter_id}`}
                          className="w-4 h-4 rounded flex-shrink-0" style={{ accentColor: PURPLE }} />
                        <span className="text-sm font-medium flex-1" style={{ color: INK }}>{ch.chapter_name}</span>
                        {setupOrg === 'semester' && assignedLabel && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#EDE9FB', color: PURPLE }}>
                            {assignedLabel}
                          </span>
                        )}
                        {setupOrg === 'semester' && chChecked && semesterCountNum > 0 && (
                          <select
                            value={assignedLabel || ''}
                            onChange={e => setSetupSemesterLabels(prev => ({ ...prev, [ch.school_chapter_id]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                            data-testid={`setup-chapter-semester-${ch.school_chapter_id}`}
                            title="Or pick a semester here instead of dragging"
                            className="text-xs border rounded-lg px-2 py-1 flex-shrink-0 focus:outline-none focus:ring-2"
                            style={{ borderColor: BORDER, color: INK }}>
                            <option value="">Assign semester…</option>
                            {semesterChoices.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                        <span className="text-xs text-gray-400 flex-shrink-0">{ch.topics.length} topic{ch.topics.length === 1 ? '' : 's'}</span>
                      </label>
                      {ch.topics.length > 0 && (
                        <div className="mt-2 ml-7 space-y-1.5">
                          {ch.topics.map(t => (
                            <label key={t.school_topic_id} className="flex items-center gap-2.5 cursor-pointer">
                              <input type="checkbox" checked={!!setupTopicChecked[t.school_topic_id]}
                                onChange={e => toggleSetupTopic(t.school_topic_id, e.target.checked)}
                                data-testid={`setup-topic-${t.school_topic_id}`}
                                className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ accentColor: PURPLE }} />
                              <span className="text-xs text-gray-600">{t.topic_name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                if (setupOrg !== 'semester' || semesterCountNum === 0) {
                  return (
                    <div className="mt-2 max-h-[480px] overflow-y-auto divide-y" style={{ borderColor: BORDER }}>
                      {setupTree.map(renderChapterRow)}
                    </div>
                  )
                }

                // Sticky drop-target boxes — pinned above the scrollable
                // chapter list (not inside it) so a chapter far down the list
                // never has to be dragged through several screens of
                // scrolling to reach its semester; the boxes stay put while
                // the list scrolls underneath. Each box is just a live count
                // — the chapters themselves stay in one flat list below,
                // in their original order, each carrying its own semester
                // badge/dropdown rather than being re-sorted into sections.
                const counts = new Map<string, number>()
                for (const label of semesterChoices) counts.set(label, 0)
                let unassignedCount = 0
                for (const ch of setupTree) {
                  const label = setupSemesterLabels[ch.school_chapter_id]
                  if (label && counts.has(label)) counts.set(label, (counts.get(label) || 0) + 1)
                  else unassignedCount++
                }

                return (
                  <>
                    <div className="px-5 pt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${semesterChoices.length + 1}, minmax(0,1fr))` }}>
                      {semesterChoices.map(label => (
                        <div key={label} className="rounded-xl p-3 text-center transition-colors"
                          style={dropBoxStyle(label)}
                          onDragOver={e => { e.preventDefault(); if (draggedChapterId != null) setDragOverLabel(label) }}
                          onDragLeave={() => setDragOverLabel(prev => (prev === label ? null : prev))}
                          onDrop={dropOn(label)}
                          data-testid={`setup-semester-dropzone-${label.replace(/\s+/g, '-')}`}
                        >
                          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PURPLE }}>{label}</div>
                          <div className="text-lg font-semibold mt-0.5" style={{ color: INK }}>{counts.get(label) || 0}</div>
                          <div className="text-[10px] text-gray-400">chapter{(counts.get(label) || 0) === 1 ? '' : 's'}</div>
                        </div>
                      ))}
                      <div className="rounded-xl p-3 text-center transition-colors"
                        style={dropBoxStyle('__unassigned__')}
                        onDragOver={e => { e.preventDefault(); if (draggedChapterId != null) setDragOverLabel('__unassigned__') }}
                        onDragLeave={() => setDragOverLabel(prev => (prev === '__unassigned__' ? null : prev))}
                        onDrop={dropOn(null)}
                        data-testid="setup-semester-dropzone-unassigned"
                      >
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Unassigned</div>
                        <div className="text-lg font-semibold mt-0.5" style={{ color: INK }}>{unassignedCount}</div>
                        <div className="text-[10px] text-gray-400">chapter{unassignedCount === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    <p className="px-5 pt-2 text-[11px] text-gray-400">Drag a chapter&apos;s ⠿ handle up into a box, or use its own dropdown below.</p>
                    <div className="mt-2 max-h-[420px] overflow-y-auto divide-y" style={{ borderColor: BORDER }}>
                      {setupTree.map(renderChapterRow)}
                    </div>
                  </>
                )
              })()}

              <div className="px-5 py-4 border-t flex items-center gap-2" style={{ borderColor: BORDER }}>
                <button onClick={applySetup} disabled={applyingSetup}
                  data-testid="setup-apply-btn"
                  className="text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-50"
                  style={{ background: PURPLE }}>
                  {applyingSetup ? 'Applying…' : 'Apply'}
                </button>
                {setupMode === 'edit' && (
                  <button onClick={cancelSetup} className="text-sm px-3 py-2 rounded-xl border" style={{ borderColor: BORDER, color: INK }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* This class's own Semester 1/2/... tabs — from the teacher's Setup
          screen. Only shown when Setup was actually run in Semester Wise
          mode for this subject. "Inactive Chapters" sits alongside them —
          chapters the teacher excluded via Setup, read-only, with an Edit
          Setup button to actually change anything. */}
      {setupMode === 'closed' && !needsSetup && currentSubject && currentSubject.chapters.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {classSemesterChoices.map(label => {
            const active = !showInactiveChapters && label === effectiveClassSemester
            const count = currentSubject!.chapters.filter(c => c.class_semester_label === label).length
            return (
              <button key={label}
                onClick={() => { setActiveClassSemester(label); setExpandedChapter(null); setShowInactiveChapters(false) }}
                data-testid={`syllabus-class-semester-${label.replace(/\s+/g, '-')}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                style={{ background: active ? PURPLE : 'white', color: active ? 'white' : PURPLE, borderColor: active ? PURPLE : BORDER }}>
                {label} <span style={{ opacity: 0.75 }}>({count})</span>
              </button>
            )
          })}
          <button
            onClick={() => { setShowInactiveChapters(true); loadInactiveChapters() }}
            data-testid="syllabus-inactive-chapters-tab"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              background: showInactiveChapters ? INK : 'white',
              color: showInactiveChapters ? 'white' : '#9ca3af',
              borderColor: showInactiveChapters ? INK : BORDER,
            }}>
            Inactive Chapters
          </button>
        </div>
      )}

      {/* Inactive Chapters panel — read-only view of what this class's
          teacher excluded via Setup. Sits in place of the normal tracking
          content below (progress bar, materials, chapter accordion) while
          open, same as the pattern needsSetup already uses for the Setup
          screen itself. */}
      {setupMode === 'closed' && !needsSetup && showInactiveChapters && currentSubject && (
        <div className="bg-white rounded-2xl border px-5 py-4 mb-5" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-sm" style={{ color: INK }}>Inactive chapters</p>
              <p className="text-xs text-gray-400 mt-0.5">Excluded from {selectedSubject} via Syllabus Setup — hidden from students, parents and school admin.</p>
            </div>
            {!readOnly && (
              <button onClick={openEditSetup} data-testid="inactive-chapters-edit-setup-btn"
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border flex-shrink-0" style={{ borderColor: BORDER, color: PURPLE }}>
                Edit Syllabus Setup
              </button>
            )}
          </div>
          {inactiveChaptersLoading ? (
            <p className="text-sm text-gray-400 py-4">Loading…</p>
          ) : (() => {
            const inactive = (inactiveChaptersTree ?? []).filter(ch => !ch.is_active).sort((a, b) => a.chapter_order - b.chapter_order)
            if (inactive.length === 0) {
              return <p className="text-sm text-gray-400 py-4">Every chapter in {selectedSubject} is currently active.</p>
            }
            return (
              <div className="space-y-2">
                {inactive.map(ch => (
                  <div key={ch.school_chapter_id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: SURFACE }}>
                    <span className="text-sm" style={{ color: INK }}>{ch.chapter_name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{ch.topics.length} topic{ch.topics.length === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* Overall progress bar */}
      {setupMode === 'closed' && !needsSetup && !showInactiveChapters && currentSubject && (
        <div className="bg-white rounded-2xl border px-5 py-4 mb-5" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold" style={{ color: INK }}>{selectedSubject}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{currentSubject.covered}/{currentSubject.total} topics taught</span>
              {currentSubject.chapters.length > 0 && !readOnly && (
                <button onClick={openEditSetup} data-testid="setup-edit-btn"
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg border" style={{ borderColor: BORDER, color: PURPLE }}>
                  Edit Syllabus Setup
                </button>
              )}
            </div>
          </div>
          <ProgressBar pct={currentSubject.completion_pct} color={GOLD} className="w-full" />
          <p className="text-xs text-gray-400 mt-1.5">{currentSubject.completion_pct}% complete · {currentSubject.chapters.length} chapters</p>
        </div>
      )}

      {/* Textbooks & handbooks for this subject */}
      {setupMode === 'closed' && !needsSetup && !showInactiveChapters && materials.length > 0 && (
        <div className="bg-white rounded-2xl border px-5 py-4 mb-5" style={{ borderColor: BORDER }}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Textbooks & Handbooks</p>
          <div className="flex flex-wrap gap-2">
            {materials.map(m => (
              <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-gray-50" style={{ borderColor: BORDER, color: INK }}>
                <BookOpen size={12} style={{ color: GOLD }} /> {m.title}
                <span className="text-[9px] uppercase opacity-60">({m.material_type})</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Empty-subject bootstrap — this subject was assigned via Class
          Management but has no chapters yet. Two ways in: paste a
          ChatGPT-generated JSON syllabus, or just say how many chapters the
          textbook has and rename dummy chapters afterward. Both funnel into
          the same chapter accordion below once content exists. */}
      {currentSubject && currentSubject.chapters.length === 0 && !readOnly && (
        <div className="mb-5">
          {bootstrapMode === 'none' && (
            <div className="bg-white rounded-2xl border border-dashed py-10 px-6 text-center" style={{ borderColor: BORDER }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: '#FCEBDB' }}>
                <BookOpen size={22} style={{ color: GOLD }} />
              </div>
              <p className="font-medium mb-1" style={{ color: INK }}>No chapters yet for {selectedSubject}</p>
              <p className="text-gray-400 text-sm mb-4">Get started by importing a syllabus or laying down chapter placeholders.</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => { setBootstrapError(''); setBootstrapMode('import') }}
                  data-testid="syllabus-bootstrap-import-btn"
                  className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white"
                  style={{ background: PURPLE }}>
                  <Upload size={14} /> Import from ChatGPT / JSON
                </button>
                <button
                  onClick={() => { setBootstrapError(''); setBootstrapMode('count') }}
                  data-testid="syllabus-bootstrap-count-btn"
                  className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border"
                  style={{ borderColor: BORDER, color: INK }}>
                  <Hash size={14} /> Enter chapter count
                </button>
              </div>
              <button
                onClick={() => setAddingChapter(true)}
                data-testid="syllabus-bootstrap-manual-btn"
                className="text-xs text-gray-400 hover:text-gray-600 mt-3 underline">
                Or add chapters one at a time
              </button>
            </div>
          )}

          {bootstrapMode === 'import' && (
            <BulkImportPanel
              title={`Import syllabus — ${selectedSubject}`}
              hint="Paste the JSON produced by ChatGPT (or written by hand) to create chapters and topics for this subject."
              example={SYLLABUS_EXAMPLE}
              prompt={syllabusPrompt(currentSubject.board || 'CBSE', grade, selectedSubject)}
              error={bootstrapError}
              onClose={() => setBootstrapMode('none')}
              onCopyPrompt={copyPrompt}
              actions={[
                { id: 'import', label: bootstrapping ? 'Importing…' : 'Import', color: PURPLE, onClick: handleBootstrapImport },
              ]}
            />
          )}

          {bootstrapMode === 'count' && (
            <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-3" style={{ borderColor: PURPLE }}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-2" style={{ color: INK }}>
                  <Hash size={14} style={{ color: PURPLE }} /> How many chapters does {selectedSubject} have?
                </div>
                <button onClick={() => setBootstrapMode('none')} className="p-1 rounded hover:bg-gray-100 text-gray-400" aria-label="Close">
                  <X size={15} />
                </button>
              </div>
              <p className="text-xs text-gray-400">Creates that many placeholder chapters (&ldquo;Chapter 1&rdquo;, &ldquo;Chapter 2&rdquo;, ...) for you to rename and fill in with subtopics.</p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={50}
                  value={chapterCount}
                  onChange={e => setChapterCount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBootstrapCount()}
                  placeholder="e.g. 12"
                  data-testid="syllabus-bootstrap-count-input"
                  className="w-28 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: BORDER, color: INK }}
                />
                <button
                  onClick={handleBootstrapCount}
                  disabled={bootstrapping || !chapterCount.trim()}
                  data-testid="syllabus-bootstrap-count-submit"
                  className="text-sm px-3 py-1.5 rounded-lg text-white font-medium shadow-sm disabled:opacity-50"
                  style={{ background: PURPLE }}>
                  {bootstrapping ? 'Creating…' : 'Create chapters'}
                </button>
              </div>
              {bootstrapError && (
                <div className="text-xs rounded-lg px-2.5 py-2" style={{ background: '#FCEBEB', color: '#791F1F' }}>
                  {bootstrapError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chapter accordion — textbook index style */}
      {setupMode === 'closed' && !needsSetup && !showInactiveChapters && currentSubject && currentSubject.chapters.length > 0 && (
        <div className="space-y-4">
          {semesterGroups.map(group => (
            <div key={group.semester ?? '__none__'} className="space-y-2">
              {group.semester && (
                <h3 className="text-xs font-bold uppercase tracking-widest px-1" style={{ color: GOLD }}>{group.semester}</h3>
              )}
              {group.chapters.map(ch => {
            // Position within the active class semester — not raw
            // chapter_order, which is one counter shared across the subject.
            const chIdx = chaptersForClassSemester.findIndex(c => c.chapter_name === ch.chapter_name)
            const isExpanded = expandedChapter === ch.chapter_name
            const pct = ch.total > 0 ? Math.round(100 * ch.covered / ch.total) : 0

            const isRenaming = renamingChapterId === ch.school_chapter_id

            return (
              <div key={ch.chapter_name} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
                {/* Chapter header */}
                <div className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                  {isRenaming ? (
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0"
                        style={{ background: pct === 100 ? '#E1F5EE' : '#FCEBDB', color: pct === 100 ? '#085041' : '#8A4B12' }}>
                        {chIdx + 1}
                      </div>
                      <input
                        autoFocus
                        value={renameChapterName}
                        onChange={e => setRenameChapterName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveChapterRename(ch)}
                        data-testid={`syllabus-rename-chapter-input-${chIdx}`}
                        className="flex-1 min-w-0 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
                        style={{ borderColor: BORDER, color: INK }}
                      />
                      <button
                        onClick={() => saveChapterRename(ch)}
                        disabled={savingChapterRename || !renameChapterName.trim()}
                        data-testid={`syllabus-rename-chapter-save-${chIdx}`}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 flex-shrink-0"
                        style={{ background: GOLD }}>
                        {savingChapterRename ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setRenamingChapterId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-2 flex-shrink-0">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExpandedChapter(isExpanded ? null : ch.chapter_name)}
                      data-testid={`syllabus-chapter-toggle-${chIdx}`}
                      className="flex-1 flex items-center gap-4 text-left min-w-0">
                      {/* Chapter number badge */}
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0"
                        style={{ background: pct === 100 ? '#E1F5EE' : '#FCEBDB', color: pct === 100 ? '#085041' : '#8A4B12' }}>
                        {chIdx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-medium">Ch {chIdx + 1}</span>
                          <span className="font-semibold text-sm truncate" style={{ color: INK }}>{ch.chapter_name}</span>
                          {pct === 100 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: '#E1F5EE', color: '#085041' }}>Done</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <ProgressBar pct={pct} color={pct === 100 ? GREEN : GOLD} className="flex-1 max-w-[160px]" />
                          <span className="text-xs text-gray-400">{ch.covered}/{ch.total}</span>
                        </div>
                      </div>
                    </button>
                  )}
                  {/* Rename/Delete — every chapter, board-mandated or
                      custom. Only ever edits this school's own copy, never
                      the shared master catalog, so teachers get full
                      control over their own school's syllabus. */}
                  {!readOnly && !isRenaming && (
                    <button
                      onClick={() => { setRenamingChapterId(ch.school_chapter_id ?? null); setRenameChapterName(ch.chapter_name) }}
                      data-testid={`syllabus-rename-chapter-${chIdx}`}
                      title="Rename chapter"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors flex-shrink-0">
                      <Pencil size={14} />
                    </button>
                  )}
                  {!readOnly && !isRenaming && (
                    <button
                      onClick={() => deleteCustomChapter(ch)}
                      disabled={deletingChapter === ch.chapter_name}
                      data-testid={`syllabus-delete-chapter-${chIdx}`}
                      title="Delete chapter"
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50">
                      <Trash2 size={14} />
                    </button>
                  )}
                  {!isRenaming && (
                    <button
                      onClick={() => setExpandedChapter(isExpanded ? null : ch.chapter_name)}
                      className="flex-shrink-0">
                      <ChevronDown size={16} className="text-gray-400 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }} />
                    </button>
                  )}
                </div>

                {/* Topics list */}
                {isExpanded && ch.topics.length === 0 && (
                  <div className="border-t px-5 py-4 text-xs text-gray-400 italic" style={{ borderColor: BORDER }}>
                    No topics added to this chapter yet.
                  </div>
                )}
                {isExpanded && ch.topics.length > 0 && (
                  <div className="border-t divide-y" style={{ borderColor: BORDER }}>
                    {ch.topics.map((topic, tIdx) => {
                      const isCovered = topic.status === 'covered'
                      const isMarking = markingId === topic.id
                      const isRenamingTopic = renamingTopicId === topic.id

                      return (
                        <div key={topic.id} className="w-full px-5 py-3 flex items-center gap-3" style={{ borderColor: SURFACE }}>
                          {isRenamingTopic ? (
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-gray-300 flex-shrink-0">{tIdx + 1}.</span>
                              <input
                                autoFocus
                                value={renameTopicName}
                                onChange={e => setRenameTopicName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveTopicRename(topic)}
                                data-testid={`syllabus-rename-topic-input-${topic.id}`}
                                className="flex-1 min-w-0 border rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2"
                                style={{ borderColor: BORDER, color: INK }}
                              />
                              <button
                                onClick={() => saveTopicRename(topic)}
                                disabled={savingTopicRename || !renameTopicName.trim()}
                                data-testid={`syllabus-rename-topic-save-${topic.id}`}
                                className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white disabled:opacity-50 flex-shrink-0"
                                style={{ background: GOLD }}>
                                {savingTopicRename ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={() => setRenamingTopicId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 px-1.5 flex-shrink-0">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-gray-300">{tIdx + 1}.</span>
                                  <span className="text-sm" style={{ color: isCovered ? '#9ca3af' : INK, fontWeight: isCovered ? 400 : 500, textDecoration: isCovered ? 'line-through' : undefined }}>
                                    {topic.topic_name}
                                  </span>
                                  {/* Mark Complete — the one action this row needs; quiz count,
                                      AI homework suggestion, and View Material were dropped here
                                      to keep syllabus tracking about completion status only. */}
                                  <button
                                    onClick={() => markCovered(topic)}
                                    disabled={isMarking || readOnly}
                                    title={readOnly ? 'Read-only — viewing a past academic year' : isCovered ? 'Mark as pending' : 'Mark as complete'}
                                    data-testid={`syllabus-mark-taught-${topic.id}`}
                                    className="text-[10px] px-2 py-0.5 rounded-lg font-bold transition-all flex items-center gap-1"
                                    style={{
                                      color: isCovered ? GREEN : 'white',
                                      background: isCovered ? '#E8F8EF' : GREEN,
                                      border: `1px solid ${GREEN}`,
                                      opacity: (isMarking || readOnly) ? 0.5 : 1,
                                    }}>
                                    {isCovered ? <><Check size={11} /> Completed</> : 'Mark Complete'}
                                  </button>
                                </div>
                                {isCovered && topic.covered_date && (
                                  <p className="text-[10px] mt-0.5 ml-5" style={{ color: GREEN }}>
                                    Taught {topic.covered_date}{topic.covered_by_name ? ` · ${topic.covered_by_name}` : ''}
                                  </p>
                                )}
                              </div>
                              {isMarking && (
                                <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: GOLD }} />
                              )}
                              {/* Rename/Delete — every topic, board-mandated or
                                  custom. Only ever edits this school's own copy. */}
                              {!readOnly && (
                                <button
                                  onClick={() => { setRenamingTopicId(topic.id); setRenameTopicName(topic.topic_name) }}
                                  data-testid={`syllabus-rename-topic-${topic.id}`}
                                  title="Rename topic"
                                  className="p-1 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors flex-shrink-0">
                                  <Pencil size={13} />
                                </button>
                              )}
                              {!readOnly && (
                                <button
                                  onClick={() => deleteCustomTopic(topic)}
                                  disabled={deletingTopicId === topic.id}
                                  data-testid={`syllabus-delete-topic-${topic.id}`}
                                  title="Delete topic"
                                  className="p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add custom topic — same POST /api/syllabus used by school-admin's
                    Syllabus Customizer, so it works whether the teacher adds one topic
                    now and more later, or several in a row before marking anything taught.
                    Hidden entirely (not just disabled) when viewing a closed past year. */}
                {isExpanded && !readOnly && (
                  <div className="border-t px-5 py-3" style={{ borderColor: BORDER, background: SURFACE }}>
                    {addTopicChapter === ch.chapter_name ? (
                      <div className="flex gap-2 items-center flex-wrap">
                        <input
                          autoFocus
                          value={newTopicName}
                          onChange={e => setNewTopicName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addCustomTopic(ch)}
                          placeholder="Topic name"
                          data-testid={`syllabus-new-topic-input-${chIdx}`}
                          className="flex-1 min-w-40 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
                          style={{ borderColor: BORDER, color: INK }}
                        />
                        <button
                          onClick={() => addCustomTopic(ch)}
                          disabled={addingTopic || !newTopicName.trim()}
                          data-testid={`syllabus-new-topic-submit-${chIdx}`}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                          style={{ background: GOLD }}>
                          {addingTopic ? 'Adding…' : 'Add'}
                        </button>
                        <button
                          onClick={() => { setAddTopicChapter(null); setNewTopicName('') }}
                          className="text-xs text-gray-400 hover:text-gray-600 px-2">
                          Done
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddTopicChapter(ch.chapter_name); setNewTopicName('') }}
                        data-testid={`syllabus-add-topic-btn-${chIdx}`}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                        style={{ borderColor: BORDER, color: INK }}>
                        + Add Subtopic
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
              })}
            </div>
          ))}

          {/* Add chapter — subject-level, sibling to the accordion above.
              Uses POST /api/syllabus/chapters so a teacher can lay down a
              chapter shell before adding any subtopics. Hidden when
              viewing a closed past year, same as the add-topic control. */}
          {!readOnly && <div className="pt-1">
            {addingChapter ? (
              <div className="bg-white rounded-2xl border px-5 py-3 flex gap-2 items-center flex-wrap" style={{ borderColor: BORDER }}>
                <input
                  autoFocus
                  value={newChapterName}
                  onChange={e => setNewChapterName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomChapter()}
                  placeholder="Chapter name"
                  data-testid="syllabus-new-chapter-input"
                  className="flex-1 min-w-40 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: BORDER, color: INK }}
                />
                <button
                  onClick={addCustomChapter}
                  disabled={creatingChapter || !newChapterName.trim()}
                  data-testid="syllabus-new-chapter-submit"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                  style={{ background: GOLD }}>
                  {creatingChapter ? 'Adding…' : 'Add'}
                </button>
                <button
                  onClick={() => { setAddingChapter(false); setNewChapterName('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setAddingChapter(true); setNewChapterName('') }}
                data-testid="syllabus-add-chapter-btn"
                className="w-full text-sm font-semibold px-4 py-3 rounded-2xl border border-dashed transition-colors hover:bg-gray-50"
                style={{ borderColor: BORDER, color: INK }}>
                + Add Chapter
              </button>
            )}
          </div>}
        </div>
      )}

      <Toast message={toast} />
    </div>
  )
}

export default function ClassView({ classId, grade, section, schoolId, teacherName, teacherId, isClassTeacher, teacher, onBack, initialTab, openExamId, academicYear, readOnly }: Props) {
  const hasTimetableFeature = useFeature('timetable')
  const hasAttendanceFeature = useFeature('attendance')
  const allTabs = isClassTeacher ? CLASS_TEACHER_TABS : SUBJECT_TEACHER_TABS
  const tabs = allTabs.filter(t =>
    (t !== 'Timetable' || hasTimetableFeature) &&
    (t !== 'Attendance' || hasAttendanceFeature)
  )
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : tabs[0])
  const [detailStudent, setDetailStudent] = useState<Student | null>(null)
  // Set when a syllabus topic's "Add Homework" button navigates here — read
  // once by Tasks to open its create form pre-filled, then cleared so
  // switching tabs manually afterward doesn't keep re-triggering it.
  const [homeworkPrefill, setHomeworkPrefill] = useState<{ title: string; subject: string } | null>(null)

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

  // Teacher portal slot editing
  const [editSlot, setEditSlot] = useState<TimetableSlot | null>(null)
  const [roomVal, setRoomVal] = useState<string>('')
  const [savingSlot, setSavingSlot] = useState(false)

  const handleCellClick = (slot: TimetableSlot) => {
    if (!teacher) return
    if (slot.subject_name && slot.subject_name !== teacher.subject) return
    setEditSlot(slot)
    setRoomVal(slot.room || '')
  }

  const saveTeacherSlot = async (isClear: boolean) => {
    if (!editSlot || !teacher) return
    setSavingSlot(true)
    try {
      const payload = {
        id: editSlot.id,
        class_id: classId,
        school_id: schoolId,
        day_of_week: editSlot.day_of_week,
        period_number: editSlot.period_number,
        subject_name: isClear ? null : teacher.subject,
        teacher_id: isClear ? null : teacher.id,
        room: isClear ? null : roomVal.trim(),
        time_from: editSlot.time_from,
        time_to: editSlot.time_to
      }
      
      const res = await fetch('/api/class-timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (res.ok) {
        // Re-fetch all class timetable slots
        const data = await fetch(`/api/class-timetable?class_id=${classId}&school_id=${schoolId}`).then(r => r.json())
        const allSlots: TimetableSlot[] = Array.isArray(data) ? data : []
        setAllTimetableSlots(allSlots)
        // Refresh today's slots too
        const todayDay = getToday()
        const daySlots = allSlots.filter(s => s.day_of_week === todayDay)
          .sort((a, b) => a.period_number - b.period_number)
        setTodaySlots(daySlots)
        setEditSlot(null)
      } else {
        alert('Failed to save slot. Please try again.')
      }
    } catch (err) {
      console.error(err)
      alert('Error updating timetable slot.')
    } finally {
      setSavingSlot(false)
    }
  }

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

  // Index monthlyData once per fetch instead of doing a linear .find()/.filter()
  // over the whole month's records for every (student × day × session) grid
  // cell — for a 40-student class over 30 days that was ~2,400 scans/render.
  // (Declared before the `loading` early return below so hook order stays
  // stable across renders.)
  const monthlyByKey = useMemo(() => {
    const map = new Map<string, AttendanceRecord>()
    for (const r of monthlyData) {
      const dateStr = r.date?.toString().slice(0, 10)
      const sess = r.session || 'morning'
      map.set(`${r.student_id}|${dateStr}|${sess}`, r)
    }
    return map
  }, [monthlyData])

  const monthlyByStudent = useMemo(() => {
    const map = new Map<number, AttendanceRecord[]>()
    for (const r of monthlyData) {
      const list = map.get(r.student_id)
      if (list) list.push(r)
      else map.set(r.student_id, [r])
    }
    return map
  }, [monthlyData])

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
    const rec = monthlyByKey.get(`${studentId}|${dateStr}|${sess}`)
    return rec?.status || null
  }

  // % = (morning_present + afternoon_present + 0.5*late) / total_sessions_taken * 100
  function getStudentMonthPct(studentId: number) {
    const recs = monthlyByStudent.get(studentId)
    if (!recs || recs.length === 0) return null
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
            <button key={tab} onClick={() => { setActiveTab(tab); setDetailStudent(null) }}
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
          onGoToTasks={() => setActiveTab('Homework')}
          onGoToDoubts={() => setActiveTab('Doubts')}
        />
      )}

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'Overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {/* Today's attendance — morning + afternoon 1st period */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 sm:col-span-2">
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
            <div className={`grid gap-4 grid-cols-2 ${subjects.length <= 3 ? 'sm:grid-cols-3' : subjects.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-5'}`}>
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
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div className="sm:col-span-3 bg-white rounded-xl border border-gray-200">
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
            <div className="sm:col-span-2 space-y-4">
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
      {activeTab === 'Students' && detailStudent && (
        <StudentDetail
          student={detailStudent}
          classId={classId}
          schoolId={schoolId}
          backLabel={`Back to ${className} Students`}
          onBack={() => setDetailStudent(null)}
        />
      )}

      {activeTab === 'Students' && !detailStudent && (
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
                  <tr key={student.id} onClick={() => setDetailStudent(student)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
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
                              const canSchedule = !!teacher?.subject
                              return (
                                <td key={day} className="px-2 py-2 border-r border-gray-100 last:border-r-0">
                                  {canSchedule ? (
                                    <button
                                      onClick={() => handleCellClick({
                                        id: 0,
                                        period_number: schedSlot.slot,
                                        time_from: schedSlot.time_from,
                                        time_to: schedSlot.time_to,
                                        subject_name: null,
                                        teacher_name: null,
                                        room: null,
                                        is_break: false,
                                        break_label: null,
                                        day_of_week: day,
                                        substitute_teacher_id: null,
                                        substitute_teacher_name: null
                                      })}
                                      className={`w-full rounded min-h-[42px] flex items-center justify-center ${isToday ? 'bg-orange-50/30 hover:bg-orange-50' : 'bg-gray-50 hover:bg-slate-100'} border border-dashed border-slate-200 hover:border-slate-400 transition-all text-slate-400 hover:text-slate-600 font-semibold cursor-pointer`}
                                    >
                                      <span className="text-[10px]">+ Schedule</span>
                                    </button>
                                  ) : (
                                    <div className={`rounded min-h-[42px] flex items-center justify-center ${isToday ? 'bg-orange-50/30' : 'bg-gray-50'} border border-gray-100`}>
                                      <span className="text-gray-200 text-[10px] italic">Free</span>
                                    </div>
                                  )}
                                </td>
                              )
                            }

                            const isMySubject = slot.subject_name === teacher?.subject

                            return (
                              <td key={day} className={`px-2 py-2 border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-orange-50/20' : ''}`}>
                                {isMySubject ? (
                                  <button
                                    onClick={() => handleCellClick(slot)}
                                    className={`w-full text-left rounded px-2 py-1.5 min-h-[42px] transition-all hover:shadow-sm border cursor-pointer ${
                                      hasSub ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-blue-50 border-blue-100 hover:bg-blue-100'
                                    }`}
                                  >
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
                                      <p className="text-gray-400 text-[10px] mt-0.5">{slot.teacher_name || 'No teacher'} (edit)</p>
                                    )}
                                    {slot.room && <p className="text-gray-300 text-[10px]">{slot.room}</p>}
                                  </button>
                                ) : (
                                  <div className={`rounded px-2 py-1.5 min-h-[42px] border ${hasSub ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}>
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
                                )}
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
      {activeTab === 'Homework' && teacher && (
        <Tasks
          classId={classId}
          grade={grade}
          section={section}
          schoolId={schoolId}
          teacher={teacher}
          prefillTitle={homeworkPrefill?.title}
          prefillSubject={homeworkPrefill?.subject}
          onPrefillConsumed={() => setHomeworkPrefill(null)}
        />
      )}
      {activeTab === 'Homework' && !teacher && (
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

      {/* ── MARKS & RESULTS TAB ─────────────────────────────────────────────── */}
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

      {/* ── SYLLABUS TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'Syllabus' && (
        <SyllabusTracking
          classId={classId}
          schoolId={schoolId}
          grade={grade}
          teacher={teacher}
          isClassTeacher={isClassTeacher}
          academicYear={academicYear}
          readOnly={readOnly}
        />
      )}

      {/* ── TEACHER EDIT TIMETABLE SLOT MODAL ── */}
      {editSlot && teacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditSlot(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-base">
                {editSlot.id === 0 ? 'Schedule Class' : 'Edit Timetable Slot'}
              </h3>
              <button onClick={() => setEditSlot(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">×</button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">{editSlot.day_of_week}</span>
              <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">Period {editSlot.period_number}</span>
              <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">{editSlot.time_from}–{editSlot.time_to}</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subject</label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-semibold">
                  {teacher.subject}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teacher</label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-semibold">
                  {teacher.name}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Room (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Room 102, Science Lab..."
                  value={roomVal}
                  onChange={e => setRoomVal(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditSlot(null)}
                  className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingSlot}
                  onClick={() => saveTeacherSlot(false)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {savingSlot ? 'Saving...' : editSlot.id === 0 ? 'Schedule' : 'Save'}
                </button>
              </div>

              {editSlot.id !== 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={savingSlot}
                    onClick={() => saveTeacherSlot(true)}
                    className="w-full py-2 border border-dashed border-red-300 text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    🗑 Clear Slot (Make Free)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
