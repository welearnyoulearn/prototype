'use client'

import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { ROLE_VISUAL } from '@/app/feedback/[code]/roleVisuals'
import { useFeedbackFetch } from './useFeedbackFetch'

interface CategoryStat { category_key: string; category_label: string; count: number; avg_rating: number; negative_count: number }
interface Stats {
  period: Period
  pulse_score: number | null
  avg_rating: number | null
  total_feedback: number
  form_submissions: number
  total_ratings: number
  percent_positive: number
  percent_neutral: number
  percent_negative: number
  previous: { total_feedback: number; pulse_score: number | null } | null
  mood_breakdown: { rating: number; count: number; percent: number }[]
  category_stats: CategoryStat[]
  best_categories: CategoryStat[]
  attention_categories: CategoryStat[]
  by_role: { role: string; count: number }[]
  trend: { date: string; count: number; avg_rating: number | null }[]
  high_priority_open_count: number
  open_issues_count: number
}

type Period = 'today' | '7d' | '30d' | 'all'
const PERIODS: { key: Period; label: string; prevLabel: string }[] = [
  { key: 'today', label: 'Today', prevLabel: 'yesterday' },
  { key: '7d', label: '7 days', prevLabel: 'previous 7 days' },
  { key: '30d', label: '30 days', prevLabel: 'previous 30 days' },
  { key: 'all', label: 'All time', prevLabel: '' },
]

// Colours — brand green for single-series marks; the 1–5 mood scale is
// diverging (red ↔ neutral grey ↔ green) and every row also carries its emoji
// + label, so colour is never the only cue.
const BRAND = '#245b46'
const MOOD: Record<number, { emoji: string; label: string; color: string }> = {
  5: { emoji: '🤩', label: 'Amazing', color: '#245b46' },
  4: { emoji: '😊', label: 'Good', color: '#6fae8a' },
  3: { emoji: '😐', label: 'Okay', color: '#c9c7c2' },
  2: { emoji: '😞', label: 'Bad', color: '#ec835a' },
  1: { emoji: '😭', label: 'Terrible', color: '#d03b3b' },
}

function pulseStatus(score: number): { label: string; color: string; emoji: string } {
  if (score >= 70) return { label: 'Great', color: '#0f7a3d', emoji: '😊' }
  if (score >= 50) return { label: 'Okay', color: '#a16207', emoji: '😐' }
  return { label: 'Needs care', color: '#b42318', emoji: '😟' }
}

function ratingTone(avg: number): string {
  if (avg >= 4) return 'text-emerald-700 bg-emerald-50'
  if (avg >= 3) return 'text-amber-700 bg-amber-50'
  return 'text-rose-700 bg-rose-50'
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function Delta({ now, before, suffix = '', prevLabel }: { now: number; before: number | null | undefined; suffix?: string; prevLabel: string }) {
  if (before == null || !prevLabel) return null
  const diff = now - before
  if (diff === 0) return <span className="text-[11px] font-semibold text-gray-400">No change vs {prevLabel}</span>
  const up = diff > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
      <Icon size={12} aria-hidden="true" />{up ? '+' : ''}{diff}{suffix} vs {prevLabel}
    </span>
  )
}

function Card({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border border-gray-200 bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function LinkButton({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick} className="inline-flex items-center gap-1 text-xs font-semibold text-[#245b46] hover:underline">
      {children}<ArrowRight size={12} aria-hidden="true" />
    </button>
  )
}

// Pulse score as a ring gauge (0–100), coloured by its status band
function PulseRing({ score }: { score: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const st = pulseStatus(score)
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`Pulse score ${score} of 100, ${st.label}`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="#eef0ec" strokeWidth="8" />
      <circle cx="38" cy="38" r={r} fill="none" stroke={st.color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle" fontSize="18" fontWeight="800" fill="#111827">{score}</text>
    </svg>
  )
}

export default function FeedbackDashboardTab({
  schoolId, source, onNavigate,
}: {
  schoolId: number
  source: string
  onNavigate: (tab: 'submissions' | 'issues' | 'categories' | 'qr-points') => void
}) {
  const [period, setPeriod] = useState<Period>('30d')
  const { data: stats, loading, error, reload } = useFeedbackFetch<Stats>(
    `/api/feedback/stats?school_id=${schoolId}&source=${source}&period=${period}`, [schoolId, source, period], 'Failed to load stats'
  )
  const prevLabel = PERIODS.find(p => p.key === period)?.prevLabel ?? ''

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1" role="tablist" aria-label="Time period">
        {PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={period === p.key}
            data-testid={`feedback-dashboard-period-${p.key}`}
            onClick={() => setPeriod(p.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${period === p.key ? 'bg-[#245b46] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={reload} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800">
        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh
      </button>
    </div>
  )

  if (loading && !stats) return <div className="space-y-5">{header}<div className="py-16 text-center text-sm text-gray-400">Loading…</div></div>
  if (error || !stats) return (
    <div className="space-y-5">
      {header}
      <div className="py-16 text-center text-sm text-red-500">
        {error || 'No data'}
        <button type="button" onClick={reload} className="mt-2 block w-full font-semibold text-[#245b46] hover:underline">Retry</button>
      </div>
    </div>
  )

  const empty = stats.total_feedback === 0
  const maxCategory = Math.max(1, ...stats.category_stats.map(c => c.count))
  const maxRole = Math.max(1, ...stats.by_role.map(r => r.count))
  const trendTotal = stats.trend.reduce((s, d) => s + d.count, 0)

  return (
    <div className="space-y-5" data-testid="feedback-dashboard">
      {header}

      {stats.high_priority_open_count > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('issues')}
          data-testid="feedback-high-priority-alert"
          className="flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm text-rose-800 transition hover:bg-rose-100"
        >
          <AlertTriangle size={18} className="shrink-0 text-rose-600" aria-hidden="true" />
          <span className="flex-1"><b>{stats.high_priority_open_count} high-priority issue{stats.high_priority_open_count === 1 ? '' : 's'}</b> still open — people rated something 😭 Terrible.</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold">Open Issue Pipeline<ArrowRight size={13} aria-hidden="true" /></span>
        </button>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5" data-testid="feedback-kpi-pulse">
          {stats.pulse_score != null ? <PulseRing score={stats.pulse_score} /> : <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gray-50 text-2xl">🌱</div>}
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">School pulse</div>
            {stats.pulse_score != null ? (
              <>
                <div className="text-lg font-extrabold" style={{ color: pulseStatus(stats.pulse_score).color }}>
                  {pulseStatus(stats.pulse_score).emoji} {pulseStatus(stats.pulse_score).label}
                </div>
                <div className="text-[11px] text-gray-500">avg ⭐ {stats.avg_rating?.toFixed(1)} of 5</div>
                <Delta now={stats.pulse_score} before={stats.previous?.pulse_score} suffix=" pts" prevLabel={prevLabel} />
              </>
            ) : <div className="text-sm text-gray-500">No ratings yet</div>}
          </div>
        </div>

        <button type="button" onClick={() => onNavigate('submissions')} data-testid="feedback-kpi-total" className="group rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-[#9bb7a4] hover:shadow-md">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-400">
            💬 Feedback received <ArrowRight size={13} className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-[#245b46]" aria-hidden="true" />
          </div>
          <div className="mt-1 text-3xl font-extrabold text-gray-900">{stats.total_feedback.toLocaleString()}</div>
          <div className="text-[11px] text-gray-500">{stats.total_ratings} rating{stats.total_ratings === 1 ? '' : 's'} · {stats.form_submissions} form request{stats.form_submissions === 1 ? '' : 's'}</div>
          <Delta now={stats.total_feedback} before={stats.previous?.total_feedback} prevLabel={prevLabel} />
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-5" data-testid="feedback-kpi-sentiment">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Sentiment of ratings</div>
          {stats.total_ratings === 0 ? (
            <div className="mt-3 text-sm text-gray-500">No ratings yet</div>
          ) : (
            <>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${stats.percent_positive}% positive, ${stats.percent_neutral}% neutral, ${stats.percent_negative}% negative`}>
                <div style={{ width: `${stats.percent_positive}%`, background: MOOD[5].color }} />
                <div style={{ width: `${stats.percent_neutral}%`, background: MOOD[3].color }} className="border-x-2 border-white" />
                <div style={{ width: `${stats.percent_negative}%`, background: MOOD[1].color }} />
              </div>
              <div className="mt-3 grid grid-cols-3 text-center">
                <div><div className="text-lg font-extrabold text-gray-900">{stats.percent_positive}%</div><div className="text-[10px] font-semibold text-gray-500">😊 Positive</div></div>
                <div><div className="text-lg font-extrabold text-gray-900">{stats.percent_neutral}%</div><div className="text-[10px] font-semibold text-gray-500">😐 Neutral</div></div>
                <div><div className="text-lg font-extrabold text-gray-900">{stats.percent_negative}%</div><div className="text-[10px] font-semibold text-gray-500">😞 Negative</div></div>
              </div>
            </>
          )}
        </div>

        <button type="button" onClick={() => onNavigate('issues')} data-testid="feedback-kpi-issues" className={`group rounded-2xl border bg-white p-5 text-left transition hover:shadow-md ${stats.open_issues_count > 0 ? 'border-rose-200 hover:border-rose-300' : 'border-gray-200 hover:border-[#9bb7a4]'}`}>
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-400">
            🚨 Open issues <ArrowRight size={13} className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-[#245b46]" aria-hidden="true" />
          </div>
          <div className={`mt-1 text-3xl font-extrabold ${stats.open_issues_count > 0 ? 'text-rose-700' : 'text-gray-900'}`}>{stats.open_issues_count}</div>
          <div className="text-[11px] text-gray-500">
            {stats.open_issues_count === 0 ? '🎉 All clear' : `${stats.high_priority_open_count} high priority · from 😭/😞 ratings`}
          </div>
        </button>
      </div>

      {empty ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-14 text-center">
          <div className="text-5xl">📭</div>
          <p className="mt-3 text-base font-bold text-gray-900">No feedback in this period</p>
          <p className="mt-1 text-sm text-gray-500">Try a longer time range, or share your QR posters to start collecting feedback.</p>
          <div className="mt-4 flex justify-center gap-4">
            {period !== 'all' && <LinkButton onClick={() => setPeriod('all')}>Show all time</LinkButton>}
            <LinkButton onClick={() => onNavigate('qr-points')}>Event &amp; Place QRs</LinkButton>
          </div>
        </div>
      ) : (
        <>
          {/* Trend + audience */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title={`Feedback over the last ${stats.trend.length} days`} className="lg:col-span-2" action={<span className="text-xs text-gray-400">{trendTotal} total</span>}>
              <div style={{ height: 220 }} data-testid="feedback-trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="feedbackTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BRAND} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#eef0ec" />
                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip
                      cursor={{ stroke: '#9bb7a4', strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload as Stats['trend'][number]
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                            <div className="font-bold text-gray-900">{fmtDay(d.date)}</div>
                            <div className="text-gray-600">💬 {d.count} feedback</div>
                            {d.avg_rating != null && <div className="text-gray-600">⭐ {d.avg_rating.toFixed(1)} avg</div>}
                          </div>
                        )
                      }}
                    />
                    <Area type="monotone" dataKey="count" stroke={BRAND} strokeWidth={2} fill="url(#feedbackTrendFill)" dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Who's giving feedback">
              {stats.by_role.length === 0 ? <p className="text-xs text-gray-400">No feedback yet.</p> : (
                <ul className="space-y-3">
                  {stats.by_role.map(r => {
                    const role = FEEDBACK_ROLES.find(x => x.key === r.role)
                    const visual = ROLE_VISUAL[r.role as keyof typeof ROLE_VISUAL]
                    const share = stats.total_feedback ? Math.round((r.count / stats.total_feedback) * 100) : 0
                    return (
                      <li key={r.role}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
                            {visual && <visual.Icon size={13} aria-hidden="true" />}{role?.label ?? r.role}
                          </span>
                          <span className="text-gray-500"><b className="text-gray-900">{r.count}</b> · {share}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full" style={{ width: `${(r.count / maxRole) * 100}%`, background: BRAND }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* Mood + categories */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="How people feel" action={<span className="text-xs text-gray-400">{stats.total_ratings} ratings</span>}>
              {stats.total_ratings === 0 ? <p className="text-xs text-gray-400">Only form requests in this period — no emoji ratings yet.</p> : (
                <ul className="space-y-3" data-testid="feedback-mood-breakdown">
                  {stats.mood_breakdown.map(m => (
                    <li key={m.rating} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 font-semibold text-gray-700">{MOOD[m.rating].emoji} {MOOD[m.rating].label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100" title={`${m.count} rating${m.count === 1 ? '' : 's'}`}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${m.percent}%`, background: MOOD[m.rating].color }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-gray-500"><b className="text-gray-900">{m.percent}%</b> ({m.count})</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="What people are talking about" action={<LinkButton onClick={() => onNavigate('categories')}>Categories</LinkButton>}>
              {stats.category_stats.length === 0 ? <p className="text-xs text-gray-400">No category ratings yet.</p> : (
                <ul className="space-y-3" data-testid="feedback-category-chart">
                  {stats.category_stats.slice(0, 6).map(c => (
                    <li key={c.category_key} className="flex items-center gap-3 text-xs">
                      <span className="w-28 shrink-0 truncate font-semibold text-gray-700" title={c.category_label}>{c.category_label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100" title={`${c.count} rating${c.count === 1 ? '' : 's'}`}>
                        <div className="h-full rounded-full" style={{ width: `${(c.count / maxCategory) * 100}%`, background: BRAND }} />
                      </div>
                      <span className="w-6 shrink-0 text-right font-bold text-gray-900">{c.count}</span>
                      <span className={`w-12 shrink-0 rounded-md px-1.5 py-0.5 text-center font-bold ${ratingTone(c.avg_rating)}`}>⭐{c.avg_rating.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Best vs needs attention — split at 3.5★ so the two never overlap */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="🥇 Doing well">
              {stats.best_categories.length === 0 ? <p className="text-xs text-gray-400">No category is averaging 3.5★ or more yet.</p> : (
                <ul className="divide-y divide-gray-100">
                  {stats.best_categories.map((c, i) => (
                    <li key={c.category_key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 text-center">{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                        <span className="truncate font-medium text-gray-800">{c.category_label}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">
                        <span className={`mr-2 rounded-md px-1.5 py-0.5 font-bold ${ratingTone(c.avg_rating)}`}>⭐ {c.avg_rating.toFixed(1)}</span>{c.count} rating{c.count === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="⚠️ Needs attention" action={stats.open_issues_count > 0 ? <LinkButton onClick={() => onNavigate('issues')} testId="feedback-attention-issues-link">View issues</LinkButton> : undefined}>
              {stats.attention_categories.length === 0 ? <p className="text-xs text-gray-500">🎉 Nothing below 3.5★ — keep it up!</p> : (
                <ul className="divide-y divide-gray-100">
                  {stats.attention_categories.map(c => (
                    <li key={c.category_key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="truncate font-medium text-gray-800">{c.category_label}</span>
                      <span className="shrink-0 text-xs text-gray-500">
                        <span className={`mr-2 rounded-md px-1.5 py-0.5 font-bold ${ratingTone(c.avg_rating)}`}>⭐ {c.avg_rating.toFixed(1)}</span>
                        {c.negative_count > 0 ? <span className="font-semibold text-rose-700">{c.negative_count} unhappy</span> : `${c.count} rating${c.count === 1 ? '' : 's'}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
