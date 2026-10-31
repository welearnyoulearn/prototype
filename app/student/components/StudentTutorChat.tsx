'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, BookOpen, Check, Copy, History, Square, SquarePen, X } from 'lucide-react'
import { Sticker } from './stickers'
import { citedSources, isTableSeparator, tableCells } from '@/lib/tutor-text'

type Source = { n: number; title: string; page: number; url: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; sources: Source[] }
type PastChat = { id: number; subject: string | null; updated_at: string; preview: string | null }
type StoredMessage = { role: 'user' | 'assistant'; content: string; sources?: { title: string; page: number; fileUrl: string }[] }
type StreamLine =
  | { type: 'session'; sessionId: number }
  | { type: 'sources'; sources: Source[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; sessionId: number }
  | { type: 'error'; message: string }

const MAX_CHARS = 1000

// Minimal markdown: **bold** inline, # headings, "- " / "1. " lists, GFM tables, blank-line paragraphs.
// Everything renders through React text nodes, so model output can never inject HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
}

function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => { if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>); para = [] }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>)
    list = null
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const header = tableCells(line)
    if (header && isTableSeparator(lines[i + 1] ?? '')) {
      flushPara(); flushList()
      const rows: string[][] = []
      for (i += 2; i < lines.length; i++) {
        const cells = tableCells(lines[i])
        if (!cells) { i--; break }
        rows.push(cells)
      }
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto">
          <table className="border-collapse text-left text-sm">
            <thead><tr>{header.map((c, j) => <th key={j} className="border border-black/10 px-2.5 py-1.5 font-bold">{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border border-black/10 px-2.5 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>)
      continue
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/)
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const item = bullet ?? numbered
    if (heading) {
      flushPara(); flushList()
      blocks.push(<h4 key={blocks.length} className="pt-1 text-[15px] font-extrabold">{inline(heading[1].replace(/\s*#+\s*$/, ''))}</h4>)
    } else if (item) {
      flushPara()
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push(item[1])
    } else if (!line.trim() || /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { flushPara(); flushList() } // blank or --- rule
    else { flushList(); para.push(line.trim()) }
  }
  flushPara(); flushList()
  return <div className="space-y-3">{blocks}</div>
}


function toSources(stored: StoredMessage['sources']): Source[] {
  return (stored ?? []).map((s, i) => ({ n: i + 1, title: s.title, page: s.page, url: `${s.fileUrl}#page=${s.page}` }))
}

async function fetchPastChats(): Promise<PastChat[]> {
  const r = await fetch('/api/student/tutor').catch(() => null)
  const data = r?.ok ? await r.json().catch(() => null) as { sessions?: PastChat[] } | null : null
  return data?.sessions ?? []
}

const SUGGESTIONS = [
  'Explain photosynthesis',
  'What is in my English syllabus?',
  'Help me solve a quadratic equation',
  'కిరణజన్య సంయోగక్రియ అంటే ఏమిటి?',
]
const COUNTER_FROM = 800
const FOLLOW_PX = 80 // keep following the stream only while the student is this close to the bottom
const MAX_INPUT_PX = 168 // ~6 rows, then the textarea scrolls
// The composer sits inside its own rounded box, so it drops the portal's heavy input styling.
const bareInput = { border: 'none', boxShadow: 'none', background: 'transparent', outline: 'none', borderRadius: 0, resize: 'none' } as const

export default function StudentTutorChat() {
  const [subjects, setSubjects] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [pastChats, setPastChats] = useState<PastChat[] | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const historyButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeHistoryRef = useRef<HTMLButtonElement | null>(null)
  const followRef = useRef(true)

  const loadPastChats = () => fetchPastChats().then(setPastChats)

  useEffect(() => {
    fetch('/api/student/subjects')
      .then(r => r.ok ? r.json() as Promise<{ subjects?: { subject_name: string }[] }> : { subjects: [] })
      .then(d => setSubjects((d.subjects ?? []).map(s => s.subject_name)))
      .catch(() => setSubjects([]))
    fetchPastChats().then(setPastChats)
    return () => abortRef.current?.abort()
  }, [])

  // Scroll the message list, never the page — and only while the student hasn't scrolled up to read.
  useEffect(() => {
    const list = listRef.current
    if (list && followRef.current) list.scrollTop = list.scrollHeight
  }, [messages, loadingChat])

  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_INPUT_PX)}px`
  }, [input])

  useEffect(() => {
    if (!historyOpen) return
    closeHistoryRef.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeHistory() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [historyOpen])

  function onListScroll() {
    const list = listRef.current
    if (list) followRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_PX
  }

  function closeHistory() {
    setHistoryOpen(false)
    historyButtonRef.current?.focus()
  }

  function updateLast(fn: (m: ChatMessage) => ChatMessage) {
    setMessages(prev => prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev)
  }

  async function send(text = input) {
    const message = text.trim()
    if (!message || streaming || message.length > MAX_CHARS) return
    setError(null)
    setInput('')
    followRef.current = true
    setMessages(prev => [...prev, { role: 'user', content: message, sources: [] }, { role: 'assistant', content: '', sources: [] }])
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/student/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, ...(sessionId ? { sessionId } : {}), ...(subject ? { subject } : {}) }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        setMessages(prev => prev.slice(0, -2))
        setInput(message)
        setError(res.status === 503 ? 'The AI tutor is not switched on yet. Please check back soon.'
          : res.status === 429 ? (data?.error ?? "You've reached today's question limit. Come back tomorrow!")
          : data?.error ?? 'The tutor could not answer right now. Please try again.')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const handle = (raw: string) => {
        if (!raw.trim()) return
        const line = JSON.parse(raw) as StreamLine
        if (line.type === 'sources') updateLast(m => ({ ...m, sources: line.sources }))
        else if (line.type === 'delta') updateLast(m => ({ ...m, content: m.content + line.text }))
        else if (line.type === 'session' || line.type === 'done') setSessionId(line.sessionId)
        else if (line.type === 'error') setError(line.message)
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach(handle)
      }
      handle(buffer)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError('Connection lost. Please try again.')
    } finally {
      abortRef.current = null
      setStreaming(false)
      void loadPastChats()
    }
  }

  function stop() { abortRef.current?.abort() }

  function newChat() {
    stop()
    setMessages([]); setSessionId(null); setError(null); setInput('')
    inputRef.current?.focus()
  }

  async function openChat(id: number) {
    stop()
    setHistoryOpen(false)
    setError(null); setLoadingChat(true)
    followRef.current = true
    try {
      const r = await fetch(`/api/student/tutor?sessionId=${id}`)
      if (!r.ok) throw new Error()
      const data = await r.json() as { id: number; subject: string | null; messages: StoredMessage[] }
      setSessionId(data.id)
      setSubject(data.subject ?? '')
      setMessages(data.messages.map(m => ({ role: m.role, content: m.content, sources: toSources(m.sources) })))
    } catch {
      setError('Could not open that chat. Please try again.')
    } finally {
      setLoadingChat(false)
    }
  }

  async function copy(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(i)
      setTimeout(() => setCopied(c => c === i ? null : c), 1500)
    } catch {
      setError('Could not copy. Select the text and copy it instead.')
    }
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void send() }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
  }

  const iconButton = 'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap gap-1.5 rounded-full px-3 text-sm font-bold text-[var(--sb-ink-soft)] hover:bg-black/5 hover:text-[var(--sb-ink)]'

  return (
    <div className="relative flex h-[calc(100dvh-204px)] min-h-[420px] flex-col lg:h-[calc(100dvh-188px)] lg:max-h-[900px]" data-testid="tutor-chat">
      <div className="flex items-center gap-2 border-b border-black/10 pb-2">
        <label className="min-w-0">
          <span className="sr-only">Subject</span>
          <select value={subject} onChange={e => setSubject(e.target.value)} disabled={streaming} data-testid="tutor-subject-select"
            className="max-w-[40vw] truncate px-3 text-sm font-bold sm:max-w-[220px]" style={{ minHeight: 38, boxShadow: 'none', borderWidth: 2 }}>
            <option value="">All subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button ref={historyButtonRef} type="button" onClick={() => setHistoryOpen(true)} className={`${iconButton} ml-auto`}
          aria-haspopup="dialog" aria-expanded={historyOpen} data-testid="tutor-history-open">
          <History size={17} aria-hidden="true" /> History
        </button>
        <button type="button" onClick={newChat} className={iconButton} data-testid="tutor-new-chat">
          <SquarePen size={17} aria-hidden="true" /> New chat
        </button>
      </div>

      <div ref={listRef} onScroll={onListScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-live="polite" aria-busy={streaming || loadingChat} data-testid="tutor-messages">
        <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-6 px-1 py-5 sm:px-2">
          {loadingChat ? <p className="sb-muted text-sm">Opening chat…</p>
            : messages.length === 0 ? (
              <div className="m-auto flex flex-col items-center gap-5 py-6 text-center">
                <Sticker name="light-bulb" size="lg" tilt={-8} />
                <h2 className="sb-display text-2xl sm:text-3xl">What do you want to learn today?</h2>
                <ul className="flex max-w-xl flex-wrap justify-center gap-2" aria-label="Suggested questions">
                  {SUGGESTIONS.map((q, i) => (
                    <li key={q}>
                      <button type="button" onClick={() => void send(q)} data-testid={`tutor-suggestion-${i}`}
                        className="rounded-full border border-black/15 bg-[var(--sb-paper)] px-4 py-2 text-sm font-semibold hover:border-black/30 hover:bg-white">
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : messages.map(m => ({ ...m, sources: citedSources(m.sources, m.content) })).map((m, i) => {
              if (m.role === 'user') return (
                <div key={i} className="ml-auto max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] bg-[var(--sb-blue-soft)] px-4 py-2.5 text-[15px] leading-[1.55]"
                  data-testid="tutor-message-user">{m.content}</div>
              )
              const live = streaming && i === messages.length - 1
              return (
                <article key={i} className="min-w-0" aria-label="AI Tutor answer">
                  <p className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--sb-violet-soft)]" aria-hidden="true"><Sticker name="robot" size="xs" /></span>
                    AI Tutor
                  </p>
                  <div className="break-words text-[15px] leading-[1.65] sm:text-base" data-testid="tutor-message-assistant">
                    {m.content ? <>
                      <MarkdownLite text={m.content} />
                      {live && <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-[var(--sb-ink)] motion-safe:animate-pulse" aria-hidden="true" />}
                    </> : live ? (
                      <span className="flex gap-1 py-2" role="status" aria-label="AI Tutor is thinking">
                        {[0, 150, 300].map(d => <span key={d} className="h-2 w-2 rounded-full bg-[var(--sb-muted)] motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                      </span>
                    ) : <span className="sb-muted">No answer.</span>}
                  </div>
                  {m.sources.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Textbook sources">
                      {m.sources.map(s => (
                        <li key={s.n}>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`tutor-source-${s.n}`}
                            aria-label={`Source ${s.n}: ${s.title}, page ${s.page} (opens in a new tab)`}
                            className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-2.5 py-1 text-xs font-semibold text-[var(--sb-ink-soft)] hover:border-black/25 hover:text-[var(--sb-ink)]">
                            <BookOpen size={13} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">[{s.n}] {s.title}</span><span className="shrink-0">· p.{s.page}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!live && m.content && (
                    <button type="button" onClick={() => void copy(i, m.content)} data-testid={`tutor-copy-${i}`}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-[var(--sb-muted)] hover:bg-black/5 hover:text-[var(--sb-ink)]"
                      aria-label={copied === i ? 'Copied' : 'Copy answer'}>
                      {copied === i ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                      {copied === i ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </article>
              )
            })}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[720px] pt-2">
        {error && <p role="alert" className="sb-alert mb-2" data-tone="coral" data-testid="tutor-error">{error}</p>}
        <form onSubmit={onSubmit}
          className="flex items-end gap-2 rounded-[26px] border-2 border-black/15 bg-[var(--sb-paper)] py-1.5 pl-4 pr-1.5 focus-within:border-[var(--sb-ink)]">
          <label htmlFor="tutor-input" className="sr-only">Your question</label>
          <textarea ref={inputRef} id="tutor-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown}
            maxLength={MAX_CHARS} rows={1} placeholder="Ask a doubt from your textbook…" style={bareInput}
            className="min-w-0 flex-1 overflow-y-auto py-2 text-[15px] leading-6" data-testid="tutor-input"
            aria-describedby="tutor-input-hint" />
          {streaming ? (
            <button type="button" onClick={stop} aria-label="Stop answer" data-testid="tutor-stop"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--sb-ink)] text-white">
              <Square size={14} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Send question" data-testid="tutor-send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--sb-ink)] text-white disabled:bg-black/15 disabled:text-white">
              <ArrowUp size={19} strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
        </form>
        <p id="tutor-input-hint" className="sb-muted flex justify-between gap-3 px-2 pt-1.5 text-xs">
          <span>AI Tutor answers from your textbooks. Your parents can see these chats.</span>
          {input.length > COUNTER_FROM && <span className="shrink-0" data-testid="tutor-input-count">{input.length}/{MAX_CHARS}</span>}
        </p>
      </div>

      {historyOpen && (
        <div className="absolute inset-0 z-20 flex justify-end" data-testid="tutor-history">
          <button type="button" className="absolute inset-0 bg-black/20" onClick={closeHistory} aria-label="Close past chats" tabIndex={-1} data-testid="tutor-history-backdrop" />
          <section role="dialog" aria-modal="true" aria-labelledby="tutor-history-title"
            className="relative flex h-full w-[min(340px,88%)] flex-col rounded-l-[18px] border-l-2 border-black/10 bg-[var(--sb-paper)] p-3 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-2">
              <h3 id="tutor-history-title" className="px-1 text-sm font-extrabold">Past chats</h3>
              <button ref={closeHistoryRef} type="button" onClick={closeHistory} className={iconButton} aria-label="Close past chats" data-testid="tutor-history-close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {pastChats === null ? <p className="sb-muted px-1 text-sm">Loading…</p>
                : pastChats.length === 0 ? <p className="sb-muted px-1 text-sm">No chats yet.</p>
                : (
                  <ul className="space-y-1">
                    {pastChats.map(c => (
                      <li key={c.id}>
                        <button type="button" onClick={() => void openChat(c.id)} aria-current={c.id === sessionId ? 'true' : undefined}
                          className="w-full rounded-[12px] px-2.5 py-2 text-left text-sm hover:bg-black/5 aria-[current=true]:bg-[var(--sb-violet-soft)]" data-testid="tutor-history-item">
                          <span className="block truncate font-semibold">{c.preview || 'Untitled chat'}</span>
                          <span className="sb-muted block text-xs font-semibold">{c.subject ?? 'All subjects'} · {new Date(c.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
