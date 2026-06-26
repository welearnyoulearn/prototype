'use client'

import { useEffect, useState, useCallback, Fragment, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useFeature } from '../features-context'

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
  roll_number: string; school_roll_number: number | null; grade: string; section: string
  email: string | null; phone: string | null
  parent_name: string | null; parent_phone: string | null; parent_email: string | null
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
  by_class?: Array<{ grade: string; section?: string; students: number; total_due: number; total_collected: number; outstanding: number; fully_paid_students?: number; defaulter_students?: number }>
  unbilled_students?: number
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
  byGrade: Array<{ grade: string; section?: string; students: number; total_due: number; total_collected: number; outstanding: number; fully_paid_students?: number; defaulter_students?: number }>
  byCategory: Array<{ category_name: string; frequency: string; students: number; total_due: number; total_collected: number; total_waived: number; outstanding: number; paid_count: number; unpaid_count: number }>
  byMode: Array<{ payment_mode: string; count: number; total: number }>
  defaulters: Array<{ student_name: string; roll_number: string; grade: string; section: string; parent_name: string | null; parent_phone: string | null; outstanding: number; overdue_entries: number; unpaid_entries: number }>
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

const GRADE_GROUPS = [
  { key: 'primary',   label: 'Primary',   sub: 'Grade 1–5',   grades: ['1','2','3','4','5'] },
  { key: 'middle',    label: 'Middle',    sub: 'Grade 6–8',   grades: ['6','7','8'] },
  { key: 'secondary', label: 'Secondary', sub: 'Grade 9–10',  grades: ['9','10'] },
  { key: 'senior',    label: 'Senior',    sub: 'Grade 11–12',  grades: ['11','12'] },
]

const FREQ_LABEL: Record<string, string> = {
  monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half Yearly', annual: 'Annual', one_time: 'One Time',
}
const FREQ_HELP: Record<string, string> = {
  monthly: '12 bills/year (Apr–Mar)', quarterly: '4 bills/year', half_yearly: '2 bills/year (Apr & Oct)', annual: '1 bill/year, repeats', one_time: '1 bill ever, never repeats',
}
const FEE_ICONS: Record<string, string> = {
  tuition: '📘', transport: '🚌', exam: '📝', admission: '🎓', hostel: '🏠',
  book: '📚', uniform: '👕', sport: '⚽', activity: '⚽', annual: '📅',
  library: '📖', lab: '🔬', fine: '⚠️', late: '⚠️', misc: '📋',
}
function feeIcon(name: string): string {
  const n = name.toLowerCase()
  for (const key of Object.keys(FEE_ICONS)) if (n.includes(key)) return FEE_ICONS[key]
  return '💰'
}

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

// ─── Money input sanitization ──────────────────────────────────────────────────
// Keeps only digits and a single decimal point (max 2 dp), strips letters,
// scientific notation, signs, and bad pastes. type="number" alone allows
// "e", "+", "-" and pasted text — this closes those gaps.
function sanitizeMoney(raw: string): string {
  let v = raw.replace(/[^\d.]/g, '')      // drop everything except digits and dot
  const firstDot = v.indexOf('.')
  if (firstDot !== -1) {
    // keep only the first dot; remove any subsequent dots
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
    const [int, dec] = v.split('.')
    v = int + '.' + (dec ?? '').slice(0, 2) // max 2 decimal places
  }
  return v
}

// Block keystrokes that type="number" otherwise permits (e/E/+/-).
function blockNonNumericKeys(e: ReactKeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault()
}

// ─── Fee Audit Report → print-HTML (used for "Save as PDF") ────────────────────
const RUPEE = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`
function buildAuditPdfHtml(rep: Record<string, unknown>): string {
  const meta = rep.meta as { school_name: string; academic_year: string; generated_by: string; generated_on: string; scope?: string }
  const head = `
    <div class="hdr">
      <div class="title">${rep.kind === 'student' ? 'Individual Student Fee Report' : 'Fee Audit Report'}</div>
      <div class="sub">${meta.school_name} · ${meta.academic_year}${meta.scope ? ' · ' + meta.scope : ''}</div>
      <div class="meta">Generated by ${meta.generated_by} on ${new Date(meta.generated_on).toLocaleString('en-IN')}</div>
    </div>`
  const style = `<style>
    body{font-family:Arial,sans-serif;padding:28px;color:#222;max-width:980px;margin:0 auto;font-size:12px}
    .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px}
    .title{font-size:20px;font-weight:bold}.sub{font-size:13px;color:#555;margin-top:4px}.meta{font-size:11px;color:#888;margin-top:3px}
    h3{font-size:13px;margin:18px 0 6px;border-left:3px solid #1e3a5f;padding-left:8px}
    table{width:100%;border-collapse:collapse;margin-bottom:10px}
    th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:11px;border:1px solid #1e3a5f}
    td{padding:5px 8px;font-size:11px;border:1px solid #ddd}
    td.r,th.r{text-align:right}
    .tot td{font-weight:bold;background:#f3f4f6}
    @media print{body{padding:0}}
  </style>`
  const moneyHead = `<tr><th>Billed</th><th class="r">Waived</th><th class="r">Net Demand</th><th class="r">Paid</th><th class="r">Balance</th></tr>`

  if (rep.kind === 'student') {
    const s = rep.student as { name: string; roll_number: string; grade: string; section: string; parent_name: string | null; parent_phone: string | null }
    const bal = rep.balance as { billed: number; waived: number; net_demand: number; paid: number; balance: number }
    const bills = rep.bills as Array<{ fee_type: string; period_label: string; billed: number; waived: number; paid: number; balance: number; status: string }>
    const pays = rep.payments as Array<{ receipt_number: string; paid_date: string; fee_type: string; period_label: string; amount: number; payment_mode: string; payment_status: string }>
    const wvs = rep.waivers as Array<{ fee_type: string; period_label: string; waiver_amount: number; reason: string; granted_by_name: string | null; is_revoked: boolean }>
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Student Fee Report</title>${style}</head><body>${head}
      <h3>Student Profile</h3>
      <table><tr><td><b>Name</b></td><td>${s.name}</td><td><b>Roll No</b></td><td>${s.roll_number}</td><td><b>Class</b></td><td>${s.grade}${s.section || ''}</td></tr>
      <tr><td><b>Parent</b></td><td>${s.parent_name || '—'}</td><td><b>Phone</b></td><td colspan="3">${s.parent_phone || '—'}</td></tr></table>
      <h3>Fee Balance</h3>
      <table><thead>${moneyHead}</thead><tbody><tr class="tot"><td class="r">${RUPEE(bal.billed)}</td><td class="r">${RUPEE(bal.waived)}</td><td class="r">${RUPEE(bal.net_demand)}</td><td class="r">${RUPEE(bal.paid)}</td><td class="r">${RUPEE(bal.balance)}</td></tr></tbody></table>
      <h3>Fee Structure</h3>
      <table><thead><tr><th>Fee Type</th><th>Period</th><th class="r">Billed</th><th class="r">Waived</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th></tr></thead>
      <tbody>${bills.map(b => `<tr><td>${b.fee_type}</td><td>${b.period_label}</td><td class="r">${RUPEE(b.billed)}</td><td class="r">${RUPEE(b.waived)}</td><td class="r">${RUPEE(b.paid)}</td><td class="r">${RUPEE(b.balance)}</td><td>${b.status}</td></tr>`).join('')}</tbody></table>
      <h3>Payment History</h3>
      <table><thead><tr><th>Receipt</th><th>Date</th><th>Fee · Period</th><th class="r">Amount</th><th>Mode</th><th>Status</th></tr></thead>
      <tbody>${pays.map(p => `<tr><td>${p.receipt_number}</td><td>${p.paid_date}</td><td>${p.fee_type} · ${p.period_label}</td><td class="r">${RUPEE(p.amount)}</td><td>${p.payment_mode}</td><td>${p.payment_status}</td></tr>`).join('') || '<tr><td colspan="6">No payments</td></tr>'}</tbody></table>
      <h3>Waivers</h3>
      <table><thead><tr><th>Fee · Period</th><th class="r">Amount</th><th>Reason</th><th>Granted By</th><th>Status</th></tr></thead>
      <tbody>${wvs.map(w => `<tr><td>${w.fee_type} · ${w.period_label}</td><td class="r">${RUPEE(w.waiver_amount)}</td><td>${w.reason}</td><td>${w.granted_by_name || ''}</td><td>${w.is_revoked ? 'Revoked' : 'Active'}</td></tr>`).join('') || '<tr><td colspan="5">No waivers</td></tr>'}</tbody></table>
      </body></html>`
  }

  // bulk
  const sm = rep.summary as { billed: number; waived: number; net_demand: number; paid: number; balance: number; students: number }
  const byType = rep.by_type as Array<{ fee_type: string; billed: number; waived: number; net_demand: number; paid: number; balance: number }>
  const byClass = rep.by_class as Array<{ class: string; fee_type: string; billed: number; waived: number; net_demand: number; paid: number; balance: number }>
  const byStudent = rep.by_student as Array<{ student: string; roll_number: string; class: string; fee_type: string; is_subtotal: boolean; billed: number; waived: number; net_demand: number; paid: number; balance: number }>
  const log = rep.change_log as Array<{ at: string; type: string; detail: string; amount: number | null; user: string }>
  const mrow = (o: { billed: number; waived: number; net_demand: number; paid: number; balance: number }) =>
    `<td class="r">${RUPEE(o.billed)}</td><td class="r">${RUPEE(o.waived)}</td><td class="r">${RUPEE(o.net_demand)}</td><td class="r">${RUPEE(o.paid)}</td><td class="r">${RUPEE(o.balance)}</td>`
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fee Audit Report</title>${style}</head><body>${head}
    <h3>1. Fee Summary <span style="font-weight:normal;color:#888">(${sm.students} students)</span></h3>
    <table><thead>${moneyHead}</thead><tbody><tr class="tot">${mrow(sm)}</tr></tbody></table>
    <h3>2. Fee Type Summary</h3>
    <table><thead><tr><th>Fee Type</th><th class="r">Billed</th><th class="r">Waived</th><th class="r">Net Demand</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
    <tbody>${byType.map(t => `<tr><td>${t.fee_type}</td>${mrow(t)}</tr>`).join('')}</tbody></table>
    <h3>3. Fee Change Log</h3>
    <table><thead><tr><th>Date & Time</th><th>Action</th><th>Detail</th><th class="r">Amount</th><th>User</th></tr></thead>
    <tbody>${log.map(l => `<tr><td>${new Date(l.at).toLocaleString('en-IN')}</td><td>${l.type}</td><td>${l.detail}</td><td class="r">${l.amount != null ? RUPEE(l.amount) : ''}</td><td>${l.user || ''}</td></tr>`).join('') || '<tr><td colspan="5">No changes recorded</td></tr>'}</tbody></table>
    <h3>4. Class-wise Fee Details</h3>
    <table><thead><tr><th>Class</th><th>Fee Type</th><th class="r">Billed</th><th class="r">Waived</th><th class="r">Net Demand</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
    <tbody>${byClass.map(c => `<tr><td>${c.class}</td><td>${c.fee_type}</td>${mrow(c)}</tr>`).join('')}</tbody></table>
    <h3>5. Student-wise Fee Details <span style="font-weight:normal;color:#888">(by fee type)</span></h3>
    <table><thead><tr><th>Student</th><th>School Roll</th><th>Class</th><th>Fee Type</th><th class="r">Billed</th><th class="r">Waived</th><th class="r">Net Demand</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
    <tbody>${byStudent.map(s => s.is_subtotal
      ? `<tr class="tot"><td colspan="3">${s.student}</td><td>SUBTOTAL</td>${mrow(s)}</tr>`
      : `<tr><td>${s.student}</td><td>${s.roll_number}</td><td>${s.class}</td><td>${s.fee_type}</td>${mrow(s)}</tr>`).join('')}</tbody></table>
    </body></html>`
}

// ─── Component ────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic'

export default function FeeManagement({
  schoolId, adminName
}: {
  schoolId: number
  adminName?: string
}) {
  type Tab = 'overview' | 'setup' | 'applicability' | 'ledger' | 'collect' | 'pending' | 'students' | 'reports' | 'yearend'
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const hasOnlinePayments = useFeature('online-payments')

  // Shared
  const [academicYear, setAcademicYear]   = useState('')
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [closedYears, setClosedYears]     = useState<Set<string>>(new Set())


  // Overview
  const [stats, setStats]             = useState<FeeStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  type RecentPayment = {
    id: number; student_name: string; grade: string; section: string
    roll_number: string; category_name: string; period_label: string
    amount: number; payment_mode: string; receipt_number: string; paid_date: string
  }
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([])

  type GradeStat = { grade: string; section?: string; students: number; total_due: number; total_collected: number; outstanding: number; fully_paid_students?: number; defaulter_students?: number }
  const [gradeStats, setGradeStats] = useState<GradeStat[]>([])

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

  // ── Fee Plan (new Tab 2) ──
  // Sub-view: 'heads' = fee head cards (existing); 'variable' = combined all-variable-fees grid
  const [planView, setPlanView] = useState<'heads' | 'variable'>('heads')
  // School UPI ID (for online fee payments) — managed here in Fee Setup
  const [upiId, setUpiId]           = useState('')
  const [upiSaving, setUpiSaving]   = useState(false)
  const [upiMsg, setUpiMsg]         = useState('')
  const [upiLoaded, setUpiLoaded]   = useState(false)
  // Combined variable-fee grid (class scoped)
  type VarGridStudent = { id: number; name: string; roll_number: string; section: string }
  type VarGridCategory = { id: number; name: string; frequency: string }
  const [vgGrade, setVgGrade]               = useState('')
  const [vgSection, setVgSection]           = useState('all')
  const [vgStudents, setVgStudents]         = useState<VarGridStudent[]>([])
  const [vgCategories, setVgCategories]     = useState<VarGridCategory[]>([])
  const [vgAmounts, setVgAmounts]           = useState<Record<string, string>>({})   // `${sid}:${cid}` -> amount
  const [vgOriginal, setVgOriginal]         = useState<Record<string, string>>({})   // snapshot for change detection
  const [vgLoading, setVgLoading]           = useState(false)
  const [vgSaving, setVgSaving]             = useState(false)
  const [vgMsg, setVgMsg]                   = useState('')
  // Which fee head is being managed in the expanded panel (null = list view)
  const [planManageCatId, setPlanManageCatId] = useState<number | null>(null)
  // Add-fee wizard
  const [showAddFee, setShowAddFee] = useState(false)
  const [addFeeStep, setAddFeeStep] = useState(1)
  // Grade-group amount inputs (for "same for all" fees) keyed by group name
  const [groupAmounts, setGroupAmounts] = useState<Record<string, string>>({})
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
  const [waiverError, setWaiverError]       = useState('')
  const [showPayConfirm, setShowPayConfirm] = useState(false)

  // WhatsApp reminder state

  // Pending verifications
  const [pendingPayments, setPendingPayments]   = useState<PendingPayment[]>([])
  const [pendingLoading, setPendingLoading]     = useState(false)
  const [verifyingId, setVerifyingId]           = useState<number | null>(null)
  const [rejectReason, setRejectReason]         = useState('')
  const [showRejectForm, setShowRejectForm]     = useState<number | null>(null)
  const [verifyMsg, setVerifyMsg]               = useState('')

  // Generate bills confirmation dialog
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)

  // ── Collection (new Tab 3) ──
  type CollectionView = 'counter' | 'online' | 'defaulters' | 'dayclose'
  const [collectionView, setCollectionView]     = useState<CollectionView>('counter')
  // Student whose dues panel is expanded (student_id), with all their open entries
  const [openStudentId, setOpenStudentId]       = useState<number | null>(null)
  // entries to collect in the inline form, keyed by ledger entry id (checked = include)
  const [collectChecked, setCollectChecked]     = useState<Set<number>>(new Set())
  const [showCollectForm, setShowCollectForm]   = useState(false)
  // completed payments for the expanded student (for cancel/correct at the counter)
  const [counterPayments, setCounterPayments]   = useState<PaymentRecord[]>([])
  const [counterPmtLoading, setCounterPmtLoading] = useState(false)
  const [showCounterHistory, setShowCounterHistory] = useState(false)
  const [showPassbookModal, setShowPassbookModal] = useState(false)
  // Day close
  type DayCloseData = {
    date: string
    by_mode: Record<string, { count: number; total: number }>
    receipts: { first: string | null; last: string | null; count: number; total: number }
    already_closed: boolean
  }
  const [dayCloseData, setDayCloseData]         = useState<DayCloseData | null>(null)
  const [dayCloseDate, setDayCloseDate]         = useState(new Date().toISOString().slice(0, 10))
  const [dayCloseLoading, setDayCloseLoading]   = useState(false)
  const [actualCash, setActualCash]             = useState('')
  const [dayCloseMsg, setDayCloseMsg]           = useState('')
  const [dayCloseSubmitting, setDayCloseSubmitting] = useState(false)

  // ── Student Passbook (Tab 4) ──
  type PassbookTimeline = {
    date: string; type: 'bill' | 'payment' | 'waiver' | 'amendment'
    description: string; debit: number; credit: number; balance: number
    by: string; reference: string | null
  }
  type PassbookData = {
    student: { id: number; name: string; roll_number: string; grade: string; section: string; parent_name: string | null; parent_phone: string | null; parent_email: string | null }
    summary: { total_billed: number; total_paid: number; total_waived: number; outstanding: number }
    timeline: PassbookTimeline[]
    ledger: LedgerEntry[]
    payments: PaymentRecord[]
    pending_payments: PaymentRecord[]
    waivers: Array<{ id: number; waiver_type: string; waiver_amount: number; reason: string; granted_by_name: string | null; created_at: string; fee_head_name: string; period_label: string }>
  }
  type PassbookSearchResult = { id: number; name: string; roll_number: string; grade: string; section: string }
  const [pbSearch, setPbSearch]                 = useState('')
  const [pbErr, setPbErr]                        = useState('')
  const [pbData, setPbData]                     = useState<PassbookData | null>(null)
  const [pbLoading, setPbLoading]               = useState(false)
  const [pbSection, setPbSection]               = useState<'timeline' | 'bills' | 'payments' | 'waivers'>('bills')
  // Full student directory for the Passbook tab (browse + filter)
  const [pbAllStudents, setPbAllStudents]       = useState<PassbookSearchResult[]>([])
  const [pbAllLoading, setPbAllLoading]         = useState(false)
  const [pbGrade, setPbGrade]                   = useState('')
  // Payment cancel / correct
  const [cancelPmtId, setCancelPmtId]           = useState<number | null>(null)
  const [cancelMode, setCancelMode]             = useState<'cancel' | 'correct'>('cancel')
  const [cancelReason, setCancelReason]         = useState('')
  const [correctAmount, setCorrectAmount]       = useState('')
  const [cancelBusy, setCancelBusy]             = useState(false)
  const [cancelMsg, setCancelMsg]               = useState('')
  // Waiver revoke / correct
  const [cancelWaiverId, setCancelWaiverId]     = useState<number | null>(null)
  const [cancelWaiverMode, setCancelWaiverMode] = useState<'revoke' | 'correct'>('revoke')
  const [cancelWaiverReason, setCancelWaiverReason] = useState('')
  const [correctWaiverAmount, setCorrectWaiverAmount] = useState('')
  const [cancelWaiverBusy, setCancelWaiverBusy] = useState(false)
  const [cancelWaiverMsg, setCancelWaiverMsg]   = useState('')

  // Reports tab
  const [reportData, setReportData]             = useState<ReportData | null>(null)
  const [reportLoading, setReportLoading]       = useState(false)
  type AuditRow = { at: string; who: string; action: string; detail: string; amount: number | null }
  const [auditLog, setAuditLog]                 = useState<AuditRow[]>([])
  const [auditLoading, setAuditLoading]         = useState(false)
  const [showAuditLog, setShowAuditLog]         = useState(false)
  // Audit Report export panel
  const [arScope, setArScope]                   = useState<'school' | 'class'>('school')
  const [arGrade, setArGrade]                   = useState('')
  const [arSection, setArSection]               = useState('all')
  const [arStudentSearch, setArStudentSearch]   = useState('')
  const [arStudentResults, setArStudentResults] = useState<{ id: number; name: string; grade: string; section: string; roll_number: string }[]>([])
  const [arBusy, setArBusy]                     = useState(false)
  const [arMsg, setArMsg]                       = useState('')

  // Year-end tab (new student-grouped flow)
  type YearEndBill = { id: number; fee_category_id: number; category_name: string; period_label: string; amount_due: number; amount_paid: number; balance: number; due_date: string; status: string }
  type YearEndStudent = { student_id: number; student_name: string; roll_number: string; grade: string; section: string; student_status: string; is_leaver: boolean; leaver_reason: string | null; total_unpaid: number; bills: YearEndBill[] }
  type YearEndState = {
    academic_year: string
    summary: { total_billed: number; total_collected: number; total_waived: number; total_unpaid: number }
    students: YearEndStudent[]
    unpaid_count: number
    target_year: string
    target_year_exists: boolean
    is_closed: boolean
    close_record: { closed_by: string; closed_at: string; carried_total: number; writeoff_total: number; open_total: number } | null
  }
  const [yearEnd, setYearEnd]                   = useState<YearEndState | null>(null)
  const [yearEndLoading, setYearEndLoading]     = useState(false)
  // per-student decision: studentId -> 'carry' | 'writeoff' | 'open'
  const [yeDecisions, setYeDecisions]           = useState<Record<number, 'carry' | 'writeoff' | 'open'>>({})
  const [yeReasons, setYeReasons]               = useState<Record<number, string>>({})
  const [yeFilter, setYeFilter]                 = useState<'all' | 'leavers' | 'continuing'>('all')
  const [yeProcessing, setYeProcessing]         = useState(false)
  const [yeMsg, setYeMsg]                        = useState('')
  const [yeClosing, setYeClosing]               = useState(false)

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
  const loadAcademicYears = useCallback(() => {
    Promise.all([
      fetch(`/api/academic-year/current?school_id=${schoolId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/academic-years?school_id=${schoolId}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/fees/year-rollover?school_id=${schoolId}`).then(r => r.ok ? r.json() : []),
    ]).then(([current, all, closed]) => {
      const labels: string[] = Array.isArray(all) ? all.map((y: { label: string }) => y.label) : []
      const cur: string = current?.label ?? labels[0] ?? '2025-26'
      if (!labels.length) labels.push(cur)
      setAcademicYears(labels)
      setAcademicYear(cur)
      const closedSet = new Set<string>(Array.isArray(closed) ? closed.map((c: { academic_year: string }) => c.academic_year) : [])
      setClosedYears(closedSet)
    }).catch(() => { setAcademicYears(['2025-26']); setAcademicYear('2025-26') })
  }, [schoolId])

  useEffect(() => { loadAcademicYears() }, [loadAcademicYears])

  // ── Overview stats ───────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!academicYear) return
    setStatsLoading(true)
    try {
      const [statsRes, pmtRes, reportRes] = await Promise.all([
        fetch(`/api/fees/stats?school_id=${schoolId}&academic_year=${academicYear}`),
        fetch(`/api/fees/payments?school_id=${schoolId}`),
        fetch(`/api/fees/reports?school_id=${schoolId}&academic_year=${academicYear}`),
      ])
      if (statsRes.ok) {
        const sd = await statsRes.json()
        setStats(sd)
        setGradeStats(Array.isArray(sd.by_class) ? sd.by_class : [])
      }
      if (pmtRes.ok) {
        const all = await pmtRes.json() as Array<RecentPayment & { payment_status?: string }>
        setRecentPayments(
          all
            .filter(p => p.payment_status === 'completed' || !p.payment_status)
            .slice(0, 6)
        )
      }
      // reports endpoint still fetched for backward-compat but class data now comes from stats
      if (reportRes.ok) {
        const d = await reportRes.json()
        if (Array.isArray(d.byGrade) && d.byGrade.length > 0) setGradeStats(d.byGrade)
      }
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

  useEffect(() => { if (activeTab === 'setup') loadSetup() }, [activeTab, loadSetup])

  // Load the school's UPI ID when Fee Plan opens (once)
  useEffect(() => {
    if (activeTab === 'setup' && !upiLoaded) {
      fetch(`/api/fees/upi-id?school_id=${schoolId}`)
        .then(r => r.ok ? r.json() : { upi_id: '' })
        .then(d => { setUpiId(d.upi_id || ''); setUpiLoaded(true) })
        .catch(() => setUpiLoaded(true))
    }
  }, [activeTab, upiLoaded, schoolId])

  async function saveUpiId() {
    setUpiSaving(true); setUpiMsg('')
    const r = await fetch('/api/fees/upi-id', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, upi_id: upiId }),
    })
    const d = await r.json()
    setUpiMsg(r.ok ? '✓ UPI ID saved' : (d.error || 'Failed to save'))
    setUpiSaving(false)
  }

  const loadReports = useCallback(async () => {
    if (!academicYear) return
    setReportLoading(true)
    const r = await fetch(`/api/fees/reports?school_id=${schoolId}&academic_year=${academicYear}`)
    if (r.ok) setReportData(await r.json())
    setReportLoading(false)
  }, [schoolId, academicYear])

  useEffect(() => { if (activeTab === 'reports' && academicYear) loadReports() }, [activeTab, loadReports, academicYear])

  async function loadAuditLog() {
    setShowAuditLog(true)
    if (auditLog.length > 0) return
    setAuditLoading(true)
    const r = await fetch(`/api/fees/audit-log?school_id=${schoolId}&academic_year=${academicYear}`)
    if (r.ok) setAuditLog(await r.json())
    setAuditLoading(false)
  }

  // ── Fee Audit Report export (Excel / PDF, school / class / student) ──
  function auditReportQuery(extra: Record<string, string> = {}) {
    const q = new URLSearchParams({ school_id: String(schoolId), academic_year: academicYear })
    if (arScope === 'class' && arGrade && !extra.student_id) {
      q.set('grade', arGrade)
      if (arSection !== 'all') q.set('section', arSection)
    }
    Object.entries(extra).forEach(([k, v]) => q.set(k, v))
    return q.toString()
  }

  function downloadAuditExcel(extra: Record<string, string> = {}) {
    window.open(`/api/fees/audit-report/excel?${auditReportQuery(extra)}`, '_blank')
  }

  async function printAuditPdf(extra: Record<string, string> = {}) {
    setArBusy(true); setArMsg('')
    try {
      const r = await fetch(`/api/fees/audit-report?${auditReportQuery(extra)}`)
      if (!r.ok) { const d = await r.json().catch(() => ({})); setArMsg(d.error || 'Failed to build report'); setArBusy(false); return }
      const rep = await r.json()
      const win = window.open('', '_blank', 'width=1000,height=720')
      if (win) { win.document.write(buildAuditPdfHtml(rep)); win.document.close(); win.print() }
    } catch { setArMsg('Network error') }
    setArBusy(false)
  }

  async function searchAuditStudent(q: string) {
    setArStudentSearch(q)
    if (!q.trim()) { setArStudentResults([]); return }
    const local = (pbAllStudents.length ? pbAllStudents : [])
      .filter(s => s.name.toLowerCase().includes(q.toLowerCase()) || (s.roll_number || '').toLowerCase().includes(q.toLowerCase()))
      .slice(0, 10)
    if (local.length) { setArStudentResults(local); return }
    const r = await fetch(`/api/students?school_id=${schoolId}`)
    if (r.ok) {
      const data = await r.json()
      const arr = Array.isArray(data) ? data : (data.students || [])
      setArStudentResults(arr.filter((s: { name: string; roll_number: string }) =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.roll_number || '').toLowerCase().includes(q.toLowerCase())
      ).slice(0, 10))
    }
  }

  const loadYearEnd = useCallback(async () => {
    if (!academicYear) return
    setYearEndLoading(true); setYeMsg('')
    const r = await fetch(`/api/fees/year-end?school_id=${schoolId}&academic_year=${academicYear}`)
    if (r.ok) {
      const d: YearEndState = await r.json()
      setYearEnd(d)
      // default every student to 'open' (admin decides each — no auto default action)
      const init: Record<number, 'carry' | 'writeoff' | 'open'> = {}
      d.students.forEach(s => { init[s.student_id] = 'open' })
      setYeDecisions(init)
    }
    setYearEndLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const filteredLedger = ledger.filter(e => {
    const q = ledgerSearch.trim().toLowerCase()
    return !q || [
      e.student_name, e.roll_number,
      e.school_roll_number != null ? String(e.school_roll_number) : '',
      e.grade, e.section, e.email, e.phone,
      e.parent_name, e.parent_phone, e.parent_email,
    ].some(v => (v || '').toLowerCase().includes(q))
  })

  // ── Collect: search students ─────────────────────────────────────────────────
  async function searchStudent(q: string) {
    if (!q.trim() || !academicYear) { setCollectEntries([]); return }
    setCollectLoading(true)
    const r = await fetch(`/api/fees/ledger?school_id=${schoolId}&academic_year=${academicYear}`)
    if (r.ok) {
      const all: LedgerEntry[] = await r.json()
      const ql = q.trim().toLowerCase()
      setCollectEntries(
        all.filter(e =>
          [
            e.student_name, e.roll_number,
            e.school_roll_number != null ? String(e.school_roll_number) : '',
            e.grade, e.section, e.email, e.phone,
            e.parent_name, e.parent_phone, e.parent_email,
          ].some(v => (v || '').toLowerCase().includes(ql))
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
        setCollectSearch(''); setCollectEntries([])
        setOpenStudentId(null); setShowCollectForm(false); setCollectChecked(new Set())
        loadStats(); loadLedger()
      } else {
        const d = await r.json()
        setWaiverError(d.error || 'Failed to grant waiver')
      }
    } catch {
      setWaiverError('Network error — please try again')
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
    // Mandate: all fixed fees must have amounts before generating bills
    if (!fixedAmountsComplete()) {
      const missing = fixedFeesMissingAmounts()
      setStructureMsg(`⚠ Set amounts for all fixed fees first — missing: ${missing.join(', ')}`)
      return
    }
    // Show confirmation with due-day summary before running
    setShowGenerateConfirm(true)
  }

  async function confirmGenerateLedger() {
    setShowGenerateConfirm(false)
    setGeneratingLedger(true); setStructureMsg('')
    const r = await fetch('/api/fees/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear }),
    })
    const d = await r.json()
    setStructureMsg(r.ok
      ? d.created > 0
        ? `✓ Generated ${d.created} new bill${d.created !== 1 ? 's' : ''}${d.skipped > 0 ? ` · ${d.skipped} already existed (not duplicated)` : ''}`
        : `✓ All bills already exist — nothing new to generate (${d.skipped} existing)`
      : d.error || 'Failed')
    setGeneratingLedger(false)
    loadStats(); loadSetup()
  }

  // Generate bills only for students who have no ledger rows yet (safe after lock)
  async function generateForNew() {
    setGeneratingLedger(true); setStructureMsg('')
    const r = await fetch('/api/fees/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear }),
    })
    const d = await r.json()
    setStructureMsg(r.ok
      ? d.created > 0
        ? `✓ Billed ${d.created} new student${d.created !== 1 ? 's' : ''}${d.skipped > 0 ? ` · ${d.skipped} already billed (not duplicated)` : ''}`
        : '✓ All active students already billed — no new entries needed'
      : d.error || 'Failed')
    setGeneratingLedger(false)
    loadStats(); loadSetup()
  }

  // ── Fee Plan helpers ──────────────────────────────────────────────────────────

  // Create a fee head (from wizard) — does not navigate, refreshes list
  async function createFeeHead() {
    if (!newCategory.name.trim()) return
    const r = await fetch('/api/fees/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, ...newCategory }),
    })
    if (r.ok) {
      setNewCategory({ name: '', frequency: 'monthly', description: '', category_type: 'fixed' })
      setShowAddFee(false); setAddFeeStep(1)
      loadSetup()
    }
  }

  // Apply a group amount to all grades in that group for the managed fee
  function applyGroupAmount(catId: number, grades: string[], value: string) {
    setEditAmounts(prev => {
      const next = { ...prev }
      grades.forEach(g => { next[`${catId}_${g}`] = value })
      return next
    })
  }

  // Save amounts for a single fee head (only that category's grades)
  async function saveFeeAmounts(cat: FeeCategory) {
    setSavingStructure(true); setStructureMsg('')
    const structs = []
    for (const grade of GRADES) {
      const val = editAmounts[`${cat.id}_${grade}`]
      if (val && parseFloat(val) > 0)
        structs.push({ fee_category_id: cat.id, grade, amount: parseFloat(val), due_day: parseInt(dueDays[cat.id] || '10') || 10 })
    }
    const r = await fetch('/api/fees/structures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, structures: structs, changed_by: adminName || 'Admin' }),
    })
    setStructureMsg(r.ok ? `✓ Amounts saved for ${cat.name}` : 'Failed to save')
    setSavingStructure(false)
    loadSetup()
  }

  // Whether a fee head has any amount configured
  function feeHasAmounts(catId: number, type: string): boolean {
    if (type === 'variable') {
      return structures.some(s => s.fee_category_id === catId && Number(s.amount) > 0)
    }
    return GRADES.some(g => parseFloat(editAmounts[`${catId}_${g}`] || '0') > 0)
  }

  // Whether bills are generated for this fee head
  function feeBillsGenerated(cat: FeeCategory): boolean {
    return Number(cat.ledger_count) > 0
  }

  // Active FIXED fee heads only (variable fees are optional / per-student, so excluded from the gate)
  function fixedFeeHeads(): FeeCategory[] {
    return categories.filter(c => c.is_active && c.category_type !== 'variable')
  }
  // Generate Bills is allowed only when EVERY active fixed fee head has at least one amount set
  function fixedAmountsComplete(): boolean {
    const fixed = fixedFeeHeads()
    if (fixed.length === 0) return false
    return fixed.every(c => feeHasAmounts(c.id, c.category_type))
  }
  // List of fixed fee heads still missing amounts (for the gating message)
  function fixedFeesMissingAmounts(): string[] {
    return fixedFeeHeads().filter(c => !feeHasAmounts(c.id, c.category_type)).map(c => c.name)
  }
  // Any bills generated at all (gate for Lock)
  function anyBillsGenerated(): boolean {
    return categories.some(c => feeBillsGenerated(c))
  }
  // All active fixed fee heads that have amounts set must also have bills generated
  function allReadyHeadsBilled(): boolean {
    const ready = fixedFeeHeads().filter(c => feeHasAmounts(c.id, c.category_type))
    if (ready.length === 0) return false
    return ready.every(c => feeBillsGenerated(c))
  }

  async function lockStructure() {
    if (!anyBillsGenerated()) { setStructureMsg('⚠ Generate bills before locking the plan.'); return }
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

  // ── Combined "All Variable Fees" grid ──
  async function loadVarGrid() {
    if (!vgGrade || !academicYear) { setVgMsg('Pick a class first'); return }
    setVgLoading(true); setVgMsg('')
    try {
      const params = new URLSearchParams({ school_id: String(schoolId), grade: vgGrade, academic_year: academicYear, section: vgSection })
      const r = await fetch(`/api/fees/category-assignments?${params}`)
      if (r.ok) {
        const { students, categories, amounts } = await r.json()
        setVgStudents(students)
        setVgCategories(categories)
        const init: Record<string, string> = {}
        amounts.forEach((a: { student_id: number; fee_category_id: number; amount: number }) => {
          init[`${a.student_id}:${a.fee_category_id}`] = String(a.amount)
        })
        setVgAmounts(init)
        setVgOriginal({ ...init })   // snapshot to detect changed cells
      } else {
        const d = await r.json().catch(() => ({}))
        setVgMsg(d.error || 'Failed to load')
      }
    } catch { setVgMsg('Network error') }
    setVgLoading(false)
  }

  async function saveVarGrid() {
    if (!vgGrade || !academicYear) return
    setVgSaving(true); setVgMsg('')
    // Write every cell (so blanks correctly remove unpaid entries); the API logs only real changes.
    const assignments: { student_id: number; fee_category_id: number; amount: string }[] = []
    vgStudents.forEach(s => {
      vgCategories.forEach(c => {
        const key = `${s.id}:${c.id}`
        assignments.push({ student_id: s.id, fee_category_id: c.id, amount: vgAmounts[key] || '0' })
      })
    })
    const r = await fetch('/api/fees/category-assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, assignments, changed_by: adminName || 'Admin' }),
    })
    const d = await r.json()
    if (r.ok) {
      setVgMsg(`✓ Saved — ${d.upserted} assignments${d.ledgerUpdated > 0 ? `, ${d.ledgerUpdated} ledger entries updated` : ''}`)
      setVgOriginal({ ...vgAmounts })   // reset change highlight baseline
      loadStats()
    } else {
      setVgMsg(d.error || 'Failed to save')
    }
    setVgSaving(false)
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

  async function applyYearEndDecisions() {
    if (!yearEnd) return
    // Build decisions only for students who have a non-'open' decision (open = no-op leave as is)
    const decisions = yearEnd.students
      .map(s => ({ student_id: s.student_id, decision: yeDecisions[s.student_id] || 'open', reason: yeReasons[s.student_id] }))
      .filter(d => d.decision === 'carry' || d.decision === 'writeoff')
    if (decisions.length === 0) { setYeMsg('No carry-forward or write-off decisions selected.'); return }

    // Guard on client too: leavers cannot carry
    const badLeaver = yearEnd.students.find(s => s.is_leaver && yeDecisions[s.student_id] === 'carry')
    if (badLeaver) { setYeMsg(`${badLeaver.student_name} is leaving — cannot carry forward. Choose Write Off or Leave Open.`); return }

    if (decisions.some(d => d.decision === 'carry') && !yearEnd.target_year_exists) {
      setYeMsg(`Academic year ${yearEnd.target_year} must be created before carrying forward.`); return
    }

    setYeProcessing(true); setYeMsg('')
    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'apply', school_id: schoolId, from_year: academicYear,
        to_year: yearEnd.target_year, done_by: adminName || 'Admin', decisions,
      }),
    })
    const d = await r.json()
    if (r.ok) {
      setYeMsg(`✓ Applied — ${d.carried.count} carried (${fmt(d.carried.total)}), ${d.writeoff.count} written off (${fmt(d.writeoff.total)})`)
      loadYearEnd()
    } else {
      setYeMsg(d.error || 'Failed to apply')
    }
    setYeProcessing(false)
  }

  async function closeYear() {
    setYeClosing(true); setYeMsg('')
    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', school_id: schoolId, from_year: academicYear, done_by: adminName || 'Admin' }),
    })
    const d = await r.json()
    setYeMsg(r.ok ? '✓ Financial year closed and locked' : (d.error || 'Failed to close'))
    setYeClosing(false)
    if (r.ok) {
      loadYearEnd()
      // BUG 14: prompt admin to generate fee ledger for the new year
      const nextYear = yearEnd?.target_year
      if (nextYear && window.confirm(`Year ${academicYear} is now closed.\n\nDo you want to go to the Setup tab to generate fee ledger for ${nextYear}?`)) {
        setActiveTab('setup' as Tab)
      }
    }
  }

  async function reopenYear() {
    const reason = window.prompt('Reason for reopening this closed year? (logged permanently)')
    if (!reason) return
    setYeClosing(true); setYeMsg('')
    const r = await fetch('/api/fees/year-end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reopen', school_id: schoolId, from_year: academicYear, done_by: adminName || 'Admin', reason }),
    })
    const d = await r.json()
    setYeMsg(r.ok ? '✓ Year reopened — edits allowed again' : (d.error || 'Failed'))
    setYeClosing(false)
    if (r.ok) loadYearEnd()
  }

  // Year-end view helpers
  const visibleYeStudents = (yearEnd?.students || []).filter(s =>
    yeFilter === 'all' ? true : yeFilter === 'leavers' ? s.is_leaver : !s.is_leaver
  )
  function startYearLabel(label: string) { return label.split('-')[0] }

  function printYearEndStatement() {
    if (!yearEnd) return
    const s = yearEnd.summary
    const carryN = Object.values(yeDecisions).filter(d => d === 'carry').length
    const woN = Object.values(yeDecisions).filter(d => d === 'writeoff').length
    const openN = Object.values(yeDecisions).filter(d => d === 'open').length
    const rows = yearEnd.students.map(st => `<tr>
      <td>${st.student_name}</td><td>Gr.${st.grade}${st.section}</td>
      <td style="text-align:right">₹${Number(st.total_unpaid).toLocaleString('en-IN')}</td>
      <td>${st.is_leaver ? st.leaver_reason : 'Continuing'}</td>
      <td>${(yeDecisions[st.student_id] || 'open').replace('writeoff','Write Off').replace('carry','Carry Forward').replace('open','Leave Open')}</td>
    </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Year-End Statement ${academicYear}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:820px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:18px}
  .title{font-size:20px;font-weight:bold}.sub{font-size:13px;color:#555;margin-top:4px}
  .sumbox{display:flex;gap:12px;margin:18px 0}
  .sumbox div{flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}
  .sumbox .l{font-size:11px;color:#888}.sumbox .v{font-size:15px;font-weight:bold;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f3f4f6;padding:8px;text-align:left;font-size:11px;border:1px solid #ddd}
  td{padding:7px 8px;font-size:12px;border:1px solid #eee}
  .ftr{margin-top:24px;text-align:center;font-size:11px;color:#aaa}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr"><div class="title">Year-End Financial Statement</div><div class="sub">Academic Year ${academicYear}</div></div>
<div class="sumbox">
  <div><div class="l">Total Billed</div><div class="v">₹${Number(s.total_billed).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Collected</div><div class="v">₹${Number(s.total_collected).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Waived</div><div class="v">₹${Number(s.total_waived).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Unpaid</div><div class="v">₹${Number(s.total_unpaid).toLocaleString('en-IN')}</div></div>
</div>
<p style="font-size:12px;color:#555">Resolution plan: ${carryN} carry forward · ${woN} write off · ${openN} left open</p>
<table><thead><tr><th>Student</th><th>Class</th><th style="text-align:right">Unpaid</th><th>Status</th><th>Decision</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999">No unpaid dues</td></tr>'}</tbody></table>
<div class="ftr">Generated ${new Date().toLocaleString('en-IN')} · ${adminName || 'Admin'} · Computer-generated statement.</div>
</body></html>`
    const win = window.open('', '_blank', 'width=900,height=680')
    if (win) { win.document.write(html); win.document.close(); win.print() }
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

  // ── Collection (Tab 3) helpers ────────────────────────────────────────────────

  // Load the full ledger when the Collection tab opens (reuses loadLedger which fills `ledger`)
  useEffect(() => {
    if (activeTab === 'collect') {
      loadLedger()
      loadPending()
    }
  }, [activeTab, loadLedger, loadPending])

  // Group ledger entries by student → one row per student with totals
  type StudentRow = {
    student_id: number; student_name: string; roll_number: string; school_roll_number: number | null
    grade: string; section: string
    email: string | null; phone: string | null
    parent_name: string | null; parent_phone: string | null; parent_email: string | null
    total_billed: number; total_paid: number; outstanding: number
    open_entries: LedgerEntry[]   // pending/partial/overdue
    all_entries: LedgerEntry[]
    has_overdue: boolean; never_paid: boolean
  }
  const studentRows: StudentRow[] = (() => {
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
          total_billed: 0, total_paid: 0, outstanding: 0,
          open_entries: [], all_entries: [], has_overdue: false, never_paid: true,
        }
        map.set(e.student_id, row)
      }
      row.total_billed += Number(e.amount_due)
      row.total_paid += Number(e.amount_paid)
      row.outstanding += Number(e.balance)
      row.all_entries.push(e)
      if (['pending', 'partial', 'overdue'].includes(e.status)) row.open_entries.push(e)
      if (e.status === 'overdue') row.has_overdue = true
      if (Number(e.amount_paid) > 0) row.never_paid = false
    }
    return Array.from(map.values())
  })()

  const collectionFiltered = studentRows.filter(r => {
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
    if (ledgerStatus === 'overdue') return r.has_overdue
    if (ledgerStatus === 'partial') return r.total_paid > 0 && r.outstanding > 0
    if (ledgerStatus === 'never') return r.never_paid && r.outstanding > 0
    if (ledgerStatus === 'clear') return r.outstanding === 0
    return true
  })

  const openStudent = collectionFiltered.find(r => r.student_id === openStudentId)
    || studentRows.find(r => r.student_id === openStudentId)

  // Total of currently-checked entries in the collect form
  const checkedTotal = openStudent
    ? openStudent.open_entries.filter(e => collectChecked.has(e.id)).reduce((s, e) => s + Number(e.balance), 0)
    : 0

  function toggleStudent(id: number) {
    if (openStudentId === id) { setOpenStudentId(null); setShowCollectForm(false); setShowCounterHistory(false); return }
    setOpenStudentId(id); setShowCollectForm(false)
    setShowPaymentsId(null); setShowHistoryId(null)
    setShowCounterHistory(false); setCounterPayments([])
    setCancelPmtId(null); setCancelMsg('')
  }

  async function loadCounterPayments(studentId: number) {
    setShowCounterHistory(true); setCounterPmtLoading(true)
    try {
      const r = await fetch(`/api/fees/payments?school_id=${schoolId}&student_id=${studentId}`)
      if (r.ok) setCounterPayments(await r.json())
    } catch { /* silent */ }
    setCounterPmtLoading(false)
  }

  function startCollect(row: StudentRow) {
    setOpenStudentId(row.student_id)
    setCollectChecked(new Set(row.open_entries.map(e => e.id)))
    const fullTotal = row.open_entries.reduce((s, e) => s + Number(e.balance), 0)
    setPayAmount(String(fullTotal))   // default to full; admin can override for partial
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
      })
      setShowCollectForm(false)
      loadLedger(); loadStats()
    } else {
      setPayError(d.error || 'Payment failed')
    }
    setCollectLoading(false)
  }

  // Print a multi-line receipt for counter collection
  function printCounterReceipt(row: StudentRow, paid: PaySuccess, lines: { cat: string; period: string; amount: number }[]) {
    const modeLabel: Record<string, string> = { cash: 'Cash', cheque: 'Cheque', dd: 'Demand Draft', upi: 'UPI', online: 'Online Transfer' }
    const lineRows = lines.map(l => `<tr><td>${l.cat}</td><td>${l.period}</td><td style="text-align:right">₹${Number(l.amount).toLocaleString('en-IN')}</td></tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${paid.receipt_number}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:720px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:20px}
  .school{font-size:22px;font-weight:bold}.rtitle{font-size:15px;font-weight:bold;margin-top:6px;letter-spacing:1px}
  .rno{font-size:12px;color:#555;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
  .lbl{font-size:11px;color:#888;margin-bottom:2px}.val{font-size:14px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:14px 0}
  th{background:#f3f4f6;padding:9px 12px;text-align:left;font-size:12px;border:1px solid #ddd}
  td{padding:9px 12px;font-size:13px;border:1px solid #ddd}
  .tot td{font-weight:bold;background:#f9fafb}
  .ftr{margin-top:28px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr"><div class="school">${paid.school_name || 'School'}</div>
<div class="rtitle">FEE RECEIPT</div><div class="rno">Receipt No: <strong>${paid.receipt_number}</strong></div></div>
<div class="grid2">
  <div><div class="lbl">Student Name</div><div class="val">${row.student_name}</div></div>
  <div><div class="lbl">Roll Number</div><div class="val">${row.roll_number}</div></div>
  <div><div class="lbl">Class</div><div class="val">Grade ${row.grade}${row.section}</div></div>
  <div><div class="lbl">Parent / Guardian</div><div class="val">${paid.parent_name || '—'}</div></div>
</div>
<table><thead><tr><th>Fee Head</th><th>Period</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${lineRows}</tbody>
<tfoot><tr class="tot"><td colspan="2" style="text-align:right">Total Paid:</td><td style="text-align:right">₹${Number(paid.amount).toLocaleString('en-IN')}</td></tr></tfoot></table>
<div class="grid2">
  <div><div class="lbl">Payment Mode</div><div class="val">${modeLabel[paid.payment_mode] || paid.payment_mode}</div></div>
  <div><div class="lbl">Payment Date</div><div class="val">${paid.paid_date ? new Date(paid.paid_date).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' }) : '—'}</div></div>
  ${paid.transaction_ref ? `<div><div class="lbl">Reference</div><div class="val">${paid.transaction_ref}</div></div>` : ''}
  ${paid.collected_by_name ? `<div><div class="lbl">Collected By</div><div class="val">${paid.collected_by_name}</div></div>` : ''}
</div>
${paid.notes ? `<div style="margin-bottom:14px"><div class="lbl">Remarks</div><div class="val">${paid.notes}</div></div>` : ''}
<div class="ftr">Balance after this payment: ₹${Number(Math.max(0, row.outstanding - paid.amount)).toLocaleString('en-IN')} &nbsp;·&nbsp; Generated on ${new Date().toLocaleString('en-IN')} &nbsp;·&nbsp; Computer-generated receipt.</div>
</body></html>`
    const win = window.open('', '_blank', 'width=800,height=650')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  // ── Day Close ──
  const loadDayClose = useCallback(async (date: string) => {
    setDayCloseLoading(true); setDayCloseMsg('')
    const r = await fetch(`/api/fees/day-close?school_id=${schoolId}&date=${date}`)
    if (r.ok) setDayCloseData(await r.json())
    setDayCloseLoading(false)
  }, [schoolId])

  useEffect(() => {
    if (activeTab === 'collect' && collectionView === 'dayclose') loadDayClose(dayCloseDate)
  }, [activeTab, collectionView, dayCloseDate, loadDayClose])

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

  // ── Student Passbook helpers ────────────────────────────────────────────────
  // Load the full student directory once when the Passbook tab opens
  const loadPbAllStudents = useCallback(async () => {
    setPbAllLoading(true)
    try {
      const r = await fetch(`/api/students?school_id=${schoolId}`)
      if (r.ok) {
        const data = await r.json()
        const arr = Array.isArray(data) ? data : (data.students || [])
        setPbAllStudents(arr.map((s: { id: number; name: string; roll_number: string; grade: string; section: string }) => ({
          id: s.id, name: s.name, roll_number: s.roll_number, grade: s.grade, section: s.section,
        })))
      }
    } catch { /* silent */ }
    setPbAllLoading(false)
  }, [schoolId])

  useEffect(() => {
    if (activeTab === 'students' && pbAllStudents.length === 0) loadPbAllStudents()
  }, [activeTab, pbAllStudents.length, loadPbAllStudents])

  async function loadPassbook(studentId: number) {
    setPbLoading(true); setPbErr('')
    try {
      const r = await fetch(`/api/fees/passbook?school_id=${schoolId}&student_id=${studentId}`)
      if (r.ok) { setPbData(await r.json()); setPbSection('bills') }
      else { const d = await r.json().catch(() => ({})); setPbErr(d.error || `Could not open passbook (HTTP ${r.status})`) }
    } catch { setPbErr('Network error while opening passbook') }
    setPbLoading(false)
  }

  function openCancel(paymentId: number) {
    setCancelPmtId(paymentId); setCancelMode('cancel')
    setCancelReason(''); setCorrectAmount(''); setCancelMsg('')
  }

  // origin: 'passbook' refreshes the passbook; 'counter' refreshes ledger + counter payments
  async function submitCancelCorrect(origin: 'passbook' | 'counter' = 'passbook', studentId?: number) {
    if (!cancelPmtId) return
    if (!cancelReason.trim()) { setCancelMsg('Reason is required.'); return }
    if (cancelMode === 'correct' && !(parseFloat(correctAmount) > 0)) { setCancelMsg('Enter a valid corrected amount.'); return }
    setCancelBusy(true); setCancelMsg('')
    const r = await fetch('/api/fees/payments/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_id: cancelPmtId, action: cancelMode, reason: cancelReason,
        done_by: adminName || 'Admin',
        ...(cancelMode === 'correct' ? { new_amount: parseFloat(correctAmount) } : {}),
      }),
    })
    const d = await r.json()
    if (r.ok) {
      setCancelMsg(cancelMode === 'correct'
        ? `✓ Corrected — new receipt ${d.new_receipt}`
        : `✓ Payment cancelled (₹${d.reversed_amount} reversed)`)
      setCancelPmtId(null)
      // Always refresh the school-wide figures (Overview, class-wise, reports-on-open)
      loadStats()
      if (origin === 'passbook' && pbData) {
        loadPassbook(pbData.student.id)
      } else if (origin === 'counter') {
        loadLedger()                                   // dues + balances + statuses
        if (studentId) loadCounterPayments(studentId)  // refresh the counter payment list
      }
    } else {
      setCancelMsg(d.error || 'Failed')
    }
    setCancelBusy(false)
  }

  async function submitRevokeCorrectWaiver() {
    if (!cancelWaiverId) return
    if (!cancelWaiverReason.trim()) { setCancelWaiverMsg('Reason is required.'); return }
    if (cancelWaiverMode === 'correct' && !(parseFloat(correctWaiverAmount) > 0)) {
      setCancelWaiverMsg('Enter a valid corrected amount.'); return
    }
    setCancelWaiverBusy(true); setCancelWaiverMsg('')
    try {
      let r: Response
      if (cancelWaiverMode === 'revoke') {
        r = await fetch(`/api/fees/waivers?id=${cancelWaiverId}&reason=${encodeURIComponent(cancelWaiverReason)}`, { method: 'DELETE' })
      } else {
        r = await fetch('/api/fees/waivers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: cancelWaiverId, new_waiver_amount: parseFloat(correctWaiverAmount), reason: cancelWaiverReason }),
        })
      }
      const d = await r.json()
      if (r.ok) {
        setCancelWaiverMsg(cancelWaiverMode === 'correct' ? '✓ Waiver corrected' : '✓ Waiver revoked')
        setCancelWaiverId(null)
        if (pbData) loadPassbook(pbData.student.id)
      } else {
        setCancelWaiverMsg(d.error || 'Failed')
      }
    } catch { setCancelWaiverMsg('Network error') }
    setCancelWaiverBusy(false)
  }

  // Print a receipt for any single completed payment from the passbook
  function printPassbookReceipt(p: PaymentRecord & { fee_head_name?: string; period_label?: string; category_name?: string }) {
    if (!pbData) return
    const s = pbData.student
    const modeLabel: Record<string, string> = { cash: 'Cash', cheque: 'Cheque', dd: 'Demand Draft', upi: 'UPI', online: 'Online Transfer' }
    const head = p.fee_head_name || p.category_name || 'Fee'
    const period = p.period_label || ''
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${p.receipt_number}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:720px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:20px}
  .school{font-size:22px;font-weight:bold}.rtitle{font-size:15px;font-weight:bold;margin-top:6px;letter-spacing:1px}
  .rno{font-size:12px;color:#555;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
  .lbl{font-size:11px;color:#888;margin-bottom:2px}.val{font-size:14px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:14px 0}
  th{background:#f3f4f6;padding:9px 12px;text-align:left;font-size:12px;border:1px solid #ddd}
  td{padding:9px 12px;font-size:13px;border:1px solid #ddd}
  .tot td{font-weight:bold;background:#f9fafb}
  .ftr{margin-top:28px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr"><div class="school">Fee Receipt</div>
<div class="rtitle">PAYMENT RECEIPT</div><div class="rno">Receipt No: <strong>${p.receipt_number}</strong></div></div>
<div class="grid2">
  <div><div class="lbl">Student Name</div><div class="val">${s.name}</div></div>
  <div><div class="lbl">Roll Number</div><div class="val">${s.roll_number}</div></div>
  <div><div class="lbl">Class</div><div class="val">Grade ${s.grade}${s.section || ''}</div></div>
  <div><div class="lbl">Parent / Guardian</div><div class="val">${s.parent_name || '—'}</div></div>
</div>
<table><thead><tr><th>Fee Head</th><th>Period</th><th style="text-align:right">Amount</th></tr></thead>
<tbody><tr><td>${head}</td><td>${period}</td><td style="text-align:right">₹${Number(p.amount).toLocaleString('en-IN')}</td></tr></tbody>
<tfoot><tr class="tot"><td colspan="2" style="text-align:right">Total Paid:</td><td style="text-align:right">₹${Number(p.amount).toLocaleString('en-IN')}</td></tr></tfoot></table>
<div class="grid2">
  <div><div class="lbl">Payment Mode</div><div class="val">${modeLabel[p.payment_mode] || p.payment_mode}</div></div>
  <div><div class="lbl">Payment Date</div><div class="val">${p.paid_date ? new Date(p.paid_date).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' }) : '—'}</div></div>
  ${p.transaction_ref ? `<div><div class="lbl">Reference</div><div class="val">${p.transaction_ref}</div></div>` : ''}
  ${p.collected_by_name ? `<div><div class="lbl">Collected By</div><div class="val">${p.collected_by_name}</div></div>` : ''}
</div>
${p.notes ? `<div><div class="lbl">Remarks</div><div class="val">${p.notes}</div></div>` : ''}
<div class="ftr">Generated on ${new Date().toLocaleString('en-IN')} · Computer-generated receipt.</div>
</body></html>`
    const win = window.open('', '_blank', 'width=800,height=650')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  function printPassbookStatement() {
    if (!pbData) return
    const s = pbData.student
    const rows = pbData.timeline.map(t => `<tr>
      <td>${new Date(t.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</td>
      <td>${t.description}</td>
      <td style="text-align:right">${t.debit > 0 ? '₹' + Number(t.debit).toLocaleString('en-IN') : ''}</td>
      <td style="text-align:right">${t.credit > 0 ? '₹' + Number(t.credit).toLocaleString('en-IN') : ''}</td>
      <td style="text-align:right">₹${Number(t.balance).toLocaleString('en-IN')}</td>
    </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Statement ${s.name}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:820px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:18px}
  .title{font-size:20px;font-weight:bold}.sub{font-size:13px;color:#555;margin-top:4px}
  .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px}
  .sumbox{display:flex;gap:16px;margin-bottom:18px}
  .sumbox div{flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}
  .sumbox .l{font-size:11px;color:#888}.sumbox .v{font-size:16px;font-weight:bold;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f3f4f6;padding:8px;text-align:left;font-size:11px;border:1px solid #ddd}
  td{padding:7px 8px;font-size:12px;border:1px solid #eee}
  .ftr{margin-top:24px;text-align:center;font-size:11px;color:#aaa}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr"><div class="title">Fee Statement (Passbook)</div>
<div class="sub">${s.name} · Grade ${s.grade}${s.section} · Roll #${s.roll_number} · ${academicYear}</div></div>
<div class="info">
  <div>Parent: ${s.parent_name || '—'}</div>
  <div>Phone: ${s.parent_phone || '—'}</div>
</div>
<div class="sumbox">
  <div><div class="l">Total Billed</div><div class="v">₹${Number(pbData.summary.total_billed).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Paid</div><div class="v">₹${Number(pbData.summary.total_paid).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Waived</div><div class="v">₹${Number(pbData.summary.total_waived).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Outstanding</div><div class="v">₹${Number(pbData.summary.outstanding).toLocaleString('en-IN')}</div></div>
</div>
<table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Charge</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="ftr">Generated ${new Date().toLocaleString('en-IN')} · Computer-generated statement.</div>
</body></html>`
    const win = window.open('', '_blank', 'width=900,height=680')
    if (win) { win.document.write(html); win.document.close(); win.print() }
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
          {academicYears.map(y => (
            <option key={y} value={y}>{y}{closedYears.has(y) ? ' (Closed)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {([
          { key: 'overview',         label: 'Overview' },
          { key: 'setup',            label: 'Fee Plan' },
          { key: 'collect',          label: pendingPayments.length > 0 ? `Ledger ● ${pendingPayments.length}` : 'Ledger' },
          { key: 'students',         label: 'Student Passbook' },
          { key: 'reports',          label: 'Reports' },
          { key: 'yearend',          label: 'Year-End' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as Tab)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.key
                ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600'
                : t.key === 'collect' && pendingPayments.length > 0
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
        <div className="space-y-5">

          {/* ── Action Required ── */}
          {(() => {
            const actions = []
            if (pendingPayments.length > 0)
              actions.push({ msg: `${pendingPayments.length} online payment${pendingPayments.length > 1 ? 's' : ''} waiting for your verification`, tab: 'pending' as const, color: 'text-red-700 bg-red-50 border-red-200' })
            if (stats && stats.summary.overdue_count > 20)
              actions.push({ msg: `${stats.summary.overdue_count} overdue entries — follow up with parents`, tab: 'ledger' as const, color: 'text-orange-700 bg-orange-50 border-orange-200' })
            if (stats && stats.summary.defaulters_count > 0)
              actions.push({ msg: `${stats.summary.defaulters_count} students have made zero payment this year`, tab: 'ledger' as const, color: 'text-amber-700 bg-amber-50 border-amber-200' })
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
                        onClick={() => setActiveTab(a.tab)}
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
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
                  <div className="h-8 bg-gray-200 rounded w-28 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-20" />
                </div>
              ))}
            </div>
          ) : stats?.summary ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Billed',  value: stats.summary.total_due,         sub: `${stats.summary.total_students} students`,           border: 'border-gray-100',   text: 'text-gray-900',  sub_color: 'text-gray-400' },
                  { label: 'Collected',     value: stats.summary.total_collected,    sub: `${pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}% of total`, border: 'border-green-100',  text: 'text-green-700', sub_color: 'text-green-500' },
                  { label: 'Outstanding',   value: stats.summary.total_outstanding,  sub: `${stats.summary.overdue_count} overdue entries`,     border: 'border-red-100',    text: 'text-red-600',   sub_color: 'text-red-400' },
                  { label: 'Zero Payers',   value: stats.summary.defaulters_count,   sub: 'students with no payment',                           border: 'border-orange-100', text: 'text-orange-600',sub_color: 'text-orange-400', isCount: true },
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
                  <span className="text-sm font-bold text-blue-600">{pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-700"
                    style={{ width: `${pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}%` }}
                  />
                </div>
                <div className="flex gap-5 flex-wrap">
                  {[
                    { label: 'Paid',    count: stats.summary.paid_count,    dot: 'bg-green-500' },
                    { label: 'Partial', count: stats.summary.partial_count, dot: 'bg-yellow-400' },
                    { label: 'Pending', count: stats.summary.pending_count, dot: 'bg-gray-300' },
                    { label: 'Overdue', count: stats.summary.overdue_count, dot: 'bg-red-500' },
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
                const withRate = gradeStats.map(g => ({ ...g, rate: pct(Number(g.total_collected), Number(g.total_due)), label: label(g) }))
                const ranked = [...withRate].filter(g => Number(g.total_due) > 0).sort((a, b) => b.rate - a.rate)
                const best = ranked[0]
                const worst = ranked[ranked.length - 1]
                const totDue = gradeStats.reduce((s, g) => s + Number(g.total_due), 0)
                const totCol = gradeStats.reduce((s, g) => s + Number(g.total_collected), 0)
                const totStu = gradeStats.reduce((s, g) => s + Number(g.students), 0)
                const totDef = gradeStats.reduce((s, g) => s + Number(g.defaulter_students || 0), 0)
                return (
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700">Class-wise Collection Analysis</h3>
                      <div className="flex items-center gap-3">
                        <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download
                          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg">Export</a>
                        <button onClick={() => setActiveTab('reports')} className="text-xs text-blue-600 hover:text-blue-800">Full report →</button>
                      </div>
                    </div>

                    {/* Highlight cards */}
                    <div className="grid grid-cols-4 gap-3 mb-5">
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
                        <p className="text-[10px] text-amber-600 uppercase font-semibold tracking-wide">Defaulters</p>
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
                              <span className="text-xs font-bold text-blue-600">{pct(totCol, totDue)}% overall</span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* ── Two Columns ── */}
              <div className="grid grid-cols-2 gap-5">

                {/* Fee Head Health */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Fee Head Collection Health</h3>
                  {stats.by_category.length === 0 ? (
                    <p className="text-sm text-gray-400">No fee heads configured yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {stats.by_category.map(cat => {
                        const collected = Number(cat.total_collected)
                        const due = Number(cat.total_due)
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
                            {cat.overdue_count > 0 && (
                              <p className="text-[10px] text-red-500 mt-0.5">{cat.overdue_count} overdue entries</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Right column: Top Defaulters + Recent Payments */}
                <div className="space-y-4">

                  {/* Top Defaulters */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">Top Defaulters</h3>
                      <button
                        onClick={() => setActiveTab('ledger')}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        View all →
                      </button>
                    </div>
                    {stats.top_defaulters.length === 0 ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <p className="text-sm text-green-600 font-medium">No defaulters — great!</p>
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
                      <button
                        onClick={() => setActiveTab('collect')}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
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
                onClick={() => setActiveTab('setup')}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700"
              >
                Go to Fee Setup →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ FEE PLAN ════════════════════════════════════════════════════════════ */}
      {activeTab === 'setup' && (
        <div className="space-y-5">

          {/* ── Setup progress strip ── */}
          {(() => {
            const hasHeads = categories.length > 0
            const allAmountsSet = fixedAmountsComplete()   // fixed fees only — variable are optional
            const steps = [
              { n: 1, label: 'Add Fee Heads',     done: hasHeads },
              { n: 2, label: 'Set Fixed Amounts', done: allAmountsSet },
              { n: 3, label: 'Generate Bills',    done: allReadyHeadsBilled() },
              { n: 4, label: 'Lock Plan',         done: !!structureLock },
            ]
            const doneCount = steps.filter(s => s.done).length
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Fee Plan Setup — {academicYear}</h3>
                  <span className="text-xs text-gray-400">{doneCount} of 4 steps done</span>
                </div>
                <div className="flex items-center gap-2">
                  {steps.map((s, i) => (
                    <Fragment key={s.n}>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                          {s.done ? '✓' : s.n}
                        </div>
                        <span className={`text-xs font-medium ${s.done ? 'text-green-700' : 'text-gray-500'}`}>{s.label}</span>
                      </div>
                      {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${s.done ? 'bg-green-300' : 'bg-gray-200'}`} />}
                    </Fragment>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── Mandated order hint ── */}
          {!structureLock && categories.length > 0 && (() => {
            const missing = fixedFeesMissingAmounts()
            const generated = anyBillsGenerated()
            if (missing.length > 0) {
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <strong>Next step — set fixed fee amounts.</strong> Generate Bills unlocks once every fixed fee has amounts.
                  Still missing: <strong>{missing.join(', ')}</strong>. (Variable fees are optional and set per student.)
                </div>
              )
            }
            if (!generated) {
              return (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
                  <strong>All fixed amounts set.</strong> Now click <strong>Generate All Bills</strong>. After bills are generated you can lock the plan.
                </div>
              )
            }
            return (
              <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-800">
                <strong>Bills generated.</strong> You can now collect fees, or lock the plan to prevent accidental changes.
              </div>
            )
          })()}

          {/* ── UPI ID — only when online-payments feature is enabled ── */}
          {hasOnlinePayments && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-700">School UPI ID — for online fee payments</p>
                {upiId && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Configured</span>}
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Parents pay to this UPI ID via the QR code in their portal. Without it, online payment is disabled.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-56">
                  <input type="text" value={upiId} onChange={e => { setUpiId(e.target.value); setUpiMsg('') }}
                    placeholder="e.g. school@okhdfcbank"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={saveUpiId} disabled={upiSaving}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                  {upiSaving ? 'Saving…' : 'Save UPI ID'}
                </button>
                {upiMsg && <span className={`text-sm ${upiMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{upiMsg}</span>}
              </div>
            </div>
          )}

          {/* ── Lock banner ── */}
          {structureLock ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-amber-600 text-lg">🔒</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Fee Plan Locked</p>
                    <p className="text-xs text-amber-600">Locked by <strong>{structureLock.locked_by}</strong> on {fmtDate(structureLock.locked_at)} · Changes need an Amendment with a reason</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Generate for new students — safe even when locked (ON CONFLICT DO NOTHING) */}
                  <button
                    onClick={generateForNew}
                    disabled={generatingLedger || !stats || stats.unbilled_students === 0}
                    title={
                      !stats || stats.unbilled_students === 0
                        ? 'No unbilled students — all active students already have bills'
                        : `${stats.unbilled_students} student(s) have no bills yet — click to generate`
                    }
                    className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium">
                    {generatingLedger ? 'Generating…' : `Generate for New${stats && (stats.unbilled_students ?? 0) > 0 ? ` (${stats.unbilled_students})` : ''}`}
                  </button>
                  <button onClick={() => setShowAmendLog(p => !p)} className="text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100">
                    {showAmendLog ? 'Hide' : 'View'} Amendments ({amendments.length})
                  </button>
                  <button onClick={unlockStructure} disabled={lockingStructure} className="text-xs text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                    {lockingStructure ? 'Unlocking…' : 'Unlock'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

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

          {/* ── Top action bar ── */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {categories.length} fee {categories.length === 1 ? 'head' : 'heads'} ·{' '}
              <span className="text-green-600 font-medium">{categories.filter(c => feeBillsGenerated(c)).length} with bills generated</span>
            </p>
            <div className="flex items-center gap-2">
              {structureMsg && (
                <span className={`text-sm ${structureMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{structureMsg}</span>
              )}
              {!structureLock && (
                <>
                  <button onClick={() => { setShowAddFee(true); setAddFeeStep(1) }}
                    className="text-sm border border-blue-200 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg font-medium">
                    + Add Fee Head
                  </button>
                  <button onClick={generateLedger}
                    disabled={generatingLedger || categories.length === 0 || !fixedAmountsComplete()}
                    title={!fixedAmountsComplete() ? `Set amounts for all fixed fees first${fixedFeesMissingAmounts().length ? ': ' + fixedFeesMissingAmounts().join(', ') : ''}` : 'Generate bills for all students'}
                    className="text-sm bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                    {generatingLedger ? 'Generating…' : 'Generate All Bills'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Sub-view toggle ── */}
          {categories.length > 0 && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              {([
                { key: 'heads',    label: 'Fee Heads & Amounts' },
                { key: 'variable', label: 'All Variable Fees (one grid)' },
              ] as const).map(v => (
                <button key={v.key} onClick={() => setPlanView(v.key)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    planView === v.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>{v.label}</button>
              ))}
            </div>
          )}

          {/* ═══ ALL VARIABLE FEES — combined grid ═══ */}
          {planView === 'variable' && categories.length > 0 && (() => {
            const varHeads = categories.filter(c => c.category_type === 'variable' && c.is_active)
            if (varHeads.length === 0) {
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-700">
                  No variable fee heads yet. Mark a fee head as <strong>Variable</strong> (per student) under “Fee Heads &amp; Amounts” first.
                </div>
              )
            }
            const changedCount = Object.keys(vgAmounts).filter(k => (vgAmounts[k] || '') !== (vgOriginal[k] || '')).length
              + Object.keys(vgOriginal).filter(k => !(k in vgAmounts) && vgOriginal[k]).length
            return (
              <div className="space-y-3">
                {/* Class picker */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-gray-600">Class:</span>
                  <select value={vgGrade} onChange={e => { setVgGrade(e.target.value); setVgStudents([]); setVgCategories([]); setVgMsg('') }}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                    <option value="">Select grade…</option>
                    {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                  <select value={vgSection} onChange={e => setVgSection(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                    <option value="all">All sections</option>
                    {['A','B','C','D','E','F'].map(s => <option key={s} value={s}>Section {s}</option>)}
                  </select>
                  <button onClick={loadVarGrid} disabled={!vgGrade || vgLoading}
                    className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                    {vgLoading ? 'Loading…' : 'Load'}
                  </button>
                  <p className="text-xs text-gray-400 ml-auto">Enter every variable fee for a student in one row, save once.</p>
                </div>

                {vgMsg && <p className={`text-sm font-medium ${vgMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{vgMsg}</p>}

                {vgStudents.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm text-gray-600">{vgStudents.length} students · {varHeads.length} variable fees</p>
                      {changedCount > 0 && <p className="text-xs text-amber-600 font-medium">{changedCount} unsaved change{changedCount !== 1 ? 's' : ''}</p>}
                    </div>
                    <div className="overflow-x-auto max-h-[540px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 z-10">
                          <tr className="text-xs text-gray-500 border-b border-gray-100">
                            <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Student</th>
                            {varHeads.map(c => (
                              <th key={c.id} className="text-right px-3 py-2 font-semibold whitespace-nowrap">
                                {c.name}<div className="text-[10px] text-gray-400 font-normal capitalize">{c.frequency}</div>
                              </th>
                            ))}
                            <th className="text-right px-4 py-2 font-semibold whitespace-nowrap">Row total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vgStudents.map(s => {
                            const rowTotal = varHeads.reduce((sum, c) => sum + (parseFloat(vgAmounts[`${s.id}:${c.id}`] || '0') || 0), 0)
                            return (
                              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-2 whitespace-nowrap">
                                  <p className="font-medium text-gray-800">{s.name}</p>
                                  <p className="text-xs text-gray-400">{s.section ? `Sec ${s.section} · ` : ''}#{s.roll_number}</p>
                                </td>
                                {varHeads.map(c => {
                                  const key = `${s.id}:${c.id}`
                                  const changed = (vgAmounts[key] || '') !== (vgOriginal[key] || '')
                                  return (
                                    <td key={c.id} className="px-2 py-2 text-right">
                                      <div className="relative inline-flex items-center">
                                        <span className="absolute left-2 text-gray-400 text-xs pointer-events-none">₹</span>
                                        <input type="number" min="0" placeholder="—"
                                          value={vgAmounts[key] || ''}
                                          onKeyDown={blockNonNumericKeys}
                                          onChange={e => setVgAmounts(p => ({ ...p, [key]: sanitizeMoney(e.target.value) }))}
                                          className={`w-24 pl-5 pr-1 py-1 text-right border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${changed ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`} />
                                      </div>
                                    </td>
                                  )
                                })}
                                <td className="px-4 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">{rowTotal > 0 ? fmt(rowTotal) : '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 border-t-2 border-gray-100 font-semibold">
                            <td className="px-4 py-2 text-gray-700">Column total</td>
                            {varHeads.map(c => {
                              const colTotal = vgStudents.reduce((sum, s) => sum + (parseFloat(vgAmounts[`${s.id}:${c.id}`] || '0') || 0), 0)
                              return <td key={c.id} className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{colTotal > 0 ? fmt(colTotal) : '—'}</td>
                            })}
                            <td className="px-4 py-2 text-right text-blue-700 whitespace-nowrap">
                              {fmt(vgStudents.reduce((sum, s) => sum + varHeads.reduce((rs, c) => rs + (parseFloat(vgAmounts[`${s.id}:${c.id}`] || '0') || 0), 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                      <p className="text-xs text-gray-400">Blank = not applicable. Changed cells are highlighted until saved.</p>
                      <div className="flex gap-2">
                        <button onClick={() => { setVgAmounts({ ...vgOriginal }); setVgMsg('') }}
                          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Reset</button>
                        <button onClick={saveVarGrid} disabled={vgSaving || changedCount === 0}
                          className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg font-medium disabled:opacity-50">
                          {vgSaving ? 'Saving…' : 'Save All & Update Ledger'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {vgGrade && !vgLoading && vgStudents.length === 0 && !vgMsg && (
                  <p className="text-sm text-gray-400 px-1">Click Load to show students for this class.</p>
                )}
              </div>
            )
          })()}

          {/* ── Empty state ── */}
          {planView === 'heads' && (categories.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">💰</div>
              <p className="text-gray-600 font-medium mb-1">No fee heads yet</p>
              <p className="text-gray-400 text-sm mb-5">Start by adding what your school charges — Tuition, Transport, Exam Fee, etc.</p>
              <button onClick={() => { setShowAddFee(true); setAddFeeStep(1) }}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700">
                + Add Your First Fee Head
              </button>
            </div>
          ) : (
            /* ── Fee head cards ── */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {categories.map(cat => {
                const amountsSet = feeHasAmounts(cat.id, cat.category_type)
                const generated = feeBillsGenerated(cat)
                const catStat = stats?.by_category.find(c => c.category_name === cat.name)
                const collected = catStat ? Number(catStat.total_collected) : 0
                const due = catStat ? Number(catStat.total_due) : 0
                const collPct = pct(collected, due)
                return (
                  <div key={cat.id} className={`bg-white rounded-xl border p-5 ${!cat.is_active ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-xl">{feeIcon(cat.name)}</div>
                        <div>
                          <p className="font-semibold text-gray-800">{cat.name}{!cat.is_active && <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Inactive</span>}</p>
                          <p className="text-xs text-gray-400">
                            {FREQ_LABEL[cat.frequency]} · {cat.category_type === 'variable' ? 'Per student' : 'Same for all'}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cat.category_type === 'variable' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                        {cat.category_type === 'variable' ? 'Variable' : 'Fixed'}
                      </span>
                    </div>

                    {/* Status row */}
                    <div className="flex items-center gap-4 mt-4 text-xs flex-wrap">
                      <span className={amountsSet ? 'text-green-600' : 'text-amber-600'}>
                        {amountsSet ? '✅ Amounts set' : '⚠ Amounts not set'}
                      </span>
                      <span className={generated ? 'text-green-600' : 'text-gray-400'}>
                        {generated ? '✅ Bills generated' : '◌ Bills not generated'}
                      </span>
                      {/* Due day — always visible, inline editable */}
                      <span className="flex items-center gap-1 ml-auto">
                        <span className="text-gray-400">Due on</span>
                        {structureLock ? (
                          <span className="font-semibold text-gray-700">{dueDays[cat.id] || '10'}</span>
                        ) : (
                          <input
                            type="number" min="1" max="28"
                            value={dueDays[cat.id] || ''}
                            placeholder="10"
                            onChange={e => setDueDays(p => ({ ...p, [cat.id]: e.target.value }))}
                            onBlur={() => { if (feeHasAmounts(cat.id, cat.category_type)) saveFeeAmounts(cat) }}
                            className="w-10 text-center border border-gray-300 rounded px-1 py-0.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                          />
                        )}
                        <span className="text-gray-400">of month</span>
                      </span>
                    </div>

                    {/* Collection progress (if bills exist) */}
                    {generated && due > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Collected</span>
                          <span className="font-bold text-gray-600">{collPct}% · {fmt(collected)} / {fmt(due)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${collPct >= 80 ? 'bg-green-500' : collPct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${collPct}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                      <button
                        onClick={() => { setPlanManageCatId(planManageCatId === cat.id ? null : cat.id); setGroupAmounts({}); setStructureMsg(''); if (cat.category_type === 'variable') { setApplGrade(''); setApplStudents([]); setApplCategories([]); setApplAmounts({}) } }}
                        className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700"
                      >
                        {planManageCatId === cat.id ? 'Close' : 'Manage →'}
                      </button>
                      <button onClick={() => loadStructHistory(cat.id)}
                        className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                        History
                      </button>
                      {!structureLock && cat.is_active && (
                        <button onClick={() => toggleCategoryType(cat)}
                          className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 ml-auto">
                          Switch to {cat.category_type === 'fixed' ? 'Variable' : 'Fixed'}
                        </button>
                      )}
                    </div>

                    {/* Structure history inline */}
                    {structHistCatId === cat.id && (
                      <div className="mt-3 bg-indigo-50 rounded-lg p-2 text-[10px] max-h-40 overflow-y-auto">
                        <p className="font-semibold text-indigo-700 mb-1 uppercase tracking-wide">Amount Change History</p>
                        {structHistLoading ? <p className="text-indigo-400">Loading…</p> :
                          !(structHistories[cat.id]?.length) ? <p className="text-gray-400 italic">No changes recorded yet.</p> : (
                          <div className="space-y-1">
                            {structHistories[cat.id].map(h => (
                              <div key={h.id} className="bg-white rounded px-2 py-1 border border-indigo-100 flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-indigo-600">Gr.{h.grade}</span>
                                {h.old_amount !== null && <><span className="line-through text-gray-400">₹{h.old_amount}</span><span className="text-gray-300">→</span></>}
                                <span className="font-bold text-indigo-800">₹{h.new_amount}</span>
                                <span className="text-gray-400">· {h.changed_by}</span>
                                <span className="text-gray-400">· {new Date(h.changed_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── MANAGE PANEL (inline expand) ── */}
                    {planManageCatId === cat.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        {cat.category_type === 'variable' ? (
                          /* ── Variable: per-student amounts ── */
                          <div className="space-y-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Set per-student amounts</p>
                            <div className="flex items-center gap-2">
                              <select value={applGrade}
                                onChange={e => { setApplGrade(e.target.value); setApplStudents([]); setApplCategories([]); setApplAmounts({}); setApplMsg('') }}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                                <option value="">Select grade…</option>
                                {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                              </select>
                              <button onClick={() => loadApplicability(applGrade)} disabled={!applGrade || applLoading}
                                className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                                {applLoading ? 'Loading…' : 'Load Students'}
                              </button>
                            </div>

                            {applGrade && !applLoading && applStudents.length > 0 && (
                              <>
                                <div className="border border-gray-100 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                                  <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-gray-50">
                                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                                        <th className="text-left px-3 py-2 font-semibold">Student</th>
                                        <th className="text-left px-3 py-2 font-semibold">Sec</th>
                                        <th className="text-center px-3 py-2 font-semibold">Amount (₹)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {applStudents.map(s => {
                                        const key = `${s.id}:${cat.id}`
                                        return (
                                          <tr key={s.id} className="hover:bg-gray-50/60">
                                            <td className="px-3 py-1.5">
                                              <p className="font-medium text-gray-800 text-sm">{s.name}</p>
                                              <p className="text-[10px] text-gray-400">#{s.roll_number}</p>
                                            </td>
                                            <td className="px-3 py-1.5 text-xs text-gray-500">{s.section}</td>
                                            <td className="px-3 py-1.5 text-center">
                                              <input type="number" min="0" placeholder="—"
                                                value={applAmounts[key] || ''}
                                                onKeyDown={blockNonNumericKeys}
                                                onChange={e => setApplAmounts(p => ({ ...p, [key]: sanitizeMoney(e.target.value) }))}
                                                className="w-24 text-center border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-400" />
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="flex items-center justify-between">
                                  {applMsg && <span className={`text-xs ${applMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{applMsg}</span>}
                                  <button onClick={saveApplicability} disabled={applSaving}
                                    className="ml-auto text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg font-medium disabled:opacity-50">
                                    {applSaving ? 'Saving…' : 'Save Amounts'}
                                  </button>
                                </div>
                                <p className="text-[10px] text-gray-400">Tip: leave blank = student is not charged this fee.</p>
                              </>
                            )}
                            {applGrade && !applLoading && applStudents.length === 0 && (
                              <p className="text-xs text-gray-400">No active students in Grade {applGrade}.</p>
                            )}
                          </div>
                        ) : (
                          /* ── Fixed: grade-group amounts ── */
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Set amounts by grade</p>
                            </div>

                            {/* Grade group quick-fill */}
                            <div className="grid grid-cols-2 gap-2">
                              {GRADE_GROUPS.map(grp => (
                                <div key={grp.key} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                                  <div className="flex-1">
                                    <p className="text-xs font-medium text-gray-700">{grp.label}</p>
                                    <p className="text-[10px] text-gray-400">{grp.sub}</p>
                                  </div>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1.5 text-gray-400 text-xs">₹</span>
                                    <input type="number" min="0" placeholder="0"
                                      value={groupAmounts[grp.key] || ''}
                                      onKeyDown={blockNonNumericKeys}
                                      onChange={e => setGroupAmounts(p => ({ ...p, [grp.key]: sanitizeMoney(e.target.value) }))}
                                      className="w-24 pl-5 pr-1 py-1 text-xs border border-gray-200 rounded" />
                                  </div>
                                  <button onClick={() => applyGroupAmount(cat.id, grp.grades, groupAmounts[grp.key] || '')}
                                    className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-medium hover:bg-blue-700">
                                    Apply
                                  </button>
                                </div>
                              ))}
                            </div>

                            {/* Individual grades */}
                            <div>
                              <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wide">Individual grades (review &amp; adjust)</p>
                              <div className="grid grid-cols-4 gap-2">
                                {GRADES.map(g => (
                                  <div key={g} className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-400 w-8">Gr.{g}</span>
                                    <input type="number" min="0" placeholder="0"
                                      value={editAmounts[`${cat.id}_${g}`] || ''}
                                      onKeyDown={blockNonNumericKeys}
                                      onChange={e => setEditAmounts(p => ({ ...p, [`${cat.id}_${g}`]: sanitizeMoney(e.target.value) }))}
                                      className="w-full text-center border border-gray-200 rounded px-1 py-1 text-xs" />
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-end">
                              <button onClick={() => saveFeeAmounts(cat)} disabled={savingStructure}
                                className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg font-medium disabled:opacity-50">
                                {savingStructure ? 'Saving…' : 'Save Amounts'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {/* ── Lock plan CTA (when not locked) ── */}
          {!structureLock && categories.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-800">Finished setting up?</p>
                <p className="text-xs text-blue-600">
                  {anyBillsGenerated()
                    ? "Lock the plan so amounts can't be changed accidentally. After locking, changes need an amendment with a reason."
                    : 'Generate bills first — the plan can only be locked after bills are generated.'}
                </p>
              </div>
              <button onClick={lockStructure} disabled={lockingStructure || !anyBillsGenerated()}
                title={!anyBillsGenerated() ? 'Generate bills before locking' : 'Lock the fee plan'}
                className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
                {lockingStructure ? 'Locking…' : '🔒 Lock Fee Plan'}
              </button>
            </div>
          )}

          {/* ── Generate Bills confirmation modal ── */}
          {showGenerateConfirm && (
            <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={() => setShowGenerateConfirm(false)}>
              <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-gray-800">Confirm Due Dates Before Generating Bills</p>
                  <button onClick={() => setShowGenerateConfirm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-sm text-gray-500">Bills will be generated with the following due dates. Check each one before continuing.</p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                          <th className="text-left px-4 py-2 font-semibold">Fee Head</th>
                          <th className="text-left px-4 py-2 font-semibold">Frequency</th>
                          <th className="text-center px-4 py-2 font-semibold">Due Day</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {categories.filter(c => c.is_active).map(cat => {
                          const day = parseInt(dueDays[cat.id] || '10') || 10
                          const isDefault = !dueDays[cat.id] || dueDays[cat.id] === '10'
                          return (
                            <tr key={cat.id} className="hover:bg-gray-50/60">
                              <td className="px-4 py-2.5 font-medium text-gray-800">{cat.name}</td>
                              <td className="px-4 py-2.5 text-gray-500">{FREQ_LABEL[cat.frequency]}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`font-semibold ${isDefault ? 'text-amber-600' : 'text-gray-800'}`}>{day}</span>
                                {isDefault && <span className="ml-1 text-[10px] text-amber-500">(default)</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-amber-600">⚠ Dates marked <strong>default</strong> were not explicitly set. Go back to change them on the fee head card before generating.</p>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                  <button onClick={() => setShowGenerateConfirm(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                    ← Go back & edit
                  </button>
                  <button onClick={confirmGenerateLedger}
                    className="text-sm bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700">
                    Looks correct — Generate Bills
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Add Fee Head wizard (modal) ── */}
          {showAddFee && (
            <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={() => { setShowAddFee(false); setAddFeeStep(1) }}>
              <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-gray-800">Add Fee Head — Step {addFeeStep} of 3</p>
                  <button onClick={() => { setShowAddFee(false); setAddFeeStep(1) }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>

                <div className="p-5">
                  {/* Step 1 — name */}
                  {addFeeStep === 1 && (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">What fee is this?</p>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORY_SUGGESTIONS.map(s => (
                          <button key={s.name} type="button"
                            onClick={() => setNewCategory({ name: s.name, frequency: s.frequency, description: '', category_type: s.category_type })}
                            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${newCategory.name === s.name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Or type a custom name</label>
                        <input type="text" placeholder="e.g. Smart Class Fee" value={newCategory.name}
                          onChange={e => setNewCategory(p => ({ ...p, name: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  )}

                  {/* Step 2 — frequency */}
                  {addFeeStep === 2 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">How often is it charged?</p>
                      {(['monthly','quarterly','half_yearly','annual','one_time'] as const).map(f => (
                        <button key={f} type="button"
                          onClick={() => setNewCategory(p => ({ ...p, frequency: f }))}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${newCategory.frequency === f ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3.5 h-3.5 rounded-full border-2 ${newCategory.frequency === f ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                            <span className="text-sm font-semibold text-gray-700">{FREQ_LABEL[f]}</span>
                          </div>
                          <p className="text-xs text-gray-400 pl-5">{FREQ_HELP[f]}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Step 3 — type */}
                  {addFeeStep === 3 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Same amount or different per student?</p>
                      <button type="button" onClick={() => setNewCategory(p => ({ ...p, category_type: 'fixed' }))}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${newCategory.category_type === 'fixed' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 ${newCategory.category_type === 'fixed' ? 'border-green-500 bg-green-500' : 'border-gray-300'}`} />
                          <span className="text-sm font-semibold text-gray-700">Same for everyone in a grade</span>
                        </div>
                        <p className="text-xs text-gray-400 pl-5">One amount per grade. Example: Tuition Fee.</p>
                      </button>
                      <button type="button" onClick={() => setNewCategory(p => ({ ...p, category_type: 'variable' }))}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${newCategory.category_type === 'variable' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 ${newCategory.category_type === 'variable' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                          <span className="text-sm font-semibold text-gray-700">Different per student</span>
                        </div>
                        <p className="text-xs text-gray-400 pl-5">Set individual amounts. Example: Transport (varies by route).</p>
                      </button>
                    </div>
                  )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                  <button onClick={() => addFeeStep > 1 ? setAddFeeStep(addFeeStep - 1) : (setShowAddFee(false), setAddFeeStep(1))}
                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                    {addFeeStep > 1 ? '← Back' : 'Cancel'}
                  </button>
                  {addFeeStep < 3 ? (
                    <button onClick={() => setAddFeeStep(addFeeStep + 1)} disabled={addFeeStep === 1 && !newCategory.name.trim()}
                      className="text-sm bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40">
                      Next →
                    </button>
                  ) : (
                    <button onClick={createFeeHead}
                      className="text-sm bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">
                      Create Fee Head
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ COLLECTION ══════════════════════════════════════════════════════════ */}
      {activeTab === 'collect' && (
        <div className="space-y-4">

          {/* Online payments alert banner — only when feature enabled */}
          {hasOnlinePayments && pendingPayments.length > 0 && collectionView !== 'online' && (
            <button onClick={() => setCollectionView('online')}
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
              { key: 'defaulters', label: 'Defaulters',    show: true },
              { key: 'dayclose',   label: 'Day Close',     show: true },
            ] as const).filter(v => v.show).map(v => (
              <button key={v.key} onClick={() => setCollectionView(v.key)}
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
                <input type="text" placeholder="Search name, roll, grade, phone, parent…" value={ledgerSearch}
                  onChange={e => setLedgerSearch(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={ledgerGrade} onChange={e => setLedgerGrade(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
                  <option value="">All Grades</option>
                  {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
                <button onClick={loadLedger} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Refresh</button>
                <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download
                  className="text-sm border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50">Export</a>
              </div>

              {/* Quick filter chips */}
              <div className="flex gap-2 flex-wrap">
                {([
                  { key: '',        label: `All Students (${studentRows.length})` },
                  { key: 'overdue', label: `Overdue (${studentRows.filter(r => r.has_overdue).length})` },
                  { key: 'partial', label: `Partially Paid (${studentRows.filter(r => r.total_paid > 0 && r.outstanding > 0).length})` },
                  { key: 'never',   label: `Never Paid (${studentRows.filter(r => r.never_paid && r.outstanding > 0).length})` },
                  { key: 'clear',   label: `Fully Cleared (${studentRows.filter(r => r.outstanding === 0).length})` },
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
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500">
                    <div className="col-span-4">Student</div>
                    <div className="col-span-2 text-right">Billed</div>
                    <div className="col-span-2 text-right">Paid</div>
                    <div className="col-span-2 text-right">Outstanding</div>
                    <div className="col-span-2 text-center">Action</div>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                    {collectionFiltered.map(row => (
                      <Fragment key={row.student_id}>
                        <div className={`px-4 py-3 grid grid-cols-12 gap-2 items-center hover:bg-gray-50/60 cursor-pointer ${openStudentId === row.student_id ? 'bg-blue-50/40' : ''}`}
                          onClick={() => toggleStudent(row.student_id)}>
                          <div className="col-span-4">
                            <p className="text-sm font-medium text-gray-800">{row.student_name}</p>
                            <p className="text-xs text-gray-400">Gr.{row.grade}{row.section}{row.school_roll_number != null ? ` · Roll ${row.school_roll_number}` : ''}</p>
                          </div>
                          <div className="col-span-2 text-right text-sm text-gray-600">{fmt(row.total_billed)}</div>
                          <div className="col-span-2 text-right text-sm text-green-600">{fmt(row.total_paid)}</div>
                          <div className="col-span-2 text-right text-sm font-bold text-red-600">{fmt(row.outstanding)}</div>
                          <div className="col-span-2 flex justify-center gap-1.5" onClick={e => e.stopPropagation()}>
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
                                    const selected = row.open_entries.filter(e => collectChecked.has(e.id))
                                    const selectedTotal = selected.reduce((s, e) => s + Number(e.balance), 0)
                                    let lines: { cat: string; period: string; amount: number }[]
                                    if (paySuccess.amount >= selectedTotal - 0.01 && selected.length > 0) {
                                      // full payment of selected bills — itemise each
                                      lines = selected.map(e => ({ cat: e.category_name, period: e.period_label, amount: Number(e.balance) }))
                                    } else {
                                      // partial payment — single line for the actual amount taken
                                      lines = [{ cat: 'Part payment towards dues', period: selected.map(e => e.period_label).join(', ') || paySuccess.period_label, amount: paySuccess.amount }]
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
                                          // re-sync the amount field to the new selected total
                                          const newTotal = row.open_entries.filter(x => next.has(x.id)).reduce((s, x) => s + Number(x.balance), 0)
                                          setPayAmount(String(newTotal))
                                        }}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                      <span className="flex-1 text-sm text-gray-700">{e.category_name} · <span className="text-gray-400">{e.period_label}</span></span>
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
                                {payError && <p className="text-sm text-red-600">{payError}</p>}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setShowPayConfirm(true)}
                                    disabled={collectLoading || !(parseFloat(payAmount) > 0) || parseFloat(payAmount) > checkedTotal + 0.01}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Review & Confirm
                                  </button>
                                  <button
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
                                      onClick={() => { loadPassbook(row.student_id); setShowPassbookModal(true); setPbSection('payments') }}
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
                                        <button onClick={() => { setShowCounterHistory(false); setCancelPmtId(null) }} className="text-xs text-gray-400 hover:text-gray-600">Hide</button>
                                      </div>
                                      {counterPmtLoading ? (
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
                                                  cancelPmtId === p.id ? (
                                                    <button onClick={() => setCancelPmtId(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                                                  ) : (
                                                    <button onClick={() => openCancel(p.id)}
                                                      className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Cancel / Correct</button>
                                                  )
                                                ) : (
                                                  <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium capitalize">{p.payment_status.replace('_', ' ')}</span>
                                                )}
                                              </div>

                                              {/* Inline cancel/correct form */}
                                              {cancelPmtId === p.id && (
                                                <div className="mt-2 pt-2 border-t border-amber-100 bg-amber-50 -mx-3 -mb-2 px-3 py-2 rounded-b-lg space-y-2">
                                                  <div className="flex gap-2">
                                                    <button onClick={() => setCancelMode('cancel')}
                                                      className={`text-xs px-3 py-1 rounded-lg font-medium ${cancelMode === 'cancel' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Cancel</button>
                                                    <button onClick={() => { setCancelMode('correct'); setCorrectAmount(String(p.amount)) }}
                                                      className={`text-xs px-3 py-1 rounded-lg font-medium ${cancelMode === 'correct' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Correct Amount</button>
                                                  </div>
                                                  <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                                    {cancelMode === 'cancel'
                                                      ? <>⚠ Reverses <strong>{fmt(p.amount)}</strong> from the ledger. Balance increases by {fmt(p.amount)}; receipt {p.receipt_number} stays on record as cancelled.</>
                                                      : <>⚠ Cancels {p.receipt_number} ({fmt(p.amount)}) and issues a new receipt for <strong>{correctAmount ? fmt(parseFloat(correctAmount) || 0) : '₹0'}</strong>. Net change: {fmt((parseFloat(correctAmount) || 0) - Number(p.amount))}.</>}
                                                  </div>
                                                  {cancelMode === 'correct' && (
                                                    <input type="number" min="0" inputMode="decimal" value={correctAmount}
                                                      onKeyDown={blockNonNumericKeys}
                                                      onChange={e => setCorrectAmount(sanitizeMoney(e.target.value))}
                                                      placeholder="Correct amount" className="w-40 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                                  )}
                                                  <input type="text" placeholder="Reason (required — recorded in audit log)"
                                                    value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                                  {cancelMsg && <p className={`text-xs ${cancelMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cancelMsg}</p>}
                                                  <div className="flex gap-2">
                                                    <button onClick={() => submitCancelCorrect('counter', row.student_id)} disabled={cancelBusy || !cancelReason.trim()}
                                                      className={`text-xs text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${cancelMode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                                      {cancelBusy ? 'Working…' : cancelMode === 'cancel' ? `Confirm Cancel (${fmt(p.amount)})` : 'Confirm Correction'}
                                                    </button>
                                                    <button onClick={() => setCancelPmtId(null)} className="text-xs text-gray-500 px-3 py-1.5">Close</button>
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
                  <p className="text-xs text-gray-400 mt-0.5">Check your school's UPI/bank statement, then approve or reject. Parent is notified by email.</p>
                </div>
                <button onClick={loadPending} className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">Refresh</button>
              </div>

              {verifyMsg && (
                <div className={`text-sm px-4 py-3 rounded-lg ${verifyMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>{verifyMsg}</div>
              )}

              {pendingLoading ? (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
              ) : pendingPayments.length === 0 ? (
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

          {/* ─── DEFAULTERS ─── */}
          {collectionView === 'defaulters' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-800">Defaulters — Outstanding Dues</h3>
                <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger&status=overdue`} download
                  className="text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">Export Defaulters</a>
              </div>
              {(() => {
                const defaulters = studentRows.filter(r => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding)
                if (ledgerLoading) return <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
                if (defaulters.length === 0) return (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                    <p className="text-green-700 font-medium">No defaulters — all dues cleared!</p>
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
                  <p className="text-xs text-gray-400 mt-0.5">Review the day's collections and verify cash in hand. Closing locks the day's record.</p>
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

                  {/* Cash verification */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Cash Verification</p>
                    <div className="grid grid-cols-3 gap-4 items-end">
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
                    <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=payments`} download
                      className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">Export Day Report</a>
                    <button onClick={submitDayClose} disabled={dayCloseSubmitting || dayCloseData.receipts.count === 0}
                      className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                      {dayCloseSubmitting ? 'Closing…' : dayCloseData.already_closed ? 'Update Day Close' : 'Submit Day Close'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ═══ STUDENT PASSBOOK ════════════════════════════════════════════════════ */}
      {activeTab === 'students' && (
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
                  {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
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
                        <button key={s.id} onClick={() => loadPassbook(s.id)}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between group">
                          <span className="text-sm font-medium text-gray-800">{s.name}</span>
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
              <button onClick={() => setPbData(null)}
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
                  <button onClick={printPassbookStatement}
                    className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">🖨 Print Statement</button>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { l: 'Total Billed', v: pbData.summary.total_billed, c: 'text-gray-900' },
                    { l: 'Paid',         v: pbData.summary.total_paid,    c: 'text-green-700' },
                    { l: 'Waived',       v: pbData.summary.total_waived,  c: 'text-purple-700' },
                    { l: 'Outstanding',  v: pbData.summary.outstanding,   c: 'text-red-600' },
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
                  { key: 'bills',    label: `Current Bills (${pbData.ledger.length})` },
                  { key: 'payments', label: `Payments (${pbData.payments.length})` },
                  { key: 'waivers',  label: `Waivers (${pbData.waivers.length})` },
                  { key: 'timeline', label: 'Full Timeline' },
                ] as const).map(v => (
                  <button key={v.key} onClick={() => setPbSection(v.key)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      pbSection === v.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>{v.label}</button>
                ))}
              </div>

              {/* Bills */}
              {pbSection === 'bills' && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {pbData.ledger.length === 0 ? (
                    <p className="text-sm text-gray-400 p-8 text-center">No bills recorded.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                          <th className="text-left px-4 py-2 font-semibold">Fee Head · Period</th>
                          <th className="text-right px-4 py-2 font-semibold">Billed</th>
                          <th className="text-right px-4 py-2 font-semibold">Paid</th>
                          <th className="text-right px-4 py-2 font-semibold">Waived</th>
                          <th className="text-right px-4 py-2 font-semibold">Balance</th>
                          <th className="text-left px-4 py-2 font-semibold">Due Date</th>
                          <th className="text-left px-4 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pbData.ledger.map(e => (
                          <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-700">{e.category_name} · <span className="text-gray-400">{e.period_label}</span></td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{fmt(e.amount_due)}</td>
                            <td className="px-4 py-2.5 text-right text-green-600">{fmt(e.amount_paid)}</td>
                            <td className="px-4 py-2.5 text-right text-purple-600">{Number(e.waiver_amount) > 0 ? fmt(e.waiver_amount) : '—'}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmt(e.balance)}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{e.due_date}</td>
                            <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[e.status]}`}>{e.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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
                    {pbData.payments.length === 0 ? (
                      <p className="text-sm text-gray-400 p-8 text-center">No payments recorded.</p>
                    ) : (
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
                          {pbData.payments.map(p => {
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
                                    ) : cancelPmtId === p.id ? (
                                      <button onClick={() => setCancelPmtId(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                                    ) : (
                                      <button onClick={() => openCancel(p.id)}
                                        className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Cancel / Correct</button>
                                    )}
                                    <button onClick={() => printPassbookReceipt(p)} title="Print receipt"
                                      className="text-xs border border-indigo-200 text-indigo-600 px-2.5 py-1 rounded-lg hover:bg-indigo-50">🖨 Print</button>
                                  </div>
                                </td>
                              </tr>
                              {cancelPmtId === p.id && (
                                <tr className="bg-amber-50 border-b border-amber-100">
                                  <td colSpan={6} className="px-4 py-3">
                                    <div className="space-y-3">
                                      <div className="flex gap-2">
                                        <button onClick={() => setCancelMode('cancel')}
                                          className={`text-xs px-3 py-1.5 rounded-lg font-medium ${cancelMode === 'cancel' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Cancel Payment</button>
                                        <button onClick={() => { setCancelMode('correct'); setCorrectAmount(String(p.amount)) }}
                                          className={`text-xs px-3 py-1.5 rounded-lg font-medium ${cancelMode === 'correct' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Correct Amount</button>
                                      </div>

                                      {/* Consequence preview */}
                                      <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                        {cancelMode === 'cancel' ? (
                                          <>⚠ This will reverse <strong>{fmt(p.amount)}</strong> from the student&apos;s ledger. The bill balance will increase by {fmt(p.amount)} and its status may revert to pending/overdue. Receipt {p.receipt_number} stays on record marked cancelled.</>
                                        ) : (
                                          <>⚠ This cancels receipt {p.receipt_number} ({fmt(p.amount)}) and records a fresh payment of <strong>{correctAmount ? fmt(parseFloat(correctAmount) || 0) : '₹0'}</strong> with a new receipt number. Net ledger change: {fmt((parseFloat(correctAmount) || 0) - Number(p.amount))}.</>
                                        )}
                                      </div>

                                      {cancelMode === 'correct' && (
                                        <div>
                                          <label className="text-xs font-medium text-gray-600">Corrected amount (₹)</label>
                                          <input type="number" min="0" inputMode="decimal" value={correctAmount}
                                            onKeyDown={blockNonNumericKeys}
                                            onChange={e => setCorrectAmount(sanitizeMoney(e.target.value))}
                                            className="mt-1 w-40 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                        </div>
                                      )}
                                      <div>
                                        <label className="text-xs font-medium text-gray-600">Reason (required — recorded in audit log)</label>
                                        <input type="text" placeholder="e.g. Wrong amount entered · Cheque bounced · Duplicate entry"
                                          value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                      </div>
                                      {cancelMsg && <p className={`text-xs ${cancelMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cancelMsg}</p>}
                                      <div className="flex gap-2">
                                        <button onClick={() => submitCancelCorrect('passbook')} disabled={cancelBusy || !cancelReason.trim()}
                                          className={`text-sm text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${cancelMode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                          {cancelBusy ? 'Working…' : cancelMode === 'cancel' ? `Confirm Cancel (${fmt(p.amount)})` : 'Confirm Correction'}
                                        </button>
                                        <button onClick={() => setCancelPmtId(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ) })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Waivers */}
              {pbSection === 'waivers' && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {pbData.waivers.length === 0 ? (
                    <p className="text-sm text-gray-400 p-8 text-center">No waivers granted to this student.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {pbData.waivers.map(w => (
                        <div key={w.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{w.fee_head_name} · {w.period_label}</p>
                              <p className="text-xs text-gray-400">{w.reason}{w.granted_by_name ? ` · by ${w.granted_by_name}` : ''} · {fmtDate(w.created_at)}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-bold text-purple-700">−{fmt(w.waiver_amount)}</p>
                                <p className="text-[10px] text-purple-400 capitalize">{w.waiver_type.replace('_', ' ')}</p>
                              </div>
                              {cancelWaiverId === w.id
                                ? <button onClick={() => { setCancelWaiverId(null); setCancelWaiverMsg('') }} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                                : <button onClick={() => { setCancelWaiverId(w.id); setCancelWaiverMode('revoke'); setCancelWaiverReason(''); setCorrectWaiverAmount(String(w.waiver_amount)); setCancelWaiverMsg('') }}
                                    className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Revoke / Correct</button>
                              }
                            </div>
                          </div>
                          {cancelWaiverId === w.id && (
                            <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50 -mx-4 -mb-3 px-4 pb-3 rounded-b-xl space-y-2">
                              <div className="flex gap-2">
                                <button onClick={() => setCancelWaiverMode('revoke')}
                                  className={`flex-1 text-xs py-1.5 rounded-lg border font-medium ${cancelWaiverMode === 'revoke' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}>Revoke Waiver</button>
                                <button onClick={() => setCancelWaiverMode('correct')}
                                  className={`flex-1 text-xs py-1.5 rounded-lg border font-medium ${cancelWaiverMode === 'correct' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>Correct Amount</button>
                              </div>
                              <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                {cancelWaiverMode === 'revoke'
                                  ? <>Revokes waiver of <strong>{fmt(w.waiver_amount)}</strong>. Balance will increase accordingly.</>
                                  : <>Revokes current waiver and records a new one with the corrected amount.</>}
                              </div>
                              {cancelWaiverMode === 'correct' && (
                                <input type="number" min="0" value={correctWaiverAmount} onChange={e => setCorrectWaiverAmount(e.target.value)}
                                  placeholder="Corrected waiver amount (₹)"
                                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                              )}
                              <input type="text" value={cancelWaiverReason} onChange={e => setCancelWaiverReason(e.target.value)}
                                placeholder="Reason (required)" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                              {cancelWaiverMsg && <p className={`text-xs font-medium ${cancelWaiverMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cancelWaiverMsg}</p>}
                              <div className="flex gap-2">
                                <button onClick={submitRevokeCorrectWaiver} disabled={cancelWaiverBusy || !cancelWaiverReason.trim()}
                                  className={`text-sm text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${cancelWaiverMode === 'revoke' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                  {cancelWaiverBusy ? 'Working…' : cancelWaiverMode === 'revoke' ? 'Confirm Revoke' : 'Confirm Correction'}
                                </button>
                                <button onClick={() => { setCancelWaiverId(null); setCancelWaiverMsg('') }} className="text-sm text-gray-500 px-3 py-1.5">Close</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Timeline (bank passbook) */}
              {pbSection === 'timeline' && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-700">Complete Financial Timeline</p>
                    <p className="text-xs text-gray-400">Every charge, payment, waiver and revision — chronological with running balance.</p>
                  </div>
                  {pbData.timeline.length === 0 ? (
                    <p className="text-sm text-gray-400 p-8 text-center">No activity yet.</p>
                  ) : (
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
                        {pbData.timeline.map((t, i) => {
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
                  )}
                </div>
              )}
            </>
          ) : null}
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
            <button onClick={loadReports} className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">Refresh</button>
          </div>

          {/* ── Fee Audit Report Export ── */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Fee Audit Report — Export</h3>
              <p className="text-xs text-gray-400 mt-0.5">Summary · By Fee Type · Change Log · Class-wise · Student-wise. Reconciled (Billed → Waived → Net → Paid → Balance).</p>
            </div>

            {/* Scope */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-gray-600">Scope:</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                <button onClick={() => setArScope('school')} className={`px-3 py-1.5 ${arScope === 'school' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Whole School</button>
                <button onClick={() => setArScope('class')} className={`px-3 py-1.5 border-l border-gray-200 ${arScope === 'class' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>One Class</button>
              </div>
              {arScope === 'class' && (
                <>
                  <select value={arGrade} onChange={e => setArGrade(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                    <option value="">Grade…</option>
                    {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                  <select value={arSection} onChange={e => setArSection(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                    <option value="all">All sections</option>
                    {['A','B','C','D','E','F'].map(s => <option key={s} value={s}>Sec {s}</option>)}
                  </select>
                </>
              )}
            </div>

            {arMsg && <p className="text-xs text-red-600">{arMsg}</p>}

            {/* Format buttons */}
            <div className="flex items-center gap-2">
              <button onClick={() => downloadAuditExcel()} disabled={arScope === 'class' && !arGrade}
                className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-40">⬇ Excel (.xlsx)</button>
              <button onClick={() => printAuditPdf()} disabled={arBusy || (arScope === 'class' && !arGrade)}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-40">{arBusy ? 'Building…' : '🖨 PDF (Print)'}</button>
              <span className="text-xs text-gray-400 ml-2">Old CSVs:</span>
              <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download className="text-xs text-gray-500 underline">Ledger</a>
              <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=payments`} download className="text-xs text-gray-500 underline">Payments</a>
            </div>

            {/* Individual student export */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">Individual Student Fee Report</p>
              <div className="relative max-w-md">
                <input type="text" placeholder="Search student by name or roll number…" value={arStudentSearch}
                  onChange={e => searchAuditStudent(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {arStudentResults.length > 0 && (
                  <div className="absolute z-20 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {arStudentResults.map(s => (
                      <div key={s.id} className="px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-800">{s.name} <span className="text-xs text-gray-400">Gr.{s.grade}{s.section} · #{s.roll_number}</span></span>
                        <span className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => { downloadAuditExcel({ student_id: String(s.id) }); setArStudentResults([]); setArStudentSearch('') }}
                            className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700">Excel</button>
                          <button onClick={() => { printAuditPdf({ student_id: String(s.id) }); setArStudentResults([]); setArStudentSearch('') }}
                            className="text-xs bg-red-600 text-white px-2 py-0.5 rounded hover:bg-red-700">PDF</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                {/* Class-wise collection */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Class-wise Collection</h3>
                  <div className="space-y-3">
                    {reportData.byGrade.map(g => {
                      const pct = g.total_due > 0 ? Math.round((Number(g.total_collected) / Number(g.total_due)) * 100) : 0
                      const cls = g.section ? `${g.grade}-${g.section}` : `Grade ${g.grade}`
                      return (
                        <div key={cls}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">{cls} <span className="text-gray-400">({g.students} students)</span></span>
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

              {/* ── Audit Log ── */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Audit Log — Every Financial Action</p>
                    <p className="text-xs text-gray-400">Permanent record of all payments, waivers, edits and config changes. Cannot be deleted.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/api/fees/audit-log?school_id=${schoolId}&academic_year=${academicYear}&format=csv&generated_by=${encodeURIComponent(adminName || 'Admin')}&limit=5000`} download
                      className="text-sm border border-gray-800 text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100">⬇ Export Audit (CSV)</a>
                    {!showAuditLog ? (
                      <button onClick={loadAuditLog}
                        className="text-sm bg-gray-800 text-white px-4 py-1.5 rounded-lg hover:bg-gray-900">View Audit Log</button>
                    ) : (
                      <button onClick={() => setShowAuditLog(false)}
                        className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">Hide</button>
                    )}
                  </div>
                </div>
                {showAuditLog && (
                  auditLoading ? (
                    <p className="text-sm text-gray-400 p-8 text-center">Loading audit log…</p>
                  ) : auditLog.length === 0 ? (
                    <p className="text-sm text-gray-400 p-8 text-center">No financial actions recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto max-h-[480px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-xs text-gray-500 border-b border-gray-100">
                            <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Date / Time</th>
                            <th className="text-left px-4 py-2 font-semibold">Who</th>
                            <th className="text-left px-4 py-2 font-semibold">Action</th>
                            <th className="text-left px-4 py-2 font-semibold">Detail</th>
                            <th className="text-right px-4 py-2 font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLog.map((a, i) => {
                            const actionColor =
                              a.action.includes('rejected') || a.action.includes('revoked') ? 'text-red-600' :
                              a.action.includes('Payment recorded') ? 'text-green-600' :
                              a.action.includes('Waiver granted') ? 'text-purple-600' :
                              a.action.includes('edited') || a.action.includes('changed') ? 'text-amber-600' :
                              'text-gray-600'
                            return (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                                  {new Date(a.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="px-4 py-2 text-gray-700">{a.who}</td>
                                <td className={`px-4 py-2 font-medium ${actionColor}`}>{a.action}</td>
                                <td className="px-4 py-2 text-gray-500 text-xs">{a.detail}</td>
                                <td className="px-4 py-2 text-right text-gray-700">{a.amount != null ? fmt(a.amount) : '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
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
            <h2 className="text-base font-semibold text-gray-800">Year-End Closure — {academicYear}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Review the year, then roll over to the next — all dues carry forward automatically, students are promoted.</p>
          </div>

          {yearEndLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">Loading…</div>
          ) : !yearEnd ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <button onClick={loadYearEnd} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Load Year-End Review</button>
            </div>
          ) : (
            <>
              {/* Closed banner */}
              {yearEnd.is_closed && (
                <div className="bg-gray-800 text-white rounded-xl px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">🔒 {academicYear} is CLOSED</p>
                      <p className="text-xs text-gray-300 mt-0.5">
                        Closed by {yearEnd.close_record?.closed_by} on {yearEnd.close_record ? fmtDate(yearEnd.close_record.closed_at) : ''}
                        {' '}· Ledger and payments are locked.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={reopenYear} disabled={yeClosing}
                        className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg hover:bg-gray-500 disabled:opacity-50">
                        {yeClosing ? 'Working…' : 'Reopen'}
                      </button>
                      <button onClick={() => alert('Go to Year Rollover in the sidebar to start the new academic year.')}
                        className="text-xs bg-green-500 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-green-400">
                        Go to Year Rollover →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 1 — Review summary */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Step 1 · Review</p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { l: 'Total Billed', v: yearEnd.summary.total_billed,    c: 'text-gray-900' },
                    { l: 'Collected',    v: yearEnd.summary.total_collected, c: 'text-green-700' },
                    { l: 'Waived',       v: yearEnd.summary.total_waived,    c: 'text-purple-700' },
                    { l: 'Still Unpaid', v: yearEnd.summary.total_unpaid,    c: 'text-red-600' },
                  ].map(s => (
                    <div key={s.l} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                      <p className="text-xs text-gray-400">{s.l}</p>
                      <p className={`text-lg font-bold mt-0.5 ${s.c}`}>{fmt(s.v)}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  {yearEnd.students.length} students have unpaid dues ({yearEnd.unpaid_count} bills). Decide what to do with each below.
                </p>
              </div>

              {yearEnd.students.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-green-200 p-10 text-center">
                  <p className="text-green-700 font-medium">All dues settled — nothing to resolve!</p>
                  <p className="text-gray-400 text-sm mt-1">You can close the year directly in Step 3 below.</p>
                </div>
              ) : (
                <>
                  {/* STEP 2 — Decide per student */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Step 2 · Decide each student</p>
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                        {([
                          { key: 'all', label: `All (${yearEnd.students.length})` },
                          { key: 'continuing', label: `Continuing (${yearEnd.students.filter(s => !s.is_leaver).length})` },
                          { key: 'leavers', label: `Leaving (${yearEnd.students.filter(s => s.is_leaver).length})` },
                        ] as const).map(f => (
                          <button key={f.key} onClick={() => setYeFilter(f.key)}
                            className={`px-3 py-1 text-xs font-medium rounded-md ${yeFilter === f.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bulk helpers */}
                    {!yearEnd.is_closed && (
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">Bulk set visible:</span>
                        <button onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { if (!s.is_leaver) next[s.student_id] = 'carry' }); setYeDecisions(next) }}
                          className="text-xs border border-blue-200 text-blue-600 px-2.5 py-1 rounded-lg hover:bg-blue-50">All → Carry Forward</button>
                        <button onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { next[s.student_id] = 'writeoff' }); setYeDecisions(next) }}
                          className="text-xs border border-red-200 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50">All → Write Off</button>
                        <button onClick={() => { const next = { ...yeDecisions }; visibleYeStudents.forEach(s => { next[s.student_id] = 'open' }); setYeDecisions(next) }}
                          className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-100">All → Leave Open</button>
                      </div>
                    )}

                    <div className="divide-y divide-gray-50 max-h-[460px] overflow-y-auto">
                      {visibleYeStudents.map(s => {
                        const decision = yeDecisions[s.student_id] || 'open'
                        return (
                          <div key={s.student_id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-800">{s.student_name}</p>
                                  <span className="text-xs text-gray-400">Gr.{s.grade}{s.section} · #{s.roll_number}</span>
                                  {s.is_leaver && (
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">⚠ {s.leaver_reason}</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">{s.bills.length} unpaid bill{s.bills.length > 1 ? 's' : ''}</p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-sm font-bold text-red-600">{fmt(s.total_unpaid)}</span>
                                {!yearEnd.is_closed && (
                                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                                    <button
                                      onClick={() => !s.is_leaver && setYeDecisions(p => ({ ...p, [s.student_id]: 'carry' }))}
                                      disabled={s.is_leaver}
                                      title={s.is_leaver ? 'Leavers cannot carry forward' : ''}
                                      className={`px-2.5 py-1 transition-colors ${decision === 'carry' ? 'bg-blue-600 text-white' : s.is_leaver ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                      Carry
                                    </button>
                                    <button
                                      onClick={() => setYeDecisions(p => ({ ...p, [s.student_id]: 'writeoff' }))}
                                      className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${decision === 'writeoff' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                      Write Off
                                    </button>
                                    <button
                                      onClick={() => setYeDecisions(p => ({ ...p, [s.student_id]: 'open' }))}
                                      className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${decision === 'open' ? 'bg-gray-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                      Leave Open
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* write-off reason inline */}
                            {!yearEnd.is_closed && decision === 'writeoff' && (
                              <input type="text" placeholder="Reason for write-off (recommended)…"
                                value={yeReasons[s.student_id] || ''}
                                onChange={e => setYeReasons(p => ({ ...p, [s.student_id]: e.target.value }))}
                                className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-red-300" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* STEP 3 — Carry target + apply */}
                  {!yearEnd.is_closed && (
                    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Step 3 · Carry-forward target</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-gray-600">Carry unpaid dues forward to:</span>
                        <span className="text-sm font-bold text-gray-800">{yearEnd.target_year}</span>
                        {yearEnd.target_year_exists ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Year exists</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⚠ Not created yet — create it in Academic Calendar before carrying forward</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        Carried dues become a single <strong>“Previous Year Dues ({academicYear})”</strong> bill on each student, due {startYearLabel(yearEnd.target_year)}-04-30. Works regardless of the student&apos;s new class.
                      </p>
                      {yeMsg && <p className={`text-sm font-medium ${yeMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{yeMsg}</p>}
                      {(() => {
                        const carryN = Object.values(yeDecisions).filter(d => d === 'carry').length
                        const woN = Object.values(yeDecisions).filter(d => d === 'writeoff').length
                        const total = carryN + woN
                        return (
                          <button onClick={applyYearEndDecisions} disabled={yeProcessing || total === 0}
                            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                            {yeProcessing ? 'Applying…' : `Apply Decisions (${carryN} carry, ${woN} write off)`}
                          </button>
                        )
                      })()}
                    </div>
                  )}
                </>
              )}

              {/* STEP 4 & 5 — Statement + Close */}
              {!yearEnd.is_closed && (
                <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Step 4 · Statement &amp; Close</p>
                  <p className="text-xs text-gray-500">
                    Print the year-end financial statement for your records, then close the year. Closing locks {academicYear} —
                    no further payments or edits until reopened. Any students still “Leave Open” keep their dues unresolved.
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={printYearEndStatement}
                      className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">🖨 Print Statement</button>
                    <a href={`/api/fees/export?school_id=${schoolId}&academic_year=${academicYear}&type=ledger`} download
                      className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">Export Ledger CSV</a>
                    <button onClick={() => { if (window.confirm(`Close ${academicYear}? This locks the year. You can reopen later if needed.`)) closeYear() }}
                      disabled={yeClosing}
                      className="ml-auto text-sm bg-gray-800 text-white px-5 py-2 rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50">
                      {yeClosing ? 'Closing…' : `🔒 Close Financial Year ${academicYear}`}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}



      {/* ══ Passbook Modal ══════════════════════════════════════════════════════ */}
      {showPassbookModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => { setShowPassbookModal(false); setPbData(null); setCancelPmtId(null) }}>
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                {pbData ? (
                  <>
                    <p className="text-base font-bold text-gray-900">{pbData.student.name}</p>
                    <p className="text-xs text-gray-400">
                      Gr.{pbData.student.grade}{pbData.student.section}
                      {pbData.student.roll_number ? ` · Roll #${pbData.student.roll_number}` : ''}
                      {pbData.student.parent_name ? ` · Parent: ${pbData.student.parent_name}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-base font-bold text-gray-900">Payment History</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {pbData && (
                  <button onClick={printPassbookStatement}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    🖨 Statement
                  </button>
                )}
                <button onClick={() => { setShowPassbookModal(false); setPbData(null); setCancelPmtId(null) }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
            </div>

            {/* Summary bar */}
            {pbData && (
              <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                {[
                  { l: 'Total Billed', v: pbData.summary.total_billed, c: 'text-gray-800' },
                  { l: 'Paid',         v: pbData.summary.total_paid,    c: 'text-green-700' },
                  { l: 'Waived',       v: pbData.summary.total_waived,  c: 'text-purple-700' },
                  { l: 'Outstanding',  v: pbData.summary.outstanding,   c: 'text-red-600' },
                ].map(s => (
                  <div key={s.l} className="text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.l}</p>
                    <p className={`text-base font-bold mt-0.5 ${s.c}`}>{fmt(s.v)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Section tabs */}
            {pbData && (
              <div className="flex gap-1 px-5 py-2 border-b border-gray-100 bg-white flex-shrink-0">
                {([
                  { key: 'bills',    label: `Bills (${pbData.ledger.length})` },
                  { key: 'payments', label: `Payments (${pbData.payments.length})` },
                  { key: 'waivers',  label: `Waivers (${pbData.waivers.length})` },
                  { key: 'timeline', label: 'Timeline' },
                ] as const).map(v => (
                  <button key={v.key} onClick={() => setPbSection(v.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      pbSection === v.key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                    }`}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {pbLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-400">Loading payment history…</p>
                </div>
              ) : pbErr ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{pbErr}</div>
              ) : pbData ? (
                <>
                  {/* Bills */}
                  {pbSection === 'bills' && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      {pbData.ledger.length === 0
                        ? <p className="text-sm text-gray-400 p-8 text-center">No bills recorded.</p>
                        : (
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr>
                                <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Fee</th>
                                <th className="text-right px-4 py-2 font-semibold text-gray-500 text-xs">Billed</th>
                                <th className="text-right px-4 py-2 font-semibold text-gray-500 text-xs">Paid</th>
                                <th className="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {pbData.ledger.map(e => (
                                <tr key={e.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 text-gray-700">{e.category_name} · <span className="text-gray-400">{e.period_label}</span></td>
                                  <td className="px-4 py-2.5 text-right text-gray-700">{fmt(e.amount_due)}</td>
                                  <td className="px-4 py-2.5 text-right text-green-600">{fmt(e.amount_paid)}</td>
                                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${STATUS_COLORS[e.status as keyof typeof STATUS_COLORS] || ''}`}>{e.status}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </div>
                  )}

                  {/* Payments */}
                  {pbSection === 'payments' && (
                    <div className="space-y-3">
                      {pbData.payments.length === 0
                        ? <p className="text-sm text-gray-400 text-center py-8">No payments recorded.</p>
                        : pbData.payments.map(p => {
                          const isCancelled = p.payment_status === 'cancelled'
                          return (
                            <Fragment key={p.id}>
                              <div className={`rounded-xl border px-4 py-3 ${isCancelled ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100'}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-xs font-semibold text-indigo-600">{p.receipt_number}</span>
                                      {isCancelled && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Cancelled</span>}
                                    </div>
                                    <p className={`text-lg font-bold mt-0.5 ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{fmt(p.amount)}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {fmtDate(p.paid_date)} · <span className="capitalize">{p.payment_mode}</span>
                                      {p.collected_by_name ? ` · ${p.collected_by_name}` : ''}
                                      {p.transaction_ref ? ` · Ref: ${p.transaction_ref}` : ''}
                                    </p>
                                    {p.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{p.notes}</p>}
                                  </div>
                                  {!isCancelled && p.payment_status === 'completed' && (
                                    <div className="flex gap-2 flex-shrink-0">
                                      <button onClick={() => printPassbookReceipt(p)}
                                        className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-50">🖨</button>
                                      {cancelPmtId === p.id
                                        ? <button onClick={() => setCancelPmtId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2">Close</button>
                                        : <button onClick={() => openCancel(p.id)}
                                            className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Cancel / Correct</button>
                                      }
                                    </div>
                                  )}
                                </div>

                                {/* Inline cancel/correct form */}
                                {cancelPmtId === p.id && (
                                  <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50 -mx-4 -mb-3 px-4 pb-3 rounded-b-xl space-y-2">
                                    <div className="flex gap-2">
                                      <button onClick={() => setCancelMode('cancel')}
                                        className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors font-medium ${cancelMode === 'cancel' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}>Cancel Payment</button>
                                      <button onClick={() => setCancelMode('correct')}
                                        className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors font-medium ${cancelMode === 'correct' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>Correct Amount</button>
                                    </div>
                                    <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                      {cancelMode === 'cancel'
                                        ? <>⚠ Reverses <strong>{fmt(p.amount)}</strong> from the ledger. Receipt stays on record marked cancelled.</>
                                        : <>⚠ Cancels {p.receipt_number} and records a new payment with the corrected amount.</>}
                                    </div>
                                    {cancelMode === 'correct' && (
                                      <input type="number" min="0" value={correctAmount} onChange={e => setCorrectAmount(e.target.value)}
                                        placeholder="Corrected amount (₹)"
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                    )}
                                    <input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                                      placeholder="Reason (required)" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                    {cancelMsg && <p className={`text-xs font-medium ${cancelMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cancelMsg}</p>}
                                    <div className="flex gap-2">
                                      <button onClick={() => submitCancelCorrect('passbook')} disabled={cancelBusy || !cancelReason.trim()}
                                        className={`text-sm text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${cancelMode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                        {cancelBusy ? 'Working…' : cancelMode === 'cancel' ? `Confirm Cancel` : 'Confirm Correction'}
                                      </button>
                                      <button onClick={() => setCancelPmtId(null)} className="text-sm text-gray-500 px-3 py-1.5">Close</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </Fragment>
                          )
                        })
                      }
                    </div>
                  )}

                  {/* Waivers */}
                  {pbSection === 'waivers' && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      {pbData.waivers.length === 0
                        ? <p className="text-sm text-gray-400 p-8 text-center">No waivers granted.</p>
                        : <div className="divide-y divide-gray-50">
                            {pbData.waivers.map(w => (
                              <div key={w.id} className="px-4 py-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{(w as { fee_head_name?: string }).fee_head_name || 'Fee'} · {(w as { period_label?: string }).period_label || ''}</p>
                                    <p className="text-xs text-gray-400">{(w as { reason?: string }).reason || '—'} · {(w as { granted_by_name?: string }).granted_by_name || ''}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <p className="text-sm font-bold text-purple-700">{fmt((w as { waiver_amount?: number }).waiver_amount || 0)}</p>
                                    {cancelWaiverId === w.id
                                      ? <button onClick={() => { setCancelWaiverId(null); setCancelWaiverMsg('') }} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                                      : <button onClick={() => { setCancelWaiverId(w.id); setCancelWaiverMode('revoke'); setCancelWaiverReason(''); setCorrectWaiverAmount(String((w as { waiver_amount?: number }).waiver_amount || 0)); setCancelWaiverMsg('') }}
                                          className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Revoke / Correct</button>
                                    }
                                  </div>
                                </div>
                                {cancelWaiverId === w.id && (
                                  <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50 -mx-4 -mb-3 px-4 pb-3 rounded-b-xl space-y-2">
                                    <div className="flex gap-2">
                                      <button onClick={() => setCancelWaiverMode('revoke')}
                                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium ${cancelWaiverMode === 'revoke' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}>Revoke Waiver</button>
                                      <button onClick={() => setCancelWaiverMode('correct')}
                                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium ${cancelWaiverMode === 'correct' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>Correct Amount</button>
                                    </div>
                                    <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                                      {cancelWaiverMode === 'revoke'
                                        ? <>Revokes waiver of <strong>{fmt((w as { waiver_amount?: number }).waiver_amount || 0)}</strong>. Balance will increase accordingly.</>
                                        : <>Revokes current waiver and records a new one with the corrected amount.</>}
                                    </div>
                                    {cancelWaiverMode === 'correct' && (
                                      <input type="number" min="0" value={correctWaiverAmount} onChange={e => setCorrectWaiverAmount(e.target.value)}
                                        placeholder="Corrected waiver amount (₹)"
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                    )}
                                    <input type="text" value={cancelWaiverReason} onChange={e => setCancelWaiverReason(e.target.value)}
                                      placeholder="Reason (required)" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                    {cancelWaiverMsg && <p className={`text-xs font-medium ${cancelWaiverMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cancelWaiverMsg}</p>}
                                    <div className="flex gap-2">
                                      <button onClick={submitRevokeCorrectWaiver} disabled={cancelWaiverBusy || !cancelWaiverReason.trim()}
                                        className={`text-sm text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 ${cancelWaiverMode === 'revoke' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                        {cancelWaiverBusy ? 'Working…' : cancelWaiverMode === 'revoke' ? 'Confirm Revoke' : 'Confirm Correction'}
                                      </button>
                                      <button onClick={() => { setCancelWaiverId(null); setCancelWaiverMsg('') }} className="text-sm text-gray-500 px-3 py-1.5">Close</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                      }
                    </div>
                  )}

                  {/* Timeline */}
                  {pbSection === 'timeline' && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      {pbData.timeline.length === 0
                        ? <p className="text-sm text-gray-400 p-8 text-center">No activity recorded.</p>
                        : <div className="divide-y divide-gray-50">
                            {pbData.timeline.map((t, i) => (
                              <div key={i} className="px-4 py-3 flex items-start gap-3">
                                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${(t as { type?: string }).type === 'payment' ? 'bg-green-500' : (t as { type?: string }).type === 'waiver' ? 'bg-purple-500' : 'bg-gray-300'}`} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-gray-700">{(t as { description?: string }).description || '—'}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{new Date((t as { date?: string }).date || '').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  {((t as { credit?: number }).credit ?? 0) > 0 && <p className="text-sm font-semibold text-green-600">{fmt((t as { credit?: number }).credit ?? 0)}</p>}
                                  {((t as { debit?: number }).debit ?? 0) > 0 && <p className="text-sm font-semibold text-red-600">{fmt((t as { debit?: number }).debit ?? 0)}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                      }
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
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

              {payError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{payError}</p>}
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowPayConfirm(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                ← Edit
              </button>
              <button
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
