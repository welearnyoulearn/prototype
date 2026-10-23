'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoadErrorBanner } from './LoadErrorBanner'

export type ArchiveYear = {
  academic_year: string
  start_date: string
  end_date: string
  is_current: boolean
  student_count: number
  summary: { total_billed: number; total_collected: number; total_waived: number; discretionary_waived: number; total_unpaid: number }
  close_status: {
    closed_at: string; closed_by: string; is_reopened: boolean
    carried: { count: number; total: number }
    writeoff: { count: number; total: number }
    open: { count: number; total: number }
  } | null
}

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Every academic year this school has had, with its financial headline and close
// status. "View Report"/"View Ledger" jump into the existing Reports/Collect tabs
// (via onViewYear, owned by the parent) scoped to that year, rather than
// duplicating a drill-down view here.
export default function FeeArchiveTab({
  schoolId,
  onViewYear,
}: {
  schoolId: number
  onViewYear: (year: string, dest: 'reports' | 'collect') => void
}) {
  const [archiveYears, setArchiveYears]     = useState<ArchiveYear[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError]     = useState('')

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true)
    try {
      const r = await fetch(`/api/fees/archive?school_id=${schoolId}`)
      if (r.ok) { setArchiveError(''); const d = await r.json(); setArchiveYears(d.years || []) }
      else setArchiveError('Could not load past records — try refreshing')
    } catch { setArchiveError('Network error — past records could not be loaded') }
    finally { setArchiveLoading(false) }
  }, [schoolId])

  useEffect(() => { loadArchive() }, [loadArchive])

  return (
    <div className="space-y-5">
      <LoadErrorBanner message={archiveError} onRetry={loadArchive} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Past Records</h2>
          <p className="text-sm text-gray-500 mt-0.5">Every academic year this school has had, with its financial headline and close status.</p>
        </div>
        <button data-testid="btn-archive-refresh" onClick={loadArchive} disabled={archiveLoading}
          className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
          {archiveLoading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {archiveLoading && archiveYears.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
      ) : archiveYears.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">No academic years yet.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {archiveYears.map(y => {
            const status = y.is_current
              ? { label: 'Current', cls: 'bg-blue-100 text-blue-700' }
              : y.close_status && !y.close_status.is_reopened
                ? { label: 'Closed', cls: 'bg-gray-800 text-white' }
                : y.close_status?.is_reopened
                  ? { label: 'Reopened', cls: 'bg-amber-100 text-amber-700' }
                  : { label: 'Not Closed', cls: 'bg-red-100 text-red-600' }
            return (
              <div key={y.academic_year} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-bold text-gray-900">{y.academic_year}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
                  </div>
                  <p className="text-xs text-gray-400">{y.student_count} students billed</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  {[
                    { l: 'Billed',    v: y.summary.total_billed,    c: 'text-gray-900' },
                    { l: 'Collected', v: y.summary.total_collected, c: 'text-green-700' },
                    { l: 'Waived',    v: y.summary.discretionary_waived ?? y.summary.total_waived, c: 'text-purple-700' },
                    { l: 'Unpaid',    v: y.summary.total_unpaid,    c: 'text-red-600' },
                  ].map(s => (
                    <div key={s.l} className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
                      <p className="text-[10px] text-gray-400">{s.l}</p>
                      <p className={`text-sm font-bold mt-0.5 ${s.c}`}>{fmt(s.v)}</p>
                    </div>
                  ))}
                </div>
                {y.close_status && (
                  <p className="text-xs text-gray-400 mt-3">
                    Closed by {y.close_status.closed_by} on {fmtDate(y.close_status.closed_at)}
                    {y.close_status.carried.count > 0 && ` · ${y.close_status.carried.count} carried (${fmt(y.close_status.carried.total)})`}
                    {y.close_status.writeoff.count > 0 && ` · ${y.close_status.writeoff.count} written off (${fmt(y.close_status.writeoff.total)})`}
                    {y.close_status.open.count > 0 && ` · ${y.close_status.open.count} left open (${fmt(y.close_status.open.total)})`}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                  <button data-testid={`btn-archive-report-${y.academic_year}`} onClick={() => onViewYear(y.academic_year, 'reports')}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">
                    View Report →
                  </button>
                  <button data-testid={`btn-archive-ledger-${y.academic_year}`} onClick={() => onViewYear(y.academic_year, 'collect')}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    View Ledger →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
