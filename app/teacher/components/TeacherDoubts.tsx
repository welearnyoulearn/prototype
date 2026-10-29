'use client'

// Teacher → Doubts (#435). Three things, quickest first:
//   1. Class misconceptions: the most-missed questions of your latest quiz per class and subject, with one tap
//      "Covered in class" (answers every open doubt on it in that class)
//   2. Doubts by question: students stuck on the same question are grouped, so one reply answers all of them
//   3. Your WLYL Stars: earned when a student you helped proves they understood

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Star } from 'lucide-react'

const LETTERS = ['A', 'B', 'C', 'D']

type Doubt = { id: number; status: 'open' | 'explained'; student: string; chosenIndex: number | null; note: string | null; aiTried: boolean; raisedAt: string; waitingWorkingDays: number | null; notUnderstoodYet: boolean; reply: string | null }
type Cluster = { key: string; classId: number; className: string; questionId: number; subject: string; topic: string | null; stem: string; options: string[]; correctIndex: number; explanation: string | null; open: number; doubts: Doubt[] }
type Misconception = { classId: number; className: string; subject: string; date: string; questionId: number; stem: string; options: string[]; correctIndex: number; wrong: number; answered: number; openDoubts: number; covered: boolean }
type Data = { clusters: Cluster[]; misconceptions: Misconception[]; stars: { total: number; thisMonth: number } }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? 'Something went wrong')
  return d as T
}

export default function TeacherDoubts() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => call<Data>('/api/teacher/doubts').then(setData).catch(e => setError((e as Error).message)), [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  return (
    <div className="space-y-6" data-testid="teacher-doubts">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Doubts</h1>
          <p className="mt-1 text-sm text-gray-600">Students ask here right after finishing the quiz, when an explanation doesn’t convince them. A doubt is clarified when the student answers a fresh question correctly.</p>
        </div>
        {data && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm" data-testid="teacher-stars">
            <p className="flex items-center gap-1.5 font-semibold text-amber-800"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" /> WLYL Stars</p>
            <p className="text-amber-900"><strong className="text-lg">{data.stars.thisMonth}</strong> this month · {data.stars.total} in all</p>
          </div>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500" role="status">Loading…</p>}
      {data && (
        <>
          <section aria-labelledby="misc-title" className="rounded-xl border bg-white p-4">
            <h2 id="misc-title" className="font-semibold text-gray-900">Class misconceptions</h2>
            <p className="text-sm text-gray-600">The most-missed questions in your subjects from each class’s latest quiz. Explain one in class, then tap “Covered in class”.</p>
            {data.misconceptions.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">Nothing to show yet — this fills in after a quiz closes.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.misconceptions.map(m => <MisconceptionRow key={`${m.classId}-${m.questionId}`} m={m} onDone={load} />)}
              </ul>
            )}
          </section>

          <section aria-labelledby="doubt-title" className="space-y-3">
            <h2 id="doubt-title" className="font-semibold text-gray-900">Doubts from students</h2>
            {data.clusters.length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-gray-500">No doubts waiting. 🎉</p>}
            {data.clusters.map(c => <ClusterCard key={c.key} c={c} onDone={load} />)}
          </section>
        </>
      )}
    </div>
  )
}

function MisconceptionRow({ m, onDone }: { m: Misconception; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function cover() {
    setBusy(true); setError(null)
    try { await call('/api/teacher/doubts/covered', { method: 'POST', body: JSON.stringify({ class_id: m.classId, question_id: m.questionId }) }); onDone() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <li className="rounded-lg border p-3" data-testid={`misconception-${m.classId}-${m.questionId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-gray-500">{m.className} · <span className="capitalize">{m.subject}</span> · {m.date}</p>
          <p className="mt-1 font-medium text-gray-900">{m.stem}</p>
          <p className="mt-1 text-sm text-gray-600">Right answer: {LETTERS[m.correctIndex]}. {m.options[m.correctIndex]}</p>
          <p className="mt-1 text-sm"><strong className="text-red-600">{m.wrong} of {m.answered}</strong> got it wrong{m.openDoubts > 0 && <> · <strong>{m.openDoubts}</strong> open doubt{m.openDoubts === 1 ? '' : 's'}</>}</p>
        </div>
        {m.covered ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Covered</span>
        ) : (
          <button type="button" disabled={busy} onClick={cover} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" data-testid={`misconception-cover-${m.classId}-${m.questionId}`}>
            {busy ? 'Saving…' : 'Covered in class'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  )
}

function ClusterCard({ c, onDone }: { c: Cluster; onDone: () => void }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = c.doubts.filter(d => d.status === 'open')
  async function send() {
    setBusy(true); setError(null)
    try {
      await call('/api/teacher/doubts/explain', { method: 'POST', body: JSON.stringify({ doubt_ids: open.map(d => d.id), reply }) })
      setReply(''); onDone()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <article className="rounded-xl border bg-white p-4" data-testid={`doubt-cluster-${c.classId}-${c.questionId}`}>
      <p className="text-xs font-semibold uppercase text-gray-500">{c.className} · <span className="capitalize">{c.subject}</span>{c.topic ? ` · ${c.topic}` : ''}</p>
      <p className="mt-1 font-medium text-gray-900">{c.stem}</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {c.options.map((o, i) => <li key={i} className={i === c.correctIndex ? 'font-semibold text-green-700' : 'text-gray-700'}>{LETTERS[i]}. {o}{i === c.correctIndex && ' ✓'}</li>)}
      </ul>
      {c.explanation && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"><strong>Explanation shown:</strong> {c.explanation}</p>}
      <ul className="mt-3 divide-y rounded-lg border">
        {c.doubts.map(d => (
          <li key={d.id} className="px-3 py-2 text-sm" data-testid={`teacher-doubt-${d.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{d.student}{d.chosenIndex !== null && <span className="font-normal text-gray-500"> · chose {LETTERS[d.chosenIndex]}</span>}{d.aiTried && <span className="font-normal text-gray-500"> · tried WLYL AI</span>}</span>
              {d.status === 'open'
                ? <span className={`text-xs font-semibold ${d.waitingWorkingDays && d.waitingWorkingDays > 2 ? 'text-red-600' : 'text-amber-700'}`}>Waiting {d.waitingWorkingDays ?? 0} school day{d.waitingWorkingDays === 1 ? '' : 's'}</span>
                : d.notUnderstoodYet
                  ? <span className="text-xs font-semibold text-red-600">Answered — not understood yet</span>
                  : <span className="text-xs font-semibold text-sky-700">Answered — waiting for the student to try</span>}
            </div>
            {d.note && <p className="mt-1 text-gray-700">“{d.note}”</p>}
          </li>
        ))}
      </ul>
      {open.length > 0 && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`reply-${c.key}`} className="block text-sm font-medium text-gray-700">Your answer {open.length > 1 && `(goes to all ${open.length} students)`}</label>
          <textarea id={`reply-${c.key}`} rows={3} maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" data-testid={`doubt-reply-${c.classId}-${c.questionId}`} />
          <button type="button" disabled={busy || reply.trim().length < 2} onClick={send} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid={`doubt-send-${c.classId}-${c.questionId}`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Send answer
          </button>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </article>
  )
}
