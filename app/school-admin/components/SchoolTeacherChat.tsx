'use client'

// School Admin → Teacher Chat (#558): open chat for classes, act on reports and flagged chats, and read a chat
// when needed. For the school admin and principal; every chat opened here is recorded.

import { useCallback, useState } from 'react'
import ChatThread from '@/components/teacherChat/ChatThread'
import { call, usePoll, when } from '@/components/teacherChat/api'
import { STATUS_LABEL } from '@/lib/teacherChat/rules'
import type { SchoolOverview, ThreadSummary } from '@/lib/teacherChat/service'

export default function SchoolTeacherChat({ active }: { active: boolean }) {
  const [data, setData] = useState<SchoolOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try { setData(await call<SchoolOverview>('/api/school/chat')); setError(null) }
    catch (e) { setError((e as Error).message) }
  }, [])
  usePoll(load, 60_000, active && openId === null)

  async function act(url: string, method: 'POST' | 'PUT', body: object) {
    try { await call(url, { method, body }); await load() }
    catch (e) { setError((e as Error).message) }
  }

  if (openId !== null) return <ChatThread key={openId} role="school" threadId={openId} active={active} onBack={() => setOpenId(null)} />

  const flagged = data?.threads.filter(t => t.needsReview) ?? []
  const rest = data?.threads.filter(t => !t.needsReview) ?? []
  const row = (t: ThreadSummary) => (
    <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <button type="button" onClick={() => setOpenId(t.id)} className="min-w-0 flex-1 text-left" data-testid={`school-chat-row-${t.id}`}>
        <span className="block truncate font-semibold">{t.student} ({t.className}) · {t.subject}</span>
        <span className="block truncate text-xs text-gray-600">{t.teacher ?? 'No teacher'} · {STATUS_LABEL[t.status]} · {when(t.lastMessageAt)}</span>
      </button>
      {t.needsReview && !data?.reports.some(r => r.threadId === t.id) && (
        <button type="button" onClick={() => act(`/api/school/chat/${t.id}/reviewed`, 'POST', {})} className="rounded-lg border px-3 py-1.5 text-xs font-bold" data-testid={`school-chat-reviewed-${t.id}`}>Mark reviewed</button>
      )}
    </li>
  )

  return (
    <div className="space-y-6 text-gray-900" data-testid="school-teacher-chat">
      <div>
        <h1 className="text-xl font-semibold">Teacher Chat</h1>
        <p className="mt-1 text-sm text-gray-600">Students ask teachers doubts; their parents can read along. Opening a chat here is recorded.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500" role="status">Loading…</p>}
      {data && (
        <>
          <section className="rounded-xl border bg-white p-4" aria-labelledby="chat-reports">
            <h2 id="chat-reports" className="font-semibold">Reports ({data.reports.length})</h2>
            {data.reports.length === 0 && <p className="mt-2 text-sm text-gray-500">No open reports.</p>}
            <ul className="mt-2 space-y-3">
              {data.reports.map(r => <Report key={r.id} r={r} onOpen={() => setOpenId(r.threadId)} onResolve={resolution => act(`/api/school/chat/reports/${r.id}/resolve`, 'POST', { resolution })} />)}
            </ul>
          </section>
          <section className="rounded-xl border bg-white p-4" aria-labelledby="chat-flagged">
            <h2 id="chat-flagged" className="font-semibold">Needs review ({flagged.length})</h2>
            {flagged.length === 0 ? <p className="mt-2 text-sm text-gray-500">Nothing flagged.</p> : <ul className="divide-y">{flagged.map(row)}</ul>}
          </section>
          <section className="rounded-xl border bg-white p-4" aria-labelledby="chat-classes">
            <h2 id="chat-classes" className="font-semibold">Classes with chat</h2>
            <p className="text-sm text-gray-600">A student without a linked parent account can’t use chat.</p>
            {data.classes.length === 0 && <p className="mt-2 text-sm text-gray-500">No classes yet.</p>}
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {data.classes.map(c => (
                <li key={c.id}>
                  <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                    <input type="checkbox" checked={c.enabled} onChange={e => act('/api/school/chat/classes', 'PUT', { class_id: c.id, enabled: e.target.checked })} data-testid={`school-chat-class-${c.id}`} />
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs text-gray-600">{c.students} students{c.withoutParent > 0 && <> · <strong className="text-amber-700">{c.withoutParent} without a parent</strong></>}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border bg-white p-4" aria-labelledby="chat-all">
            <h2 id="chat-all" className="font-semibold">Other chats</h2>
            {rest.length === 0 ? <p className="mt-2 text-sm text-gray-500">No chats yet.</p> : <ul className="divide-y">{rest.map(row)}</ul>}
          </section>
        </>
      )}
    </div>
  )
}

function Report({ r, onOpen, onResolve }: { r: SchoolOverview['reports'][number]; onOpen: () => void; onResolve: (resolution: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <li className="rounded-lg border p-3 text-sm" data-testid={`school-chat-report-${r.id}`}>
      <p><strong>{r.student}</strong> · reported by the {r.by} · {when(r.at)}</p>
      <p className="mt-1 text-gray-700">“{r.reason}”</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onOpen} className="rounded-lg border px-3 py-1.5 text-xs font-bold" data-testid={`school-chat-report-open-${r.id}`}>Read the chat</button>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="What did you do?" aria-label="What did you do?" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-1.5 text-xs" data-testid={`school-chat-resolution-${r.id}`} />
        <button type="button" disabled={note.trim().length < 3} onClick={() => onResolve(note.trim())} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" data-testid={`school-chat-resolve-${r.id}`}>Close report</button>
      </div>
    </li>
  )
}
