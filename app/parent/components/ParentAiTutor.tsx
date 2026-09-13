'use client'

import { useEffect, useState } from 'react'
import { INK, PURPLE, CORAL, GREEN, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { UlearnCard } from '@/app/components/ulearn/primitives'

type Props = {
  studentId: number
  studentName: string
}

type Digest = {
  student: { id: number; name: string; grade: string }
  weekly: { date: string; count: number }[]
  weekTotal: number
  subjectBreakdown: { subject: string; count: number }[]
  recentQuestions: { subject: string; chapter: string | null; question: string; flagged: boolean; created_at: string }[]
  screenTimeMinutes: number
  today: { used: number; limit: number; tier: 'free' | 'paid' }
  schoolHasActivePlan: boolean
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weeklySummaryText(digest: Digest): string {
  if (digest.weekTotal === 0) {
    return `${digest.student.name.split(' ')[0]} hasn't asked the AI Doubt Assistant anything this week.`
  }
  const topSubject = digest.subjectBreakdown[0]?.subject
  const activeDays = digest.weekly.filter(d => d.count > 0).length
  return `${digest.student.name.split(' ')[0]} asked ${digest.weekTotal} question${digest.weekTotal === 1 ? '' : 's'} this week across ${activeDays} day${activeDays === 1 ? '' : 's'}${topSubject ? `, mostly in ${topSubject}` : ''}.`
}

// Small inline SVG bar chart — single series (daily question count), so per
// the dataviz guidance it needs no legend: the card title already says what
// it plots. 4px rounded data-ends, 2px gaps between bars, hover tooltip.
function WeeklyBarChart({ weekly }: { weekly: Digest['weekly'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...weekly.map(d => d.count))
  const chartH = 88
  const barW = 28

  return (
    <div className="flex items-end gap-[10px] h-[120px] px-1" data-testid="ai-tutor-weekly-chart">
      {weekly.map((d, i) => {
        const h = Math.round((d.count / max) * chartH)
        const dayLabel = DAY_LABELS[new Date(d.date + 'T00:00:00').getDay()]
        const isHovered = hover === i
        return (
          <div key={d.date} className="flex flex-col items-center gap-1.5 relative" style={{ width: barW }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {isHovered && (
              <div className="anim-fade-in absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white px-2 py-1 rounded-md whitespace-nowrap z-10" style={{ background: INK }}>
                {d.count} on {dayLabel}
              </div>
            )}
            <div className="w-full rounded-t-[4px] transition-all" style={{
              height: Math.max(h, 3),
              background: d.count > 0 ? PURPLE : BORDER,
              opacity: isHovered ? 1 : d.count > 0 ? 0.85 : 0.5,
            }} />
            <span className="text-[10px] font-medium text-gray-400">{dayLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

type UpgradePlan = { id: number; name: string; queries_per_student_per_day: number; price: number }

// Plan comparison + "checkout" flow (no real payment yet — see TODO in
// /api/parent/ai-upgrade). Fetched lazily, only once the parent opens it.
function UpgradePanel({ studentId, studentName, onUpgraded }: { studentId: number; studentName: string; onUpgraded: () => Promise<void> }) {
  const [plans, setPlans] = useState<UpgradePlan[]>([])
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<number | null>(null)
  const [justUpgraded, setJustUpgraded] = useState<UpgradePlan | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/parent/ai-upgrade-plans?student_id=${studentId}`)
      .then(r => r.json())
      .then(data => { setPlans(data.plans || []); setCurrentPlanId(data.currentSubscription?.plan_id ?? null) })
      .catch(() => setError('Failed to load upgrade plans'))
      .finally(() => setLoading(false))
  }, [studentId])

  async function choose(plan: UpgradePlan) {
    setSubmitting(plan.id)
    setError('')
    try {
      const res = await fetch('/api/parent/ai-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, plan_id: plan.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upgrade')
      setCurrentPlanId(plan.id)
      setJustUpgraded(plan)
      await onUpgraded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade')
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 animate-pulse">{[1, 2, 3].map(i => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}</div>
  }

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: BORDER }}>
      {justUpgraded && (
        <div className="anim-scale-in mb-3 text-center text-sm font-bold rounded-xl py-2.5" style={{ background: `${GREEN}14`, color: GREEN }}>
          🎉 You&apos;re upgraded! {studentName.split(' ')[0]} is now on {justUpgraded.name}.
        </div>
      )}
      {error && <p className="text-xs mb-2" style={{ color: CORAL }}>{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {plans.map(plan => {
          const isCurrent = currentPlanId === plan.id
          return (
            <div key={plan.id} data-testid={`ai-upgrade-plan-${plan.name}`}
              className={`card-lift rounded-xl border-2 p-4 flex flex-col ${isCurrent ? '' : ''}`}
              style={{ borderColor: isCurrent ? PURPLE : BORDER }}>
              <p className="font-bold text-sm" style={{ color: INK }}>{plan.name}</p>
              <p className="text-lg font-extrabold mt-1" style={{ color: INK }}>₹{plan.price}<span className="text-[10px] font-medium text-gray-400">/mo</span></p>
              <p className="text-xs text-gray-500 mt-2 flex-1">{plan.queries_per_student_per_day} questions/day</p>
              <button
                data-testid={`ai-upgrade-choose-${plan.name}`}
                onClick={() => choose(plan)}
                disabled={submitting === plan.id || isCurrent}
                className="mt-3 text-xs font-bold py-2 rounded-lg transition-all active:scale-95 disabled:opacity-60"
                style={isCurrent ? { background: `${PURPLE}14`, color: PURPLE } : { background: PURPLE, color: 'white' }}>
                {isCurrent ? '✓ Current plan' : submitting === plan.id ? 'Upgrading…' : 'Choose plan'}
              </button>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-3">Prices shown are illustrative — no payment is collected yet in this prototype phase.</p>
    </div>
  )
}

export default function ParentAiTutor({ studentId, studentName }: Props) {
  const [digest, setDigest] = useState<Digest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)

  function loadDigest() {
    setError('')
    return fetch(`/api/parent/doubt-digest?student_id=${studentId}`)
      .then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to load') }
        return r.json()
      })
      .then(setDigest)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load AI Tutor activity'))
  }

  useEffect(() => {
    if (!studentId) return
    setLoading(true)
    loadDigest().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl">
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-40 bg-gray-100 rounded-2xl" />
        <div className="h-32 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  if (error || !digest) {
    return (
      <UlearnCard className="max-w-2xl p-6 text-center" borderColor={BORDER}>
        <p className="text-sm text-gray-400">{error || 'Could not load AI Tutor activity.'}</p>
      </UlearnCard>
    )
  }

  const usedPct = digest.today.limit > 0 ? Math.min(100, Math.round((digest.today.used / digest.today.limit) * 100)) : 0

  return (
    <div className="max-w-2xl space-y-4" data-testid="ai-tutor-section">
      {/* Header */}
      <UlearnCard className="p-5 relative overflow-hidden" borderColor={BORDER}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: PURPLE }}>
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: INK }}>AI Doubt Assistant Activity</h2>
            <p className="text-xs text-gray-400">{studentName}&apos;s AI Tutor usage</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">{weeklySummaryText(digest)}</p>
      </UlearnCard>

      {/* Weekly activity chart */}
      <UlearnCard className="p-5" borderColor={BORDER}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Last 7 days</p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${PURPLE}14`, color: PURPLE }}>
            {digest.weekTotal} question{digest.weekTotal === 1 ? '' : 's'}
          </span>
        </div>
        <WeeklyBarChart weekly={digest.weekly} />

        {digest.subjectBreakdown.length > 0 && (
          <div className="mt-5 pt-4 border-t" style={{ borderColor: BORDER }}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">By subject</p>
            <div className="space-y-1.5">
              {digest.subjectBreakdown.map(s => (
                <div key={s.subject} className="flex items-center gap-2 text-xs">
                  <span className="w-24 flex-shrink-0 truncate text-gray-600">{s.subject}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: SURFACE }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.round((s.count / digest.subjectBreakdown[0].count) * 100)}%`,
                      background: PURPLE,
                    }} />
                  </div>
                  <span className="w-5 text-right font-semibold" style={{ color: INK }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </UlearnCard>

      {/* Today's usage vs limit */}
      <UlearnCard className="p-5" borderColor={BORDER}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Today&apos;s usage</p>
          <span className="text-xs font-bold" style={{ color: usedPct >= 80 ? CORAL : INK }}>
            {digest.today.used}/{digest.today.limit} doubts
          </span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: SURFACE }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${usedPct}%`, background: usedPct >= 80 ? CORAL : GREEN }} />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          {digest.today.tier === 'paid' ? 'On a paid plan' : 'On the free plan'} · {digest.screenTimeMinutes > 0 ? `${digest.screenTimeMinutes} min this week` : 'Screen-time tracking coming soon'}
        </p>

        {digest.schoolHasActivePlan && (
          <div className="mt-4">
            <button
              data-testid="ai-tutor-upgrade-btn"
              onClick={() => setShowUpgrade(v => !v)}
              className="card-lift text-xs font-bold px-3.5 py-2 rounded-lg text-white"
              style={{ background: PURPLE }}>
              🚀 {showUpgrade ? 'Hide plans' : `Upgrade ${studentName.split(' ')[0]}'s plan`}
            </button>
            {showUpgrade && (
              <UpgradePanel studentId={studentId} studentName={studentName} onUpgraded={loadDigest} />
            )}
          </div>
        )}
      </UlearnCard>

      {/* Recent questions */}
      {digest.recentQuestions.length > 0 && (
        <UlearnCard className="p-5" borderColor={BORDER}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Recent questions</p>
          <div className="space-y-2.5">
            {digest.recentQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: q.flagged ? CORAL : PURPLE }} />
                <div className="min-w-0 flex-1">
                  <p className="text-gray-700 leading-snug">{q.question}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{q.subject}{q.chapter ? ` · ${q.chapter}` : ''} · {new Date(q.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </UlearnCard>
      )}
    </div>
  )
}
