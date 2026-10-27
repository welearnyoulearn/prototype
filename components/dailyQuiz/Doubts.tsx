'use client'

// Student Doubts (#435) on the student and parent Daily Quiz screens.
//   DoubtHelp          under each reviewed question: Ask WLYL AI → still not clear → Ask Teacher
//   StudentDoubtsPanel "My doubts": the teacher's answer, then a fresh question to prove it, then "I understand now"
//   ParentDoubtsPanel  the child's doubts and their timeline, read-only

import { useCallback, useEffect, useState } from 'react'
import { Bot, CheckCircle2, Loader2, MessageCircleQuestion, RotateCcw, Send, Sparkles, XCircle } from 'lucide-react'
import type { AttemptQuestion, AttemptView } from './DailyQuiz'

const LETTERS = ['A', 'B', 'C', 'D']

type DoubtStatus = 'open' | 'explained' | 'clarified'
type Help = { doubts: Record<number, { id: number; status: DoubtStatus }>; ai: Record<number, string> }
export type DoubtView = {
  id: number; status: DoubtStatus; subject: string; topic: string | null; stem: string; options: string[]
  correctIndex: number; chosenIndex: number | null; explanation: string | null; note: string | null
  reply: string | null; repliedBy: string | null; explainedInClass: boolean; createdAt: string; explainedAt: string | null
  proof: { pending: boolean; lastCorrect: boolean | null }; clarifiedAt: string | null; waitingWorkingDays: number | null
  events: { event: string; note: string | null; at: string; by: string }[]
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Something went wrong. Please try again.')
  return data as T
}

// One request per reviewed attempt, shared by every question's DoubtHelp.
const helpCache = new Map<number, Promise<Help>>()
function loadHelp(attemptId: number, refresh = false): Promise<Help> {
  if (refresh || !helpCache.has(attemptId)) {
    helpCache.set(attemptId, call<{ help: Help }>(`/api/student/doubts?attempt_id=${attemptId}`).then(d => d.help).catch(() => ({ doubts: {}, ai: {} })))
  }
  return helpCache.get(attemptId)!
}

export const DOUBT_STATUS_TEXT: Record<DoubtStatus, string> = { open: 'Waiting for your teacher', explained: 'Teacher answered', clarified: 'Clarified ✓' }

/** Under a reviewed question: the path from "still confused" to the AI and then to the teacher. */
export function DoubtHelp({ q, attempt, onDoubtRaised }: { q: AttemptQuestion; attempt: AttemptView; onDoubtRaised?: () => void }) {
  const qid = q.questionId!
  const [help, setHelp] = useState<Help | null>(null)
  const [stage, setStage] = useState<'idle' | 'ask-ai' | 'ask-teacher'>('idle')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // If WLYL AI can't answer (busy, daily limit, not set up), the student can still go straight to the teacher.
  const [aiFailed, setAiFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadHelp(attempt.attemptId).then(h => { if (!cancelled) setHelp(h) })
    return () => { cancelled = true }
  }, [attempt.attemptId])

  if (!help) return null
  const doubt = help.doubts[qid]
  const aiReply = help.ai[qid]

  async function askAI() {
    setBusy(true); setError(null)
    try {
      const r = await call<{ reply: string }>('/api/student/doubts/ai', { method: 'POST', body: JSON.stringify({ attempt_id: attempt.attemptId, item_id: q.itemId, message: message.trim() || undefined }) })
      setHelp(h => h && { ...h, ai: { ...h.ai, [qid]: r.reply } })
      void loadHelp(attempt.attemptId, true)
      setStage('idle')
    } catch (e) { setError((e as Error).message); setAiFailed(true); setStage('idle') }
    finally { setBusy(false) }
  }
  async function askTeacher() {
    setBusy(true); setError(null)
    try {
      const r = await call<{ id: number }>('/api/student/doubts', { method: 'POST', body: JSON.stringify({ attempt_id: attempt.attemptId, item_id: q.itemId, note: note.trim() || undefined }) })
      setHelp(h => h && { ...h, doubts: { ...h.doubts, [qid]: { id: r.id, status: 'open' } } })
      void loadHelp(attempt.attemptId, true)
      setStage('idle')
      onDoubtRaised?.()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="w-full space-y-2" data-testid={`doubt-help-${q.position}`}>
      {aiReply && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6" data-testid={`doubt-ai-reply-${q.position}`}>
          <p className="mb-1 flex items-center gap-1.5 font-extrabold text-violet-800"><Bot className="h-4 w-4" aria-hidden="true" /> WLYL AI</p>
          <p className="whitespace-pre-line">{aiReply}</p>
        </div>
      )}
      {doubt ? (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800" data-testid={`doubt-status-${q.position}`}>
          <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" /> Asked your teacher · {DOUBT_STATUS_TEXT[doubt.status]} — follow it in My doubts on the Daily quiz page
        </p>
      ) : stage === 'ask-ai' ? (
        <div className="space-y-2 rounded-xl border p-3">
          <label className="block text-sm font-bold" htmlFor={`ai-msg-${q.itemId}`}>What is confusing? (optional)</label>
          <input id={`ai-msg-${q.itemId}`} value={message} onChange={e => setMessage(e.target.value)} maxLength={300} placeholder="e.g. Why isn’t it option B?"
            className="w-full rounded-lg border px-3 py-2 text-sm" data-testid={`doubt-ai-message-${q.position}`} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={askAI} className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" data-testid={`doubt-ai-send-${q.position}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} Ask WLYL AI
            </button>
            <button type="button" onClick={() => setStage('idle')} className="rounded-full px-3 py-2 text-sm font-semibold text-gray-600">Cancel</button>
          </div>
        </div>
      ) : stage === 'ask-teacher' ? (
        <div className="space-y-2 rounded-xl border p-3">
          <label className="block text-sm font-bold" htmlFor={`t-note-${q.itemId}`}>Tell your teacher what you don’t understand (optional)</label>
          <textarea id={`t-note-${q.itemId}`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm" data-testid={`doubt-teacher-note-${q.position}`} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={askTeacher} className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" data-testid={`doubt-teacher-send-${q.position}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Send to teacher
            </button>
            <button type="button" onClick={() => setStage('idle')} className="rounded-full px-3 py-2 text-sm font-semibold text-gray-600">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!aiReply && (
            <button type="button" onClick={() => setStage('ask-ai')} className="inline-flex items-center gap-1.5 rounded-full border-2 border-violet-500 px-3 py-1.5 text-sm font-bold text-violet-700 hover:bg-violet-50" data-testid={`doubt-ask-ai-${q.position}`}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {q.isCorrect ? 'Ask WLYL AI' : 'Still confused? Ask WLYL AI'}
            </button>
          )}
          {(aiReply || aiFailed) && (
            <button type="button" onClick={() => { setError(null); setStage('ask-teacher') }} className="inline-flex items-center gap-1.5 rounded-full border-2 border-sky-500 px-3 py-1.5 text-sm font-bold text-sky-700 hover:bg-sky-50" data-testid={`doubt-ask-teacher-${q.position}`}>
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /> Still not clear? Ask your teacher
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
    </div>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function DoubtQuestion({ d }: { d: DoubtView }) {
  return (
    <>
      <p className="text-xs font-extrabold uppercase tracking-wider text-gray-600">{d.subject}{d.topic ? ` · ${d.topic}` : ''}</p>
      <p className="mt-1 font-extrabold">{d.stem}</p>
      <p className="mt-1 text-sm text-gray-700">Right answer: <strong>{LETTERS[d.correctIndex]}. {d.options[d.correctIndex]}</strong>{d.chosenIndex !== null && d.chosenIndex !== d.correctIndex && <> · chosen: {LETTERS[d.chosenIndex]}</>}</p>
      {d.note && <p className="mt-1 text-sm text-gray-700">Asked: “{d.note}”</p>}
    </>
  )
}

/** The student's doubts: teacher answers, the fresh question that proves it, "I understand now". */
export function StudentDoubtsPanel({ refreshKey, onClarified }: { refreshKey?: number; onClarified?: () => void }) {
  const [doubts, setDoubts] = useState<DoubtView[] | null>(null)
  const load = useCallback(() => call<{ doubts: DoubtView[] }>('/api/student/doubts').then(d => setDoubts(d.doubts)).catch(() => setDoubts([])), [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load, refreshKey])
  // A teacher's answer shows up without a reload while the page stays open.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void load() }, 60_000)
    return () => clearInterval(t)
  }, [load])
  if (!doubts || doubts.length === 0) return null
  return (
    <section className="space-y-3" aria-labelledby="my-doubts" data-testid="my-doubts">
      <h3 id="my-doubts" className="text-base font-extrabold">My doubts</h3>
      {doubts.map(d => <StudentDoubtCard key={d.id} d={d} onChange={load} onClarified={onClarified} />)}
    </section>
  )
}

type Proof = { id: number; stem: string; options: string[]; language: string }
function StudentDoubtCard({ d, onChange, onClarified }: { d: DoubtView; onChange: () => void; onClarified?: () => void }) {
  const [proof, setProof] = useState<Proof | null | 'none'>(null)
  const [result, setResult] = useState<{ correct: boolean; correctIndex: number; explanation: string | null; chosen: number } | null>(null)
  const [reopening, setReopening] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<number | null>(null)

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true); setError(null)
    try { return await fn() } catch (e) { setError((e as Error).message); return undefined } finally { setBusy(false) }
  }
  const getProof = () => run(async () => {
    const r = await call<{ question: Proof | null }>(`/api/student/doubts/${d.id}/proof`, { method: 'POST', body: '{}' })
    setResult(null); setProof(r.question ?? 'none')
  })
  const answer = (i: number) => run(async () => {
    const r = await call<{ correct: boolean; correctIndex: number; explanation: string | null }>(`/api/student/doubts/${d.id}/proof/answer`, { method: 'POST', body: JSON.stringify({ chosen_index: i }) })
    setResult({ ...r, chosen: i })
  })
  const confirm = () => run(async () => {
    const r = await call<{ points: number }>(`/api/student/doubts/${d.id}/confirm`, { method: 'POST', body: '{}' })
    setCelebrate(r.points); onChange(); onClarified?.()
  })
  const reopen = () => run(async () => {
    await call(`/api/student/doubts/${d.id}/reopen`, { method: 'POST', body: JSON.stringify({ note: note.trim() || undefined }) })
    setReopening(false); setProof(null); setResult(null); onChange()
  })

  const tone = d.status === 'clarified' ? 'border-emerald-400 bg-emerald-50' : d.status === 'explained' ? 'border-sky-400 bg-white' : 'border-amber-300 bg-amber-50'
  return (
    <article className={`rounded-2xl border-2 p-4 ${tone}`} data-testid={`doubt-${d.id}`} data-status={d.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold" data-testid={`doubt-${d.id}-status`}>{DOUBT_STATUS_TEXT[d.status]}</span>
        <span className="text-xs text-gray-500">Asked {fmt(d.createdAt)}</span>
      </div>
      <div className="mt-2"><DoubtQuestion d={d} /></div>
      {d.status === 'open' && <p className="mt-2 text-sm text-gray-700">Your teacher will answer soon{d.waitingWorkingDays ? ` · waiting ${d.waitingWorkingDays} school day${d.waitingWorkingDays === 1 ? '' : 's'}` : ''}.</p>}
      {d.reply && d.status !== 'open' && (
        <div className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-sm" data-testid={`doubt-${d.id}-reply`}>
          <p className="font-extrabold">{d.explainedInClass ? `${d.repliedBy ?? 'Your teacher'} covered this in class` : `${d.repliedBy ?? 'Your teacher'} says:`}</p>
          {!d.explainedInClass && <p className="mt-1 whitespace-pre-line">{d.reply}</p>}
        </div>
      )}

      {d.status === 'explained' && celebrate === null && (
        <div className="mt-3 space-y-2">
          {!proof && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={getProof} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" data-testid={`doubt-${d.id}-try`}>
                {d.proof.lastCorrect === false ? 'Try another question' : 'Try a fresh question'}
              </button>
              <button type="button" onClick={() => setReopening(true)} className="rounded-full border px-4 py-2 text-sm font-bold" data-testid={`doubt-${d.id}-reopen`}>Still not clear</button>
            </div>
          )}
          {proof === 'none' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">There’s no other question on this topic yet. If the answer makes sense now, mark it understood.</p>
              <button type="button" disabled={busy} onClick={confirm} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white" data-testid={`doubt-${d.id}-confirm`}>I understand now</button>
            </div>
          )}
          {proof && proof !== 'none' && (
            <div className="rounded-xl border bg-white p-3" data-testid={`doubt-${d.id}-proof`}>
              <p className="text-xs font-extrabold uppercase tracking-wider text-gray-600">Show you’ve got it</p>
              <p className="mt-1 font-extrabold">{proof.stem}</p>
              <div className="mt-2 grid gap-2">
                {proof.options.map((o, i) => {
                  const right = result && i === result.correctIndex, mine = result && i === result.chosen
                  return (
                    <button key={i} type="button" disabled={busy || !!result} onClick={() => answer(i)} data-testid={`doubt-${d.id}-proof-option-${i}`}
                      className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm ${right ? 'border-emerald-500 bg-emerald-50' : mine ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-900'}`}>
                      <span className="font-extrabold">{LETTERS[i]}</span> {o}
                    </button>
                  )
                })}
              </div>
              {result && (
                <div className="mt-3 space-y-2">
                  <p className={`flex items-center gap-1.5 text-sm font-extrabold ${result.correct ? 'text-emerald-700' : 'text-red-700'}`}>
                    {result.correct ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                    {result.correct ? 'Correct!' : 'Not quite.'}
                  </p>
                  {result.explanation && <p className="text-sm text-gray-700">{result.explanation}</p>}
                  {result.correct ? (
                    <button type="button" disabled={busy} onClick={confirm} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white" data-testid={`doubt-${d.id}-confirm`}>I understand now</button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={getProof} className="rounded-full border-2 border-emerald-600 px-4 py-2 text-sm font-bold" data-testid={`doubt-${d.id}-try-again`}><RotateCcw className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Try another</button>
                      <button type="button" onClick={() => setReopening(true)} className="rounded-full border px-4 py-2 text-sm font-bold">Still not clear</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {reopening && (
            <div className="space-y-2 rounded-xl border bg-white p-3">
              <label className="block text-sm font-bold" htmlFor={`reopen-${d.id}`}>What is still confusing? (optional)</label>
              <textarea id={`reopen-${d.id}`} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
              <button type="button" disabled={busy} onClick={reopen} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-bold text-white" data-testid={`doubt-${d.id}-reopen-send`}>Send back to teacher</button>
            </div>
          )}
        </div>
      )}
      {celebrate !== null && (
        <p className="mt-3 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-extrabold text-emerald-800" data-testid={`doubt-${d.id}-clarified`}>
          🎉 Doubt clarified!{celebrate > 0 ? ` +${celebrate} points` : ''}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
    </article>
  )
}

const EVENT_TEXT: Record<string, string> = {
  raised: 'Asked the teacher', explained: 'Teacher answered', covered_in_class: 'Covered in class', proof_correct: 'Answered a fresh question correctly',
  proof_wrong: 'Tried a fresh question — not yet', clarified: 'Clarified', reopened: 'Still not clear — asked again',
}

/** The child's doubts and their timeline, read-only. */
export function ParentDoubtsPanel({ studentId, childName }: { studentId: number; childName: string }) {
  const [doubts, setDoubts] = useState<DoubtView[] | null>(null)
  useEffect(() => {
    let cancelled = false
    call<{ doubts: DoubtView[] }>(`/api/parent/doubts?student_id=${studentId}`).then(d => { if (!cancelled) setDoubts(d.doubts) }).catch(() => { if (!cancelled) setDoubts([]) })
    return () => { cancelled = true }
  }, [studentId])
  if (!doubts || doubts.length === 0) return null
  return (
    <section className="space-y-3" aria-labelledby="child-doubts" data-testid="parent-doubts">
      <h3 id="child-doubts" className="text-base font-extrabold">{childName}’s doubts</h3>
      {doubts.map(d => (
        <article key={d.id} className="rounded-2xl border bg-white p-4" data-testid={`parent-doubt-${d.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${d.status === 'clarified' ? 'bg-emerald-100 text-emerald-800' : d.status === 'explained' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
              {d.status === 'open' ? `Waiting for teacher${d.waitingWorkingDays ? ` · ${d.waitingWorkingDays} school day${d.waitingWorkingDays === 1 ? '' : 's'}` : ''}` : DOUBT_STATUS_TEXT[d.status].replace('✓', '').trim()}
            </span>
          </div>
          <div className="mt-2"><DoubtQuestion d={d} /></div>
          <ol className="mt-2 space-y-0.5 text-xs text-gray-600">
            {d.events.map((e, i) => <li key={i}>{fmt(e.at)} — {EVENT_TEXT[e.event] ?? e.event}{e.event === 'explained' && e.by !== 'student' ? ` (${e.by})` : ''}</li>)}
          </ol>
        </article>
      ))}
    </section>
  )
}
