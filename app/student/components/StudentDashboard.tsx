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

type Props = {
  student: Student
  classId: number
  schoolId: number
}

export default function StudentDashboard({ student, classId, schoolId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [loading, setLoading] = useState(true)
  const [engagementScore, setEngagementScore] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/doubts?school_id=${schoolId}&student_id=${student.id}`).then(r => r.json()).catch(() => []),
      // Single batch call for all submissions — fixes N+1
      fetch(`/api/students/${student.id}/submissions?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => []),
    ]).then(([taskData, doubtData, subData]) => {
      const published = Array.isArray(taskData) ? taskData.filter((t: Task) => t.status === 'published') : []
      setTasks(published)
      setDoubts(Array.isArray(doubtData) ? doubtData.slice(0, 5) : [])
      const subs: Submission[] = Array.isArray(subData) ? subData : []
      setSubmissions(subs)

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
          const attPct = totalAtt > 0 ? (presentDays / totalAtt) * 100 : 0
          const taskPct = published.length > 0 ? (subs.filter(s => s.submitted_at).length / published.length) * 100 : 0
          setEngagementScore(Math.round(attPct * 0.5 + taskPct * 0.5))
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
          { label: 'Tasks Assigned', val: tasks.length, icon: '📋', bg: 'bg-blue-50', txt: 'text-blue-700' },
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent tasks */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">Recent Tasks</h3>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No tasks assigned yet</p>
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
    </div>
  )
}
