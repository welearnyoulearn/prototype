'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { InlineLoader } from '@/components/loaders'

type Student = { id: number; name: string; grade: string; section: string }
type Task = { id: number; title: string; subject: string }

type Doubt = {
  id: number
  subject: string
  question: string
  task_id: number | null
  task_title: string | null
  status: string
  created_at: string
  last_message_at: string | null
  message_count: number
  answered_by_name: string | null
  resolved_at: string | null
  closed_by_teacher: boolean
  is_class_faq: boolean
}

type FaqDoubt = {
  id: number
  subject: string
  question: string
  teacher_answer: string | null
  answered_by_name: string | null
  message_count: number
  created_at: string
}

type PeerDoubt = {
  id: number
  subject: string
  question: string
  status: string
  created_at: string
  last_message_at: string | null
  message_count: number
  upvote_count: number
  task_title: string | null
  is_mine: boolean
  has_upvoted: boolean
  display_name: string
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
  student: Student
  classId: number
  schoolId: number
}

const SUBJECTS = ['Mathematics', 'Science', 'English', 'Social Studies', 'Telugu', 'Hindi', 'Computer Science', 'Physics', 'Chemistry', 'Biology', 'Other']

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

export default function StudentDoubts({ student, classId, schoolId }: Props) {
  const [doubts, setDoubts] = useState<Doubt[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [classFaqs, setClassFaqs] = useState<FaqDoubt[]>([])
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  // Peer doubts tab
  const [activeTab, setActiveTab] = useState<'my' | 'class'>('my')
  const [peerDoubts, setPeerDoubts] = useState<PeerDoubt[]>([])
  const [peersLoading, setPeersLoading] = useState(false)
  const [upvoting, setUpvoting] = useState<number | null>(null)
  const [peerSubjectFilter, setPeerSubjectFilter] = useState('')
  const [selected, setSelected] = useState<Doubt | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)

  // Ask new doubt
  const [showAsk, setShowAsk] = useState(false)
  const [askSubject, setAskSubject] = useState('')
  const [askQuestion, setAskQuestion] = useState('')
  const [askTaskId, setAskTaskId] = useState('')
  const [askError, setAskError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // AI Chat state
  const [showAIChat, setShowAIChat] = useState(false)
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [aiThinking, setAiThinking] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const aiChatEndRef = useRef<HTMLDivElement>(null)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)

  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const fetchDoubts = useCallback(async () => {
    const data = await fetch(`/api/doubts?school_id=${schoolId}&student_id=${student.id}`)
      .then(r => r.json()).catch(() => [])
    setDoubts(Array.isArray(data) ? data : [])
  }, [student.id, schoolId])

  const fetchPeerDoubts = useCallback(async () => {
    setPeersLoading(true)
    const data = await fetch(`/api/doubts/peers?school_id=${schoolId}&class_id=${classId}&student_id=${student.id}`)
      .then(r => r.json()).catch(() => [])
    setPeerDoubts(Array.isArray(data) ? data : [])
    setPeersLoading(false)
  }, [student.id, classId, schoolId])

  useEffect(() => {
    Promise.all([
      fetchDoubts(),
      fetch(`/api/tasks?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/doubts?school_id=${schoolId}&class_id=${classId}&is_faq=true`).then(r => r.json()).catch(() => []),
    ]).then(([, taskData, faqData]) => {
      setTasks(Array.isArray(taskData) ? taskData.filter((t: Task & { status: string }) => t.status === 'published') : [])
      setClassFaqs(Array.isArray(faqData) ? faqData : [])
    }).finally(() => setLoading(false))
  }, [fetchDoubts, classId, schoolId])

  const fetchMessages = useCallback(async (doubtId: number) => {
    const data = await fetch(`/api/doubts/${doubtId}/messages?school_id=${schoolId}`)
      .then(r => r.json()).catch(() => [])
    setMessages(Array.isArray(data) ? data : [])
  }, [schoolId])

  function openChat(doubt: Doubt) {
    setSelected(doubt)
    setNewMsg('')
    setDismissedFinalPrompt(false)
    setChatLoading(true)
    fetchMessages(doubt.id).finally(() => {
      setChatLoading(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
  }

  useEffect(() => {
    if (!selected) {
      if (pollerRef.current) clearInterval(pollerRef.current)
      return
    }
    // 12s, not 4s — teacher replies aren't instant, so this doesn't need to
    // be near-real-time, and a slower poll means far fewer requests over the
    // life of an open chat (especially on mobile data).
    pollerRef.current = setInterval(() => {
      fetchMessages(selected.id).then(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }, 12000)
    return () => { if (pollerRef.current) clearInterval(pollerRef.current) }
  }, [selected, fetchMessages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, aiThinking])

  async function sendMessage() {
    if (!selected || !newMsg.trim() || selected.status === 'resolved') return
    setSending(true)
    const res = await fetch(`/api/doubts/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        sender_type: 'student',
        sender_id: student.id,
        sender_name: student.name,
        message: newMsg.trim(),
      }),
    })
    if (res.ok) {
      setNewMsg('')
      await fetchMessages(selected.id)
      await fetchDoubts()
    }
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function startAIChat() {
    setAskError('')
    if (!askSubject) { setAskError('Please select a subject'); return }
    if (askQuestion.trim().length < 10) { setAskError('Question must be at least 10 characters'); return }

    const initial: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: askQuestion.trim() },
    ]
    setAiMessages(initial)
    setAiInput('')
    setShowAIChat(true)
    setShowAsk(false)
    setAiThinking(true)

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: initial, subject: askSubject, grade: student.grade }),
      })
      const data = await res.json()
      if (data.reply) {
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble answering. Try rephrasing or ask your teacher.' }])
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please check your internet and try again.' }])
    } finally {
      setAiThinking(false)
    }
  }

  async function sendAIMessage() {
    if (!aiInput.trim() || aiThinking) return
    const updated: { role: 'user' | 'assistant'; content: string }[] = [
      ...aiMessages,
      { role: 'user', content: aiInput.trim() },
    ]
    setAiMessages(updated)
    setAiInput('')
    setAiThinking(true)

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, subject: askSubject, grade: student.grade }),
      })
      const data = await res.json()
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply ?? 'Sorry, something went wrong. Try again.',
      }])
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    } finally {
      setAiThinking(false)
      setTimeout(() => aiInputRef.current?.focus(), 50)
    }
  }

  async function submitDoubt() {
    setAskError('')
    if (!askSubject) { setAskError('Please select a subject'); return }
    if (askQuestion.trim().length < 10) { setAskError('Question must be at least 10 characters'); return }
    setSubmitting(true)
    const res = await fetch('/api/doubts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        class_id: classId,
        student_id: student.id,
        subject: askSubject,
        question: askQuestion.trim(),
        task_id: askTaskId || null,
      }),
    })
    if (res.ok) {
      const newDoubt = await res.json()
      setAskSubject(''); setAskQuestion(''); setAskTaskId(''); setShowAsk(false)
      await fetchDoubts()
      // Open the newly created doubt in chat
      openChat({ ...newDoubt, message_count: 0, task_title: null, answered_by_name: null, resolved_at: null, closed_by_teacher: false, is_class_faq: false })
    } else {
      const err = await res.json().catch(() => ({}))
      setAskError(err.error || 'Failed to submit doubt')
    }
    setSubmitting(false)
  }

  const [resolving, setResolving] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [dismissedFinalPrompt, setDismissedFinalPrompt] = useState(false)

  async function resolveDoubt(skipConfirm = false) {
    if (!selected) return
    if (!skipConfirm && !confirm('Mark this doubt as resolved? The chat will be archived and closed.')) return
    setResolving(true)
    setDismissedFinalPrompt(false)
    const res = await fetch(`/api/doubts/${selected.id}/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        student_id: student.id,
        student_name: student.name,
      }),
    })
    if (res.ok) {
      setSelected(prev => prev ? { ...prev, status: 'resolved', closed_by_teacher: false } : null)
      await fetchDoubts()
      if (pollerRef.current) clearInterval(pollerRef.current)
    }
    setResolving(false)
  }

  async function reopenDoubt() {
    if (!selected) return
    setReopening(true)
    const res = await fetch(`/api/doubts/${selected.id}/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        action: 'reopen',
        student_id: student.id,
        student_name: student.name,
      }),
    })
    if (res.ok) {
      setSelected(prev => prev ? { ...prev, status: 'in_progress', closed_by_teacher: false, resolved_at: null } : null)
      await fetchDoubts()
      // Restart polling
      if (pollerRef.current) clearInterval(pollerRef.current)
      pollerRef.current = setInterval(() => {
        fetchMessages(selected.id).then(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
      }, 12000)
    }
    setReopening(false)
  }

  async function deleteDoubt(id: number) {
    if (!confirm('Delete this doubt and all messages?')) return
    await fetch(`/api/doubts/${id}?school_id=${schoolId}&student_id=${student.id}`, { method: 'DELETE' })
    await fetchDoubts()
  }

  async function toggleUpvote(doubt: PeerDoubt) {
    if (doubt.is_mine || upvoting === doubt.id) return
    setUpvoting(doubt.id)
    // Optimistic update
    setPeerDoubts(prev => prev.map(d =>
      d.id === doubt.id
        ? { ...d, has_upvoted: !d.has_upvoted, upvote_count: d.has_upvoted ? d.upvote_count - 1 : d.upvote_count + 1 }
        : d
    ))
    try {
      await fetch(`/api/doubts/${doubt.id}/upvote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, student_id: student.id }),
      })
    } catch {
      // Rollback on error
      setPeerDoubts(prev => prev.map(d =>
        d.id === doubt.id
          ? { ...d, has_upvoted: doubt.has_upvoted, upvote_count: doubt.upvote_count }
          : d
      ))
    }
    setUpvoting(null)
  }

  const openCount = doubts.filter(d => d.status === 'open').length
  const inProgressCount = doubts.filter(d => d.status === 'in_progress').length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <InlineLoader portal="student" label="" />
    </div>
  )

  // ── AI Chat view ──────────────────────────────────────────────────────────
  if (showAIChat) {
    return (
      <div className="flex flex-col max-h-[calc(100vh-7rem)] h-[75vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl p-4 mb-3 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => { setShowAIChat(false); setShowAsk(true) }}
            className="flex items-center gap-2 text-sm text-white/80 hover:text-white flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="w-px h-5 bg-white/30" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">AI Tutor</p>
            <p className="text-xs text-white/70 truncate">{askSubject} · Grade {student.grade}</p>
          </div>
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-lg">✨</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Original question shown as context banner */}
          <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-sm text-violet-800">
            <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-1">Your question</p>
            <p className="leading-relaxed">{askQuestion}</p>
          </div>

          {aiMessages.slice(1).map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 self-end ${
                msg.role === 'user' ? 'bg-blue-100' : 'bg-violet-100'
              }`}>
                {msg.role === 'user'
                  ? <span className="text-blue-600 text-xs font-bold">{student.name.charAt(0)}</span>
                  : <span className="text-base">✨</span>
                }
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-violet-50 border border-violet-100 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {aiThinking && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 self-end">
                <span className="text-base">✨</span>
              </div>
              <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={aiChatEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white rounded-2xl border border-gray-200 p-3 mt-3 flex-shrink-0 space-y-2">
          <div className="flex gap-2">
            <textarea
              ref={aiInputRef}
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage() } }}
              placeholder="Ask a follow-up question..."
              rows={2}
              disabled={aiThinking}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none disabled:opacity-50"
            />
            <button
              onClick={sendAIMessage}
              disabled={aiThinking || !aiInput.trim()}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-4 rounded-xl flex-shrink-0 flex items-center gap-1.5 transition-colors">
              {aiThinking ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={async () => {
              setShowAIChat(false)
              await submitDoubt()
            }}
            className="w-full py-2 text-xs text-gray-500 hover:text-blue-700 border border-dashed border-gray-200 hover:border-blue-300 rounded-xl transition-colors flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Still confused? Ask your teacher instead
          </button>
        </div>
      </div>
    )
  }

  // ── Chat view ──────────────────────────────────────────────────────────────
  if (selected) {
    const isResolved = selected.status === 'resolved'

    return (
      <div className="flex flex-col max-h-[calc(100vh-7rem)] h-[75vh]">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => { setSelected(null); setMessages([]) }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            My Doubts
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 text-sm truncate">{selected.question.slice(0, 50)}{selected.question.length > 50 ? '...' : ''}</p>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-blue-600 font-medium">{selected.subject}</span>
              {selected.task_title && <span className="text-xs text-gray-400">· {selected.task_title}</span>}
              <span className="text-xs text-gray-400">· {fmtTime(selected.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Show resolve button when in_progress AND no pending final answer prompt */}
            {selected.status === 'in_progress' && (dismissedFinalPrompt || !messages.some(m => m.is_final_answer)) && (
              <button onClick={() => resolveDoubt(false)} disabled={resolving}
                className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                {resolving ? 'Resolving...' : 'Mark Resolved'}
              </button>
            )}
            <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
              isResolved ? 'bg-green-100 text-green-700' :
              selected.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {isResolved ? 'Resolved' : selected.status === 'in_progress' ? 'Replied' : 'Waiting'}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Original question bubble */}
          <div className="flex justify-end gap-3">
            <div className="max-w-[75%] flex flex-col items-end gap-0.5">
              <p className="text-[10px] text-gray-400">You · {fmtFull(selected.created_at)}</p>
              <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
                {selected.question}
              </div>
              {selected.task_title && (
                <p className="text-[10px] text-blue-400">Task: {selected.task_title}</p>
              )}
            </div>
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 self-end">
              <span className="text-blue-600 text-xs font-bold">{student.name.charAt(0)}</span>
            </div>
          </div>

          {chatLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">Waiting for teacher reply</p>
              <p className="text-xs text-gray-400 mt-1">Your teacher will respond soon. You can add more details below.</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.sender_type === 'student'
              const isLastMsg = idx === messages.length - 1
              // Show "Did this help?" prompt after a final answer if not dismissed and not yet resolved
              const showFinalPrompt = msg.is_final_answer && isLastMsg && !dismissedFinalPrompt && selected.status === 'in_progress'

              if (msg.is_final_answer) {
                return (
                  <div key={msg.id}>
                    <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Final Answer from {msg.sender_name}</span>
                        <span className="text-[10px] text-green-500 ml-auto">{fmtFull(msg.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed">{msg.message}</p>
                    </div>
                    {showFinalPrompt && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-amber-800 mb-3">Did this answer your doubt?</p>
                        <div className="flex gap-2">
                          <button onClick={() => resolveDoubt(true)} disabled={resolving}
                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            {resolving ? 'Resolving...' : 'Yes, resolved!'}
                          </button>
                          <button onClick={() => setDismissedFinalPrompt(true)}
                            className="flex-1 bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 font-semibold text-sm py-2.5 rounded-lg">
                            Still confused
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 self-end text-xs font-bold ${
                    isMe ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-700'
                  }`}>
                    {msg.sender_name.charAt(0)}
                  </div>
                  <div className={`max-w-[75%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                    <p className="text-[10px] text-gray-400">
                      {isMe ? 'You' : msg.sender_name} · {fmtFull(msg.created_at)}
                    </p>
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isMe
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        {isResolved ? (
          /* ── Archived state ── */
          <div className="mt-3 flex-shrink-0">
            {selected.closed_by_teacher ? (
              /* Teacher closed — student can re-open */
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  <p className="text-sm text-blue-700 font-semibold">Teacher marked this as answered</p>
                </div>
                <p className="text-xs text-blue-500 mb-3">Still confused? You can re-open this doubt and the teacher will be notified.</p>
                <button onClick={reopenDoubt} disabled={reopening}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold text-sm py-2 rounded-lg flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  {reopening ? 'Re-opening...' : 'Re-open Doubt'}
                </button>
              </div>
            ) : (
              /* Student resolved */
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  <p className="text-sm text-green-700 font-semibold">You marked this doubt as resolved</p>
                </div>
                <p className="text-xs text-green-500">This chat is archived. Ask a new doubt if you need more help.</p>
              </div>
            )}
          </div>
        ) : (
          /* ── Active chat input ── */
          <div className="bg-white rounded-xl border border-gray-200 p-3 mt-3 flex-shrink-0">
            {selected.status === 'in_progress' && (
              <p className="text-[10px] text-gray-400 mb-2 flex items-center gap-1">
                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                Satisfied with the answer? Click &quot;Mark Resolved&quot; above to close this doubt.
              </p>
            )}
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder={selected.status === 'in_progress' ? 'Need more clarification? Ask here...' : 'Add more details to your question...'}
                rows={2}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
              <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 rounded-xl font-semibold text-sm flex-shrink-0 flex items-center gap-1.5">
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Ask new doubt modal ────────────────────────────────────────────────────
  if (showAsk) {
    return (
      <div className="flex flex-col gap-4 max-w-xl">
        <button onClick={() => setShowAsk(false)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 self-start">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <div className="bg-white rounded-xl border-2 border-blue-100 p-6">
          <h3 className="font-bold text-gray-900 mb-1">Ask a New Doubt</h3>
          <p className="text-sm text-gray-500 mb-5">Your teacher will be notified and reply soon</p>
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Subject *</label>
                <select value={askSubject} onChange={e => { setAskSubject(e.target.value); setAskTaskId('') }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— Select subject —</option>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Show task selector only if the selected subject has tasks */}
              {askSubject && (() => {
                const subjectTasks = tasks.filter(t =>
                  t.subject?.toLowerCase().includes(askSubject.toLowerCase()) ||
                  askSubject.toLowerCase().includes(t.subject?.toLowerCase() || '')
                )
                if (subjectTasks.length === 0) return null
                return (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                      Related Task <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <select value={askTaskId} onChange={e => setAskTaskId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                      <option value="">— General doubt (not task-specific) —</option>
                      {subjectTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>
                )
              })()}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">Your Question *</label>
              <textarea
                value={askQuestion}
                onChange={e => setAskQuestion(e.target.value)}
                placeholder="Describe your doubt clearly. The more detail you give, the better answer you'll get..."
                rows={5}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
              <p className="text-xs text-gray-400 text-right mt-1">{askQuestion.length} chars (min 10)</p>
            </div>
            {askError && (
              <p className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">{askError}</p>
            )}

            {/* Two-path choice */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={startAIChat}
                disabled={submitting}
                className="py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-40 text-white flex items-center justify-center gap-2 transition-all shadow-sm">
                <span className="text-base">✨</span>
                Solve with AI
              </button>
              <button
                onClick={submitDoubt}
                disabled={submitting}
                className="py-3 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center gap-2 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {submitting ? 'Submitting…' : 'Ask Teacher'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 text-center">
              AI gives instant answers · Teacher gives verified answers
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Doubts list ────────────────────────────────────────────────────────────
  const peerSubjects = [...new Set(peerDoubts.map(d => d.subject))].sort()
  const filteredPeers = peerSubjectFilter
    ? peerDoubts.filter(d => d.subject === peerSubjectFilter)
    : peerDoubts

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Doubts</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeTab === 'my'
              ? `${doubts.length} total · ${openCount > 0 ? `${openCount} waiting` : 'all replied'}`
              : `${peerDoubts.length} open in your class`}
          </p>
        </div>
        <button onClick={() => { setShowAsk(true); setAskError('') }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ask a Doubt
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('my')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === 'my' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          My Doubts
          {doubts.filter(d => d.status !== 'resolved').length > 0 && (
            <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
              {doubts.filter(d => d.status !== 'resolved').length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('class')
            if (peerDoubts.length === 0) fetchPeerDoubts()
          }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === 'class' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          Class Doubts
          {peerDoubts.filter(d => !d.is_mine).length > 0 && (
            <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
              {peerDoubts.filter(d => !d.is_mine).length}
            </span>
          )}
        </button>
      </div>

      {/* ── MY DOUBTS TAB ── */}
      {activeTab === 'my' && <>

      {/* Class FAQ section */}
      {classFaqs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <h3 className="text-sm font-bold text-amber-800">Class FAQs</h3>
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{classFaqs.length} pinned by teacher</span>
          </div>
          <div className="space-y-2">
            {classFaqs.map(faq => (
              <div key={faq.id} className="bg-white rounded-lg border border-amber-100 overflow-hidden">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                  className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-amber-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2">{faq.question}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">{faq.subject}</span>
                      {faq.answered_by_name && (
                        <span className="text-[10px] text-gray-400">by {faq.answered_by_name}</span>
                      )}
                    </div>
                  </div>
                  <svg className={`w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5 transition-transform ${expandedFaq === faq.id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedFaq === faq.id && faq.teacher_answer && (
                  <div className="px-4 pb-4 border-t border-amber-100">
                    <p className="text-xs text-gray-500 mb-2 mt-3 font-semibold uppercase tracking-wide">Teacher&apos;s Answer</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{faq.teacher_answer}</p>
                  </div>
                )}
                {expandedFaq === faq.id && !faq.teacher_answer && (
                  <div className="px-4 pb-4 border-t border-amber-100">
                    <p className="text-sm text-gray-400 mt-3">
                      No direct answer yet — {faq.message_count > 0 ? `${faq.message_count} messages in discussion` : 'discussion in progress'}.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {doubts.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-20 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">No doubts yet</p>
          <p className="text-gray-400 text-sm">Don&apos;t hesitate to ask — your teachers are here to help!</p>
          <button onClick={() => { setShowAsk(true); setAskError('') }}
            className="mt-4 bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-blue-700">
            Ask Your First Doubt
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {doubts.map(d => {
            const hasTeacherReply = d.status === 'in_progress' || d.status === 'resolved'
            const isNew = !d.last_message_at || (d.message_count === 0 && d.status === 'open')
            return (
              // div instead of button to avoid nested-button hydration error (delete icon is inside)
              <div key={d.id} role="button" tabIndex={0}
                onClick={() => openChat(d)}
                onKeyDown={e => e.key === 'Enter' && openChat(d)}
                className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md hover:border-blue-200 transition-all group cursor-pointer">
                <div className="flex items-start gap-3">
                  {/* Status indicator */}
                  <div className={`flex-shrink-0 mt-0.5 w-2.5 h-2.5 rounded-full ${
                    d.status === 'resolved' ? 'bg-green-400' :
                    d.status === 'in_progress' ? 'bg-blue-400 animate-pulse' :
                    'bg-amber-400'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{d.question}</p>
                      <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        d.status === 'resolved' ? 'bg-green-100 text-green-700' :
                        d.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {d.status === 'resolved'
                          ? (d.closed_by_teacher ? 'Answered' : 'Resolved')
                          : d.status === 'in_progress' ? 'Replied' : 'Waiting'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded">{d.subject}</span>
                      {d.task_title && <span className="text-xs text-gray-400">· {d.task_title}</span>}
                      <span className="text-xs text-gray-400">{fmtTime(d.created_at)}</span>
                      {d.message_count > 0 && (
                        <span className="text-xs text-gray-400">
                          · {d.message_count} message{d.message_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {hasTeacherReply && d.answered_by_name && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
                          <span className="text-green-600 text-[8px] font-bold">{d.answered_by_name.charAt(0)}</span>
                        </div>
                        <p className="text-xs text-green-600 font-medium">{d.answered_by_name} replied</p>
                      </div>
                    )}

                    {isNew && d.status === 'open' && (
                      <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Waiting for teacher response
                      </p>
                    )}
                    {d.closed_by_teacher && d.status === 'resolved' && (
                      <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Tap to re-open if still confused
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); deleteDoubt(d.id) }}
                      className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      </> /* end MY DOUBTS TAB */}

      {/* ── CLASS DOUBTS TAB ── */}
      {activeTab === 'class' && (
        <div className="flex flex-col gap-3">

          {/* Explainer banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-blue-700">Anonymous Class Doubts</p>
              <p className="text-xs text-blue-500 mt-0.5">
                Names are hidden. Tap <strong>Me too!</strong> on doubts you share — teachers prioritize the most upvoted ones.
              </p>
            </div>
          </div>

          {/* Subject filter */}
          {peerSubjects.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setPeerSubjectFilter('')}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                  !peerSubjectFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                All
              </button>
              {peerSubjects.map(s => (
                <button key={s} onClick={() => setPeerSubjectFilter(s)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                    peerSubjectFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Peer doubts list */}
          {peersLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredPeers.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center">
              <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No open class doubts</p>
              <p className="text-gray-400 text-sm mt-1">Your classmates haven&apos;t asked any doubts yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPeers.map(d => (
                <div key={d.id} className={`bg-white rounded-xl border p-4 transition-all ${
                  d.is_mine
                    ? 'border-blue-200 bg-blue-50/30'
                    : d.upvote_count >= 3
                      ? 'border-orange-200 bg-orange-50/20'
                      : 'border-gray-200'
                }`}>
                  <div className="flex items-start gap-3">

                    {/* Left: upvote button */}
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
                      <button
                        onClick={() => toggleUpvote(d)}
                        disabled={d.is_mine || upvoting === d.id}
                        title={d.is_mine ? 'Your own doubt' : d.has_upvoted ? 'Remove me too' : 'I have this doubt too'}
                        className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center gap-0.5 border-2 transition-all disabled:cursor-not-allowed ${
                          d.is_mine
                            ? 'border-blue-200 bg-blue-50 text-blue-400 cursor-default'
                            : d.has_upvoted
                              ? 'border-orange-400 bg-orange-500 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-400 hover:border-orange-300 hover:text-orange-500'
                        }`}>
                        <svg className="w-3.5 h-3.5" fill={d.has_upvoted && !d.is_mine ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
                        </svg>
                      </button>
                      <span className={`text-[10px] font-bold ${
                        d.upvote_count >= 3 ? 'text-orange-600' :
                        d.upvote_count > 0 ? 'text-gray-600' : 'text-gray-300'
                      }`}>
                        {d.upvote_count || ''}
                      </span>
                    </div>

                    {/* Right: content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-3">{d.question}</p>
                        {d.is_mine && (
                          <span className="flex-shrink-0 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">You</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded">{d.subject}</span>
                        {d.task_title && (
                          <span className="text-[10px] text-gray-400">· {d.task_title}</span>
                        )}
                        <span className="text-[10px] text-gray-400">{fmtTime(d.created_at)}</span>
                        {d.message_count > 0 && (
                          <span className={`text-[10px] font-medium ${d.status === 'in_progress' ? 'text-green-600' : 'text-gray-400'}`}>
                            · {d.status === 'in_progress' ? 'Teacher replied' : `${d.message_count} messages`}
                          </span>
                        )}
                        {d.upvote_count >= 3 && (
                          <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                            🔥 {d.upvote_count} classmates
                          </span>
                        )}
                      </div>

                      {!d.is_mine && !d.has_upvoted && (
                        <button onClick={() => toggleUpvote(d)} disabled={upvoting === d.id}
                          className="mt-2 text-[11px] text-orange-600 font-semibold hover:text-orange-800 flex items-center gap-1 disabled:opacity-50">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
                          </svg>
                          Me too! I have the same doubt
                        </button>
                      )}
                      {!d.is_mine && d.has_upvoted && (
                        <button onClick={() => toggleUpvote(d)} disabled={upvoting === d.id}
                          className="mt-2 text-[11px] text-orange-500 font-semibold hover:text-gray-500 flex items-center gap-1 disabled:opacity-50">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
                          </svg>
                          You said me too · tap to undo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
