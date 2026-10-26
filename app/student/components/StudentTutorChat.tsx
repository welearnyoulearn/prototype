'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { BookOpen, Plus, Send, Square } from 'lucide-react'
import { Sticker } from './stickers'
import { citedSources, isTableSeparator, tableCells } from '@/lib/tutor-text'

type Source = { n: number; title: string; page: number; url: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; sources: Source[] }
type PastChat = { id: number; subject: string | null; updated_at: string; preview: string | null }
type StoredMessage = { role: 'user' | 'assistant'; content: string; sources?: { title: string; page: number; fileUrl: string }[] }
type StreamLine =
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
    blocks.push(list.ordered ? <ol key={blocks.length} className="list-decimal pl-5">{items}</ol> : <ul key={blocks.length} className="list-disc pl-5">{items}</ul>)
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
            <thead><tr>{header.map((c, j) => <th key={j} className="border px-2 py-1 font-extrabold">{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>)
      continue
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/)
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const item = bullet ?? numbered
    if (heading) {
      flushPara(); flushList()
      blocks.push(<h4 key={blocks.length} className="text-sm font-extrabold">{inline(heading[1].replace(/\s*#+\s*$/, ''))}</h4>)
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
  return <div className="space-y-2">{blocks}</div>
}

function toSources(stored: StoredMessage['sources']): Source[] {
  return (stored ?? []).map((s, i) => ({ n: i + 1, title: s.title, page: s.page, url: `${s.fileUrl}#page=${s.page}` }))
}

async function fetchPastChats(): Promise<PastChat[]> {
  const r = await fetch('/api/student/tutor').catch(() => null)
  const data = r?.ok ? await r.json().catch(() => null) as { sessions?: PastChat[] } | null : null
  return data?.sessions ?? []
}

export default function StudentTutorChat() {
  const [subjects, setSubjects] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [pastChats, setPastChats] = useState<PastChat[] | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const loadPastChats = () => fetchPastChats().then(setPastChats)

  useEffect(() => {
    fetch('/api/student/subjects')
      .then(r => r.ok ? r.json() as Promise<{ subjects?: { subject_name: string }[] }> : { subjects: [] })
      .then(d => setSubjects((d.subjects ?? []).map(s => s.subject_name)))
      .catch(() => setSubjects([]))
    fetchPastChats().then(setPastChats)
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [messages])

  function updateLast(fn: (m: ChatMessage) => ChatMessage) {
    setMessages(prev => prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev)
  }

  async function send() {
    const message = input.trim()
    if (!message || streaming || message.length > MAX_CHARS) return
    setError(null)
    setInput('')
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
        else if (line.type === 'done') setSessionId(line.sessionId)
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
  }

  async function openChat(id: number) {
    stop()
    setError(null); setLoadingChat(true)
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

  function onSubmit(e: FormEvent) { e.preventDefault(); void send() }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]" data-testid="tutor-chat">
      <section className="sb-card flex min-h-[520px] flex-col p-4 sm:p-5" aria-label="AI tutor chat">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            Subject
            <select value={subject} onChange={e => setSubject(e.target.value)} disabled={streaming} data-testid="tutor-subject-select" className="min-h-10 px-3">
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button type="button" onClick={newChat} className="sb-btn" data-size="sm" data-tone="yellow" data-testid="tutor-new-chat">
            <Plus size={15} aria-hidden="true" /> New chat
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto" aria-live="polite" aria-busy={streaming || loadingChat}>
          {loadingChat ? <p className="sb-muted text-sm">Opening chat…</p>
            : messages.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Sticker name="light-bulb" size="lg" tilt={-8} />
                <p className="font-bold">Ask a doubt from your textbook</p>
                <p className="sb-muted max-w-sm text-sm">Answers come from your school&apos;s textbooks, with page links so you can read more.</p>
              </div>
            ) : messages.map(m => ({ ...m, sources: citedSources(m.sources, m.content) })).map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="sb-bubble whitespace-pre-wrap text-sm" style={{ background: 'var(--sb-blue-soft)' }} data-testid="tutor-message-user">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-start gap-2">
                <div className="sb-bubble text-sm leading-6" data-testid="tutor-message-assistant">
                  {m.content ? <MarkdownLite text={m.content} /> : <span className="sb-muted">{streaming && i === messages.length - 1 ? 'Thinking…' : 'No answer.'}</span>}
                </div>
                {m.sources.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label="Textbook sources">
                    {m.sources.map(s => (
                      <li key={s.n}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="sb-chip sb-press" data-tone="mint"
                          data-testid={`tutor-source-${s.n}`} aria-label={`Source ${s.n}: ${s.title}, page ${s.page} (opens in a new tab)`}>
                          <BookOpen size={13} aria-hidden="true" />[{s.n}] {s.title} · p.{s.page}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          <div ref={endRef} />
        </div>

        {error && <p role="alert" className="sb-alert mt-3" data-tone="coral" data-testid="tutor-error">{error}</p>}

        <form onSubmit={onSubmit} className="mt-4 space-y-2">
          <label htmlFor="tutor-input" className="sr-only">Your question</label>
          <textarea id="tutor-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown}
            maxLength={MAX_CHARS} rows={3} placeholder="Type your doubt… (Enter to send, Shift+Enter for a new line)"
            className="w-full resize-y p-3 text-sm" data-testid="tutor-input" aria-describedby="tutor-input-count" />
          <div className="flex items-center justify-between gap-3">
            <span id="tutor-input-count" className="sb-muted text-xs">{input.length}/{MAX_CHARS}</span>
            {streaming ? (
              <button type="button" onClick={stop} className="sb-btn" data-size="sm" data-tone="coral" data-testid="tutor-stop">
                <Square size={14} aria-hidden="true" /> Stop
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="sb-btn" data-size="sm" data-tone="yellow" data-testid="tutor-send">
                <Send size={14} aria-hidden="true" /> Send
              </button>
            )}
          </div>
        </form>
        <p className="sb-muted mt-2 text-xs">Your parents can see these chats.</p>
      </section>

      <aside className="sb-card p-4" aria-label="Past chats">
        <h3 className="text-sm font-extrabold">Past chats</h3>
        {pastChats === null ? <p className="sb-muted mt-2 text-sm">Loading…</p>
          : pastChats.length === 0 ? <p className="sb-muted mt-2 text-sm">No chats yet.</p>
          : (
            <ul className="mt-2 space-y-1">
              {pastChats.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => void openChat(c.id)} aria-current={c.id === sessionId ? 'true' : undefined}
                    className="sb-book-link w-full text-left" data-testid="tutor-history-item">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.preview || 'Untitled chat'}</span>
                      <span className="sb-muted block text-xs font-semibold">{c.subject ?? 'All subjects'} · {new Date(c.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </aside>
    </div>
  )
}
