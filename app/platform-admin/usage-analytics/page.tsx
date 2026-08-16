'use client'

import { useEffect, useState, useCallback } from 'react'

type Trend = { day: string; login_count: number; unique_actors: number; total_duration_seconds: number }
type RoleBreakdown = { actor_role: string; login_count: number; unique_actors: number; total_duration_seconds: number }
type SchoolRow = { school_id: number; school_name: string; login_count: number; unique_actors: number; total_duration_seconds: number; last_active_day: string }
type Overview = {
  active_now: number
  totals: { login_count: number; unique_actors: number; total_duration_seconds: number }
  trend: Trend[]
  by_role: RoleBreakdown[]
  by_school: SchoolRow[]
}

type Segment = 'active' | 'cooling' | 'at_risk'
type ActorRow = {
  actor_id: number; actor_role: string; actor_name: string | null
  login_count: number; last_login_at: string; total_duration_seconds: number; segment: Segment
}
type SchoolDetail = {
  school: { id: number; name: string }
  trend: (Trend & { actor_role: string })[]
  by_role: RoleBreakdown[]
  segment_counts: Record<Segment, number>
  actors: ActorRow[]
}

type FeatureAdoptionRow = {
  key: string; label: string; category: string
  entitled_schools: number; active_schools: number; adoption_pct: number; total_opens: number
}

type RiskLevel = 'healthy' | 'watch' | 'at_risk'
type SchoolHealthRow = {
  school_id: number; school_name: string; tier: string
  onboarded_at: string; last_login_at: string | null; days_since_login: number | null
  features_entitled: number; features_used: number; breadth_pct: number
  health_score: number; risk_level: RiskLevel
}

type MonthlyActive = { month: string; active_schools: number; login_count: number }
type CohortRetention = { offset: number; month: string; active: number; pct: number }
type Cohort = { cohort_month: string; cohort_size: number; retention: CohortRetention[] }
type Growth = {
  total_active_schools: number
  tracking_started: string | null
  monthly_active: MonthlyActive[]
  cohorts: Cohort[]
}

type View = 'overview' | 'adoption' | 'health' | 'growth'

const RISK_CHIP: Record<RiskLevel, string> = {
  healthy: 'bg-green-100 text-green-700',
  watch: 'bg-amber-100 text-amber-700',
  at_risk: 'bg-red-100 text-red-700',
}
const RISK_LABEL: Record<RiskLevel, string> = { healthy: 'Healthy', watch: 'Watch', at_risk: 'At Risk' }

const ROLE_LABEL: Record<string, string> = {
  school_admin: 'School Admin', principal: 'Principal', vice_principal: 'Vice Principal',
  teacher: 'Teacher', student: 'Student', parent: 'Parent', platform_admin: 'Platform Admin',
}

const SEGMENT_CHIP: Record<Segment, string> = {
  active: 'bg-green-100 text-green-700',
  cooling: 'bg-amber-100 text-amber-700',
  at_risk: 'bg-red-100 text-red-700',
}
const SEGMENT_LABEL: Record<Segment, string> = { active: 'Active', cooling: 'Cooling', at_risk: 'At Risk' }

function fmt(n: number) { return n.toLocaleString('en-IN') }
function fmtDuration(seconds: number) {
  const hrs = seconds / 3600
  if (hrs >= 1) return `${hrs.toFixed(1)}h`
  return `${Math.round(seconds / 60)}m`
}
function fmtDay(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtMonth(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function Sparkline({ trend, valueKey }: { trend: Trend[]; valueKey: keyof Trend }) {
  if (trend.length === 0) return <div className="h-32 flex items-center justify-center text-gray-300 text-sm">No data yet</div>
  const values = trend.map(t => Number(t[valueKey]))
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-1 h-32">
      {trend.map((t, i) => {
        const v = Number(t[valueKey])
        const pct = Math.max((v / max) * 100, v > 0 ? 4 : 0)
        return (
          <div key={t.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div className="absolute -top-7 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              {fmtDay(t.day)}: {fmt(v)}
            </div>
            <div
              className="w-full bg-indigo-400 group-hover:bg-indigo-500 rounded-t transition-colors"
              style={{ height: `${pct}%` }}
            />
            {(i === 0 || i === trend.length - 1 || i % Math.ceil(trend.length / 6) === 0) && (
              <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">{fmtDay(t.day)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function UsageAnalyticsPage() {
  const [view, setView] = useState<View>('overview')
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [metric, setMetric] = useState<'login_count' | 'unique_actors' | 'total_duration_seconds'>('login_count')

  const [selectedSchool, setSelectedSchool] = useState<{ id: number; name: string } | null>(null)
  const [detail, setDetail] = useState<SchoolDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [segmentFilter, setSegmentFilter] = useState<Segment | null>(null)

  const [adoption, setAdoption] = useState<FeatureAdoptionRow[] | null>(null)
  const [adoptionLoading, setAdoptionLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const [health, setHealth] = useState<{ risk_counts: Record<RiskLevel, number>; schools: SchoolHealthRow[] } | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null)

  const [growth, setGrowth] = useState<Growth | null>(null)
  const [growthLoading, setGrowthLoading] = useState(true)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/platform/usage-analytics?days=${days}`)
      if (res.ok) setOverview(await res.json())
    } finally { setLoading(false) }
  }, [days])

  const loadAdoption = useCallback(async () => {
    setAdoptionLoading(true)
    try {
      const res = await fetch(`/api/platform/usage-analytics/feature-adoption?days=${days}`)
      if (res.ok) setAdoption((await res.json()).features)
    } finally { setAdoptionLoading(false) }
  }, [days])

  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await fetch(`/api/platform/usage-analytics/school-health?days=${days}`)
      if (res.ok) setHealth(await res.json())
    } finally { setHealthLoading(false) }
  }, [days])

  const loadGrowth = useCallback(async () => {
    setGrowthLoading(true)
    try {
      const res = await fetch(`/api/platform/usage-analytics/growth?months=6`)
      if (res.ok) setGrowth(await res.json())
    } finally { setGrowthLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'adoption') loadAdoption()
    if (view === 'health') loadHealth()
    if (view === 'growth') loadGrowth()
  }, [view, loadAdoption, loadHealth, loadGrowth])

  useEffect(() => { loadOverview() }, [loadOverview])

  useEffect(() => {
    if (!selectedSchool) { setDetail(null); return }
    setDetailLoading(true)
    setSegmentFilter(null)
    fetch(`/api/platform/usage-analytics/${selectedSchool.id}?days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDetail(d))
      .finally(() => setDetailLoading(false))
  }, [selectedSchool, days])

  const filteredActors = detail?.actors.filter(a => !segmentFilter || a.segment === segmentFilter) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      {overview && (
        <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center justify-end">
          <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-3 py-1 rounded-full border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {fmt(overview.active_now)} active now
          </span>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Usage Analytics</h1>
            <p className="text-gray-400 text-sm mt-0.5">Logins and time spent across every school, all portals</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${days === d ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {d}d
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                if (view === 'overview') loadOverview()
                else if (view === 'adoption') loadAdoption()
                else if (view === 'health') loadHealth()
                else loadGrowth()
              }}
              disabled={view === 'overview' ? loading : view === 'adoption' ? adoptionLoading : view === 'health' ? healthLoading : growthLoading}
              className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5 text-gray-600">
              <svg className={`w-3.5 h-3.5 ${(view === 'overview' ? loading : view === 'adoption' ? adoptionLoading : view === 'health' ? healthLoading : growthLoading) ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* View switcher */}
        <div className="flex gap-1 border-b border-gray-200">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'adoption', label: 'Feature Adoption' },
            { key: 'health', label: 'School Health' },
            { key: 'growth', label: 'Growth & Retention' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setView(t.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${view === t.key ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {view === 'growth' ? (
          growthLoading ? (
            <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
          ) : !growth ? (
            <div className="py-20 text-center text-gray-400 text-sm">Failed to load growth analytics.</div>
          ) : !growth.tracking_started ? (
            <div className="py-20 text-center text-gray-400 text-sm max-w-md mx-auto">
              Not enough usage history yet — monthly active schools and cohort retention build up once the nightly rollup has run for at least one full day.
            </div>
          ) : (
            <>
              {/* Monthly active schools */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-700">Monthly active schools</p>
                  <p className="text-xs text-gray-400">{fmt(growth.total_active_schools)} schools total</p>
                </div>
                {growth.monthly_active.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-gray-300 text-sm">No data yet</div>
                ) : (
                  <div className="flex items-end gap-2 h-32">
                    {growth.monthly_active.map(m => {
                      const max = Math.max(...growth.monthly_active.map(x => x.active_schools), 1)
                      const pct = Math.max((m.active_schools / max) * 100, m.active_schools > 0 ? 4 : 0)
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                          <div className="absolute -top-7 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                            {fmtMonth(m.month)}: {fmt(m.active_schools)} schools
                          </div>
                          <div className="w-full bg-purple-400 group-hover:bg-purple-500 rounded-t transition-colors" style={{ height: `${pct}%` }} />
                          <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">{fmtMonth(m.month)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Cohort retention */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Cohort retention</p>
                  <p className="text-xs text-gray-400 mt-0.5">Schools grouped by onboarding month — % still active in each month after</p>
                </div>
                {growth.cohorts.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">No cohorts in this window.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Cohort</th>
                          <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Size</th>
                          {Array.from({ length: Math.max(...growth.cohorts.map(c => c.retention.length), 1) }, (_, i) => (
                            <th key={i} className="text-right px-3 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">M{i}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {growth.cohorts.map(c => (
                          <tr key={c.cohort_month} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-medium text-gray-800">{fmtMonth(c.cohort_month)}</td>
                            <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{fmt(c.cohort_size)}</td>
                            {c.retention.map(r => (
                              <td key={r.offset} className="px-3 py-3 text-right">
                                <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                                  r.pct >= 60 ? 'bg-green-100 text-green-700' : r.pct >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-red-50 text-red-600'
                                }`}>
                                  {r.pct}%
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )
        ) : view === 'health' ? (
          healthLoading ? (
            <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
          ) : !health ? (
            <div className="py-20 text-center text-gray-400 text-sm">Failed to load school health.</div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Health score = 60% login recency + 40% feature breadth. For renewal conversations — schools sorted lowest score first.
              </p>

              <div className="grid grid-cols-3 gap-3">
                {(['at_risk', 'watch', 'healthy'] as RiskLevel[]).map(level => (
                  <button key={level}
                    onClick={() => setRiskFilter(f => f === level ? null : level)}
                    className={`bg-white rounded-xl border px-4 py-3 text-left transition-all ${riskFilter === level ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${RISK_CHIP[level]}`}>{RISK_LABEL[level]}</span>
                    <p className="text-xl font-bold text-gray-900">{fmt(health.risk_counts[level] || 0)}</p>
                    <p className="text-xs text-gray-400">
                      {level === 'healthy' ? 'score ≥ 60' : level === 'watch' ? 'score 30-59' : 'score < 30'}
                    </p>
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">
                    Schools {riskFilter ? `— ${RISK_LABEL[riskFilter]}` : ''}
                  </p>
                  {riskFilter && (
                    <button onClick={() => setRiskFilter(null)} className="text-xs text-gray-400 hover:text-gray-600">Clear filter</button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">School</th>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Tier</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Last login</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Features used</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Health</th>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {health.schools.filter(s => !riskFilter || s.risk_level === riskFilter).map(s => (
                        <tr key={s.school_id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{s.school_name}</td>
                          <td className="px-5 py-3 text-xs text-gray-400 capitalize">{s.tier}</td>
                          <td className="px-5 py-3 text-right text-xs text-gray-500">
                            {s.days_since_login == null ? 'Never' : s.days_since_login === 0 ? 'Today' : `${s.days_since_login}d ago`}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{s.features_used}/{s.features_entitled}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-gray-800">{s.health_score}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_CHIP[s.risk_level]}`}>{RISK_LABEL[s.risk_level]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        ) : view === 'adoption' ? (
          adoptionLoading ? (
            <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
          ) : !adoption ? (
            <div className="py-20 text-center text-gray-400 text-sm">Failed to load feature adoption.</div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-gray-500">
                  Which school-admin modules get opened, out of schools entitled to them — sorted lowest adoption first.
                </p>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => setCategoryFilter(null)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${categoryFilter === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    All
                  </button>
                  {[...new Set(adoption.map(f => f.category))].map(cat => (
                    <button key={cat} onClick={() => setCategoryFilter(cat)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${categoryFilter === cat ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Feature</th>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Category</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Entitled</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Active</th>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide w-48">Adoption</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Total opens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {adoption.filter(f => !categoryFilter || f.category === categoryFilter).map(f => (
                        <tr key={f.key} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{f.label}</td>
                          <td className="px-5 py-3 text-xs text-gray-400">{f.category}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{fmt(f.entitled_schools)}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{fmt(f.active_schools)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${f.adoption_pct >= 60 ? 'bg-green-500' : f.adoption_pct >= 25 ? 'bg-amber-500' : 'bg-red-400'}`}
                                  style={{ width: `${f.adoption_pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-gray-500 w-9 text-right">{f.adoption_pct}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{fmt(f.total_opens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        ) : loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
        ) : !overview ? (
          <div className="py-20 text-center text-gray-400 text-sm">Failed to load usage analytics.</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Active now', value: fmt(overview.active_now), sub: 'last 10 min', color: 'text-green-600' },
                { label: 'Total logins', value: fmt(overview.totals.login_count), sub: `last ${days}d`, color: 'text-gray-900' },
                { label: 'Unique users', value: fmt(overview.totals.unique_actors), sub: `last ${days}d`, color: 'text-gray-900' },
                { label: 'Time in product', value: fmtDuration(overview.totals.total_duration_seconds), sub: `last ${days}d`, color: 'text-gray-900' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-200 px-4 py-4">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{c.label}</p>
                  <p className={`text-2xl font-bold font-mono ${c.color}`}>{c.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* Trend chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-700">Engagement trend</p>
                <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
                  {([
                    { key: 'login_count', label: 'Logins' },
                    { key: 'unique_actors', label: 'Unique users' },
                    { key: 'total_duration_seconds', label: 'Time spent' },
                  ] as const).map(m => (
                    <button key={m.key} onClick={() => setMetric(m.key)}
                      className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${metric === m.key ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <Sparkline trend={overview.trend} valueKey={metric} />
            </div>

            {/* Role breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">By role</p>
              </div>
              <div className="divide-y divide-gray-100">
                {overview.by_role.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">No login activity yet in this window.</div>
                ) : overview.by_role.map(r => (
                  <div key={r.actor_role} className="px-5 py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{ROLE_LABEL[r.actor_role] || r.actor_role}</span>
                    <div className="flex items-center gap-6 text-xs text-gray-400">
                      <span>{fmt(r.login_count)} logins</span>
                      <span>{fmt(r.unique_actors)} users</span>
                      <span className="text-gray-600 font-medium">{fmtDuration(r.total_duration_seconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-school leaderboard */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">By school</p>
              </div>
              {overview.by_school.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">No school activity yet in this window.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">School</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Logins</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Users</th>
                        <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Time spent</th>
                        <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Last active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {overview.by_school.map(s => (
                        <tr key={s.school_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedSchool({ id: s.school_id, name: s.school_name })}>
                          <td className="px-5 py-3 font-medium text-gray-800">{s.school_name}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{fmt(s.login_count)}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{fmt(s.unique_actors)}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-gray-600">{fmtDuration(s.total_duration_seconds)}</td>
                          <td className="px-5 py-3 text-xs text-gray-400">{fmtDay(s.last_active_day)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* School drill-down panel */}
      {selectedSchool && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelectedSchool(null)}>
          <div className="bg-gray-50 w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <p className="text-xs text-gray-400">School drill-down</p>
                <h2 className="text-lg font-bold text-gray-900">{selectedSchool.name}</h2>
              </div>
              <button onClick={() => setSelectedSchool(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading ? (
                <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
              ) : !detail ? (
                <div className="py-16 text-center text-gray-400 text-sm">Failed to load school detail.</div>
              ) : (
                <>
                  {/* Segment summary */}
                  <div className="grid grid-cols-3 gap-3">
                    {(['active', 'cooling', 'at_risk'] as Segment[]).map(seg => (
                      <button key={seg}
                        onClick={() => setSegmentFilter(f => f === seg ? null : seg)}
                        className={`bg-white rounded-xl border px-4 py-3 text-left transition-all ${segmentFilter === seg ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${SEGMENT_CHIP[seg]}`}>{SEGMENT_LABEL[seg]}</span>
                        <p className="text-xl font-bold text-gray-900">{fmt(detail.segment_counts[seg] || 0)}</p>
                        <p className="text-xs text-gray-400">
                          {seg === 'active' ? 'within 7 days' : seg === 'cooling' ? '8-21 days ago' : '22+ days ago'}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* By role for this school */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-700">By role</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {detail.by_role.length === 0 ? (
                        <div className="py-6 text-center text-gray-400 text-sm">No activity in this window.</div>
                      ) : detail.by_role.map(r => (
                        <div key={r.actor_role} className="px-5 py-2.5 flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700">{ROLE_LABEL[r.actor_role] || r.actor_role}</span>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span>{fmt(r.login_count)} logins</span>
                            <span className="text-gray-600 font-medium">{fmtDuration(r.total_duration_seconds)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actor list */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">
                        Users {segmentFilter ? `— ${SEGMENT_LABEL[segmentFilter]}` : ''}
                      </p>
                      {segmentFilter && (
                        <button onClick={() => setSegmentFilter(null)} className="text-xs text-gray-400 hover:text-gray-600">Clear filter</button>
                      )}
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                      {filteredActors.length === 0 ? (
                        <div className="py-8 text-center text-gray-400 text-sm">No users match this filter.</div>
                      ) : filteredActors.map(a => (
                        <div key={`${a.actor_role}-${a.actor_id}`} className="px-5 py-2.5 flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium text-gray-800">{a.actor_name || `#${a.actor_id}`}</p>
                            <p className="text-xs text-gray-400">{ROLE_LABEL[a.actor_role] || a.actor_role} · {fmt(a.login_count)} logins · {fmtDuration(a.total_duration_seconds)}</p>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEGMENT_CHIP[a.segment]}`}>{SEGMENT_LABEL[a.segment]}</span>
                            <p className="text-xs text-gray-400 mt-1">{fmtDateTime(a.last_login_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
