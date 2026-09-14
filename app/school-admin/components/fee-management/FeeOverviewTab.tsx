'use client'

import type { FeeStats, GradeStat, PassoutData, PassoutStudent, RecentPayment } from './types'
import { LoadErrorBanner } from './LoadErrorBanner'
import { useFeeStore } from '@/lib/stores/feeStore'

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function pct(num: number, den: number) {
  if (!den || den < 0) return 0
  return Math.min(100, Math.round((num / den) * 100))
}

// Dashboard: headline stat cards, collection progress, class-wise analysis,
// fee-head health, highest pending / recent payments, and the passout-ledger
// panel. stats/passoutData stay parent-owned (loadStats/loadPassout are also
// called after mutations elsewhere — Setup, Year-End, Collect); this tab only
// reads them and triggers the same loaders on retry/refresh.
export default function FeeOverviewTab({
  schoolId,
  academicYear,
  academicYears,
  closedYears,
  stats,
  statsLoading,
  statsError,
  gradeStats,
  recentPayments,
  passoutData,
  passoutLoading,
  passoutError,
  passoutCollectLoading,
  passoutCollectError,
  onRetryStats,
  onRetryPassout,
  onCollectPassout,
  onGoToCollect,
  onGoToYearEnd,
  onGoToReports,
  onGoToSetup,
}: {
  schoolId: number
  academicYear: string
  academicYears: string[]
  closedYears: Set<string>
  stats: FeeStats | null
  statsLoading: boolean
  statsError?: string
  gradeStats: GradeStat[]
  recentPayments: RecentPayment[]
  passoutData: PassoutData | null
  passoutLoading: boolean
  passoutError?: string
  passoutCollectLoading: number | null
  passoutCollectError: string
  onRetryStats: () => void
  onRetryPassout: () => void
  onCollectPassout: (s: PassoutStudent) => void
  onGoToCollect: () => void
  onGoToYearEnd: () => void
  onGoToReports: () => void
  onGoToSetup: () => void
}) {
  const pendingPayments = useFeeStore(s => s.pendingPayments)

  return (
    <div className="space-y-5">

      <LoadErrorBanner message={statsError}   onRetry={onRetryStats}   testId="btn-load-error-retry-stats" />
      <LoadErrorBanner message={passoutError} onRetry={onRetryPassout} testId="btn-load-error-retry-passout" />

      {/* ── Action Required ── */}
      {(() => {
        const actions: Array<{ msg: string; tab: 'collect' | 'yearend'; subView?: 'online' }> = []
        if (pendingPayments.length > 0)
          actions.push({ msg: `${pendingPayments.length} online payment${pendingPayments.length > 1 ? 's' : ''} waiting for your verification`, tab: 'collect', subView: 'online' })
        if (stats && stats.summary.overdue_count > 20)
          actions.push({ msg: `${stats.summary.overdue_count} overdue entries — follow up with parents`, tab: 'collect' })
        if (stats && stats.summary.defaulters_count > 0)
          actions.push({ msg: `${stats.summary.defaulters_count} students have made zero payment this year`, tab: 'collect' })
        // Warn if the immediately preceding year (older, higher index since array is DESC) is not closed
        if (academicYears.length > 1) {
          const idx = academicYears.indexOf(academicYear)
          const prevYear = idx < academicYears.length - 1 ? academicYears[idx + 1] : null
          if (prevYear && !closedYears.has(prevYear))
            actions.push({ msg: `${prevYear} has not been closed — go to Year-End tab to carry forward or write off outstanding dues before generating new bills`, tab: 'yearend' })
        }
        if (actions.length === 0) return null
        return (
          <div className="rounded-xl border border-red-100 overflow-hidden">
            <div className="bg-red-50 px-4 py-2 border-b border-red-100">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide">⚠ Needs Attention</p>
            </div>
            <div className="divide-y divide-gray-100">
              {actions.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50">
                  <p className="text-sm text-gray-700">{a.msg}</p>
                  <button
                    data-testid={`btn-overview-action-${i}`}
                    onClick={() => {
                      if (a.tab === 'collect') onGoToCollect(); else onGoToYearEnd()
                      if (a.subView === 'online') useFeeStore.getState().requestCollectionView('online')
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 ml-4 flex-shrink-0"
                  >
                    View →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Stat Cards ── */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-28 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      ) : stats?.summary ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Billed',  value: stats.summary.total_due,                                                                    sub: `${stats.summary.total_students} students`,           border: 'border-gray-100',   text: 'text-gray-900',   sub_color: 'text-gray-400' },
              { label: 'Collected',     value: stats.summary.total_collected,    sub: `${pct(Number(stats.summary.total_collected), Number(stats.summary.total_due) - Number(stats.summary.total_waived || 0))}% of net demand`, border: 'border-green-100',  text: 'text-green-700',  sub_color: 'text-green-500' },
              { label: 'Waived',        value: stats.summary.discretionary_waived ?? stats.summary.total_waived,                            sub: `${stats.summary.waived_count} entries waived`,       border: 'border-purple-100', text: 'text-purple-700', sub_color: 'text-purple-400' },
              { label: 'Outstanding',   value: stats.summary.total_outstanding,                                                             sub: `${stats.summary.overdue_count} overdue entries`,     border: 'border-red-100',    text: 'text-red-600',    sub_color: 'text-red-400' },
              { label: 'Zero Payers',   value: stats.summary.defaulters_count,                                                              sub: 'students with no payment or waiver',                 border: 'border-orange-100', text: 'text-orange-600', sub_color: 'text-orange-400', isCount: true },
            ].map(card => (
              <div key={card.label} className={`bg-white rounded-xl border ${card.border} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.text}`}>
                  {card.isCount ? card.value : fmt(card.value)}
                </p>
                <p className={`text-xs mt-1 ${card.sub_color}`}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Overall Progress Bar ── */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Overall Collection Progress — {academicYear}</h3>
              <span className="text-sm font-bold text-blue-600">{pct(Number(stats.summary.total_collected), Number(stats.summary.total_due) - Number(stats.summary.total_waived || 0))}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-700"
                style={{ width: `${pct(Number(stats.summary.total_collected), Number(stats.summary.total_due) - Number(stats.summary.total_waived || 0))}%` }}
              />
            </div>
            <div className="flex gap-5 flex-wrap">
              {[
                { label: 'Fully Paid', count: stats.summary.students_fully_paid, dot: 'bg-green-500' },
                { label: 'Partial',    count: stats.summary.students_partial,     dot: 'bg-yellow-400' },
                { label: 'Not Paid',   count: stats.summary.students_not_paid,    dot: 'bg-red-500' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                  <span className="text-xs text-gray-500">{s.label}</span>
                  <span className="text-xs font-bold text-gray-800">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Class-wise Analysis ── */}
          {gradeStats.length > 0 && (() => {
            const label = (g: GradeStat) => g.section ? `${g.grade}-${g.section}` : `Grade ${g.grade}`
            // Net of waivers — matches the Reports tab's class-wise collection % and the
            // overall progress bar above, so the same data doesn't show two different
            // percentages on different screens.
            const withRate = gradeStats.map(g => ({ ...g, rate: pct(Number(g.total_collected), Number(g.total_due) - Number(g.total_waived ?? 0)), label: label(g) }))
            const ranked = [...withRate].filter(g => Number(g.total_due) > 0).sort((a, b) => b.rate - a.rate)
            const best = ranked[0]
            const worst = ranked[ranked.length - 1]
            const totDue = gradeStats.reduce((s, g) => s + Number(g.total_due), 0)
            const totCol = gradeStats.reduce((s, g) => s + Number(g.total_collected), 0)
            const totWaivedAll = gradeStats.reduce((s, g) => s + Number(g.total_waived ?? 0), 0)
            const totStu = gradeStats.reduce((s, g) => s + Number(g.students), 0)
            const totDef = gradeStats.reduce((s, g) => s + Number(g.defaulter_students || 0), 0)
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Class-wise Collection Analysis</h3>
                  <div className="flex items-center gap-3">
                    <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg">Export</a>
                    <button data-testid="btn-overview-full-report" onClick={onGoToReports} className="text-xs text-blue-600 hover:text-blue-800">Full report →</button>
                  </div>
                </div>

                {/* Highlight cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-green-600 uppercase font-semibold tracking-wide">Best Class</p>
                    {best ? (
                      <>
                        <p className="text-sm font-bold text-green-800 mt-0.5">{best.label}</p>
                        <p className="text-xs text-green-600">{best.rate}% collected</p>
                      </>
                    ) : <p className="text-sm text-gray-400 mt-0.5">—</p>}
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-red-500 uppercase font-semibold tracking-wide">Needs Focus</p>
                    {worst && worst !== best ? (
                      <>
                        <p className="text-sm font-bold text-red-700 mt-0.5">{worst.label}</p>
                        <p className="text-xs text-red-500">{worst.rate}% collected</p>
                      </>
                    ) : <p className="text-sm text-gray-400 mt-0.5">—</p>}
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Avg / Student</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{totStu > 0 ? fmt(Math.round(totCol / totStu)) : '₹0'}</p>
                    <p className="text-xs text-gray-400">collected</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-amber-600 uppercase font-semibold tracking-wide">Pending Payments</p>
                    <p className="text-sm font-bold text-amber-700 mt-0.5">{totDef} <span className="text-xs font-normal text-amber-500">of {totStu}</span></p>
                    <p className="text-xs text-amber-500">students owe</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left font-semibold pb-2">Class</th>
                        <th className="text-right font-semibold pb-2">Students</th>
                        <th className="text-right font-semibold pb-2">Paid / Owe</th>
                        <th className="text-right font-semibold pb-2">Billed</th>
                        <th className="text-right font-semibold pb-2">Collected</th>
                        <th className="text-right font-semibold pb-2">Outstanding</th>
                        <th className="text-left font-semibold pb-2 pl-4 w-44">Collection Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withRate.map(g => {
                        const collected = Number(g.total_collected)
                        const due = Number(g.total_due)
                        const p = g.rate
                        const color = p >= 80 ? 'bg-green-500' : p >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                        const badge = p >= 80 ? 'bg-green-100 text-green-700' : p >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                        return (
                          <tr key={g.label} className="border-b border-gray-50 hover:bg-gray-50/60">
                            <td className="py-2.5 font-medium text-gray-800">{g.label}</td>
                            <td className="py-2.5 text-right text-gray-500">{g.students}</td>
                            <td className="py-2.5 text-right text-xs">
                              <span className="text-green-600 font-medium">{g.fully_paid_students ?? 0}</span>
                              <span className="text-gray-300"> / </span>
                              <span className="text-red-500 font-medium">{g.defaulter_students ?? 0}</span>
                            </td>
                            <td className="py-2.5 text-right text-gray-700">{fmt(due)}</td>
                            <td className="py-2.5 text-right text-green-600 font-medium">{fmt(collected)}</td>
                            <td className="py-2.5 text-right text-red-600 font-medium">{fmt(g.outstanding)}</td>
                            <td className="py-2.5 pl-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${p}%` }} />
                                </div>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge} w-10 text-center`}>{p}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-100 font-semibold">
                        <td className="pt-2.5 text-gray-700">Total</td>
                        <td className="pt-2.5 text-right text-gray-600">{totStu}</td>
                        <td className="pt-2.5 text-right text-xs">
                          <span className="text-green-600">{gradeStats.reduce((s, g) => s + Number(g.fully_paid_students || 0), 0)}</span>
                          <span className="text-gray-300"> / </span>
                          <span className="text-red-500">{totDef}</span>
                        </td>
                        <td className="pt-2.5 text-right text-gray-700">{fmt(totDue)}</td>
                        <td className="pt-2.5 text-right text-green-700">{fmt(totCol)}</td>
                        <td className="pt-2.5 text-right text-red-700">{fmt(gradeStats.reduce((s, g) => s + Number(g.outstanding), 0))}</td>
                        <td className="pt-2.5 pl-4">
                          <span className="text-xs font-bold text-blue-600">{pct(totCol, totDue - totWaivedAll)}% overall</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* ── Two Columns ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Fee Head Health */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Fee Head Collection Health</h3>
              {stats.by_category.length === 0 ? (
                <p className="text-sm text-gray-400">No fee heads configured yet.</p>
              ) : (
                <div className="space-y-4">
                  {stats.by_category.map(cat => {
                    const collected = Number(cat.total_collected)
                    const due = Number(cat.total_due) - Number(cat.total_waived ?? 0)
                    const p = pct(collected, due)
                    const color = p >= 80 ? 'bg-green-500' : p >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                    return (
                      <div key={cat.category_name}>
                        <div className="flex justify-between items-center mb-1.5">
                          <div>
                            <span className="text-sm font-medium text-gray-700">{cat.category_name}</span>
                            <span className="text-xs text-gray-400 ml-2 capitalize">{cat.frequency}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-gray-700">{p}%</span>
                            <span className="text-xs text-gray-400 ml-1">{fmt(collected)} / {fmt(due)}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${p}%` }} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {cat.total_outstanding != null && cat.total_outstanding > 0 && (
                            <p className="text-[10px] text-red-500">Outstanding: {fmt(cat.total_outstanding)}</p>
                          )}
                          {cat.overdue_count > 0 && (
                            <p className="text-[10px] text-orange-500">{cat.overdue_count} overdue</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right column: Highest Pending + Recent Payments */}
            <div className="space-y-4">

              {/* Highest Pending */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Highest Pending</h3>
                  <button data-testid="btn-overview-view-all-pending" onClick={onGoToCollect} className="text-xs text-blue-600 hover:text-blue-800">
                    View all →
                  </button>
                </div>
                {stats.top_defaulters.length === 0 ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-sm text-green-600 font-medium">No pending payments — great!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.top_defaulters.slice(0, 5).map((d, i) => (
                      <div key={d.student_id} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{d.student_name}</p>
                          <p className="text-xs text-gray-400">Gr.{d.grade}{d.section} · #{d.roll_number}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-red-600">{fmt(d.outstanding)}</p>
                          {d.overdue_entries > 0 && (
                            <p className="text-[10px] text-red-400">{d.overdue_entries} overdue</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Payments */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Recent Payments</h3>
                  <button data-testid="btn-overview-goto-collect" onClick={onGoToCollect} className="text-xs text-blue-600 hover:text-blue-800">
                    Collect →
                  </button>
                </div>
                {recentPayments.length === 0 ? (
                  <p className="text-sm text-gray-400">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {recentPayments.map(p => (
                      <div key={p.id} className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.student_name}</p>
                          <p className="text-xs text-gray-400 truncate">{p.category_name} · {p.period_label}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-sm font-bold text-green-600">{fmt(p.amount)}</p>
                          <p className="text-[10px] text-gray-400 uppercase">{p.payment_mode}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Mode Breakdown */}
              {stats.by_payment_mode.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Mode Breakdown</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {stats.by_payment_mode.map(m => (
                      <div key={m.payment_mode} className="bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-400 uppercase font-medium">{m.payment_mode}</p>
                        <p className="text-sm font-bold text-gray-800">{fmt(m.total)}</p>
                        <p className="text-xs text-gray-400">{m.count} transactions</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Passout Students Pending Bills */}
              {passoutData && passoutData.summary.passout_students > 0 && (
                <div className="bg-white rounded-xl border border-indigo-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-indigo-700">Passout Students — Pending Bills</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{passoutData.summary.passout_students} student{passoutData.summary.passout_students > 1 ? 's' : ''} · open ledger</p>
                    </div>
                    <button
                      data-testid="btn-overview-passout-refresh"
                      onClick={onRetryPassout}
                      disabled={passoutLoading}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      {passoutLoading ? '…' : '↻ Refresh'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <div className="bg-indigo-50 rounded-lg px-3 py-2 text-center">
                      <p className="text-xs text-indigo-500 mb-0.5">Outstanding</p>
                      <p className="text-sm font-bold text-indigo-700">{fmt(passoutData.summary.total_outstanding)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
                      <p className="text-xs text-green-500 mb-0.5">Collected</p>
                      <p className="text-sm font-bold text-green-700">{fmt(passoutData.summary.total_collected)}</p>
                    </div>
                    {passoutData.summary.total_waived > 0 && (
                      <div className="bg-purple-50 rounded-lg px-3 py-2 text-center">
                        <p className="text-xs text-purple-500 mb-0.5">Waived</p>
                        <p className="text-sm font-bold text-purple-700">{fmt(passoutData.summary.total_waived)}</p>
                      </div>
                    )}
                    <div className={`bg-gray-50 rounded-lg px-3 py-2 text-center ${passoutData.summary.total_waived > 0 ? '' : 'col-span-2'}`}>
                      <p className="text-xs text-gray-400 mb-0.5">Net Pending</p>
                      <p className="text-sm font-bold text-gray-700">{fmt(passoutData.summary.total_outstanding - passoutData.summary.total_collected)}</p>
                    </div>
                  </div>
                  {passoutCollectError && (
                    <p className="text-[10px] text-red-600 mb-1.5">{passoutCollectError}</p>
                  )}
                  {passoutData.students.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {passoutData.students.map(s => (
                        <div key={s.student_id} className="flex items-center justify-between py-1 gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-800 truncate">{s.student_name}</p>
                            <p className="text-[10px] text-gray-400">Gr.{s.grade}{s.section} · Batch {s.passout_year}</p>
                          </div>
                          <p className="text-xs font-bold text-red-600 flex-shrink-0">{fmt(s.outstanding)}</p>
                          <button
                            data-testid={`btn-passout-collect-${s.student_id}`}
                            onClick={() => onCollectPassout(s)}
                            disabled={passoutCollectLoading === s.student_id}
                            className="flex-shrink-0 text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {passoutCollectLoading === s.student_id ? '…' : 'Collect'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {passoutData.recent_collections.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">Recent Collections</p>
                      <div className="space-y-1.5">
                        {passoutData.recent_collections.slice(0, 3).map(c => (
                          <div key={c.id} className="flex items-center justify-between">
                            <p className="text-xs text-gray-600 truncate flex-1">{c.student_name} · {c.period_label}</p>
                            <p className="text-xs font-bold text-green-600 flex-shrink-0 ml-2">{fmt(c.amount)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium mb-1">No fee data for {academicYear}</p>
          <p className="text-gray-400 text-sm mb-5">Set up fee heads, enter amounts, then generate bills to see collection data here.</p>
          <button
            data-testid="btn-overview-goto-setup"
            onClick={onGoToSetup}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            Go to Fee Setup →
          </button>
        </div>
      )}
    </div>
  )
}
