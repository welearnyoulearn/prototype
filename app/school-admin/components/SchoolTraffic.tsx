'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SchoolTrafficResponse } from '@/app/api/school-admin/traffic/route'

const ROLE_LABEL: Record<string, string> = {
  school_admin: 'School admin', principal: 'Principal', vice_principal: 'Vice principal',
  teacher: 'Teachers', student: 'Students', parent: 'Parents',
}
const PORTAL_LABEL: Record<string, string> = {
  'school-admin': 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent',
}

const fmt = (n: number) => n.toLocaleString('en-IN')
function fmtDuration(seconds: number) {
  const hrs = seconds / 3600
  return hrs >= 1 ? `${hrs.toFixed(1)}h` : `${Math.round(seconds / 60)}m`
}
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`

export default function SchoolTraffic() {
  const [days, setDays] = useState<7 | 30>(7)
  const [data, setData] = useState<SchoolTrafficResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/school-admin/traffic?days=${days}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Could not load traffic'); return }
      setData(body as SchoolTrafficResponse)
    } catch {
      setError('Could not load traffic')
    } finally {
      setLoading(false)
    }
  }, [days])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / range change
  useEffect(() => { load() }, [load])

  const maxHour = Math.max(...(data?.byHour.map(h => h.sessions) ?? []), 1)
  const busiest = data?.byHour.reduce((a, h) => (h.sessions > a.sessions ? h : a), { hour: -1, sessions: 0 })

  return (
    <div className="space-y-5 max-w-5xl" data-testid="traffic">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-900">Traffic</h2>
          <p className="text-sm text-gray-400 mt-0.5">Who signs in to your school, when, and what they open.</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit" role="group" aria-label="Date range">
          {([7, 30] as const).map(d => (
            <button key={d} type="button" data-testid={`traffic-range-${d}`} onClick={() => setDays(d)} aria-pressed={days === d}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${days === d ? 'bg-white text-[#235b46] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Last {d} days
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div data-testid="traffic-error" className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" data-testid="traffic-retry" onClick={load} className="text-sm font-medium underline">Try again</button>
        </div>
      ) : loading && !data ? (
        <p className="text-sm text-gray-400" role="status">Loading…</p>
      ) : data && data.totals.logins === 0 && data.topFeatures.length === 0 ? (
        <p data-testid="traffic-empty" className="bg-white border border-gray-200 rounded-xl p-8 text-sm text-gray-400 text-center">
          No sign-ins in the last {data.days} days yet.
        </p>
      ) : data && (
        <div className={`space-y-5 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {/* Metrics strip */}
          <div className="grid grid-cols-3 bg-white border border-gray-200 rounded-xl divide-x divide-gray-100">
            {[
              { label: 'Logins', value: fmt(data.totals.logins) },
              { label: 'Active users', value: fmt(data.totals.activeUsers) },
              { label: 'Time spent', value: fmtDuration(data.totals.seconds) },
            ].map(m => (
              <div key={m.label} className="px-4 py-3">
                <p className="text-xs text-gray-500">{m.label}</p>
                <p className="text-xl font-semibold text-gray-900">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Busiest hours */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Busiest hours</p>
              {busiest && busiest.hour >= 0 && <p className="text-xs text-gray-500">Peak: {hourLabel(busiest.hour)} (IST)</p>}
            </div>
            <div className="flex items-end gap-0.5 h-28" role="img" aria-label="Sign-ins by hour of day">
              {data.byHour.map(h => (
                <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${hourLabel(h.hour)}: ${fmt(h.sessions)} sign-ins`}>
                  <div className="w-full bg-[#235b46]/70 rounded-t" style={{ height: `${h.sessions ? Math.max((h.sessions / maxHour) * 100, 4) : 0}%` }} />
                  {h.hour % 3 === 0 && <span className="text-[10px] text-gray-400 mt-1">{hourLabel(h.hour)}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* By role */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <p className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100">By role</p>
              <table className="w-full text-sm" data-testid="traffic-by-role">
                <thead><tr className="text-left text-xs text-gray-500 uppercase bg-gray-50"><th className="px-4 py-2">Role</th><th className="px-4 py-2 text-right">Logins</th><th className="px-4 py-2 text-right">Users</th><th className="px-4 py-2 text-right">Time</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data.byRole.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No sign-ins yet.</td></tr>
                  ) : data.byRole.map(r => (
                    <tr key={r.role}>
                      <td className="px-4 py-2 font-medium text-gray-800">{ROLE_LABEL[r.role] ?? r.role}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{fmt(r.logins)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{fmt(r.activeUsers)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{fmtDuration(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Most-opened features */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <p className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100">Most opened</p>
              <table className="w-full text-sm" data-testid="traffic-features">
                <thead><tr className="text-left text-xs text-gray-500 uppercase bg-gray-50"><th className="px-4 py-2">Feature</th><th className="px-4 py-2">Portal</th><th className="px-4 py-2 text-right">Opens</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data.topFeatures.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Nothing opened yet.</td></tr>
                  ) : data.topFeatures.map(f => (
                    <tr key={`${f.portal}-${f.key}`}>
                      <td className="px-4 py-2 font-medium text-gray-800 capitalize">{f.label}</td>
                      <td className="px-4 py-2 text-gray-500">{PORTAL_LABEL[f.portal] ?? f.portal}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{fmt(f.opens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
