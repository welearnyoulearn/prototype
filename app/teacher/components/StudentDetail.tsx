'use client'

import { useEffect, useState } from 'react'

export type StudentDetailData = {
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

function getMonthStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

// Per-student drill-down (attendance history, task submissions, engagement
// score) — shared between My Students (class-teacher's own class) and the
// per-class Students tab in ClassView (any teacher assigned to that class),
// so both reach the identical view when a student is clicked.
export default function StudentDetail({
  student, classId, schoolId, backLabel, onBack,
}: {
  student: StudentDetailData
  classId: number
  schoolId: number
  backLabel: string
  onBack: () => void
}) {
  const [attRecords, setAttRecords] = useState<AttendanceRecord[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [engagementScore, setEngagementScore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setEngagementScore(null)
    const month = getMonthStr()
    Promise.all([
      fetch(`/api/attendance?school_id=${schoolId}&class_id=${classId}&month=${month}`)
        .then(r => r.json()).catch(() => []),
      fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}`)
        .then(r => r.json()).catch(() => []),
      fetch(`/api/students/${student.id}/submissions?school_id=${schoolId}&class_id=${classId}`)
        .then(r => r.json()).catch(() => []),
    ]).then(([attData, taskData, subData]) => {
      if (cancelled) return
      const allAtt: AttendanceRecord[] = Array.isArray(attData) ? attData : []
      const myAtt = allAtt.filter(a => a.student_id === student.id)
      setAttRecords(myAtt)

      const allTasks: Task[] = Array.isArray(taskData) ? taskData : []
      const pubTasks = allTasks.filter(t => t.status === 'published')
      setTasks(pubTasks)

      const subs: Submission[] = Array.isArray(subData) ? subData : []
      setSubmissions(subs)

      const attByDate = new Map<string, boolean>()
      myAtt.forEach(a => {
        if (a.status === 'present') attByDate.set(a.date, true)
        else if (!attByDate.has(a.date)) attByDate.set(a.date, false)
      })
      const totalAttDays = attByDate.size
      const presentDays = Array.from(attByDate.values()).filter(Boolean).length
      const attPct = totalAttDays > 0 ? (presentDays / totalAttDays) * 100 : 0
      const taskPct = pubTasks.length > 0 ? (subs.filter((s: Submission) => s.submitted_at).length / pubTasks.length) * 100 : 0
      setEngagementScore(Math.round(attPct * 0.5 + taskPct * 0.5))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [student.id, classId, schoolId])

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

  const submitted = submissions.filter(s => s.submitted_at).length
  const reviewed = submissions.filter(s => s.submission_status === 'reviewed').length
  const avgScore = reviewed > 0
    ? submissions.filter(s => s.score !== null).reduce((acc, s) => acc + (s.score || 0), 0) / reviewed
    : null

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors self-start">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {backLabel}
      </button>

      {loading ? (
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
                  {student.name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-lg font-bold text-gray-900">{student.name}</h2>
                <p className="text-sm text-gray-500">{student.grade}-{student.section} · Roll {student.roll_number || '—'}</p>
                <span className={`mt-2 text-xs px-2.5 py-0.5 rounded-full font-medium ${student.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {student.status}
                </span>
              </div>

              <div className="space-y-3 text-sm">
                {student.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{student.email}</span>
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
              {student.parent_name || student.parent_phone ? (
                <div className="space-y-3">
                  {student.parent_name && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Name</p>
                      <p className="text-sm font-medium text-gray-800">{student.parent_name}</p>
                    </div>
                  )}
                  {student.parent_phone && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Phone</p>
                      <a href={`tel:${student.parent_phone}`} className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {student.parent_phone}
                      </a>
                    </div>
                  )}
                  {student.parent_email && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Email</p>
                      <a href={`mailto:${student.parent_email}`} className="text-sm text-blue-600 hover:underline truncate block">{student.parent_email}</a>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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
