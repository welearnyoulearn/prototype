'use client'

// The Teacher Chat screen (#558) for a student (their doubts, ask a new one), a teacher (inbox, longest waiting
// first) and a parent (their child's chats, read only).

import { useCallback, useState } from 'react'
import { MessageCircle, Plus } from 'lucide-react'
import { MAX_OPEN_THREADS, MAX_STUDENT_MESSAGE, STATUS_LABEL } from '@/lib/teacherChat/rules'
import type { StudentSetup, ThreadSummary } from '@/lib/teacherChat/service'
import ChatThread from './ChatThread'
import { ApiError, CHAT_API, call, messageId, usePoll, when } from './api'

const LIST_POLL_MS = 30_000

type Props = { role: 'student' | 'teacher' | 'parent'; studentId?: number; studentName?: string; active: boolean }
type List = { threads: ThreadSummary[]; setup?: StudentSetup }

export default function TeacherChat({ role, studentId, studentName, active }: Props) {
  const [data, setData] = useState<List | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [asking, setAsking] = useState(false)
  const url = `${CHAT_API[role]}${role === 'parent' ? `?student_id=${studentId}` : ''}`

  const load = useCallback(async () => {
    try { setData(await call<List>(url)); setError(null) }
    catch (e) { setError((e as Error).message) }
  }, [url])
  usePoll(load, LIST_POLL_MS, active && openId === null)

  if (openId !== null) {
    return <ChatThread key={openId} role={role} threadId={openId} studentId={studentId} active={active} onBack={() => setOpenId(null)} />
  }

  // A teacher answers whoever has waited longest; everyone else sees the newest first.
  const threads = [...(data?.threads ?? [])]
  if (role === 'teacher') {
    threads.sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open')
      || (a.status === 'open' ? a.lastMessageAt.localeCompare(b.lastMessageAt) : b.lastMessageAt.localeCompare(a.lastMessageAt)))
  }

  return (
    <div className="space-y-4 text-gray-900" data-testid="teacher-chat">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{role === 'student' ? 'Ask your teacher' : role === 'teacher' ? 'Teacher Chat' : `${studentName ?? 'Your child'}’s chats with teachers`}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {role === 'student' ? 'Ask any doubt. Your parents and the school can see these chats.'
              : role === 'teacher' ? 'Doubts from students in your subjects. Parents and the school can see these chats.'
              : 'You can read every message. Use “Report to school” if something worries you.'}
          </p>
        </div>
        {role === 'student' && data?.setup?.available && !asking && (
          <button type="button" onClick={() => setAsking(true)} className="inline-flex items-center gap-1.5 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white" data-testid="chat-ask">
            <Plus className="h-4 w-4" aria-hidden="true" /> Ask a doubt
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700" data-testid="chat-error">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500" role="status">Loading…</p>}
      {role === 'student' && data?.setup && !data.setup.available && (
        <p className="rounded-lg border bg-white px-4 py-3 text-sm" data-testid="chat-unavailable">{data.setup.reason}</p>
      )}
      {asking && data?.setup && (
        <AskForm setup={data.setup} onCancel={() => setAsking(false)} onStarted={id => { setAsking(false); setOpenId(id); void load() }} />
      )}

      {data && threads.length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-gray-500" data-testid="chat-empty">No chats yet.</p>}
      <ul className="space-y-2">
        {threads.map(t => (
          <li key={t.id}>
            <button type="button" onClick={() => setOpenId(t.id)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left hover:border-sky-500" data-testid={`chat-row-${t.id}`}>
              <MessageCircle className="h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{t.title}</span>
                <span className="block truncate text-xs text-gray-600">
                  {t.subject} · {role === 'teacher' ? `${t.student} (${t.className})` : t.teacher ?? 'No teacher yet'} · {STATUS_LABEL[t.status]} · {when(t.lastMessageAt)}
                </span>
              </span>
              {t.unread > 0 && <span className="rounded-full bg-sky-700 px-2 py-0.5 text-xs font-bold text-white" data-testid={`chat-unread-${t.id}`}>{t.unread} new</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AskForm({ setup, onStarted, onCancel }: { setup: StudentSetup; onStarted: (threadId: number) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState(setup.subjects[0]?.name ?? '')
  const [question, setQuestion] = useState('')
  // The same id is sent again if the first try's answer was lost, so one doubt is never asked twice.
  const [retryId, setRetryId] = useState(messageId)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [support, setSupport] = useState<{ text: string; threadId: number } | null>(null)

  async function submit() {
    setBusy(true); setNotice(null)
    try {
      const res = await call<{ threadId: number; support: string | null }>('/api/student/chat', { method: 'POST', body: { subject, body: question.trim(), client_message_id: retryId } })
      if (res.support) setSupport({ text: res.support, threadId: res.threadId })
      else onStarted(res.threadId)
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) { setRetryId(messageId()); setNotice(e.message) }
      else setNotice('No connection. Your question is still here — try again.')
    } finally { setBusy(false) }
  }

  if (support) {
    return (
      <div className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4" role="alert" data-testid="chat-support">
        <p className="text-sm font-semibold text-rose-900">{support.text}</p>
        <button type="button" onClick={() => onStarted(support.threadId)} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white" data-testid="chat-support-continue">Open the chat</button>
      </div>
    )
  }

  const teacher = setup.subjects.find(s => s.name === subject)?.teacher
  return (
    <form className="space-y-3 rounded-xl border bg-white p-4" onSubmit={e => { e.preventDefault(); void submit() }} data-testid="chat-ask-form">
      <label className="block text-sm font-bold">Subject
        <select value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal text-gray-900" data-testid="chat-subject">
          {setup.subjects.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </label>
      {teacher && <p className="text-xs text-gray-600">Goes to {teacher}.</p>}
      <label className="block text-sm font-bold">Your doubt
        <textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={MAX_STUDENT_MESSAGE} rows={4} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal text-gray-900" data-testid="chat-question" />
      </label>
      <p className="text-xs text-gray-600">You can have {MAX_OPEN_THREADS} chats waiting at a time.</p>
      {notice && <p role="alert" className="text-sm font-semibold text-red-700" data-testid="chat-notice">{notice}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !question.trim() || !subject} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" data-testid="chat-ask-send">Send to teacher</button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600">Cancel</button>
      </div>
    </form>
  )
}
