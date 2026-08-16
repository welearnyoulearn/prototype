'use client'

import { useEffect, useState, useCallback } from 'react'
import TaskReview from './TaskReview'

// ── Types ──────────────────────────────────────────────────────────────────

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
  assigned_to: string
  status: 'draft' | 'published' | 'archived'
  due_date: string | null
  due_time: string | null
  teacher_id: number
  teacher_name: string
  class_id: number
  school_id: number
  submitted_count: number
  reviewed_count: number
  pending_count: number
  total_students: number
  last_reminder_at: string | null
  created_at: string
}

type TaskForm = {
  title: string
  subject: string
  task_type: 'practice' | 'homework' | 'test'
  max_marks: number
  instructions: string
  due_date: string
  due_time: string
  assigned_to: string
  status: 'draft' | 'published'
}

type Props = {
  classId: number
  grade: string
  section: string
  schoolId: number
  teacher: Teacher
  // Set when navigated here from a specific syllabus topic's "Add Homework"
  // button — opens the create form pre-filled instead of the plain list, so
  // the teacher doesn't have to re-type which chapter/topic it's for.
  // onPrefillConsumed lets the parent clear its copy right after, so leaving
  // and manually returning to this tab later doesn't re-trigger the same
  // pre-filled form a second time.
  prefillTitle?: string
  prefillSubject?: string
  onPrefillConsumed?: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SUBJECT_COLORS: Record<string, string> = {
  maths: 'bg-blue-600', mathematics: 'bg-blue-600',
  science: 'bg-emerald-600', physics: 'bg-indigo-600',
  chemistry: 'bg-pink-600', biology: 'bg-green-600',
  english: 'bg-violet-600', hindi: 'bg-orange-600',
  social: 'bg-red-600', 'social studies': 'bg-red-600',
  history: 'bg-amber-600', geography: 'bg-teal-600',
  computer: 'bg-cyan-600',
}
function subjectColor(s: string) {
  return SUBJECT_COLORS[s?.toLowerCase()] || 'bg-gray-600'
}

function taskStatus(t: Task): { label: string; cls: string } {
  const overdue = t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
  const notSubmitted = t.total_students - t.submitted_count
  if (t.status === 'draft') return { label: 'Draft', cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  if (overdue && (t.pending_count > 0 || notSubmitted > 0)) {
    return { label: 'Overdue', cls: 'bg-red-100 text-red-700 border-red-200' }
  }
  if (t.submitted_count > 0 && t.pending_count === 0 && t.reviewed_count === t.submitted_count) {
    return { label: 'Completed', cls: 'bg-green-100 text-green-700 border-green-200' }
  }
  if (t.pending_count > 0) {
    return { label: 'Pending Review', cls: 'bg-orange-100 text-orange-700 border-orange-200' }
  }
  return { label: 'In Progress', cls: 'bg-blue-100 text-blue-700 border-blue-200' }
}

function dueDateDisplay(d: string | null): { text: string; urgent: boolean } {
  if (!d) return { text: '—', urgent: false }
  const due = new Date(d + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return { text: 'Today', urgent: true }
  if (diff === 1) return { text: 'Tomorrow', urgent: false }
  if (diff < 0) return { text: due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · Overdue', urgent: true }
  return { text: due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), urgent: false }
}

const MARKS_OPTIONS = [5, 10, 15, 20, 25, 50, 100]
const DEFAULT_FORM: TaskForm = {
  title: '', subject: '', task_type: 'homework',
  max_marks: 10, instructions: '', due_date: '', due_time: '23:59',
  assigned_to: 'all', status: 'draft',
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Tasks({ classId, grade, section, schoolId, teacher, prefillTitle, prefillSubject, onPrefillConsumed }: Props) {
  const isClassTeacher = teacher.class_teacher_grade === grade && teacher.class_teacher_section === section

  // View: 'list' | 'create' | 'review'
  const [view, setView] = useState<'list' | 'create' | 'review'>('list')
  const [reviewTaskId, setReviewTaskId] = useState<number | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // List state
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSubject, setFilterSubject] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Create/edit form state
  const [form, setForm] = useState<TaskForm>({ ...DEFAULT_FORM, subject: teacher.subject })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}`)
      const data = await res.json()
      setTasks(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [classId, schoolId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Arrived here via a topic's "Add Homework" button — open the create form
  // pre-filled instead of the plain list. Only fires once per navigation
  // (prefillTitle is cleared by the parent after being read, same "one-shot"
  // pattern classViewInitialTab already uses for cross-tab navigation).
  useEffect(() => {
    if (!prefillTitle) return
    const t = setTimeout(() => {
      openCreate({ title: prefillTitle, subject: prefillSubject })
      onPrefillConsumed?.()
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillTitle, prefillSubject])

  function openCreate(prefill?: { title?: string; subject?: string }) {
    setEditingTask(null)
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const due = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`
    setForm({ ...DEFAULT_FORM, subject: prefill?.subject || teacher.subject, title: prefill?.title || '', due_date: due })
    setFormError('')
    setView('create')
  }

  function openEdit(task: Task) {
    setEditingTask(task)
    setForm({
      title: task.title,
      subject: task.subject,
      task_type: task.task_type,
      max_marks: task.max_marks,
      instructions: task.instructions || '',
      due_date: task.due_date || '',
      due_time: task.due_time || '23:59',
      assigned_to: task.assigned_to,
      status: task.status as 'draft' | 'published',
    })
    setFormError('')
    setView('create')
  }

  function openReview(taskId: number) {
    setReviewTaskId(taskId)
    setView('review')
  }

  async function saveTask(publishStatus: 'draft' | 'published') {
    setFormError('')
    if (!form.title.trim()) { setFormError('Homework title is required'); return }
    if (!form.subject) { setFormError('Subject is required'); return }
    if (publishStatus === 'published' && !form.due_date) { setFormError('Due date is required to publish'); return }
    if (publishStatus === 'published' && !form.instructions.trim()) { setFormError('Instructions are required to publish'); return }

    setSaving(true)
    try {
      const payload = { school_id: schoolId, class_id: classId, teacher_id: teacher.id, ...form, status: publishStatus }
      const res = editingTask
        ? await fetch(`/api/tasks/${editingTask.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school_id: schoolId, teacher_id: teacher.id, ...form, status: publishStatus }),
          })
        : await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        const err = await res.json()
        setFormError(err.error || 'Failed to save task')
        return
      }
      await fetchTasks()
      setView('list')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTask(task: Task) {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return
    await fetch(`/api/tasks/${task.id}?school_id=${schoolId}&teacher_id=${teacher.id}`, { method: 'DELETE' })
    fetchTasks()
  }

  // ── Filtered tasks ───────────────────────────────────────────────────────
  const visibleTasks = tasks.filter(t => {
    if (!isClassTeacher && t.teacher_id !== teacher.id) return false
    if (filterSubject !== 'all' && t.subject.toLowerCase() !== filterSubject.toLowerCase()) return false
    if (filterStatus !== 'all') {
      const s = taskStatus(t).label.toLowerCase().replace(/\s+/g, '_')
      if (filterStatus !== s) return false
    }
    return true
  })

  const ownTasks = tasks.filter(t => t.teacher_id === teacher.id)
  const pendingReview = ownTasks.reduce((sum, t) => sum + t.pending_count, 0)
  const overdueTasks = ownTasks.filter(t => {
    const { label } = taskStatus(t)
    return label === 'Overdue'
  }).length

  const allSubjects = [...new Set(tasks.map(t => t.subject))]

  // ── REVIEW VIEW ───────────────────────────────────────────────────────────
  if (view === 'review' && reviewTaskId) {
    return (
      <TaskReview
        taskId={reviewTaskId}
        schoolId={schoolId}
        classId={classId}
        teacher={teacher}
        isClassTeacher={isClassTeacher}
        onBack={() => { setView('list'); fetchTasks() }}
      />
    )
  }

  const SUBJECTS = ['Maths', 'Science', 'English', 'Hindi', 'Social', 'Physics', 'Chemistry', 'Biology', 'Computer']

  // ── CREATE / EDIT VIEW ────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="space-y-5 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-gray-900">
            {editingTask ? 'Edit Homework' : 'Add Homework'}
          </h2>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Homework Title *</label>
            <input type="text" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Chapter 5 Exercise 1-10"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Subject *</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(s => (
                <button key={s} type="button"
                  onClick={() => setForm(f => ({ ...f, subject: s }))}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    form.subject.toLowerCase() === s.toLowerCase()
                      ? `${subjectColor(s)} text-white border-transparent`
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Instructions</label>
            <textarea value={form.instructions}
              onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              rows={5} placeholder="What should students do?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Due Date</label>
              <input type="date" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Marks</label>
              <div className="flex flex-wrap gap-1.5">
                {MARKS_OPTIONS.map(m => (
                  <button key={m} type="button"
                    onClick={() => setForm(f => ({ ...f, max_marks: m }))}
                    className={`px-2.5 py-1 rounded-lg text-sm font-semibold border transition-colors ${
                      form.max_marks === m
                        ? 'bg-slate-800 text-white border-transparent'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={() => setView('list')}
              className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={() => saveTask('draft')} disabled={saving}
              className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50">
              Save Draft
            </button>
            <button onClick={() => saveTask('published')} disabled={saving}
              className="bg-slate-800 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Publish Now'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Class teacher info banner */}
      {isClassTeacher && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-sm text-orange-700">
            As Class Teacher you can view all homework across subjects. You can only take action on your own subject
            (<span className="font-semibold">{teacher.subject}</span>).
          </p>
        </div>
      )}

      {/* Filters + Create button */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
          <option value="all">All Subjects</option>
          {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
          <option value="all">All Status</option>
          <option value="pending_review">Pending Review</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
          <option value="draft">Draft</option>
        </select>
        <button onClick={() => openCreate()}
          className="ml-auto flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          <span className="text-lg leading-none">+</span> Add Homework
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'TOTAL', value: visibleTasks.length, color: 'text-gray-900', border: 'border-l-gray-400' },
          { label: 'MINE', value: ownTasks.filter(t => t.status === 'published').length, color: 'text-orange-500', border: 'border-l-orange-400' },
          { label: 'PENDING REVIEW', value: pendingReview, color: 'text-orange-600', border: 'border-l-orange-500' },
          { label: 'OVERDUE', value: overdueTasks, color: 'text-red-600', border: 'border-l-red-400' },
        ].map(stat => (
          <div key={stat.label} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${stat.border} px-4 py-4`}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Homework table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading homework...</div>
        ) : visibleTasks.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No homework yet</p>
            <p className="text-gray-400 text-sm mt-1">Add the first homework for this class</p>
            <button onClick={() => openCreate()}
              className="mt-3 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors">
              + Add Homework
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-slate-200">
                <th className="text-left px-4 py-3 font-semibold">Homework</th>
                <th className="text-left px-3 py-3 font-semibold">Subject</th>
                <th className="text-left px-3 py-3 font-semibold">Teacher</th>
                <th className="text-left px-3 py-3 font-semibold">Assigned</th>
                <th className="text-left px-3 py-3 font-semibold">Due Date</th>
                <th className="text-left px-3 py-3 font-semibold">Submissions</th>
                <th className="text-left px-3 py-3 font-semibold">Status</th>
                <th className="text-left px-3 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {/* Own tasks first, then divider, then other subjects */}
              {(() => {
                const own = visibleTasks.filter(t => t.teacher_id === teacher.id)
                const others = visibleTasks.filter(t => t.teacher_id !== teacher.id)
                return (
                  <>
                    {own.map(task => <TaskRow key={task.id} task={task} isOwn={true} onReview={openReview} onEdit={openEdit} onDelete={deleteTask} />)}
                    {others.length > 0 && own.length > 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-2 text-center text-xs text-gray-400 italic bg-gray-50 border-y border-gray-100">
                          Other Subject Tasks — View Only
                        </td>
                      </tr>
                    )}
                    {others.map(task => <TaskRow key={task.id} task={task} isOwn={false} onReview={openReview} onEdit={openEdit} onDelete={deleteTask} />)}
                  </>
                )
              })()}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TaskRow sub-component ──────────────────────────────────────────────────

function TaskRow({
  task, isOwn, onReview, onEdit, onDelete,
}: {
  task: Task
  isOwn: boolean
  onReview: (id: number) => void
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const { label: statusLabel, cls: statusCls } = taskStatus(task)
  const { text: dueText, urgent: dueUrgent } = dueDateDisplay(task.due_date)
  const notSubmitted = task.total_students - task.submitted_count
  const submittedPct = task.total_students > 0 ? task.submitted_count / task.total_students : 0

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <button onClick={() => onReview(task.id)}
          className="text-left font-semibold text-blue-700 hover:text-blue-900 hover:underline">
          {task.title}
        </button>
        {task.status === 'draft' && (
          <span className="ml-2 text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">DRAFT</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`inline-block text-white text-[10px] font-bold px-2 py-1 rounded uppercase ${subjectColor(task.subject)}`}>
          {task.subject}
        </span>
      </td>
      <td className="px-3 py-3">
        {isOwn
          ? <span className="text-orange-600 font-medium text-xs">{task.teacher_name} (You)</span>
          : <span className="text-gray-600 text-xs">{task.teacher_name}</span>
        }
      </td>
      <td className="px-3 py-3 text-gray-500 text-xs">All {task.total_students} students</td>
      <td className="px-3 py-3">
        <span className={`text-xs font-semibold ${dueUrgent ? 'text-red-600' : 'text-gray-600'}`}>
          {dueText}
        </span>
      </td>
      <td className="px-3 py-3">
        {task.status === 'draft' ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          <span className={`text-xs font-semibold ${submittedPct >= 1 ? 'text-green-600' : notSubmitted > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
            {task.submitted_count}/{task.total_students} submitted
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${statusCls}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-3">
        {isOwn ? (
          <div className="flex items-center gap-1.5">
            {statusLabel === 'Pending Review' || statusLabel === 'Overdue' ? (
              <button onClick={() => onReview(task.id)}
                className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Review Now
              </button>
            ) : statusLabel === 'In Progress' ? (
              <button onClick={() => onReview(task.id)}
                className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Review
              </button>
            ) : statusLabel === 'Completed' ? (
              <button onClick={() => onReview(task.id)}
                className="border border-gray-300 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Results
              </button>
            ) : (
              <button onClick={() => onReview(task.id)}
                className="border border-gray-300 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                View
              </button>
            )}
            {task.status === 'draft' && (
              <button onClick={() => onEdit(task)}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button onClick={() => onDelete(task)}
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ) : (
          <button onClick={() => onReview(task.id)}
            className="border border-gray-200 text-gray-500 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View Only
          </button>
        )}
      </td>
    </tr>
  )
}
