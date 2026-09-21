'use client'

import { useEffect, useState } from 'react'

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

type AnnouncementItem = { id: number; title: string; content: string; announcement_type: string; target_audience: string; priority: string; created_by_name: string; expires_at: string | null; created_at: string }

export default function SmartSnapshot({ teacher, schoolId, onNavigate, onViewClass }: Props) {
  // Class Management's class_subjects assignments — the actual source of
  // truth for which (class, subject) pairs a teacher is assigned, independent
  // of any other scheduling.
  const [classSubjects, setClassSubjects] = useState<ClassSubjectAssignment[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [annExpanded, setAnnExpanded] = useState<number | null>(null)

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
      fetch(`/api/announcements?school_id=${schoolId}&audience=teachers`).then(r => r.json()).catch(() => []),
    ]).then(([cls, classSubs, ann]) => {
      setClasses(Array.isArray(cls) ? cls : [])
      setClassSubjects(Array.isArray(classSubs) ? classSubs : [])
      setAnnouncements(Array.isArray(ann) ? ann : [])
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
    <div className="space-y-6">

      {/* Stats row */}
      <div className={`grid grid-cols-2 gap-4 sm:grid-cols-2`}>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Role</p>
          {isClassTeacher ? (
            <>
              <p className="text-base font-bold text-blue-700">Class Teacher</p>
              <p className="text-xs text-blue-500 mt-0.5">Grade {teacher.class_teacher_grade} – Sec {teacher.class_teacher_section}</p>
            </>
          ) : (
            <>
              <p className="text-base font-bold text-gray-700">Subject Teacher</p>
              <p className="text-xs text-gray-400 mt-0.5">{teacher.subject || 'No subject set'}</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Department</p>
          <p className="text-base font-bold text-gray-900">{teacher.department || '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{teacher.employee_id}</p>
        </div>
      </div>

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
                <div key={i} className="bg-gray-100 rounded-xl p-4 animate-pulse h-20" />
              ))}
            </div>
          )}

          {/* Doubt pattern warning */}
          {classHealth && classHealth.doubt_patterns.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 flex items-start gap-2">
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
              <div key={item.label} className={`${item.bg} rounded-xl p-4`}>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{item.label}</p>
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>}
        </div>
      )}

      {/* My Classes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">My Classes</h3>
          <p className="text-xs text-gray-400">
            {isClassTeacher ? 'Your class → full view · Others → class view' : 'Click to open class view'}
          </p>
        </div>
        {myClasses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-8 text-center text-sm text-gray-400">
            No class assignments yet — ask school admin to assign you a subject in Class Management
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {myClasses.map(cls => {
              const isClassTeacherFor = isClassTeacher &&
                cls.grade === teacher.class_teacher_grade &&
                cls.section === teacher.class_teacher_section
              return (
                <button
                  key={`${cls.grade}-${cls.section}`}
                  onClick={() => {
                    if (!cls.classInfo) return
                    onViewClass(cls.classInfo)
                  }}
                  className="text-left bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-md hover:border-blue-200">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-2xl font-bold text-gray-900">{cls.grade}-{cls.section}</p>
                    {isClassTeacherFor && (
                      <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">★ CT</span>
                    )}
                  </div>
                  {cls.subjects.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cls.subjects.slice(0, 3).map(s => (
                        <span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                      {cls.subjects.length > 3 && <span className="text-[10px] text-gray-400">+{cls.subjects.length - 3}</span>}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {isClassTeacherFor ? '★ Class Teacher · click for full view' : 'Subject Teacher · click for class view'}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Announcements feed */}
      {announcements.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              <h3 className="font-bold text-gray-900 text-sm">School Announcements</h3>
              {announcements.filter(a => a.priority === 'urgent').length > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                  {announcements.filter(a => a.priority === 'urgent').length} urgent
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">{announcements.length} notice{announcements.length > 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {announcements.slice(0, 5).map(a => {
              const isUrgent = a.priority === 'urgent'
              const isHigh = a.priority === 'high'
              const isOpen = annExpanded === a.id
              return (
                <div key={a.id} className={`${isUrgent ? 'bg-red-50/50' : isHigh ? 'bg-amber-50/50' : ''}`}>
                  <button
                    onClick={() => setAnnExpanded(isOpen ? null : a.id)}
                    className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50/70 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                      isUrgent ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        {isUrgent && <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase">Urgent</span>}
                        {isHigh && !isUrgent && <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded uppercase">High</span>}
                        <span className="text-[10px] text-gray-400">
                          {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 truncate">{a.title}</p>
                      {!isOpen && <p className="text-xs text-gray-400 mt-0.5 truncate">{a.content}</p>}
                    </div>
                    <svg className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pl-10">
                      <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                      {a.expires_at && (
                        <p className="text-xs text-amber-500 mt-2">Expires: {new Date(a.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {announcements.length > 5 && (
            <div className="px-5 py-3 border-t border-gray-50 text-center">
              <p className="text-xs text-gray-400">{announcements.length - 5} more announcement{announcements.length - 5 > 1 ? 's' : ''} not shown</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
