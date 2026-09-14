'use client'

import { useCallback, useEffect, useMemo, useState, Fragment, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { GRADE_SEQUENCE } from '@/lib/grades'
import type { CancelCorrectBundle, LedgerEntry, PaySuccess, PendingPayment, ReceiptHeaderBlock, StudentRow } from './types'
import { printDualCopyReceipt } from './receipts'
import { useFeeStore } from '@/lib/stores/feeStore'
import { LoadErrorBanner } from './LoadErrorBanner'

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

// Keeps only digits and a single decimal point (max 2 dp) — type="number" alone
// allows "e", "+", "-" and pasted text; this closes those gaps.
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

// Fee collection: the Daily Counter (search/filter students, collect a payment,
// grant a waiver, cancel/correct a past payment), Online Payments verification,
// Pending Payments (defaulters), and Day Close reconciliation.
//
// Payment cancel/correct is shared with the Student Passbook tab (not yet
// extracted) — that state and its submit function stay in the parent and come
// in via the cancelCorrect prop, same as Passbook's own payment history view.
// Opening a student's full passbook from here goes back up via onOpenPassbook
// for the same reason.
//
// pendingCollectRequest (shared store): Leavers and Overview's passout panel
// need to open a specific — possibly synthesized, not part of this tab's own
// derived studentRows — student's collect form. They can't reach into this
// tab's state directly anymore, so they hand off the row via the store and an
// effect here picks it up.
export default function FeeCollectTab({
  schoolId,
  academicYear,
  adminName,
  branding,
  hasOnlinePayments,
  isActive,
  onStatsChanged,
  onPassoutChanged,
  onOpenPassbook,
  cancelCorrect,
}: {
  schoolId: number
  academicYear: string
  adminName?: string
  branding: { school_name: string; logo_url: string | null; logo_align: 'left' | 'center' | 'right'; receipt_header_blocks: ReceiptHeaderBlock[] }
  hasOnlinePayments: boolean
  // Whether this tab is the one currently visible (vs. mounted-but-hidden) — used
  // only to re-poll pendingPayments on every revisit, since online payments arrive
  // from parents independent of any admin action here and so have no store bump
  // to hang a refresh on, unlike ledger/reports/year-end.
  isActive: boolean
  onStatsChanged: () => void
  onPassoutChanged: () => void
  onOpenPassbook: (studentId: number) => void
  cancelCorrect: CancelCorrectBundle
}) {
  const ledgerVersion = useFeeStore(s => s.ledgerVersion)
  const pendingPayments = useFeeStore(s => s.pendingPayments)
  const setPendingPayments = useFeeStore(s => s.setPendingPayments)
  const pendingCollectRequest = useFeeStore(s => s.pendingCollectRequest)
  const clearCollectRequest = useFeeStore(s => s.clearCollectRequest)
  const requestedCollectionView = useFeeStore(s => s.requestedCollectionView)
  const clearCollectionViewRequest = useFeeStore(s => s.clearCollectionViewRequest)
  const bumpReports = useFeeStore(s => s.bumpReports)
  const bumpYearEnd = useFeeStore(s => s.bumpYearEnd)

  // ── Ledger ──
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState('')
  const [ledgerGrade, setLedgerGrade] = useState('')
  const [ledgerStatus, setLedgerStatus] = useState('')
  const [ledgerSearch, setLedgerSearch] = useState('')
  // Separate from ledgerSearch/ledgerGrade (Daily Counter) — Pending Payments is
  // already implicitly filtered to outstanding > 0, so it gets its own filter
  // state rather than sharing the Counter's, which also carries a status filter
  // that doesn't apply here.
  const [pendingSearch, setPendingSearch] = useState('')
  const [pendingGrade, setPendingGrade] = useState('')

  const loadLedger = useCallback(async () => {
    if (!academicYear) return
    setLedgerLoading(true)
    try {
      // Never pass ledgerStatus to API — always load all entries and filter client-side
      // so chip counts stay accurate regardless of which status filter is active
      const params = new URLSearchParams({ school_id: String(schoolId), academic_year: academicYear })
      if (ledgerGrade) params.set('grade', ledgerGrade)
      const r = await fetch(`/api/fees/ledger?${params}`)
      if (r.ok) { setLedgerError(''); setLedger(await r.json()) }
      else setLedgerError('Could not load ledger — try refreshing')
    } catch { setLedgerError('Network error — ledger could not be loaded') }
    finally { setLedgerLoading(false) }
  }, [schoolId, academicYear, ledgerGrade])

  useEffect(() => { loadLedger() }, [loadLedger, ledgerVersion])

  // ── Collect (counter) ──
  const [collectLoading, setCollectLoading] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('cash')
  const [payRef, setPayRef] = useState('')
  const [payCollectedBy, setPayCollectedBy] = useState(adminName || '')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState('')
  const [paySuccess, setPaySuccess] = useState<PaySuccess | null>(null)
  const [showWaiver, setShowWaiver] = useState(false)
  const [waiverForm, setWaiverForm] = useState({ waiver_type: 'percentage', waiver_value: '', reason: '', granted_by_name: adminName || '' })
  const [waiverLoading, setWaiverLoading] = useState(false)
  const [waiverError, setWaiverError] = useState('')
  const [showPayConfirm, setShowPayConfirm] = useState(false)

  type CollectionView = 'counter' | 'online' | 'defaulters' | 'dayclose'
  const [collectionView, setCollectionView] = useState<CollectionView>('counter')
  const [openStudentId, setOpenStudentId] = useState<number | null>(null)
  const [collectChecked, setCollectChecked] = useState<Set<number>>(new Set())
  const [showCollectForm, setShowCollectForm] = useState(false)
  const [counterPayments, setCounterPayments] = useState<import('./types').PaymentRecord[]>([])
  const [counterPmtLoading, setCounterPmtLoading] = useState(false)
  const [counterPmtError, setCounterPmtError] = useState('')
  const [showCounterHistory, setShowCounterHistory] = useState(false)
  // Synthesized StudentRow for a student handed off via pendingCollectRequest
  // (passout / removed students — not part of this tab's own derived rows)
  const [passoutOpenStudent, setPassoutOpenStudent] = useState<StudentRow | null>(null)

  // Pick up a hand-off from Leavers / Overview's passout panel
  useEffect(() => {
    if (!pendingCollectRequest) return
    const row = pendingCollectRequest
    setCollectionView('counter')
    setOpenStudentId(row.student_id)
    setCollectChecked(new Set(row.open_entries.map(e => e.id)))
    const fullTotal = row.open_entries.reduce((s, e) => s + Number(e.balance), 0)
    setPayAmount(fullTotal > 0 ? String(fullTotal) : '')
    setPayMode('cash'); setPayRef(''); setPayNotes(''); setPayDate(new Date().toISOString().slice(0, 10))
    setPayError(''); setPaySuccess(null); setShowCollectForm(true)
    setPassoutOpenStudent(row)
    clearCollectRequest()
  }, [pendingCollectRequest, clearCollectRequest])

  // Pick up a hand-off from Archive's "View Ledger" or Overview's online-payment alert
  useEffect(() => {
    if (!requestedCollectionView) return
    setCollectionView(requestedCollectionView)
    clearCollectionViewRequest()
  }, [requestedCollectionView, clearCollectionViewRequest])

  // A student expanded in one academic year's ledger shouldn't stay "open" once
  // the ledger reloads for a different year (the parent's year selector used to
  // reset this directly when this state lived there).
  useEffect(() => {
    setOpenStudentId(null); setShowCollectForm(false); setPassoutOpenStudent(null)
  }, [academicYear])

  // ── Pending verifications ──
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [verifyingId, setVerifyingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState<number | null>(null)
  const [verifyMsg, setVerifyMsg] = useState('')

  const loadPending = useCallback(async () => {
    setPendingLoading(true); setPendingError('')
    try {
      const r = await fetch(`/api/fees/payments/verify?school_id=${schoolId}`)
      if (r.ok) setPendingPayments(await r.json() as PendingPayment[])
      else setPendingError('Could not load pending verifications — try refreshing')
    } catch { setPendingError('Network error — pending verifications could not be loaded') }
    setPendingLoading(false)
  }, [schoolId, setPendingPayments])

  // Re-poll on every tab revisit, not just mount — a parent's online payment can
  // arrive at any time with no admin-side action to bump a store version for.
  useEffect(() => { if (isActive) loadPending() }, [isActive, loadPending])

  async function verifyPayment(paymentId: number, action: 'approve' | 'reject') {
    setVerifyingId(paymentId); setVerifyMsg('')
    const r = await fetch('/api/fees/payments/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_id: paymentId, action, verified_by: adminName || 'Admin',
        rejection_reason: action === 'reject' ? rejectReason : undefined,
      }),
    })
    if (r.ok) {
      setVerifyMsg(action === 'approve' ? '✓ Payment approved and ledger updated' : '✓ Payment rejected')
      setShowRejectForm(null); setRejectReason('')
      loadPending(); onStatsChanged(); loadLedger()
      bumpReports(); bumpYearEnd()
    } else {
      const d = await r.json()
      setVerifyMsg(d.error || 'Failed')
    }
    setVerifyingId(null)
  }

  // ── Group ledger entries by student → one row per student with totals ──
  // Memoized: without it this re-ran on every render — including every keystroke
  // in the search box — for a dataset that scales with the school's fee history.
  const studentRows: StudentRow[] = useMemo(() => {
    const map = new Map<number, StudentRow>()
    for (const e of ledger) {
      let row = map.get(e.student_id)
      if (!row) {
        row = {
          student_id: e.student_id, student_name: e.student_name, roll_number: e.roll_number,
          school_roll_number: e.school_roll_number ?? null,
          grade: e.grade, section: e.section,
          email: e.email ?? null, phone: e.phone ?? null,
          parent_name: e.parent_name ?? null, parent_phone: e.parent_phone ?? null, parent_email: e.parent_email ?? null,
          student_status: e.student_status ?? 'active',
          total_billed: 0, total_paid: 0, outstanding: 0,
          open_entries: [], all_entries: [], has_overdue: false, never_paid: true,
        }
        map.set(e.student_id, row)
      }
      row.total_billed += Number(e.amount_due)
      row.total_paid += Number(e.amount_paid) + Number(e.waiver_amount ?? 0)
      row.outstanding += Number(e.balance)
      row.all_entries.push(e)
      if (['pending', 'partial', 'overdue'].includes(e.status)) row.open_entries.push(e)
      if (e.status === 'overdue') row.has_overdue = true
      if (Number(e.amount_paid) > 0 || Number(e.waiver_amount ?? 0) > 0) row.never_paid = false
    }
    // Students who've left/graduated stay in the ledger data (their history must be
    // preserved), but the active-roster Collect view should only show currently
    // enrolled students — they're surfaced separately via Leavers & Dues / Passout.
    return Array.from(map.values()).filter(r => r.student_status === 'active')
  }, [ledger])

  const gradeFilteredRows = useMemo(
    () => ledgerGrade ? studentRows.filter(r => r.grade === ledgerGrade) : studentRows,
    [studentRows, ledgerGrade]
  )

  const statusCounts = useMemo(() => ({
    all: gradeFilteredRows.length,
    overdue: gradeFilteredRows.filter(r => r.has_overdue && r.outstanding > 0).length,
    partial: gradeFilteredRows.filter(r => r.total_paid > 0 && r.outstanding > 0).length,
    never: gradeFilteredRows.filter(r => r.never_paid && r.outstanding > 0).length,
    clear: gradeFilteredRows.filter(r => r.outstanding <= 0).length,
  }), [gradeFilteredRows])

  const collectionFiltered = useMemo(() => studentRows.filter(r => {
    if (ledgerGrade && r.grade !== ledgerGrade) return false
    if (ledgerSearch) {
      const q = ledgerSearch.trim().toLowerCase()
      const matches = [
        r.student_name, r.roll_number,
        r.school_roll_number != null ? String(r.school_roll_number) : '',
        r.grade, r.section, r.email, r.phone,
        r.parent_name, r.parent_phone, r.parent_email,
      ].some(v => (v || '').toLowerCase().includes(q))
      if (!matches) return false
    }
    if (ledgerStatus === 'overdue') return r.has_overdue && r.outstanding > 0
    if (ledgerStatus === 'partial') return r.total_paid > 0 && r.outstanding > 0
    if (ledgerStatus === 'never') return r.never_paid && r.outstanding > 0
    if (ledgerStatus === 'clear') return r.outstanding <= 0
    return true
  }), [studentRows, ledgerGrade, ledgerSearch, ledgerStatus])

  const openStudent = collectionFiltered.find(r => r.student_id === openStudentId)
    || studentRows.find(r => r.student_id === openStudentId)
    || (passoutOpenStudent?.student_id === openStudentId ? passoutOpenStudent : undefined)

  const checkedTotal = openStudent
    ? openStudent.open_entries.filter(e => collectChecked.has(e.id)).reduce((s, e) => s + Number(e.balance), 0)
    : 0

  function toggleStudent(id: number) {
    if (openStudentId === id) {
      setOpenStudentId(null); setShowCollectForm(false); setShowCounterHistory(false); setPassoutOpenStudent(null)
      setTimeout(() => {
        document.getElementById(`student-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 50)
      return
    }
    setOpenStudentId(id); setShowCollectForm(false)
    setShowCounterHistory(false); setCounterPayments([])
    cancelCorrect.setPmtId(null)
    setTimeout(() => {
      document.getElementById(`student-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const loadCounterPayments = useCallback(async (studentId: number) => {
    setShowCounterHistory(true); setCounterPmtLoading(true); setCounterPmtError('')
    try {
      const r = await fetch(`/api/fees/payments?school_id=${schoolId}&student_id=${studentId}`)
      if (r.ok) setCounterPayments(await r.json())
      else setCounterPmtError('Could not load payment history')
    } catch { setCounterPmtError('Network error — payment history could not be loaded') }
    setCounterPmtLoading(false)
  }, [schoolId])

  // A cancel/correct from the Passbook-shared modal bumps ledgerVersion when it
  // originated from this tab's counter view — re-derive the open payment list too.
  useEffect(() => {
    if (showCounterHistory && openStudentId) loadCounterPayments(openStudentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerVersion])

  function startCollect(row: StudentRow) {
    setOpenStudentId(row.student_id)
    setCollectChecked(new Set(row.open_entries.map(e => e.id)))
    const fullTotal = row.open_entries.reduce((s, e) => s + Number(e.balance), 0)
    setPayAmount(String(fullTotal))
    setPayMode('cash'); setPayRef(''); setPayCollectedBy(adminName || '')
    setPayDate(new Date().toISOString().slice(0, 10)); setPayNotes('')
    setPayError(''); setPaySuccess(null)
    setShowCollectForm(true)
  }

  // Multi-entry collection via the payments API (FIFO allocation across checked ledger ids)
  async function submitCounterPayment() {
    if (!openStudent) return
    const ids = openStudent.open_entries.filter(e => collectChecked.has(e.id)).map(e => e.id)
    if (ids.length === 0) { setPayError('Select at least one fee to collect'); return }
    const enteredAmount = parseFloat(payAmount)
    if (!enteredAmount || enteredAmount <= 0) { setPayError('Enter a valid amount'); return }
    if (enteredAmount > checkedTotal + 0.01) {
      setPayError(`Amount cannot exceed selected dues (${fmt(checkedTotal)})`); return
    }
    setCollectLoading(true); setPayError('')
    const r = await fetch('/api/fees/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, student_id: openStudent.student_id,
        ledger_ids: ids, total_amount: enteredAmount,
        payment_mode: payMode, transaction_ref: payRef || null,
        collected_by_name: payCollectedBy || null, notes: payNotes || null, paid_date: payDate,
      }),
    })
    const d = await r.json()
    if (r.ok) {
      setPaySuccess({
        receipt_number: d.receipt_number, student_name: d.student_name || openStudent.student_name,
        amount: d.total_paid ?? enteredAmount,
        school_name: d.school_name || '', roll_number: openStudent.roll_number,
        grade: openStudent.grade, section: openStudent.section, parent_name: d.parent_name || null,
        category_name: d.category_name || 'Multiple fees', period_label: d.period_label || '',
        amount_due: d.amount_due || checkedTotal,
        payment_mode: payMode, paid_date: payDate,
        collected_by_name: payCollectedBy || null,
        transaction_ref: payRef || null, notes: payNotes || null,
        outstanding_before: openStudent.outstanding,
        line_items: d.line_items || undefined,
      })
      setShowCollectForm(false)
      setPassoutOpenStudent(null)
      loadLedger(); onStatsChanged(); onPassoutChanged()
      bumpReports(); bumpYearEnd()
    } else {
      setPayError(d.error || 'Payment failed')
    }
    setCollectLoading(false)
  }

  function printCounterReceipt(row: StudentRow, paid: PaySuccess, lines: { cat: string; period: string; amount: number }[]) {
    printDualCopyReceipt({
      school_name: paid.school_name || 'School', logo_url: branding.logo_url, logo_align: branding.logo_align, header_blocks: branding.receipt_header_blocks,
      student_name: row.student_name, roll_number: row.roll_number, grade: row.grade, section: row.section,
      parent_name: paid.parent_name, receipt_number: paid.receipt_number,
      lines: lines.map(l => ({ label: l.cat, period: l.period, amount: l.amount })),
      total_paid: paid.amount, payment_mode: paid.payment_mode, paid_date: paid.paid_date,
      transaction_ref: paid.transaction_ref, collected_by_name: paid.collected_by_name, notes: paid.notes,
      balance_after: Math.max(0, (paid.outstanding_before ?? row.outstanding) - paid.amount),
    })
  }

  async function submitWaiver() {
    if (!selectedEntry) return
    const balance = Number(selectedEntry.balance)
    if (waiverForm.waiver_type === 'fixed_amount') {
      const amt = parseFloat(waiverForm.waiver_value) || 0
      if (amt > balance + 0.01) {
        setWaiverError(`Waiver amount ₹${amt.toFixed(2)} exceeds outstanding balance of ₹${balance.toFixed(2)}`)
        return
      }
    } else if (waiverForm.waiver_type === 'percentage') {
      const pct = parseFloat(waiverForm.waiver_value) || 0
      if (pct > 100) {
        setWaiverError('Percentage cannot exceed 100%')
        return
      }
    }
    setWaiverLoading(true); setWaiverError('')
    try {
      const r = await fetch('/api/fees/waivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId, student_id: selectedEntry.student_id,
          ledger_id: selectedEntry.id, waiver_type: waiverForm.waiver_type,
          waiver_value: parseFloat(waiverForm.waiver_value) || null,
          reason: waiverForm.reason, granted_by_name: waiverForm.granted_by_name || null,
        }),
      })
      if (r.ok) {
        setShowWaiver(false); setSelectedEntry(null)
        setOpenStudentId(null); setShowCollectForm(false); setCollectChecked(new Set())
        onStatsChanged(); loadLedger()
        bumpReports(); bumpYearEnd()
      } else {
        const d = await r.json()
        setWaiverError(d.error || 'Failed to grant waiver')
      }
    } catch {
      setWaiverError('Network error — please try again')
    }
    setWaiverLoading(false)
  }

  // ── Day Close ──
  type DayCloseData = {
    date: string
    by_mode: Record<string, { count: number; total: number }>
    receipts: { first: string | null; last: string | null; count: number; total: number }
    payments: Array<{ id: number; student_name: string; grade: string; section: string; fee_head_name: string; period_label: string; amount: number; payment_mode: string; receipt_number: string; collected_by_name: string | null; notes: string | null }>
    already_closed: boolean
  }
  const [dayCloseData, setDayCloseData] = useState<DayCloseData | null>(null)
  const [dayCloseDate, setDayCloseDate] = useState(new Date().toISOString().slice(0, 10))
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
    if (collectionView === 'dayclose') loadDayClose(dayCloseDate)
  }, [collectionView, dayCloseDate, loadDayClose])

  async function submitDayClose() {
    setDayCloseSubmitting(true); setDayCloseMsg('')
    const r = await fetch('/api/fees/day-close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, date: dayCloseDate, actual_cash: actualCash || null, submitted_by: adminName || 'Admin' }),
    })
    const d = await r.json()
    setDayCloseMsg(r.ok ? '✓ Day closed and locked' : (d.error || 'Failed'))
    setDayCloseSubmitting(false)
    if (r.ok) loadDayClose(dayCloseDate)
  }

  return (
    <div className="space-y-4">

      <LoadErrorBanner message={ledgerError} onRetry={loadLedger} />

      {/* Online payments alert banner — only when feature enabled */}
      {hasOnlinePayments && pendingPayments.length > 0 && collectionView !== 'online' && (
        <button data-testid="btn-online-payments-alert" onClick={() => setCollectionView('online')}
          className="w-full flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors">
          <span className="flex items-center gap-2 text-sm font-medium text-red-700">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            {pendingPayments.length} online payment{pendingPayments.length > 1 ? 's' : ''} waiting for verification
          </span>
          <span className="text-xs font-semibold text-red-600">Review →</span>
        </button>
      )}

      {/* Sub-view switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: 'counter',    label: 'Daily Counter', show: true },
          { key: 'online',     label: pendingPayments.length > 0 ? `Online (${pendingPayments.length})` : 'Online', show: hasOnlinePayments },
          { key: 'defaulters', label: 'Pending Payments', show: true },
          { key: 'dayclose',   label: 'Day Close',     show: true },
        ] as const).filter(v => v.show).map(v => (
          <button key={v.key} data-testid={`tab-collect-${v.key}`} onClick={() => setCollectionView(v.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              collectionView === v.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ─── DAILY COUNTER ─── */}
      {collectionView === 'counter' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <input data-testid="input-ledger-search" type="text" placeholder="Search name, roll, grade, phone, parent…" value={ledgerSearch}
              onChange={e => setLedgerSearch(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select data-testid="select-ledger-grade" value={ledgerGrade} onChange={e => setLedgerGrade(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">All Grades</option>
              {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
            </select>
            <button data-testid="btn-refresh-ledger" onClick={loadLedger} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Refresh</button>
            <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download
              className="text-sm border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50">Export</a>
          </div>

          {/* Quick filter chips */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: '',        label: `All Students (${statusCounts.all})` },
              { key: 'overdue', label: `Overdue (${statusCounts.overdue})` },
              { key: 'partial', label: `Partially Paid (${statusCounts.partial})` },
              { key: 'never',   label: `Never Paid (${statusCounts.never})` },
              { key: 'clear',   label: `Fully Cleared (${statusCounts.clear})` },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setLedgerStatus(f.key)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  ledgerStatus === f.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Student list */}
          {ledgerLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
          ) : collectionFiltered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
              No students found. Generate bills from Fee Plan first.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="hidden sm:grid px-4 py-2.5 bg-gray-50 border-b border-gray-100 grid-cols-12 gap-2 text-xs font-semibold text-gray-500">
                <div className="col-span-4">Student</div>
                <div className="col-span-2 text-right">Billed</div>
                <div className="col-span-2 text-right">Paid+Waived</div>
                <div className="col-span-2 text-right">Outstanding</div>
                <div className="col-span-2 text-center">Action</div>
              </div>
              <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                {collectionFiltered.map(row => (
                  <Fragment key={row.student_id}>
                    <div id={`student-row-${row.student_id}`} className={`px-4 py-3 flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center hover:bg-gray-50/60 cursor-pointer ${openStudentId === row.student_id ? 'bg-blue-50/40' : ''}`}
                      onClick={() => toggleStudent(row.student_id)}>
                      <div className="sm:col-span-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800">{row.student_name}</p>
                          {row.student_status === 'inactive' && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Inactive</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">Gr.{row.grade}{row.section}{row.school_roll_number != null ? ` · Roll ${row.school_roll_number}` : ''}</p>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 sm:hidden">
                        <span>Billed: <span className="text-gray-600">{fmt(row.total_billed)}</span></span>
                        <span>Paid+Waived: <span className="text-green-600">{fmt(row.total_paid)}</span></span>
                        <span>Outstanding: <span className="font-bold text-red-600">{fmt(row.outstanding)}</span></span>
                      </div>
                      <div className="hidden sm:block sm:col-span-2 text-right text-sm text-gray-600">{fmt(row.total_billed)}</div>
                      <div className="hidden sm:block sm:col-span-2 text-right text-sm text-green-600">{fmt(row.total_paid)}</div>
                      <div className="hidden sm:block sm:col-span-2 text-right text-sm font-bold text-red-600">{fmt(row.outstanding)}</div>
                      <div className="flex justify-end sm:justify-center gap-1.5 sm:col-span-2" onClick={e => e.stopPropagation()}>
                        {row.outstanding > 0 ? (
                          <button onClick={() => startCollect(row)}
                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700">Collect</button>
                        ) : (
                          <span className="text-xs text-green-600 font-medium px-2 py-1">✓ Clear</span>
                        )}
                        <button onClick={() => toggleStudent(row.student_id)}
                          className="text-xs border border-gray-200 text-gray-500 px-2 py-1 rounded-lg hover:bg-gray-50">
                          {openStudentId === row.student_id ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded student panel */}
                    {openStudentId === row.student_id && (
                      <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
                        {/* Pay success */}
                        {paySuccess ? (
                          <div className="bg-white border border-green-200 rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </div>
                              <div>
                                <p className="font-bold text-green-800">Payment Recorded</p>
                                <p className="text-xs text-gray-500">Receipt {paySuccess.receipt_number} · {fmt(paySuccess.amount)}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => {
                                // line_items from the payment API is the source of truth — it reflects
                                // every fee head actually paid, even when several are settled in one
                                // transaction (e.g. Tuition + Transport + Hostel). Ledger checkbox state
                                // can be empty/stale by the time Print is clicked, so it's only a fallback.
                                let lines: { cat: string; period: string; amount: number }[]
                                if (paySuccess.line_items?.length) {
                                  lines = paySuccess.line_items.map(li => ({ cat: li.category_name, period: li.period_label, amount: li.amount }))
                                } else {
                                  const selected = row.open_entries.filter(e => collectChecked.has(e.id))
                                  const selectedTotal = selected.reduce((s, e) => s + Number(e.balance), 0)
                                  if (paySuccess.amount >= selectedTotal - 0.01 && selected.length > 0) {
                                    lines = selected.map(e => ({ cat: e.category_name, period: e.period_label, amount: Number(e.balance) }))
                                  } else {
                                    lines = [{ cat: paySuccess.category_name || 'Part payment towards dues', period: selected.map(e => e.period_label).join(', ') || paySuccess.period_label, amount: paySuccess.amount }]
                                  }
                                }
                                printCounterReceipt(row, paySuccess, lines)
                              }}
                                className="text-sm bg-white border border-green-300 text-green-700 px-4 py-1.5 rounded-lg font-medium hover:bg-green-50">🖨 Print Receipt</button>
                              <button onClick={() => { setPaySuccess(null); setOpenStudentId(null) }}
                                className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-green-700">Done</button>
                            </div>
                          </div>
                        ) : showCollectForm ? (
                          /* Collect form */
                          <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-4">
                            <p className="text-sm font-semibold text-gray-700">Collect Payment — {row.student_name}</p>
                            <div className="space-y-1.5">
                              {row.open_entries.map(e => (
                                <label key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                  <input type="checkbox" checked={collectChecked.has(e.id)}
                                    onChange={ev => {
                                      const next = new Set(collectChecked)
                                      if (ev.target.checked) next.add(e.id); else next.delete(e.id)
                                      setCollectChecked(next)
                                      const newTotal = row.open_entries.filter(x => next.has(x.id)).reduce((s, x) => s + Number(x.balance), 0)
                                      setPayAmount(String(newTotal))
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                  <span className="flex-1 text-sm text-gray-700">
                                    {e.source_academic_year ? (
                                      <>Previous Year Dues · <span className="text-gray-400">{e.notes?.replace(/^Carried from [^:]+:\s*/, '') || e.period_label}</span></>
                                    ) : (
                                      <>{e.category_name} · <span className="text-gray-400">{e.period_label}</span></>
                                    )}
                                  </span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLORS[e.status]}`}>{e.status}</span>
                                  <span className="text-sm font-bold text-gray-800 w-20 text-right">{fmt(e.balance)}</span>
                                </label>
                              ))}
                            </div>

                            {/* Amount being collected — editable for partial payments */}
                            <div className="border-t border-gray-100 pt-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm text-gray-500">Selected dues</span>
                                <span className="text-sm font-medium text-gray-700">{fmt(checkedTotal)}</span>
                              </div>
                              <label className="text-xs font-medium text-gray-600">Amount being collected now</label>
                              <div className="relative mt-1">
                                <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₹</span>
                                <input
                                  data-testid="input-pay-amount"
                                  type="number" min="0" step="0.01" inputMode="decimal" value={payAmount}
                                  onKeyDown={blockNonNumericKeys}
                                  onChange={e => setPayAmount(sanitizeMoney(e.target.value))}
                                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              {(() => {
                                const entered = parseFloat(payAmount) || 0
                                if (entered > 0 && entered < checkedTotal) {
                                  return (
                                    <p className="text-xs text-amber-600 mt-1">
                                      Partial payment — ₹{(checkedTotal - entered).toLocaleString('en-IN')} will remain due.
                                      Applied to oldest bill first.
                                    </p>
                                  )
                                }
                                if (entered > checkedTotal) {
                                  return <p className="text-xs text-red-600 mt-1">Amount exceeds selected dues ({fmt(checkedTotal)}).</p>
                                }
                                return <p className="text-xs text-gray-400 mt-1">Edit to take a partial amount (e.g. ₹5,000 of ₹10,000).</p>
                              })()}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-medium text-gray-600">Mode</label>
                                <select value={payMode} onChange={e => setPayMode(e.target.value)}
                                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                  <option value="cash">Cash</option><option value="cheque">Cheque</option>
                                  <option value="dd">Demand Draft</option><option value="upi">UPI</option>
                                  <option value="online">Online Transfer</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Date</label>
                                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Collected By</label>
                                <input type="text" value={payCollectedBy} onChange={e => setPayCollectedBy(e.target.value)}
                                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                              </div>
                              {['cheque','dd','upi','online'].includes(payMode) && (
                                <div>
                                  <label className="text-xs font-medium text-gray-600">Reference / Cheque No</label>
                                  <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Remarks (optional)</label>
                              <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                                placeholder="e.g. Paid by elder brother · Late fee waived verbally · Cash short ₹10"
                                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            {payError && (
                              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                <div><p className="text-xs font-semibold text-red-700">Payment Failed</p><p className="text-xs text-red-600">{payError}</p></div>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                data-testid="btn-review-payment"
                                onClick={() => setShowPayConfirm(true)}
                                disabled={collectLoading || !(parseFloat(payAmount) > 0) || parseFloat(payAmount) > checkedTotal + 0.01}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Review & Confirm
                              </button>
                              <button
                                data-testid="btn-grant-waiver"
                                onClick={() => { setSelectedEntry(row.open_entries[0]); setWaiverForm({ waiver_type: 'percentage', waiver_value: '', reason: '', granted_by_name: adminName || '' }); setWaiverError(''); setShowWaiver(true) }}
                                className="px-3 py-2.5 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg text-sm font-medium whitespace-nowrap">
                                Grant Waiver
                              </button>
                              <button onClick={() => setShowCollectForm(false)}
                                className="text-sm text-gray-500 px-4 py-2.5 hover:text-gray-700">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          /* Dues list (read mode) */
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {row.open_entries.length === 0 ? (
                                <p className="text-sm text-green-600 font-medium px-1">✓ All fees cleared for this student.</p>
                              ) : (
                                <>
                                  {row.open_entries.map(e => (
                                    <div key={e.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                      <div>
                                        <p className="text-sm text-gray-700">{e.category_name} · <span className="text-gray-400">{e.period_label}</span></p>
                                        <p className="text-xs text-gray-400">Due {e.due_date}{Number(e.days_overdue) > 0 ? ` · ${e.days_overdue}d overdue` : ''}</p>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-red-600">{fmt(e.balance)}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLORS[e.status]}`}>{e.status}</span>
                                      </div>
                                    </div>
                                  ))}
                                  <div className="flex gap-2 mt-1">
                                    <button onClick={() => startCollect(row)}
                                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold">
                                      Collect All ({fmt(row.outstanding)})
                                    </button>
                                    <button
                                      onClick={() => { setSelectedEntry(row.open_entries[0]); setWaiverForm({ waiver_type: 'percentage', waiver_value: '', reason: '', granted_by_name: adminName || '' }); setWaiverError(''); setShowWaiver(true) }}
                                      className="px-3 py-2 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg text-sm font-medium">
                                      Grant Waiver
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Recent payments — view / cancel / correct */}
                            <div className="border-t border-gray-100 pt-3">
                              {!showCounterHistory ? (
                                <button
                                  onClick={() => { onOpenPassbook(row.student_id) }}
                                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-4 py-2.5 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                  </svg>
                                  View Payments &amp; Corrections
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payments</p>
                                    <button onClick={() => { setShowCounterHistory(false); cancelCorrect.setPmtId(null) }} className="text-xs text-gray-400 hover:text-gray-600">Hide</button>
                                  </div>
                                  {counterPmtError ? (
                                    <p className="text-xs text-red-500">{counterPmtError}</p>
                                  ) : counterPmtLoading ? (
                                    <p className="text-xs text-gray-400">Loading…</p>
                                  ) : counterPayments.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No payments recorded yet.</p>
                                  ) : (
                                    counterPayments.map(p => {
                                      const cancelled = p.payment_status === 'cancelled'
                                      return (
                                        <div key={p.id} className={`rounded-lg border px-3 py-2 ${cancelled ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100'}`}>
                                          <div className="flex items-center justify-between">
                                            <div>
                                              <p className={`text-sm ${cancelled ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                                <span className="font-mono text-xs text-indigo-600">{p.receipt_number}</span> · {fmt(p.amount)} · {p.payment_mode.toUpperCase()}
                                              </p>
                                              <p className="text-xs text-gray-400">{fmtDate(p.paid_date)}{p.collected_by_name ? ` · ${p.collected_by_name}` : ''}</p>
                                            </div>
                                            {cancelled ? (
                                              <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">Cancelled</span>
                                            ) : p.payment_status === 'completed' ? (
                                              cancelCorrect.pmtId === p.id ? (
                                                <button onClick={() => cancelCorrect.setPmtId(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                                              ) : (
                                                <button onClick={() => {
                                                  const le = row.all_entries.find(e => e.id === p.ledger_id)
                                                  cancelCorrect.open(p.id, Number(p.amount), le ? Number(le.balance) : 0)
                                                }} className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Cancel / Correct</button>
                                              )
                                            ) : (
                                              <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium capitalize">{p.payment_status.replace('_', ' ')}</span>
                                            )}
                                          </div>

                                          {/* Inline cancel/correct form */}
                                          {cancelCorrect.pmtId === p.id && (
                                            <div className="mt-2 pt-2 border-t border-amber-100 bg-amber-50 -mx-3 -mb-2 px-3 py-2 rounded-b-lg space-y-2">
                                              <div className="flex gap-2">
                                                <button onClick={() => cancelCorrect.setMode('cancel')}
                                                  className={`text-xs px-3 py-1 rounded-lg font-medium ${cancelCorrect.mode === 'cancel' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Cancel</button>
                                                <button onClick={() => { cancelCorrect.setMode('correct'); cancelCorrect.setAmount(String(p.amount)) }}
                                                  className={`text-xs px-3 py-1 rounded-lg font-medium ${cancelCorrect.mode === 'correct' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Correct Amount</button>
                                              </div>
                                              <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                                {cancelCorrect.mode === 'cancel'
                                                  ? <>⚠ Reverses <strong>{fmt(p.amount)}</strong> from the ledger. Balance increases by {fmt(p.amount)}; receipt {p.receipt_number} stays on record as cancelled.</>
                                                  : <>⚠ Cancels {p.receipt_number} ({fmt(p.amount)}) and issues a new receipt for <strong>{cancelCorrect.amount ? fmt(parseFloat(cancelCorrect.amount) || 0) : '₹0'}</strong>. Net change: {fmt((parseFloat(cancelCorrect.amount) || 0) - Number(p.amount))}.</>}
                                              </div>
                                              {cancelCorrect.mode === 'correct' && (
                                                <div>
                                                  <input type="number" min="0" inputMode="decimal" value={cancelCorrect.amount}
                                                    onKeyDown={blockNonNumericKeys}
                                                    onChange={e => cancelCorrect.setAmount(sanitizeMoney(e.target.value))}
                                                    placeholder={cancelCorrect.maxCorrect !== null ? `max ₹${cancelCorrect.maxCorrect.toFixed(2)}` : 'Correct amount'}
                                                    className={`w-44 border rounded-lg px-3 py-1.5 text-sm ${cancelCorrect.maxCorrect !== null && parseFloat(cancelCorrect.amount) > cancelCorrect.maxCorrect + 0.01 ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                                                  {cancelCorrect.maxCorrect !== null && parseFloat(cancelCorrect.amount) > cancelCorrect.maxCorrect + 0.01 && (
                                                    <p className="text-xs text-red-600 mt-1">Exceeds max of ₹{cancelCorrect.maxCorrect.toFixed(2)}</p>
                                                  )}
                                                </div>
                                              )}
                                              <input type="text" placeholder="Reason (required — recorded in audit log)"
                                                value={cancelCorrect.reason} onChange={e => cancelCorrect.setReason(e.target.value)}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                              {cancelCorrect.msg && <p className={`text-xs ${cancelCorrect.msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cancelCorrect.msg}</p>}
                                              <div className="flex gap-2">
                                                <button onClick={() => cancelCorrect.submit('counter')} disabled={cancelCorrect.busy || !cancelCorrect.reason.trim()}
                                                  className={`text-xs text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${cancelCorrect.mode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                                  {cancelCorrect.busy ? 'Working…' : cancelCorrect.mode === 'cancel' ? `Confirm Cancel (${fmt(p.amount)})` : 'Confirm Correction'}
                                                </button>
                                                <button onClick={() => cancelCorrect.setPmtId(null)} className="text-xs text-gray-500 px-3 py-1.5">Close</button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ONLINE PAYMENTS ─── */}
      {hasOnlinePayments && collectionView === 'online' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-800">Online Payments — Pending Verification</h3>
              <p className="text-xs text-gray-400 mt-0.5">Check your school&apos;s UPI/bank statement, then approve or reject. Parent is notified by email.</p>
            </div>
            <button onClick={loadPending} className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">Refresh</button>
          </div>

          {verifyMsg && (
            <div className={`text-sm px-4 py-3 rounded-lg ${verifyMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>{verifyMsg}</div>
          )}

          {pendingError && (
            <div className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-600 border border-red-200">{pendingError}</div>
          )}
          {pendingLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
          ) : !pendingError && pendingPayments.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-green-700 font-medium">All clear!</p>
              <p className="text-gray-400 text-sm mt-1">No online payments waiting.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
              {pendingPayments.map(pmt => (
                <div key={pmt.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-gray-800">{pmt.student_name}</p>
                        <span className="text-xs text-gray-400">Gr.{pmt.grade}{pmt.section} · #{pmt.roll_number}</span>
                      </div>
                      <p className="text-xs text-gray-500">{pmt.category_name} · {pmt.period_label}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                        <span className="font-mono bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-0.5 rounded">{pmt.receipt_number}</span>
                        <span>{pmt.paid_date}</span>
                        <span className="uppercase font-medium">{pmt.payment_mode}</span>
                        {pmt.transaction_ref && <span className="font-mono">UTR: {pmt.transaction_ref}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-gray-800">{fmt(pmt.amount)}</p>
                    </div>
                  </div>
                  {showRejectForm === pmt.id ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input type="text" placeholder="Reason for rejection…" value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        className="flex-1 text-sm border border-red-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-red-400" />
                      <button onClick={() => verifyPayment(pmt.id, 'reject')} disabled={verifyingId === pmt.id || !rejectReason.trim()}
                        className="text-sm bg-red-600 text-white px-4 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50">Confirm Reject</button>
                      <button onClick={() => { setShowRejectForm(null); setRejectReason('') }}
                        className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => verifyPayment(pmt.id, 'approve')} disabled={verifyingId === pmt.id}
                        className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">✓ Approve</button>
                      <button onClick={() => setShowRejectForm(pmt.id)}
                        className="text-sm border border-red-200 text-red-600 px-4 py-1.5 rounded-lg hover:bg-red-50">✗ Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── PENDING PAYMENTS ─── */}
      {collectionView === 'defaulters' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Pending Payments — Outstanding Dues</h3>
            <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger&outstanding=1`} download
              className="text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">Export Pending Payments</a>
          </div>
          <div className="flex items-center gap-3">
            <input data-testid="input-pending-search" type="text" placeholder="Search name, roll, grade, phone, parent…" value={pendingSearch}
              onChange={e => setPendingSearch(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select data-testid="select-pending-grade" value={pendingGrade} onChange={e => setPendingGrade(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option value="">All Grades</option>
              {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
            </select>
          </div>
          {(() => {
            const defaulters = studentRows.filter(r => {
              if (r.outstanding <= 0) return false
              if (pendingGrade && r.grade !== pendingGrade) return false
              if (pendingSearch) {
                const q = pendingSearch.trim().toLowerCase()
                const matches = [
                  r.student_name, r.roll_number,
                  r.school_roll_number != null ? String(r.school_roll_number) : '',
                  r.grade, r.section, r.email, r.phone,
                  r.parent_name, r.parent_phone, r.parent_email,
                ].some(v => (v || '').toLowerCase().includes(q))
                if (!matches) return false
              }
              return true
            }).sort((a, b) => b.outstanding - a.outstanding)
            if (ledgerLoading) return <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
            if (defaulters.length === 0) return (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className={(pendingSearch || pendingGrade) ? 'text-gray-400 font-medium' : 'text-green-700 font-medium'}>
                  {(pendingSearch || pendingGrade) ? 'No students match this search/filter.' : 'No pending payments — all dues cleared!'}
                </p>
              </div>
            )
            return (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex justify-between">
                  <p className="text-sm text-gray-500">{defaulters.length} students with outstanding dues</p>
                  <p className="text-sm font-bold text-red-600">Total: {fmt(defaulters.reduce((s, r) => s + r.outstanding, 0))}</p>
                </div>
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-semibold">Student</th>
                        <th className="text-left px-4 py-2 font-semibold">Grade</th>
                        <th className="text-right px-4 py-2 font-semibold">Outstanding</th>
                        <th className="text-center px-4 py-2 font-semibold">Open Bills</th>
                        <th className="text-center px-4 py-2 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defaulters.map(r => (
                        <tr key={r.student_id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{r.student_name}</p>
                            <p className="text-xs text-gray-400">#{r.roll_number}</p>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">Gr.{r.grade}{r.section}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmt(r.outstanding)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">{r.open_entries.length}</span>
                            {r.has_overdue && <span className="text-[10px] text-red-400 ml-1">overdue</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => { setCollectionView('counter'); setLedgerSearch(r.roll_number); setOpenStudentId(r.student_id); startCollect(r) }}
                              className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700">Collect</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ─── DAY CLOSE ─── */}
      {collectionView === 'dayclose' && (
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
      )}

      {/* ══ Payment Confirmation Modal ══════════════════════════════════════════ */}
      {showPayConfirm && openStudent && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowPayConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 pt-6 pb-8 text-white">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-1">Confirm Payment</p>
              <p className="text-2xl font-black tracking-tight">{openStudent.student_name}</p>
              <p className="text-sm text-blue-200 mt-0.5">
                Gr.{openStudent.grade}{openStudent.section}
                {openStudent.school_roll_number != null ? ` · Roll ${openStudent.school_roll_number}` : ''}
              </p>

              {/* Big amount */}
              <div className="mt-5 bg-white/15 rounded-xl px-5 py-4 text-center">
                <p className="text-xs text-blue-200 uppercase tracking-widest mb-1">Amount Being Collected</p>
                <p className="text-5xl font-black text-white tracking-tight">
                  {fmt(parseFloat(payAmount) || 0)}
                </p>
                {parseFloat(payAmount) < checkedTotal - 0.01 && (
                  <p className="text-xs text-blue-200 mt-1.5">
                    Partial — {fmt(checkedTotal - (parseFloat(payAmount) || 0))} will remain due
                  </p>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="px-6 py-5 space-y-3">
              {/* Fee lines */}
              <div className="space-y-1.5">
                {openStudent.open_entries
                  .filter(e => collectChecked.has(e.id))
                  .map(e => (
                    <div key={e.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{e.category_name} · {e.period_label}</span>
                      <span className="font-semibold text-gray-800">{fmt(e.balance)}</span>
                    </div>
                  ))}
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Mode</span>
                  <span className="font-medium text-gray-800 capitalize">{payMode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-800">
                    {payDate ? new Date(payDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                </div>
                {payCollectedBy && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Collected by</span>
                    <span className="font-medium text-gray-800">{payCollectedBy}</span>
                  </div>
                )}
                {payRef && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reference</span>
                    <span className="font-medium text-gray-800">{payRef}</span>
                  </div>
                )}
                {payNotes && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 flex-shrink-0">Remarks</span>
                    <span className="font-medium text-gray-800 text-right">{payNotes}</span>
                  </div>
                )}
              </div>

              {payError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-red-700">Payment Failed</p>
                    <p className="text-sm text-red-600 mt-0.5">{payError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowPayConfirm(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                ← Edit
              </button>
              <button
                data-testid="btn-confirm-payment"
                onClick={() => { setShowPayConfirm(false); submitCounterPayment() }}
                disabled={collectLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
                {collectLoading
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Recording…</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Confirm & Record</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Grant Waiver Modal ══════════════════════════════════════════════════ */}
      {showWaiver && selectedEntry && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowWaiver(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold text-base">Grant Fee Waiver</h3>
                  <p className="text-purple-200 text-xs mt-0.5">{selectedEntry.student_name} · {selectedEntry.grade}{selectedEntry.section}</p>
                </div>
                <button onClick={() => setShowWaiver(false)} className="text-purple-200 hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Fee entry selector */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Fee Entry to Waive</label>
                <select
                  value={selectedEntry.id}
                  onChange={e => {
                    const allEntries = studentRows.find(r => r.student_id === selectedEntry.student_id)?.open_entries ?? []
                    const entry = allEntries.find(x => String(x.id) === e.target.value)
                    if (entry) setSelectedEntry(entry)
                  }}
                  className="w-full mt-1.5 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                  {(studentRows.find(r => r.student_id === selectedEntry.student_id)?.open_entries ?? [selectedEntry]).map(e => (
                    <option key={e.id} value={e.id}>{e.category_name} · {e.period_label} · {fmt(e.balance)}</option>
                  ))}
                </select>
                <div className="mt-2 flex items-center gap-3 bg-purple-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-purple-600 font-medium">Outstanding on this entry</span>
                  <span className="ml-auto text-sm font-bold text-purple-800">{fmt(selectedEntry.balance)}</span>
                </div>
              </div>

              {/* Waiver type */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Waiver Type</label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {[
                    { value: 'percentage', label: 'Percentage', icon: '%' },
                    { value: 'fixed_amount', label: 'Fixed ₹',  icon: '₹' },
                    { value: 'full',       label: 'Full Waiver', icon: '✓' },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => setWaiverForm(f => ({ ...f, waiver_type: opt.value, waiver_value: '' }))}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        waiverForm.waiver_type === opt.value
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      <span className="text-base font-bold">{opt.icon}</span>
                      <span className="text-xs">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Value input */}
              {waiverForm.waiver_type !== 'full' && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {waiverForm.waiver_type === 'percentage' ? 'Percentage to Waive' : 'Amount to Waive (₹)'}
                  </label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm font-medium">
                      {waiverForm.waiver_type === 'percentage' ? '%' : '₹'}
                    </span>
                    <input type="number" min="0"
                      max={waiverForm.waiver_type === 'percentage' ? 100 : undefined}
                      value={waiverForm.waiver_value}
                      onChange={e => setWaiverForm(f => ({ ...f, waiver_value: e.target.value }))}
                      placeholder={waiverForm.waiver_type === 'percentage' ? '50' : String(selectedEntry.balance)}
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  {/* Preview */}
                  {waiverForm.waiver_value && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                      Waiver amount:{' '}
                      <strong>
                        {fmt(
                          waiverForm.waiver_type === 'percentage'
                            ? (Number(selectedEntry.balance) * (parseFloat(waiverForm.waiver_value) || 0)) / 100
                            : parseFloat(waiverForm.waiver_value) || 0
                        )}
                      </strong>
                      {' · '}Remaining balance:{' '}
                      <strong>
                        {fmt(Math.max(0,
                          waiverForm.waiver_type === 'percentage'
                            ? Number(selectedEntry.balance) * (1 - (parseFloat(waiverForm.waiver_value) || 0) / 100)
                            : Number(selectedEntry.balance) - (parseFloat(waiverForm.waiver_value) || 0)
                        ))}
                      </strong>
                    </div>
                  )}
                  {waiverForm.waiver_type === 'full' && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                      Full balance of <strong>{fmt(selectedEntry.balance)}</strong> will be waived.
                    </div>
                  )}
                </div>
              )}
              {waiverForm.waiver_type === 'full' && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                  Full balance of <strong>{fmt(selectedEntry.balance)}</strong> will be waived.
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Reason <span className="text-red-500">*</span></label>
                <input type="text"
                  value={waiverForm.reason}
                  onChange={e => setWaiverForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Financial hardship · Merit waiver · Staff ward"
                  className="w-full mt-1.5 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>

              {/* Granted by */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Granted By</label>
                <input type="text"
                  value={waiverForm.granted_by_name}
                  onChange={e => setWaiverForm(f => ({ ...f, granted_by_name: e.target.value }))}
                  className="w-full mt-1.5 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>

              {/* Error */}
              {waiverError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{waiverError}</div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowWaiver(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  data-testid="btn-submit-waiver"
                  onClick={submitWaiver}
                  disabled={waiverLoading || !waiverForm.reason.trim() || (waiverForm.waiver_type !== 'full' && !waiverForm.waiver_value)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-200">
                  {waiverLoading
                    ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</>
                    : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Confirm Waiver</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
