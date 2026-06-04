'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FeeCategory = {
  id: number; name: string; description: string | null
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time'
  is_active: boolean; structure_count: number; ledger_count: number
  category_type: 'fixed' | 'variable'
}

type ApplStudent = { id: number; name: string; roll_number: string; section: string }
type ApplCategory = { id: number; name: string; frequency: string }

type FeeStructure = {
  id: number; fee_category_id: number; category_name: string
  grade: string; amount: number; due_day: number; frequency: string
}

type StructureLock = {
  id: number; school_id: number; academic_year: string
  locked_by: string; locked_at: string
} | null

type Amendment = {
  id: number; grade: string; academic_year: string; category_name: string
  old_amount: number; new_amount: number; effective_from: string
  reason: string; changed_by: string; created_at: string
}

type LedgerEntry = {
  id: number; student_id: number; student_name: string
  roll_number: string; grade: string; section: string
  category_name: string; period_label: string
  amount_due: number; amount_paid: number; balance: number; waiver_amount: number
  due_date: string; status: 'pending' | 'paid' | 'partial' | 'overdue' | 'waived'
  days_overdue: number; has_edits: boolean
}

type FeeStats = {
  summary: {
    total_students: number; total_due: number; total_collected: number
    total_outstanding: number; paid_count: number; partial_count: number
    pending_count: number; overdue_count: number; defaulters_count: number
  }
  by_category: Array<{ category_name: string; frequency: string; total_due: number; total_collected: number; overdue_count: number }>
  monthly_trend: Array<{ month: string; collected: number }>
  top_defaulters: Array<{ student_id: number; student_name: string; grade: string; section: string; roll_number: string; outstanding: number; overdue_entries: number }>
  by_payment_mode: Array<{ payment_mode: string; count: number; total: number }>
}

type PendingPayment = {
  id: number; student_id: number; student_name: string; roll_number: string
  grade: string; section: string; category_name: string; period_label: string
  amount: number; payment_mode: string; transaction_ref: string | null
  receipt_number: string; paid_date: string; notes: string | null
  ledger_id: number; amount_due: number; ledger_balance: number
}

type EditRecord = {
  id: number; old_amount: number; new_amount: number
  reason: string; changed_by: string; changed_at: string
}

type ReportData = {
  balance: { total_billed: number; total_collected: number; total_outstanding: number; total_waived: number; paid_entries: number; partial_entries: number; unpaid_entries: number; waived_entries: number; total_students: number }
  monthly: Array<{ month: string; collected: number; payment_count: number; students_paid: number }>
  monthlyDue: Array<{ month: string; billed: number }>
  byGrade: Array<{ grade: string; students: number; total_due: number; total_collected: number; outstanding: number }>
  byCategory: Array<{ category_name: string; frequency: string; students: number; total_due: number; total_collected: number; total_waived: number; outstanding: number; paid_count: number; unpaid_count: number }>
  byMode: Array<{ payment_mode: string; count: number; total: number }>
  defaulters: Array<{ student_name: string; roll_number: string; grade: string; section: string; parent_name: string | null; parent_phone: string | null; outstanding: number; overdue_entries: number; unpaid_entries: number }>
}

type YearEndEntry = {
  id: number; student_id: number; student_name: string; roll_number: string
  grade: string; section: string; category_name: string; period_label: string
  amount_due: number; amount_paid: number; balance: number; due_date: string; status: string
}

type PaymentRecord = {
  id: number; receipt_number: string; amount: number
  payment_mode: string; payment_status: string
  paid_date: string; collected_by_name: string | null
  transaction_ref: string | null; notes: string | null
  verified_by: string | null; verified_at: string | null
  rejection_reason: string | null; created_at: string
}

type PaySuccess = {
  receipt_number: string; student_name: string; amount: number
  school_name: string; roll_number: string; grade: string; section: string; parent_name: string | null
  category_name: string; period_label: string; amount_due: number
  payment_mode: string; paid_date: string; collected_by_name: string | null
  transaction_ref: string | null; notes: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADES = ['1','2','3','4','5','6','7','8','9','10','11','12']

const CATEGORY_SUGGESTIONS = [
  { name: 'Admission Fee',          frequency: 'one_time',   category_type: 'fixed'    },
  { name: 'Tuition Fee',            frequency: 'monthly',    category_type: 'fixed'    },
  { name: 'Exam Fee',               frequency: 'annual',     category_type: 'fixed'    },
  { name: 'Transport Fee',          frequency: 'monthly',    category_type: 'variable' },
  { name: 'Hostel Fee',             frequency: 'monthly',    category_type: 'fixed'    },
  { name: 'Books & Stationery Fee', frequency: 'annual',     category_type: 'fixed'    },
  { name: 'Uniform Fee',            frequency: 'one_time',   category_type: 'fixed'    },
  { name: 'Activity/Sports Fee',    frequency: 'annual',     category_type: 'fixed'    },
  { name: 'Annual Fee',             frequency: 'annual',     category_type: 'fixed'    },
  { name: 'Miscellaneous Fee',      frequency: 'one_time',   category_type: 'fixed'    },
  { name: 'Late Fee/Fine',          frequency: 'one_time',   category_type: 'fixed'    },
] as const

const STATUS_COLORS: Record<string, string> = {
  paid:    'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-gray-100 text-gray-600',
  overdue: 'bg-red-100 text-red-700',
  waived:  'bg-purple-100 text-purple-700',
}

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function pct(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeeManagement({ schoolId, adminName }: { schoolId: number; adminName?: string }) {
  type Tab = 'overview' | 'setup' | 'applicability' | 'ledger' | 'collect' | 'pending' | 'reports' | 'yearend'
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Shared
  const [academicYear, setAcademicYear]   = useState('')
  const [academicYears, setAcademicYears] = useState<string[]>([])

  // Overview
  const [stats, setStats]             = useState<FeeStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Setup
  const [categories, setCategories]     = useState<FeeCategory[]>([])
  const [structures, setStructures]     = useState<FeeStructure[]>([])
  const [structureLock, setStructureLock] = useState<StructureLock>(null)
  const [amendments, setAmendments]     = useState<Amendment[]>([])
  const [editAmounts, setEditAmounts]   = useState<Record<string, string>>({})
  const [dueDays, setDueDays]           = useState<Record<number, string>>({})
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategory, setNewCategory]   = useState({ name: '', frequency: 'monthly', description: '', category_type: 'fixed' })
  const [savingStructure, setSavingStructure] = useState(false)
  const [generatingLedger, setGeneratingLedger] = useState(false)
  const [lockingStructure, setLockingStructure] = useState(false)
  const [structureMsg, setStructureMsg] = useState('')
  const [deletingCatId, setDeletingCatId] = useState<number | null>(null)
  const [showAmendForm, setShowAmendForm] = useState<{ cat_id: number; grade: string; cat_name: string; current: number } | null>(null)
  const [amendForm, setAmendForm]       = useState({ new_amount: '', reason: '' })
  const [showAmendLog, setShowAmendLog] = useState(false)

  // Applicability tab state
  const [applGrade, setApplGrade]               = useState('')
  const [applStudents, setApplStudents]         = useState<ApplStudent[]>([])
  const [applCategories, setApplCategories]     = useState<ApplCategory[]>([])
  // amounts keyed as `${student_id}:${fee_category_id}`
  const [applAmounts, setApplAmounts]           = useState<Record<string, string>>({})
  const [applLoading, setApplLoading]           = useState(false)
  const [applSaving, setApplSaving]             = useState(false)
  const [applMsg, setApplMsg]                   = useState('')

  // Ledger
  const [ledger, setLedger]         = useState<LedgerEntry[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerGrade, setLedgerGrade] = useState('')
  const [ledgerStatus, setLedgerStatus] = useState('')
  const [ledgerSearch, setLedgerSearch] = useState('')

  // Ledger inline edit
  const [deletingId, setDeletingId]   = useState<number | null>(null)
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [editForm, setEditForm]       = useState({ new_amount: '', reason: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError]     = useState('')
  const [editHistories, setEditHistories] = useState<Record<number, EditRecord[]>>({})
  const [showHistoryId, setShowHistoryId] = useState<number | null>(null)
  const [paymentHistories, setPaymentHistories] = useState<Record<number, PaymentRecord[]>>({})
  const [showPaymentsId, setShowPaymentsId]     = useState<number | null>(null)

  // Collect (inline from ledger or search)
  const [collectSearch, setCollectSearch]   = useState('')
  const [collectEntries, setCollectEntries] = useState<LedgerEntry[]>([])
  const [collectLoading, setCollectLoading] = useState(false)
  const [selectedEntry, setSelectedEntry]   = useState<LedgerEntry | null>(null)
  const [payAmount, setPayAmount]           = useState('')
  const [payMode, setPayMode]               = useState('cash')
  const [payRef, setPayRef]                 = useState('')
  const [payCollectedBy, setPayCollectedBy] = useState(adminName || '')
  const [payDate, setPayDate]               = useState(new Date().toISOString().slice(0, 10))
  const [payNotes, setPayNotes]             = useState('')
  const [payError, setPayError]             = useState('')
  const [paySuccess, setPaySuccess]         = useState<PaySuccess | null>(null)
  const [showWaiver, setShowWaiver]         = useState(false)
  const [waiverForm, setWaiverForm]         = useState({ waiver_type: 'percentage', waiver_value: '', reason: '', granted_by_name: adminName || '' })
  const [waiverLoading, setWaiverLoading]   = useState(false)

  // Pending verifications
  const [pendingPayments, setPendingPayments]   = useState<PendingPayment[]>([])
  const [pendingLoading, setPendingLoading]     = useState(false)
  const [verifyingId, setVerifyingId]           = useState<number | null>(null)
  const [rejectReason, setRejectReason]         = useState('')
  const [showRejectForm, setShowRejectForm]     = useState<number | null>(null)
  const [verifyMsg, setVerifyMsg]               = useState('')

  // Reports tab
  const [reportData, setReportData]             = useState<ReportData | null>(null)
  const [reportLoading, setReportLoading]       = useState(false)

  // Year-end tab
  const [yearEndEntries, setYearEndEntries]     = useState<YearEndEntry[]>([])
  const [yearEndLoading, setYearEndLoading]     = useState(false)
  const [yearEndSelected, setYearEndSelected]   = useState<Set<number>>(new Set())
  const [yearEndAction, setYearEndAction]       = useState<'carry_forward' | 'write_off'>('write_off')
  const [yearEndToYear, setYearEndToYear]       = useState('')
  const [yearEndReason, setYearEndReason]       = useState('')
  const [yearEndProcessing, setYearEndProcessing] = useState(false)
  const [yearEndMsg, setYearEndMsg]             = useState('')

  // Amendment impact preview
  const [amendImpact, setAmendImpact]           = useState<number | null>(null)
  const [amendImpactLoading, setAmendImpactLoading] = useState(false)

  // Assignment history panel (Applicability tab)
  type AssignmentHistoryRow = { id: number; old_amount: number | null; new_amount: number; change_type: string; changed_by: string; changed_at: string }
  const [assignHistoryKey, setAssignHistoryKey] = useState<string | null>(null) // "studentId:catId"
  const [assignHistories, setAssignHistories]   = useState<Record<string, AssignmentHistoryRow[]>>({})
  const [assignHistLoading, setAssignHistLoading] = useState(false)

  // Structure history panel (Fee Setup)
  type StructureHistoryRow = { id: number; grade: string; old_amount: number | null; new_amount: number; old_due_day: number | null; new_due_day: number; change_type: string; changed_by: string; changed_at: string }
  const [structHistCatId, setStructHistCatId]   = useState<number | null>(null)
  const [structHistories, setStructHistories]   = useState<Record<number, StructureHistoryRow[]>>({})
  const [structHistLoading, setStructHistLoading] = useState(false)

  // Category changelog panel
  type CategoryChangeRow = { id: number; field_changed: string; old_value: string; new_value: string; changed_by: string; changed_at: string }
  const [catChangelogId, setCatChangelogId]     = useState<number | null>(null)
  const [catChangelogs, setCatChangelogs]       = useState<Record<number, CategoryChangeRow[]>>({})
  const [catChangelogLoading, setCatChangelogLoading] = useState(false)

  // ── Load academic years ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`/api/academic-year/current?school_id=${schoolId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/academic-years?school_id=${schoolId}`).then(r => r.ok ? r.json() : []),
    ]).then(([current, all]) => {
      const labels: string[] = Array.isArray(all) ? all.map((y: { label: string }) => y.label) : []
      const cur: string = current?.label ?? labels[0] ?? '2025-26'
      if (!labels.length) labels.push(cur)
      setAcademicYears(labels)
      setAcademicYear(cur)
    }).catch(() => { setAcademicYears(['2025-26']); setAcademicYear('2025-26') })
  }, [schoolId])

  // ── Overview stats ───────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!academicYear) return
    setStatsLoading(true)
    try {
      const r = await fetch(`/api/fees/stats?school_id=${schoolId}&academic_year=${academicYear}`)
      if (r.ok) setStats(await r.json())
    } catch { /* silent */ }
    setStatsLoading(false)
  }, [schoolId, academicYear])

  useEffect(() => { if (academicYear) loadStats() }, [loadStats, academicYear])

  // ── Setup: categories + structures + lock + amendments ───────────────────────
  const loadSetup = useCallback(async () => {
    if (!academicYear) return
    const [catRes, strRes, lockRes, amendRes] = await Promise.all([
      fetch(`/api/fees/categories?school_id=${schoolId}`),
      fetch(`/api/fees/structures?school_id=${schoolId}&academic_year=${academicYear}`),
      fetch(`/api/fees/structures/lock?school_id=${schoolId}&academic_year=${academicYear}`),
      fetch(`/api/fees/structures/amend?school_id=${schoolId}&academic_year=${academicYear}`),
    ])
    const cats: FeeCategory[] = catRes.ok ? await catRes.json() : []
    const strs: FeeStructure[] = strRes.ok ? await strRes.json() : []
    const lock = lockRes.ok ? await lockRes.json() : null
    const amends: Amendment[] = amendRes.ok ? await amendRes.json() : []
    setCategories(cats)
    setStructures(strs)
    setStructureLock(lock)
    setAmendments(amends)
    const init: Record<string, string> = {}
    strs.forEach(s => { init[`${s.fee_category_id}_${s.grade}`] = String(s.amount) })
    setEditAmounts(init)
    const initDueDays: Record<number, string> = {}
    strs.forEach(s => { if (!initDueDays[s.fee_category_id]) initDueDays[s.fee_category_id] = String(s.due_day) })
    setDueDays(initDueDays)

  }, [schoolId, academicYear])

  useEffect(() => { if (activeTab === 'setup' || activeTab === 'applicability') loadSetup() }, [activeTab, loadSetup])

  const loadReports = useCallback(async () => {
    if (!academicYear) return
    setReportLoading(true)
    const r = await fetch(`/api/fees/reports?school_id=${schoolId}&academic_year=${academicYear}`)
    if (r.ok) setReportData(await r.json())
    setReportLoading(false)
  }, [schoolId, academicYear])

  useEffect(() => { if (activeTab === 'reports' && academicYear) loadReports() }, [activeTab, loadReports, academicYear])

  const loadYearEnd = useCallback(async () => {
    if (!academicYear) return
    setYearEndLoading(true)
    const r = await fetch(`/api/fees/year-end?school_id=${schoolId}&academic_year=${academicYear}`)
    if (r.ok) { const d = await r.json(); setYearEndEntries(d.entries || []) }
    setYearEndLoading(false)
  }, [schoolId, academicYear])

  useEffect(() => { if (activeTab === 'yearend' && academicYear) loadYearEnd() }, [activeTab, loadYearEnd, academicYear])

  // ── Ledger ───────────────────────────────────────────────────────────────────
  const loadLedger = useCallback(async () => {
    if (!academicYear) return
    setLedgerLoading(true)
    const params = new URLSearchParams({ school_id: String(schoolId), academic_year: academicYear })
    if (ledgerGrade)  params.set('grade', ledgerGrade)
    if (ledgerStatus) params.set('status', ledgerStatus)
    const r = await fetch(`/api/fees/ledger?${params}`)
    if (r.ok) setLedger(await r.json())
    setLedgerLoading(false)
  }, [schoolId, academicYear, ledgerGrade, ledgerStatus])

  useEffect(() => { if (activeTab === 'ledger') loadLedger() }, [activeTab, loadLedger])

  async function loadEditHistory(ledgerId: number) {
    if (editHistories[ledgerId]) { setShowHistoryId(ledgerId); return }
    const r = await fetch(`/api/fees/ledger/${ledgerId}`)
    if (r.ok) {
      const rows = await r.json()
      setEditHistories(p => ({ ...p, [ledgerId]: rows }))
    }
    setShowHistoryId(ledgerId)
  }

  async function loadPaymentHistory(ledgerId: number) {
    const alreadyOpen = showPaymentsId === ledgerId
    setShowPaymentsId(alreadyOpen ? null : ledgerId)
    if (alreadyOpen || paymentHistories[ledgerId]) return
    const r = await fetch(`/api/fees/payments?school_id=${schoolId}&ledger_id=${ledgerId}`)
    if (r.ok) {
      const rows = await r.json()
      setPaymentHistories(p => ({ ...p, [ledgerId]: rows }))
    }
  }

  async function submitEdit(entry: LedgerEntry) {
    if (!editForm.new_amount || !editForm.reason) return
    setEditLoading(true); setEditError('')
    const r = await fetch(`/api/fees/ledger/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        new_amount: parseFloat(editForm.new_amount),
        reason: editForm.reason,
        changed_by: adminName || 'Admin',
      }),
    })
    const d = await r.json()
    if (r.ok) {
      setLedger(prev => prev.map(e => e.id === entry.id
        ? { ...e, amount_due: d.amount_due, balance: d.amount_due - d.amount_paid, status: d.status, has_edits: true }
        : e
      ))
      setEditHistories(p => { const next = { ...p }; delete next[entry.id]; return next })
      setEditingId(null)
      setEditForm({ new_amount: '', reason: '' })
    } else {
      setEditError(d.error || 'Failed to update')
    }
    setEditLoading(false)
  }

  async function deleteEntry(entry: LedgerEntry) {
    const r = await fetch(`/api/fees/ledger/${entry.id}?school_id=${schoolId}`, { method: 'DELETE' })
    if (r.ok) {
      setLedger(prev => prev.filter(e => e.id !== entry.id))
      setDeletingId(null)
    }
  }

  async function deleteCategory(catId: number) {
    const r = await fetch(`/api/fees/categories?id=${catId}`, { method: 'DELETE' })
    if (r.ok) {
      setCategories(prev => prev.filter(c => c.id !== catId))
      setDeletingCatId(null)
    } else {
      const d = await r.json()
      if (d.error === 'has_ledger_data') {
        // Automatically deactivate instead — fee history must be preserved
        await deactivateCategory(catId, false)
      }
    }
  }

  async function deactivateCategory(catId: number, closeConfirm = true) {
    const r = await fetch(`/api/fees/categories?id=${catId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false, changed_by: adminName || 'Admin' }),
    })
    if (r.ok) {
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, is_active: false } : c))
      if (closeConfirm) setDeletingCatId(null)
    }
  }

  async function reactivateCategory(catId: number) {
    const r = await fetch(`/api/fees/categories?id=${catId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true, changed_by: adminName || 'Admin' }),
    })
    if (r.ok) setCategories(prev => prev.map(c => c.id === catId ? { ...c, is_active: true } : c))
  }

  function printReceipt(data: PaySuccess) {
    const modeLabel: Record<string, string> = {
      cash: 'Cash', cheque: 'Cheque', dd: 'Demand Draft', upi: 'UPI', online: 'Online Transfer',
    }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${data.receipt_number}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:720px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:20px}
  .school{font-size:22px;font-weight:bold}
  .rtitle{font-size:15px;font-weight:bold;margin-top:6px;letter-spacing:1px}
  .rno{font-size:12px;color:#555;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
  .lbl{font-size:11px;color:#888;margin-bottom:2px}
  .val{font-size:14px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:14px 0}
  th{background:#f3f4f6;padding:9px 12px;text-align:left;font-size:12px;border:1px solid #ddd}
  td{padding:9px 12px;font-size:13px;border:1px solid #ddd}
  .tot td{font-weight:bold;background:#f9fafb}
  .ftr{margin-top:28px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr">
  <div class="school">${data.school_name}</div>
  <div class="rtitle">FEE RECEIPT</div>
  <div class="rno">Receipt No: <strong>${data.receipt_number}</strong></div>
</div>
<div class="grid2">
  <div><div class="lbl">Student Name</div><div class="val">${data.student_name}</div></div>
  <div><div class="lbl">Roll Number</div><div class="val">${data.roll_number}</div></div>
  <div><div class="lbl">Class</div><div class="val">Grade ${data.grade}${data.section}</div></div>
  <div><div class="lbl">Parent / Guardian</div><div class="val">${data.parent_name || '—'}</div></div>
</div>
<table>
  <thead><tr><th>Fee Category</th><th>Period</th><th>Amount Due</th><th>Amount Paid</th></tr></thead>
  <tbody>
    <tr><td>${data.category_name}</td><td>${data.period_label}</td>
    <td>₹${Number(data.amount_due).toLocaleString('en-IN')}</td>
    <td>₹${Number(data.amount).toLocaleString('en-IN')}</td></tr>
  </tbody>
  <tfoot><tr class="tot"><td colspan="3" style="text-align:right">Total Paid:</td>
    <td>₹${Number(data.amount).toLocaleString('en-IN')}</td></tr></tfoot>
</table>
<div class="grid2">
  <div><div class="lbl">Payment Mode</div><div class="val">${modeLabel[data.payment_mode] || data.payment_mode}</div></div>
  <div><div class="lbl">Payment Date</div><div class="val">${data.paid_date ? new Date(data.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</div></div>
  ${data.transaction_ref ? `<div><div class="lbl">Transaction Ref</div><div class="val">${data.transaction_ref}</div></div>` : ''}
  ${data.collected_by_name ? `<div><div class="lbl">Collected By</div><div class="val">${data.collected_by_name}</div></div>` : ''}
</div>
${data.notes ? `<div><div class="lbl">Notes</div><div class="val">${data.notes}</div></div>` : ''}
<div class="ftr">
  Generated on ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  &nbsp;·&nbsp; This is a computer-generated receipt and does not require a signature.
</div>
</body></html>`
    const win = window.open('', '_blank', 'width=800,height=650')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  const filteredLedger = ledger.filter(e =>
    !ledgerSearch ||
    e.student_name.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
    e.roll_number.toLowerCase().includes(ledgerSearch.toLowerCase())
  )

  // ── Collect: search students ─────────────────────────────────────────────────
  async function searchStudent(q: string) {
    if (!q.trim() || !academicYear) { setCollectEntries([]); return }
    setCollectLoading(true)
    const r = await fetch(`/api/fees/ledger?school_id=${schoolId}&academic_year=${academicYear}`)
    if (r.ok) {
      const all: LedgerEntry[] = await r.json()
      setCollectEntries(
        all.filter(e =>
          (e.student_name.toLowerCase().includes(q.toLowerCase()) || e.roll_number.toLowerCase().includes(q.toLowerCase()))
          && e.status !== 'paid' && e.status !== 'waived'
        )
      )
    }
    setCollectLoading(false)
  }

  function openCollect(entry: LedgerEntry) {
    setSelectedEntry(entry)
    setPayAmount(String(entry.balance > 0 ? entry.balance : entry.amount_due))
    setPayError(''); setPaySuccess(null); setShowWaiver(false)
    if (activeTab !== 'collect') setActiveTab('collect')
  }

  async function submitPayment() {
    if (!selectedEntry) return
    setCollectLoading(true); setPayError('')
    const r = await fetch('/api/fees/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, student_id: selectedEntry.student_id,
        ledger_id: selectedEntry.id, amount: parseFloat(payAmount),
        payment_mode: payMode, transaction_ref: payRef || null,
        collected_by_name: payCollectedBy || null, notes: payNotes || null, paid_date: payDate,
      }),
    })
    const d = await r.json()
    if (r.ok) {
      setPaySuccess({
        receipt_number: d.receipt_number, student_name: d.student_name, amount: d.amount,
        school_name: d.school_name || '', roll_number: d.roll_number || '',
        grade: d.grade || '', section: d.section || '', parent_name: d.parent_name || null,
        category_name: d.category_name || '', period_label: d.period_label || '',
        amount_due: d.amount_due || d.amount,
        payment_mode: payMode, paid_date: payDate,
        collected_by_name: payCollectedBy || null,
        transaction_ref: payRef || null, notes: payNotes || null,
      })
      setSelectedEntry(null); setCollectSearch(''); setCollectEntries([])
      loadStats()
      if (activeTab === 'ledger') loadLedger()
    } else {
      setPayError(d.error || 'Payment failed')
    }
    setCollectLoading(false)
  }

  async function submitWaiver() {
    if (!selectedEntry) return
    setWaiverLoading(true)
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
      setCollectSearch(''); setCollectEntries([])
      loadStats()
      if (activeTab === 'ledger') loadLedger()
    }
    setWaiverLoading(false)
  }

  // ── Setup actions ────────────────────────────────────────────────────────────
  async function addCategory() {
    if (!newCategory.name.trim()) return
    const r = await fetch('/api/fees/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, ...newCategory }),
    })
    if (r.ok) { setNewCategory({ name: '', frequency: 'monthly', description: '', category_type: 'fixed' }); setShowAddCategory(false); loadSetup() }
  }

  async function saveStructures() {
    setSavingStructure(true); setStructureMsg('')
    const structs = []
    for (const cat of categories) {
      for (const grade of GRADES) {
        const key = `${cat.id}_${grade}`
        const val = editAmounts[key]
        if (val && parseFloat(val) > 0)
          structs.push({ fee_category_id: cat.id, grade, amount: parseFloat(val), due_day: parseInt(dueDays[cat.id] || '10') || 10 })
      }
    }
    const r = await fetch('/api/fees/structures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, structures: structs, changed_by: adminName || 'Admin' }),
    })
    setStructureMsg(r.ok ? '✓ Structure saved' : 'Failed to save')
    setSavingStructure(false)
    loadSetup()
  }

  async function generateLedger() {
    setGeneratingLedger(true); setStructureMsg('')
    const r = await fetch('/api/fees/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear }),
    })
    const d = await r.json()
    setStructureMsg(r.ok ? `✓ Generated ${d.created} entries (${d.skipped} skipped)` : d.error || 'Failed')
    setGeneratingLedger(false)
    loadStats()
  }

  async function lockStructure() {
    setLockingStructure(true)
    const r = await fetch('/api/fees/structures/lock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, action: 'lock', locked_by: adminName || 'Admin' }),
    })
    if (r.ok) loadSetup()
    setLockingStructure(false)
  }

  async function unlockStructure() {
    setLockingStructure(true)
    await fetch('/api/fees/structures/lock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, action: 'unlock', locked_by: adminName || 'Admin' }),
    })
    loadSetup()
    setLockingStructure(false)
  }

  async function submitAmendment() {
    if (!showAmendForm || !amendForm.new_amount || !amendForm.reason) return
    const r = await fetch('/api/fees/structures/amend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, academic_year: academicYear,
        fee_category_id: showAmendForm.cat_id, grade: showAmendForm.grade,
        new_amount: parseFloat(amendForm.new_amount), reason: amendForm.reason,
        changed_by: adminName || 'Admin',
      }),
    })
    if (r.ok) {
      setShowAmendForm(null); setAmendForm({ new_amount: '', reason: '' })
      loadSetup()
    }
  }

  // ── Applicability tab ────────────────────────────────────────────────────────
  async function loadApplicability(grade: string) {
    if (!grade || !academicYear) return
    setApplLoading(true); setApplMsg('')
    try {
      const r = await fetch(`/api/fees/category-assignments?school_id=${schoolId}&grade=${grade}&academic_year=${academicYear}`)
      if (r.ok) {
        const { students, categories, amounts } = await r.json()
        setApplStudents(students)
        setApplCategories(categories)
        const init: Record<string, string> = {}
        amounts.forEach((a: { student_id: number; fee_category_id: number; amount: number }) => {
          init[`${a.student_id}:${a.fee_category_id}`] = String(a.amount)
        })
        setApplAmounts(init)
      }
    } catch { /* silent */ }
    setApplLoading(false)
  }

  async function saveApplicability() {
    if (!applGrade || !academicYear) return
    setApplSaving(true); setApplMsg('')
    const assignments: { student_id: number; fee_category_id: number; amount: string }[] = []
    applStudents.forEach(s => {
      applCategories.forEach(c => {
        const key = `${s.id}:${c.id}`
        assignments.push({ student_id: s.id, fee_category_id: c.id, amount: applAmounts[key] || '0' })
      })
    })
    const r = await fetch('/api/fees/category-assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, assignments, changed_by: adminName || 'Admin' }),
    })
    const d = await r.json()
    if (r.ok) {
      setApplMsg(`✓ Saved — ${d.upserted} assignments${d.ledgerUpdated > 0 ? `, ${d.ledgerUpdated} ledger entries updated` : ''}`)
    } else {
      setApplMsg(d.error || 'Failed to save')
    }
    setApplSaving(false)
  }

  async function toggleCategoryType(cat: FeeCategory) {
    const newType = cat.category_type === 'fixed' ? 'variable' : 'fixed'
    await fetch(`/api/fees/categories?id=${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_type: newType, changed_by: adminName || 'Admin' }),
    })
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, category_type: newType } : c))
  }

  async function loadAssignHistory(studentId: number, catId: number) {
    const key = `${studentId}:${catId}`
    if (assignHistoryKey === key) { setAssignHistoryKey(null); return }
    setAssignHistoryKey(key); setAssignHistLoading(true)
    if (!assignHistories[key]) {
      const r = await fetch(`/api/fees/assignment-history?school_id=${schoolId}&student_id=${studentId}&fee_category_id=${catId}&academic_year=${academicYear}`)
      if (r.ok) { const rows = await r.json(); setAssignHistories(p => ({ ...p, [key]: rows })) }
    }
    setAssignHistLoading(false)
  }

  async function loadStructHistory(catId: number) {
    if (structHistCatId === catId) { setStructHistCatId(null); return }
    setStructHistCatId(catId); setStructHistLoading(true)
    if (!structHistories[catId]) {
      const r = await fetch(`/api/fees/structure-history?school_id=${schoolId}&fee_category_id=${catId}&academic_year=${academicYear}`)
      if (r.ok) { const rows = await r.json(); setStructHistories(p => ({ ...p, [catId]: rows })) }
    }
    setStructHistLoading(false)
  }

  async function loadCatChangelog(catId: number) {
    if (catChangelogId === catId) { setCatChangelogId(null); return }
    setCatChangelogId(catId); setCatChangelogLoading(true)
    if (!catChangelogs[catId]) {
      const r = await fetch(`/api/fees/category-changelog?school_id=${schoolId}&category_id=${catId}`)
      if (r.ok) { const rows = await r.json(); setCatChangelogs(p => ({ ...p, [catId]: rows })) }
    }
    setCatChangelogLoading(false)
  }

  async function runYearEnd() {
    if (!yearEndSelected.size || !yearEndAction) return
    setYearEndProcessing(true); setYearEndMsg('')
    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, from_year: academicYear,
        to_year: yearEndAction === 'carry_forward' ? yearEndToYear : undefined,
        action: yearEndAction, ledger_ids: Array.from(yearEndSelected),
        reason: yearEndReason || undefined, done_by: adminName || 'Admin',
      }),
    })
    const d = await r.json()
    if (r.ok) {
      setYearEndMsg(`✓ ${d.processed} entries ${yearEndAction === 'write_off' ? 'written off' : 'carried forward'}`)
      setYearEndSelected(new Set())
      loadYearEnd()
    } else {
      setYearEndMsg(d.error || 'Failed')
    }
    setYearEndProcessing(false)
  }

  async function fetchAmendImpact(catId: number, grade: string) {
    if (!catId || !grade || !academicYear) return
    setAmendImpactLoading(true); setAmendImpact(null)
    const r = await fetch(`/api/fees/structures/amend?school_id=${schoolId}&academic_year=${academicYear}&preview=1&fee_category_id=${catId}&grade=${grade}`)
    if (r.ok) { const d = await r.json(); setAmendImpact(d.count) }
    setAmendImpactLoading(false)
  }

  // ── Pending verifications ────────────────────────────────────────────────────
  const loadPending = useCallback(async () => {
    setPendingLoading(true)
    const r = await fetch(`/api/fees/payments/verify?school_id=${schoolId}`)
    if (r.ok) setPendingPayments(await r.json())
    setPendingLoading(false)
  }, [schoolId])

  useEffect(() => { if (activeTab === 'pending') loadPending() }, [activeTab, loadPending])

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
      loadPending(); loadStats()
    } else {
      const d = await r.json()
      setVerifyMsg(d.error || 'Failed')
    }
    setVerifyingId(null)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fee Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Collect payments, manage structures, verify online payments</p>
        </div>
        <select
          value={academicYear}
          onChange={e => setAcademicYear(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'overview',      label: 'Overview' },
          { key: 'setup',         label: 'Fee Setup' },
          { key: 'applicability', label: 'Applicability' },
          { key: 'ledger',        label: 'Ledger' },
          { key: 'collect',       label: 'Collect' },
          { key: 'pending',       label: pendingPayments.length > 0 ? `Pending ● ${pendingPayments.length}` : 'Pending' },
          { key: 'reports',       label: 'Reports' },
          { key: 'yearend',       label: 'Year-End' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.key
                ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600'
                : t.key === 'pending' && pendingPayments.length > 0
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-24 mb-3" /><div className="h-7 bg-gray-200 rounded w-32" />
                </div>
              ))}
            </div>
          ) : stats?.summary ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Due</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(stats.summary.total_due)}</p>
                  <p className="text-xs text-gray-400 mt-1">{stats.summary.total_students} students</p>
                </div>
                <div className="bg-white rounded-xl border border-green-100 p-5">
                  <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Collected</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{fmt(stats.summary.total_collected)}</p>
                  <p className="text-xs text-green-500 mt-1">{pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}% of total</p>
                </div>
                <div className="bg-white rounded-xl border border-red-100 p-5">
                  <p className="text-xs text-red-500 font-medium uppercase tracking-wide">Outstanding</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{fmt(stats.summary.total_outstanding)}</p>
                  <p className="text-xs text-red-400 mt-1">{stats.summary.overdue_count} overdue entries</p>
                </div>
                <div className="bg-white rounded-xl border border-orange-100 p-5">
                  <p className="text-xs text-orange-500 font-medium uppercase tracking-wide">Defaulters</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{stats.summary.defaulters_count}</p>
                  <p className="text-xs text-orange-400 mt-1">students with zero payment</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Collection Progress</h3>
                <div className="flex gap-6 flex-wrap mb-4">
                  {[
                    { label: 'Paid',    count: stats.summary.paid_count,    color: 'bg-green-500' },
                    { label: 'Partial', count: stats.summary.partial_count, color: 'bg-yellow-400' },
                    { label: 'Pending', count: stats.summary.pending_count, color: 'bg-gray-300' },
                    { label: 'Overdue', count: stats.summary.overdue_count, color: 'bg-red-500' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${s.color}`} />
                      <span className="text-sm text-gray-600">{s.label}</span>
                      <span className="text-sm font-semibold text-gray-900">{s.count}</span>
                    </div>
                  ))}
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full transition-all" style={{ width: `${pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}%` }} />
                </div>
                <p className="text-xs text-green-600 font-medium mt-1 text-right">{pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}% collected</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Collection by Category</h3>
                  {stats.by_category.length === 0 ? <p className="text-sm text-gray-400">No data yet</p> : (
                    <div className="space-y-3">
                      {stats.by_category.map(cat => (
                        <div key={cat.category_name}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-700">{cat.category_name}</span>
                            <span className="text-xs text-gray-400">{fmt(cat.total_collected)} / {fmt(cat.total_due)}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${pct(Number(cat.total_collected), Number(cat.total_due))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Modes</h3>
                    {stats.by_payment_mode.length === 0 ? <p className="text-sm text-gray-400">No payments yet</p> : (
                      <div className="grid grid-cols-2 gap-2">
                        {stats.by_payment_mode.map(m => (
                          <div key={m.payment_mode} className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-400 capitalize">{m.payment_mode}</p>
                            <p className="text-sm font-semibold text-gray-800">{fmt(m.total)}</p>
                            <p className="text-xs text-gray-400">{m.count} txns</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-xl border border-red-50 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Defaulters</h3>
                    {stats.top_defaulters.length === 0 ? <p className="text-sm text-gray-400">No defaulters</p> : (
                      <div className="space-y-2">
                        {stats.top_defaulters.slice(0, 5).map(d => (
                          <div key={d.student_id} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{d.student_name}</p>
                              <p className="text-xs text-gray-400">Gr.{d.grade}{d.section} · {d.roll_number}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-red-600">{fmt(d.outstanding)}</p>
                              <p className="text-xs text-red-400">{d.overdue_entries} overdue</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400">No fee data for {academicYear}.</p>
              <button onClick={() => setActiveTab('setup')} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Set Up Fee Structure
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ SETUP ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'setup' && (
        <div className="space-y-5">

          {/* Lock status banner */}
          {structureLock ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-amber-600 text-lg">🔒</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Structure Locked</p>
                  <p className="text-xs text-amber-600">Locked by <strong>{structureLock.locked_by}</strong> on {fmtDate(structureLock.locked_at)} · Use Amend to change amounts</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAmendLog(p => !p)} className="text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100">
                  {showAmendLog ? 'Hide' : 'View'} Amendments ({amendments.length})
                </button>
                <button onClick={unlockStructure} disabled={lockingStructure} className="text-xs text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                  {lockingStructure ? 'Unlocking…' : 'Unlock'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-green-600 text-lg">🔓</span>
                <div>
                  <p className="text-sm font-semibold text-green-800">Structure is editable</p>
                  <p className="text-xs text-green-600">Lock it once finalized to prevent accidental changes</p>
                </div>
              </div>
              <button onClick={lockStructure} disabled={lockingStructure || categories.length === 0} className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
                {lockingStructure ? 'Locking…' : 'Lock Structure'}
              </button>
            </div>
          )}

          {/* Amendment log */}
          {showAmendLog && amendments.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Amendment History</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 font-semibold text-gray-500">Category</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-500">Grade</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-500">Old</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-500">New</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-500">Reason</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-500">By</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {amendments.map(a => (
                    <tr key={a.id} className="border-b border-gray-50">
                      <td className="px-4 py-2 text-gray-700">{a.category_name}</td>
                      <td className="px-4 py-2 text-gray-600">Grade {a.grade}</td>
                      <td className="px-4 py-2 text-right text-red-500 line-through">{fmt(a.old_amount)}</td>
                      <td className="px-4 py-2 text-right text-green-600 font-semibold">{fmt(a.new_amount)}</td>
                      <td className="px-4 py-2 text-gray-500">{a.reason}</td>
                      <td className="px-4 py-2 text-gray-500">{a.changed_by}</td>
                      <td className="px-4 py-2 text-gray-400">{fmtDate(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Amendment form */}
          {showAmendForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-blue-900 mb-3">
                Amend: {showAmendForm.cat_name} — Grade {showAmendForm.grade} · Current: {fmt(showAmendForm.current)}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">New Amount (₹)</label>
                  <input type="number" value={amendForm.new_amount} onChange={e => setAmendForm(p => ({ ...p, new_amount: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600">Reason (required)</label>
                  <input type="text" placeholder="e.g. Annual revision, board decision" value={amendForm.reason}
                    onChange={e => setAmendForm(p => ({ ...p, reason: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={submitAmendment} disabled={!amendForm.new_amount || !amendForm.reason}
                  className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  Save Amendment
                </button>
                <button onClick={() => { setShowAmendForm(null); setAmendImpact(null) }} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
                {amendImpactLoading && <span className="text-xs text-gray-400">Checking impact…</span>}
                {!amendImpactLoading && amendImpact !== null && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${amendImpact > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-50 text-gray-400'}`}>
                    {amendImpact > 0 ? `Will update ${amendImpact} unpaid ledger ${amendImpact === 1 ? 'entry' : 'entries'}` : 'No unpaid entries affected'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {structureMsg && (
                <span className={`text-sm ${structureMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{structureMsg}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAddCategory(true)} className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
                + Add Category
              </button>
              {!structureLock && (
                <>
                  <button onClick={saveStructures} disabled={savingStructure}
                    className="text-sm bg-blue-600 text-white hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-50">
                    {savingStructure ? 'Saving…' : 'Save Structure'}
                  </button>
                  <button onClick={generateLedger} disabled={generatingLedger}
                    className="text-sm bg-green-600 text-white hover:bg-green-700 px-4 py-1.5 rounded-lg disabled:opacity-50">
                    {generatingLedger ? 'Generating…' : 'Generate Ledger'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Add category panel */}
          {showAddCategory && (
            <div className="bg-white border border-blue-200 rounded-xl overflow-hidden shadow-sm">
              {/* Header */}
              <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-blue-800">Add Fee Category</p>
                <button onClick={() => { setShowAddCategory(false); setNewCategory({ name: '', frequency: 'monthly', description: '', category_type: 'fixed' }) }}
                  className="text-blue-400 hover:text-blue-600 text-lg leading-none">×</button>
              </div>

              <div className="p-4 space-y-4">
                {/* Step 1: Quick pick */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Step 1 — Pick a common category <span className="font-normal normal-case text-gray-400">(auto-fills frequency &amp; type)</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_SUGGESTIONS.map(s => {
                      const selected = newCategory.name === s.name
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => setNewCategory(p => ({ ...p, name: s.name, frequency: s.frequency, category_type: s.category_type }))}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                            selected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          {s.name}
                          {selected && <span className="ml-1">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Step 2: Customize */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Step 2 — Confirm or customise
                  </p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-600">Category Name</label>
                      <input
                        type="text"
                        placeholder="Or type a custom name…"
                        value={newCategory.name}
                        onChange={e => setNewCategory(p => ({ ...p, name: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Frequency</label>
                      <select
                        value={newCategory.frequency}
                        onChange={e => setNewCategory(p => ({ ...p, frequency: e.target.value }))}
                        className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                        <option value="one_time">One Time</option>
                      </select>
                    </div>
                  </div>

                  {/* Fixed / Variable */}
                  <div className="mt-3 flex items-stretch gap-3">
                    <button
                      onClick={() => setNewCategory(p => ({ ...p, category_type: 'fixed' }))}
                      className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                        newCategory.category_type === 'fixed'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${newCategory.category_type === 'fixed' ? 'border-green-500 bg-green-500' : 'border-gray-300'}`} />
                        <span className={`text-sm font-semibold ${newCategory.category_type === 'fixed' ? 'text-green-700' : 'text-gray-600'}`}>Fixed</span>
                      </div>
                      <p className="text-xs text-gray-400 pl-5">Same amount for all students in a grade. Set once in the grid.</p>
                    </button>
                    <button
                      onClick={() => setNewCategory(p => ({ ...p, category_type: 'variable' }))}
                      className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                        newCategory.category_type === 'variable'
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${newCategory.category_type === 'variable' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                        <span className={`text-sm font-semibold ${newCategory.category_type === 'variable' ? 'text-orange-700' : 'text-gray-600'}`}>Variable</span>
                      </div>
                      <p className="text-xs text-gray-400 pl-5">Different amount per student. Set per-student in Applicability tab.</p>
                    </button>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100">
                  <button
                    onClick={() => { setShowAddCategory(false); setNewCategory({ name: '', frequency: 'monthly', description: '', category_type: 'fixed' }) }}
                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addCategory}
                    disabled={!newCategory.name.trim()}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-40"
                  >
                    Add Category
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Fee structure grid */}
          {categories.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">No fee categories yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Freq</th>
                      <th className="text-center px-2 py-3 font-semibold text-gray-600 text-xs">Due Day</th>
                      {GRADES.map(g => (
                        <th key={g} className="text-center px-1 py-3 font-semibold text-gray-600 text-xs">Gr.{g}</th>
                      ))}
                      {!structureLock && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(cat => (
                      <tr key={cat.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium ${cat.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{cat.name}</span>
                            {!cat.is_active && (
                              <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-medium">Inactive</span>
                            )}
                            <button onClick={() => loadStructHistory(cat.id)}
                              title="Amount change history"
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${structHistCatId === cat.id ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-300 hover:text-indigo-600 hover:border-indigo-300'}`}>
                              Hist
                            </button>
                            <button onClick={() => loadCatChangelog(cat.id)}
                              title="Config change log"
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${catChangelogId === cat.id ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-300 hover:text-amber-600 hover:border-amber-300'}`}>
                              Log
                            </button>
                          </div>

                          {/* Structure history panel */}
                          {structHistCatId === cat.id && (
                            <div className="mt-2 bg-indigo-50 rounded-lg p-2 text-[10px] max-h-40 overflow-y-auto">
                              <p className="font-semibold text-indigo-700 mb-1 uppercase tracking-wide">Amount Change History</p>
                              {structHistLoading ? <p className="text-indigo-400">Loading…</p> :
                               !(structHistories[cat.id]?.length) ? <p className="text-gray-400 italic">No changes recorded yet. History is tracked from next save onwards.</p> : (
                                <div className="space-y-1">
                                  {structHistories[cat.id].map(h => (
                                    <div key={h.id} className="bg-white rounded px-2 py-1 border border-indigo-100 flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-indigo-600">Gr.{h.grade}</span>
                                      {h.old_amount !== null && <><span className="line-through text-gray-400">₹{h.old_amount}</span><span className="text-gray-300">→</span></>}
                                      <span className="font-bold text-indigo-800">₹{h.new_amount}</span>
                                      {h.old_due_day !== null && h.old_due_day !== h.new_due_day && (
                                        <span className="text-gray-400">due:{h.old_due_day}→{h.new_due_day}</span>
                                      )}
                                      <span className="text-gray-400">· {h.changed_by}</span>
                                      <span className="text-gray-400">· {new Date(h.changed_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Category changelog panel */}
                          {catChangelogId === cat.id && (
                            <div className="mt-2 bg-amber-50 rounded-lg p-2 text-[10px] max-h-40 overflow-y-auto">
                              <p className="font-semibold text-amber-700 mb-1 uppercase tracking-wide">Config Change Log</p>
                              {catChangelogLoading ? <p className="text-amber-400">Loading…</p> :
                               !(catChangelogs[cat.id]?.length) ? <p className="text-gray-400 italic">No config changes recorded yet.</p> : (
                                <div className="space-y-1">
                                  {catChangelogs[cat.id].map(h => (
                                    <div key={h.id} className="bg-white rounded px-2 py-1 border border-amber-100 flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-amber-700 capitalize">{h.field_changed}</span>
                                      <span className="line-through text-gray-400">{h.old_value}</span>
                                      <span className="text-gray-300">→</span>
                                      <span className="font-bold text-amber-800">{h.new_value}</span>
                                      <span className="text-gray-400">· {h.changed_by}</span>
                                      <span className="text-gray-400">· {new Date(h.changed_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {!structureLock && deletingCatId === cat.id && (
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {Number(cat.ledger_count) > 0 ? (
                                <>
                                  <span className="text-xs text-amber-700">Has {cat.ledger_count} fee records — deactivate to preserve history.</span>
                                  <button onClick={() => deactivateCategory(cat.id)}
                                    className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-0.5 rounded-md font-medium">Deactivate</button>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs text-red-600">Permanently delete this unused category?</span>
                                  <button onClick={() => deleteCategory(cat.id)}
                                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-0.5 rounded-md font-medium">Yes, delete</button>
                                </>
                              )}
                              <button onClick={() => setDeletingCatId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5">Cancel</button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{cat.frequency}</span>
                        </td>
                        <td className="px-1 py-2 text-center">
                          {structureLock ? (
                            <span className="text-xs text-gray-500">{dueDays[cat.id] || '10'}</span>
                          ) : (
                            <div>
                              <input
                                type="number" min="1" max="28" placeholder="10"
                                value={dueDays[cat.id] || ''}
                                onChange={e => setDueDays(p => ({ ...p, [cat.id]: e.target.value }))}
                                className="w-14 text-center border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                              <p className="text-[10px] text-gray-400 mt-0.5">of month</p>
                            </div>
                          )}
                        </td>
                        {GRADES.map(grade => {
                          const key = `${cat.id}_${grade}`
                          const currentAmt = parseFloat(editAmounts[key] || '0')
                          if (cat.category_type === 'variable') {
                            return (
                              <td key={grade} className="px-1 py-2 text-center">
                                <span className="text-[10px] text-gray-300">per student</span>
                              </td>
                            )
                          }
                          return (
                            <td key={grade} className="px-1 py-2">
                              {structureLock ? (
                                <div className="text-center">
                                  {currentAmt > 0 ? (
                                    <button
                                      onClick={() => { setShowAmendForm({ cat_id: cat.id, grade, cat_name: cat.name, current: currentAmt }); setAmendImpact(null); fetchAmendImpact(cat.id, grade) }}
                                      className="text-xs text-blue-600 hover:underline w-16 text-center"
                                      title="Click to amend"
                                    >
                                      {fmt(currentAmt)}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-300">—</span>
                                  )}
                                </div>
                              ) : (
                                <input
                                  type="number" min="0" placeholder="0"
                                  value={editAmounts[key] || ''}
                                  onChange={e => setEditAmounts(p => ({ ...p, [key]: e.target.value }))}
                                  className="w-16 text-center border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                              )}
                            </td>
                          )
                        })}
                        {!structureLock && (
                          <td className="px-2 py-2 text-center">
                            {cat.is_active ? (
                              <button
                                onClick={() => setDeletingCatId(deletingCatId === cat.id ? null : cat.id)}
                                title={Number(cat.ledger_count) > 0 ? 'Deactivate category' : 'Delete category'}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                                  deletingCatId === cat.id
                                    ? 'bg-red-100 text-red-600'
                                    : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => reactivateCategory(cat.id)}
                                title="Reactivate category"
                                className="text-[10px] text-green-600 hover:text-green-700 hover:bg-green-50 px-1.5 py-0.5 rounded font-medium border border-green-200 whitespace-nowrap"
                              >
                                Restore
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!structureLock && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <strong>Setup steps:</strong> 1) Add categories → 2) Enter amounts per grade → 3) Save Structure → 4) Generate Ledger → 5) Lock once finalized
            </div>
          )}
        </div>
      )}

      {/* ═══ APPLICABILITY ═══════════════════════════════════════════════════════ */}
      {activeTab === 'applicability' && (
        <div className="space-y-4">
          {/* Info + grade selector */}
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              Set per-student amounts for <strong>Variable</strong> categories (e.g. Transport). Fixed categories apply to all students automatically.
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={applGrade} onChange={e => { setApplGrade(e.target.value); setApplStudents([]); setApplCategories([]); setApplAmounts({}); setApplMsg('') }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                <option value="">Select grade…</option>
                {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
              </select>
              <button onClick={() => loadApplicability(applGrade)} disabled={!applGrade || applLoading}
                className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {applLoading ? 'Loading…' : 'Load'}
              </button>
            </div>
          </div>

          {/* Category type overview */}
          {categories.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Fee Categories</p>
                <p className="text-xs text-gray-400">Click to toggle Fixed / Variable per category</p>
              </div>
              <div className="divide-y divide-gray-50">
                {categories.map(cat => (
                  <div key={cat.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                      <span className="text-xs text-gray-400 capitalize ml-2">{cat.frequency}</span>
                    </div>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                      <button
                        onClick={() => cat.category_type !== 'fixed' && toggleCategoryType(cat)}
                        className={`px-3 py-1 transition-colors ${cat.category_type === 'fixed' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >Fixed</button>
                      <button
                        onClick={() => cat.category_type !== 'variable' && toggleCategoryType(cat)}
                        className={`px-3 py-1 border-l border-gray-200 transition-colors ${cat.category_type === 'variable' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >Variable</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-student amount grid */}
          {applGrade && !applLoading && applStudents.length > 0 && applCategories.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  Grade {applGrade} — Variable Fee Amounts <span className="text-gray-400 font-normal">({applStudents.length} students)</span>
                </p>
                <p className="text-xs text-gray-400">Leave blank = not applicable for that student</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Student</th>
                      <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs whitespace-nowrap">Section</th>
                      {applCategories.map(c => (
                        <th key={c.id} className="text-center px-3 py-2.5 font-medium text-gray-600 text-xs whitespace-nowrap min-w-28">
                          {c.name}
                          <div className="text-gray-400 font-normal capitalize">{c.frequency}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {applStudents.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-800 text-sm">{s.name}</p>
                          <p className="text-xs text-gray-400">#{s.roll_number}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{s.section}</td>
                        {applCategories.map(c => {
                          const key = `${s.id}:${c.id}`
                          const isShowingHist = assignHistoryKey === key
                          return (
                            <td key={c.id} className="px-2 py-2 text-center">
                              <div className="relative inline-flex items-center gap-1">
                                <span className="absolute left-2 text-gray-400 text-xs pointer-events-none">₹</span>
                                <input
                                  type="number" min="0" placeholder="—"
                                  value={applAmounts[key] || ''}
                                  onChange={e => setApplAmounts(p => ({ ...p, [key]: e.target.value }))}
                                  className="w-24 pl-5 pr-1 py-1 text-center border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                                <button
                                  onClick={() => loadAssignHistory(s.id, c.id)}
                                  title="View change history"
                                  className={`text-[10px] px-1 py-0.5 rounded transition-colors flex-shrink-0 ${isShowingHist ? 'bg-indigo-100 text-indigo-700' : 'text-gray-300 hover:text-indigo-500'}`}
                                >
                                  ⟳
                                </button>
                              </div>
                              {/* Inline history for this cell */}
                              {isShowingHist && (
                                <div className="mt-1 text-left bg-indigo-50 rounded-lg p-2 min-w-52 text-[10px]">
                                  {assignHistLoading ? (
                                    <p className="text-indigo-400">Loading…</p>
                                  ) : (assignHistories[key] || []).length === 0 ? (
                                    <p className="text-gray-400 italic">No changes recorded yet</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {(assignHistories[key] || []).map(h => (
                                        <div key={h.id} className="bg-white rounded px-2 py-1 border border-indigo-100">
                                          <span className={`font-semibold capitalize mr-1 ${h.change_type === 'removed' ? 'text-red-500' : h.change_type === 'added' ? 'text-green-600' : 'text-amber-600'}`}>
                                            {h.change_type}
                                          </span>
                                          {h.old_amount !== null && <><span className="line-through text-gray-400">₹{h.old_amount}</span> → </>}
                                          <span className="font-bold text-gray-700">₹{h.new_amount}</span>
                                          <span className="text-gray-400 ml-1">by {h.changed_by}</span>
                                          <div className="text-gray-400">{new Date(h.changed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                {applMsg && (
                  <span className={`text-sm ${applMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{applMsg}</span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => {
                      applCategories.forEach(c => {
                        applStudents.forEach(s => {
                          const key = `${s.id}:${c.id}`
                          if (!applAmounts[key]) setApplAmounts(p => ({ ...p, [key]: '' }))
                        })
                      })
                    }}
                    className="text-sm text-gray-500 px-3 py-1.5 hover:text-gray-700"
                  >Clear All</button>
                  <button onClick={saveApplicability} disabled={applSaving}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg font-medium disabled:opacity-50">
                    {applSaving ? 'Saving…' : 'Save & Update Ledger'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {applGrade && !applLoading && applCategories.length === 0 && applStudents.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              No variable categories found. Mark at least one category as <strong>Variable</strong> above to set per-student amounts.
            </div>
          )}

          {applGrade && !applLoading && applStudents.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
              No active students in Grade {applGrade}.
            </div>
          )}
        </div>
      )}

      {/* ═══ LEDGER ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={ledgerGrade} onChange={e => setLedgerGrade(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="">All Grades</option>
              {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
            <select value={ledgerStatus} onChange={e => setLedgerStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
              <option value="paid">Paid</option>
              <option value="waived">Waived</option>
            </select>
            <input type="text" placeholder="Search student / roll no…" value={ledgerSearch}
              onChange={e => setLedgerSearch(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={loadLedger} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">Refresh</button>
            <a
              href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger${ledgerGrade ? `&grade=${ledgerGrade}` : ''}${ledgerStatus ? `&status=${ledgerStatus}` : ''}`}
              download
              className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
            >
              Export CSV
            </a>
          </div>

          {ledgerLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400 text-sm">Loading…</p>
            </div>
          ) : filteredLedger.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">No entries found. Generate ledger from Fee Setup first.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm text-gray-500">{filteredLedger.length} entries</p>
                <p className="text-sm font-medium text-gray-700">
                  Outstanding: <span className="text-red-600">{fmt(filteredLedger.reduce((s, e) => s + Number(e.balance), 0))}</span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Student</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Category · Period</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Due</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Paid</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Balance</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Due Date</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map(entry => {
                      const canEdit = !['paid', 'waived'].includes(entry.status)
                      const isEditing = editingId === entry.id
                      const history = editHistories[entry.id]
                      const hasEdits = entry.has_edits || (history && history.length > 0)
                      return (
                        <Fragment key={entry.id}>
                          <tr className={`border-b border-gray-50 hover:bg-gray-50 ${isEditing ? 'bg-amber-50' : ''}`}>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-gray-800">{entry.student_name}</div>
                              <div className="text-xs text-gray-400">Gr.{entry.grade}{entry.section} · {entry.roll_number}</div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">
                              <span>{entry.category_name}</span>
                              <span className="text-gray-400"> · {entry.period_label}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="font-medium text-gray-800">{fmt(entry.amount_due)}</span>
                              {hasEdits && (
                                <button
                                  onClick={() => setShowHistoryId(showHistoryId === entry.id ? null : entry.id)}
                                  className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium"
                                  title="This entry was edited — click to see history"
                                >
                                  edited
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-green-600">{fmt(entry.amount_paid)}</span>
                              {Number(entry.waiver_amount) > 0 && (
                                <div className="text-[10px] text-purple-600 font-medium">incl. {fmt(entry.waiver_amount)} waived</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmt(entry.balance)}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">
                              {entry.due_date}
                              {Number(entry.days_overdue) > 0 && <span className="ml-1 text-red-400">({entry.days_overdue}d)</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[entry.status]}`}>
                                {entry.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {deletingId === entry.id ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-red-600 font-medium">Delete?</span>
                                  <button onClick={() => deleteEntry(entry)}
                                    className="text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg hover:bg-red-700">
                                    Yes
                                  </button>
                                  <button onClick={() => setDeletingId(null)}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1">
                                    No
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {['pending', 'partial', 'overdue'].includes(entry.status) && (
                                    <button onClick={() => openCollect(entry)}
                                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap">
                                      Collect →
                                    </button>
                                  )}
                                  {canEdit && (
                                    <button
                                      onClick={() => {
                                        if (isEditing) { setEditingId(null); setEditForm({ new_amount: '', reason: '' }); setEditError('') }
                                        else { setEditingId(entry.id); setEditForm({ new_amount: String(entry.amount_due), reason: '' }); setEditError('') }
                                      }}
                                      className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${isEditing ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                    >
                                      {isEditing ? 'Cancel' : 'Edit'}
                                    </button>
                                  )}
                                  {Number(entry.amount_paid) === 0 && !['paid', 'waived'].includes(entry.status) && (
                                    <button onClick={() => { setDeletingId(entry.id); setEditingId(null) }}
                                      className="text-xs border border-red-200 text-red-500 hover:bg-red-50 px-2.5 py-1 rounded-lg">
                                      Delete
                                    </button>
                                  )}
                                  {entry.has_edits && !history && (
                                    <button onClick={() => loadEditHistory(entry.id)}
                                      className="text-xs text-gray-400 hover:text-gray-600"
                                      title="Load edit history">
                                      ⟳
                                    </button>
                                  )}
                                  <button
                                    onClick={() => loadPaymentHistory(entry.id)}
                                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${showPaymentsId === entry.id ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                    title="View payment history"
                                  >
                                    Pmts
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Inline edit form */}
                          {isEditing && (
                            <tr className="bg-amber-50 border-b border-amber-100">
                              <td colSpan={8} className="px-4 py-3">
                                <div className="flex items-end gap-3">
                                  <div>
                                    <label className="text-xs font-medium text-gray-600">New Amount (₹)</label>
                                    <input
                                      type="number"
                                      value={editForm.new_amount}
                                      onChange={e => setEditForm(p => ({ ...p, new_amount: e.target.value }))}
                                      className="mt-1 w-32 border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                    />
                                    {Number(entry.amount_paid) > 0 && (
                                      <p className="text-xs text-gray-400 mt-0.5">Min: {fmt(entry.amount_paid)} (already paid)</p>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <label className="text-xs font-medium text-gray-600">Reason for change (required)</label>
                                    <input
                                      type="text"
                                      placeholder="e.g. Joined mid-month, prorated · Wrong amount entered · Fee revision"
                                      value={editForm.reason}
                                      onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}
                                      className="mt-1 w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 pb-0.5">
                                    {editError && <span className="text-xs text-red-600">{editError}</span>}
                                    <button
                                      onClick={() => submitEdit(entry)}
                                      disabled={editLoading || !editForm.new_amount || !editForm.reason}
                                      className="text-sm bg-amber-600 text-white px-4 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50 font-medium whitespace-nowrap"
                                    >
                                      {editLoading ? 'Saving…' : 'Save Change'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Edit history panel */}
                          {showHistoryId === entry.id && history && history.length > 0 && (
                            <tr className="bg-amber-50 border-b border-amber-100">
                              <td colSpan={8} className="px-4 py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Edit History</p>
                                  <button onClick={() => setShowHistoryId(null)} className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
                                </div>
                                <div className="space-y-1.5">
                                  {history.map(h => (
                                    <div key={h.id} className="flex items-center gap-4 text-xs bg-white rounded-lg px-3 py-2 border border-amber-100">
                                      <span className="text-red-500 line-through font-mono">{fmt(h.old_amount)}</span>
                                      <span className="text-gray-400">→</span>
                                      <span className="text-green-600 font-semibold font-mono">{fmt(h.new_amount)}</span>
                                      <span className="text-gray-500 flex-1">"{h.reason}"</span>
                                      <span className="text-gray-400">by <strong>{h.changed_by}</strong></span>
                                      <span className="text-gray-400">{new Date(h.changed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Payment history panel */}
                          {showPaymentsId === entry.id && (
                            <tr className="bg-indigo-50 border-b border-indigo-100">
                              <td colSpan={8} className="px-4 py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Payment History</p>
                                  <button onClick={() => setShowPaymentsId(null)} className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
                                </div>
                                {!paymentHistories[entry.id] ? (
                                  <p className="text-xs text-indigo-400">Loading…</p>
                                ) : paymentHistories[entry.id].length === 0 ? (
                                  <p className="text-xs text-gray-400 italic">No payments recorded for this entry yet.</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-left text-indigo-600 border-b border-indigo-100">
                                          <th className="pb-1.5 pr-4 font-semibold">Receipt #</th>
                                          <th className="pb-1.5 pr-4 font-semibold">Date</th>
                                          <th className="pb-1.5 pr-4 font-semibold text-right">Amount</th>
                                          <th className="pb-1.5 pr-4 font-semibold">Mode</th>
                                          <th className="pb-1.5 pr-4 font-semibold">Ref</th>
                                          <th className="pb-1.5 pr-4 font-semibold">Collected By</th>
                                          <th className="pb-1.5 font-semibold">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-indigo-50">
                                        {paymentHistories[entry.id].map(p => (
                                          <tr key={p.id} className="bg-white/70 hover:bg-white">
                                            <td className="py-1.5 pr-4 font-mono text-indigo-600">{p.receipt_number}</td>
                                            <td className="py-1.5 pr-4 text-gray-600">{fmtDate(p.paid_date)}</td>
                                            <td className="py-1.5 pr-4 text-right font-semibold text-green-700">{fmt(p.amount)}</td>
                                            <td className="py-1.5 pr-4 uppercase text-gray-500">{p.payment_mode}</td>
                                            <td className="py-1.5 pr-4 text-gray-400 font-mono">{p.transaction_ref || '—'}</td>
                                            <td className="py-1.5 pr-4 text-gray-500">{p.collected_by_name || '—'}</td>
                                            <td className="py-1.5">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                                                p.payment_status === 'completed' ? 'bg-green-100 text-green-700' :
                                                p.payment_status === 'rejected'  ? 'bg-red-100 text-red-600' :
                                                'bg-yellow-100 text-yellow-700'
                                              }`}>{p.payment_status}</span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ COLLECT ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'collect' && (
        <div className="grid grid-cols-5 gap-5">
          {/* Left: search */}
          <div className="col-span-2 space-y-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Find Student</h3>
              <input type="text" placeholder="Search by name or roll number…" value={collectSearch}
                onChange={e => { setCollectSearch(e.target.value); searchStudent(e.target.value) }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {collectLoading && <div className="bg-white rounded-xl border border-gray-100 p-4 text-center text-sm text-gray-400">Searching…</div>}
            {collectEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-xs text-gray-400 font-medium">Pending Entries ({collectEntries.length})</p>
                </div>
                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {collectEntries.map(entry => (
                    <button key={entry.id} onClick={() => openCollect(entry)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${selectedEntry?.id === entry.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{entry.student_name}</p>
                          <p className="text-xs text-gray-400">{entry.category_name} · {entry.period_label}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-600">{fmt(entry.balance)}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLORS[entry.status]}`}>{entry.status}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: form */}
          <div className="col-span-3">
            {paySuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-green-800 mb-1">Payment Recorded!</h3>
                <p className="text-green-700 mb-1">{paySuccess.student_name}</p>
                <p className="text-2xl font-bold text-green-800 mb-2">{fmt(paySuccess.amount)}</p>
                <div className="bg-white border border-green-200 rounded-lg px-4 py-2 inline-block mb-4">
                  <p className="text-xs text-green-500 font-medium">Receipt Number</p>
                  <p className="text-base font-bold text-green-800 font-mono">{paySuccess.receipt_number}</p>
                </div>
                <div className="flex items-center gap-3 justify-center">
                  <button
                    onClick={() => printReceipt(paySuccess!)}
                    className="bg-white border border-green-300 text-green-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Receipt
                  </button>
                  <button onClick={() => { setPaySuccess(null); setCollectSearch(''); setCollectEntries([]) }}
                    className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                    Collect Another
                  </button>
                </div>
              </div>
            ) : selectedEntry ? (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                {/* Entry info */}
                <div className="bg-gray-50 rounded-lg p-4 mb-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-base font-semibold text-gray-800">{selectedEntry.student_name}</p>
                      <p className="text-sm text-gray-500">Grade {selectedEntry.grade}{selectedEntry.section} · {selectedEntry.roll_number}</p>
                      <p className="text-sm text-gray-500 mt-1">{selectedEntry.category_name} · {selectedEntry.period_label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Balance Due</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(selectedEntry.balance > 0 ? selectedEntry.balance : selectedEntry.amount_due)}</p>
                      <p className="text-xs text-gray-400">of {fmt(selectedEntry.amount_due)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => setShowWaiver(false)}
                    className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${!showWaiver ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    Record Payment
                  </button>
                  <button onClick={() => setShowWaiver(true)}
                    className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${showWaiver ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    Grant Waiver
                  </button>
                </div>

                {!showWaiver ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Amount (₹)</label>
                        <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <p className="text-xs text-gray-400 mt-0.5">Partial payment allowed</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Payment Mode</label>
                        <select value={payMode} onChange={e => setPayMode(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="cash">Cash</option>
                          <option value="cheque">Cheque</option>
                          <option value="dd">Demand Draft</option>
                          <option value="upi">UPI</option>
                          <option value="online">Online Transfer</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Payment Date</label>
                        <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Collected By</label>
                        <input type="text" placeholder="Staff name" value={payCollectedBy}
                          onChange={e => setPayCollectedBy(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    {['cheque', 'dd', 'upi', 'online'].includes(payMode) && (
                      <div>
                        <label className="text-xs font-medium text-gray-600">Transaction Ref / Cheque No</label>
                        <input type="text" placeholder="Reference number" value={payRef}
                          onChange={e => setPayRef(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
                      <input type="text" placeholder="Any remarks" value={payNotes}
                        onChange={e => setPayNotes(e.target.value)}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {payError && <p className="text-sm text-red-600">{payError}</p>}
                    <button onClick={submitPayment} disabled={collectLoading || !payAmount}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                      {collectLoading ? 'Recording…' : `Record Payment of ${payAmount ? fmt(payAmount) : '₹0'}`}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Waiver Type</label>
                        <select value={waiverForm.waiver_type} onChange={e => setWaiverForm(p => ({ ...p, waiver_type: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                          <option value="percentage">Percentage (%)</option>
                          <option value="fixed_amount">Fixed Amount (₹)</option>
                          <option value="full">Full Waiver</option>
                        </select>
                      </div>
                      {waiverForm.waiver_type !== 'full' && (
                        <div>
                          <label className="text-xs font-medium text-gray-600">
                            {waiverForm.waiver_type === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}
                          </label>
                          <input type="number" value={waiverForm.waiver_value}
                            onChange={e => setWaiverForm(p => ({ ...p, waiver_value: e.target.value }))}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Reason (required)</label>
                      <input type="text" placeholder="e.g. Financial hardship, merit scholarship" value={waiverForm.reason}
                        onChange={e => setWaiverForm(p => ({ ...p, reason: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Approved By</label>
                      <input type="text" placeholder="Principal / Admin name" value={waiverForm.granted_by_name}
                        onChange={e => setWaiverForm(p => ({ ...p, granted_by_name: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    </div>
                    <button onClick={submitWaiver} disabled={waiverLoading || !waiverForm.reason}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                      {waiverLoading ? 'Granting…' : 'Grant Waiver'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-gray-400 text-sm">Search a student on the left, or click <strong>Collect →</strong> on any Ledger row</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ PENDING VERIFICATIONS ═══════════════════════════════════════════════ */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Online Payments — Pending Verification</h2>
              <p className="text-xs text-gray-400 mt-0.5">Parents submit payments online. Approve once confirmed, reject if not received.</p>
            </div>
            <button onClick={loadPending} className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">Refresh</button>
          </div>

          {verifyMsg && (
            <div className={`text-sm px-4 py-3 rounded-lg ${verifyMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {verifyMsg}
            </div>
          )}

          {pendingLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400 text-sm">Loading…</p>
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-700 font-medium">All clear!</p>
              <p className="text-gray-400 text-sm mt-1">No online payments pending verification.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100 flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                <p className="text-sm font-semibold text-yellow-800">{pendingPayments.length} payment{pendingPayments.length !== 1 ? 's' : ''} awaiting verification</p>
              </div>
              <div className="divide-y divide-gray-50">
                {pendingPayments.map(pmt => (
                  <div key={pmt.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-800">{pmt.student_name}</p>
                          <span className="text-xs text-gray-400">Gr.{pmt.grade}{pmt.section} · {pmt.roll_number}</span>
                        </div>
                        <p className="text-xs text-gray-500">{pmt.category_name} · {pmt.period_label}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-flex items-center gap-1.5 bg-yellow-100 border border-yellow-200 text-yellow-800 text-xs font-bold font-mono px-2.5 py-1 rounded-lg">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {pmt.receipt_number}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          <span>{pmt.paid_date}</span>
                          <span>·</span>
                          <span className="uppercase font-medium">{pmt.payment_mode}</span>
                          {pmt.transaction_ref && <><span>·</span><span className="font-mono">{pmt.transaction_ref}</span></>}
                        </div>
                        {pmt.notes && <p className="text-xs text-gray-400 mt-1 italic">{pmt.notes}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-gray-800">{fmt(pmt.amount)}</p>
                        <p className="text-xs text-gray-400">of {fmt(pmt.ledger_balance)} balance</p>
                      </div>
                    </div>

                    {showRejectForm === pmt.id ? (
                      <div className="mt-3 flex items-center gap-2">
                        <input type="text" placeholder="Reason for rejection…" value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          className="flex-1 text-sm border border-red-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300" />
                        <button onClick={() => verifyPayment(pmt.id, 'reject')} disabled={verifyingId === pmt.id || !rejectReason}
                          className="text-sm bg-red-600 text-white px-4 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50">
                          {verifyingId === pmt.id ? 'Rejecting…' : 'Confirm Reject'}
                        </button>
                        <button onClick={() => setShowRejectForm(null)} className="text-sm text-gray-400 px-2 py-1.5">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => verifyPayment(pmt.id, 'approve')} disabled={verifyingId === pmt.id}
                          className="text-sm bg-green-600 text-white px-5 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                          {verifyingId === pmt.id ? 'Approving…' : '✓ Approve'}
                        </button>
                        <button onClick={() => setShowRejectForm(pmt.id)}
                          className="text-sm border border-red-200 text-red-600 px-4 py-1.5 rounded-lg hover:bg-red-50">
                          ✗ Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ REPORTS ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Annual Financial Report — {academicYear}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Complete collection analysis for the academic year</p>
            </div>
            <div className="flex gap-2">
              <button onClick={loadReports} className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">Refresh</button>
              <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=payments`} download
                className="text-sm border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                Export Payments CSV
              </a>
              <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download
                className="text-sm border border-green-200 text-green-600 px-3 py-1.5 rounded-lg hover:bg-green-50">
                Export Ledger CSV
              </a>
            </div>
          </div>

          {reportLoading ? (
            <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-gray-100 animate-pulse" />)}</div>
          ) : reportData ? (
            <>
              {/* Balance sheet */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Billed',      val: reportData.balance.total_billed,      color: 'text-gray-800',  bg: 'bg-white' },
                  { label: 'Total Collected',   val: reportData.balance.total_collected,   color: 'text-green-700', bg: 'bg-green-50' },
                  { label: 'Total Outstanding', val: reportData.balance.total_outstanding, color: 'text-red-600',   bg: 'bg-red-50' },
                  { label: 'Total Waived',      val: reportData.balance.total_waived,      color: 'text-purple-700',bg: 'bg-purple-50' },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl border border-gray-100 p-4`}>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{s.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${s.color}`}>{fmt(s.val)}</p>
                    <p className="text-xs text-gray-400 mt-1">{reportData.balance.total_students} students</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Grade-wise collection */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Grade-wise Collection</h3>
                  <div className="space-y-3">
                    {reportData.byGrade.map(g => {
                      const pct = g.total_due > 0 ? Math.round((Number(g.total_collected) / Number(g.total_due)) * 100) : 0
                      return (
                        <div key={g.grade}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">Grade {g.grade} <span className="text-gray-400">({g.students} students)</span></span>
                            <span className="text-gray-500">{fmt(g.total_collected)} / {fmt(g.total_due)} <span className="font-bold text-blue-600">{pct}%</span></span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Payment mode breakdown */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Collection by Payment Mode</h3>
                  <div className="space-y-3">
                    {reportData.byMode.map(m => (
                      <div key={m.payment_mode} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 capitalize">{m.payment_mode}</span>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-gray-800">{fmt(m.total)}</span>
                          <span className="text-xs text-gray-400 ml-2">({m.count} txns)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Category-wise summary */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Category-wise Annual Summary</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-left px-4 py-2.5 font-semibold">Category</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Billed</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Collected</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Waived</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Outstanding</th>
                        <th className="text-center px-4 py-2.5 font-semibold">Paid / Unpaid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.byCategory.map(c => (
                        <tr key={c.category_name} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{c.category_name}</p>
                            <p className="text-xs text-gray-400 capitalize">{c.frequency}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{fmt(c.total_due)}</td>
                          <td className="px-4 py-2.5 text-right text-green-600 font-medium">{fmt(c.total_collected)}</td>
                          <td className="px-4 py-2.5 text-right text-purple-600">{Number(c.total_waived) > 0 ? fmt(c.total_waived) : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-medium">{fmt(c.outstanding)}</td>
                          <td className="px-4 py-2.5 text-center text-xs">
                            <span className="text-green-600">{c.paid_count} paid</span>
                            <span className="text-gray-300 mx-1">·</span>
                            <span className="text-red-500">{c.unpaid_count} unpaid</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Defaulters list */}
              {reportData.defaulters.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Fee Defaulters — {reportData.defaulters.length} students</p>
                    <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger&status=overdue`} download
                      className="text-xs text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50">
                      Export Defaulters
                    </a>
                  </div>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="border-b border-gray-100 text-xs text-gray-500">
                          <th className="text-left px-4 py-2 font-semibold">Student</th>
                          <th className="text-left px-4 py-2 font-semibold">Grade</th>
                          <th className="text-left px-4 py-2 font-semibold">Parent / Phone</th>
                          <th className="text-right px-4 py-2 font-semibold">Outstanding</th>
                          <th className="text-center px-4 py-2 font-semibold">Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.defaulters.map((d, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <p className="font-medium text-gray-800">{d.student_name}</p>
                              <p className="text-xs text-gray-400">#{d.roll_number}</p>
                            </td>
                            <td className="px-4 py-2 text-gray-600">Gr.{d.grade}{d.section}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{d.parent_name || '—'}{d.parent_phone ? ` · ${d.parent_phone}` : ''}</td>
                            <td className="px-4 py-2 text-right font-bold text-red-600">{fmt(d.outstanding)}</td>
                            <td className="px-4 py-2 text-center">
                              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">{d.overdue_entries}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">Click Refresh to load the annual report.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ YEAR-END ════════════════════════════════════════════════════════════ */}
      {activeTab === 'yearend' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Year-End Fee Management — {academicYear}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Handle unpaid entries at year-end: write them off or carry them forward to the next year.</p>
          </div>

          {/* Action controls */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setYearEndAction('write_off')}
                className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${yearEndAction === 'write_off' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${yearEndAction === 'write_off' ? 'border-red-500 bg-red-500' : 'border-gray-300'}`} />
                  <span className={`text-sm font-semibold ${yearEndAction === 'write_off' ? 'text-red-700' : 'text-gray-600'}`}>Write Off</span>
                </div>
                <p className="text-xs text-gray-400 pl-5">Mark selected unpaid entries as waived. Fee history preserved. No new entry in next year.</p>
              </button>
              <button
                onClick={() => setYearEndAction('carry_forward')}
                className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${yearEndAction === 'carry_forward' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${yearEndAction === 'carry_forward' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                  <span className={`text-sm font-semibold ${yearEndAction === 'carry_forward' ? 'text-blue-700' : 'text-gray-600'}`}>Carry Forward</span>
                </div>
                <p className="text-xs text-gray-400 pl-5">Create a new pending entry in next year's ledger for the balance. Student still owes the amount.</p>
              </button>
            </div>

            <div className="flex items-end gap-3">
              {yearEndAction === 'carry_forward' && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Carry forward to year</label>
                  <input type="text" placeholder="e.g. 2026-27" value={yearEndToYear}
                    onChange={e => setYearEndToYear(e.target.value)}
                    className="mt-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" />
                </div>
              )}
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                <input type="text" placeholder={yearEndAction === 'write_off' ? 'e.g. Year-end reconciliation' : 'e.g. Carrying forward dues to next year'}
                  value={yearEndReason} onChange={e => setYearEndReason(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={runYearEnd} disabled={yearEndProcessing || yearEndSelected.size === 0 || (yearEndAction === 'carry_forward' && !yearEndToYear.trim())}
                className={`px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 ${yearEndAction === 'write_off' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {yearEndProcessing ? 'Processing…' : `${yearEndAction === 'write_off' ? 'Write Off' : 'Carry Forward'} ${yearEndSelected.size > 0 ? `(${yearEndSelected.size})` : ''}`}
              </button>
            </div>
            {yearEndMsg && (
              <p className={`text-sm font-medium ${yearEndMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{yearEndMsg}</p>
            )}
          </div>

          {/* Unpaid entries table */}
          {yearEndLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
          ) : yearEndEntries.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-green-600 font-medium">All fees settled!</p>
              <p className="text-gray-400 text-sm mt-1">No unpaid entries for {academicYear}.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox"
                    checked={yearEndSelected.size === yearEndEntries.length}
                    onChange={e => setYearEndSelected(e.target.checked ? new Set(yearEndEntries.map(r => r.id)) : new Set())}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <p className="text-sm text-gray-600">{yearEndEntries.length} unpaid entries · {yearEndSelected.size} selected</p>
                </div>
                <p className="text-sm font-medium text-red-600">
                  Total Outstanding: {fmt(yearEndEntries.reduce((s, e) => s + Number(e.balance), 0))}
                </p>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr className="text-xs text-gray-500">
                      <th className="px-4 py-2 w-8" />
                      <th className="text-left px-4 py-2 font-semibold">Student</th>
                      <th className="text-left px-4 py-2 font-semibold">Category · Period</th>
                      <th className="text-right px-4 py-2 font-semibold">Due</th>
                      <th className="text-right px-4 py-2 font-semibold">Paid</th>
                      <th className="text-right px-4 py-2 font-semibold">Balance</th>
                      <th className="text-left px-4 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearEndEntries.map(e => (
                      <tr key={e.id} className={`border-b border-gray-50 hover:bg-gray-50 ${yearEndSelected.has(e.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-2">
                          <input type="checkbox" checked={yearEndSelected.has(e.id)}
                            onChange={ev => {
                              const next = new Set(yearEndSelected)
                              if (ev.target.checked) next.add(e.id); else next.delete(e.id)
                              setYearEndSelected(next)
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        </td>
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-800">{e.student_name}</p>
                          <p className="text-xs text-gray-400">Gr.{e.grade}{e.section} · #{e.roll_number}</p>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{e.category_name} · <span className="text-gray-400">{e.period_label}</span></td>
                        <td className="px-4 py-2 text-right text-gray-700">{fmt(e.amount_due)}</td>
                        <td className="px-4 py-2 text-right text-green-600">{fmt(e.amount_paid)}</td>
                        <td className="px-4 py-2 text-right font-bold text-red-600">{fmt(e.balance)}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[e.status] || 'bg-gray-100 text-gray-600'}`}>{e.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
