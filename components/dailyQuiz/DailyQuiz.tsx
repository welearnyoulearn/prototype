'use client'

// The Daily Quiz screen (#433), shared by the student portal and the parent portal (a parent opens it for one
// child and can hand the phone over). Home → take the quiz one question at a time → "Quiz completed" →
// after the close, review every answer with its explanation.
//
// The server never sends correct answers before they are due, so this screen can't leak them either.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Flag, Loader2, PartyPopper, RotateCcw, XCircle } from 'lucide-react'

export type QuizExperience = 'student' | 'parent'

type AttemptSummary = { id: number; status: 'in_progress' | 'submitted'; isLate: boolean; answered: number; total: number; correct: number | null; answersVisible: boolean }
type QuizCard = { quizId: number; date: string; opensAt: string; closesAt: string; phase: 'upcoming' | 'open' | 'closed'; subjects: string[]; attempt: AttemptSummary | null; canStartLate: boolean }
export type TodayView = {
  studentName: string; today: string
  status: 'no_class' | 'grade_off' | 'out_of_season' | 'holiday' | 'quiz_day' | 'no_questions' | 'upcoming' | 'ready'
  opensAt: string | null; closesAt: string | null; seasonStart?: string; seasonEnd?: string; holiday?: string
  quiz: QuizCard | null; late: QuizCard[]; recent: QuizCard[]
}
export type AttemptQuestion = {
  itemId: number; position: number; subject: string; topic: string | null; stem: string; options: string[]; language: string
  chosenIndex: number | null; correctIndex?: number; explanation?: string | null; isCorrect?: boolean | null; questionId?: number
}
export type AttemptView = {
  attemptId: number; quizId: number; date: string; status: 'in_progress' | 'submitted'; isLate: boolean
  closesAt: string; answersVisible: boolean; correct: number | null; total: number; questions: AttemptQuestion[]
}

type Props = {
  experience: QuizExperience
  /** '' for a student, '?student_id=N' for a parent. */
  query: string
  /** Extra actions under a reviewed question (Ask WLYL AI / Ask Teacher, #435). */
  renderReviewActions?: (q: AttemptQuestion, attempt: AttemptView) => ReactNode
  /** Shown under the home screen (points, leaderboard, #434). */
  footer?: ReactNode
  /** Called when an attempt is finished, so the parent can refresh points etc. */
  onFinished?: () => void
}

const LETTERS = ['A', 'B', 'C', 'D']

export function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
}
export function istDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
function seasonLabel(md?: string): string {
  if (!md) return ''
  return new Date(`2000-${md}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Something went wrong. Please try again.')
  return data as T
}

// Full literal paths, so the product-docs evidence check can see every route these screens call.
const QUIZ_API = {
  student: { today: '/api/student/quiz/today', attempts: '/api/student/quiz/attempts' },
  parent: { today: '/api/parent/quiz/today', attempts: '/api/parent/quiz/attempts' },
} as const

/** '/today' or '/attempts...' for the student's or the parent's API, with the ?student_id= query for a parent. */
function quizUrl(experience: QuizExperience, path: string, query: string) {
  const api = QUIZ_API[experience]
  return withQuery(path === '/today' ? api.today : `${api.attempts}${path.slice('/attempts'.length)}`, query)
}

function withQuery(base: string, query: string) {
  return query ? `${base}${base.includes('?') ? '&' : '?'}${query.replace(/^\?/, '')}` : base
}

type Screen = { kind: 'home' } | { kind: 'play'; attempt: AttemptView } | { kind: 'done'; attempt: AttemptView; answersAt: string | null } | { kind: 'review'; attempt: AttemptView }

export default function DailyQuiz({ experience, query, renderReviewActions, footer, onFinished }: Props) {
  const [today, setToday] = useState<TodayView | null>(null)
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const url = useCallback((path: string) => quizUrl(experience, path, query), [experience, query])

  const loadToday = useCallback(async () => {
    try {
      setToday(await call<TodayView>(url('/today')))
      setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [url])

  useEffect(() => {
    const t = setTimeout(() => { void loadToday() }, 0)
    return () => clearTimeout(t)
  }, [loadToday])
  // Keep the home screen current (the quiz opens, the answers come out) without a reload.
  useEffect(() => {
    if (screen.kind !== 'home') return
    const t = setInterval(() => { if (!document.hidden) void loadToday() }, 60_000)
    return () => clearInterval(t)
  }, [screen.kind, loadToday])

  async function open(card: QuizCard) {
    setBusy(true); setError(null)
    try {
      const attempt = card.attempt
        ? await call<AttemptView>(url(`/attempts/${card.attempt.id}`))
        : await call<AttemptView>(url('/attempts'), { method: 'POST', body: JSON.stringify({ quiz_id: card.quizId }) })
      if (attempt.status === 'in_progress') setScreen({ kind: 'play', attempt })
      else if (attempt.answersVisible) setScreen({ kind: 'review', attempt })
      else setScreen({ kind: 'done', attempt, answersAt: attempt.closesAt })
    } catch (e) { setError((e as Error).message); void loadToday() }
    finally { setBusy(false) }
  }

  function backHome() { setScreen({ kind: 'home' }); void loadToday() }

  if (screen.kind === 'play') {
    return <Player experience={experience} attempt={screen.attempt} url={url}
      onFinished={(attempt, answersAt) => { onFinished?.(); setScreen({ kind: 'done', attempt, answersAt }) }}
      onExit={backHome} />
  }
  if (screen.kind === 'done') {
    return <Completed experience={experience} answersAt={screen.answersAt} isLate={screen.attempt.isLate}
      onReview={async () => { try { setScreen({ kind: 'review', attempt: await call<AttemptView>(url(`/attempts/${screen.attempt.attemptId}`)) }) } catch (e) { setError((e as Error).message) } }}
      onHome={backHome} />
  }
  if (screen.kind === 'review') {
    return <Review experience={experience} attempt={screen.attempt} onHome={backHome} renderActions={renderReviewActions} />
  }

  return (
    <div className="space-y-6" data-testid="daily-quiz-home">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" data-testid="daily-quiz-error">{error}</p>}
      {!today ? (
        <div className="flex items-center gap-2 text-sm text-gray-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the quiz…</div>
      ) : (
        <>
          <TodayPanel experience={experience} today={today} busy={busy} onOpen={open} />
          {today.late.length > 0 && (
            <section aria-labelledby="dq-late" className="space-y-2">
              <h3 id="dq-late" className="text-base font-extrabold">Missed quizzes — still open</h3>
              <p className="text-sm text-gray-600">A missed quiz can be taken for 7 days. It earns half the points for finishing, and the answers show right after.</p>
              {today.late.map(c => (
                <button key={c.quizId} type="button" disabled={busy} onClick={() => open(c)} data-testid={`daily-quiz-late-${c.quizId}`}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-left font-bold hover:bg-amber-100 disabled:opacity-60">
                  <span><span className="block">{istDay(c.date)}</span><span className="block text-xs font-semibold text-gray-600">{c.subjects.length} questions · {c.subjects.join(', ')}</span></span>
                  <span className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-sm">{c.attempt ? 'Continue' : 'Take it now'}</span>
                </button>
              ))}
            </section>
          )}
          {today.recent.length > 0 && (
            <section aria-labelledby="dq-recent" className="space-y-2">
              <h3 id="dq-recent" className="text-base font-extrabold">This week</h3>
              <ul className="divide-y rounded-2xl border bg-white">
                {today.recent.map(c => (
                  <li key={c.quizId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block font-bold">{istDay(c.date)}{c.attempt?.isLate && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">late</span>}</span>
                      <span className="block truncate text-xs text-gray-600">{c.subjects.join(', ')}</span>
                    </span>
                    {c.attempt?.answersVisible ? (
                      <button type="button" disabled={busy} onClick={() => open(c)} className="shrink-0 rounded-full border-2 border-gray-900 px-3 py-1 text-sm font-bold hover:bg-gray-100" data-testid={`daily-quiz-review-${c.quizId}`}>
                        {c.attempt.correct}/{c.attempt.total} · Review
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs font-semibold text-gray-600">Answers at {istTime(c.closesAt)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {footer}
        </>
      )}
    </div>
  )
}

// ── Today ─────────────────────────────────────────────────────────────────────
function TodayPanel({ experience, today, busy, onOpen }: { experience: QuizExperience; today: TodayView; busy: boolean; onOpen: (c: QuizCard) => void }) {
  const who = experience === 'parent' ? today.studentName.split(' ')[0] : 'you'
  const message = (title: string, body: string) => (
    <div className="rounded-3xl border-2 border-gray-900 bg-white p-6" data-testid="daily-quiz-today" data-status={today.status}>
      <h2 className="text-2xl font-extrabold">{title}</h2>
      <p className="mt-2 text-gray-700">{body}</p>
    </div>
  )
  switch (today.status) {
    case 'no_class': return message('No class found', 'This student is not in a class yet, so there is no daily quiz. The school can fix this in Class Management.')
    case 'grade_off': return message('No daily quiz for this grade', 'The daily quiz is not running for this grade.')
    case 'out_of_season': return message('The quiz season is over', `The daily quiz runs from ${seasonLabel(today.seasonStart)} to ${seasonLabel(today.seasonEnd)}. See you then!`)
    case 'holiday': return message('No quiz today', `${today.holiday ?? 'Holiday'} — enjoy the day off.`)
    case 'no_questions': return message('No quiz today', 'There are no questions ready for this class today. Quizzes follow what the teachers cover in class.')
    case 'upcoming': return message('Today’s quiz is coming', `It opens at ${istTime(today.opensAt!)} and stays open until ${istTime(today.closesAt!)}.`)
  }
  const quiz = today.quiz!
  const a = quiz.attempt
  const closes = istTime(quiz.closesAt)
  let title: string, body: string, cta: string | null
  if (!a) {
    if (quiz.phase === 'open') { title = 'Today’s quiz is ready'; body = `${quiz.subjects.length} questions, one from each subject. About 5 minutes. Open until ${closes}.`; cta = 'Start quiz' }
    else if (quiz.canStartLate) { title = 'Today’s quiz has closed'; body = 'You can still take it late, for half the points for finishing. The answers show right after.'; cta = 'Take it late' }
    else { title = 'Today’s quiz has closed'; body = ''; cta = null }
  } else if (a.status === 'in_progress') {
    title = 'Keep going!'; body = `${a.answered} of ${a.total} answered. ${a.isLate ? '' : `Finish before ${closes}.`}`; cta = 'Continue quiz'
  } else if (!a.answersVisible) {
    title = experience === 'parent' ? `${who} finished today’s quiz` : 'Quiz completed ✓'; body = `The right answers and explanations open at ${closes}.`; cta = null
  } else {
    title = `Score: ${a.correct} / ${a.total}`; body = 'See which answers were right, with an explanation for each.'; cta = 'Review answers'
  }
  const done = a?.status === 'submitted'
  return (
    <div className={`rounded-3xl border-2 border-gray-900 p-6 shadow-[4px_4px_0_#111] ${done ? 'bg-emerald-50' : 'bg-yellow-50'}`} data-testid="daily-quiz-today" data-status={today.status}>
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="text-4xl">{done ? (a?.answersVisible ? '🎯' : '✅') : '🧠'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wider text-gray-600">Daily quiz · {istDay(quiz.date)}</p>
          <h2 className="mt-1 text-2xl font-extrabold">{title}</h2>
          {body && <p className="mt-2 text-gray-700">{body}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {quiz.subjects.map(s => <span key={s} className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs font-bold">{s}</span>)}
          </div>
          {cta && (
            <button type="button" disabled={busy} onClick={() => onOpen(quiz)} data-testid="daily-quiz-start"
              className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-gray-900 bg-yellow-300 px-6 text-base font-extrabold shadow-[3px_3px_0_#111] hover:bg-yellow-200 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{cta}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Taking it ─────────────────────────────────────────────────────────────────
function Player({ experience, attempt: initial, url, onFinished, onExit }: {
  experience: QuizExperience; attempt: AttemptView; url: (p: string) => string
  onFinished: (a: AttemptView, answersAt: string | null) => void; onExit: () => void
}) {
  const [attempt, setAttempt] = useState(initial)
  const firstOpen = Math.max(0, initial.questions.findIndex(q => q.chosenIndex === null))
  const [index, setIndex] = useState(firstOpen)
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const q = attempt.questions[index]
  const answered = attempt.questions.filter(x => x.chosenIndex !== null).length
  const allAnswered = answered === attempt.questions.length

  async function choose(option: number) {
    setSaving(option); setError(null)
    try {
      await call(url(`/attempts/${attempt.attemptId}/answers`), { method: 'PUT', body: JSON.stringify({ item_id: q.itemId, chosen_index: option }) })
      setAttempt(a => ({ ...a, questions: a.questions.map(x => x.itemId === q.itemId ? { ...x, chosenIndex: option } : x) }))
      // Move on to the next question automatically, unless this was the last one.
      if (index < attempt.questions.length - 1) setTimeout(() => setIndex(i => Math.min(i + 1, attempt.questions.length - 1)), 250)
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(null) }
  }

  async function finish() {
    setFinishing(true); setError(null)
    try {
      const res = await call<{ answersAt: string | null }>(url(`/attempts/${attempt.attemptId}/submit`), { method: 'POST', body: '{}' })
      onFinished(attempt, res.answersAt)
    } catch (e) { setError((e as Error).message) }
    finally { setFinishing(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5" data-testid="daily-quiz-player">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onExit} className="inline-flex items-center gap-1 text-sm font-bold text-gray-700 hover:underline" data-testid="daily-quiz-exit">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Save and close
        </button>
        <span className="text-sm font-bold text-gray-700">{answered} / {attempt.questions.length} answered{attempt.isLate && ' · late'}</span>
      </div>
      <ol className="flex flex-wrap gap-2" aria-label="Questions">
        {attempt.questions.map((x, i) => (
          <li key={x.itemId}>
            <button type="button" onClick={() => setIndex(i)} aria-current={i === index ? 'step' : undefined} aria-label={`Question ${i + 1}, ${x.subject}${x.chosenIndex !== null ? ', answered' : ''}`}
              data-testid={`daily-quiz-dot-${i + 1}`}
              className={`h-9 min-w-9 rounded-full border-2 px-2 text-sm font-extrabold ${i === index ? 'border-gray-900 bg-gray-900 text-white' : x.chosenIndex !== null ? 'border-emerald-600 bg-emerald-100' : 'border-gray-300 bg-white'}`}>
              {i + 1}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl border-2 border-gray-900 bg-white p-5 sm:p-6">
        <p className="text-xs font-extrabold uppercase tracking-wider text-gray-600">Question {index + 1} · {q.subject}</p>
        <h2 className="mt-2 text-xl font-extrabold leading-snug" lang={q.language === 'telugu' ? 'te' : q.language === 'hindi' ? 'hi' : undefined} data-testid="daily-quiz-stem">{q.stem}</h2>
        <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Choose an answer">
          {q.options.map((opt, i) => {
            const chosen = q.chosenIndex === i
            return (
              <button key={i} type="button" role="radio" aria-checked={chosen} aria-label={`${LETTERS[i]}. ${opt}`} disabled={saving !== null} onClick={() => choose(i)} data-testid={`daily-quiz-option-${i}`}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-semibold transition ${chosen ? 'border-gray-900 bg-yellow-200' : 'border-gray-300 bg-white hover:border-gray-900'}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold ${chosen ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-400'}`}>{LETTERS[i]}</span>
                <span className="min-w-0 flex-1">{opt}</span>
                {saving === i && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={index === 0} onClick={() => setIndex(i => i - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-gray-300 px-4 font-bold disabled:opacity-40" data-testid="daily-quiz-prev">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        {index < attempt.questions.length - 1 ? (
          <button type="button" onClick={() => setIndex(i => i + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-gray-900 px-4 font-bold" data-testid="daily-quiz-next">
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" disabled={!allAnswered || finishing} onClick={finish} data-testid="daily-quiz-finish"
            className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-gray-900 bg-emerald-400 px-6 text-base font-extrabold shadow-[3px_3px_0_#111] disabled:bg-gray-200 disabled:shadow-none">
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />} Finish quiz
          </button>
        )}
      </div>
      {!allAnswered && index === attempt.questions.length - 1 && (
        <p className="text-right text-sm text-gray-600">Answer every question to finish ({attempt.questions.length - answered} left).</p>
      )}
      {experience === 'parent' && <p className="text-center text-xs text-gray-500">Hand the phone to your child — answers are saved as they go.</p>}
    </div>
  )
}

// ── Finished ──────────────────────────────────────────────────────────────────
function Completed({ experience, answersAt, isLate, onReview, onHome }: { experience: QuizExperience; answersAt: string | null; isLate: boolean; onReview: () => void; onHome: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-3xl border-2 border-gray-900 bg-emerald-50 p-8 text-center shadow-[4px_4px_0_#111]" data-testid="daily-quiz-completed">
      <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" aria-hidden="true" />
      <h2 className="mt-4 text-3xl font-extrabold">Your quiz is completed!</h2>
      <p className="mt-2 text-gray-700">
        {isLate || !answersAt
          ? 'Well done for catching up. The answers and explanations are ready now.'
          : `Great work${experience === 'parent' ? '' : ', see you tomorrow'}! The right answers and explanations open at ${istTime(answersAt)}.`}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {(isLate || !answersAt) && (
          <button type="button" onClick={onReview} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-gray-900 bg-yellow-300 px-5 font-extrabold" data-testid="daily-quiz-see-answers">
            <PartyPopper className="h-4 w-4" aria-hidden="true" /> See answers
          </button>
        )}
        <button type="button" onClick={onHome} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-gray-900 bg-white px-5 font-bold" data-testid="daily-quiz-home-btn">Done</button>
      </div>
    </div>
  )
}

// ── Review ────────────────────────────────────────────────────────────────────
function Review({ experience, attempt, onHome, renderActions }: { experience: QuizExperience; attempt: AttemptView; onHome: () => void; renderActions?: (q: AttemptQuestion, a: AttemptView) => ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5" data-testid="daily-quiz-review">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onHome} className="inline-flex items-center gap-1 text-sm font-bold text-gray-700 hover:underline" data-testid="daily-quiz-review-back">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        <span className="rounded-full border-2 border-gray-900 bg-yellow-200 px-4 py-1 font-extrabold" data-testid="daily-quiz-score">{attempt.correct} / {attempt.total} correct</span>
      </div>
      <p className="text-sm text-gray-600">{istDay(attempt.date)}{attempt.isLate && ' · taken late'}. Read the explanation for anything you got wrong.</p>
      {attempt.questions.map((q, i) => (
        <article key={q.itemId} className={`rounded-3xl border-2 bg-white p-5 ${q.isCorrect ? 'border-emerald-500' : 'border-red-400'}`} data-testid={`daily-quiz-review-q-${i + 1}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-gray-600">{i + 1}. {q.subject}{q.topic ? ` · ${q.topic}` : ''}</p>
            {q.isCorrect
              ? <span className="inline-flex items-center gap-1 text-sm font-extrabold text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Correct</span>
              : <span className="inline-flex items-center gap-1 text-sm font-extrabold text-red-700"><XCircle className="h-4 w-4" aria-hidden="true" /> {q.chosenIndex === null ? 'Not answered' : 'Not quite'}</span>}
          </div>
          <h3 className="mt-2 text-lg font-extrabold">{q.stem}</h3>
          <ul className="mt-3 grid gap-2">
            {q.options.map((opt, oi) => {
              const right = oi === q.correctIndex, mine = oi === q.chosenIndex
              return (
                <li key={oi} className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 ${right ? 'border-emerald-500 bg-emerald-50' : mine ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                  <span className="font-extrabold">{LETTERS[oi]}</span><span className="flex-1">{opt}</span>
                  {right && <span className="text-xs font-extrabold text-emerald-700">Right answer</span>}
                  {mine && !right && <span className="text-xs font-extrabold text-red-700">{experience === 'parent' ? 'Chosen' : 'Your answer'}</span>}
                </li>
              )
            })}
          </ul>
          {q.explanation && (
            <div className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-6" data-testid={`daily-quiz-explanation-${i + 1}`}>
              <span className="font-extrabold">Why: </span>{q.explanation}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {renderActions?.(q, attempt)}
            {experience === 'student' && q.questionId && <ReportButton questionId={q.questionId} />}
          </div>
        </article>
      ))}
    </div>
  )
}

const REASONS: { value: string; label: string }[] = [
  { value: 'wrong_answer', label: 'The answer looks wrong' },
  { value: 'unclear', label: 'The question is unclear' },
  { value: 'typo', label: 'Spelling or typing mistake' },
  { value: 'other', label: 'Something else' },
]

function ReportButton({ questionId }: { questionId: number }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  if (state === 'sent') return <span className="text-xs font-semibold text-gray-500" data-testid={`daily-quiz-reported-${questionId}`}>Thanks — we’ll check this question.</span>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-800" data-testid={`daily-quiz-report-${questionId}`}>
        <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report this question
      </button>
    )
  }
  async function send(reason: string) {
    setState('sending')
    try {
      await call(`/api/student/quiz/questions/${questionId}/report`, { method: 'POST', body: JSON.stringify({ reason }) })
      setState('sent')
    } catch { setState('error') }
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {REASONS.map(r => (
        <button key={r.value} type="button" disabled={state === 'sending'} onClick={() => send(r.value)} className="rounded-full border px-2.5 py-1 text-xs font-bold hover:bg-gray-100" data-testid={`daily-quiz-report-reason-${r.value}`}>{r.label}</button>
      ))}
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:underline"><RotateCcw className="inline h-3 w-3" aria-hidden="true" /> Cancel</button>
      {state === 'error' && <span className="text-xs text-red-600">Couldn’t send. Try again.</span>}
    </span>
  )
}

// ── Compact card for the dashboards ──────────────────────────────────────────
/** A prominent card for the portal home: what to do about today's quiz, one tap to open it. */
export function DailyQuizHomeCard({ query, onOpen, experience }: { query: string; onOpen: () => void; experience: QuizExperience }) {
  const [today, setToday] = useState<TodayView | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = () => call<TodayView>(quizUrl(experience, '/today', query)).then(v => { if (!cancelled) setToday(v) }).catch(() => {})
    void load()
    const t = setInterval(() => { if (!document.hidden) void load() }, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [experience, query])
  if (!today || !['ready', 'upcoming'].includes(today.status) && today.late.length === 0) return null

  const name = experience === 'parent' ? today.studentName.split(' ')[0] : null
  const a = today.quiz?.attempt
  let line: string, cta: string, tone: string
  if (today.status === 'upcoming') { line = `Today’s quiz opens at ${istTime(today.opensAt!)}`; cta = 'See quiz'; tone = 'bg-white' }
  else if (today.quiz && !a && today.quiz.phase === 'open') { line = `${name ? `${name}'s` : 'Today’s'} quiz is ready · ${today.quiz.subjects.length} questions · until ${istTime(today.quiz.closesAt)}`; cta = name ? 'Open quiz' : 'Start quiz'; tone = 'bg-yellow-200' }
  else if (a?.status === 'in_progress') { line = `${a.answered} of ${a.total} answered — finish before ${istTime(today.quiz!.closesAt)}`; cta = 'Continue'; tone = 'bg-yellow-200' }
  else if (a?.status === 'submitted' && !a.answersVisible) { line = `${name ? `${name} has` : 'You have'} finished today’s quiz ✓ · answers at ${istTime(today.quiz!.closesAt)}`; cta = 'Open'; tone = 'bg-emerald-100' }
  else if (a?.answersVisible) { line = `Today’s score: ${a.correct}/${a.total} · review the answers`; cta = 'Review'; tone = 'bg-emerald-100' }
  else if (today.late.length) { line = `${today.late.length} missed quiz${today.late.length > 1 ? 'zes' : ''} still open to catch up`; cta = 'Catch up'; tone = 'bg-amber-100' }
  else return null

  return (
    <button type="button" onClick={onOpen} data-testid="daily-quiz-home-card"
      className={`flex w-full items-center gap-4 rounded-3xl border-2 border-gray-900 ${tone} p-5 text-left shadow-[4px_4px_0_#111] transition hover:-translate-y-0.5`}>
      <span aria-hidden="true" className="text-4xl">🧠</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-extrabold uppercase tracking-wider text-gray-700">Daily quiz</span>
        <span className="mt-0.5 block text-lg font-extrabold leading-snug">{line}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-gray-900 bg-white px-4 py-2 font-extrabold">
        {today.status === 'upcoming' && <Clock className="h-4 w-4" aria-hidden="true" />}{cta}
      </span>
    </button>
  )
}
