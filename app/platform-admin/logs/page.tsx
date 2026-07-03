'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type RequestRow = {
  id: number; school_id: number | null; school_name: string | null
  route: string; method: string; status_code: number; duration_ms: number
  actor_email: string | null; error_message: string | null; created_at: string
}
type ErrorRow = {
  id: number; school_id: number | null; school_name: string | null
  severity: string; source: string; route: string | null
  error_name: string | null; error_message: string; actor_email: string | null
  created_at: string
}
type Summary = {
  total_requests: number; error_count: number; slow_count: number
  p50_ms: number; p95_ms: number; total_errors: number; critical_count: number
}
type TopRoute = { route: string; count: number; last_seen: string }

type Tab = 'requests' | 'errors'

const SEVERITY_CHIP: Record<string, string> = {
  info:     'bg-blue-100 text-blue-700',
  warn:     'bg-amber-100 text-amber-700',
  error:    'bg-red-100 text-red-700',
  critical: 'bg-red-700 text-white',
}

const PAGE_SIZE = 50

function fmt(n: number) { return n.toLocaleString('en-IN') }
function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function WatchlinePage() {
  const [tab, setTab]           = useState<Tab>('requests')
  const [loading, setLoading]   = useState(true)
  const [summary, setSummary]   = useState<Summary | null>(null)
  const [topRoutes, setTopRoutes] = useState<TopRoute[]>([])
  const [rows, setRows]         = useState<(RequestRow | ErrorRow)[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)

  // Filters
  const [schoolFilter, setSchoolFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [exporting, setExporting] = useState(false)

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({
      type: tab === 'errors' ? 'error' : 'request',
      from: fromDate, to: toDate,
      page: String(page),
    })
    if (schoolFilter)   p.set('school_id', schoolFilter)
    if (severityFilter && tab === 'errors') p.set('severity', severityFilter)
    Object.entries(extra).forEach(([k, v]) => p.set(k, v))
    return p.toString()
  }, [tab, fromDate, toDate, page, schoolFilter, severityFilter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/platform/watchline?${buildParams()}`)
      if (res.ok) {
        const d = await res.json()
        setSummary(d.summary)
        setTopRoutes(d.top_routes || [])
        setRows(d.rows)
        setTotal(d.total)
      }
    } finally { setLoading(false) }
  }, [buildParams])

  useEffect(() => { load() }, [load])

  // Reset page when tab or filters change
  useEffect(() => { setPage(0) }, [tab, schoolFilter, severityFilter, fromDate, toDate])

  async function handleExport(fmt: 'csv' | 'json') {
    setExporting(true)
    try {
      const url = `/api/platform/watchline?${buildParams({ export: fmt, page: '0' })}`
      const res = await fetch(url)
      if (!res.ok) return
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `watchline-${tab}-${fromDate}-to-${toDate}.${fmt}`
      a.click()
    } finally { setExporting(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/platform-admin" className="text-gray-400 hover:text-gray-600 text-sm">← Platform Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-medium text-sm">Watchline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full border border-teal-200">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
            Observability
          </span>
          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-3 py-1 rounded-full">Platform Admin</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Watchline</h1>
            <p className="text-gray-400 text-sm mt-0.5">API performance and error monitoring across all monitored schools</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleExport('csv')} disabled={exporting}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3.5 6l3 3 3-3M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              CSV
            </button>
            <button onClick={() => handleExport('json')} disabled={exporting}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v8M3.5 6l3 3 3-3M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              JSON
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Requests',      value: fmt(summary.total_requests), sub: `${fmt(summary.slow_count)} slow`,    color: 'text-gray-900' },
              { label: 'HTTP errors',   value: fmt(summary.error_count),    sub: 'status ≥ 400',                        color: summary.error_count > 0 ? 'text-red-600' : 'text-gray-900' },
              { label: 'P50 latency',   value: `${summary.p50_ms} ms`,      sub: `P95: ${summary.p95_ms} ms`,           color: 'text-gray-900' },
              { label: 'Error events',  value: fmt(summary.total_errors),   sub: `${fmt(summary.critical_count)} critical`, color: summary.critical_count > 0 ? 'text-red-600' : 'text-gray-900' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-200 px-4 py-4">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{c.label}</p>
                <p className={`text-2xl font-bold font-mono ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Top erroring routes */}
        {topRoutes.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Top erroring routes</p>
            </div>
            <div className="divide-y divide-gray-100">
              {topRoutes.map(r => (
                <div key={r.route} className="px-5 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-gray-700">{r.route}</span>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="font-semibold text-red-600">{fmt(Number(r.count))} errors</span>
                    <span>{fmtDate(r.last_seen)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">School ID</label>
            <input type="number" placeholder="All schools" value={schoolFilter}
              onChange={e => setSchoolFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          {tab === 'errors' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium">Severity</label>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">All</option>
                <option value="critical">Critical</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 border-b border-gray-200">
          {(['requests', 'errors'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors capitalize
                ${tab === t ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              No {tab} data for the selected period.
              {tab === 'requests' && <p className="text-xs mt-1">Enable Watchline on a school to start capturing requests.</p>}
            </div>
          ) : tab === 'requests' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Route</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">School</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Duration</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actor</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(rows as RequestRow[]).map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-gray-700">{r.route}</span>
                        {r.error_message && <p className="text-xs text-red-500 mt-0.5 truncate max-w-[260px]">{r.error_message}</p>}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">{r.school_name || '—'}{r.school_id ? <span className="text-gray-300 ml-1">#{r.school_id}</span> : ''}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-mono font-semibold ${r.status_code >= 500 ? 'text-red-600' : r.status_code >= 400 ? 'text-amber-600' : 'text-green-600'}`}>
                          {r.status_code}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">
                        <span className={r.duration_ms > 500 ? 'text-amber-600 font-semibold' : ''}>{r.duration_ms} ms</span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400">{r.actor_email || '—'}</td>
                      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Severity</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Error</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Route</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">School</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actor</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(rows as ErrorRow[]).map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_CHIP[r.severity] || 'bg-gray-100 text-gray-600'}`}>
                          {r.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {r.error_name && <p className="text-xs font-mono text-gray-500 mb-0.5">{r.error_name}</p>}
                        <p className="text-xs text-gray-700 max-w-[300px] truncate" title={r.error_message}>{r.error_message}</p>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{r.route || '—'}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{r.school_name || '—'}{r.school_id ? <span className="text-gray-300 ml-1">#{r.school_id}</span> : ''}</td>
                      <td className="px-5 py-3 text-xs text-gray-400">{r.actor_email || '—'}</td>
                      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {fmt(total)}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Previous
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
