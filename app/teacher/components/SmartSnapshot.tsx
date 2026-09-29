'use client'

import { useEffect, useState } from 'react'
import NoticeCenter from '@/components/announcements/NoticeCenter'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowRight } from 'lucide-react'

type Teacher = {
  id: number
  name: string
  employee_id: string
  subject: string
  department: string
  qualification: string
  email: string
  phone: string
  class_teacher_grade: string | null
  class_teacher_section: string | null
  teaches_grades: string | null
}

type ClassInfo = {
  id: number
  grade: string
  section: string
  class_teacher_id: number | null
  class_teacher_name: string | null
}

type ClassSubjectAssignment = {
  id: number
  subject_name: string
  class_id: number
  grade: string
  section: string
}

type Props = {
  teacher: Teacher
  schoolId: number
  onNavigate: (nav: string) => void
  onViewClass: (cls: ClassInfo) => void
}


export default function SmartSnapshot({ teacher, schoolId, onNavigate, onViewClass }: Props) {
  // Class Management's class_subjects assignments — the actual source of
  // truth for which (class, subject) pairs a teacher is assigned, independent
  // of any other scheduling.
  const [classSubjects, setClassSubjects] = useState<ClassSubjectAssignment[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Class health state — only fetched for class teachers
  const [classHealthLoading, setClassHealthLoading] = useState(false)
  const [classHealth, setClassHealth] = useState<{
    total_students: number
    attendance_rate: number | null
    task_completion_rate: number | null
    avg_score: number | null
    doubts: { open: number; in_progress: number; resolved: number; total: number }
    doubt_patterns: { subject: string; count: number }[]
  } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/teachers/${teacher.id}/class-subjects`).then(r => r.json()).catch(() => []),
    ]).then(([cls, classSubs]) => {
      setClasses(Array.isArray(cls) ? cls : [])
      setClassSubjects(Array.isArray(classSubs) ? classSubs : [])
    }).finally(() => setLoading(false))
  }, [teacher.id, schoolId])

  // Class health endpoint not available in wlylV1 — section stays hidden

  const isClassTeacher = !!(teacher.class_teacher_grade && teacher.class_teacher_section)

  // Build My Classes list
  const classSet = new Map<string, { grade: string; section: string; subjects: string[]; classInfo: ClassInfo | null }>()
  if (isClassTeacher) {
    const key = `${teacher.class_teacher_grade}-${teacher.class_teacher_section}`
    const info = classes.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section) || null
    classSet.set(key, { grade: teacher.class_teacher_grade!, section: teacher.class_teacher_section!, subjects: [], classInfo: info })
  }
  // Class Management assignments: which (class, subject) pairs this teacher is assigned to.
  classSubjects.forEach(a => {
    if (!a.grade || !a.section) return
    const key = `${a.grade}-${a.section}`
    if (!classSet.has(key)) {
      const info = classes.find(c => c.grade === a.grade && c.section === a.section) || null
      classSet.set(key, { grade: a.grade, section: a.section, subjects: [], classInfo: info })
    }
    const cls = classSet.get(key)!
    if (!cls.subjects.includes(a.subject_name)) cls.subjects.push(a.subject_name)
  })
  const myClasses = Array.from(classSet.values()).sort((a, b) => {
    const ga = parseInt(a.grade) || 0, gb = parseInt(b.grade) || 0
    return ga !== gb ? ga - gb : a.section.localeCompare(b.section)
  })

  return (
    <div className="space-y-8">
      <header className="border-b border-[#dde3dd] pb-7">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-[#647068]">Your teaching day</p>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[#202a25] sm:text-3xl">Welcome, {teacher.name.split(' ')[0]}.</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#647068]">Open a class to review its students, attendance, and learning progress.</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#647068]">
          <span className="font-medium text-[#235b46]">{isClassTeacher ? `Class teacher · Grade ${teacher.class_teacher_grade}, Section ${teacher.class_teacher_section}` : 'Subject teacher'}</span>
          {teacher.subject && <span>{teacher.subject}</span>}
          {teacher.department && <span>{teacher.department}</span>}
          {teacher.employee_id && <span>Staff ID {teacher.employee_id}</span>}
        </div>
      </header>

      {/* Class Health Summary — only for class teachers */}
      {isClassTeacher && (classHealth || classHealthLoading) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-gray-900">
              Class Health — {teacher.class_teacher_grade}-{teacher.class_teacher_section}
            </h3>
            <button onClick={() => onNavigate('doubts')} className="text-xs text-blue-500 hover:underline">view doubts →</button>
          </div>

          {classHealthLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          )}

          {/* Doubt pattern warning */}
          {classHealth && classHealth.doubt_patterns.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-red-700">Doubt Pattern Alert</p>
                <p className="text-xs text-red-500 mt-0.5">
                  {classHealth.doubt_patterns.map(p => `${p.subject} (${p.count})`).join(', ')} — students struggling in last 7 days
                </p>
              </div>
            </div>
          )}

          {classHealth && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: 'Attendance',
                value: classHealth.attendance_rate !== null ? `${classHealth.attendance_rate}%` : '—',
                sub: 'This month',
                color: classHealth.attendance_rate !== null
                  ? classHealth.attendance_rate >= 75 ? 'text-green-600' : 'text-red-500'
                  : 'text-gray-400',
                bg: classHealth.attendance_rate !== null
                  ? classHealth.attendance_rate >= 75 ? 'bg-green-50' : 'bg-red-50'
                  : 'bg-gray-50',
              },
              {
                label: 'Task Completion',
                value: classHealth.task_completion_rate !== null ? `${classHealth.task_completion_rate}%` : '—',
                sub: `${classHealth.total_students} students`,
                color: classHealth.task_completion_rate !== null
                  ? classHealth.task_completion_rate >= 60 ? 'text-blue-600' : 'text-amber-500'
                  : 'text-gray-400',
                bg: classHealth.task_completion_rate !== null
                  ? classHealth.task_completion_rate >= 60 ? 'bg-blue-50' : 'bg-amber-50'
                  : 'bg-gray-50',
              },
              {
                label: 'Avg Score',
                value: classHealth.avg_score !== null ? `${classHealth.avg_score}` : '—',
                sub: 'Reviewed tasks',
                color: 'text-purple-600',
                bg: 'bg-purple-50',
              },
              {
                label: 'Open Doubts',
                value: classHealth.doubts.open + classHealth.doubts.in_progress,
                sub: `${classHealth.doubts.resolved} resolved`,
                color: (classHealth.doubts.open + classHealth.doubts.in_progress) > 5 ? 'text-orange-600' : 'text-gray-700',
                bg: (classHealth.doubts.open + classHealth.doubts.in_progress) > 5 ? 'bg-orange-50' : 'bg-gray-50',
              },
            ].map(item => (
              <div key={item.label} className={`${item.bg} rounded-md p-4`}>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{item.label}</p>
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>}
        </div>
      )}

      <section aria-labelledby="teacher-classes-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="teacher-classes-title" className="text-base font-semibold text-[#202a25]">My classes</h2>
          {!loading && <span className="text-xs text-[#647068]">{myClasses.length} assigned</span>}
        </div>
        {loading ? (
          <div className="space-y-2 rounded-md border border-[#dde3dd] bg-white p-4" role="status" aria-live="polite" aria-busy="true" aria-label="Loading your classes">
            <span className="sr-only">Loading your classes…</span>
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : myClasses.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#cbd5ca] px-5 py-8">
            <p className="text-sm font-semibold text-[#202a25]">Your classes will appear here</p>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#647068]">Ask your school administrator to assign your classes and subjects in Class Management.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-[#dde3dd] bg-white divide-y divide-[#e8ece6]">
            <div className="hidden grid-cols-[minmax(120px,1fr)_2fr_1fr_24px] gap-4 bg-[#f4f6f1] px-5 py-2.5 text-xs font-medium text-[#647068] md:grid" aria-hidden="true">
              <span>Class</span><span>Your subjects</span><span>Your role</span><span />
            </div>
            {myClasses.map(cls => {
              const isClassTeacherFor = isClassTeacher &&
                cls.grade === teacher.class_teacher_grade &&
                cls.section === teacher.class_teacher_section
              return (
                <button key={`${cls.grade}-${cls.section}`} disabled={!cls.classInfo}
                  onClick={() => {
                    if (!cls.classInfo) return
                    onViewClass(cls.classInfo)
                  }}
                  className="group grid min-h-20 w-full grid-cols-[1fr_24px] items-center gap-x-4 gap-y-1 px-4 py-4 text-left transition-colors hover:bg-[#f2f6f0] disabled:cursor-default disabled:opacity-60 motion-reduce:transition-none md:grid-cols-[minmax(120px,1fr)_2fr_1fr_24px] md:px-5">
                  <span className="text-base font-semibold text-[#202a25]">Grade {cls.grade}<span className="ml-2 font-normal text-[#647068]">{cls.section}</span></span>
                  <span className="col-start-1 row-start-2 text-sm leading-relaxed text-[#647068] md:col-start-auto md:row-start-auto">{cls.subjects.length > 0 ? cls.subjects.join(', ') : 'Class overview'}</span>
                  <span className={`col-start-1 row-start-3 mt-1 text-xs md:col-start-auto md:row-start-auto md:mt-0 ${isClassTeacherFor ? 'font-medium text-[#235b46]' : 'text-[#647068]'}`}>{isClassTeacherFor ? 'Class teacher' : 'Subject teacher'}</span>
                  <ArrowRight size={18} className="col-start-2 row-start-1 row-end-4 text-[#7c8980] group-hover:text-[#235b46] md:col-start-auto md:row-start-auto md:row-end-auto" aria-hidden="true" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Notices: unread marks, animated greeting cards, acknowledgement */}
      <NoticeCenter schoolId={schoolId} />
    </div>
  )
}
