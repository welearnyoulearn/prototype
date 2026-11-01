'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, ExternalLink } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { NewspaperView } from '@/lib/newspaper/service'
import { StudentAlert, StudentEmptyState, StudentPageIntro, studentReveal } from './StudentExperience'
import { Sticker, type Tone } from './stickers'

type Loaded = Extract<NewspaperView, { items: unknown }>
type Screen = { kind: 'loading' } | { kind: 'error' } | { kind: 'disabled' } | { kind: 'view'; view: NewspaperView }

const CARD_TONES: Tone[] = ['blue', 'mint', 'yellow', 'pink']

async function fetchScreen(): Promise<{ screen: Screen; wait: number }> {
  try {
    const res = await fetch('/api/student/newspaper', { cache: 'no-store' })
    if (res.status === 403) return { screen: { kind: 'disabled' }, wait: 0 }
    if (!res.ok) throw new Error(String(res.status))
    const view = await res.json() as NewspaperView
    return { screen: { kind: 'view', view }, wait: 'secondsUntilCanAcknowledge' in view ? view.secondsUntilCanAcknowledge : 0 }
  } catch {
    return { screen: { kind: 'error' }, wait: 0 }
  }
}

export default function StudentNewspaper() {
  const reduceMotion = useReducedMotion()
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [wait, setWait] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reload = () => setReloadKey(k => k + 1)

  // Load on open and again whenever an action asks for a fresh view (reloadKey).
  useEffect(() => {
    let cancelled = false
    void fetchScreen().then(r => {
      if (cancelled) return
      setScreen(r.screen)
      setWait(r.wait)
    })
    return () => { cancelled = true }
  }, [reloadKey])

  // Count down the reading time shown on the "I've read it" button.
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(w => Math.max(0, w - 1)), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function post(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    setBusy(true); setMessage('')
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) as Record<string, unknown> }
    } catch {
      setMessage('Could not reach the server. Please try again.')
      return { ok: false, status: 0, data: {} }
    } finally {
      setBusy(false)
    }
  }

  async function acknowledge() {
    const r = await post('/api/student/newspaper/ack')
    if (r.ok) { reload(); return }
    if (r.status === 409 && typeof r.data.waitSeconds === 'number') { setWait(r.data.waitSeconds); return }
    if (r.status === 410) { reload(); return }
    if (r.status !== 0) setMessage('Something went wrong. Please try again.')
  }

  async function submit() {
    if (selected === null) return
    const r = await post('/api/student/newspaper/answer', { selected_index: selected })
    if (r.ok || r.status === 409 || r.status === 410) { reload(); return }
    if (r.status !== 0) setMessage('Something went wrong. Please try again.')
  }

  if (screen.kind === 'loading') {
    return (
      <div className="mx-auto max-w-3xl space-y-6" role="status" aria-busy="true" aria-label="Loading today's newspaper">
        <Skeleton className="h-28 rounded-[22px]" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-[22px]" />)}
      </div>
    )
  }
  if (screen.kind === 'error') {
    return <div className="mx-auto max-w-3xl"><StudentAlert onRetry={() => { setScreen({ kind: 'loading' }); reload() }} testId="newspaper-error">We couldn’t load today’s newspaper.</StudentAlert></div>
  }
  if (screen.kind === 'disabled') {
    return <div className="mx-auto max-w-3xl"><StudentEmptyState sticker="scroll" title="The newspaper isn’t switched on yet" description="Your school will turn it on soon." /></div>
  }

  const view = screen.view
  if (view.state === 'unavailable') {
    return <div className="mx-auto max-w-3xl"><StudentEmptyState sticker="scroll" title="The newspaper is for grades 3 to 10" description="It isn’t ready for your class yet. Keep an eye out." /></div>
  }
  if (view.state === 'not_ready') {
    return (
      <div className="mx-auto max-w-3xl" data-testid="newspaper-not-ready">
        <StudentEmptyState sticker="hourglass" tone="yellow" title="Today’s newspaper is on its way" description="A fresh one appears every morning at 6. Come back soon!" />
      </div>
    )
  }

  const v: Loaded = view
  const done = v.state === 'done'
  const canSubmit = selected !== null && !busy

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <StudentPageIntro eyebrow="New every morning" title={v.edition.mode === 'bank' ? 'Today’s Big Idea' : 'Today’s Newspaper'} sticker="scroll" tone="yellow"
        description={done ? 'You’ve finished today’s newspaper. See you tomorrow morning!' : 'Read the short notes, then answer one question to earn up to 5 points.'}
        aside={<span className="sb-chip" data-size="lg" data-tone="mint" data-testid="newspaper-balance"><Sticker name="hundred-points" size="xs" />{v.balance} points</span>} />

      <div className="space-y-6">
        {v.items.map((item, index) => (
          <motion.article key={item.id} custom={index} variants={studentReveal} initial={reduceMotion ? false : 'hidden'} animate="visible"
            className="sb-card p-5 sm:p-6" data-tone={CARD_TONES[index % CARD_TONES.length]} data-testid={`newspaper-item-${item.position}`}>
            <span className="sb-chip" data-tone="paper">{item.category}</span>
            <h2 className="sb-display mt-3 text-2xl">{item.headline}</h2>
            <p className="mt-2 leading-relaxed">{item.note}</p>
            {item.whyItMatters && <p className="mt-3 text-sm"><strong>Why it matters to you: </strong>{item.whyItMatters}</p>}
            {item.tryIt && <p className="mt-2 text-sm"><strong>Try it today: </strong>{item.tryIt}</p>}
            {item.sourceName && (
              <p className="mt-3 text-xs opacity-70">
                {item.sourceUrl
                  ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Source: {item.sourceName}<ExternalLink size={12} aria-hidden="true" /></a>
                  : <>Source: {item.sourceName}</>}
              </p>
            )}
          </motion.article>
        ))}
      </div>

      {v.state === 'reading' && (
        <div className="sticky bottom-3 z-10 flex flex-col items-center gap-2" data-testid="newspaper-ack-bar">
          <button type="button" onClick={acknowledge} disabled={wait > 0 || busy} className="sb-btn" data-tone="yellow" data-testid="newspaper-ack">
            <Check size={16} aria-hidden="true" />{wait > 0 ? `Read the notes… ${wait}s` : 'I’ve read it'}
          </button>
        </div>
      )}

      {v.state === 'question' && v.question && (
        <section className="sb-card p-5 sm:p-6" data-tone="violet" aria-labelledby="newspaper-question" data-testid="newspaper-question">
          <span className="sb-kicker" data-tone="violet">One question</span>
          <h2 id="newspaper-question" className="sb-display mt-3 text-2xl">{v.question.stem}</h2>
          <div className="mt-4 grid gap-3" role="radiogroup" aria-labelledby="newspaper-question">
            {v.question.options.map((option, i) => (
              <button key={i} type="button" role="radio" aria-checked={selected === i} onClick={() => setSelected(i)}
                className="sb-btn w-full justify-start text-left" data-variant={selected === i ? undefined : 'ghost'} data-tone={selected === i ? 'yellow' : undefined}
                data-testid={`newspaper-option-${i}`}>
                {option}
              </button>
            ))}
          </div>
          <button type="button" onClick={submit} disabled={!canSubmit} className="sb-btn mt-5" data-tone="yellow" data-testid="newspaper-submit">Submit my answer</button>
        </section>
      )}

      {v.state === 'done' && v.result && (
        <section className="sb-card p-5 sm:p-6" data-tone={v.result.correct ? 'mint' : 'pink'} data-testid="newspaper-result" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <Sticker name={v.result.correct ? 'star-struck' : 'light-bulb'} size="lg" />
            <h2 className="sb-display text-2xl">{v.result.correct ? 'Correct! Well done!' : 'Good try!'}</h2>
            <span className="sb-chip" data-tone="yellow" data-testid="newspaper-points">+{v.result.pointsAwarded} points</span>
          </div>
          {v.question && !v.result.correct && (
            <p className="mt-3 text-sm">The right answer was: <strong>{v.question.options[v.result.correctIndex]}</strong></p>
          )}
          {v.result.explanation && <p className="mt-2">{v.result.explanation}</p>}
        </section>
      )}

      {message && <StudentAlert testId="newspaper-message">{message}</StudentAlert>}
    </div>
  )
}
