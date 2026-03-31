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

type Task = {
  id: number
  title: string
  subject: string
  task_type: 'practice' | 'homework' | 'test'
  max_marks: number
  instructions: string | null
  status: 'draft' | 'published' | 'archived'
  due_date: string | null
  due_time: string | null
  teacher_id: number
  teacher_name: string
  submitted_count: number
  reviewed_count: number
  pending_count: number
  total_students: number
}

type StudentSubmission = {
  student_id: number
  student_name: string
  roll_number: string
  submission_id: number | null
  submitted_at: string | null
  submission_text: string | null
  file_url: string | null
  file_name: string | null
  file_size_kb: number | null
  score: number | null
  feedback: string | null
  status: 'pending' | 'reviewed' | null
  resubmission_requested: boolean | null
  reviewed_at: string | null
  reviewed_by_name: string | null
  missing_task_count: number
}

type Props = {
  taskId: number
  schoolId: number
  classId: number
  teacher: Teacher
  isClassTeacher: boolean
  onBack: () => void
}

type ReviewTab = 'all' | 'pending' | 'reviewed' | 'not_submitted' | 'resubmission'

const QUICK_CHIPS = [
  'Good effort!', 'Needs more detail', 'Excellent work', 'Please redo',
  'Partially correct', 'Well structured', 'Missing key points', 'Very creative',
]

function gradeFromScore(score: number, max: number): string {
  const pct = (score / max) * 100
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'A-'
  if (pct >= 75) return 'B+'
  if (pct >= 70) return 'B'
  if (pct >= 60) return 'C+'
  if (pct >= 50) return 'C'
  return 'D'
}

function fmt(dt: string | null) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function TaskReview({ taskId, schoolId, teacher, isClassTeacher, onBack }: Props) {
  const [task, setTask] = useState<Task | null>(null)
  const [students, setStudents] = useState<StudentSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ReviewTab>('all')
  const [selected, setSelected] = useState<StudentSubmission | null>(null)
  const [panelScore, setPanelScore] = useState('')
  const [panelFeedback, setPanelFeedback] = useState('')
  const [panelResubmit, setPanelResubmit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [reminding, setReminding] = useState(false)
  const [remindResult, setRemindResult] = useState('')
  const [searchQ, setSearchQ] = useState('')

  const canReview = task ? teacher.id === task.teacher_id : false

  const fetchData = useCallback(async () => {
    const [taskRes, subsRes] = await Promise.all([
      fetch(`/api/tasks/${taskId}?school_id=${schoolId}`),
      fetch(`/api/tasks/${taskId}/submissions?school_id=${schoolId}`),
    ])
    if (taskRes.ok) setTask(await taskRes.json())
    if (subsRes.ok) setStudents(await subsRes.json())
    setLoading(false)
  }, [taskId, schoolId])

  useEffect(() => { fetchData() }, [fetchData])

  function openPanel(s: StudentSubmission) {
    setSelected(s)
    setPanelScore(s.score !== null ? String(s.score) : '')
    setPanelFeedback(s.feedback || '')
    setPanelResubmit(s.resubmission_requested || false)
    setSaveMsg('')
  }

  async function submitReview(markReviewed: boolean) {
    if (!selected || !task) return
    const scoreNum = panelScore === '' ? null : parseFloat(panelScore)
    if (scoreNum !== null && (isNaN(scoreNum) || scoreNum < 0 || scoreNum > task.max_marks)) {
      setSaveMsg(`Score must be 0–${task.max_marks}`)
      return
    }
    setSaving(true)
    setSaveMsg('')

    const isUpdate = !!selected.submission_id
    const url = isUpdate
      ? `/api/tasks/${taskId}/submissions/${selected.submission_id}`
      : `/api/tasks/${taskId}/submissions`

    const body = isUpdate
      ? { school_id: schoolId, teacher_id: teacher.id, score: scoreNum, feedback: panelFeedback || null, status: markReviewed ? 'reviewed' : 'pending', resubmission_requested: panelResubmit }
      : { school_id: schoolId, teacher_id: teacher.id, student_id: selected.student_id, score: scoreNum, feedback: panelFeedback || null, status: markReviewed ? 'reviewed' : 'pending', resubmission_requested: panelResubmit, submitted_at: new Date().toISOString() }

    const res = await fetch(url, {
      method: isUpdate ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      setSaveMsg(markReviewed ? 'Marked as reviewed!' : 'Saved as draft')
      await fetchData()
    } else {
      const err = await res.json().catch(() => ({}))
      setSaveMsg(err.error || 'Failed to save')
    }
    setSaving(false)
  }

  async function sendReminder(targetType: 'all' | 'specific', ids?: number[]) {
    setReminding(true)
    setRemindResult('')
    const res = await fetch(`/api/tasks/${taskId}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, teacher_id: teacher.id, target_type: targetType, student_ids: ids }),
    })
    const data = await res.json()
    setRemindResult(data.message || 'Reminder sent')
    setReminding(false)
  }

  const notSubmitted = students.filter(s => !s.submitted_at)
  const pending = students.filter(s => s.submitted_at && s.status !== 'reviewed')
  const reviewed = students.filter(s => s.status === 'reviewed')
  const resubmissions = students.filter(s => s.resubmission_requested)

  const tabList: { key: ReviewTab; label: string; count: number; urgent?: boolean }[] = [
    { key: 'all', label: 'All', count: students.length },
    { key: 'pending', label: 'Pending Review', count: pending.length },
    { key: 'resubmission', label: 'Redo Requests', count: resubmissions.length, urgent: resubmissions.length > 0 },
    { key: 'reviewed', label: 'Reviewed', count: reviewed.length },
    { key: 'not_submitted', label: 'Not Submitted', count: notSubmitted.length },
  ]

  function getTabRows() {
    let rows = tab === 'pending' ? pending : tab === 'reviewed' ? reviewed : tab === 'not_submitted' ? notSubmitted : tab === 'resubmission' ? resubmissions : students
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      rows = rows.filter(s => s.student_name.toLowerCase().includes(q) || s.roll_number?.toLowerCase().includes(q))
    }
    return rows
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!task) return <div className="text-center text-gray-500 py-16">Task not found</div>

  const rows = getTabRows()

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* ── Left: student list ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 mb-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tasks
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-gray-900 text-lg leading-tight">{task.title}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {task.subject} · {task.task_type} · {task.max_marks} marks{task.due_date ? ` · Due ${task.due_date}` : ''}
              </p>
              {!canReview && (
                <span className="mt-1 inline-block text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">View Only — taught by {task.teacher_name}</span>
              )}
            </div>
            {(isClassTeacher || canReview) && (
              <button
                onClick={() => sendReminder('all')}
                disabled={reminding || notSubmitted.length === 0}
                className="flex-shrink-0 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-40 transition-colors"
              >
                {reminding ? 'Sending…' : `Remind All (${notSubmitted.length})`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { label: 'Total', val: task.total_students, cls: 'text-gray-700' },
              { label: 'Submitted', val: task.submitted_count, cls: 'text-blue-600' },
              { label: 'Pending', val: task.pending_count, cls: 'text-amber-600' },
              { label: 'Reviewed', val: task.reviewed_count, cls: 'text-green-600' },
            ].map(s => (
              <div key={s.label} className="text-center bg-gray-50 rounded-lg py-2">
                <p className={`text-lg font-bold ${s.cls}`}>{s.val}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {remindResult && (
            <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1.5">{remindResult}</div>
          )}
        </div>

        {/* Tabs + table */}
        <div className="bg-white rounded-xl border border-gray-200 flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-100">
            {tabList.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${tab === t.key ? (t.urgent ? 'border-purple-600 text-purple-600' : 'border-blue-600 text-blue-600') : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.label}
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  t.urgent && t.count > 0 ? 'bg-purple-100 text-purple-600 font-bold' :
                  tab === t.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                }`}>{t.count}</span>
              </button>
            ))}
            <div className="ml-auto pb-2">
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search student…"
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-blue-300" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-12">No students in this view</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Student</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Submitted</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">File</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Score</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.student_id}
                      onClick={() => canReview ? openPanel(s) : isClassTeacher ? openPanel(s) : undefined}
                      className={`border-b border-gray-50 transition-colors ${(canReview || isClassTeacher) ? 'cursor-pointer hover:bg-gray-50' : ''} ${selected?.student_id === s.student_id ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-[10px] flex-shrink-0">
                            {s.student_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{s.student_name}</p>
                            <p className="text-gray-400">{s.roll_number}</p>
                          </div>
                          {s.missing_task_count >= 2 && (
                            <span className="ml-1 text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">AT RISK</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{s.submitted_at ? fmt(s.submitted_at) : <span className="text-red-400">—</span>}</td>
                      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        {s.file_url ? (
                          <a href={s.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                            title={s.file_name || 'Attachment'}>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            <span className="truncate max-w-[80px]">{s.file_name || 'File'}</span>
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.score !== null
                          ? <span className="font-semibold text-gray-800">{s.score}/{task.max_marks} <span className="text-gray-400">({gradeFromScore(s.score, task.max_marks)})</span></span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {!s.submitted_at
                          ? <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Not Submitted</span>
                          : s.status === 'reviewed'
                            ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Reviewed</span>
                            : <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>}
                        {s.resubmission_requested && <span className="ml-1 text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">Redo</span>}
                      </td>
                      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        {tab === 'not_submitted' && (canReview || isClassTeacher) ? (
                          <button onClick={() => sendReminder('specific', [s.student_id])} disabled={reminding}
                            className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded hover:bg-amber-100 disabled:opacity-40">
                            Remind
                          </button>
                        ) : canReview ? (
                          <button onClick={() => openPanel(s)}
                            className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded hover:bg-blue-100">
                            {s.status === 'reviewed' ? 'Edit' : s.submitted_at ? 'Review' : 'Mark'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: review panel ── */}
      {selected && (
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between">
              <div>
                {canReview && <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest mb-0.5">Now Reviewing</p>}
                <p className="font-bold text-gray-900">{selected.student_name}</p>
                <p className="text-xs text-gray-400">{selected.roll_number}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-300 hover:text-gray-500 mt-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Submission info */}
              {selected.submitted_at ? (
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
                  <p><span className="text-gray-400">Submitted:</span> {fmt(selected.submitted_at)}</p>
                  {selected.submission_text && <p><span className="text-gray-400">Note:</span> {selected.submission_text}</p>}
                  {selected.file_url && (
                    <a href={selected.file_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-blue-600 hover:underline">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      {selected.file_name || 'View attachment'}
                      {selected.file_size_kb && <span className="text-gray-400 ml-1">({selected.file_size_kb}KB)</span>}
                    </a>
                  )}
                </div>
              ) : (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 space-y-1">
                  <p className="font-medium">Student has not submitted yet.</p>
                  {canReview && <p className="text-red-400">You can still enter a score below to manually record marks on their behalf.</p>}
                </div>
              )}

              {canReview ? (
                <>
                  {/* Score */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Award Score <span className="font-normal text-gray-400">out of {task.max_marks}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={task.max_marks} value={panelScore}
                        onChange={e => setPanelScore(e.target.value)} placeholder="—"
                        className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      <span className="text-gray-400 text-xs">/ {task.max_marks}</span>
                      {panelScore !== '' && !isNaN(parseFloat(panelScore)) && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          {gradeFromScore(parseFloat(panelScore), task.max_marks)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Feedback */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Feedback</label>
                    <textarea value={panelFeedback} onChange={e => setPanelFeedback(e.target.value)}
                      placeholder="Write feedback for the student…" rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {QUICK_CHIPS.map(chip => (
                        <button key={chip} onClick={() => setPanelFeedback(prev => prev ? `${prev} ${chip}` : chip)}
                          className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full hover:bg-gray-200 transition-colors">
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resubmission toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div onClick={() => setPanelResubmit(v => !v)}
                      className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${panelResubmit ? 'bg-purple-500' : 'bg-gray-200'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-transform ${panelResubmit ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-xs text-gray-600">Request Resubmission</span>
                  </label>

                  {saveMsg && (
                    <p className={`text-xs px-3 py-2 rounded-lg border ${saveMsg.includes('!') || saveMsg.includes('Saved') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {saveMsg}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => submitReview(false)} disabled={saving}
                      className="flex-1 text-xs border border-gray-200 text-gray-600 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                      Save Draft
                    </button>
                    <button onClick={() => submitReview(true)} disabled={saving}
                      className="flex-1 text-xs bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium">
                      {saving ? 'Saving…' : 'Mark Reviewed'}
                    </button>
                  </div>

                  {selected.reviewed_at && (
                    <p className="text-[10px] text-gray-400 text-center">
                      Last reviewed {fmt(selected.reviewed_at)}{selected.reviewed_by_name ? ` by ${selected.reviewed_by_name}` : ''}
                    </p>
                  )}
                </>
              ) : (
                /* View-only panel for class teacher */
                <>
                  {selected.score !== null && (
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-gray-900">{selected.score}/{task.max_marks}</p>
                      <p className="text-sm text-blue-600 font-medium">{gradeFromScore(selected.score, task.max_marks)}</p>
                    </div>
                  )}
                  {selected.feedback && (
                    <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">{selected.feedback}</div>
                  )}
                  {selected.reviewed_at && (
                    <p className="text-[10px] text-gray-400">Reviewed {fmt(selected.reviewed_at)}{selected.reviewed_by_name ? ` by ${selected.reviewed_by_name}` : ''}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
