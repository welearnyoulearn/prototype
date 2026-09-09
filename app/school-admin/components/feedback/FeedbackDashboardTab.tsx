'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFeedbackFetch } from './useFeedbackFetch'

interface Stats {
  pulse_score: number
  total_feedback: number
  percent_positive: number
  percent_negative: number
  today_mood_breakdown: { rating: number; count: number; percent: number }[]
  best_categories: { category_key: string; category_label: string; count: number; avg_rating: number }[]
  worst_categories: { category_key: string; category_label: string; count: number; avg_rating: number }[]
  category_share: { category_key: string; category_label: string; count: number; percent: number }[]
  high_priority_open_count: number
}

const MOOD_LABEL: Record<number, string> = { 1: '😭 Terrible', 2: '😞 Bad', 3: '😐 Okay', 4: '😊 Good', 5: '🤩 Amazing' }
const MOOD_COLOR: Record<number, string> = { 1: '#f76a6a', 2: '#f79a4a', 3: '#ffb703', 4: '#7C6EF5', 5: '#37c98a' }

export default function FeedbackDashboardTab({ schoolId }: { schoolId: number }) {
  const { data: stats, loading, error, reload } = useFeedbackFetch<Stats>(
    `/api/feedback/stats?school_id=${schoolId}`, [schoolId], 'Failed to load stats'
  )

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
  if (error || !stats) return (
    <div className="py-16 text-center text-sm text-red-500">
      {error || 'No data'}
      <button type="button" onClick={reload} className="mt-2 block w-full font-semibold underline">Retry</button>
    </div>
  )

  return (
    <div className="space-y-5" data-testid="feedback-dashboard">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-extrabold text-gray-900">{stats.pulse_score}<span className="text-sm text-gray-400">/100</span></div>
          <div className="mt-1 text-xs font-bold text-gray-500">😊 SCHOOL PULSE SCORE</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-extrabold text-gray-900">{stats.total_feedback.toLocaleString()}</div>
          <div className="mt-1 text-xs font-bold text-gray-500">💬 TOTAL FEEDBACK</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-extrabold text-emerald-600">{stats.percent_positive}%</div>
          <div className="mt-1 text-xs font-bold text-gray-500">🤩 POSITIVE</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-extrabold text-rose-600">{stats.percent_negative}%</div>
          <div className="mt-1 text-xs font-bold text-gray-500">😡 NEGATIVE</div>
        </CardContent></Card>
      </div>

      {stats.high_priority_open_count > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" data-testid="feedback-high-priority-alert">
          🚨 {stats.high_priority_open_count} high-priority issue{stats.high_priority_open_count === 1 ? '' : 's'} still open — see the Issue Pipeline tab.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Today&apos;s Mood</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {[5, 4, 3, 2, 1].map(rating => {
              const row = stats.today_mood_breakdown.find(m => m.rating === rating)
              return (
                <div key={rating} className="flex items-center gap-2.5 text-xs">
                  <span className="w-24 shrink-0 text-gray-500">{MOOD_LABEL[rating]}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full" style={{ width: `${row?.percent ?? 0}%`, backgroundColor: MOOD_COLOR[rating] }} />
                  </div>
                  <span className="w-9 shrink-0 text-right font-semibold text-gray-600">{row?.percent ?? 0}%</span>
                </div>
              )
            })}
            {stats.today_mood_breakdown.length === 0 && <p className="text-xs text-gray-400">No feedback submitted yet today.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">What People Are Talking About</CardTitle></CardHeader>
          <CardContent style={{ height: 220 }}>
            {stats.category_share.length === 0 ? (
              <p className="text-xs text-gray-400">No ratings yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.category_share.slice(0, 6)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="category_label" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : String(v))} />
                  <Bar dataKey="percent" fill="#7C6EF5" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">🥇 Best Rated Categories</CardTitle></CardHeader>
          <CardContent>
            <CategoryRatingList rows={stats.best_categories} tone="good" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">⚠️ Worst Rated Categories</CardTitle></CardHeader>
          <CardContent>
            <CategoryRatingList rows={stats.worst_categories} tone="bad" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CategoryRatingList({ rows, tone }: { rows: Stats['best_categories']; tone: 'good' | 'bad' }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400">No ratings yet.</p>
  return (
    <ul className="space-y-2 text-sm">
      {rows.map(r => (
        <li key={r.category_key} className="flex items-center justify-between">
          <span className="text-gray-700">{r.category_label}</span>
          <span className={`font-bold ${tone === 'good' ? 'text-emerald-600' : 'text-rose-600'}`}>{r.avg_rating.toFixed(1)} ⭐ <span className="text-xs font-normal text-gray-400">({r.count})</span></span>
        </li>
      ))}
    </ul>
  )
}
