'use client'

// One chat (#558). Student and teacher write here; a parent reads; the school reviews (hide a message).
//   clock    not saved yet, retried until it is
//   ✓        saved on the server
//   ✓✓ grey  the other person's app has fetched it
//   ✓✓ blue  the other person had the chat on screen

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, CheckCheck, Clock, Flag, Send } from 'lucide-react'
import {
  MAX_STUDENT_MESSAGE, MAX_TEACHER_MESSAGE, STATUS_LABEL, TICK_LABEL, tickFor, type ChatSender, type Tick,
} from '@/lib/teacherChat/rules'
import type { ChatMessage, ThreadView } from '@/lib/teacherChat/service'
import { ApiError, CHAT_API, call, messageId, usePoll, when } from './api'

export type ChatRole = 'student' | 'teacher' | 'parent' | 'school'
type Pending = { id: string; body: string }

const THREAD_POLL_MS = 5000

function TickIcon({ tick }: { tick: Tick | 'pending' }) {
  if (tick === 'pending') return <Clock className="h-3.5 w-3.5" aria-label="Sending" role="img" />
  const Icon = tick === 'sent' ? Check : CheckCheck
  return <Icon className={`h-3.5 w-3.5 ${tick === 'read' ? 'text-sky-500' : ''}`} aria-label={TICK_LABEL[tick]} role="img" />
}

export default function ChatThread({ role, threadId, studentId, active, onBack, onChanged }: {
  role: ChatRole; threadId: number; studentId?: number; active: boolean; onBack: () => void; onChanged?: () => void
}) {
  const [view, setView] = useState<ThreadView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [support, setSupport] = useState<string | null>(null)
  const draftKey = `teacher-chat-draft:${role}:${threadId}`
  const [draft, setDraft] = useState(() => (typeof window === 'undefined' ? '' : window.sessionStorage.getItem(draftKey) ?? ''))
  const [pending, setPending] = useState<Pending[]>([])
  const [reporting, setReporting] = useState<number | 'chat' | null>(null)
  const [saved, setSaved] = useState<{ id: number; body: string }[]>([])
  const bottom = useRef<HTMLDivElement>(null)
  const sending = useRef(false)
  const readUpTo = useRef(0)

  const base = `${CHAT_API[role]}/${threadId}`
  const query = role === 'parent' ? `?student_id=${studentId}` : ''
  const participant = role === 'student' || role === 'teacher'

  useEffect(() => { window.sessionStorage.setItem(draftKey, draft) }, [draft, draftKey])

  const load = useCallback(async () => {
    try {
      const next = await call<ThreadView>(base + query)
      setView(next)
      setError(null)
      if (role !== 'student' && role !== 'teacher') return
      const newest = next.messages.filter(m => m.sender !== role).at(-1)?.id ?? 0
      if (newest > readUpTo.current && document.visibilityState === 'visible') {
        await call(`${base}/read`, { method: 'POST', body: { up_to: newest } })
        readUpTo.current = newest
        onChanged?.()
      }
    } catch (e) { setError((e as Error).message) }
  }, [base, query, role, onChanged])

  usePoll(load, THREAD_POLL_MS, active)

  useEffect(() => {
    if (role !== 'teacher') return
    call<{ savedReplies: { id: number; body: string }[] }>(`${CHAT_API.teacher}/settings`).then(r => setSaved(r.savedReplies)).catch(() => {})
  }, [role])

  // Sends waiting messages one at a time, in order. A network or server failure leaves them queued.
  const flush = useCallback(async () => {
    const next = pending[0]
    if (!next || sending.current) return
    sending.current = true
    try {
      const res = await call<{ support: string | null }>(`${base}/messages`, { method: 'POST', body: { body: next.body, client_message_id: next.id } })
      if (res.support) setSupport(res.support)
      await load()
      setPending(p => p.filter(x => x.id !== next.id))
      onChanged?.()
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        // Refused, so retrying cannot help: give the words back to the writer.
        setPending(p => p.filter(x => x.id !== next.id))
        setDraft(d => d || next.body)
        setNotice(e.message)
      } else setNotice('No connection. Your message will be sent when it returns.')
    } finally { sending.current = false }
  }, [pending, base, load, onChanged])

  useEffect(() => {
    if (!pending.length) return
    const now = window.setTimeout(() => { void flush() }, 0)
    const retry = window.setInterval(() => { void flush() }, THREAD_POLL_MS)
    return () => { window.clearTimeout(now); window.clearInterval(retry) }
  }, [pending, flush])

  const count = (view?.messages.length ?? 0) + pending.length
  useEffect(() => { if (active) bottom.current?.scrollIntoView({ block: 'nearest' }) }, [count, active])

  function send() {
    const body = draft.trim()
    if (!body) return
    setNotice(null)
    setPending(p => [...p, { id: messageId(), body }])
    setDraft('')
  }

  async function act(url: string, body: object, done?: string) {
    setNotice(null)
    try {
      await call(url, { method: 'POST', body })
      if (done) setNotice(done)
      await load()
      onChanged?.()
    } catch (e) { setNotice((e as Error).message) }
  }

  const status = (action: string) => act(`${base}/status`, { action })
  const other: ChatSender = role === 'teacher' ? 'student' : 'teacher'
  const delivered = new Set(view?.messages.map(m => m.clientMessageId))
  const max = role === 'student' ? MAX_STUDENT_MESSAGE : MAX_TEACHER_MESSAGE
  const thread = view?.thread

  // Mine on the right. A parent reads from their child's side; the school sees the student on the right too.
  const mine = (m: { sender: ChatSender }) => m.sender === (role === 'teacher' ? 'teacher' : 'student')

  return (
    <section className="flex min-h-[24rem] flex-col rounded-xl border bg-white text-gray-900" data-testid="chat-thread" aria-label="Chat">
      <header className="flex flex-wrap items-center gap-3 border-b p-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-semibold" data-testid="chat-back">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        {thread && (
          // On a phone the report link drops to its own line so the subject and name stay readable.
          <div className="min-w-[12rem] flex-1">
            <h2 className="break-words text-sm font-bold">
              {thread.subject} · {role === 'student' ? (thread.teacher ?? 'No teacher yet') : role === 'teacher' ? `${thread.student} (${thread.className})` : `${thread.student} with ${thread.teacher ?? 'no teacher'}`}
            </h2>
            <p className="text-xs text-gray-600" data-testid="chat-status">{STATUS_LABEL[thread.status]}</p>
            {view.presence?.online && (
              <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700" data-testid="chat-online">
                <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" /> Online
              </p>
            )}
            {view.presence?.hint && <p className="text-xs text-gray-500" data-testid="chat-hours">{view.presence.hint}</p>}
          </div>
        )}
        {role !== 'school' && thread && (
          <button type="button" onClick={() => setReporting('chat')} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 underline" data-testid="chat-report">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report to school
          </button>
        )}
      </header>

      <p className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="chat-visibility-notice">
        {role === 'parent' ? 'You can read this chat. Only your child and the teacher can write in it.'
          : role === 'school' ? 'Your opening of this chat has been recorded.'
          : 'Parents and the school can see this chat.'}
      </p>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 max-h-[55vh]" role="log" aria-live="polite">
        {!view && !error && <p className="text-sm text-gray-500" role="status">Loading…</p>}
        {view?.messages.map((m: ChatMessage) => (
          <div key={m.id} className={`flex ${mine(m) ? 'justify-end' : 'justify-start'}`} data-testid={`chat-message-${m.id}`} data-sender={m.sender}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine(m) ? 'bg-sky-50' : 'bg-gray-100'}`}>
              <p className="text-xs font-bold text-gray-700">{m.senderName}</p>
              {m.body === null
                ? <p className="italic text-gray-500">Removed by the school</p>
                : <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              {m.hidden && m.body !== null && <p className="text-xs font-semibold text-red-700">Hidden from the student and teacher</p>}
              {m.flag && <p className="text-xs font-semibold text-red-700">Flagged: {m.flag === 'support' ? 'may need support' : m.flag}</p>}
              <p className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-gray-500">
                {when(m.at)}
                {/* A parent and the school see both sides' ticks; a participant sees ticks on their own messages. */}
                {(participant ? m.sender === role : true) && (
                  <span data-testid={`chat-tick-${m.id}`} data-tick={tickFor(m.id, view.cursors[participant ? other : m.sender === 'student' ? 'teacher' : 'student'])}>
                    <TickIcon tick={tickFor(m.id, view.cursors[participant ? other : m.sender === 'student' ? 'teacher' : 'student'])} />
                  </span>
                )}
                {role === 'school' && !m.hidden && (
                  <button type="button" className="font-semibold text-red-700 underline" data-testid={`chat-hide-${m.id}`}
                    onClick={() => act(`/api/school/chat/messages/${m.id}/hide`, {}, 'Message hidden.')}>Hide</button>
                )}
                {(role === 'parent' || (participant && m.sender !== role)) && (
                  <button type="button" className="underline" onClick={() => setReporting(m.id)} data-testid={`chat-report-message-${m.id}`}>Report</button>
                )}
              </p>
            </div>
          </div>
        ))}
        {pending.filter(p => !delivered.has(p.id)).map(p => (
          <div key={p.id} className="flex justify-end" data-testid="chat-pending">
            <div className="max-w-[85%] rounded-2xl bg-sky-50 px-3 py-2 text-sm opacity-70">
              <p className="whitespace-pre-wrap break-words">{p.body}</p>
              <p className="mt-1 flex justify-end text-gray-500"><TickIcon tick="pending" /></p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {support && <p role="alert" className="mx-3 mb-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900" data-testid="chat-support">{support}</p>}
      {(notice || error) && <p role="alert" className="mx-3 mb-2 rounded-lg bg-gray-100 px-3 py-2 text-sm" data-testid="chat-notice">{notice ?? error}</p>}
      {reporting !== null && (
        <ReportForm onCancel={() => setReporting(null)} onSend={async reason => {
          await act(`${base}/report${query}`, { message_id: reporting === 'chat' ? null : reporting, reason }, 'Sent to the school.')
          setReporting(null)
        }} />
      )}

      {participant && view && (
        <footer className="space-y-2 border-t p-3">
          {role === 'student' && thread?.status === 'answered' && view.canSend && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => status('understood')} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white" data-testid="chat-understood">I understand now</button>
              <button type="button" onClick={() => status('still_unclear')} className="rounded-full border px-4 py-2 text-sm font-bold" data-testid="chat-still-unclear">Still not clear</button>
            </div>
          )}
          {role === 'teacher' && thread?.status === 'open' && view.canSend && view.messages.at(-1)?.sender === 'teacher' && (
            <button type="button" onClick={() => status('answered')} className="rounded-full border-2 border-emerald-700 px-4 py-1.5 text-sm font-bold text-emerald-800" data-testid="chat-mark-answered">Mark answered</button>
          )}
          {view.canSend && saved.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Saved replies">
              {saved.map(r => (
                <button key={r.id} type="button" onClick={() => setDraft(d => (d ? `${d} ${r.body}` : r.body).slice(0, max))}
                  className="max-w-full truncate rounded-full border px-3 py-1 text-xs font-semibold" data-testid={`chat-saved-use-${r.id}`}>{r.body}</button>
              ))}
            </div>
          )}
          {view.canSend ? (
            <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); send() }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} maxLength={max} rows={2} aria-label="Message" placeholder="Type a message…"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                className="min-w-0 flex-1 resize-none rounded-lg border bg-white px-3 py-2 text-sm text-gray-900" data-testid="chat-input" />
              <button type="submit" disabled={!draft.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" data-testid="chat-send">
                <Send className="h-4 w-4" aria-hidden="true" /> Send
              </button>
            </form>
          ) : <p className="text-sm text-gray-600" data-testid="chat-closed-reason">{view.closedReason}</p>}
        </footer>
      )}
    </section>
  )
}

function ReportForm({ onSend, onCancel }: { onSend: (reason: string) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="mx-3 mb-3 space-y-2 rounded-lg border p-3" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSend(reason.trim()); setBusy(false) }}>
      <label className="block text-sm font-bold">What is wrong?
        <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal text-gray-900" data-testid="chat-report-reason" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || reason.trim().length < 3} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" data-testid="chat-report-send">Send to school</button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600">Cancel</button>
      </div>
    </form>
  )
}
