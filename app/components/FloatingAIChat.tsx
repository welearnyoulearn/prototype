'use client'

import { useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

type FloatingAIChatProps = {
  mode: 'student' | 'teacher'
  studentId?: number
  studentName?: string
  grade?: string
  schoolId?: number
  classId?: number
  teacherId?: number
  teacherName?: string
  teacherSubject?: string
}

const STUDENT_HINTS = [
  'What is photosynthesis?',
  'How do I solve quadratic equations?',
  'Tell me something interesting about space',
  'Help me write a short essay',
  'What career should I choose?',
  'Explain the French Revolution simply',
  'What are Newton\'s laws?',
  'How does the heart work?',
]

const TEACHER_HINTS = [
  'Give me a fun class activity for fractions',
  'How do I handle a disruptive student?',
  'Write a notice for a school event',
  'Explain a concept in a creative way',
  'Help me write student remarks',
  'Suggest a group project idea',
]

export default function FloatingAIChat({
  mode, studentId, studentName, grade, schoolId, classId,
  teacherName,
}: FloatingAIChatProps) {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [thinking, setThinking] = useState(false)
  const [unread, setUnread]     = useState(0)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [syllabusContext, setSyllabusContext] = useState('')
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isStudent = mode === 'student'
  const displayName = isStudent ? (studentName?.split(' ')[0] || 'there') : (teacherName?.split(' ')[0] || 'there')

  // Fetch syllabus summary once for student context
  useEffect(() => {
    if (!isStudent || !schoolId || !classId) return
    fetch(`/api/syllabus?school_id=${schoolId}&class_id=${classId}`)
      .then(r => r.json())
      .then(data => {
        const subjects: Array<{ subject: string; completion_pct: number; chapters: Array<{ chapter_name: string; covered: number; total: number }> }> = data.subjects || []
        if (!subjects.length) return
        const lines = subjects.map(s => {
          const recentChapter = s.chapters.find(ch => ch.covered > 0 && ch.covered < ch.total)
            || s.chapters[s.chapters.length - 1]
          const chapterHint = recentChapter ? `, currently on "${recentChapter.chapter_name}"` : ''
          return `${s.subject}: ${s.completion_pct}% covered${chapterHint}`
        })
        setSyllabusContext(`The student's current syllabus coverage:\n${lines.join('\n')}`)
      })
      .catch(() => {})
  }, [isStudent, schoolId, classId])

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setThinking(true)

    try {
      const res = await fetch('/api/ai/general-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          mode,
          grade: grade || undefined,
          name: isStudent ? studentName : teacherName,
          syllabusContext: syllabusContext || undefined,
        }),
      })
      const data = await res.json()
      const reply: string = data.reply || 'Sorry, I had trouble answering. Please try again.'
      const finalMessages: Message[] = [...newMessages, { role: 'assistant', content: reply }]
      setMessages(finalMessages)
      if (!open) setUnread(u => u + 1)

      // Save student sessions to DB for parent visibility
      if (isStudent && schoolId && studentId) {
        const payload = { school_id: schoolId, student_id: studentId, subject: 'General Chat', messages: finalMessages }
        if (!sessionSaved) {
          setSessionSaved(true)
          fetch('/api/ai/chat-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(() => {})
          fetch('/api/parent/activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school_id: schoolId, student_id: studentId, action_type: 'ai_chat', action_detail: 'AI Chat' }),
          }).catch(() => {})
        } else {
          fetch('/api/ai/chat-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(() => {})
        }
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error. Please try again.' }])
    }
    setThinking(false)
  }

  const hints = isStudent ? STUDENT_HINTS : TEACHER_HINTS

  // ── TEACHER: small floating panel (bottom-left) ──────────────────────────────
  if (!isStudent) {
    const gradientFrom = 'from-blue-700'
    const gradientTo   = 'to-blue-900'
    const bubbleUser   = 'bg-blue-700 text-white'
    const bubbleAI     = 'bg-white text-gray-800 border border-gray-100 shadow-sm'

    return (
      <>
        {!open && (
          <div className="fixed bottom-5 left-5 z-50">
            <button
              onClick={() => setOpen(true)}
              className={`flex items-center gap-2 bg-gradient-to-br ${gradientFrom} ${gradientTo} text-white rounded-2xl px-4 py-2.5 shadow-lg hover:shadow-xl transition-all ring-2 ring-white/30 hover:scale-105`}>
              <span className="text-lg">✨</span>
              <span className="text-sm font-semibold">Ask AI</span>
              {unread > 0 && (
                <span className="ml-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
          </div>
        )}

        {open && (
          <div className="fixed bottom-5 left-5 z-50 w-80 flex flex-col rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ height: '480px' }}>
            <div className={`bg-gradient-to-r ${gradientFrom} ${gradientTo} px-4 py-3 flex items-center justify-between flex-shrink-0`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <span className="text-base">✨</span>
                </div>
                <div>
                  <p className="text-white text-sm font-bold leading-tight">AI Assistant</p>
                  <p className="text-white/60 text-[10px] leading-tight">Hi {displayName}! Ask me anything</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={() => { setMessages([]); setSessionSaved(false) }} title="New chat"
                    className="text-white/60 hover:text-white text-sm px-1.5 py-1 rounded">↺</button>
                )}
                <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white w-6 h-6 flex items-center justify-center rounded text-base">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
              {messages.length === 0 && (
                <div className="py-4">
                  <p className="text-center text-gray-500 text-xs font-medium mb-3">Ask me anything — teaching, admin, writing, or general help!</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {hints.slice(0, 4).map(hint => (
                      <button key={hint} onClick={() => setInput(hint)}
                        className="text-[10px] bg-white border border-gray-200 text-gray-600 rounded-full px-2.5 py-1 hover:border-blue-300 hover:text-blue-700 transition-colors text-left">
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? `${bubbleUser} rounded-br-sm` : `${bubbleAI} rounded-bl-sm`
                  }`}>{m.content}</div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-1">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="bg-white border-t border-gray-100 p-3 flex-shrink-0">
              <div className="flex gap-2">
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask me anything..." disabled={thinking}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50" />
                <button onClick={send} disabled={!input.trim() || thinking}
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} text-white flex items-center justify-center disabled:opacity-40 hover:shadow-md transition-all flex-shrink-0`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── STUDENT: full-screen chatbot ──────────────────────────────────────────────
  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <div className="fixed bottom-5 left-5 z-50">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-2xl px-4 py-2.5 shadow-lg hover:shadow-xl transition-all ring-2 ring-white/30 hover:scale-105">
            <span className="text-lg">✨</span>
            <span className="text-sm font-semibold">Ask AI</span>
            {unread > 0 && (
              <span className="ml-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-violet-50 via-white to-purple-50 flex flex-col">

          {/* Top bar */}
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-3 flex items-center gap-3 flex-shrink-0 shadow-md">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-xl">✨</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-tight">AI Study Assistant</p>
              <p className="text-white/70 text-xs leading-tight">Hi {displayName}! Ask me anything — I&apos;m here to help</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {messages.length > 0 && (
                <button onClick={() => { setMessages([]); setSessionSaved(false) }} title="New chat"
                  className="flex items-center gap-1 text-white/70 hover:text-white text-xs bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  New chat
                </button>
              )}
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Grade badge */}
          {grade && (
            <div className="flex justify-center pt-2 flex-shrink-0">
              <span className="text-xs bg-violet-100 text-violet-700 px-3 py-1 rounded-full font-medium">
                Grade {grade} · Personalised for you
              </span>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] pb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center mb-5 shadow-lg">
                  <span className="text-4xl">✨</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-1">What would you like to know?</h3>
                <p className="text-gray-500 text-sm text-center mb-6 max-w-sm">
                  I can help with subjects, homework, career guidance, creative writing, fun facts — anything at all!
                </p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  {hints.map(hint => (
                    <button key={hint} onClick={() => { setInput(hint); setTimeout(() => inputRef.current?.focus(), 50) }}
                      className="text-left text-xs bg-white border border-violet-100 text-gray-700 rounded-xl px-3 py-2.5 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-colors shadow-sm leading-relaxed">
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <span className="text-sm">✨</span>
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 border border-violet-100 rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-violet-600">{displayName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>
            ))}

            {thinking && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-sm">✨</span>
                </div>
                <div className="bg-white border border-violet-100 rounded-2xl rounded-bl-sm px-5 py-3 flex items-center gap-1.5 shadow-sm">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input bar */}
          <div className="bg-white border-t border-violet-100 px-4 py-3 flex-shrink-0 shadow-lg">
            <p className="text-[10px] text-gray-400 text-center mb-2">Your chats are visible to your parents · Be respectful</p>
            <div className="flex gap-2 items-end max-w-2xl mx-auto">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Ask me anything..."
                disabled={thinking}
                className="flex-1 text-sm border border-violet-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50 bg-violet-50/50"
              />
              <button
                onClick={send}
                disabled={!input.trim() || thinking}
                className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white flex items-center justify-center disabled:opacity-40 hover:shadow-lg transition-all flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
