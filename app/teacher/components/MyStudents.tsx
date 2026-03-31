'use client'

import { useEffect, useState, useCallback } from 'react'

type Teacher = {
  id: number
  name: string
  subject: string
  department: string
  class_teacher_grade: string | null
  class_teacher_section: string | null
}

type ClassOption = {
  id: number
  grade: string
  section: string
  class_teacher_name: string | null
}

type Student = {
  id: number
  name: string
  roll_number: string
  grade: string
  section: string
  email: string | null
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  status: string
}

type AttendanceRecord = {
  student_id: number
  date: string
  session: string
  status: 'present' | 'absent' | 'late'
}

type Task = {
  id: number
  title: string
  subject: string
  status: string
  max_marks: number
  due_date: string | null
}

type Submission = {
  submission_id: number
  task_id: number
  submitted_at: string | null
  score: number | null
  submission_status: string | null
  feedback: string | null
}

type TimetableSlot = {
  grade: string | null
  section: string | null
}

type Props = {
  teacher: Teacher
  schoolId: number
}

function getMonthStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

export default function MyStudents({ teacher, schoolId }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  // Student detail view
  const [detailStudent, setDetailStudent] = useState<Student | null>(null)
  const [attRecords, setAttRecords] = useState<AttendanceRecord[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [engagementScore, setEngagementScore] = useState<number | null>(null)

  const isClassTeacher = teacher.class_teacher_grade === selectedClass?.grade &&
    teacher.class_teacher_section === selectedClass?.section

  useEffect(() => {
    Promise.all([
      fetch(`/api/timetable?teacher_id=${teacher.id}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()).catch(() => []),
    ]).then(([timetable, allClasses]: [TimetableSlot[], ClassOption[]]) => {
      const classMap = new Map<string, ClassOption>()
      if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const cls = allClasses.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (cls) classMap.set(`${cls.grade}-${cls.section}`, cls)
      }
      timetable.forEach((slot: TimetableSlot) => {
        if (!slot.grade || !slot.section) return
        const key = `${slot.grade}-${slot.section}`
        if (!classMap.has(key)) {
          const cls = allClasses.find(c => c.grade === slot.grade && c.section === slot.section)
          if (cls) classMap.set(key, cls)
        }
      })
      const myClasses = Array.from(classMap.values())
      setClasses(myClasses)
      if (myClasses.length === 1) {
        setSelectedClass(myClasses[0])
      } else if (teacher.class_teacher_grade && teacher.class_teacher_section) {
        const own = myClasses.find(c => c.grade === teacher.class_teacher_grade && c.section === teacher.class_teacher_section)
        if (own) setSelectedClass(own)
      }
    }).finally(() => setLoading(false))
  }, [teacher, schoolId])

  const fetchStudents = useCallback(async (cls: ClassOption) => {
    setStudentsLoading(true)
    try {
      const data = await fetch(`/api/students?school_id=${schoolId}&grade=${cls.grade}&section=${cls.section}`).then(r => r.json()).catch(() => [])
      setStudents(Array.isArray(data) ? data : [])
    } finally {
      setStudentsLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    if (selectedClass) { setDetailStudent(null); fetchStudents(selectedClass) }
    else setStudents([])
  }, [selectedClass, fetchStudents])

  async function openDetail(s: Student) {
    setDetailStudent(s)
    setEngagementScore(null)
    if (!selectedClass) return
    setDetailLoading(true)
    try {
      const month = getMonthStr()
      // Single batch call for submissions (fixes N+1) + attendance + tasks in parallel
      const [attData, taskData, subData] = await Promise.all([
        fetch(`/api/attendance?school_id=${schoolId}&class_id=${selectedClass.id}&month=${month}`)
          .then(r => r.json()).catch(() => []),
        fetch(`/api/tasks?school_id=${schoolId}&class_id=${selectedClass.id}`)
          .then(r => r.json()).catch(() => []),
        fetch(`/api/students/${s.id}/submissions?school_id=${schoolId}&class_id=${selectedClass.id}`)
          .then(r => r.json()).catch(() => []),
      ])

      const allAtt: AttendanceRecord[] = Array.isArray(attData) ? attData : []
      const myAtt = allAtt.filter(a => a.student_id === s.id)
      setAttRecords(myAtt)

      const allTasks: Task[] = Array.isArray(taskData) ? taskData : []
      const pubTasks = allTasks.filter(t => t.status === 'published')
      setTasks(pubTasks)

      const subs: Submission[] = Array.isArray(subData) ? subData : []
      setSubmissions(subs)

      // Compute engagement score client-side
      const attByDate = new Map<string, boolean>()
      myAtt.forEach(a => {
        if (a.status === 'present') attByDate.set(a.date, true)
        else if (!attByDate.has(a.date)) attByDate.set(a.date, false)
      })
      const totalAttDays = attByDate.size
      const presentDays = Array.from(attByDate.values()).filter(Boolean).length
      const attPct = totalAttDays > 0 ? (presentDays / totalAttDays) * 100 : 0
      const taskPct = pubTasks.length > 0 ? (subs.filter(s => s.submitted_at).length / pubTasks.length) * 100 : 0
      setEngagementScore(Math.round(attPct * 0.5 + taskPct * 0.5))
    } finally {
      setDetailLoading(false)
    }
  }

  const filtered = students.filter(s => {
    if (!searchQ.trim()) return true
    const q = searchQ.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.roll_number?.toLowerCase().includes(q)
  })

  // Attendance stats
  const attByDate = new Map<string, { morning?: string; afternoon?: string }>()
  attRecords.forEach(a => {
    const entry = attByDate.get(a.date) || {}
    entry[a.session as 'morning' | 'afternoon'] = a.status
    attByDate.set(a.date, entry)
  })
  const attDays = Array.from(attByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const totalDays = attDays.length
  const presentDays = attDays.filter(([, v]) => v.morning === 'present' || v.afternoon === 'present').length
  const absentDays = attDays.filter(([, v]) => v.morning === 'absent' && v.afternoon !== 'present').length

  // Task stats
  const submitted = submissions.filter(s => s.submitted_at).length
  const reviewed = submissions.filter(s => s.submission_status === 'reviewed').length
  const avgScore = reviewed > 0
    ? submissions.filter(s => s.score !== null).reduce((acc, s) => acc + (s.score || 0), 0) / reviewed
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (classes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Class Assignments</h3>
          <p className="text-gray-400 text-sm">Ask admin to set up your timetable.</p>
        </div>
      </div>
    )
  }

  // ── Student detail view ──────────────────────────────────────────────────
  if (detailStudent) {
    return (
      <div className="flex flex-col gap-4">
        {/* Back bar */}
        <button onClick={() => setDetailStudent(null)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors self-start">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {selectedClass?.grade}-{selectedClass?.section} Students
        </button>

        {detailLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── Left: Profile card ── */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
                    {detailStudent.name.charAt(0).toUpperCase()}
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">{detailStudent.name}</h2>
                  <p className="text-sm text-gray-500">{detailStudent.grade}-{detailStudent.section} · Roll {detailStudent.roll_number || '—'}</p>
                  <span className={`mt-2 text-xs px-2.5 py-0.5 rounded-full font-medium ${detailStudent.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {detailStudent.status}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  {detailStudent.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{detailStudent.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Engagement score */}
              {engagementScore !== null && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Engagement Score</h3>
                  <div className="flex items-center gap-3">
                    <div className={`text-3xl font-bold ${engagementScore >= 70 ? 'text-green-600' : engagementScore >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                      {engagementScore}
                    </div>
                    <div className="flex-1">
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${engagementScore >= 70 ? 'bg-green-500' : engagementScore >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${engagementScore}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">Attendance 50% + Tasks 50%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Parent contact */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Parent / Guardian</h3>
                {detailStudent.parent_name || detailStudent.parent_phone ? (
                  <div className="space-y-3">
                    {detailStudent.parent_name && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Name</p>
                        <p className="text-sm font-medium text-gray-800">{detailStudent.parent_name}</p>
                      </div>
                    )}
                    {detailStudent.parent_phone && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Phone</p>
                        <a href={`tel:${detailStudent.parent_phone}`} className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {detailStudent.parent_phone}
                        </a>
                      </div>
                    )}
                    {detailStudent.parent_email && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Email</p>
                        <a href={`mailto:${detailStudent.parent_email}`} className="text-sm text-blue-600 hover:underline truncate block">{detailStudent.parent_email}</a>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No parent contact on record</p>
                )}
              </div>
            </div>

            {/* ── Right: Stats ── */}
            <div className="lg:col-span-2 flex flex-col gap-4">

              {/* Attendance summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Attendance — {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                </h3>

                {totalDays === 0 ? (
                  <p className="text-sm text-gray-400">No attendance recorded this month</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { label: 'Days Tracked', val: totalDays, cls: 'text-gray-700' },
                        { label: 'Present', val: presentDays, cls: 'text-green-600' },
                        { label: 'Absent', val: absentDays, cls: 'text-red-600' },
                      ].map(item => (
                        <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className={`text-xl font-bold ${item.cls}`}>{item.val}</p>
                          <p className="text-[10px] text-gray-400">{item.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Attendance percentage bar */}
                    {totalDays > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Attendance Rate</span>
                          <span className="font-semibold">{Math.round((presentDays / totalDays) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((presentDays / totalDays) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Task performance */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Task Performance
                </h3>

                {tasks.length === 0 ? (
                  <p className="text-sm text-gray-400">No published tasks for this class</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {[
                        { label: 'Assigned', val: tasks.length, cls: 'text-gray-700' },
                        { label: 'Submitted', val: submitted, cls: 'text-blue-600' },
                        { label: 'Reviewed', val: reviewed, cls: 'text-green-600' },
                        { label: 'Avg Score', val: avgScore !== null ? `${avgScore.toFixed(1)}` : '—', cls: 'text-purple-600' },
                      ].map(item => (
                        <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className={`text-xl font-bold ${item.cls}`}>{item.val}</p>
                          <p className="text-[10px] text-gray-400">{item.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Task list */}
                    <div className="space-y-2">
                      {tasks.map(t => {
                        const sub = submissions.find(s => s.task_id === t.id)
                        return (
                          <div key={t.id} className="flex items-center justify-between text-xs py-2 border-b border-gray-50 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800 truncate">{t.title}</p>
                              <p className="text-gray-400">{t.subject}{t.due_date ? ` · Due ${t.due_date}` : ''}</p>
                            </div>
                            <div className="flex-shrink-0 ml-3">
                              {!sub?.submitted_at ? (
                                <span className="bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Not Submitted</span>
                              ) : sub.submission_status === 'reviewed' ? (
                                <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                                  {sub.score !== null ? `${sub.score}/${t.max_marks}` : 'Reviewed'}
                                </span>
                              ) : (
                                <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Submitted</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Student list view ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">My Students</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedClass ? `${filtered.length} students · Grade ${selectedClass.grade}-${selectedClass.section}` : 'Select a class'}
          </p>
        </div>
        {selectedClass && (
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search name / roll…"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        )}
      </div>

      {classes.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 flex-shrink-0">Class</span>
          <div className="flex gap-2 flex-wrap">
            {classes.map(cls => (
              <button key={cls.id} onClick={() => setSelectedClass(cls)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedClass?.id === cls.id ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {cls.grade}-{cls.section}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedClass && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {studentsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              {searchQ ? 'No students match your search' : 'No students enrolled in this class'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Total', val: filtered.length, cls: 'text-gray-900' },
                  { label: 'Active', val: filtered.filter(s => s.status === 'active').length, cls: 'text-green-600' },
                  { label: isClassTeacher ? 'With Parent Contact' : 'In This Class', val: isClassTeacher ? filtered.filter(s => s.parent_phone || s.parent_email).length : filtered.length, cls: 'text-blue-600' },
                ].map(item => (
                  <div key={item.label} className="px-6 py-3 text-center">
                    <p className={`text-xl font-bold ${item.cls}`}>{item.val}</p>
                    <p className="text-xs text-gray-400">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="divide-y divide-gray-50">
                {filtered.map((s, idx) => (
                  <div key={s.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors group"
                    onClick={() => openDetail(s)}
                  >
                    <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.roll_number || 'No roll no.'}{s.email ? ` · ${s.email}` : ''}</p>
                    </div>
                    {isClassTeacher && s.parent_phone && (
                      <a href={`tel:${s.parent_phone}`} onClick={e => e.stopPropagation()}
                        className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {s.parent_phone}
                      </a>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.status}
                    </span>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
