'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { GOOD_ATTENDANCE_PCT, LOW_ATTENDANCE_PCT, type AttendanceBand } from '@/lib/attendanceRules'

// Building blocks shared by the school-admin and class-teacher attendance dashboards.

export type Summary = { present: number; late: number; absent: number; marked: number; attended: number; pct: number | null; band: AttendanceBand }
export type TrendPoint = Summary & { key: string }
export type Distribution = { good: number; watch: number; low: number; none: number }
export type RangeKey = 'week' | 'month' | 'year'

export const BAND_TEXT: Record<AttendanceBand, string> = { good: 'text-green-600', watch: 'text-amber-600', low: 'text-red-600', none: 'text-gray-400' }
export const BAND_BG: Record<AttendanceBand, string> = { good: 'bg-green-500', watch: 'bg-amber-400', low: 'bg-red-500', none: 'bg-gray-300' }
export const BAND_PILL: Record<AttendanceBand, string> = {
  good: 'bg-green-100 text-green-700', watch: 'bg-amber-100 text-amber-800', low: 'bg-red-100 text-red-700', none: 'bg-gray-100 text-gray-500',
}
export const BAND_WORD: Record<AttendanceBand, string> = { good: 'Good', watch: 'Needs care', low: 'Low', none: 'No data' }

export const pctText = (pct: number | null) => (pct === null ? '—' : `${pct}%`)

export function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
export function monthName(ym: string, long = false) {
  return new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

// ─── data hook ─────────────────────────────────────────────────────────────────

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const key = url ? `${url}|${attempt}` : ''

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url, { cache: 'no-store' })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error || 'Could not load')
        return body as T
      })
      .then(data => { if (!cancelled) setState({ key, data, error: null }) })
      .catch((e: unknown) => { if (!cancelled) setState({ key, data: null, error: e instanceof Error ? e.message : 'Could not load' }) })
    return () => { cancelled = true }
  }, [url, key])

  const current = state.key === key
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !!url && !current,
    retry: () => setAttempt(a => a + 1),
  }
}

// ─── small pieces ──────────────────────────────────────────────────────────────

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="text-xs font-semibold border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100">Try again</button>}
    </div>
  )
}

export function DashSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" data-testid="att-dash-loading">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}</div>
      <div className="h-64 bg-gray-100 rounded-2xl" />
      <div className="h-48 bg-gray-100 rounded-2xl" />
    </div>
  )
}

export function Kpi({ label, value, sub, band, testid }: { label: string; value: ReactNode; sub?: ReactNode; band?: AttendanceBand; testid: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p data-testid={testid} className={`text-3xl font-black mt-1 ${band ? BAND_TEXT[band] : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export function Card({ title, hint, right, children, testid }: { title: string; hint?: string; right?: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4" data-testid={testid}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function BandPill({ band, pct }: { band: AttendanceBand; pct?: number | null }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${BAND_PILL[band]}`}>
      {pct !== undefined ? pctText(pct) : BAND_WORD[band]}
    </span>
  )
}

/** A thin bar showing a percentage, coloured by the shared bands. */
export function PctBar({ pct, band }: { pct: number | null; band: AttendanceBand }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden" aria-hidden>
      <div className={`h-full rounded-full ${BAND_BG[band]}`} style={{ width: `${pct ?? 0}%` }} />
    </div>
  )
}

/** Good / needs-care / low students as one stacked bar with a legend. */
export function DistributionBar({ d, noun = 'students' }: { d: Distribution; noun?: string }) {
  const total = d.good + d.watch + d.low + d.none
  if (!total) return <p className="text-sm text-gray-400">No {noun} yet.</p>
  const parts: { key: AttendanceBand; n: number; label: string }[] = [
    { key: 'good', n: d.good, label: `${GOOD_ATTENDANCE_PCT}%+` },
    { key: 'watch', n: d.watch, label: `${LOW_ATTENDANCE_PCT}–${GOOD_ATTENDANCE_PCT - 1}%` },
    { key: 'low', n: d.low, label: `below ${LOW_ATTENDANCE_PCT}%` },
    { key: 'none', n: d.none, label: 'too early to tell' },
  ]
  return (
    <div data-testid="att-distribution">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100" role="img"
        aria-label={parts.map(p => `${p.n} ${noun} ${p.label}`).join(', ')}>
        {parts.filter(p => p.n > 0).map(p => <div key={p.key} className={BAND_BG[p.key]} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
        {parts.map(p => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${BAND_BG[p.key]}`} />
            <b className="text-gray-900">{p.n}</b> {p.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Attendance % over time with the 90% / 75% guide lines. */
export function TrendChart({ points, bucket }: { points: TrendPoint[]; bucket: 'day' | 'month' }) {
  const data = points.filter(p => p.pct !== null).map(p => ({
    label: bucket === 'day' ? shortDate(p.key) : monthName(p.key), pct: p.pct as number, marked: p.marked, absent: p.absent,
  }))
  if (data.length === 0) return <p className="text-sm text-gray-400 py-10 text-center">No attendance has been marked in this period yet.</p>
  if (data.length === 1) {
    return <p className="text-sm text-gray-600 py-6 text-center">Only one {bucket === 'day' ? 'day' : 'month'} so far: <b>{data[0].pct}%</b> ({data[0].label}).</p>
  }
  return (
    <div className="h-56 w-full" data-testid="att-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} unit="%" />
          <ReferenceLine y={GOOD_ATTENDANCE_PCT} stroke="#16a34a" strokeDasharray="4 4" />
          <ReferenceLine y={LOW_ATTENDANCE_PCT} stroke="#dc2626" strokeDasharray="4 4" />
          <Tooltip
            formatter={(value: unknown) => [`${String(value)}%`, 'Attendance']}
            labelFormatter={(label: unknown) => String(label)}
            contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Area type="monotone" dataKey="pct" stroke="#2563eb" strokeWidth={2.5} fill="url(#attFill)" dot={{ r: 2.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-gray-400 -mt-1 text-right">
        <span className="text-green-600">- - {GOOD_ATTENDANCE_PCT}% good</span> · <span className="text-red-600">- - {LOW_ATTENDANCE_PCT}% low</span>
      </p>
    </div>
  )
}

/** How often students were absent on each weekday — shows "Mondays are the problem". */
export function WeekdayChart({ rows }: { rows: { weekday: number; pct: number | null; absent: number }[] }) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const data = rows.map(r => ({ day: names[r.weekday], pct: r.pct ?? 0, absent: r.absent }))
  if (data.length < 3) return <p className="text-sm text-gray-400 py-6">A weekday pattern shows up after a few days of attendance.</p>
  const worst = data.reduce((a, b) => (b.pct > a.pct ? b : a))
  return (
    <div data-testid="att-weekday-chart">
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} unit="%" allowDecimals={false} />
            <Tooltip formatter={(v: unknown) => [`${String(v)}% absent`, '']} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
            <Bar dataKey="pct" fill="#f87171" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {worst.pct > 0 && <p className="text-xs text-gray-500 mt-1">Most absences fall on <b className="text-gray-800">{worst.day}</b> ({worst.pct}% of sessions).</p>}
    </div>
  )
}

/** Week / Month (with ‹ ›) / School year — one control for every dashboard. */
export function RangeControl({ range, month, currentMonth, onRange, onMonth }: {
  range: RangeKey; month: string; currentMonth: string
  onRange: (r: RangeKey) => void; onMonth: (m: string) => void
}) {
  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number)
    onMonth(new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7))
  }
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="att-range-control">
      <div className="inline-flex bg-gray-100 rounded-xl p-1" role="tablist" aria-label="Period">
        {([['week', 'Last 7 days'], ['month', 'Month'], ['year', 'School year']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => onRange(k)} data-testid={`att-range-${k}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
        ))}
      </div>
      {range === 'month' && (
        <div className="inline-flex items-center bg-white border border-gray-200 rounded-xl">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" data-testid="att-month-prev" className="w-8 h-8 text-gray-500 hover:bg-gray-100 rounded-l-xl">‹</button>
          <span className="px-2 text-xs font-semibold text-gray-700 min-w-[6.5rem] text-center" data-testid="att-month-label">{monthName(month, true)}</span>
          <button type="button" onClick={() => shift(1)} disabled={month >= currentMonth} aria-label="Next month" data-testid="att-month-next"
            className="w-8 h-8 text-gray-500 hover:bg-gray-100 rounded-r-xl disabled:opacity-30">›</button>
        </div>
      )}
    </div>
  )
}
