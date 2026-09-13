'use client'

import { useEffect, useRef, useState } from 'react'
import { INK, PURPLE, BORDER, SURFACE, CORAL, GREEN } from '@/app/components/ulearn/theme'

type Props = {
  schoolId: number
  classId: number
  grade: string
  studentId: number
  studentName: string
}

type SylSubject = { subject: string; board: string | null }

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  sourceChapter?: string | null
  flagged?: boolean
  blocked?: boolean
  upgradeCTA?: boolean
  errored?: boolean
}

type UsageStatus = { tier: 'free' | 'paid'; used: number; limit: number; blocked: boolean }

const PARENT_NOTE_KEY = 'ai-hub-parent-note-dismissed'
const LAST_USED_KEY = 'ai-hub-last-used-date'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode etc. — non-fatal */ }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Parses complete SSE frames out of an accumulating text buffer, returning
// what's left (a possibly-incomplete trailing frame) to keep accumulating.
function parseSSEFrames(buffer: string): { frames: { event: string; data: Record<string, unknown> }[]; rest: string } {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  const frames = parts
    .map(frame => {
      const lines = frame.split('\n')
      const eventLine = lines.find(l => l.startsWith('event:'))
      const dataLine = lines.find(l => l.startsWith('data:'))
      const event = eventLine ? eventLine.slice(6).trim() : ''
      let data: Record<string, unknown> = {}
      if (dataLine) {
        try { data = JSON.parse(dataLine.slice(5).trim()) } catch { /* malformed frame — skip */ }
      }
      return { event, data }
    })
    .filter(f => f.event)
  return { frames, rest }
}

function exampleQuestions(subject: string, grade: string): string[] {
  const gradeNum = parseInt(grade, 10)
  const young = !isNaN(gradeNum) && gradeNum <= 5
  if (young) {
    return [
      `Can you explain something from ${subject} simply?`,
      `Help me with my ${subject} homework`,
      `Tell me a fun fact about ${subject}`,
    ]
  }
  return [
    `Explain a tricky concept from ${subject}`,
    `Help me revise ${subject} for my test`,
    `Give me a practice question for ${subject}`,
  ]
}

export default function AiHub({ schoolId, classId, grade, studentName }: Props) {
  const [subjects, setSubjects] = useState<SylSubject[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(true)
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [customChapters, setCustomChapters] = useState<string[]>([])
  const [selectedChapter, setSelectedChapter] = useState<string>('')

  const [messagesBySubject, setMessagesBySubject] = useState<Record<string, ChatMessage[]>>({})
  const messages = messagesBySubject[selectedSubject] ?? []
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)

  const [usage, setUsage] = useState<UsageStatus | null>(null)
  const [showParentNote, setShowParentNote] = useState(() => safeGet(PARENT_NOTE_KEY) !== '1')
  const [showCelebration, setShowCelebration] = useState(false)
  const [upgradeNote, setUpgradeNote] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentSubjectMeta = subjects.find(s => s.subject === selectedSubject)
  const isCustom = !!currentSubjectMeta && !currentSubjectMeta.board

  // Load this student's subjects (reuses the same syllabus endpoint every
  // other student screen uses — no new "list my subjects" route needed).
  useEffect(() => {
    if (!schoolId || !classId) return
    setSubjectsLoading(true)
    fetch(`/api/syllabus?school_id=${schoolId}&class_id=${classId}`)
      .then(r => r.json())
      .then(data => {
        const list: SylSubject[] = (data.subjects || []).map((s: SylSubject) => ({ subject: s.subject, board: s.board }))
        setSubjects(list)
        if (list.length > 0) setSelectedSubject(prev => prev || list[0].subject)
      })
      .catch(() => {})
      .finally(() => setSubjectsLoading(false))
  }, [schoolId, classId])

  // Usage indicator.
  function refreshUsage() {
    fetch('/api/student/ai-usage').then(r => r.json()).then(data => {
      if (data && typeof data.used === 'number') setUsage(data)
    }).catch(() => {})
  }
  useEffect(() => {
    refreshUsage()
    // Limits are resolved fresh on every /ask and /ai-usage call server-side
    // (nothing about the daily limit is cached in the student's session) —
    // so if a parent upgrades the plan while this tab is open, a refetch on
    // refocus is enough to show it immediately, no reload/re-login needed.
    const onFocus = () => refreshUsage()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Subtle first-use-of-the-day celebration.
  useEffect(() => {
    const last = safeGet(LAST_USED_KEY)
    const today = todayStr()
    if (last !== today) {
      safeSet(LAST_USED_KEY, today)
      setShowCelebration(true)
      const t = setTimeout(() => setShowCelebration(false), 3200)
      return () => clearTimeout(t)
    }
  }, [])

  // Chapter picker for custom subjects.
  useEffect(() => {
    setSelectedChapter('')
    if (!selectedSubject || !isCustom) { setCustomChapters([]); return }
    fetch(`/api/student/custom-subject-chapters?subject=${encodeURIComponent(selectedSubject)}`)
      .then(r => r.json())
      .then(data => setCustomChapters(Array.isArray(data.chapters) ? data.chapters : []))
      .catch(() => setCustomChapters([]))
  }, [selectedSubject, isCustom])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  function setSubjectMessages(subject: string, updater: (prev: ChatMessage[]) => ChatMessage[]) {
    setMessagesBySubject(prev => ({ ...prev, [subject]: updater(prev[subject] ?? []) }))
  }

  async function sendMessage(rawText: string) {
    const text = rawText.trim()
    if (!text || streaming || !selectedSubject) return
    const subject = selectedSubject
    setUpgradeNote(false)
    setSubjectMessages(subject, prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '', streaming: true }])
    setInput('')
    setStreaming(true)

    const finalize = (patch: Partial<ChatMessage>) => {
      setSubjectMessages(subject, prev => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], ...patch, streaming: false }
        return next
      })
    }
    const appendChunk = (text: string) => {
      setSubjectMessages(subject, prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, content: last.content + text }
        return next
      })
    }

    try {
      const res = await fetch('/api/student/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, question: text, chapter: selectedChapter || undefined }),
      })
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Request failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { frames, rest } = parseSSEFrames(buffer)
        buffer = rest
        for (const frame of frames) {
          if (frame.event === 'chunk') {
            appendChunk(typeof frame.data.text === 'string' ? frame.data.text : '')
          } else if (frame.event === 'done' || frame.event === 'blocked' || frame.event === 'error') {
            finalize({
              content: typeof frame.data.answer === 'string' ? frame.data.answer : undefined,
              sourceChapter: (frame.data.sourceChapter as string | null) ?? null,
              flagged: !!frame.data.flagged,
              blocked: frame.event === 'blocked',
              upgradeCTA: !!frame.data.upgradeCTA,
              errored: frame.event === 'error',
            })
            if (frame.data.usage) setUsage(frame.data.usage as UsageStatus)
          }
        }
      }
    } catch {
      finalize({ content: "Sorry, something went wrong reaching the AI Doubt Assistant. Please try again.", errored: true })
    } finally {
      setStreaming(false)
    }
  }

  const usedPct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0
  const usageWarn = usedPct >= 80

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 220px)' }}>
      {/* Header */}
      <div className="anim-slide-up rounded-2xl border px-4 sm:px-5 py-4 mb-4 relative overflow-hidden"
        style={{ borderColor: BORDER, background: `linear-gradient(135deg, ${PURPLE}12, ${SURFACE})` }}>
        <div className="flex items-center gap-3">
          <div className="anim-float w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ background: PURPLE }}>
            <span className="text-xl">🤖</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-lg leading-tight" style={{ color: INK }}>AI Doubt Assistant</h2>
            <p className="text-xs text-gray-500 leading-tight">Ask anything from your syllabus, get an instant answer</p>
          </div>
          {usage && (
            <div key={usage.used} className="anim-num-pop text-right flex-shrink-0" data-testid="ai-hub-usage-pill">
              <div className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: usageWarn ? `${CORAL}1A` : `${PURPLE}14`, color: usageWarn ? CORAL : PURPLE }}>
                🔥 {usage.used}/{usage.limit} today
              </div>
            </div>
          )}
        </div>
      </div>

      {/* First-use-of-the-day celebration */}
      {showCelebration && (
        <div className="anim-scale-in mb-4 text-center text-sm font-semibold rounded-xl py-2.5" style={{ background: `${GREEN}14`, color: GREEN }}>
          🎉 Welcome back, {studentName.split(' ')[0]}! Ready to clear some doubts?
        </div>
      )}

      {/* One-time parent-visibility note */}
      {showParentNote && (
        <div className="anim-fade-in mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: '#6b7280' }}>
          <span className="flex-shrink-0">👀</span>
          <span className="flex-1">Heads up — your questions here are visible to your parents in their portal.</span>
          <button
            data-testid="ai-hub-dismiss-parent-note"
            onClick={() => { safeSet(PARENT_NOTE_KEY, '1'); setShowParentNote(false) }}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 font-bold px-1">✕</button>
        </div>
      )}

      {/* Subject picker */}
      {subjectsLoading ? (
        <div className="flex gap-2 mb-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-8 w-24 bg-gray-100 rounded-full" />)}
        </div>
      ) : subjects.length === 0 ? (
        <div className="text-sm text-gray-400 mb-4">No subjects set up for your class yet.</div>
      ) : (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1" data-testid="ai-hub-subject-picker">
          {subjects.map(s => (
            <button
              key={s.subject}
              data-testid={`ai-hub-subject-${s.subject}`}
              onClick={() => setSelectedSubject(s.subject)}
              className="flex-shrink-0 text-sm font-semibold px-3.5 py-1.5 rounded-full border transition-all active:scale-95"
              style={selectedSubject === s.subject
                ? { background: PURPLE, borderColor: PURPLE, color: 'white' }
                : { background: 'white', borderColor: BORDER, color: INK }}>
              {s.subject}
            </button>
          ))}
        </div>
      )}

      {/* Chapter picker — custom subjects only */}
      {isCustom && customChapters.length > 0 && (
        <div className="mb-4 anim-fade-in">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Chapter (optional)</label>
          <select
            data-testid="ai-hub-chapter-select"
            value={selectedChapter}
            onChange={e => setSelectedChapter(e.target.value)}
            className="w-full sm:w-auto text-sm border rounded-xl px-3 py-2 bg-white"
            style={{ borderColor: BORDER, color: INK }}>
            <option value="">All chapters</option>
            {customChapters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-4 mb-4">
        {messages.length === 0 && selectedSubject && (
          <div className="anim-fade-in flex flex-col items-center justify-center py-10 text-center">
            <div className="anim-float w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-sm" style={{ background: `${PURPLE}14` }}>
              <span className="text-3xl">💭</span>
            </div>
            <h3 className="font-bold mb-1" style={{ color: INK }}>What&apos;s your doubt in {selectedSubject}?</h3>
            <p className="text-gray-400 text-sm mb-5 max-w-xs">Ask in your own words — I&apos;ll answer using your syllabus.</p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {exampleQuestions(selectedSubject, grade).map(q => (
                <button key={q} data-testid="ai-hub-example-question"
                  onClick={() => sendMessage(q)}
                  className="card-lift text-left text-sm bg-white border rounded-xl px-3.5 py-2.5"
                  style={{ borderColor: BORDER, color: INK }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`anim-slide-up flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: PURPLE }}>
                <span className="text-sm">🤖</span>
              </div>
            )}
            <div className="max-w-[82%]">
              <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${m.role === 'user' ? 'rounded-br-sm text-white' : 'rounded-bl-sm bg-white border'}`}
                style={m.role === 'user' ? { background: PURPLE } : { borderColor: m.errored ? CORAL : BORDER, color: INK }}>
                {m.streaming && m.content === '' ? (
                  <span className="flex items-center gap-1 py-0.5">
                    {[0, 1, 2].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: PURPLE, animationDelay: `${d * 0.15}s` }} />)}
                  </span>
                ) : (
                  <>{m.content}{m.streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: PURPLE }} />}</>
                )}
              </div>
              {m.role === 'assistant' && m.sourceChapter && !m.streaming && (
                <p className="text-[10px] text-gray-400 mt-1 ml-1">📖 {m.sourceChapter}</p>
              )}
              {m.role === 'assistant' && m.upgradeCTA && !m.streaming && (
                <div className="mt-2 ml-1">
                  <button
                    data-testid="ai-hub-upgrade-btn"
                    onClick={() => setUpgradeNote(true)}
                    className="card-lift text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                    style={{ background: CORAL }}>
                    🚀 Upgrade for more doubts
                  </button>
                  {upgradeNote && (
                    <p className="anim-fade-in text-[11px] text-gray-400 mt-1.5">Ask your parent to upgrade your plan from the AI Tutor section of their portal.</p>
                  )}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm" style={{ background: `${PURPLE}1A`, color: PURPLE }}>
                {studentName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 bg-white border-t pt-3 -mx-4 sm:-mx-6 px-4 sm:px-6" style={{ borderColor: BORDER }}>
        {usageWarn && usage && !usage.blocked && (
          <p className="text-xs mb-2 font-medium" style={{ color: CORAL }}>
            You&apos;ve used {usage.used} of {usage.limit} doubts today — almost at your limit.
          </p>
        )}
        <div className="flex gap-2 items-center pb-3">
          <input
            ref={inputRef}
            data-testid="ai-hub-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder={selectedSubject ? `Ask about ${selectedSubject}...` : 'Pick a subject to start...'}
            disabled={streaming || !selectedSubject}
            className="flex-1 text-sm border rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 disabled:opacity-50"
            style={{ borderColor: BORDER }}
          />
          <button
            data-testid="ai-hub-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming || !selectedSubject}
            className="w-11 h-11 rounded-2xl text-white flex items-center justify-center disabled:opacity-40 transition-all active:scale-90 flex-shrink-0 shadow-sm"
            style={{ background: PURPLE }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
