'use client'

import { useCallback, useEffect, useState, Fragment, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { GRADE_SEQUENCE } from '@/lib/grades'
import type {
  CancelCorrectBundle, PassbookData, PassbookReceipt, PassbookSearchResult,
  PassbookTimeline, PassbookYearGroup, PaymentRecord, WaiverCorrectBundle,
} from './types'

const GRADES = GRADE_SEQUENCE
function gradeLabel(g: string): string { return /^\d+$/.test(g) ? `Grade ${g}` : g }

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const STATUS_COLORS: Record<string, string> = {
  paid:     'bg-green-100 text-green-700',
  partial:  'bg-yellow-100 text-yellow-700',
  pending:  'bg-gray-100 text-gray-600',
  overdue:  'bg-red-100 text-red-700',
  waived:   'bg-purple-100 text-purple-700',
  settled:  'bg-teal-100 text-teal-700',
  passout:  'bg-indigo-100 text-indigo-700',
}
function sanitizeMoney(raw: string): string {
  let v = raw.replace(/[^\d.]/g, '')
  const firstDot = v.indexOf('.')
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
    const [int, dec] = v.split('.')
    v = int + '.' + (dec ?? '').slice(0, 2)
  }
  return v
}
function blockNonNumericKeys(e: ReactKeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault()
}

// Student directory + full passbook view: bills (grouped by year), payments
// (with cancel/correct), waivers (with revoke/correct), a complete chronological
// timeline, and a print-receipts list.
//
// pbData/loadPassbook and the cancel/correct + waiver-revoke state all stay
// parent-owned (FeeManagement.tsx) rather than moving here, because the same
// state also backs the Passbook Modal Collect opens via onOpenPassbook — this
// tab and that modal are two views over the same shared "currently loaded
// passbook" state, not independent copies. The passbook prop bundle mirrors
// exactly what the parent already computes for the modal's own render.
export default function FeePassbookTab({
  schoolId,
  academicYear,
  isActive,
  passbook,
  onLoad,
  onClose,
  onPrintReceipt,
  onPrintStatement,
  cancelCorrect,
  waiverCorrect,
}: {
  schoolId: number
  academicYear: string
  isActive: boolean
  passbook: {
    data: PassbookData | null
    loading: boolean
    err: string
    section: 'timeline' | 'bills' | 'payments' | 'waivers' | 'receipts'
    setSection: (s: 'timeline' | 'bills' | 'payments' | 'waivers' | 'receipts') => void
    summary: { total_billed: number; total_paid: number; total_waived: number; discretionary_waived: number; outstanding: number }
    yearOnly: PassbookYearGroup[]
    payments: PaymentRecord[]
    receipts: PassbookReceipt[]
    waivers: PassbookData['waivers']
    timeline: PassbookTimeline[]
  }
  onLoad: (studentId: number) => void
  onClose: () => void
  onPrintReceipt: (receiptNumber: string) => void
  onPrintStatement: () => void
  cancelCorrect: CancelCorrectBundle
  waiverCorrect: WaiverCorrectBundle
}) {
  const { data: pbData, loading: pbLoading, err: pbErr, section: pbSection, setSection: setPbSection,
    summary: pbSummary, yearOnly: pbYearOnly, payments: pbPayments, receipts: pbReceipts,
    waivers: pbWaivers, timeline: pbTimeline } = passbook

  // Full student directory (browse + filter) — exclusive to this tab, the modal
  // always already knows which student it's showing.
  const [pbSearch, setPbSearch]           = useState('')
  const [pbAllStudents, setPbAllStudents] = useState<PassbookSearchResult[]>([])
  const [pbAllLoading, setPbAllLoading]   = useState(false)
  const [pbGrade, setPbGrade]             = useState('')

  const loadPbAllStudents = useCallback(async () => {
    setPbAllLoading(true)
    try {
      const r = await fetch(`/api/students?school_id=${schoolId}`)
      if (r.ok) {
        const data = await r.json()
        const arr = Array.isArray(data) ? data : (data.students || [])
        setPbAllStudents(arr.map((s: { id: number; name: string; roll_number: string; grade: string; section: string; status: string }) => ({
          id: s.id, name: s.name, roll_number: s.roll_number, grade: s.grade, section: s.section, status: s.status || 'active',
        })))
      }
    } catch { /* silent */ }
    setPbAllLoading(false)
  }, [schoolId])

  // Retries on every tab revisit (not just mount) if the initial fetch left the
  // directory empty — e.g. a silently-swallowed network failure.
  useEffect(() => {
    if (isActive && pbAllStudents.length === 0) loadPbAllStudents()
  }, [isActive, pbAllStudents.length, loadPbAllStudents])

  // Revoked waivers — fetched lazily on first "Show Revoked" click, exclusive to this tab
  const [pbShowRevoked, setPbShowRevoked]       = useState(false)
  const [pbRevokedWaivers, setPbRevokedWaivers] = useState<PassbookData['waivers']>([])

  return (
    <div className="space-y-4">
      {/* Directory: grade dropdown + search + list (hidden once a passbook is open) */}
      {!pbData && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Student Directory</label>
              <p className="text-xs text-gray-400">Pick a class, or search by name / roll number, then click a student to open their passbook.</p>
            </div>
            <button onClick={loadPbAllStudents} className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">Refresh</button>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <select value={pbGrade} onChange={e => setPbGrade(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">All Grades</option>
              {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
            </select>
            <input type="text" placeholder="Search name or roll number…" value={pbSearch}
              onChange={e => setPbSearch(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {pbAllLoading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading students…</p>
          ) : (() => {
            const q = pbSearch.trim().toLowerCase()
            const list = pbAllStudents.filter(s =>
              (!pbGrade || String(s.grade) === pbGrade) &&
              (!q || s.name.toLowerCase().includes(q) || (s.roll_number || '').toLowerCase().includes(q))
            )
            if (pbAllStudents.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">No students found for this school.</p>
            if (list.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">No students match your filter.</p>
            return (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">{list.length} student{list.length !== 1 ? 's' : ''}</div>
                <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                  {list.map(s => (
                    <button key={s.id} data-testid={`student-row-${s.id}`} onClick={() => onLoad(s.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between group">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{s.name}</span>
                        {s.status === 'inactive' && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Inactive</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">Gr.{s.grade}{s.section} · #{s.roll_number}</span>
                        <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100">Open →</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {pbErr && !pbData && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{pbErr}</div>
      )}

      {pbLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading passbook…</div>
      ) : pbData ? (
        <>
          <button data-testid="btn-passbook-back" onClick={onClose}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">← Back to student list</button>

          {/* Header card */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{pbData.student.name}</h3>
                <p className="text-sm text-gray-500">Grade {pbData.student.grade}{pbData.student.section} · Roll #{pbData.student.roll_number}</p>
                {(pbData.student.parent_name || pbData.student.parent_phone) && (
                  <p className="text-xs text-gray-400 mt-1">
                    Parent: {pbData.student.parent_name || '—'}{pbData.student.parent_phone ? ` · 📞 ${pbData.student.parent_phone}` : ''}
                  </p>
                )}
              </div>
              <button onClick={onPrintStatement}
                className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">🖨 Print Statement</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                { l: 'Total Billed', v: pbSummary.total_billed, c: 'text-gray-900' },
                { l: 'Paid',         v: pbSummary.total_paid,    c: 'text-green-700' },
                { l: 'Waived',       v: pbSummary.discretionary_waived,  c: 'text-purple-700' },
                { l: 'Outstanding',  v: pbSummary.outstanding,   c: 'text-red-600' },
              ].map(s => (
                <div key={s.l} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-xs text-gray-400">{s.l}</p>
                  <p className={`text-lg font-bold mt-0.5 ${s.c}`}>{fmt(s.v)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section switcher */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {([
              { key: 'bills',    label: `Bills (${pbYearOnly.reduce((s, y) => s + y.entries.length, 0)})` },
              { key: 'payments', label: `Payments (${pbPayments.length})` },
              { key: 'waivers',  label: `Waivers (${pbWaivers.length})` },
              { key: 'timeline', label: 'Full Timeline' },
              { key: 'receipts', label: `Print Receipts (${pbReceipts.length})` },
            ] as const).map(v => (
              <button key={v.key} data-testid={`tab-passbook-${v.key}`} onClick={() => setPbSection(v.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  pbSection === v.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>{v.label}</button>
            ))}
          </div>

          {/* Bills — grouped by academic year */}
          {pbSection === 'bills' && (
            <div className="space-y-3">
              {/* Prior year unresolved dues banner */}
              {pbData.prior_unresolved.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-700">Prior Year Dues Unresolved</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {pbData.prior_unresolved.map(y => `${y.academic_year}: ${fmt(y.outstanding)} outstanding`).join(' · ')}
                      {' '}— Go to Year-End tab to carry forward or write off.
                    </p>
                  </div>
                </div>
              )}

              {pbYearOnly.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">No bills recorded for {academicYear}.</div>
              ) : pbYearOnly.map(yearGroup => (
                <div key={yearGroup.academic_year} className={`bg-white rounded-xl border overflow-hidden ${yearGroup.is_current ? 'border-blue-200' : 'border-gray-100'}`}>
                  {/* Year header */}
                  <div className={`px-4 py-2.5 flex items-center justify-between ${yearGroup.is_current ? 'bg-blue-50 border-b border-blue-100' : 'bg-gray-50 border-b border-gray-100'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${yearGroup.is_current ? 'text-blue-700' : 'text-gray-600'}`}>
                        {yearGroup.academic_year}
                      </span>
                      {yearGroup.is_current && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">Current Year</span>
                      )}
                      {!yearGroup.is_current && yearGroup.outstanding > 0 && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Unresolved</span>
                      )}
                      {!yearGroup.is_current && yearGroup.outstanding <= 0 && (
                        <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">Closed</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Billed <span className="font-semibold text-gray-700">{fmt(yearGroup.total_billed)}</span></span>
                      <span>Paid <span className="font-semibold text-green-700">{fmt(yearGroup.total_paid)}</span></span>
                      {(yearGroup.discretionary_waived ?? yearGroup.total_waived) > 0 && <span>Waived <span className="font-semibold text-purple-700">{fmt(yearGroup.discretionary_waived ?? yearGroup.total_waived)}</span></span>}
                      <span>Outstanding <span className={`font-bold ${yearGroup.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(yearGroup.outstanding)}</span></span>
                    </div>
                  </div>
                  {/* Entries table */}
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-50">
                        <th className="text-left px-4 py-2 font-medium">Fee Head · Period</th>
                        <th className="text-right px-4 py-2 font-medium">Billed</th>
                        <th className="text-right px-4 py-2 font-medium">Paid</th>
                        <th className="text-right px-4 py-2 font-medium">Waived</th>
                        <th className="text-right px-4 py-2 font-medium">Balance</th>
                        <th className="text-left px-4 py-2 font-medium">Due Date</th>
                        <th className="text-left px-4 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearGroup.entries.map(e => (
                        <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-700">
                            {e.category_name} · <span className="text-gray-400">{e.period_label}</span>
                            {e.source_academic_year && (
                              <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium" title={`Carried from ${e.source_academic_year}`}>↩ {e.source_academic_year}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{fmt(e.amount_due)}</td>
                          <td className="px-4 py-2.5 text-right text-green-600">{fmt(e.amount_paid)}</td>
                          <td className="px-4 py-2.5 text-right text-purple-600">{Number(e.waiver_amount) > 0 ? fmt(e.waiver_amount) : '—'}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-red-600">{Number(e.balance) > 0 ? fmt(e.balance) : <span className="text-green-600">{fmt(0)}</span>}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{e.due_date}</td>
                          <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[e.status]}`}>{e.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payments */}
          {pbSection === 'payments' && (
            <div className="space-y-3">
              {pbData.pending_payments.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-yellow-100"><p className="text-xs font-semibold text-yellow-700 uppercase">Pending / Rejected</p></div>
                  <div className="divide-y divide-yellow-100">
                    {pbData.pending_payments.map(p => (
                      <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700 font-mono">{p.receipt_number}</p>
                          <p className="text-xs text-gray-400">{p.paid_date} · {p.payment_mode.toUpperCase()}{p.rejection_reason ? ` · Rejected: ${p.rejection_reason}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-700">{fmt(p.amount)}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.payment_status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                            {p.payment_status === 'rejected' ? 'Rejected' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {pbPayments.length === 0 ? (
                  <p className="text-sm text-gray-400 p-8 text-center">No payments recorded for {academicYear}.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-semibold">Receipt</th>
                        <th className="text-left px-4 py-2 font-semibold">Date</th>
                        <th className="text-right px-4 py-2 font-semibold">Amount</th>
                        <th className="text-left px-4 py-2 font-semibold">Mode</th>
                        <th className="text-left px-4 py-2 font-semibold">Collected By</th>
                        <th className="text-right px-4 py-2 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pbPayments.map(p => {
                        const isCancelled = p.payment_status === 'cancelled'
                        return (
                        <Fragment key={p.id}>
                          <tr className={`border-b border-gray-50 ${isCancelled ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                            <td className={`px-4 py-2.5 font-mono text-xs ${isCancelled ? 'text-gray-400 line-through' : 'text-indigo-600'}`}>{p.receipt_number}</td>
                            <td className="px-4 py-2.5 text-gray-600">{fmtDate(p.paid_date)}</td>
                            <td className={`px-4 py-2.5 text-right font-bold ${isCancelled ? 'text-gray-400 line-through' : 'text-green-700'}`}>{fmt(p.amount)}</td>
                            <td className="px-4 py-2.5 uppercase text-gray-500 text-xs">{p.payment_mode}</td>
                            <td className="px-4 py-2.5 text-gray-500">{p.collected_by_name || '—'}</td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isCancelled ? (
                                  <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">Cancelled</span>
                                ) : cancelCorrect.pmtId === p.id ? (
                                  <button data-testid={`btn-passbook-payment-close-${p.id}`} onClick={() => cancelCorrect.setPmtId(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                                ) : (
                                  <button data-testid={`btn-passbook-payment-cancel-correct-${p.id}`} onClick={() => {
                                    const le = pbData?.ledger.find(e => e.id === p.ledger_id)
                                    cancelCorrect.open(p.id, Number(p.amount), le ? Number(le.balance) : 0)
                                  }} className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Cancel / Correct</button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {cancelCorrect.pmtId === p.id && (
                            <tr className="bg-amber-50 border-b border-amber-100">
                              <td colSpan={6} className="px-4 py-3">
                                <div className="space-y-3">
                                  <div className="flex gap-2">
                                    <button data-testid={`btn-payment-mode-cancel-${p.id}`} onClick={() => cancelCorrect.setMode('cancel')}
                                      className={`text-xs px-3 py-1.5 rounded-lg font-medium ${cancelCorrect.mode === 'cancel' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Cancel Payment</button>
                                    <button data-testid={`btn-payment-mode-correct-${p.id}`} onClick={() => { cancelCorrect.setMode('correct'); cancelCorrect.setAmount(String(p.amount)) }}
                                      className={`text-xs px-3 py-1.5 rounded-lg font-medium ${cancelCorrect.mode === 'correct' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Correct Amount</button>
                                  </div>

                                  {/* Consequence preview */}
                                  <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                    {cancelCorrect.mode === 'cancel' ? (
                                      <>⚠ This will reverse <strong>{fmt(p.amount)}</strong> from the student&apos;s ledger. The bill balance will increase by {fmt(p.amount)} and its status may revert to pending/overdue. Receipt {p.receipt_number} stays on record marked cancelled.</>
                                    ) : (
                                      <>⚠ This cancels receipt {p.receipt_number} ({fmt(p.amount)}) and records a fresh payment of <strong>{cancelCorrect.amount ? fmt(parseFloat(cancelCorrect.amount) || 0) : '₹0'}</strong> with a new receipt number. Net ledger change: {fmt((parseFloat(cancelCorrect.amount) || 0) - Number(p.amount))}.</>
                                    )}
                                  </div>

                                  {cancelCorrect.mode === 'correct' && (
                                    <div>
                                      <label className="text-xs font-medium text-gray-600">
                                        Corrected amount (₹){cancelCorrect.maxCorrect !== null && <span className="ml-1 text-gray-400 font-normal">— max ₹{cancelCorrect.maxCorrect.toFixed(2)}</span>}
                                      </label>
                                      <input data-testid={`input-payment-correct-amount-${p.id}`} type="number" min="0" inputMode="decimal" value={cancelCorrect.amount}
                                        onKeyDown={blockNonNumericKeys}
                                        onChange={e => cancelCorrect.setAmount(sanitizeMoney(e.target.value))}
                                        className={`mt-1 w-40 border rounded-lg px-3 py-1.5 text-sm ${cancelCorrect.maxCorrect !== null && parseFloat(cancelCorrect.amount) > cancelCorrect.maxCorrect + 0.01 ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                                      {cancelCorrect.maxCorrect !== null && parseFloat(cancelCorrect.amount) > cancelCorrect.maxCorrect + 0.01 && (
                                        <p className="text-xs text-red-600 mt-1">Exceeds maximum of ₹{cancelCorrect.maxCorrect.toFixed(2)}</p>
                                      )}
                                    </div>
                                  )}
                                  <div>
                                    <label className="text-xs font-medium text-gray-600">Reason (required — recorded in audit log)</label>
                                    <input data-testid={`input-payment-reason-${p.id}`} type="text" placeholder="e.g. Wrong amount entered · Cheque bounced · Duplicate entry"
                                      value={cancelCorrect.reason} onChange={e => cancelCorrect.setReason(e.target.value)}
                                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                  </div>
                                  {cancelCorrect.msg && <p className={`text-xs ${cancelCorrect.msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cancelCorrect.msg}</p>}
                                  <div className="flex gap-2">
                                    <button data-testid={`btn-payment-confirm-${p.id}`} onClick={() => cancelCorrect.submit('passbook')} disabled={cancelCorrect.busy || !cancelCorrect.reason.trim()}
                                      className={`text-sm text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${cancelCorrect.mode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                      {cancelCorrect.busy ? 'Working…' : cancelCorrect.mode === 'cancel' ? `Confirm Cancel (${fmt(p.amount)})` : 'Confirm Correction'}
                                    </button>
                                    <button data-testid={`btn-payment-cancel-form-${p.id}`} onClick={() => cancelCorrect.setPmtId(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ) })}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Print Receipts — one row per actual receipt_number, reprinting the
              complete original receipt (all fee lines that were part of that
              transaction), not just whichever single line was clicked. */}
          {pbSection === 'receipts' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {pbReceipts.length === 0 ? (
                <p className="text-sm text-gray-400 p-8 text-center">No receipts for {academicYear}.</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-semibold">Receipt</th>
                      <th className="text-left px-4 py-2 font-semibold">Date</th>
                      <th className="text-left px-4 py-2 font-semibold">Fee Lines</th>
                      <th className="text-right px-4 py-2 font-semibold">Total</th>
                      <th className="text-right px-4 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pbReceipts.map(r => (
                      <tr key={r.receipt_number} className={`border-b border-gray-50 ${r.cancelled ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                        <td className={`px-4 py-2.5 font-mono text-xs ${r.cancelled ? 'text-gray-400 line-through' : 'text-indigo-600'}`}>{r.receipt_number}</td>
                        <td className="px-4 py-2.5 text-gray-600">{fmtDate(r.paid_date)}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.lineCount} {r.lineCount === 1 ? 'item' : 'items'}</td>
                        <td className={`px-4 py-2.5 text-right font-bold ${r.cancelled ? 'text-gray-400 line-through' : 'text-green-700'}`}>{fmt(r.total)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {r.cancelled ? (
                            <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">Cancelled</span>
                          ) : (
                            <button onClick={() => onPrintReceipt(r.receipt_number)} title="Print full receipt"
                              className="text-xs border border-indigo-200 text-indigo-600 px-2.5 py-1 rounded-lg hover:bg-indigo-50">🖨 Print</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}

          {/* Waivers */}
          {pbSection === 'waivers' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Waivers — {academicYear}</p>
                <button onClick={async () => {
                  if (!pbShowRevoked && pbData && pbRevokedWaivers.length === 0) {
                    const r = await fetch(`/api/fees/waivers?school_id=${schoolId}&student_id=${pbData.student.id}&show_revoked=1`)
                    if (r.ok) setPbRevokedWaivers((await r.json()).filter((w: PassbookData['waivers'][0]) => w.is_revoked))
                  }
                  setPbShowRevoked(v => !v)
                }}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${pbShowRevoked ? 'bg-red-50 text-red-600 border-red-200' : 'text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
                  {pbShowRevoked ? 'Hide Revoked' : 'Show Revoked'}
                </button>
              </div>
              {(() => {
                const activeWaivers = pbWaivers
                const allWaivers = pbShowRevoked
                  ? [...activeWaivers, ...pbRevokedWaivers.filter(r => r.bill_year === academicYear)].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  : activeWaivers
                return allWaivers.length === 0 ? (
                <p className="text-sm text-gray-400 p-8 text-center">No waivers granted for {academicYear}.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {allWaivers.map(w => (
                    <div key={w.id} className={`px-4 py-3 ${w.is_revoked ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${w.is_revoked ? 'line-through text-gray-400' : 'text-gray-800'}`}>{w.fee_head_name} · {w.period_label}</p>
                            {w.is_revoked && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Revoked</span>}
                          </div>
                          <p className="text-xs text-gray-400">{w.reason}{w.granted_by_name ? ` · by ${w.granted_by_name}` : ''} · {fmtDate(w.created_at)}</p>
                          {w.is_revoked && w.revoke_reason && (
                            <p className="text-xs text-red-400 mt-0.5">Revoke reason: {w.revoke_reason}{w.revoked_by ? ` · by ${w.revoked_by}` : ''}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-sm font-bold ${w.is_revoked ? 'text-gray-300 line-through' : 'text-purple-700'}`}>−{fmt(w.waiver_amount)}</p>
                            <p className="text-[10px] text-purple-400 capitalize">{w.waiver_type.replace('_', ' ')}</p>
                          </div>
                          {!w.is_revoked && (waiverCorrect.waiverId === w.id
                            ? <button data-testid={`btn-waiver-close-${w.id}`} onClick={() => { waiverCorrect.setWaiverId(null); waiverCorrect.setMsg('') }} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                            : <button data-testid={`btn-waiver-revoke-correct-${w.id}`} onClick={() => waiverCorrect.open(w)}
                                className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Revoke / Correct</button>
                          )}
                        </div>
                      </div>
                      {!w.is_revoked && waiverCorrect.waiverId === w.id && (
                        <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50 -mx-4 -mb-3 px-4 pb-3 rounded-b-xl space-y-2">
                          <div className="flex gap-2">
                            <button data-testid={`btn-waiver-mode-revoke-${w.id}`} onClick={() => waiverCorrect.setMode('revoke')}
                              className={`flex-1 text-xs py-1.5 rounded-lg border font-medium ${waiverCorrect.mode === 'revoke' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}>Revoke Waiver</button>
                            <button data-testid={`btn-waiver-mode-correct-${w.id}`} onClick={() => waiverCorrect.setMode('correct')}
                              className={`flex-1 text-xs py-1.5 rounded-lg border font-medium ${waiverCorrect.mode === 'correct' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>Correct Amount</button>
                          </div>
                          <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                            {waiverCorrect.mode === 'revoke'
                              ? <>Revokes waiver of <strong>{fmt(w.waiver_amount)}</strong>. Balance will increase accordingly.</>
                              : <>Revokes current waiver and records a new one with the corrected amount.</>}
                          </div>
                          {waiverCorrect.mode === 'correct' && (
                            <div>
                              <input data-testid={`input-waiver-correct-amount-${w.id}`} type="number" min="0" value={waiverCorrect.amount} onChange={e => waiverCorrect.setAmount(e.target.value)}
                                placeholder={waiverCorrect.maxCorrect !== null ? `max ₹${waiverCorrect.maxCorrect.toFixed(2)}` : 'Corrected waiver amount (₹)'}
                                className={`w-full border rounded-lg px-3 py-1.5 text-sm ${waiverCorrect.maxCorrect !== null && parseFloat(waiverCorrect.amount) > waiverCorrect.maxCorrect + 0.01 ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                              {waiverCorrect.maxCorrect !== null && parseFloat(waiverCorrect.amount) > waiverCorrect.maxCorrect + 0.01 && (
                                <p className="text-xs text-red-600 mt-1">Exceeds max of ₹{waiverCorrect.maxCorrect.toFixed(2)}</p>
                              )}
                            </div>
                          )}
                          <input data-testid={`input-waiver-reason-${w.id}`} type="text" value={waiverCorrect.reason} onChange={e => waiverCorrect.setReason(e.target.value)}
                            placeholder="Reason (required)" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                          {waiverCorrect.msg && <p className={`text-xs font-medium ${waiverCorrect.msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{waiverCorrect.msg}</p>}
                          <div className="flex gap-2">
                            <button data-testid={`btn-waiver-confirm-${w.id}`} onClick={waiverCorrect.submit} disabled={waiverCorrect.busy || !waiverCorrect.reason.trim()}
                              className={`text-sm text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${waiverCorrect.mode === 'revoke' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                              {waiverCorrect.busy ? 'Working…' : waiverCorrect.mode === 'revoke' ? 'Confirm Revoke' : 'Confirm Correction'}
                            </button>
                            <button data-testid={`btn-waiver-close-form-${w.id}`} onClick={() => waiverCorrect.setWaiverId(null)} className="text-sm text-gray-500 px-3 py-1.5">Close</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
              })()}
            </div>
          )}

          {/* Timeline (bank passbook) */}
          {pbSection === 'timeline' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Complete Financial Timeline</p>
                <p className="text-xs text-gray-400">Every charge, payment, waiver and revision — chronological with running balance.</p>
              </div>
              {pbTimeline.length === 0 ? (
                <p className="text-sm text-gray-400 p-8 text-center">No activity for {academicYear}.</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-semibold">Date</th>
                      <th className="text-left px-4 py-2 font-semibold">Description</th>
                      <th className="text-right px-4 py-2 font-semibold">Charge</th>
                      <th className="text-right px-4 py-2 font-semibold">Paid/Waived</th>
                      <th className="text-right px-4 py-2 font-semibold">Balance</th>
                      <th className="text-left px-4 py-2 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pbTimeline.map((t, i) => {
                      const icon = t.type === 'bill' ? '📌' : t.type === 'payment' ? '💸' : t.type === 'waiver' ? '🎁' : '✏️'
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(t.date)}</td>
                          <td className="px-4 py-2.5 text-gray-700">
                            <span className="mr-1.5">{icon}</span>{t.description}
                            {t.reference && <span className="text-xs text-indigo-500 ml-1 font-mono">({t.reference})</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-500">{t.debit > 0 ? fmt(t.debit) : ''}</td>
                          <td className="px-4 py-2.5 text-right text-green-600">{t.credit > 0 ? fmt(t.credit) : ''}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{fmt(t.balance)}</td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{t.by}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
