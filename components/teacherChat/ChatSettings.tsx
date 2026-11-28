'use client'

// Teacher Chat settings (#559): a teacher's online choice and saved replies; a parent's alert choice.

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { hoursText } from '@/lib/teacherChat/hours'
import type { TeacherSettings } from '@/lib/teacherChat/extras'
import { CHAT_API, call } from './api'

export function TeacherChatSettings() {
  const [data, setData] = useState<TeacherSettings | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => call<TeacherSettings>('/api/teacher/chat/settings').then(setData).catch(e => setError((e as Error).message)), [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  async function run(work: () => Promise<unknown>) {
    setError(null)
    try { await work(); await load() }
    catch (e) { setError((e as Error).message) }
  }

  if (!data) return error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null
  return (
    <details className="rounded-xl border bg-white p-3 text-sm" data-testid="chat-teacher-settings">
      <summary className="cursor-pointer font-bold">Chat hours, online status and saved replies</summary>
      <div className="mt-3 space-y-3">
        <p className="text-gray-600">{hoursText(data.hours)} Outside these hours your phone stays quiet.</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={data.hideOnline} data-testid="chat-hide-online"
            onChange={e => run(() => call('/api/teacher/chat/settings', { method: 'PUT', body: { hide_online: e.target.checked } }))} />
          Don’t show students when I’m online
        </label>
        <ul className="space-y-1">
          {data.savedReplies.map(r => (
            <li key={r.id} className="flex items-start gap-2 rounded-lg border px-3 py-2">
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{r.body}</span>
              <button type="button" aria-label="Remove saved reply" data-testid={`chat-saved-delete-${r.id}`}
                onClick={() => run(() => call(`/api/teacher/chat/saved-replies/${r.id}`, { method: 'DELETE' }))}>
                <Trash2 className="h-4 w-4 text-red-700" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { await call('/api/teacher/chat/saved-replies', { method: 'POST', body: { body: draft.trim() } }); setDraft('') }) }}>
          <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} aria-label="New saved reply" placeholder="Save a reply you often send"
            className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-gray-900" data-testid="chat-saved-input" />
          <button type="submit" disabled={!draft.trim()} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50" data-testid="chat-saved-add">Save</button>
        </form>
        {error && <p role="alert" className="text-red-700">{error}</p>}
      </div>
    </details>
  )
}

export function ParentChatAlerts({ studentId }: { studentId: number }) {
  const url = `${CHAT_API.parent}/alerts?student_id=${studentId}`
  const [instant, setInstant] = useState<boolean | null>(null)
  useEffect(() => { call<{ instant: boolean }>(url).then(r => setInstant(r.instant)).catch(() => setInstant(null)) }, [url])
  if (instant === null) return null
  return (
    <div className="rounded-xl border bg-white p-3 text-sm">
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" checked={instant} data-testid="chat-parent-instant"
          onChange={async e => {
            const next = e.target.checked
            setInstant(next)
            try { await call(url, { method: 'PUT', body: { instant: next } }) }
            catch { setInstant(!next) }
          }} />
        Tell me each time a teacher replies
      </label>
      <p className="mt-1 text-gray-600">You always get one note in the evening on days with new messages.</p>
    </div>
  )
}
