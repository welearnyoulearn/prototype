'use client'

import { useEffect, useState } from 'react'

type Student = {
  id: number
  name: string
  grade: string
  section: string
  roll_number: string
}

type Task = {
  id: number
  title: string
  subject: string
  task_type: string
  max_marks: number
  due_date: string | null
  status: string
}

type Submission = {
  submission_id: number
  task_id: number
  submitted_at: string | null
  score: number | null
  submission_status: string | null
  feedback: string | null
}

type Doubt = {
  id: number
  subject: string
  question: string
  status: string
  teacher_answer: string | null
  created_at: string
}

type AnnouncementItem = {
  id: number; title: string; content: string; announcement_type: string
  target_audience: string; priority: string; created_by_name: string
  expires_at: string | null; created_at: string
}

type Props = {
  student: Student
  classId: number
  schoolId: number
}

type WeeklyTestStatus = {
  status: 'not_generated' | 'available' | 'submitted'
  week_start: string
  score?: number | null
  max_score?: number | null
}

export default function StudentDashboard({ student, classId, schoolId, onNavigate }: Props & { onNavigate?: (key: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [loading, setLoading] = useState(true)
  const [engagementScore, setEngagementScore] = useState<number | null>(null)
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [annExpanded, setAnnExpanded] = useState<number | null>(null)
  const [weeklyTest, setWeeklyTest] = useState<WeeklyTestStatus | null>(null)

  // Classrooms grid states
  const [classes, setClasses] = useState<{ id: number; grade: string; section: string; class_teacher_name: string | null; student_count: number }[]>([])
  const [selectedLockedClass, setSelectedLockedClass] = useState<{ grade: string; section: string } | null>(null)

  useEffect(() => {
    // Check weekly test status without triggering AI generation
    fetch(`/api/weekly-test?student_id=${student.id}&school_id=${schoolId}&class_id=${classId}&check_only=true`)
      .then(r => r.json())
      .then(d => setWeeklyTest(d))
      .catch(() => {})

    // Fetch school classrooms
    fetch(`/api/classes?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const sorted = data.sort((a, b) => {
            const ga = parseInt(a.grade) || 0
            const gb = parseInt(b.grade) || 0
            if (ga !== gb) return ga - gb
            return a.section.localeCompare(b.section)
          })
          setClasses(sorted)
        }
      })
      .catch(() => {})
  }, [student.id, schoolId, classId])

  useEffect(() => {
    Promise.all([
      fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/doubts?school_id=${schoolId}&student_id=${student.id}`).then(r => r.json()).catch(() => []),
      // Single batch call for all submissions — fixes N+1
      fetch(`/api/students/${student.id}/submissions?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/announcements?school_id=${schoolId}&audience=students`).then(r => r.json()).catch(() => []),
    ]).then(([taskData, doubtData, subData, annData]) => {
      const published = Array.isArray(taskData) ? taskData.filter((t: Task) => t.status === 'published') : []
      setTasks(published)
      setDoubts(Array.isArray(doubtData) ? doubtData.slice(0, 5) : [])
      const subs: Submission[] = Array.isArray(subData) ? subData : []
      setSubmissions(subs)
      setAnnouncements(Array.isArray(annData) ? annData : [])

      // Engagement score will be available after attendance is fetched
      // Fetch attendance for this month to compute score
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      fetch(`/api/attendance?school_id=${schoolId}&class_id=${classId}&month=${month}`)
        .then(r => r.json())
        .then(attData => {
          const myAtt = Array.isArray(attData) ? attData.filter((a: { student_id: number }) => a.student_id === student.id) : []
          const byDate = new Map<string, boolean>()
          myAtt.forEach((a: { date: string; status: string }) => {
            if (a.status === 'present') byDate.set(a.date, true)
            else if (!byDate.has(a.date)) byDate.set(a.date, false)
          })
          const totalAtt = byDate.size
          const presentDays = Array.from(byDate.values()).filter(Boolean).length
          const attPct  = totalAtt > 0 ? (presentDays / totalAtt) * 100 : 0
          const taskPct = published.length > 0 ? (subs.filter(s => s.submitted_at).length / published.length) * 100 : 0
          // Fetch this month's test avg to include in engagement score
          const now2 = new Date()
          const monthStart = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2,'0')}-01`
          fetch(`/api/weekly-test/history?student_id=${student.id}&school_id=${schoolId}&limit=5`)
            .then(r => r.json())
            .then(d => {
              const recent = (d.tests || []).filter((t: { week_start: string; status: string; score: number | null; max_score: number | null }) =>
                t.week_start >= monthStart && t.status === 'submitted' && t.score !== null && t.max_score
              )
              const testPct = recent.length > 0
                ? recent.reduce((a: number, t: { score: number; max_score: number }) => a + (t.score / t.max_score * 100), 0) / recent.length
                : 0
              const hasTests = recent.length > 0
              setEngagementScore(Math.round(
                hasTests
                  ? attPct * 0.4 + taskPct * 0.4 + testPct * 0.2
                  : attPct * 0.5 + taskPct * 0.5
              ))
            })
            .catch(() => setEngagementScore(Math.round(attPct * 0.5 + taskPct * 0.5)))
        }).catch(() => { /* non-critical */ })
    }).finally(() => setLoading(false))
  }, [student.id, classId, schoolId])

  const submitted = submissions.filter(s => s.submitted_at).length
  const reviewed = submissions.filter(s => s.submission_status === 'reviewed').length
  const pending = tasks.length - submitted
  const waitingDoubts = doubts.filter(d => d.status === 'open').length
  const activeDoubts = doubts.filter(d => d.status === 'in_progress').length
  const resolvedDoubts = doubts.filter(d => d.status === 'resolved').length

  const now = new Date()
  const overdue = tasks.filter(t => {
    const sub = submissions.find(s => s.task_id === t.id)
    if (sub?.submitted_at) return false
    if (!t.due_date) return false
    return new Date(t.due_date) < now
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white">
        <p className="text-blue-200 text-sm">Welcome back,</p>
        <h2 className="text-2xl font-bold mt-0.5">{student.name}</h2>
        <p className="text-blue-200 text-sm mt-1">Grade {student.grade}-{student.section} · Roll {student.roll_number || '—'}</p>
        {engagementScore !== null && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-blue-200 mb-1">
                <span>Engagement Score</span>
                <span className="font-bold text-white">{engagementScore}/100</span>
              </div>
              <div className="h-1.5 bg-blue-500 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${engagementScore}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Weekly test banner */}
      {weeklyTest && weeklyTest.status !== 'not_generated' && (
        weeklyTest.status === 'available' ? (
          <button
            onClick={() => onNavigate?.('weekly-test')}
            className="w-full text-left bg-gradient-to-r from-violet-600 to-purple-700 rounded-xl p-4 text-white hover:from-violet-700 hover:to-purple-800 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-violet-200 text-xs font-semibold uppercase tracking-wide mb-0.5">This Week</p>
                <p className="text-base font-bold">Weekly AI Test is ready! ✨</p>
                <p className="text-violet-200 text-xs mt-0.5">Questions from your recent syllabus topics</p>
              </div>
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center group-hover:bg-white/30 transition-colors flex-shrink-0">
                <p className="text-sm font-bold">Take Test →</p>
              </div>
            </div>
          </button>
        ) : weeklyTest.status === 'submitted' && weeklyTest.score != null && weeklyTest.max_score ? (
          <button
            onClick={() => onNavigate?.('weekly-test')}
            className="w-full text-left bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 hover:border-green-300 transition-all"
          >
            {(() => {
              const pct = Math.round((weeklyTest.score as number) / (weeklyTest.max_score as number) * 100)
              return (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-600 text-xs font-semibold uppercase tracking-wide mb-0.5">This Week&apos;s Test</p>
                    <p className="text-sm font-bold text-gray-800">You&apos;ve submitted — see your result</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {pct}%
                    </p>
                    <p className="text-xs text-gray-400">{weeklyTest.score}/{weeklyTest.max_score}</p>
                  </div>
                </div>
              )
            })()}
          </button>
        ) : null
      )}

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-700">
              {overdue.length} overdue task{overdue.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-red-500 mt-0.5">{overdue.map(t => t.title).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Homework', val: tasks.length, icon: '📋', bg: 'bg-blue-50', txt: 'text-blue-700' },
          { label: 'Submitted', val: submitted, icon: '✅', bg: 'bg-green-50', txt: 'text-green-700' },
          { label: 'Pending', val: pending, icon: '⏳', bg: 'bg-amber-50', txt: 'text-amber-700' },
          { label: 'Reviewed', val: reviewed, icon: '⭐', bg: 'bg-purple-50', txt: 'text-purple-700' },
        ].map(item => (
          <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`}>
            <p className="text-2xl mb-1">{item.icon}</p>
            <p className={`text-2xl font-bold ${item.txt}`}>{item.val}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* School Classrooms Grid */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏫</span>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">School Classrooms</h3>
              <p className="text-[10px] text-slate-400 font-medium">Overview of active academy classes</p>
            </div>
          </div>
          <span className="text-xs bg-slate-50 border border-slate-100 text-slate-500 font-bold px-3 py-1 rounded-full">{classes.length} Classes Registered</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {classes.map(cls => {
            const isActive = cls.grade === student.grade && cls.section === student.section
            if (isActive) {
              return (
                <div
                  key={cls.id}
                  className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/80 bg-gradient-to-br from-emerald-50/50 via-teal-50/10 to-white shadow-xl shadow-emerald-500/5 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 cursor-pointer p-5 flex flex-col justify-between min-h-[175px] group"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full pointer-events-none transition-transform duration-300 group-hover:scale-110" />
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        My Class
                      </span>
                      <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                    </div>
                    <h4 className="text-xl font-black text-slate-900 mt-3 tracking-tight">Grade {cls.grade}-{cls.section}</h4>
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                        <span className="text-slate-400 text-sm">👤</span>
                        <span className="truncate">{cls.class_teacher_name || 'No Class Teacher'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="text-slate-400 text-sm">👥</span>
                        <span>{cls.student_count || 0} enrolled students</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px] text-center transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-1">
                    <span>Enter Classroom</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>
              )
            } else {
              return (
                <div
                  key={cls.id}
                  onClick={() => setSelectedLockedClass({ grade: cls.grade, section: cls.section })}
                  className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-slate-300 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer p-5 flex flex-col justify-between min-h-[175px] group"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-100 rounded-bl-full pointer-events-none transition-transform duration-300 group-hover:scale-105" />
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Locked
                      </span>
                      <div className="p-2 rounded-xl bg-slate-100 text-slate-400 group-hover:text-amber-500 group-hover:bg-amber-50/80 transition-colors">
                        <svg className="w-4 h-4 transition-transform group-hover:rotate-12 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                    </div>
                    <h4 className="text-xl font-bold text-slate-800 mt-3 tracking-tight group-hover:text-slate-900 transition-colors">Grade {cls.grade}-{cls.section}</h4>
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="text-slate-400 text-sm">👤</span>
                        <span className="truncate">{cls.class_teacher_name || 'No Class Teacher'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="text-slate-400 text-sm">👥</span>
                        <span>{cls.student_count || 0} enrolled students</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 w-full py-2 bg-slate-100 text-slate-500 font-bold rounded-xl text-[11px] text-center transition-colors group-hover:bg-amber-50 group-hover:text-amber-700 border border-transparent group-hover:border-amber-200/50 flex items-center justify-center gap-1">
                    <span>Restricted Access</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
              )
            }
          })}
        </div>

        {/* Blocker Modal */}
        {selectedLockedClass && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity" onClick={() => setSelectedLockedClass(null)} />
            <div className="relative bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-slate-100 transform transition-all text-center animate-in fade-in zoom-in-95 duration-200 z-50">
              <div className="w-20 h-20 bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border border-amber-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/5">
                <svg className="w-10 h-10 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                Classroom Locked
              </h3>
              <p className="text-xs font-bold text-amber-600 mt-1.5 uppercase tracking-widest bg-amber-50 border border-amber-200/50 rounded-full px-4 py-1 inline-block">
                Access Restricted to Grade {selectedLockedClass.grade}-{selectedLockedClass.section}
              </p>
              <div className="my-6 bg-slate-50/80 rounded-2xl p-5 border border-slate-100 text-left">
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  As a student registered in <strong className="text-slate-800">Grade {student.grade}-{student.section}</strong>, you only have permission to view your active grade syllabus, assignments, and timetable.
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mt-3 border-t border-slate-200/60 pt-3">
                  If you believe this is an error, please contact your school administrator to update your class assignment.
                </p>
              </div>
              <button
                onClick={() => setSelectedLockedClass(null)}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-slate-900 to-slate-950 hover:from-black hover:to-black text-white font-extrabold rounded-xl shadow-lg hover:shadow-xl transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
              >
                Close Window
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent homework */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">Recent Homework</h3>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No homework assigned yet</p>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 4).map(t => {
                const sub = submissions.find(s => s.task_id === t.id)
                const isOverdue = !sub?.submitted_at && t.due_date && new Date(t.due_date) < now
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                      <p className="text-xs text-gray-400">{t.subject} · {t.max_marks} marks{t.due_date ? ` · Due ${t.due_date}` : ''}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                      sub?.submission_status === 'reviewed' ? 'bg-green-100 text-green-700' :
                      sub?.submitted_at ? 'bg-blue-100 text-blue-700' :
                      isOverdue ? 'bg-red-100 text-red-600' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {sub?.submission_status === 'reviewed' && sub.score !== null ? `${sub.score}/${t.max_marks}` :
                       sub?.submitted_at ? 'Submitted' :
                       isOverdue ? 'Overdue' : 'Pending'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Doubts summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">My Doubts</h3>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-amber-50 rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-amber-700">{waitingDoubts}</p>
              <p className="text-[10px] text-gray-400">Waiting</p>
            </div>
            <div className="flex-1 bg-blue-50 rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-blue-700">{activeDoubts}</p>
              <p className="text-[10px] text-gray-400">Chatting</p>
            </div>
            <div className="flex-1 bg-green-50 rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-green-700">{resolvedDoubts}</p>
              <p className="text-[10px] text-gray-400">Resolved</p>
            </div>
          </div>
          {doubts.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No doubts raised yet</p>
          ) : (
            <div className="space-y-2">
              {doubts.slice(0, 3).map(d => (
                <div key={d.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <span className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${
                    d.status === 'resolved' ? 'bg-green-400' :
                    d.status === 'in_progress' ? 'bg-blue-400' : 'bg-amber-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700 truncate">{d.question}</p>
                    <p className="text-[10px] text-gray-400">{d.subject}</p>
                  </div>
                  <span className={`text-[9px] flex-shrink-0 px-1.5 py-0.5 rounded-full font-medium ${
                    d.status === 'resolved' ? 'bg-green-100 text-green-600' :
                    d.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    {d.status === 'resolved' ? 'Done' : d.status === 'in_progress' ? 'Reply' : 'Wait'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              <h3 className="font-semibold text-gray-800 text-sm">School Announcements</h3>
              {announcements.filter(a => a.priority === 'urgent').length > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                  {announcements.filter(a => a.priority === 'urgent').length} urgent
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">{announcements.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {announcements.slice(0, 4).map(a => {
              const isUrgent = a.priority === 'urgent'
              const isHigh = a.priority === 'high'
              const isOpen = annExpanded === a.id
              return (
                <div key={a.id} className={`${isUrgent ? 'bg-red-50/40' : isHigh ? 'bg-amber-50/40' : ''}`}>
                  <button
                    onClick={() => setAnnExpanded(isOpen ? null : a.id)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                      isUrgent ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {isUrgent && <span className="text-[9px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded uppercase">Urgent</span>}
                        {isHigh && !isUrgent && <span className="text-[9px] bg-amber-100 text-amber-600 font-semibold px-1.5 py-0.5 rounded">High</span>}
                        <span className="text-[10px] text-gray-400">
                          {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-800 truncate">{a.title}</p>
                      {!isOpen && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{a.content}</p>}
                    </div>
                    <svg className={`w-3 h-3 text-gray-300 flex-shrink-0 mt-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 pl-9">
                      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                      {a.expires_at && (
                        <p className="text-[10px] text-amber-500 mt-1.5">
                          Expires: {new Date(a.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {announcements.length > 4 && (
            <div className="px-4 py-2.5 border-t border-gray-50 text-center">
              <p className="text-xs text-gray-400">+{announcements.length - 4} more announcement{announcements.length - 4 > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
