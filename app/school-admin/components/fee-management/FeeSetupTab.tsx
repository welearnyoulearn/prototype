'use client'

import { useEffect, useState, Fragment, type Dispatch, type SetStateAction, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { GRADE_SEQUENCE } from '@/lib/grades'
import type { FeeCategory, FeeStructure, StructureLock, Amendment, ApplStudent, ApplCategory, FeeStats } from './types'
import { LoadErrorBanner } from './LoadErrorBanner'
import { Skeleton } from '@/components/ui/skeleton'

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
function blockNonNumericKeys(e: ReactKeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault()
}

type VarGridStudent = { id: number; name: string; roll_number: string; section: string }
type VarGridCategory = { id: number; name: string; frequency: string }
type StructureHistoryRow = { id: number; grade: string; old_amount: number | null; new_amount: number; old_due_day: number | null; new_due_day: number; change_type: string; changed_by: string; changed_at: string }
type CategoryChangeRow = { id: number; field_changed: string; old_value: string | null; new_value: string | null; changed_by: string; changed_at: string }

// Fee heads, per-grade/per-student amounts, plan lock, and the combined
// variable-fee grid. categories/structures/structureLock/amendments/
// enrolledGrades/editAmounts stay parent-owned — the global Setup Wizard
// banner (shown above the tab bar on every tab) also reads them via
// fixedAmountsComplete()-equivalent logic, and editAmounts specifically
// doubles as that banner's live "amounts set" signal. This tab only reads
// them and calls back to refresh (onSetupChanged/onStatsChanged) after a
// mutation, same as every other extracted tab.
export default function FeeSetupTab({
  schoolId,
  academicYear,
  academicYears,
  adminName,
  hasOnlinePayments,
  stats,
  setupLoading,
  setupError,
  categories,
  setCategories,
  structures,
  structureLock,
  amendments,
  enrolledGrades,
  editAmounts,
  setEditAmounts,
  onRetrySetup,
  onSetupChanged,
  onStatsChanged,
}: {
  schoolId: number
  academicYear: string
  academicYears: string[]
  adminName?: string
  hasOnlinePayments: boolean
  stats: FeeStats | null
  setupLoading: boolean
  setupError?: string
  categories: FeeCategory[]
  setCategories: Dispatch<SetStateAction<FeeCategory[]>>
  structures: FeeStructure[]
  structureLock: StructureLock
  amendments: Amendment[]
  enrolledGrades: string[] | null
  editAmounts: Record<string, string>
  setEditAmounts: Dispatch<SetStateAction<Record<string, string>>>
  onRetrySetup: () => void
  onSetupChanged: () => void
  onStatsChanged: () => void
}) {
  const [newCategory, setNewCategory]   = useState({ name: '', frequency: 'monthly', description: '', category_type: 'fixed' })
  const [savingStructure, setSavingStructure] = useState(false)
  const [generatingLedger, setGeneratingLedger] = useState(false)
  const [lockingStructure, setLockingStructure] = useState(false)
  const [structureMsg, setStructureMsg] = useState('')
  const [showAmendLog, setShowAmendLog] = useState(false)
  // Saving an amount here (unlike the dedicated Amend flow) never touches
  // already-generated student_fee_ledger rows — it only updates fee_structures.
  // Students already billed at the old amount silently keep owing it. This
  // check warns before that happens instead of letting it pass silently.
  const [checkingImpact, setCheckingImpact] = useState(false)
  const [pendingAmountWarning, setPendingAmountWarning] = useState<{
    cat: FeeCategory
    structs: { fee_category_id: number; grade: string; amount: number }[]
    totalAffected: number
    byGrade: { grade: string; count: number }[]
  } | null>(null)

  // ── Fee Plan ──
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
  // Applicability state
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
  // Toggle fixed<->variable confirmation dialog
  const [toggleTypeConfirm, setToggleTypeConfirm] = useState<{ cat: FeeCategory; newType: 'fixed' | 'variable' } | null>(null)

  const [structHistCatId, setStructHistCatId]   = useState<number | null>(null)
  const [structHistories, setStructHistories]   = useState<Record<number, StructureHistoryRow[]>>({})
  const [structHistLoading, setStructHistLoading] = useState(false)
  const [structHistError, setStructHistError]   = useState('')
  // Variable fees have no per-grade amount to track structurally (amounts are
  // set per-student via applicability/the variable-fee grid) — structure-history
  // genuinely doesn't apply to them, unlike fixed fees. category-changelog (category-
  // level field changes: type switches, active toggles, name/description edits)
  // is the closest real equivalent, so a variable fee's History button reads from
  // this instead of always showing an empty structure-history result.
  const [catChangelogId, setCatChangelogId]     = useState<number | null>(null)
  const [catChangelogs, setCatChangelogs]       = useState<Record<number, CategoryChangeRow[]>>({})
  const [catChangelogLoading, setCatChangelogLoading] = useState(false)
  const [catChangelogError, setCatChangelogError] = useState('')

  // Load the school's UPI ID once, the first time Fee Plan opens — this
  // component only mounts starting from that first visit (lazy-mount-once,
  // same as every other extracted tab), so no activeTab gate is needed here.
  useEffect(() => {
    if (!upiLoaded) {
      fetch(`/api/fees/upi-id?school_id=${schoolId}`)
        .then(r => r.ok ? r.json() : { upi_id: '', locked: false })
        .then(d => { setUpiId(d.upi_id || ''); setUpiLocked(!!d.locked); setUpiLoaded(true) })
        .catch(() => setUpiLoaded(true))
    }
  }, [upiLoaded, schoolId])

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
    onStatsChanged(); onSetupChanged()
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
    onStatsChanged(); onSetupChanged()
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
      onSetupChanged()
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
    const structs: { fee_category_id: number; grade: string; amount: number }[] = []
    const changedGrades: string[] = []
    for (const grade of GRADES) {
      const val = editAmounts[`${cat.id}_${grade}`]
      if (val && parseFloat(val) > 0) {
        const amount = parseFloat(val)
        structs.push({ fee_category_id: cat.id, grade, amount })
        const existing = structures.find(s => s.fee_category_id === cat.id && s.grade === grade)
        if (existing && Number(existing.amount) !== amount) changedGrades.push(grade)
      }
    }
    if (changedGrades.length === 0) {
      await doSaveFeeAmounts(cat, structs)
      return
    }
    // Some of these grades already have a saved amount that's being changed —
    // check how many students are already billed under the old amount before
    // committing (reuses the same per-grade impact count the Amend flow computes).
    setCheckingImpact(true); setStructureMsg('')
    try {
      const results = await Promise.all(changedGrades.map(async grade => {
        const r = await fetch(`/api/fees/structures/amend?school_id=${schoolId}&academic_year=${academicYear}&preview=1&fee_category_id=${cat.id}&grade=${grade}`)
        const d = r.ok ? await r.json() : { count: 0, partial_count: 0 }
        return { grade, count: (d.count || 0) + (d.partial_count || 0) }
      }))
      const totalAffected = results.reduce((s, r) => s + r.count, 0)
      if (totalAffected > 0) {
        setPendingAmountWarning({ cat, structs, totalAffected, byGrade: results.filter(r => r.count > 0) })
      } else {
        await doSaveFeeAmounts(cat, structs)
      }
    } catch {
      // The impact check is a safety net, not a hard gate — if it fails, save
      // rather than silently blocking the admin with no way to proceed.
      await doSaveFeeAmounts(cat, structs)
    } finally {
      setCheckingImpact(false)
    }
  }

  async function doSaveFeeAmounts(cat: FeeCategory, structs: { fee_category_id: number; grade: string; amount: number }[]) {
    setSavingStructure(true); setStructureMsg('')
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
    setPendingAmountWarning(null)
    onSetupChanged()
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
    if (r.ok) onSetupChanged()
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
    else onSetupChanged()
    setLockingStructure(false)
  }

  // ── Applicability ────────────────────────────────────────────────────────
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
      onStatsChanged()
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
      onStatsChanged()
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
    setCatChangelogId(catId); setCatChangelogLoading(true); setCatChangelogError('')
    if (!catChangelogs[catId]) {
      try {
        const r = await fetch(`/api/fees/category-changelog?school_id=${schoolId}&category_id=${catId}`)
        if (r.ok) { const rows = await r.json(); setCatChangelogs(p => ({ ...p, [catId]: rows })) }
        else setCatChangelogError('Could not load change history')
      } catch { setCatChangelogError('Network error') }
    }
    setCatChangelogLoading(false)
  }

  return (
    <>
        <div className="space-y-5">

          <LoadErrorBanner message={setupError} onRetry={onRetrySetup} testId="btn-load-error-retry-setup" />

          {setupLoading && (
            <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Loading fee setup</span>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <Skeleton className="mb-4 h-4 w-48" />
                <div className="flex items-center gap-2">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 flex-1" />)}
                </div>
              </div>
              {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
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
                        <span className={`text-xs font-medium hidden sm:inline ${s.done ? 'text-green-700' : 'text-gray-500'}`}>{s.label}</span>
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
                    <input data-testid="input-upi-unlock-password" type="password" value={upiUnlockPassword}
                      onChange={e => { setUpiUnlockPassword(e.target.value); setUpiUnlockError('') }}
                      onKeyDown={e => { if (e.key === 'Enter' && upiUnlockPassword) verifyUpiUnlock() }}
                      placeholder="Your account password"
                      autoFocus
                      className="flex-1 min-w-40 border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    <button data-testid="btn-upi-unlock-confirm" onClick={verifyUpiUnlock} disabled={upiUnlocking || !upiUnlockPassword}
                      className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
                      {upiUnlocking ? 'Verifying…' : 'Unlock'}
                    </button>
                    <button data-testid="btn-upi-unlock-cancel" onClick={cancelUpiUnlock}
                      className="text-sm text-gray-500 px-3 py-2 rounded-lg hover:bg-gray-100">
                      Cancel
                    </button>
                  </div>
                  {upiUnlockError && <p className="text-xs text-red-600">{upiUnlockError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-56">
                    <input data-testid="input-upi-id" type="text" value={upiId}
                      onChange={e => { setUpiId(e.target.value); setUpiMsg('') }}
                      placeholder="e.g. school@okhdfcbank"
                      readOnly={upiLocked}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${upiLocked ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed' : 'border-gray-200 focus:ring-2 focus:ring-blue-500'}`} />
                  </div>
                  {upiLocked ? (
                    <button data-testid="btn-upi-id-unlock-to-edit" onClick={() => setUpiShowUnlock(true)}
                      className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200">
                      Unlock to Edit
                    </button>
                  ) : (
                    <button data-testid="btn-upi-id-save" onClick={saveUpiId} disabled={upiSaving}
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
                      <button
                        data-testid={`btn-fee-history-${cat.id}`}
                        onClick={() => cat.category_type === 'variable' ? loadCatChangelog(cat.id) : loadStructHistory(cat.id)}
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

                    {/* Structure history inline — fixed fees only (per-grade amounts) */}
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

                    {/* Category changelog inline — variable fees (no per-grade amount to
                        track; this shows category-level changes like type/active/name
                        instead). Per-student amount changes live on each student's own
                        Passbook, not here — there's no single "history" for a category
                        whose amounts are set per student. */}
                    {catChangelogId === cat.id && (
                      <div className="mt-3 bg-indigo-50 rounded-lg p-2 text-[10px] max-h-40 overflow-y-auto">
                        <p className="font-semibold text-indigo-700 mb-1 uppercase tracking-wide">Change History</p>
                        {catChangelogLoading ? <p className="text-indigo-400">Loading…</p> :
                          catChangelogError ? <p className="text-red-500 text-[10px]">{catChangelogError}</p> :
                          !(catChangelogs[cat.id]?.length) ? <p className="text-gray-400 italic">No changes recorded yet.</p> : (
                          <div className="space-y-1">
                            {catChangelogs[cat.id].map(h => (
                              <div key={h.id} className="bg-white rounded px-2 py-1 border border-indigo-100 flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-indigo-600 capitalize">{h.field_changed.replace(/_/g, ' ')}</span>
                                {h.old_value !== null && <><span className="line-through text-gray-400">{h.old_value}</span><span className="text-gray-300">→</span></>}
                                <span className="font-bold text-indigo-800">{h.new_value}</span>
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
                              <button onClick={() => saveFeeAmounts(cat)} disabled={savingStructure || checkingImpact}
                                className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg font-medium disabled:opacity-50">
                                {checkingImpact ? 'Checking…' : savingStructure ? 'Saving…' : 'Save Amounts'}
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

          {/* ── Warn before changing an amount students are already billed at ── */}
          {pendingAmountWarning && (
            <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={() => setPendingAmountWarning(null)}>
              <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-amber-700">⚠ Students already billed at the old amount</p>
                  <button onClick={() => setPendingAmountWarning(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-sm text-gray-600">
                    <strong>{pendingAmountWarning.totalAffected}</strong> student{pendingAmountWarning.totalAffected === 1 ? '' : 's'} already {pendingAmountWarning.totalAffected === 1 ? 'has' : 'have'} a bill for{' '}
                    <strong>{pendingAmountWarning.cat.name}</strong> at the current amount:
                  </p>
                  <ul className="text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 space-y-1">
                    {pendingAmountWarning.byGrade.map(g => (
                      <li key={g.grade}>{gradeLabel(g.grade)}: <strong>{g.count}</strong> student{g.count === 1 ? '' : 's'}</li>
                    ))}
                  </ul>
                  <p className="text-sm text-gray-500">
                    Saving here only changes the fee plan going forward — it will <strong>not</strong> update these students&apos; existing bills.
                    They&apos;ll keep owing the old amount while new bills use the new one, with no note on the ledger explaining the difference.
                  </p>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                  <button onClick={() => setPendingAmountWarning(null)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                    ← Cancel
                  </button>
                  <button data-testid="btn-confirm-amount-change" onClick={() => doSaveFeeAmounts(pendingAmountWarning.cat, pendingAmountWarning.structs)}
                    disabled={savingStructure}
                    className="text-sm bg-amber-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
                    {savingStructure ? 'Saving…' : 'Save anyway'}
                  </button>
                </div>
              </div>
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
    </>
  )
}
