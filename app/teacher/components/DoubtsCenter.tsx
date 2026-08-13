'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type Teacher = { id: number; name: string; subject: string }

type Doubt = {
  id: number
  subject: string
  question: string
  task_title: string | null
  status: string
  created_at: string
  last_message_at: string | null
  message_count: number
  student_name: string
  roll_number: string
  grade: string
  section: string
  answered_by_name: string | null
  class_id: number
  resolved_at: string | null
  closed_by_teacher: boolean
  is_class_faq: boolean
  upvote_count: number
}

type Message = {
  id: number
  sender_type: 'student' | 'teacher'
  sender_id: number
  sender_name: string
  message: string
  is_final_answer: boolean
  created_at: string
}

type Props = {
  teacher: Teacher
  schoolId: number
}

type Priority = 'high' | 'medium' | 'low'
type Filter = 'open' | 'in_progress' | 'resolved' | 'all'

function getPriority(createdAt: string, lastMsgAt: string | null, status: string, upvoteCount = 0): Priority {
  if (status === 'resolved' || status === 'in_progress') return 'low'
  // High priority: old doubts OR many classmates share the same doubt
  if (upvoteCount >= 3) return 'high'
  const ref = lastMsgAt || createdAt
  const hours = (Date.now() - new Date(ref).getTime()) / 3600000
  if (hours > 48 || upvoteCount >= 2) return 'high'
  if (hours > 24 || upvoteCount >= 1) return 'medium'
  return 'low'
}

function fmtTime(dt: string) {
  const d = new Date(dt)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000
  if (diffH < 1) return `${Math.round(diffH * 60)}m ago`
  if (diffH < 24) return `${Math.round(diffH)}h ago`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function fmtFull(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function canRespond(teacherSubject: string, doubtSubject: string, timetableSubjects: string[]): boolean {
  const allTeacherSubs = [
    ...teacherSubject.split(/[,&\/]/).map(s => s.trim().toLowerCase()),
    ...timetableSubjects.map(s => s.toLowerCase()),
  ]
  const ds = doubtSubject.toLowerCase()
  return allTeacherSubs.some(ts => ts && (ts.includes(ds.slice(0, 4)) || ds.includes(ts.slice(0, 4))))
}

const PriorityDot = ({ p }: { p: Priority }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
    p === 'high' ? 'text-red-600' : p === 'medium' ? 'text-amber-600' : 'text-green-600'
  }`}>
    <span className={`w-2 h-2 rounded-full ${
      p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-amber-400' : 'bg-green-500'
    }`} />
    {p.charAt(0).toUpperCase() + p.slice(1)}
  </span>
)

export default function DoubtsCenter({ teacher, schoolId }: Props) {
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('open')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [timetableSubjects, setTimetableSubjects] = useState<string[]>([])
  const [selected, setSelected] = useState<Doubt | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [togglingFaq, setTogglingFaq] = useState(false)
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const fetchDoubts = useCallback(async () => {
    const data = await fetch(`/api/doubts?school_id=${schoolId}&teacher_id=${teacher.id}`)
      .then(r => r.json()).catch(() => [])
    setDoubts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [schoolId, teacher.id])

  useEffect(() => {
    fetchDoubts()
    // Fetch teacher's timetable subjects for permission check
    fetch(`/api/timetable?school_id=${schoolId}&teacher_id=${teacher.id}`)
      .then(r => r.json()).then(data => {
        if (Array.isArray(data)) {
          const subs = [...new Set(data.map((e: { subject: string }) => e.subject).filter(Boolean))] as string[]
          setTimetableSubjects(subs)
        }
      }).catch(() => {})
  }, [fetchDoubts, schoolId, teacher.id])

  const fetchMessages = useCallback(async (doubtId: number) => {
    const data = await fetch(`/api/doubts/${doubtId}/messages?school_id=${schoolId}`)
      .then(r => r.json()).catch(() => [])
    setMessages(Array.isArray(data) ? data : [])
  }, [schoolId])

  function openChat(doubt: Doubt) {
    setSelected(doubt)
    setNewMsg('')
    setChatLoading(true)
    fetchMessages(doubt.id).finally(() => setChatLoading(false))
  }

  useEffect(() => {
    if (!selected) {
      if (pollerRef.current) clearInterval(pollerRef.current)
      return
    }
    pollerRef.current = setInterval(() => fetchMessages(selected.id), 4000)
    return () => { if (pollerRef.current) clearInterval(pollerRef.current) }
  }, [selected, fetchMessages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(isFinalAnswer = false) {
    if (!selected || !newMsg.trim()) return
    setSending(true)
    const res = await fetch(`/api/doubts/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        sender_type: 'teacher',
        sender_id: teacher.id,
        sender_name: teacher.name,
        message: newMsg.trim(),
        is_final_answer: isFinalAnswer,
      }),
    })
    if (res.ok) {
      setNewMsg('')
      await fetchMessages(selected.id)
      await fetchDoubts()
      setSelected(prev => prev ? { ...prev, status: prev.status === 'open' ? 'in_progress' : prev.status } : null)
    }
    setSending(false)
  }

  async function closeAsAnswered() {
    if (!selected) return
    if (!confirm('Mark this doubt as answered and close it? The student will be notified and can re-open if still confused.')) return
    setClosing(true)
    const res = await fetch(`/api/doubts/${selected.id}/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        action: 'teacher_close',
        teacher_id: teacher.id,
        teacher_name: teacher.name,
      }),
    })
    if (res.ok) {
      setSelected(prev => prev ? { ...prev, status: 'resolved', closed_by_teacher: true } : null)
      await fetchDoubts()
      if (pollerRef.current) clearInterval(pollerRef.current)
    }
    setClosing(false)
  }

  async function toggleFaq(doubt: Doubt) {
    setTogglingFaq(true)
    const res = await fetch(`/api/doubts/${doubt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        teacher_id: teacher.id,
        is_class_faq: !doubt.is_class_faq,
      }),
    })
    if (res.ok) {
      setSelected(prev => prev ? { ...prev, is_class_faq: !doubt.is_class_faq } : null)
      await fetchDoubts()
    }
    setTogglingFaq(false)
  }


  const subjects = [...new Set(doubts.map(d => d.subject))].sort()

  const filtered = doubts.filter(d => {
    if (filter !== 'all') {
      if (filter === 'open' && d.status !== 'open') return false
      if (filter === 'in_progress' && d.status !== 'in_progress') return false
      if (filter === 'resolved' && d.status !== 'resolved') return false
    }
    if (subjectFilter && d.subject !== subjectFilter) return false
    return true
  })

  const myDoubts = filtered.filter(d => canRespond(teacher.subject, d.subject, timetableSubjects))
  // View-only: hide resolved doubts — once a student resolves, class teacher no longer sees it in their view-only section
  const viewOnly = filtered.filter(d => !canRespond(teacher.subject, d.subject, timetableSubjects) && d.status !== 'resolved')

  // Stats are always computed from ALL doubts, independent of current filter
  const openCount = doubts.filter(d => d.status === 'open').length
  // "Your doubts" = active (open + in_progress) doubts for subjects you can respond to
  const myActiveCount = doubts.filter(d =>
    (d.status === 'open' || d.status === 'in_progress') &&
    canRespond(teacher.subject, d.subject, timetableSubjects)
  ).length
  const overdueCount = doubts.filter(d => {
    if (d.status !== 'open') return false
    const h = (Date.now() - new Date(d.created_at).getTime()) / 3600000
    return h > 48
  }).length
  const resolvedToday = doubts.filter(d => {
    if (d.status !== 'resolved') return false
    const today = new Date().toDateString()
    return d.resolved_at && new Date(d.resolved_at).toDateString() === today
  }).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Chat view ──────────────────────────────────────────────────────────────
  if (selected) {
    const isResolved = selected.status === 'resolved'
    const myDoubt = canRespond(teacher.subject, selected.subject, timetableSubjects)
    const priority = getPriority(selected.created_at, selected.last_message_at, selected.status, selected.upvote_count)

    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-7rem)]">
        {/* Chat header */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 flex items-center gap-4">
          <button onClick={() => setSelected(null)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="w-px h-6 bg-gray-200" />
          <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-600 font-bold text-sm">{selected.student_name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 text-sm">{selected.student_name}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                selected.subject === 'Mathematics' || selected.subject === 'Science' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>{selected.subject}</span>
              <PriorityDot p={priority} />
            </div>
            <p className="text-xs text-gray-400">Grade {selected.grade}-{selected.section} · Roll {selected.roll_number} · {fmtTime(selected.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* FAQ toggle — only for resolved doubts or class teacher */}
            {isResolved && (
              <button onClick={() => toggleFaq(selected)} disabled={togglingFaq}
                title={selected.is_class_faq ? 'Remove from Class FAQ' : 'Pin as Class FAQ'}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40 border ${
                  selected.is_class_faq
                    ? 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}>
                <svg className="w-3 h-3" fill={selected.is_class_faq ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                {togglingFaq ? '...' : selected.is_class_faq ? 'Un-FAQ' : 'Pin as FAQ'}
              </button>
            )}
            {myDoubt && !isResolved && (
              <button onClick={closeAsAnswered} disabled={closing}
                className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                {closing ? 'Closing...' : 'Close as Answered'}
              </button>
            )}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              isResolved ? 'bg-green-100 text-green-700' :
              selected.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {isResolved
                ? (selected.closed_by_teacher ? 'Closed by You' : 'Resolved by Student')
                : selected.status === 'in_progress' ? 'In Progress' : 'Open'}
            </span>
          </div>
        </div>

        {/* Question card */}
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-3">
          <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide mb-1.5">Original Question</p>
          <p className="text-sm text-gray-800 leading-relaxed">{selected.question}</p>
          {selected.task_title && (
            <p className="text-xs text-orange-400 mt-1.5">Related task: {selected.task_title}</p>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-y-auto p-4 space-y-3 min-h-0">
          {chatLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">{myDoubt ? 'Start the conversation below' : 'View only — not your subject'}</p>
            </div>
          ) : (
            messages.map(msg => {
              const isTeacher = msg.sender_type === 'teacher'
              if (msg.is_final_answer) {
                return (
                  <div key={msg.id} className="border border-green-200 bg-green-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Final Answer</span>
                      <span className="text-[10px] text-green-500 ml-auto">{fmtFull(msg.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed">{msg.message}</p>
                    <p className="text-[10px] text-green-600 mt-2">Student will be prompted to confirm resolution</p>
                  </div>
                )
              }
              return (
                <div key={msg.id} className={`flex gap-3 ${isTeacher ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    isTeacher ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
                  }`}>
                    {msg.sender_name.charAt(0)}
                  </div>
                  <div className={`max-w-[70%] ${isTeacher ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                    <p className={`text-[10px] text-gray-400 ${isTeacher ? 'text-right' : ''}`}>
                      {isTeacher ? 'You' : msg.sender_name}
                    </p>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isTeacher
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.message}
                    </div>
                    <p className={`text-[10px] text-gray-400 ${isTeacher ? 'text-right' : ''}`}>
                      {fmtFull(msg.created_at)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        {isResolved ? (
          /* ── Archived ── */
          <div className={`border rounded-xl p-4 mt-3 text-center flex-shrink-0 ${
            selected.closed_by_teacher
              ? 'bg-blue-50 border-blue-200'
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              <p className={`text-sm font-semibold ${selected.closed_by_teacher ? 'text-blue-700' : 'text-green-700'}`}>
                {selected.closed_by_teacher ? 'You closed this doubt as answered' : 'Student marked this as resolved'}
              </p>
            </div>
            <p className={`text-xs ${selected.closed_by_teacher ? 'text-blue-500' : 'text-green-500'}`}>
              Archived — student can re-open if still confused
            </p>
          </div>
        ) : myDoubt ? (
          /* ── Active reply input with Final Answer option ── */
          <div className="bg-white rounded-xl border border-gray-200 p-3 mt-3 flex-shrink-0">
            <textarea
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(false) } }}
              placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-2"
            />
            <div className="flex gap-2">
              <button onClick={() => sendMessage(false)} disabled={sending || !newMsg.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg font-semibold text-xs">
                {sending ? 'Sending...' : 'Send Reply'}
              </button>
              <button onClick={() => sendMessage(true)} disabled={sending || !newMsg.trim()}
                title="Send as Final Answer — student will be prompted to confirm resolved"
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Send as Final Answer
              </button>
            </div>
          </div>
        ) : (
          /* ── View only subject ── */
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mt-3 text-center text-xs text-gray-400">
            View only — this doubt is outside your subject area
          </div>
        )}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Doubt Center</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {teacher.subject} · {openCount} open · {doubts.filter(d => d.status === 'in_progress').length} in progress
          </p>
        </div>
        {overdueCount > 0 && (
          <span className="bg-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-lg">
            {overdueCount} overdue &gt;48h
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'TOTAL OPEN', val: openCount, color: 'text-orange-600' },
          { label: 'YOUR DOUBTS', val: myActiveCount, color: 'text-blue-600' },
          { label: 'OVERDUE 48H', val: overdueCount, color: 'text-red-600' },
          { label: 'RESOLVED TODAY', val: resolvedToday, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>


      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {subjects.length > 1 && (
          <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200">
            <option value="">All Subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={filter} onChange={e => setFilter(e.target.value as Filter)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200">
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="all">All Status</option>
        </select>
        <div className="ml-auto text-xs text-gray-400">
          {overdueCount > 0 && <span className="text-red-500 font-medium">{overdueCount} Overdue</span>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">{filter === 'open' ? 'No open doubts — all caught up!' : 'No doubts in this category'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* My subject doubts */}
          {myDoubts.length > 0 && (
            <div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800 text-white text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Student</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Subject</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Doubt</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Raised</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Priority</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {myDoubts.map(d => {
                      const priority = getPriority(d.created_at, d.last_message_at, d.status, d.upvote_count)
                      const isOverdue = priority === 'high' && d.status === 'open'
                      return (
                        <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'border-l-4 border-l-red-400' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-orange-600 text-xs font-bold">
                                  {d.student_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{d.student_name}</p>
                                <p className="text-[10px] text-gray-400">Grade {d.grade}-{d.section}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded uppercase">
                                {d.subject}
                              </span>
                              {d.upvote_count > 0 && (
                                <span title={`${d.upvote_count} classmate${d.upvote_count !== 1 ? 's' : ''} have the same doubt`}
                                  className="flex items-center gap-0.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
                                    <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                                  </svg>
                                  {d.upvote_count}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm text-gray-800 truncate">{d.question}</p>
                              {d.is_class_faq && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">FAQ</span>
                              )}
                            </div>
                            {d.message_count > 0 && (
                              <p className="text-[10px] text-blue-500">{d.message_count} message{d.message_count !== 1 ? 's' : ''}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {fmtTime(d.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium w-fit ${
                                d.status === 'resolved' ? 'bg-gray-100 text-gray-500' :
                                d.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {d.status === 'in_progress' ? 'In Progress' : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                              </span>
                              {isOverdue && (
                                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium w-fit">OVERDUE 48H</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <PriorityDot p={priority} />
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => openChat(d)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
                                d.status === 'resolved'
                                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  : isOverdue
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                              }`}>
                              {d.status === 'resolved' ? 'View' : isOverdue ? 'Respond Now' : 'Respond'}
                              {d.status !== 'resolved' && (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                              )}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* View-only doubts (other subjects) */}
          {viewOnly.length > 0 && (
            <div>
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest px-2">
                  Other Subject Doubts — View Only
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <tbody className="divide-y divide-gray-100">
                    {viewOnly.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors opacity-80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-gray-500 text-xs font-bold">
                                {d.student_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-700">{d.student_name}</p>
                              <p className="text-[10px] text-gray-400">Grade {d.grade}-{d.section}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold bg-purple-100 text-purple-600 px-2 py-0.5 rounded uppercase">
                            {d.subject}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <p className="text-sm text-gray-600 truncate">{d.question}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{fmtTime(d.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            d.status === 'resolved' ? 'bg-gray-100 text-gray-500' :
                            d.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {d.status === 'in_progress' ? 'In Progress' : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openChat(d)}
                            className="text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            View Only
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
