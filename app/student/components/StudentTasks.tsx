'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { ProgressBar } from '@/components/loaders'

type Student = { id: number; name: string; grade: string; section: string }

type Task = {
  id: number
  title: string
  subject: string
  task_type: 'practice' | 'homework' | 'test'
  max_marks: number
  instructions: string | null
  due_date: string | null
  due_time: string | null
  status: string
  teacher_name: string
}

type Submission = {
  submission_id: number | null
  submitted_at: string | null
  submission_text: string | null
  file_url: string | null
  file_name: string | null
  score: number | null
  feedback: string | null
  status: string | null
  resubmission_requested: boolean | null
}

type Props = {
  student: Student
  classId: number
  schoolId: number
}

type Filter = 'all' | 'pending' | 'submitted' | 'reviewed'

function gradeFromScore(score: number, max: number) {
  const p = (score / max) * 100
  if (p >= 90) return 'A'
  if (p >= 80) return 'A-'
  if (p >= 75) return 'B+'
  if (p >= 70) return 'B'
  if (p >= 60) return 'C+'
  if (p >= 50) return 'C'
  return 'D'
}

export default function StudentTasks({ student, classId, schoolId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [submissions, setSubmissions] = useState<Map<number, Submission>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Task | null>(null)
  const [submissionText, setSubmissionText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string; public_id: string; size_kb: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const taskData = await fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}`)
        .then(r => r.json()).catch(() => [])
      const published = Array.isArray(taskData) ? taskData.filter((t: Task) => t.status === 'published') : []
      setTasks(published)

      const subMap = new Map<number, Submission>()
      await Promise.all(
        published.map(async (t: Task) => {
          const rows = await fetch(`/api/tasks/${t.id}/submissions?school_id=${schoolId}&student_id=${student.id}`)
            .then(r => r.json()).catch(() => [])
          if (Array.isArray(rows) && rows[0]) subMap.set(t.id, rows[0])
        })
      )
      setSubmissions(subMap)
    } finally {
      setLoading(false)
    }
  }, [student.id, classId, schoolId])

  useEffect(() => { fetchAll() }, [fetchAll])

  function openTask(task: Task) {
    const sub = submissions.get(task.id)
    setSelected(task)
    setSubmissionText(sub?.submission_text || '')
    setSubmitMsg('')
    setUploadFile(null)
    setUploadedFile(null)
    setUploadProgress(0)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setSubmitMsg('File must be under 10MB')
      return
    }
    setUploadFile(file)
    setUploadProgress(0)
    setUploadedFile(null)
    setSubmitMsg('')

    try {
      // Get signed upload params
      const signRes = await fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'task-submissions' }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) {
        const msg = signData?.error || 'Failed to get upload signature'
        throw new Error(msg.includes('not configured') ? 'File upload is not set up yet. You can still submit without a file.' : msg)
      }
      const { signature, timestamp, cloud_name, api_key, folder } = signData

      // Upload to Cloudinary
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', api_key)
      formData.append('timestamp', String(timestamp))
      formData.append('signature', signature)
      formData.append('folder', folder)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`)
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
      }
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            const result = JSON.parse(xhr.responseText)
            setUploadedFile({
              url: result.secure_url,
              name: file.name,
              public_id: result.public_id,
              size_kb: Math.round(file.size / 1024),
            })
            setUploadProgress(100)
            resolve()
          } else {
            reject(new Error('Upload failed'))
          }
        }
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(formData)
      })
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : 'File upload failed. Try again.')
      setUploadFile(null)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function submitTask() {
    if (!selected) return
    setSubmitting(true)
    setSubmitMsg('')

    const now = new Date()
    const submitted_at = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`

    // Always POST — the API uses ON CONFLICT to handle both first submission and resubmission
    const res = await fetch(`/api/tasks/${selected.id}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        student_id: student.id,
        submission_text: submissionText || null,
        submitted_at,
        status: 'pending',
        ...(uploadedFile ? {
          file_url: uploadedFile.url,
          file_name: uploadedFile.name,
          file_public_id: uploadedFile.public_id,
          file_size_kb: uploadedFile.size_kb,
        } : {}),
      }),
    })

    if (res.ok) {
      setSubmitMsg('Submitted successfully!')
      await fetchAll()
    } else {
      const err = await res.json().catch(() => ({}))
      setSubmitMsg(err.error || 'Failed to submit')
    }
    setSubmitting(false)
  }

  const now = new Date()
  const filtered = tasks.filter(t => {
    const sub = submissions.get(t.id)
    if (filter === 'pending') return !sub?.submitted_at
    if (filter === 'submitted') return !!sub?.submitted_at && sub.status !== 'reviewed'
    if (filter === 'reviewed') return sub?.status === 'reviewed'
    return true
  })

  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => !submissions.get(t.id)?.submitted_at).length,
    submitted: tasks.filter(t => { const s = submissions.get(t.id); return s?.submitted_at && s.status !== 'reviewed' }).length,
    reviewed: tasks.filter(t => submissions.get(t.id)?.status === 'reviewed').length,
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (selected) {
    const sub = submissions.get(selected.id)
    const isOverdue = !sub?.submitted_at && selected.due_date && new Date(selected.due_date) < now
    const canResubmit = sub?.resubmission_requested

    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 self-start">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Homework
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {selected.subject} · {selected.task_type} · {selected.max_marks} marks · {selected.teacher_name}
                {selected.due_date && ` · Due ${selected.due_date}`}
              </p>
            </div>
            {isOverdue && <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">Overdue</span>}
          </div>

          {selected.instructions && (
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed mb-4 whitespace-pre-wrap">
              {selected.instructions}
            </div>
          )}

          {/* Reviewed result */}
          {sub?.status === 'reviewed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-green-800">Your Result</p>
                {sub.score !== null && (
                  <span className="text-lg font-bold text-green-700">
                    {sub.score}/{selected.max_marks}
                    <span className="text-sm ml-1 text-green-600">({gradeFromScore(sub.score, selected.max_marks)})</span>
                  </span>
                )}
              </div>
              {sub.feedback && (
                <div className="text-sm text-gray-700 bg-white rounded p-3 border border-green-100">
                  <p className="text-xs text-gray-400 mb-1">Teacher Feedback</p>
                  {sub.feedback}
                </div>
              )}
              {canResubmit && (
                <div className="mt-3 text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded px-3 py-2">
                  Teacher has requested a resubmission. Please update your answer below.
                </div>
              )}
            </div>
          )}

          {/* Submission status */}
          {sub?.submitted_at && sub.status !== 'reviewed' && !canResubmit && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-sm text-blue-700">
              ✓ Submitted — awaiting review
              {sub.submission_text && <p className="text-xs text-blue-500 mt-1 truncate">&quot;{sub.submission_text}&quot;</p>}
              {sub.file_url && (
                <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  {sub.file_name || 'View attachment'}
                </a>
              )}
            </div>
          )}

          {/* Submit form — show if not yet submitted, or if resubmission requested */}
          {(!sub?.submitted_at || canResubmit) && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your Answer / Notes</label>
                <textarea
                  value={submissionText}
                  onChange={e => setSubmissionText(e.target.value)}
                  placeholder="Write your answer or notes here..."
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Attach File <span className="font-normal text-gray-400">(optional · max 10MB)</span></label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {!uploadedFile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!!uploadFile && uploadProgress < 100}
                      className="flex items-center gap-2 text-xs border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 px-3 py-2 rounded-lg w-full justify-center transition-colors disabled:opacity-50"
                    >
                      {uploadFile && uploadProgress < 100 ? (
                        'Uploading…'
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          Choose file to attach
                        </>
                      )}
                    </button>
                    {uploadFile && uploadProgress < 100 && (
                      <div className="mt-2">
                        <ProgressBar portal="student" progress={uploadProgress} label="Uploading" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="text-xs text-green-700 flex-1 truncate">{uploadedFile.name} ({uploadedFile.size_kb}KB)</span>
                    <button type="button" onClick={() => { setUploadedFile(null); setUploadFile(null); setUploadProgress(0) }}
                      className="text-gray-400 hover:text-red-500 flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
              </div>

              {submitMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${submitMsg.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {submitMsg}
                </p>
              )}

              <button
                onClick={submitTask}
                disabled={submitting || (!submissionText.trim() && !uploadedFile) || (!!uploadFile && uploadProgress < 100)}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {submitting ? 'Submitting...' : canResubmit ? 'Resubmit Task' : 'Submit Task'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">My Homework</h2>
        <p className="text-sm text-gray-500 mt-0.5">{tasks.length} assigned · Grade {student.grade}-{student.section}</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['all', 'pending', 'submitted', 'reviewed'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
              filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className={`ml-1.5 text-[10px] px-1 rounded ${filter === f ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-400'}`}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
          No tasks in this category
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(t => {
            const sub = submissions.get(t.id)
            const isOverdue = !sub?.submitted_at && t.due_date && new Date(t.due_date) < now
            return (
              <button key={t.id} onClick={() => openTask(t)}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md hover:border-blue-200 transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">{t.title}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                    sub?.status === 'reviewed' ? 'bg-green-100 text-green-700' :
                    sub?.submitted_at ? 'bg-blue-100 text-blue-700' :
                    isOverdue ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {sub?.status === 'reviewed' && sub.score !== null ? `${sub.score}/${t.max_marks} (${gradeFromScore(sub.score, t.max_marks)})` :
                     sub?.submitted_at ? 'Submitted' :
                     isOverdue ? 'Overdue' : 'Pending'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{t.subject} · {t.max_marks} marks</p>
                {t.due_date && (
                  <p className={`text-xs mt-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                    Due {t.due_date}
                  </p>
                )}
                {sub?.resubmission_requested && (
                  <p className="text-[10px] text-purple-600 mt-1.5 bg-purple-50 px-2 py-0.5 rounded-full inline-block">
                    Resubmission requested
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
