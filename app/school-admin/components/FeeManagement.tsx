'use client'

import { useEffect, useState, useCallback, Fragment, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useFeature } from '@/lib/features-context'
import { GRADE_SEQUENCE } from '@/lib/grades'
import type {
  FeeCategory, ApplStudent, ApplCategory, FeeStructure, StructureLock, Amendment,
  LedgerEntry, FeeStats, PaymentRecord, StudentRow, PassbookData,
  ReceiptHeaderBlock,
} from './fee-management/types'
import { escapeHtml, printDualCopyReceipt, writeAndPrint, renderHeaderBlocks } from './fee-management/receipts'
import FeeArchiveTab from './fee-management/FeeArchiveTab'
import FeeLeaversTab, { type RemovedStudent } from './fee-management/FeeLeaversTab'
import FeeReportsTab from './fee-management/FeeReportsTab'
import FeeYearEndTab from './fee-management/FeeYearEndTab'
import FeeCollectTab from './fee-management/FeeCollectTab'
import FeePassbookTab from './fee-management/FeePassbookTab'
import { useFeeStore } from '@/lib/stores/feeStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADES = GRADE_SEQUENCE
function gradeLabel(g: string): string { return /^\d+$/.test(g) ? `Grade ${g}` : g }

const GRADE_GROUPS = [
  { key: 'pre_primary', label: 'Pre-Primary', sub: 'Nursery–UKG', grades: ['Nursery','LKG','UKG'] },
  { key: 'primary',   label: 'Primary',   sub: 'Grade 1–5',   grades: ['1','2','3','4','5'] },
  { key: 'middle',    label: 'Middle',    sub: 'Grade 6–8',   grades: ['6','7','8'] },
  { key: 'secondary', label: 'Secondary', sub: 'Grade 9–10',  grades: ['9','10'] },
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
  paid:     'bg-green-100 text-green-700',
  partial:  'bg-yellow-100 text-yellow-700',
  pending:  'bg-gray-100 text-gray-600',
  overdue:  'bg-red-100 text-red-700',
  waived:   'bg-purple-100 text-purple-700',
  settled:  'bg-teal-100 text-teal-700',
  passout:  'bg-indigo-100 text-indigo-700',
}

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function pct(num: number, den: number) {
  if (!den || den < 0) return 0
  return Math.min(100, Math.round((num / den) * 100))
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

// ─── Component ────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic'

export default function FeeManagement({
  schoolId, adminName, schoolName, schoolLogoUrl, schoolLogoAlign, schoolHeaderBlocks,
}: {
  schoolId: number
  adminName?: string
  // Passed down from the school-admin page's already-loaded `selectedSchool` (fetched
  // before this component ever mounts) rather than fetched again here — avoids a race
  // where a print button could be clicked before a fresh in-component fetch resolved,
  // which showed a blank/placeholder school name on printed receipts.
  schoolName?: string
  schoolLogoUrl?: string | null
  schoolLogoAlign?: 'left' | 'center' | 'right' | null
  schoolHeaderBlocks?: ReceiptHeaderBlock[]
}) {
  type Tab = 'overview' | 'setup' | 'applicability' | 'ledger' | 'collect' | 'students' | 'reports' | 'yearend' | 'leavers' | 'archive'
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const hasOnlinePayments = useFeature('online-payments')

  // Receipt branding — set once in School Profile, read here for every print function.
  // Seeded from props (the school-admin page's `selectedSchool`, already loaded before
  // this component ever mounts) so there's never an empty-window race where a print
  // button could be clicked before branding data exists. The fetch below just refreshes
  // it in case School Profile was edited earlier in the same session without a reload.
  const [branding, setBranding] = useState<{ school_name: string; logo_url: string | null; logo_align: 'left' | 'center' | 'right'; receipt_header_blocks: ReceiptHeaderBlock[] }>({
    school_name: schoolName ?? '', logo_url: schoolLogoUrl ?? null, logo_align: schoolLogoAlign ?? 'center', receipt_header_blocks: schoolHeaderBlocks ?? [],
  })
  useEffect(() => {
    fetch(`/api/schools/${schoolId}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setBranding({ school_name: d.name ?? '', logo_url: d.logo_url ?? null, logo_align: d.logo_align ?? 'center', receipt_header_blocks: d.receipt_header_blocks ?? [] })
    }).catch(() => {})
  }, [schoolId])

  // Shared
  const [academicYear, setAcademicYear]   = useState('')
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [closedYears, setClosedYears]     = useState<Set<string>>(new Set())


  // Section-level load errors — keyed by section name, cleared on successful load.
  // Shown as a banner inside each section so failures are never silent.
  const [loadErrors, setLoadErrors]   = useState<Record<string, string>>({})
  const setLoadError   = (key: string, msg: string) => setLoadErrors(prev => ({ ...prev, [key]: msg }))
  const clearLoadError = (key: string)               => setLoadErrors(prev => { const n = { ...prev }; delete n[key]; return n })

  // Overview
  const [stats, setStats]             = useState<FeeStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  type RecentPayment = {
    id: number; student_name: string; grade: string; section: string
    roll_number: string; category_name: string; period_label: string
    amount: number; payment_mode: string; receipt_number: string; paid_date: string
  }
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([])

  type GradeStat = { grade: string; section?: string; students: number; total_due: number; total_collected: number; total_waived?: number; outstanding: number; fully_paid_students?: number; defaulter_students?: number }
  const [gradeStats, setGradeStats] = useState<GradeStat[]>([])

  // Setup
  const [setupLoading, setSetupLoading] = useState(false)
  const [categories, setCategories]     = useState<FeeCategory[]>([])
  const [structures, setStructures]     = useState<FeeStructure[]>([])
  const [structureLock, setStructureLock] = useState<StructureLock>(null)
  const [amendments, setAmendments]     = useState<Amendment[]>([])
  // Grades with at least one active student — "all grades must have an amount" only
  // applies to grades the school actually enrolls, not every grade in the master list
  // (e.g. a school with no Nursery/LKG/UKG section shouldn't be blocked on those).
  const [enrolledGrades, setEnrolledGrades] = useState<string[] | null>(null)
  const [editAmounts, setEditAmounts]   = useState<Record<string, string>>({})
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategory, setNewCategory]   = useState({ name: '', frequency: 'monthly', description: '', category_type: 'fixed' })
  const [savingStructure, setSavingStructure] = useState(false)
  const [generatingLedger, setGeneratingLedger] = useState(false)
  const [lockingStructure, setLockingStructure] = useState(false)
  const [structureMsg, setStructureMsg] = useState('')
  const [deletingCatId, setDeletingCatId] = useState<number | null>(null)
  const [showAmendForm, setShowAmendForm] = useState<{ cat_id: number; grade: string; cat_name: string; current: number } | null>(null)
  const [amendForm, setAmendForm]       = useState({ new_amount: '', reason: '' })
  const [amendMsg, setAmendMsg]         = useState('')
  const [amendSaving, setAmendSaving]   = useState(false)
  const [showAmendLog, setShowAmendLog] = useState(false)

  // ── Fee Plan (new Tab 2) ──
  // Sub-view: 'heads' = fee head cards (existing); 'variable' = combined all-variable-fees grid
  const [planView, setPlanView] = useState<'heads' | 'variable'>('heads')
  // School UPI ID (for online fee payments) — managed here in Fee Setup.
  // Once saved it's locked: changing it needs the logged-in admin's own
  // password (POST /api/fees/upi-id/verify) to mint a short-lived unlock
  // token before PUT /api/fees/upi-id will accept a new value — see the
  // route comments for why. It re-locks immediately after every save.
  const [upiId, setUpiId]           = useState('')
  const [upiSaving, setUpiSaving]   = useState(false)
  const [upiMsg, setUpiMsg]         = useState('')
  const [upiLoaded, setUpiLoaded]   = useState(false)
  const [upiLocked, setUpiLocked]   = useState(false)
  const [upiUnlockToken, setUpiUnlockToken] = useState('')
  const [upiShowUnlock, setUpiShowUnlock]   = useState(false)
  const [upiUnlockPassword, setUpiUnlockPassword] = useState('')
  const [upiUnlockError, setUpiUnlockError] = useState('')
  const [upiUnlocking, setUpiUnlocking]     = useState(false)
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

  // Generate bills confirmation dialog
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)

  // Toggle category type (fixed ↔ variable) confirmation dialog
  const [toggleTypeConfirm, setToggleTypeConfirm] = useState<{ cat: FeeCategory; newType: 'fixed' | 'variable' } | null>(null)

  // Opens the shared Passbook Modal — also used by Collect via onOpenPassbook
  const [showPassbookModal, setShowPassbookModal] = useState(false)

  // ── Student Passbook (Tab 4) — shared with the Passbook Modal, which is why
  // this state stays here rather than moving into FeePassbookTab. Types live in
  // fee-management/types.ts since both the modal and the tab need them. ──
  const [pbErr, setPbErr]                        = useState('')
  const [pbData, setPbData]                     = useState<PassbookData | null>(null)
  const [pbLoading, setPbLoading]               = useState(false)
  const [pbSection, setPbSection]               = useState<'timeline' | 'bills' | 'payments' | 'waivers' | 'receipts'>('bills')
  // Derived passbook data filtered to the selected academic year
  const pbYearGroup = pbData?.ledger_by_year.find(y => y.academic_year === academicYear) ?? null
  const pbSummary   = pbYearGroup
    ? { total_billed: pbYearGroup.total_billed, total_paid: pbYearGroup.total_paid, total_waived: pbYearGroup.total_waived, discretionary_waived: pbYearGroup.discretionary_waived ?? pbYearGroup.total_waived, outstanding: pbYearGroup.outstanding }
    : { total_billed: 0, total_paid: 0, total_waived: 0, discretionary_waived: 0, outstanding: 0 }
  const pbPayments  = pbData?.payments.filter(p => p.bill_year === academicYear) ?? []
  // One receipt_number can span several fee-category rows in pbPayments (one
  // payment covering multiple categories at once) — group them here so the
  // Print Receipts tab lists one entry per actual receipt, not one per line.
  const pbReceipts = (() => {
    const byReceipt = new Map<string, { receipt_number: string; paid_date: string; total: number; cancelled: boolean; lineCount: number }>()
    for (const p of pbPayments) {
      const existing = byReceipt.get(p.receipt_number)
      const isCancelled = p.payment_status === 'cancelled'
      if (existing) {
        existing.total += isCancelled ? 0 : Number(p.amount)
        existing.lineCount += 1
        existing.cancelled = existing.cancelled && isCancelled
      } else {
        byReceipt.set(p.receipt_number, {
          receipt_number: p.receipt_number, paid_date: p.paid_date,
          total: isCancelled ? 0 : Number(p.amount), cancelled: isCancelled, lineCount: 1,
        })
      }
    }
    return Array.from(byReceipt.values()).sort((a, b) => new Date(b.paid_date).getTime() - new Date(a.paid_date).getTime())
  })()
  const pbWaivers   = pbData?.waivers.filter(w => w.bill_year === academicYear) ?? []
  const pbTimeline  = pbData?.timeline.filter(t => t.academic_year === academicYear) ?? []
  const pbYearOnly  = pbYearGroup ? [pbYearGroup] : []
  // Payment cancel / correct
  const [cancelPmtId, setCancelPmtId]           = useState<number | null>(null)
  const [cancelMode, setCancelMode]             = useState<'cancel' | 'correct'>('cancel')
  const [cancelReason, setCancelReason]         = useState('')
  const [correctAmount, setCorrectAmount]       = useState('')
  const [cancelBusy, setCancelBusy]             = useState(false)
  const [cancelMsg, setCancelMsg]               = useState('')
  // ledger balance at the time Cancel/Correct is opened — used to cap corrected amount
  const [cancelPmtMaxCorrect, setCancelPmtMaxCorrect] = useState<number | null>(null)
  // Waiver revoke / correct
  const [cancelWaiverId, setCancelWaiverId]     = useState<number | null>(null)
  const [cancelWaiverMode, setCancelWaiverMode] = useState<'revoke' | 'correct'>('revoke')
  const [cancelWaiverReason, setCancelWaiverReason] = useState('')
  const [correctWaiverAmount, setCorrectWaiverAmount] = useState('')
  const [cancelWaiverBusy, setCancelWaiverBusy] = useState(false)
  const [cancelWaiverMsg, setCancelWaiverMsg]   = useState('')
  // max allowed for corrected waiver = ledger balance + current waiver amount
  const [waiverMaxCorrect, setWaiverMaxCorrect] = useState<number | null>(null)


  // Passout ledger panel state
  type PassoutSummary = {
    passout_students: number
    total_billed: number
    total_collected: number
    total_waived: number
    total_outstanding: number
  }
  type PassoutStudent = {
    student_id: number
    student_name: string
    roll_number: string
    grade: string
    section: string
    passout_year: string
    outstanding: number
    total_collected: number
  }
  type RecentCollection = {
    id: number; student_name: string; amount: number; payment_mode: string
    paid_date: string; receipt_number: string; period_label: string
  }
  const [passoutData, setPassoutData] = useState<{
    summary: PassoutSummary
    students: PassoutStudent[]
    recent_collections: RecentCollection[]
  } | null>(null)
  const [passoutLoading, setPassoutLoading] = useState(false)

  // ── Leavers & Dues: students removed from the school (status != 'active', not
  // in the passout ledger) who still carry an unresolved balance from a prior year ──
  // Leavers tab is extracted (fee-management/FeeLeaversTab.tsx); this function
  // stays here because it primes several pieces of Collect-tab state that this
  // component owns — the tab itself just calls it via a prop.
  async function collectRemovedStudent(s: RemovedStudent) {
    try {
      const allEntries: LedgerEntry[] = []
      for (const yr of s.academic_years) {
        const res = await fetch(`/api/fees/ledger?school_id=${schoolId}&student_id=${s.student_id}&academic_year=${encodeURIComponent(yr)}`)
        if (res.ok) allEntries.push(...(await res.json() as LedgerEntry[]))
      }
      const open = allEntries.filter(e => ['pending', 'partial', 'overdue'].includes(e.status))
      if (open.length === 0) throw new Error('No outstanding dues found for this student')
      const row: StudentRow = {
        student_id: s.student_id, student_name: s.student_name, roll_number: s.roll_number,
        school_roll_number: null, grade: s.grade ?? '—', section: s.section ?? '',
        email: null, phone: null, parent_name: null, parent_phone: null, parent_email: null,
        student_status: s.student_status,
        total_billed: open.reduce((a, e) => a + Number(e.amount_due), 0),
        total_paid: 0,
        outstanding: s.outstanding,
        open_entries: open, all_entries: allEntries,
        has_overdue: open.some(e => e.status === 'overdue'), never_paid: false,
      }
      setActiveTab('collect' as Tab)
      // Collect owns its own collect-form state since the extraction — hand the
      // synthesized row off via the shared store instead of poking it directly.
      useFeeStore.getState().requestCollect(row)
    } catch (e) {
      throw e instanceof Error ? e : new Error('Network error — could not load this student\'s dues')
    }
  }

  // ── Extracted tabs (fee-management/*.tsx): lazy-mount-once + hidden, same
  // pattern app/school-admin/page.tsx already uses for whole portal components —
  // keeps each tab's own fetched data alive across switching away and back,
  // instead of refetching from an empty state every time.
  const [archiveVisited, setArchiveVisited] = useState(false)
  useEffect(() => { if (activeTab === 'archive') setArchiveVisited(true) }, [activeTab])
  const [leaversVisited, setLeaversVisited] = useState(false)
  useEffect(() => { if (activeTab === 'leavers') setLeaversVisited(true) }, [activeTab])
  const [reportsVisited, setReportsVisited] = useState(false)
  useEffect(() => { if (activeTab === 'reports') setReportsVisited(true) }, [activeTab])
  const [yearEndVisited, setYearEndVisited] = useState(false)
  useEffect(() => { if (activeTab === 'yearend') setYearEndVisited(true) }, [activeTab])
  const bumpReports = useFeeStore(s => s.bumpReports)
  const bumpLedger = useFeeStore(s => s.bumpLedger)
  // pendingPayments (online payments awaiting verification) is read here too —
  // the nav tab pill and the Overview "Needs Attention" banner both need the
  // count, and Collect is where it's actually fetched.
  const pendingPayments = useFeeStore(s => s.pendingPayments)
  const [collectVisited, setCollectVisited] = useState(false)
  useEffect(() => { if (activeTab === 'collect') setCollectVisited(true) }, [activeTab])
  const [passbookVisited, setPassbookVisited] = useState(false)
  useEffect(() => { if (activeTab === 'students') setPassbookVisited(true) }, [activeTab])

  // Jump from an archived year's card into the existing Reports/Ledger tabs, scoped
  // to that year — reuses those tabs' own data-fetching rather than duplicating a
  // drill-down view here.
  function viewArchiveYear(year: string, dest: 'reports' | 'collect') {
    setAcademicYear(year)
    setActiveTab(dest as Tab)
    if (dest === 'collect') useFeeStore.getState().requestCollectionView('counter')
  }

  // 15-day banner: days until year end (null = not loaded yet, -1 = not applicable)
  const [daysUntilYearEnd, setDaysUntilYearEnd] = useState<number | null>(null)
  const [yearEndDate, setYearEndDate]           = useState<string | null>(null)
  // First-login wizard: true when school has no academic years at all
  const [showYearWizard, setShowYearWizard]     = useState(false)
  const [wizLabel, setWizLabel]                 = useState('')
  const [wizStart, setWizStart]                 = useState('')
  const [wizEnd, setWizEnd]                     = useState('')
  const [wizSaving, setWizSaving]               = useState(false)
  const [wizMsg, setWizMsg]                     = useState('')
  // Fee setup wizard: shown after first academic year is created, tracks setup steps
  const [setupWizardDismissed, setSetupWizardDismissed] = useState(false)

  // Amendment impact preview
  const [amendImpact, setAmendImpact]           = useState<number | null>(null)
  const [amendPartialCount, setAmendPartialCount] = useState<number | null>(null)
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
  // A failed fetch (network error, 500, DB connection-pool exhaustion, etc.)
  // must never be mistaken for "this school genuinely has zero academic
  // years" — that misread is exactly what showed the "Create your Academic
  // Year" first-login wizard to a school that already has real years, purely
  // because one transient request failed. r.ok distinguishes "the request
  // succeeded and truly returned nothing" from "the request itself failed."
  const loadAcademicYears = useCallback(() => {
    Promise.all([
      fetch(`/api/academic-year/current?school_id=${schoolId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/academic-years?school_id=${schoolId}`).then(r => r.ok ? { ok: true, data: r.json() } : { ok: false, data: null }),
      fetch(`/api/fees/year-rollover?school_id=${schoolId}`).then(r => r.ok ? r.json() : []),
    ]).then(async ([current, yearsResult, closed]) => {
      if (!yearsResult.ok) {
        // The years list itself failed to load — show a retry banner, never
        // the "no years exist yet" wizard, and leave whatever state was
        // already on screen alone rather than clearing it out from under the
        // admin.
        setLoadError('academicYears', 'Could not load academic years — try refreshing')
        return
      }
      clearLoadError('academicYears')

      const all = await yearsResult.data
      const allYears: { label: string; end_date: string }[] = Array.isArray(all) ? all : []
      const labels: string[] = allYears.map((y) => y.label)
      const cur: string = current?.label ?? labels[0] ?? ''
      setAcademicYears(labels)
      setAcademicYear(cur)
      const closedSet = new Set<string>(Array.isArray(closed) ? closed.map((c: { academic_year: string }) => c.academic_year) : [])
      setClosedYears(closedSet)

      // Show first-login wizard only now that we know the request genuinely
      // succeeded and the school genuinely has zero academic years.
      if (labels.length === 0) {
        setShowYearWizard(true)
        return
      }

      // Compute days until current year's end_date for 15-day banner
      const curYear = allYears.find(y => y.label === cur)
      if (curYear?.end_date && !closedSet.has(cur)) {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const end = new Date(curYear.end_date); end.setHours(0, 0, 0, 0)
        const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000)
        setDaysUntilYearEnd(diff)
        setYearEndDate(curYear.end_date)
      } else {
        setDaysUntilYearEnd(null)
      }
    }).catch(() => {
      setLoadError('academicYears', 'Network error — could not load academic years')
    })
  }, [schoolId])

  useEffect(() => { loadAcademicYears() }, [loadAcademicYears])

  // ── Overview stats ───────────────────────────────────────────────────────────
  const loadPassout = useCallback(async () => {
    setPassoutLoading(true)
    try {
      const res = await fetch(`/api/fees/passout?school_id=${schoolId}`)
      if (res.ok) { clearLoadError('passout'); setPassoutData(await res.json()) }
      else setLoadError('passout', 'Could not load passout dues — try refreshing')
    } catch { setLoadError('passout', 'Network error — could not load passout dues') }
    finally { setPassoutLoading(false) }
  }, [schoolId])

  // Passout collect: load a passout student's open ledger entries, then open the payment form
  const [passoutCollectLoading, setPassoutCollectLoading] = useState<number | null>(null)
  const [passoutCollectError, setPassoutCollectError] = useState('')

  async function collectPassoutStudent(s: { student_id: number; student_name: string; roll_number: string; grade: string; section: string; outstanding: number }) {
    setPassoutCollectLoading(s.student_id); setPassoutCollectError('')
    try {
      const res = await fetch(`/api/fees/ledger?school_id=${schoolId}&student_id=${s.student_id}&academic_year=passout`)
      if (!res.ok) { setPassoutCollectError('Could not load passout dues — please try again'); setPassoutCollectLoading(null); return }
      const entries: LedgerEntry[] = await res.json()
      const open = entries.filter(e => ['pending', 'partial', 'overdue'].includes(e.status))
      if (open.length === 0) { setPassoutCollectError('No outstanding dues found for this student'); setPassoutCollectLoading(null); return }
      // Reuse the existing counter collect flow: switch to Collect and hand the
      // synthesized row off via the shared store — Collect owns the collect-form
      // state (openStudent/collectChecked/payAmount/etc.) since the extraction.
      const row: StudentRow = {
        student_id: s.student_id, student_name: s.student_name, roll_number: s.roll_number,
        school_roll_number: null, grade: s.grade, section: s.section,
        email: null, phone: null, parent_name: null, parent_phone: null, parent_email: null,
        student_status: 'left',
        total_billed: open.reduce((a, e) => a + Number(e.amount_due), 0),
        total_paid: 0,
        outstanding: s.outstanding,
        open_entries: open, all_entries: entries,
        has_overdue: open.some(e => e.status === 'overdue'), never_paid: false,
      }
      setActiveTab('collect' as Tab)
      useFeeStore.getState().requestCollect(row)
    } catch { setPassoutCollectError('Network error — could not load passout dues') }
    setPassoutCollectLoading(null)
  }

  const loadStats = useCallback(async () => {
    if (!academicYear) return
    setStatsLoading(true)
    try {
      const [statsRes, pmtRes] = await Promise.all([
        fetch(`/api/fees/stats?school_id=${schoolId}&academic_year=${academicYear}`),
        fetch(`/api/fees/payments?school_id=${schoolId}`),
      ])
      if (statsRes.ok) {
        clearLoadError('stats')
        const sd = await statsRes.json()
        setStats(sd)
        setGradeStats(Array.isArray(sd.by_class) ? sd.by_class : [])
      } else setLoadError('stats', 'Could not load fee summary — try refreshing the page')
      if (pmtRes.ok) {
        const all = await pmtRes.json() as Array<RecentPayment & { payment_status?: string }>
        setRecentPayments(
          all
            .filter(p => p.payment_status === 'completed' || !p.payment_status)
            .slice(0, 6)
        )
      }
    } catch { setLoadError('stats', 'Network error — fee summary could not be loaded') }
    finally { setStatsLoading(false) }
  }, [schoolId, academicYear])

  useEffect(() => { if (academicYear) { loadStats(); loadPassout() } }, [loadStats, loadPassout, academicYear])

  // ── Setup: categories + structures + lock + amendments ───────────────────────
  const loadSetup = useCallback(async () => {
    if (!academicYear) return
    setSetupLoading(true)
    try {
      const [catRes, strRes, lockRes, amendRes, gradesRes] = await Promise.all([
        fetch(`/api/fees/categories?school_id=${schoolId}`),
        fetch(`/api/fees/structures?school_id=${schoolId}&academic_year=${academicYear}`),
        fetch(`/api/fees/structures/lock?school_id=${schoolId}&academic_year=${academicYear}`),
        fetch(`/api/fees/structures/amend?school_id=${schoolId}&academic_year=${academicYear}`),
        fetch(`/api/students?school_id=${schoolId}&grades_only=1`),
      ])
      const cats: FeeCategory[] = catRes.ok ? await catRes.json() : []
      const strs: FeeStructure[] = strRes.ok ? await strRes.json() : []
      const lock = lockRes.ok ? await lockRes.json() : null
      const amends: Amendment[] = amendRes.ok ? await amendRes.json() : []
      const grades: string[] = gradesRes.ok ? await gradesRes.json() : []
      setCategories(cats)
      setStructures(strs)
      setStructureLock(lock)
      setAmendments(amends)
      clearLoadError('setup')
      setEnrolledGrades(grades.length > 0 ? grades : null)
      const init: Record<string, string> = {}
      strs.forEach(s => { init[`${s.fee_category_id}_${s.grade}`] = String(s.amount) })
      setEditAmounts(init)
    } catch { setLoadError('setup', 'Network error — fee plan could not be loaded') }
    finally { setSetupLoading(false) }
  }, [schoolId, academicYear])

  // Load setup on tab switch; also load once on mount (academicYear change) so the
  // 5-step wizard on the Overview tab shows accurate step state without a tab switch.
  // The tab-switch effect guards on activeTab==='setup', so the two effects don't
  // double-fire when the user is already on the setup tab and academicYear changes.
  useEffect(() => { if (activeTab === 'setup' && academicYear) loadSetup() }, [activeTab, loadSetup, academicYear])
  useEffect(() => { if (academicYear && activeTab !== 'setup') loadSetup() }, [academicYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load the school's UPI ID when Fee Plan opens (once)
  useEffect(() => {
    if (activeTab === 'setup' && !upiLoaded) {
      fetch(`/api/fees/upi-id?school_id=${schoolId}`)
        .then(r => r.ok ? r.json() : { upi_id: '', locked: false })
        .then(d => { setUpiId(d.upi_id || ''); setUpiLocked(!!d.locked); setUpiLoaded(true) })
        .catch(() => setUpiLoaded(true))
    }
  }, [activeTab, upiLoaded, schoolId])

  async function saveUpiId() {
    setUpiSaving(true); setUpiMsg('')
    try {
      const r = await fetch('/api/fees/upi-id', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, upi_id: upiId, unlockToken: upiUnlockToken || undefined }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setUpiMsg('✓ UPI ID saved')
        setUpiLocked(!!d.locked)
      } else {
        setUpiMsg((d as { error?: string }).error || 'Failed to save')
        if (r.status === 423) setUpiLocked(true)
      }
      // Re-lock immediately after every save attempt, success or not — the
      // one-time unlock token is spent either way (or expired/invalid), so
      // there's nothing left to "stay unlocked" with.
      setUpiUnlockToken('')
    } catch { setUpiMsg('Network error — could not save UPI ID') }
    setUpiSaving(false)
  }

  async function verifyUpiUnlock() {
    setUpiUnlocking(true); setUpiUnlockError('')
    try {
      const r = await fetch('/api/fees/upi-id/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, password: upiUnlockPassword }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.unlockToken) {
        setUpiUnlockToken(d.unlockToken)
        setUpiLocked(false)
        setUpiShowUnlock(false)
        setUpiUnlockPassword('')
        setUpiMsg('')
      } else {
        setUpiUnlockError((d as { error?: string }).error || 'Incorrect password')
      }
    } catch { setUpiUnlockError('Network error — could not verify') }
    setUpiUnlocking(false)
  }

  function cancelUpiUnlock() {
    setUpiShowUnlock(false); setUpiUnlockPassword(''); setUpiUnlockError('')
  }

  const [deactivatePromptCatId, setDeactivatePromptCatId] = useState<number | null>(null)

  async function deleteCategory(catId: number) {
    const r = await fetch(`/api/fees/categories?id=${catId}`, { method: 'DELETE' })
    if (r.ok) {
      setCategories(prev => prev.filter(c => c.id !== catId))
      setDeletingCatId(null)
    } else {
      const d = await r.json()
      if (d.error === 'has_ledger_data') {
        // Cannot delete — fee history exists. Ask the admin to confirm deactivation instead.
        setDeletingCatId(null)
        setDeactivatePromptCatId(catId)
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
          structs.push({ fee_category_id: cat.id, grade, amount: parseFloat(val) })
      }
    }
    const r = await fetch('/api/fees/structures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, structures: structs, changed_by: adminName || 'Admin' }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => null)
      setStructureMsg(d?.error || 'Failed to save')
    } else {
      setStructureMsg('✓ Structure saved')
    }
    setSavingStructure(false)
    loadSetup()
  }

  async function generateLedger() {
    // Mandate: all fixed fees must have amounts for EVERY grade before generating bills
    if (!fixedAmountsComplete()) {
      const details = fixedFeeHeads()
        .filter(c => !feeHasAmounts(c.id, c.category_type))
        .map(c => `${c.name} (missing: ${feeGradesMissingAmounts(c.id).map(gradeLabel).join(', ')})`)
      setStructureMsg(`⚠ Set amounts for all grades on every fixed fee first — ${details.join(' · ')}`)
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
        structs.push({ fee_category_id: cat.id, grade, amount: parseFloat(val) })
    }
    const r = await fetch('/api/fees/structures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, structures: structs, changed_by: adminName || 'Admin' }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => null)
      setStructureMsg(d?.error || 'Failed to save')
    } else {
      setStructureMsg(`✓ Amounts saved for ${cat.name}`)
    }
    setSavingStructure(false)
    loadSetup()
  }

  // Whether a fee head has any amount configured
  // Grades the "every grade must have an amount" mandate actually applies to: grades
  // with enrolled students if known, otherwise every grade in the master list (e.g.
  // before any students have been onboarded yet, so setup isn't blocked on that).
  function gradesToValidate(): string[] {
    return enrolledGrades && enrolledGrades.length > 0
      ? GRADES.filter(g => enrolledGrades.includes(g))
      : GRADES
  }
  function feeHasAmounts(catId: number, type: string): boolean {
    if (type === 'variable') {
      return structures.some(s => s.fee_category_id === catId && Number(s.amount) > 0)
    }
    // ALL enrolled grades must have an amount, not just one — otherwise "Generate Bills"
    // silently skips every grade left at 0 with no warning, contradicting the stated
    // mandate that every fixed fee head must be fully configured before bills can be
    // generated. Grades with no enrolled students (e.g. a school with no Nursery
    // section) are excluded so setup isn't blocked on grades that don't apply.
    return gradesToValidate().every(g => parseFloat(editAmounts[`${catId}_${g}`] || '0') > 0)
  }
  // Which specific grades are still missing an amount for a fixed fee head
  function feeGradesMissingAmounts(catId: number): string[] {
    return gradesToValidate().filter(g => !(parseFloat(editAmounts[`${catId}_${g}`] || '0') > 0))
  }

  // Whether bills are generated for this fee head
  function feeBillsGenerated(cat: FeeCategory): boolean {
    return Number(cat.ledger_count) > 0
  }

  // Active FIXED fee heads only (variable fees are optional / per-student, and
  // system-generated carry-forward categories are billed directly to the ledger —
  // both are excluded from the per-grade setup gate)
  function fixedFeeHeads(): FeeCategory[] {
    return categories.filter(c => c.is_active && c.category_type !== 'variable' && !c.is_system)
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
  // Any bills generated at all (gate for Lock) — system categories (Previous Year
  // Dues) always have ledger rows right after carry-forward, which would otherwise
  // let the plan be "locked" with zero real fee heads set up for the new year.
  function anyBillsGenerated(): boolean {
    return categories.some(c => !c.is_system && feeBillsGenerated(c))
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
    else { const d = await r.json().catch(() => ({})); setStructureMsg(d.error || 'Failed to lock fee plan') }
    setLockingStructure(false)
  }

  async function unlockStructure() {
    setLockingStructure(true)
    const r = await fetch('/api/fees/structures/lock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: academicYear, action: 'unlock', locked_by: adminName || 'Admin' }),
    })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setStructureMsg(d.error || 'Failed to unlock fee plan') }
    else loadSetup()
    setLockingStructure(false)
  }

  async function submitAmendment() {
    if (!showAmendForm || !amendForm.new_amount || !amendForm.reason) return
    setAmendSaving(true); setAmendMsg('')
    try {
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
        // Amending updates amount_due on already-generated unpaid/partial bills, so the
        // Overview tab's billed/outstanding/collection-% figures go stale without this.
        loadSetup(); loadStats()
      } else {
        const d = await r.json().catch(() => null)
        setAmendMsg(d?.error || 'Failed to amend amount')
      }
    } finally { setAmendSaving(false) }
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
      } else {
        setApplMsg('Could not load variable fee assignments — try refreshing')
      }
    } catch { setApplMsg('Network error — variable fee assignments could not be loaded') }
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
      // Variable-fee assignments can change amount_due on existing bills (ledgerUpdated),
      // so the Overview tab's totals would otherwise stay stale until a tab switch.
      loadStats()
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

  function toggleCategoryType(cat: FeeCategory) {
    const newType = cat.category_type === 'fixed' ? 'variable' : 'fixed'
    setToggleTypeConfirm({ cat, newType })
  }

  async function confirmToggleCategoryType() {
    if (!toggleTypeConfirm) return
    const { cat, newType } = toggleTypeConfirm
    setToggleTypeConfirm(null)
    const r = await fetch(`/api/fees/categories?id=${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_type: newType, changed_by: adminName || 'Admin' }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => null)
      setStructureMsg(d?.error || 'Failed to change fee type')
      return
    }
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, category_type: newType } : c))
  }

  const [structHistError, setStructHistError]   = useState('')

  async function loadAssignHistory(studentId: number, catId: number) {
    const key = `${studentId}:${catId}`
    if (assignHistoryKey === key) { setAssignHistoryKey(null); return }
    setAssignHistoryKey(key); setAssignHistLoading(true)
    if (!assignHistories[key]) {
      try {
        const r = await fetch(`/api/fees/assignment-history?school_id=${schoolId}&student_id=${studentId}&fee_category_id=${catId}&academic_year=${academicYear}`)
        if (r.ok) { const rows = await r.json(); setAssignHistories(p => ({ ...p, [key]: rows })) }
      } catch { /* history panel stays empty on error — non-critical */ }
    }
    setAssignHistLoading(false)
  }

  async function loadStructHistory(catId: number) {
    if (structHistCatId === catId) { setStructHistCatId(null); return }
    setStructHistCatId(catId); setStructHistLoading(true); setStructHistError('')
    if (!structHistories[catId]) {
      try {
        const r = await fetch(`/api/fees/structure-history?school_id=${schoolId}&fee_category_id=${catId}&academic_year=${academicYear}`)
        if (r.ok) { const rows = await r.json(); setStructHistories(p => ({ ...p, [catId]: rows })) }
        else setStructHistError('Could not load structure history')
      } catch { setStructHistError('Network error') }
    }
    setStructHistLoading(false)
  }

  async function loadCatChangelog(catId: number) {
    if (catChangelogId === catId) { setCatChangelogId(null); return }
    setCatChangelogId(catId); setCatChangelogLoading(true)
    if (!catChangelogs[catId]) {
      try {
        const r = await fetch(`/api/fees/category-changelog?school_id=${schoolId}&category_id=${catId}`)
        if (r.ok) { const rows = await r.json(); setCatChangelogs(p => ({ ...p, [catId]: rows })) }
      } catch { /* changelog panel stays empty on error — non-critical */ }
    }
    setCatChangelogLoading(false)
  }

  // ── First-login year wizard: create the school's first academic year ────────────
  async function createFirstYear() {
    if (!wizLabel.trim() || !wizStart || !wizEnd) { setWizMsg('All fields are required'); return }
    setWizSaving(true); setWizMsg('')
    const r = await fetch('/api/academic-years', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, label: wizLabel.trim(), start_date: wizStart, end_date: wizEnd, set_current: true }),
    })
    const d = await r.json()
    if (r.ok) {
      setShowYearWizard(false)
      loadAcademicYears()
    } else {
      setWizMsg(d.error || 'Failed to create year')
    }
    setWizSaving(false)
  }


  async function fetchAmendImpact(catId: number, grade: string) {
    if (!catId || !grade || !academicYear) return
    setAmendImpactLoading(true); setAmendImpact(null); setAmendPartialCount(null)
    const r = await fetch(`/api/fees/structures/amend?school_id=${schoolId}&academic_year=${academicYear}&preview=1&fee_category_id=${catId}&grade=${grade}`)
    if (r.ok) { const d = await r.json(); setAmendImpact(d.count); setAmendPartialCount(d.partial_count ?? 0) }
    setAmendImpactLoading(false)
  }

  // ── Student Passbook helpers ────────────────────────────────────────────────
  async function loadPassbook(studentId: number) {
    setPbLoading(true); setPbErr('')
    try {
      // Pass academic_year as context (marks current year), not as a filter — passbook shows all years
      const r = await fetch(`/api/fees/passbook?school_id=${schoolId}&student_id=${studentId}&academic_year=${academicYear}`)
      if (r.ok) { setPbData(await r.json()); setPbSection('bills') }
      else { const d = await r.json().catch(() => ({})); setPbErr(d.error || `Could not open passbook (HTTP ${r.status})`) }
    } catch { setPbErr('Network error while opening passbook') }
    setPbLoading(false)
  }

  function openCancel(paymentId: number, pmtAmount: number, ledgerBalance: number) {
    setCancelPmtId(paymentId); setCancelMode('cancel')
    setCancelReason(''); setCorrectAmount(''); setCancelMsg('')
    // max correctable = what's already free on the ledger + the amount being reversed
    setCancelPmtMaxCorrect(ledgerBalance + pmtAmount)
  }

  // Shared by the Passbook Modal (stays here) and FeePassbookTab (via the
  // waiverCorrect bundle) — was previously inlined separately at each render site.
  function openWaiverCorrect(waiver: { id: number; ledger_id: number; waiver_amount: number }) {
    const le = pbData?.ledger.find(e => e.id === waiver.ledger_id)
    setCancelWaiverId(waiver.id); setCancelWaiverMode('revoke')
    setCancelWaiverReason(''); setCorrectWaiverAmount(String(waiver.waiver_amount)); setCancelWaiverMsg('')
    setWaiverMaxCorrect(le ? Number(le.balance) + Number(waiver.waiver_amount) : null)
  }

  // origin: 'passbook' refreshes the passbook; 'counter' bumps the shared ledger
  // version — Collect's own effect re-derives the counter payment list from that.
  async function submitCancelCorrect(origin: 'passbook' | 'counter' = 'passbook') {
    if (!cancelPmtId) return
    if (!cancelReason.trim()) { setCancelMsg('Reason is required.'); return }
    if (cancelMode === 'correct' && !(parseFloat(correctAmount) > 0)) { setCancelMsg('Enter a valid corrected amount.'); return }
    if (cancelMode === 'correct' && cancelPmtMaxCorrect !== null && parseFloat(correctAmount) > cancelPmtMaxCorrect + 0.01) {
      setCancelMsg(`Amount cannot exceed ₹${cancelPmtMaxCorrect.toFixed(2)} (balance remaining on this bill)`); return
    }
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
      bumpReports()
      if (origin === 'passbook' && pbData) {
        loadPassbook(pbData.student.id)
      } else if (origin === 'counter') {
        // Collect owns the ledger (and, via it, the counter payment list for the
        // currently open student) since the extraction — bump instead of calling in.
        bumpLedger()
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
    if (cancelWaiverMode === 'correct' && waiverMaxCorrect !== null && parseFloat(correctWaiverAmount) > waiverMaxCorrect + 0.01) {
      setCancelWaiverMsg(`Amount cannot exceed ₹${waiverMaxCorrect.toFixed(2)} (balance on this bill)`); return
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
        loadStats()
        bumpLedger()
        if (pbData) loadPassbook(pbData.student.id)
        bumpReports()
      } else {
        setCancelWaiverMsg(d.error || 'Failed')
      }
    } catch { setCancelWaiverMsg('Network error') }
    setCancelWaiverBusy(false)
  }

  // Reprint the COMPLETE original receipt for a past transaction. One
  // payment can cover several fee categories at once — each category lands
  // as its own row in fee_payments (and so in pbPayments), all sharing the
  // same receipt_number. Reprinting from a single row used to print only
  // that one line under the shared receipt number, producing a document
  // that didn't match what was handed out at collection time. Group every
  // row with the same receipt_number first, so the reprint always matches
  // the original.
  function printReceiptByNumber(receiptNumber: string) {
    if (!pbData) return
    const rows = pbPayments.filter(p => p.receipt_number === receiptNumber && p.payment_status !== 'cancelled')
    if (rows.length === 0) return
    const s = pbData.student
    const first = rows[0] as PaymentRecord & { fee_head_name?: string; period_label?: string; category_name?: string }
    printDualCopyReceipt({
      school_name: branding.school_name || 'Fee Receipt', logo_url: branding.logo_url, logo_align: branding.logo_align, header_blocks: branding.receipt_header_blocks,
      student_name: s.name, roll_number: s.roll_number, grade: s.grade, section: s.section || '',
      parent_name: s.parent_name, receipt_number: receiptNumber,
      lines: rows.map(r => {
        const row = r as PaymentRecord & { fee_head_name?: string; period_label?: string; category_name?: string }
        return { label: row.fee_head_name || row.category_name || 'Fee', period: row.period_label || '', amount: row.amount }
      }),
      total_paid: rows.reduce((sum, r) => sum + Number(r.amount), 0),
      payment_mode: first.payment_mode, paid_date: first.paid_date,
      transaction_ref: first.transaction_ref, collected_by_name: first.collected_by_name, notes: first.notes,
    })
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
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Statement ${escapeHtml(s.name)}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:820px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:18px}
  .hdr-row{position:relative}
  .hdr-row .hdr-logo{position:absolute;top:50%;transform:translateY(-50%)}
  .hdr-row .hdr-logo.left{left:0}.hdr-row .hdr-logo.right{right:0}
  .school{font-size:18px;font-weight:bold}
  .title{font-size:20px;font-weight:bold;margin-top:4px}.sub{font-size:13px;color:#555;margin-top:4px}
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
<div class="hdr">
  ${branding.logo_url && branding.logo_align === 'center' ? `<div style="text-align:center;margin-bottom:6px"><img src="${escapeHtml(branding.logo_url)}" style="height:56px;object-fit:contain" /></div>` : ''}
  <div class="hdr-row">
    ${branding.logo_url && branding.logo_align === 'left' ? `<img class="hdr-logo left" src="${escapeHtml(branding.logo_url)}" style="height:64px;object-fit:contain" />` : ''}
    <div class="school">${escapeHtml(branding.school_name || 'School')}</div>
    ${renderHeaderBlocks(branding.receipt_header_blocks)}
    <div class="title">Fee Statement (Passbook)</div>
    <div class="sub">${escapeHtml(s.name)} · Grade ${escapeHtml(s.grade)}${escapeHtml(s.section || '')} · Roll #${escapeHtml(s.roll_number)} · ${escapeHtml(academicYear)}</div>
    ${branding.logo_url && branding.logo_align === 'right' ? `<img class="hdr-logo right" src="${escapeHtml(branding.logo_url)}" style="height:64px;object-fit:contain" />` : ''}
  </div>
</div>
<div class="info">
  <div>Parent: ${s.parent_name || '—'}</div>
  <div>Phone: ${s.parent_phone || '—'}</div>
</div>
<div class="sumbox">
  <div><div class="l">Total Billed</div><div class="v">₹${Number(pbData.summary.total_billed).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Paid</div><div class="v">₹${Number(pbData.summary.total_paid).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Waived</div><div class="v">₹${Number(pbData.summary.discretionary_waived ?? pbData.summary.total_waived).toLocaleString('en-IN')}</div></div>
  <div><div class="l">Outstanding</div><div class="v">₹${Number(pbData.summary.outstanding).toLocaleString('en-IN')}</div></div>
</div>
<table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Charge</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="ftr">Generated ${new Date().toLocaleString('en-IN')} · Computer-generated statement.</div>
</body></html>`
    const win = window.open('', '_blank', 'width=900,height=680')
    if (win) writeAndPrint(win, html)
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function LoadErrorBanner({ sectionKey, onRetry }: { sectionKey: string; onRetry: () => void }) {
    const msg = loadErrors[sectionKey]
    if (!msg) return null
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0"><path d="M8 2L1.5 13.5h13L8 2z" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 7v3M8 11.5v.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <span className="flex-1">{msg}</span>
        <button onClick={onRetry} className="text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900">Retry</button>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── First-login academic year gate ── */}
      {showYearWizard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 text-xl font-bold">1</div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Create your Academic Year</h2>
                <p className="text-sm text-gray-500">Required before using any school features</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Every fee, attendance, and exam record is tied to an academic year. Set yours up now to get started.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Year Label (e.g. 2025-26)</label>
                <input data-testid="wizard-year-label" value={wizLabel} onChange={e => setWizLabel(e.target.value)}
                  placeholder="2025-26" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                  <input data-testid="wizard-start-date" type="date" value={wizStart} onChange={e => setWizStart(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                  <input data-testid="wizard-end-date" type="date" value={wizEnd} onChange={e => setWizEnd(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {wizMsg && <p className="text-sm text-red-600">{wizMsg}</p>}
              <button data-testid="wizard-create-year" onClick={createFirstYear} disabled={wizSaving}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50">
                {wizSaving ? 'Creating…' : 'Create Academic Year & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fee Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Collect payments, manage structures, verify online payments</p>
        </div>
        <select
          value={academicYear}
          onChange={e => {
            setAcademicYear(e.target.value)
            // Reset view state that is year-scoped
            setPbData(null); setPbErr('')
            // Collect resets its own year-scoped state (open student, collect form)
            // via its own effect on the academicYear prop — see FeeCollectTab.
          }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {academicYears.map(y => (
            <option key={y} value={y}>{y}{closedYears.has(y) ? ' (Closed)' : ''}</option>
          ))}
        </select>
      </div>

      <LoadErrorBanner sectionKey="academicYears" onRetry={loadAcademicYears} />

      {/* ── Approaching / overdue year-end banner ── */}
      {daysUntilYearEnd !== null && daysUntilYearEnd <= 15 && !closedYears.has(academicYear) && (
        daysUntilYearEnd < 0 ? (
          <div data-testid="year-end-banner" className="flex items-start gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
            <span className="text-red-500 text-lg mt-0.5">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">
                {`Academic year ${academicYear} ended ${Math.abs(daysUntilYearEnd)} day${Math.abs(daysUntilYearEnd) === 1 ? '' : 's'} ago (${yearEndDate}) — please close it out`}
              </p>
              <p className="text-xs text-red-700 mt-0.5">This year is past its end date and still open. Close it out to lock the ledger and roll over balances.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button data-testid="banner-extend" onClick={() => setActiveTab('yearend' as Tab)}
                className="text-xs bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium">
                Extend / Close
              </button>
            </div>
          </div>
        ) : (
          <div data-testid="year-end-banner" className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
            <span className="text-amber-500 text-lg mt-0.5">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {daysUntilYearEnd === 0
                  ? `Academic year ${academicYear} ends today (${yearEndDate})`
                  : `Academic year ${academicYear} ends in ${daysUntilYearEnd} day${daysUntilYearEnd === 1 ? '' : 's'} — ${yearEndDate}`}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">Collect outstanding fees before year-end. You can extend the due date or close the year.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button data-testid="banner-extend" onClick={() => setActiveTab('yearend' as Tab)}
                className="text-xs bg-white border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 font-medium">
                Extend / Close
              </button>
            </div>
          </div>
        )
      )}

      {/* ── 5-step setup wizard (shown when there are no bills yet) ── */}
      {!setupWizardDismissed && academicYear && !closedYears.has(academicYear) && (
        (() => {
          const step1Done = true // year exists
          const step2Done = categories.filter(c => c.is_active !== false && !c.is_system).length > 0
          const step3Done = fixedAmountsComplete()
          const step4Done = (stats?.summary?.total_due ?? 0) > 0
          const step5Done = !!structureLock
          const allDone = step1Done && step2Done && step3Done && step4Done && step5Done
          if (allDone) return null
          const steps = [
            { n: 1, label: 'Academic Year', done: step1Done, tab: null as Tab | null },
            { n: 2, label: 'Fee Heads',     done: step2Done, tab: 'setup' as Tab },
            { n: 3, label: 'Set Amounts',   done: step3Done, tab: 'setup' as Tab },
            { n: 4, label: 'Generate Bills', done: step4Done, tab: 'setup' as Tab },
            { n: 5, label: 'Lock Plan',     done: step5Done, tab: 'setup' as Tab },
          ]
          const nextStep = steps.find(s => !s.done)
          return (
            <div data-testid="setup-wizard" className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-blue-800">Fee Setup — {nextStep ? `Step ${nextStep.n} of 5: ${nextStep.label}` : 'Almost done!'}</p>
                <button onClick={() => setSetupWizardDismissed(true)} className="text-xs text-blue-400 hover:text-blue-600">Dismiss</button>
              </div>
              <div className="flex items-center gap-1">
                {steps.map((s, i) => (
                  <div key={s.n} className="flex items-center gap-1 flex-1">
                    <div className={`flex items-center gap-1.5 flex-1 ${s.tab && !s.done ? 'cursor-pointer' : ''}`}
                      onClick={() => { if (s.tab && !s.done) setActiveTab(s.tab) }}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        s.done ? 'bg-green-500 text-white' : s.n === (nextStep?.n ?? 0) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>{s.done ? '✓' : s.n}</div>
                      <span className={`text-xs hidden sm:inline ${s.done ? 'text-green-700 line-through' : s.n === (nextStep?.n ?? 0) ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>{s.label}</span>
                    </div>
                    {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-1 ${s.done ? 'bg-green-400' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>
              {nextStep?.tab && (
                <button onClick={() => setActiveTab(nextStep.tab!)} className="mt-3 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                  Go to {nextStep.label} →
                </button>
              )}
            </div>
          )
        })()
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {([
          { key: 'overview',         label: 'Overview' },
          { key: 'setup',            label: 'Fee Plan' },
          { key: 'collect',          label: pendingPayments.length > 0 ? `Ledger ● ${pendingPayments.length}` : 'Ledger' },
          { key: 'students',         label: 'Student Passbook' },
          { key: 'reports',          label: 'Reports' },
          { key: 'yearend',          label: 'Year-End' },
          { key: 'archive',          label: 'Past Records' },
          { key: 'leavers',          label: 'Leavers & Dues' },
        ] as const).map(t => (
          <button
            key={t.key}
            data-testid={`tab-${t.key}`}
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

          <LoadErrorBanner sectionKey="stats"   onRetry={loadStats} />
          <LoadErrorBanner sectionKey="passout" onRetry={loadPassout} />

          {/* ── Action Required ── */}
          {(() => {
            const actions: Array<{ msg: string; tab: Tab; color: string; subView?: 'online' }> = []
            if (pendingPayments.length > 0)
              actions.push({ msg: `${pendingPayments.length} online payment${pendingPayments.length > 1 ? 's' : ''} waiting for your verification`, tab: 'collect' as const, subView: 'online', color: 'text-red-700 bg-red-50 border-red-200' })
            if (stats && stats.summary.overdue_count > 20)
              actions.push({ msg: `${stats.summary.overdue_count} overdue entries — follow up with parents`, tab: 'collect' as const, color: 'text-orange-700 bg-orange-50 border-orange-200' })
            if (stats && stats.summary.defaulters_count > 0)
              actions.push({ msg: `${stats.summary.defaulters_count} students have made zero payment this year`, tab: 'collect' as const, color: 'text-amber-700 bg-amber-50 border-amber-200' })
            // Warn if the immediately preceding year (older, higher index since array is DESC) is not closed
            if (academicYears.length > 1) {
              const idx = academicYears.indexOf(academicYear)
              const prevYear = idx < academicYears.length - 1 ? academicYears[idx + 1] : null
              if (prevYear && !closedYears.has(prevYear))
                actions.push({ msg: `${prevYear} has not been closed — go to Year-End tab to carry forward or write off outstanding dues before generating new bills`, tab: 'yearend' as const, color: 'text-purple-700 bg-purple-50 border-purple-200' })
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
                        onClick={() => { setActiveTab(a.tab); if (a.subView === 'online') useFeeStore.getState().requestCollectionView('online') }}
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
                        <button onClick={() => setActiveTab('reports')} className="text-xs text-blue-600 hover:text-blue-800">Full report →</button>
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
                      <button
                        onClick={() => setActiveTab('collect')}
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

                  {/* Passout Students Pending Bills */}
                  {passoutData && passoutData.summary.passout_students > 0 && (
                    <div className="bg-white rounded-xl border border-indigo-100 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-semibold text-indigo-700">Passout Students — Pending Bills</h3>
                          <p className="text-xs text-gray-400 mt-0.5">{passoutData.summary.passout_students} student{passoutData.summary.passout_students > 1 ? 's' : ''} · open ledger</p>
                        </div>
                        <button
                          onClick={loadPassout}
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
                                onClick={() => collectPassoutStudent(s)}
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

          <LoadErrorBanner sectionKey="setup" onRetry={loadSetup} />

          {setupLoading && (
            <div className="space-y-4 animate-pulse">
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
                <div className="flex items-center gap-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-100 rounded flex-1" />)}
                </div>
              </div>
              {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 h-20" />)}
            </div>
          )}

          {!setupLoading && <>

          {/* ── Setup progress strip ── */}
          {(() => {
            const hasYear    = academicYears.length > 0
            const hasHeads   = categories.some(c => !c.is_system)
            const allAmountsSet = fixedAmountsComplete()
            const steps = [
              { n: 1, label: 'Create Academic Year', done: hasYear },
              { n: 2, label: 'Add Fee Heads',         done: hasHeads },
              { n: 3, label: 'Set Fixed Amounts',     done: allAmountsSet },
              { n: 4, label: 'Generate Bills',        done: allReadyHeadsBilled() },
              { n: 5, label: 'Lock Plan',             done: !!structureLock },
            ]
            const doneCount = steps.filter(s => s.done).length
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Fee Plan Setup — {academicYear}</h3>
                  <span className="text-xs text-gray-400">{doneCount} of 5 steps done</span>
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
          {!academicYears.length ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              <strong>First — create an academic year.</strong> Go to <strong>School Settings → Academic Years</strong> to set up the current year before configuring fees.
            </div>
          ) : !structureLock && categories.some(c => !c.is_system) && (() => {
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
                <div className="flex items-center gap-1.5">
                  {upiLocked && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                      Locked
                    </span>
                  )}
                  {upiId && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Configured</span>}
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Parents pay to this UPI ID via the QR code in their portal. Without it, online payment is disabled.
                {upiLocked && ' Saved — verify your password to make changes.'}
              </p>

              {upiShowUnlock ? (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-800">Enter your password to unlock this field</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="password" value={upiUnlockPassword}
                      onChange={e => { setUpiUnlockPassword(e.target.value); setUpiUnlockError('') }}
                      onKeyDown={e => { if (e.key === 'Enter' && upiUnlockPassword) verifyUpiUnlock() }}
                      placeholder="Your account password"
                      autoFocus
                      className="flex-1 min-w-40 border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    <button onClick={verifyUpiUnlock} disabled={upiUnlocking || !upiUnlockPassword}
                      className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
                      {upiUnlocking ? 'Verifying…' : 'Unlock'}
                    </button>
                    <button onClick={cancelUpiUnlock}
                      className="text-sm text-gray-500 px-3 py-2 rounded-lg hover:bg-gray-100">
                      Cancel
                    </button>
                  </div>
                  {upiUnlockError && <p className="text-xs text-red-600">{upiUnlockError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-56">
                    <input type="text" value={upiId}
                      onChange={e => { setUpiId(e.target.value); setUpiMsg('') }}
                      placeholder="e.g. school@okhdfcbank"
                      readOnly={upiLocked}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${upiLocked ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed' : 'border-gray-200 focus:ring-2 focus:ring-blue-500'}`} />
                  </div>
                  {upiLocked ? (
                    <button onClick={() => setUpiShowUnlock(true)}
                      className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200">
                      Unlock to Edit
                    </button>
                  ) : (
                    <button onClick={saveUpiId} disabled={upiSaving}
                      className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                      {upiSaving ? 'Saving…' : 'Save UPI ID'}
                    </button>
                  )}
                  {upiMsg && <span className={`text-sm ${upiMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{upiMsg}</span>}
                </div>
              )}
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
                  <button data-testid="btn-unlock-plan" onClick={unlockStructure} disabled={lockingStructure} className="text-xs text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
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
              <div className="overflow-x-auto">
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
            </div>
          )}

          {/* ── Top action bar ── */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {categories.filter(c => !c.is_system).length} fee {categories.filter(c => !c.is_system).length === 1 ? 'head' : 'heads'} ·{' '}
              <span className="text-green-600 font-medium">{categories.filter(c => !c.is_system && feeBillsGenerated(c)).length} with bills generated</span>
            </p>
            <div className="flex items-center gap-2">
              {structureMsg && (
                <span className={`text-sm ${structureMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{structureMsg}</span>
              )}
              {!structureLock && (
                <>
                  <button data-testid="btn-add-fee-head" onClick={() => { setShowAddFee(true); setAddFeeStep(1) }}
                    className="text-sm border border-blue-200 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg font-medium">
                    + Add Fee Head
                  </button>
                  <button data-testid="btn-generate-bills" onClick={generateLedger}
                    disabled={generatingLedger || fixedFeeHeads().length === 0 || !fixedAmountsComplete()}
                    title={!fixedAmountsComplete() ? `Set amounts for all fixed fees first${fixedFeesMissingAmounts().length ? ': ' + fixedFeesMissingAmounts().join(', ') : ''}` : 'Generate bills for all students'}
                    className="text-sm bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                    {generatingLedger ? 'Generating…' : 'Generate All Bills'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Sub-view toggle ── */}
          {categories.some(c => !c.is_system) && (
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
                    {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
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
          {planView === 'heads' && (categories.filter(cat => !cat.is_system).length === 0 ? (
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
            <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {categories.filter(cat => !cat.is_system).map(cat => {
                const amountsSet = feeHasAmounts(cat.id, cat.category_type)
                const generated = feeBillsGenerated(cat)
                const catStat = stats?.by_category.find(c => c.category_name === cat.name)
                const collected = catStat ? Number(catStat.total_collected) : 0
                const due = catStat ? Number(catStat.total_due) - Number(catStat.total_waived ?? 0) : 0
                const collPct = pct(collected, due)
                return (
                  <div key={cat.id} className={`bg-white rounded-xl border p-5 shadow-sm ${!cat.is_active ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
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
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cat.is_system ? 'bg-indigo-100 text-indigo-600' : cat.category_type === 'variable' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                        {cat.is_system ? 'System' : cat.category_type === 'variable' ? 'Variable' : 'Fixed'}
                      </span>
                    </div>

                    {/* Status row */}
                    <div className="flex items-center gap-4 mt-4 text-xs flex-wrap">
                      {cat.is_system ? (
                        <span className="text-gray-400">Billed directly to each student — no setup needed</span>
                      ) : (
                        <span className={amountsSet ? 'text-green-600' : 'text-amber-600'}>
                          {amountsSet ? '✅ Amounts set' : '⚠ Amounts not set'}
                        </span>
                      )}
                      <span className={generated ? 'text-green-600' : 'text-gray-400'}>
                        {generated ? '✅ Bills generated' : '◌ Bills not generated'}
                      </span>
                      {/* Overdue date = academic year end */}
                      <span className="flex items-center gap-1 ml-auto text-gray-400">
                        Overdue after academic year ends
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
                      {!cat.is_system && (
                        <button
                          onClick={() => { setPlanManageCatId(planManageCatId === cat.id ? null : cat.id); setGroupAmounts({}); setStructureMsg(''); if (cat.category_type === 'variable') { setApplGrade(''); setApplStudents([]); setApplCategories([]); setApplAmounts({}) } }}
                          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700"
                        >
                          {planManageCatId === cat.id ? 'Close' : 'Manage →'}
                        </button>
                      )}
                      <button onClick={() => loadStructHistory(cat.id)}
                        className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                        History
                      </button>
                      {!structureLock && cat.is_active && !cat.is_system && (
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
                          structHistError ? <p className="text-red-500 text-[10px]">{structHistError}</p> :
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
                                {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
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
                                  <div className="ml-auto flex items-center gap-3">
                                    <button onClick={() => saveApplicability()} disabled={applSaving}
                                      className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg font-medium disabled:opacity-50">
                                      {applSaving ? 'Saving…' : 'Save Amounts'}
                                    </button>
                                  </div>
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
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {GRADES.map(g => (
                                  <div key={g} className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-400 w-10 shrink-0">{/^\d+$/.test(g) ? `Gr.${g}` : g}</span>
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
          {!structureLock && categories.some(c => !c.is_system) && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-800">Finished setting up?</p>
                <p className="text-xs text-blue-600">
                  {anyBillsGenerated()
                    ? "Lock the plan so amounts can't be changed accidentally. After locking, changes need an amendment with a reason."
                    : 'Generate bills first — the plan can only be locked after bills are generated.'}
                </p>
              </div>
              <button data-testid="btn-lock-plan" onClick={lockStructure} disabled={lockingStructure || !anyBillsGenerated()}
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
                  <p className="font-semibold text-gray-800">Confirm — Generate Bills</p>
                  <button onClick={() => setShowGenerateConfirm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-sm text-gray-500">
                    Bills will be generated for academic year <strong>{academicYear}</strong>. Every fee head, regardless of frequency,
                    becomes due on the academic year&apos;s end date.
                  </p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                          <th className="text-left px-4 py-2 font-semibold">Fee Head</th>
                          <th className="text-left px-4 py-2 font-semibold">Frequency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {categories.filter(c => c.is_active && !c.is_system).map(cat => (
                          <tr key={cat.id} className="hover:bg-gray-50/60">
                            <td className="px-4 py-2.5 font-medium text-gray-800">{cat.name}</td>
                            <td className="px-4 py-2.5 text-gray-500">{FREQ_LABEL[cat.frequency]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                  <button onClick={() => setShowGenerateConfirm(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                    ← Go back
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
                      <div>
                        <label className="text-xs font-medium text-gray-600">Description <span className="text-gray-400">(optional)</span></label>
                        <input type="text" placeholder="e.g. Monthly smart class infrastructure charge" value={newCategory.description}
                          onChange={e => setNewCategory(p => ({ ...p, description: e.target.value }))}
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

          </>}
        </div>
      )}

      {/* ═══ STUDENT PASSBOOK ════════════════════════════════════════════════════ */}
      {passbookVisited && (
        <div hidden={activeTab !== 'students'}>
          <FeePassbookTab
            schoolId={schoolId} academicYear={academicYear}
            passbook={{
              data: pbData, loading: pbLoading, err: pbErr, section: pbSection, setSection: setPbSection,
              summary: pbSummary, yearOnly: pbYearOnly, payments: pbPayments, receipts: pbReceipts,
              waivers: pbWaivers, timeline: pbTimeline,
            }}
            onLoad={loadPassbook}
            onClose={() => setPbData(null)}
            onPrintReceipt={printReceiptByNumber}
            onPrintStatement={printPassbookStatement}
            cancelCorrect={{
              pmtId: cancelPmtId, mode: cancelMode, reason: cancelReason, amount: correctAmount,
              busy: cancelBusy, msg: cancelMsg, maxCorrect: cancelPmtMaxCorrect,
              setMode: setCancelMode, setReason: setCancelReason, setAmount: setCorrectAmount, setPmtId: setCancelPmtId,
              open: openCancel, submit: submitCancelCorrect,
            }}
            waiverCorrect={{
              waiverId: cancelWaiverId, mode: cancelWaiverMode, reason: cancelWaiverReason, amount: correctWaiverAmount,
              busy: cancelWaiverBusy, msg: cancelWaiverMsg, maxCorrect: waiverMaxCorrect,
              setMode: setCancelWaiverMode, setReason: setCancelWaiverReason, setAmount: setCorrectWaiverAmount,
              setMsg: setCancelWaiverMsg, setWaiverId: setCancelWaiverId,
              open: openWaiverCorrect, submit: submitRevokeCorrectWaiver,
            }}
          />
        </div>
      )}

      {/* ═══ REPORTS ═════════════════════════════════════════════════════════════ */}
      {reportsVisited && (
        <div hidden={activeTab !== 'reports'}>
          <FeeReportsTab schoolId={schoolId} academicYear={academicYear} adminName={adminName} />
        </div>
      )}

      {/* ═══ YEAR-END ════════════════════════════════════════════════════════════ */}
      {yearEndVisited && (
        <div hidden={activeTab !== 'yearend'}>
          <FeeYearEndTab
            schoolId={schoolId} academicYear={academicYear} adminName={adminName} branding={branding}
            onGoToSetup={() => setActiveTab('setup' as Tab)}
            onStatsChanged={loadStats} onLedgerChanged={bumpLedger}
            onAcademicYearsChanged={loadAcademicYears} onPassoutChanged={loadPassout}
          />
        </div>
      )}

      {/* ═══ COLLECTION ══════════════════════════════════════════════════════════ */}
      {collectVisited && (
        <div hidden={activeTab !== 'collect'}>
          <FeeCollectTab
            schoolId={schoolId} academicYear={academicYear} adminName={adminName} branding={branding}
            hasOnlinePayments={hasOnlinePayments} isActive={activeTab === 'collect'}
            onStatsChanged={loadStats} onPassoutChanged={loadPassout}
            onOpenPassbook={(studentId) => { loadPassbook(studentId); setShowPassbookModal(true); setPbSection('payments') }}
            cancelCorrect={{
              pmtId: cancelPmtId, mode: cancelMode, reason: cancelReason, amount: correctAmount,
              busy: cancelBusy, msg: cancelMsg, maxCorrect: cancelPmtMaxCorrect,
              setMode: setCancelMode, setReason: setCancelReason, setAmount: setCorrectAmount, setPmtId: setCancelPmtId,
              open: openCancel, submit: submitCancelCorrect,
            }}
          />
        </div>
      )}

      {/* ══ PAST RECORDS (ARCHIVE) ═══════════════════════════════════════════════ */}
      {archiveVisited && (
        <div hidden={activeTab !== 'archive'}>
          <FeeArchiveTab schoolId={schoolId} onViewYear={viewArchiveYear} />
        </div>
      )}

      {/* ══ LEAVERS & DUES ════════════════════════════════════════════════════════ */}
      {leaversVisited && (
        <div hidden={activeTab !== 'leavers'}>
          <FeeLeaversTab schoolId={schoolId} onCollect={collectRemovedStudent} />
        </div>
      )}

      {/* ══ Deactivate Category Instead of Delete ═══════════════════════════════ */}
      {deactivatePromptCatId !== null && (() => {
        const cat = categories.find(c => c.id === deactivatePromptCatId)
        return (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeactivatePromptCatId(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div>
                <p className="text-base font-bold text-gray-900">Cannot Delete — Fee Records Exist</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-semibold">{cat?.name ?? 'This category'}</span> has fee history that must be preserved.
                  You can deactivate it instead — it will be hidden from new bills but all existing records are kept.
                </p>
              </div>
              <div className="flex gap-2">
                <button data-testid="deactivate-prompt-cancel" onClick={() => setDeactivatePromptCatId(null)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button data-testid="deactivate-prompt-confirm" onClick={() => { setDeactivatePromptCatId(null); if (deactivatePromptCatId) deactivateCategory(deactivatePromptCatId, false) }}
                  className="flex-1 bg-amber-500 text-white py-2 rounded-xl text-sm font-semibold hover:bg-amber-600">
                  Deactivate Instead
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ Toggle Category Type Confirm ════════════════════════════════════════ */}
      {toggleTypeConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setToggleTypeConfirm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-base font-bold text-gray-900">Switch fee type?</p>
              <p className="text-sm text-gray-500 mt-1">
                Switch <span className="font-semibold">{toggleTypeConfirm.cat.name}</span> from{' '}
                <span className="font-semibold">{toggleTypeConfirm.cat.category_type === 'fixed' ? 'Fixed' : 'Variable'}</span> to{' '}
                <span className="font-semibold">{toggleTypeConfirm.newType === 'fixed' ? 'Fixed' : 'Variable'}</span>?
                This only works if no bills have been generated for this fee yet.
              </p>
            </div>
            <div className="flex gap-2">
              <button data-testid="toggle-type-cancel" onClick={() => setToggleTypeConfirm(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button data-testid="toggle-type-confirm" onClick={confirmToggleCategoryType}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700">
                Switch Type
              </button>
            </div>
          </div>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                {[
                  { l: 'Total Billed', v: pbSummary.total_billed, c: 'text-gray-800' },
                  { l: 'Paid',         v: pbSummary.total_paid,    c: 'text-green-700' },
                  { l: 'Waived',       v: pbSummary.discretionary_waived,  c: 'text-purple-700' },
                  { l: 'Outstanding',  v: pbSummary.outstanding,   c: 'text-red-600' },
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
                  { key: 'bills',    label: `Bills (${pbYearOnly.reduce((s, y) => s + y.entries.length, 0)})` },
                  { key: 'payments', label: `Payments (${pbPayments.length})` },
                  { key: 'waivers',  label: `Waivers (${pbWaivers.length})` },
                  { key: 'timeline', label: 'Timeline' },
                  { key: 'receipts', label: `Print Receipts (${pbReceipts.length})` },
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
                    <div className="space-y-3">
                      {pbData.prior_unresolved.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                          <div>
                            <p className="text-xs font-semibold text-amber-700">Prior Year Dues Unresolved</p>
                            <p className="text-xs text-amber-600 mt-0.5">
                              {pbData.prior_unresolved.map(y => `${y.academic_year}: ${fmt(y.outstanding)} outstanding`).join(' · ')}
                            </p>
                          </div>
                        </div>
                      )}
                      {!pbData || pbData.ledger_by_year.length === 0
                        ? <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">No bills recorded.</div>
                        : pbData.ledger_by_year.map(yearGroup => (
                          <div key={yearGroup.academic_year} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-600">{yearGroup.academic_year}</span>
                              <div className="flex gap-3 text-xs text-gray-400">
                                <span>Billed <span className="font-semibold text-gray-700">{fmt(yearGroup.total_billed)}</span></span>
                                <span>Paid <span className="font-semibold text-green-600">{fmt(yearGroup.total_paid)}</span></span>
                                {yearGroup.outstanding > 0 && <span>Due <span className="font-semibold text-red-600">{fmt(yearGroup.outstanding)}</span></span>}
                              </div>
                            </div>
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
                                {yearGroup.entries.map(e => (
                                  <tr key={e.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2.5 text-gray-700">
                                      {e.category_name} · <span className="text-gray-400">{e.period_label}</span>
                                      {e.source_academic_year && (
                                        <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium" title={`Carried from ${e.source_academic_year}`}>↩ {e.source_academic_year}</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(e.amount_due)}</td>
                                    <td className="px-4 py-2.5 text-right text-green-600">{fmt(e.amount_paid)}</td>
                                    <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${STATUS_COLORS[e.status as keyof typeof STATUS_COLORS] || ''}`}>{e.status}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))
                      }
                    </div>
                  )}

                  {/* Payments */}
                  {pbSection === 'payments' && (
                    <div className="space-y-3">
                      {pbPayments.length === 0
                        ? <p className="text-sm text-gray-400 text-center py-8">No payments recorded for {academicYear}.</p>
                        : pbPayments.map(p => {
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
                                      {cancelPmtId === p.id
                                        ? <button onClick={() => setCancelPmtId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2">Close</button>
                                        : <button onClick={() => {
                                            const le = pbData?.ledger.find(e => e.id === p.ledger_id)
                                            openCancel(p.id, Number(p.amount), le ? Number(le.balance) : 0)
                                          }} className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Cancel / Correct</button>
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

                  {/* Print Receipts — one row per actual receipt_number, reprinting the
                      complete original receipt rather than a single fee line. */}
                  {pbSection === 'receipts' && (
                    <div className="space-y-2">
                      {pbReceipts.length === 0
                        ? <p className="text-sm text-gray-400 text-center py-8">No receipts for {academicYear}.</p>
                        : pbReceipts.map(r => (
                          <div key={r.receipt_number} className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${r.cancelled ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100'}`}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-indigo-600">{r.receipt_number}</span>
                                {r.cancelled && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Cancelled</span>}
                              </div>
                              <p className={`text-lg font-bold mt-0.5 ${r.cancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{fmt(r.total)}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{fmtDate(r.paid_date)} · {r.lineCount} {r.lineCount === 1 ? 'item' : 'items'}</p>
                            </div>
                            {!r.cancelled && (
                              <button onClick={() => printReceiptByNumber(r.receipt_number)}
                                className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-50 flex-shrink-0">🖨 Print</button>
                            )}
                          </div>
                        ))
                      }
                    </div>
                  )}

                  {/* Waivers */}
                  {pbSection === 'waivers' && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      {pbWaivers.length === 0
                        ? <p className="text-sm text-gray-400 p-8 text-center">No waivers granted for {academicYear}.</p>
                        : <div className="divide-y divide-gray-50">
                            {pbWaivers.map(w => (
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
                                      : <button onClick={() => {
                                          const ww = w as { id: number; ledger_id?: number; waiver_amount?: number }
                                          openWaiverCorrect({ id: ww.id, ledger_id: ww.ledger_id ?? -1, waiver_amount: ww.waiver_amount ?? 0 })
                                        }} className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">Revoke / Correct</button>
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
                                      <div>
                                        <input type="number" min="0" value={correctWaiverAmount} onChange={e => setCorrectWaiverAmount(e.target.value)}
                                          placeholder={waiverMaxCorrect !== null ? `max ₹${waiverMaxCorrect.toFixed(2)}` : 'Corrected waiver amount (₹)'}
                                          className={`w-full border rounded-lg px-3 py-1.5 text-sm ${waiverMaxCorrect !== null && parseFloat(correctWaiverAmount) > waiverMaxCorrect + 0.01 ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                                        {waiverMaxCorrect !== null && parseFloat(correctWaiverAmount) > waiverMaxCorrect + 0.01 && (
                                          <p className="text-xs text-red-600 mt-1">Exceeds max of ₹{waiverMaxCorrect.toFixed(2)}</p>
                                        )}
                                      </div>
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
                      {pbTimeline.length === 0
                        ? <p className="text-sm text-gray-400 p-8 text-center">No activity for {academicYear}.</p>
                        : <div className="divide-y divide-gray-50">
                            {pbTimeline.map((t, i) => (
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


    </div>
  )
}
