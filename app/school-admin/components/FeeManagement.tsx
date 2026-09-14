'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useFeature } from '@/lib/features-context'
import { GRADE_SEQUENCE } from '@/lib/grades'
import type {
  FeeCategory, FeeStructure, StructureLock, Amendment,
  LedgerEntry, FeeStats, PaymentRecord, StudentRow, PassbookData,
  RecentPayment, GradeStat, PassoutData, PassoutStudent,
  ReceiptHeaderBlock,
} from './fee-management/types'
import { escapeHtml, printDualCopyReceipt, writeAndPrint, renderHeaderBlocks } from './fee-management/receipts'
import FeeArchiveTab from './fee-management/FeeArchiveTab'
import FeeLeaversTab, { type RemovedStudent } from './fee-management/FeeLeaversTab'
import FeeReportsTab from './fee-management/FeeReportsTab'
import FeeYearEndTab from './fee-management/FeeYearEndTab'
import FeeCollectTab from './fee-management/FeeCollectTab'
import FeePassbookTab from './fee-management/FeePassbookTab'
import FeeOverviewTab from './fee-management/FeeOverviewTab'
import FeeSetupTab from './fee-management/FeeSetupTab'
import { useFeeStore } from '@/lib/stores/feeStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADES = GRADE_SEQUENCE

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
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([])
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
  const [passoutData, setPassoutData] = useState<PassoutData | null>(null)
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
  const [setupVisited, setSetupVisited] = useState(false)
  useEffect(() => { if (activeTab === 'setup') setSetupVisited(true) }, [activeTab])

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

  async function collectPassoutStudent(s: PassoutStudent) {
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

  // ── Setup actions ────────────────────────────────────────────────────────────
  // Generate bills only for students who have no ledger rows yet (safe after lock)
  // ── Fee Plan helpers ──────────────────────────────────────────────────────────

  // Create a fee head (from wizard) — does not navigate, refreshes list
  // Apply a group amount to all grades in that group for the managed fee
  // Save amounts for a single fee head (only that category's grades)
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
        <div className="flex items-center gap-2">
          <button
            data-testid="btn-header-collect"
            onClick={() => setActiveTab('collect' as Tab)}
            className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-1.5"
          >
            💰 Collect
            {pendingPayments.length > 0 && (
              <span className="text-[10px] bg-white/20 rounded-full px-1.5 py-0.5">{pendingPayments.length}</span>
            )}
          </button>
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
        <FeeOverviewTab
          schoolId={schoolId} academicYear={academicYear}
          academicYears={academicYears} closedYears={closedYears}
          stats={stats} statsLoading={statsLoading} statsError={loadErrors.stats}
          gradeStats={gradeStats} recentPayments={recentPayments}
          passoutData={passoutData} passoutLoading={passoutLoading} passoutError={loadErrors.passout}
          passoutCollectLoading={passoutCollectLoading} passoutCollectError={passoutCollectError}
          onRetryStats={loadStats} onRetryPassout={loadPassout}
          onCollectPassout={collectPassoutStudent}
          onGoToCollect={() => setActiveTab('collect' as Tab)}
          onGoToYearEnd={() => setActiveTab('yearend' as Tab)}
          onGoToReports={() => setActiveTab('reports' as Tab)}
          onGoToSetup={() => setActiveTab('setup' as Tab)}
        />
      )}


      {/* ═══ FEE PLAN ════════════════════════════════════════════════════════════ */}
      {setupVisited && (
        <div hidden={activeTab !== 'setup'}>
          <FeeSetupTab
            schoolId={schoolId} academicYear={academicYear} academicYears={academicYears}
            adminName={adminName} hasOnlinePayments={hasOnlinePayments}
            stats={stats} setupLoading={setupLoading} setupError={loadErrors.setup}
            categories={categories} setCategories={setCategories}
            structures={structures} structureLock={structureLock} amendments={amendments}
            enrolledGrades={enrolledGrades} editAmounts={editAmounts} setEditAmounts={setEditAmounts}
            onRetrySetup={loadSetup} onSetupChanged={loadSetup} onStatsChanged={loadStats}
          />
        </div>
      )}


      {/* ═══ STUDENT PASSBOOK ════════════════════════════════════════════════════ */}
      {passbookVisited && (
        <div hidden={activeTab !== 'students'}>
          <FeePassbookTab
            schoolId={schoolId} academicYear={academicYear} isActive={activeTab === 'students'}
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
