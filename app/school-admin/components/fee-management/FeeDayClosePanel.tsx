'use client'

import { useCallback, useEffect, useState } from 'react'
import { fmt, fmtDate, todayLocal } from './format'

// End-of-day reconciliation: loads the day's collections, compares cash in hand, and locks the day.
// Mounted by FeeCollectTab only while the Day Close view is open, so it loads fresh each time.
export default function FeeDayClosePanel({ schoolId, academicYear }: { schoolId: number | string; academicYear: string }) {
  // ── Day Close ──
  type DayCloseData = {
    date: string
    by_mode: Record<string, { count: number; total: number }>
    receipts: { first: string | null; last: string | null; count: number; total: number }
    payments: Array<{ id: number; student_name: string; grade: string; section: string; fee_head_name: string; period_label: string; amount: number; payment_mode: string; receipt_number: string; collected_by_name: string | null; notes: string | null }>
    already_closed: boolean
  }
  const [dayCloseData, setDayCloseData] = useState<DayCloseData | null>(null)
  const [dayCloseDate, setDayCloseDate] = useState(todayLocal())
  const [dayCloseLoading, setDayCloseLoading] = useState(false)
  const [actualCash, setActualCash] = useState('')
  const [dayCloseMsg, setDayCloseMsg] = useState('')
  const [dayCloseSubmitting, setDayCloseSubmitting] = useState(false)

  const loadDayClose = useCallback(async (date: string) => {
    setDayCloseLoading(true); setDayCloseMsg('')
    const r = await fetch(`/api/fees/day-close?school_id=${schoolId}&date=${date}`)
    if (r.ok) setDayCloseData(await r.json())
    setDayCloseLoading(false)
  }, [schoolId])

  useEffect(() => {
    loadDayClose(dayCloseDate)
  }, [dayCloseDate, loadDayClose])

  async function submitDayClose() {
    setDayCloseSubmitting(true); setDayCloseMsg('')
    const r = await fetch('/api/fees/day-close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, date: dayCloseDate, actual_cash: actualCash || null }),
    })
    const d = await r.json()
    setDayCloseMsg(r.ok ? '✓ Day closed and locked' : (d.error || 'Failed'))
    setDayCloseSubmitting(false)
    if (r.ok) loadDayClose(dayCloseDate)
  }


  return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-800">Day Close — End of Day Reconciliation</h3>
              <p className="text-xs text-gray-400 mt-0.5">Review the day&apos;s collections and verify cash in hand. Closing locks the day&apos;s record.</p>
            </div>
            <input type="date" value={dayCloseDate} onChange={e => setDayCloseDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white" />
          </div>

          {dayCloseLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
          ) : dayCloseData ? (
            <>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Collections on {fmtDate(dayCloseDate)}</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-semibold">Mode</th>
                      <th className="text-right px-4 py-2 font-semibold">Transactions</th>
                      <th className="text-right px-4 py-2 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['cash','cheque','dd','upi','online'].map(mode => {
                      const m = dayCloseData.by_mode[mode]
                      if (!m) return null
                      return (
                        <tr key={mode} className="border-b border-gray-50">
                          <td className="px-4 py-2.5 capitalize text-gray-700">{mode}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{m.count}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(m.total)}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-2.5 text-gray-700">Total</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{dayCloseData.receipts.count}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{fmt(dayCloseData.receipts.total)}</td>
                    </tr>
                  </tbody>
                </table>
                {dayCloseData.receipts.first && (
                  <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                    Receipts issued: {dayCloseData.receipts.first} → {dayCloseData.receipts.last}
                  </div>
                )}
              </div>

              {/* Transaction list */}
              {dayCloseData.payments.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-700">Transactions ({dayCloseData.payments.length})</p>
                  </div>
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                          <th className="text-left px-4 py-2 font-semibold">Receipt</th>
                          <th className="text-left px-4 py-2 font-semibold">Student</th>
                          <th className="text-left px-4 py-2 font-semibold">Fee Head</th>
                          <th className="text-left px-4 py-2 font-semibold">Mode</th>
                          <th className="text-right px-4 py-2 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayCloseData.payments.map(p => (
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs text-indigo-600">{p.receipt_number}</td>
                            <td className="px-4 py-2 text-gray-700">
                              {p.student_name}
                              <span className="text-gray-400 ml-1 text-xs">{p.grade}{p.section ? `-${p.section}` : ''}</span>
                            </td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{p.fee_head_name} · {p.period_label}</td>
                            <td className="px-4 py-2 capitalize text-gray-500 text-xs">{p.payment_mode}</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-800">{fmt(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Cash verification */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-3">Cash Verification</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div>
                    <p className="text-xs text-gray-400">System says cash collected</p>
                    <p className="text-lg font-bold text-gray-800">{fmt(dayCloseData.by_mode['cash']?.total || 0)}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Actual cash in hand</label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₹</span>
                      <input type="number" min="0" placeholder="0" value={actualCash}
                        onChange={e => setActualCash(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Difference</p>
                    {(() => {
                      const sys = dayCloseData.by_mode['cash']?.total || 0
                      const diff = actualCash !== '' ? parseFloat(actualCash) - sys : null
                      if (diff === null) return <p className="text-lg font-bold text-gray-300">—</p>
                      return <p className={`text-lg font-bold ${diff === 0 ? 'text-green-600' : 'text-red-600'}`}>{diff === 0 ? '✓ Matches' : fmt(diff)}</p>
                    })()}
                  </div>
                </div>
              </div>

              {dayCloseData.already_closed && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                  🔒 This day was already closed. Re-submitting will update the record.
                </div>
              )}
              {dayCloseMsg && (
                <p className={`text-sm font-medium ${dayCloseMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{dayCloseMsg}</p>
              )}
              <div className="flex justify-end gap-2">
                <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=payments&date=${dayCloseDate}`} download
                  className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">Export Day Report</a>
                <button data-testid="btn-submit-dayclose" onClick={submitDayClose} disabled={dayCloseSubmitting || dayCloseData.receipts.count === 0}
                  className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                  {dayCloseSubmitting ? 'Closing…' : dayCloseData.already_closed ? 'Update Day Close' : 'Submit Day Close'}
                </button>
              </div>
            </>
          ) : null}
        </div>
  )
}
