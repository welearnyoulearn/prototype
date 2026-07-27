'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getBoardLabels } from '@/lib/board-syllabus/data'
import { ALL_FEATURES, CATEGORY_ORDER } from '@/lib/features'
import { useFeature } from '@/lib/features-context'

// ── Types ─────────────────────────────────────────────────────────────────────

type SchoolData = {
  id: number; name: string; type: string; city: string; country: string
  phone: string; email: string; address: string
  school_code: string; grading_scheme: GradeRow[]; board?: string
  logo_url?: string | null; receipt_header_blocks?: ReceiptHeaderBlock[]
  logo_align?: 'left' | 'center' | 'right' | null
}

type GradeRow = { grade: string; min: number; max: number }

type ReceiptHeaderBlock = {
  text: string
  size: 'sm' | 'md' | 'lg' | 'xl'
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
}

const EMPTY_HEADER_BLOCK: ReceiptHeaderBlock = { text: '', size: 'md', bold: false, italic: false, align: 'center' }
const HEADER_BLOCK_SIZE_PX: Record<ReceiptHeaderBlock['size'], number> = { sm: 11, md: 14, lg: 18, xl: 24 }

type AcademicYear = {
  id: number; label: string; start_date: string; end_date: string
  is_current: boolean; student_snapshot_count: number
}

type StaffAccount = {
  id: number; full_name: string; email: string; role: string
  status: string; first_login: boolean; created_at: string
}

type Subscription = {
  tier: 'basic' | 'standard' | 'premium' | 'none'
  staff_limit?: number | null
  updated_at?: string
}

type SettingsTab = 'profile' | 'academic-years' | 'plan' | 'staff' | 'security' | 'danger'

// ── Constants ─────────────────────────────────────────────────────────────────

const BOARDS = getBoardLabels()

const DEFAULT_GRADING: GradeRow[] = [
  { grade: 'A+', min: 90, max: 100 },
  { grade: 'A',  min: 80, max: 89  },
  { grade: 'B+', min: 70, max: 79  },
  { grade: 'B',  min: 60, max: 69  },
  { grade: 'C',  min: 50, max: 59  },
  { grade: 'D',  min: 35, max: 49  },
  { grade: 'F',  min: 0,  max: 34  },
]

const ROLE_LABELS: Record<string, string> = {
  school_admin: 'School Admin', principal: 'Principal', vice_principal: 'Vice Principal',
}
const ROLE_COLORS: Record<string, string> = {
  school_admin: 'bg-blue-100 text-blue-700',
  principal: 'bg-purple-100 text-purple-700',
  vice_principal: 'bg-indigo-100 text-indigo-700',
}

const TIER_COLORS: Record<string, string> = {
  basic: 'bg-green-100 text-green-700 border-green-200',
  standard: 'bg-blue-100 text-blue-700 border-blue-200',
  premium: 'bg-purple-100 text-purple-700 border-purple-200',
  none: 'bg-gray-100 text-gray-500 border-gray-200',
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function suggestNextYear(years: AcademicYear[]): { label: string; start_date: string; end_date: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (years.length === 0) {
    // Default: June 12 → April 24 of next year
    const sy = new Date().getFullYear()
    const ey = sy + 1
    return { label: `${sy}-${String(ey).slice(2)}`, start_date: `${sy}-06-12`, end_date: `${ey}-04-24` }
  }
  // Suggest next year after the latest existing one
  const latest = years.reduce((a, b) => (a.end_date > b.end_date ? a : b))
  const [ey, em, ed] = latest.end_date.split('-').map(Number)
  const nextStart = new Date(ey, em - 1, ed + 1)
  const sy = nextStart.getFullYear()
  const ey2 = sy + 1
  return {
    label: `${sy}-${String(ey2).slice(2)}`,
    start_date: `${sy}-${pad(nextStart.getMonth() + 1)}-${pad(nextStart.getDate())}`,
    end_date: `${ey2}-04-24`,
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SchoolSettings({ schoolId }: { schoolId: number }) {
  const router = useRouter()
  const [tab, setTab] = useState<SettingsTab>('profile')

  // ── School profile ─────────────────────────────────────────────────────────
  const [data, setData]     = useState<SchoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [profile, setProfile] = useState({
    name: '', type: '', city: '', country: '', phone: '', email: '',
    address: '', board: '',
  })
  const [scheme, setScheme] = useState<GradeRow[]>(DEFAULT_GRADING)
  const [logoUrl, setLogoUrl] = useState('')
  const [logoAlign, setLogoAlign] = useState<'left' | 'center' | 'right'>('center')
  const [headerBlocks, setHeaderBlocks] = useState<ReceiptHeaderBlock[]>([])
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState('')
  const logoFileInputRef = useRef<HTMLInputElement>(null)

  // ── Academic years ─────────────────────────────────────────────────────────
  const [years, setYears]         = useState<AcademicYear[]>([])
  const [yearsLoading, setYearsLoading] = useState(false)
  const [yearsMsg, setYearsMsg]   = useState<{ text: string; ok: boolean } | null>(null)
  const [showAddYear, setShowAddYear] = useState(false)
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null)
  const [yearForm, setYearForm]   = useState({ label: '', start_date: '', end_date: '', set_current: false })
  const [yearSaving, setYearSaving] = useState(false)
  const [switchingYear, setSwitchingYear] = useState<number | null>(null)

  // Edit confirmation: warning + password, shown before PUT when bills exist for the year
  const [yearConfirm, setYearConfirm] = useState<{
    impact: { will_become_overdue: number; will_revert_to_pending: number; has_bills: boolean }
  } | null>(null)
  const [yearConfirmPassword, setYearConfirmPassword] = useState('')
  const [yearConfirmError, setYearConfirmError] = useState('')
  const [yearConfirmSaving, setYearConfirmSaving] = useState(false)

  // Read-only history of past date edits, per year
  type YearSnapshot = {
    id: number; old_start_date: string; old_end_date: string
    new_start_date: string; new_end_date: string
    status_summary: Record<string, number>; bill_count: number
    changed_by: string; changed_at: string
  }
  const [historyYearId, setHistoryYearId] = useState<number | null>(null)
  const [historySnapshots, setHistorySnapshots] = useState<YearSnapshot[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyRequestIdRef = useRef(0) // guards against a stale History fetch overwriting a newer one
  const impactAbortRef = useRef<AbortController | null>(null)
  const saveAbortRef   = useRef<AbortController | null>(null)

  // ── Plan & features ────────────────────────────────────────────────────────
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set())
  const [planLoading, setPlanLoading] = useState(false)

  // ── Staff ──────────────────────────────────────────────────────────────────
  const [staffList, setStaffList]   = useState<StaffAccount[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffForm, setStaffForm]   = useState({ full_name: '', email: '', role: 'principal' })
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffError, setStaffError] = useState('')
  const [staffSuccess, setStaffSuccess] = useState('')
  const [resendingId, setResendingId] = useState<number | null>(null)
  const [resendMsg, setResendMsg]   = useState<{ id: number; text: string; ok: boolean } | null>(null)

  // ── Security ───────────────────────────────────────────────────────────────
  const [curPwd, setCurPwd]         = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving]   = useState(false)
  const [pwdMsg, setPwdMsg]         = useState<{ text: string; ok: boolean } | null>(null)

  // ── Danger zone ────────────────────────────────────────────────────────────
  const [exportSending, setExportSending] = useState(false)
  const [closureSending, setClosureSending] = useState(false)
  const [closureReason, setClosureReason] = useState('')
  const [dangerMsg, setDangerMsg]   = useState<{ text: string; ok: boolean } | null>(null)

  // ── Load functions ─────────────────────────────────────────────────────────

  async function loadSchool() {
    setLoading(true)
    try {
      const r = await fetch(`/api/schools/${schoolId}`)
      if (!r.ok) throw new Error()
      const d: SchoolData = await r.json()
      setData(d)
      setProfile({
        name: d.name ?? '', type: d.type ?? '', city: d.city ?? '',
        country: d.country ?? '', phone: d.phone ?? '', email: d.email ?? '',
        address: d.address ?? '',
        board: d.board ?? '',
      })
      if (d.grading_scheme?.length) setScheme(d.grading_scheme)
      setLogoUrl(d.logo_url ?? '')
      setLogoAlign(d.logo_align ?? 'center')
      setHeaderBlocks(d.receipt_header_blocks?.length ? d.receipt_header_blocks : [])
    } finally { setLoading(false) }
  }

  const loadYears = useCallback(async () => {
    setYearsLoading(true)
    try {
      const r = await fetch(`/api/academic-years?school_id=${schoolId}`)
      if (r.ok) setYears(await r.json())
    } finally { setYearsLoading(false) }
  }, [schoolId])

  const loadPlan = useCallback(async () => {
    setPlanLoading(true)
    try {
      const subR = await fetch(`/api/schools/${schoolId}/subscription`)
      if (subR.ok) {
        const sub: Subscription = await subR.json()
        setSubscription(sub)
        if (sub.tier !== 'none') {
          const featR = await fetch(`/api/platform/features?tier=${sub.tier}`)
          if (featR.ok) {
            const fd = await featR.json()
            setEnabledFeatures(new Set(fd.enabled || []))
          }
        }
      }
    } finally { setPlanLoading(false) }
  }, [schoolId])

  const loadStaff = useCallback(async () => {
    setStaffLoading(true)
    try {
      const r = await fetch(`/api/school-admin/staff-accounts?school_id=${schoolId}`)
      if (r.ok) setStaffList(await r.json())
    } finally { setStaffLoading(false) }
  }, [schoolId])

  useEffect(() => { loadSchool() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'academic-years') loadYears() }, [tab, loadYears])
  useEffect(() => { if (tab === 'plan') loadPlan() }, [tab, loadPlan])
  useEffect(() => { if (tab === 'staff') loadStaff() }, [tab, loadStaff])

  // ── Profile save ───────────────────────────────────────────────────────────

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const r = await fetch(`/api/schools/${schoolId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile, board: profile.board || null,
          logo_url: logoUrl || null,
          logo_align: logoAlign,
          receipt_header_blocks: headerBlocks.filter(b => b.text.trim()),
        }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleLogoFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoUploadError('')

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setLogoUploadError('Logo must be a JPG or PNG image')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoUploadError('Logo must be under 2MB')
      return
    }

    setLogoUploading(true)
    try {
      const signRes = await fetch('/api/upload/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'school-logos', public_id: `school-${schoolId}` }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData?.error || 'Failed to get upload signature')
      const { signature, timestamp, cloud_name, api_key, folder, public_id } = signData

      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', api_key)
      formData.append('timestamp', String(timestamp))
      formData.append('signature', signature)
      formData.append('folder', folder)
      formData.append('public_id', public_id)

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
        method: 'POST', body: formData,
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData?.error?.message || 'Upload failed')
      setLogoUrl(uploadData.secure_url)
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : 'Logo upload failed. Try again.')
    } finally {
      setLogoUploading(false)
    }
  }

  async function saveGrading(e: React.FormEvent) {
    e.preventDefault()
    for (let i = 0; i < scheme.length; i++) {
      if (scheme[i].min > scheme[i].max) { setError(`Row ${i + 1}: min must be ≤ max`); return }
    }
    setSaving(true); setError(''); setSaved(false)
    try {
      const r = await fetch(`/api/schools/${schoolId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grading_scheme: scheme }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save grading scheme')
    } finally { setSaving(false) }
  }

  // ── Academic year actions ──────────────────────────────────────────────────

  function openAddYear() {
    const suggestion = suggestNextYear(years)
    setYearForm({ ...suggestion, set_current: years.length === 0 })
    setEditingYear(null)
    setShowAddYear(true)
    setYearsMsg(null)
    // Discard any pending edit-confirmation state from a previous, different year.
    impactAbortRef.current?.abort()
    setYearConfirm(null); setYearConfirmPassword(''); setYearConfirmError('')
  }

  function openEditYear(y: AcademicYear) {
    setEditingYear(y)
    setYearForm({ label: y.label, start_date: y.start_date, end_date: y.end_date, set_current: y.is_current })
    setShowAddYear(false)
    setYearsMsg(null)
    // Discard any pending edit-confirmation state from a previous, different year —
    // otherwise a stale impact-check response for the old year could pop the
    // confirmation modal up against this new year (see gap analysis #7).
    impactAbortRef.current?.abort()
    setYearConfirm(null); setYearConfirmPassword(''); setYearConfirmError('')
  }

  function cancelEditYear() {
    impactAbortRef.current?.abort()
    saveAbortRef.current?.abort()
    setEditingYear(null); setYearsMsg(null)
    setYearConfirm(null); setYearConfirmPassword(''); setYearConfirmError('')
    setYearSaving(false); setYearConfirmSaving(false)
  }

  async function saveYear() {
    if (!yearForm.label.trim() || !yearForm.start_date || !yearForm.end_date) {
      setYearsMsg({ text: 'Label, start date and end date are required', ok: false }); return
    }
    if (yearForm.start_date >= yearForm.end_date) {
      setYearsMsg({ text: 'Start date must be before end date', ok: false }); return
    }

    if (editingYear) {
      // No-op edit (nothing actually changed) — skip the impact-check/password flow entirely.
      if (yearForm.label === editingYear.label
        && yearForm.start_date === editingYear.start_date
        && yearForm.end_date === editingYear.end_date) {
        setYearsMsg({ text: 'No changes to save', ok: true })
        setEditingYear(null)
        return
      }

      // Editing dates on an existing year — check impact, then require password confirmation.
      const controller = new AbortController()
      impactAbortRef.current = controller
      setYearSaving(true); setYearsMsg(null)
      try {
        const r = await fetch(
          `/api/academic-years?id=${editingYear.id}&school_id=${schoolId}&impact=1&new_end_date=${yearForm.end_date}`,
          { signal: controller.signal }
        )
        if (!r.ok) {
          setYearsMsg({ text: 'Could not check the impact of this change — please try again', ok: false })
          return
        }
        const impact = await r.json()
        setYearConfirmPassword(''); setYearConfirmError('')
        setYearConfirm({ impact })
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return // cancelled — no error message needed
        setYearsMsg({ text: 'Could not check the impact of this change — please try again', ok: false })
      } finally { setYearSaving(false) }
      return
    }

    setYearSaving(true); setYearsMsg(null)
    try {
      const r = await fetch('/api/academic-years', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, ...yearForm }),
      })
      const d = await r.json()
      if (!r.ok) { setYearsMsg({ text: d.error || 'Failed', ok: false }); return }
      setYearsMsg({ text: `✓ Academic year "${d.label}" created`, ok: true })
      setShowAddYear(false)
      setEditingYear(null)
      loadYears()
    } catch {
      setYearsMsg({ text: 'Failed to create academic year — please try again', ok: false })
    } finally { setYearSaving(false) }
  }

  async function confirmSaveYear() {
    if (!editingYear) return
    if (!yearConfirmPassword) { setYearConfirmError('Password is required'); return }
    const controller = new AbortController()
    saveAbortRef.current = controller
    setYearConfirmSaving(true); setYearConfirmError('')
    try {
      const r = await fetch(`/api/academic-years?id=${editingYear.id}&school_id=${schoolId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: yearForm.label, start_date: yearForm.start_date, end_date: yearForm.end_date,
          password: yearConfirmPassword,
        }),
        signal: controller.signal,
      })
      const d = await r.json().catch(() => null)
      if (!d) { setYearConfirmError('Something went wrong — please try again'); return }
      if (!r.ok) { setYearConfirmError(d.error || 'Failed to save changes'); return }
      setYearConfirm(null); setYearConfirmPassword('')
      setEditingYear(null)
      setYearsMsg({
        text: d.snapshot_created
          ? `✓ "${d.year.label}" updated — previous dates saved to History`
          : `✓ "${d.year.label}" updated`,
        ok: true,
      })
      loadYears()
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return // cancelled — no error message needed
      setYearConfirmError('Something went wrong — please try again')
    } finally { setYearConfirmSaving(false) }
  }

  async function loadYearHistory(yearId: number) {
    if (historyYearId === yearId) { setHistoryYearId(null); return } // toggle closed
    historyRequestIdRef.current += 1
    const requestId = historyRequestIdRef.current
    setHistoryYearId(yearId); setHistoryLoading(true); setHistorySnapshots([])
    try {
      const r = await fetch(`/api/academic-years/${yearId}/history?school_id=${schoolId}`)
      if (r.ok && historyRequestIdRef.current === requestId) setHistorySnapshots(await r.json())
    } finally {
      if (historyRequestIdRef.current === requestId) setHistoryLoading(false)
    }
  }

  async function switchYear(id: number, label: string) {
    if (!confirm(`Set "${label}" as the active academic year? All fee, attendance and exam data will show this year by default.`)) return
    setSwitchingYear(id); setYearsMsg(null)
    try {
      const r = await fetch(`/api/academic-years?id=${id}&school_id=${schoolId}`, { method: 'PATCH' })
      if (r.ok) { setYearsMsg({ text: `✓ Active year switched to "${label}"`, ok: true }); loadYears() }
      else setYearsMsg({ text: 'Failed to switch year', ok: false })
    } finally { setSwitchingYear(null) }
  }

  // ── Staff actions ──────────────────────────────────────────────────────────

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!staffForm.full_name.trim() || !staffForm.email.trim()) {
      setStaffError('Name and email are required'); return
    }
    setStaffSaving(true); setStaffError(''); setStaffSuccess('')
    const res = await fetch('/api/school-admin/staff-accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...staffForm, school_id: schoolId }),
    })
    const d = await res.json()
    if (!res.ok) { setStaffError(d.error || 'Failed'); setStaffSaving(false); return }
    setStaffList(prev => [...prev, d])
    setStaffForm({ full_name: '', email: '', role: 'principal' })
    setStaffSuccess(`✓ Account created — login credentials sent to ${d.email}`)
    setStaffSaving(false)
  }

  async function deactivateStaff(id: number) {
    if (!confirm('Deactivate this account? They will lose access immediately.')) return
    await fetch('/api/school-admin/staff-accounts', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, status: 'inactive' } : s))
  }

  async function reactivateStaff(id: number) {
    await fetch('/api/school-admin/staff-accounts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, status: 'active' } : s))
  }

  async function resendCredentials(id: number) {
    setResendingId(id); setResendMsg(null)
    try {
      const r = await fetch('/api/school-admin/staff-accounts/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const d = await r.json()
      if (r.ok) setResendMsg({ id, text: '✓ New credentials sent by email', ok: true })
      else setResendMsg({ id, text: d.error || 'Failed to resend', ok: false })
    } finally { setResendingId(null) }
  }

  // ── Security actions ───────────────────────────────────────────────────────

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPwd !== confirmPwd) { setPwdMsg({ text: 'Passwords do not match', ok: false }); return }
    if (newPwd.length < 8) { setPwdMsg({ text: 'Password must be at least 8 characters', ok: false }); return }
    setPwdSaving(true); setPwdMsg(null)
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      })
      const d = await r.json()
      if (r.ok) {
        setPwdMsg({ text: '✓ Password changed — logging you out…', ok: true })
        setTimeout(async () => {
          await fetch('/api/auth/logout', { method: 'POST' })
          router.push('/login')
        }, 1500)
      } else {
        setPwdMsg({ text: d.error || 'Failed to change password', ok: false })
      }
    } finally { setPwdSaving(false) }
  }

  // ── Danger zone actions ────────────────────────────────────────────────────

  async function sendAccountRequest(type: 'export' | 'closure') {
    if (type === 'closure' && !closureReason.trim()) {
      setDangerMsg({ text: 'Please provide a reason for closure', ok: false }); return
    }
    const setter = type === 'export' ? setExportSending : setClosureSending
    setter(true); setDangerMsg(null)
    try {
      const r = await fetch('/api/school-admin/account-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, reason: closureReason, school_id: schoolId }),
      })
      const d = await r.json()
      if (r.ok) {
        setDangerMsg({
          text: type === 'export'
            ? '✓ Data export request sent — our team will contact you within 2 business days'
            : '✓ Closure request sent — our team will review and contact you',
          ok: true,
        })
        if (type === 'closure') setClosureReason('')
      } else {
        setDangerMsg({ text: d.error || 'Failed to send request', ok: false })
      }
    } finally { setter(false) }
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  function resetTabState() {
    setError(''); setSaved(false)
    setStaffError(''); setStaffSuccess('')
    setPwdMsg(null); setDangerMsg(null); setYearsMsg(null); setResendMsg(null)
  }

  const pwdChecks = [
    { label: 'At least 8 characters', ok: newPwd.length >= 8 },
    { label: 'One uppercase letter',  ok: /[A-Z]/.test(newPwd) },
    { label: 'One number',            ok: /\d/.test(newPwd) },
  ]

  // ── Tab config ─────────────────────────────────────────────────────────────

  const TABS: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'profile',        label: 'School Profile',   icon: '🏫' },
    { key: 'academic-years', label: 'Academic Years',   icon: '📅' },
    { key: 'plan',           label: 'Plan & Features',  icon: '⭐' },
    { key: 'staff',          label: 'Staff Accounts',   icon: '👥' },
    { key: 'security',       label: 'Security',         icon: '🔒' },
    { key: 'danger',         label: 'Danger Zone',      icon: '⚠️' },
  ]

  const hasExamSchedule = useFeature('exam-schedule')

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading settings…</div>

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">School Profile</h2>
        <p className="text-sm text-gray-400 mt-0.5">Manage your school profile, academic years, plan and security</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(({ key, label, icon }) => (
          <button key={key}
            onClick={() => { setTab(key); resetTabState() }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            } ${key === 'danger' && tab !== 'danger' ? 'hover:text-red-500' : ''}`}>
            <span className="text-xs">{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* Global status banner */}
      {(saved || error) && (
        <div className={`px-4 py-3 rounded-xl text-sm border ${saved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
          {saved ? '✓ Settings saved successfully' : error}
        </div>
      )}

      {/* ══ PROFILE TAB ═══════════════════════════════════════════════════════ */}
      {tab === 'profile' && (
        <div className="space-y-4">
          <form onSubmit={saveProfile} className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-5">

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">School Name *</label>
                <input required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={profile.name} onChange={e => setProfile(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">School Type</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={profile.type} onChange={e => setProfile(f => ({ ...f, type: e.target.value }))}>
                  <option value="">Select type…</option>
                  {['Private','Government','Government-Aided','International','CBSE','ICSE','State Board'].map(t => (
                    <option key={t} value={t.toLowerCase()}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">City</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={profile.city} onChange={e => setProfile(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Country</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={profile.country} onChange={e => setProfile(f => ({ ...f, country: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Contact Phone</label>
                <input type="tel" placeholder="+91 99999 99999"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={profile.phone} onChange={e => setProfile(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Official Email</label>
                <input type="email" placeholder="office@school.edu"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={profile.email} onChange={e => setProfile(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Address</label>
              <textarea rows={2} placeholder="Full address…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                value={profile.address} onChange={e => setProfile(f => ({ ...f, address: e.target.value }))} />
            </div>

            {/* Board */}
            <div className="border-t border-gray-100 pt-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Curriculum Board</h3>
                <p className="text-xs text-gray-400 mt-0.5">Used for syllabus management and curriculum planning</p>
              </div>
              <div className="max-w-xs">
                <select value={profile.board} onChange={e => setProfile(f => ({ ...f, board: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Select Board —</option>
                  {BOARDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
            </div>

            {/* Grading scheme — only when exam-schedule feature is enabled */}
            {hasExamSchedule && (
              <div className="border-t border-gray-100 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">Grading Scheme</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Used for exam results and report cards</p>
                  </div>
                  <button type="button" onClick={() => setScheme(DEFAULT_GRADING)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg">
                    Reset to Default
                  </button>
                </div>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-100">
                    {['Grade Label','Min %','Max %',''].map(h => (
                      <div key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500">{h}</div>
                    ))}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {scheme.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-4 items-center px-4 py-2 gap-2">
                        <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 w-20"
                          value={row.grade} maxLength={4} placeholder="A+"
                          onChange={e => setScheme(prev => prev.map((r, i) => i === idx ? { ...r, grade: e.target.value } : r))} />
                        <input type="number" min={0} max={100}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 w-24"
                          value={row.min} onChange={e => setScheme(prev => prev.map((r, i) => i === idx ? { ...r, min: Number(e.target.value) } : r))} />
                        <input type="number" min={0} max={100}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 w-24"
                          value={row.max} onChange={e => setScheme(prev => prev.map((r, i) => i === idx ? { ...r, max: Number(e.target.value) } : r))} />
                        <button type="button" onClick={() => setScheme(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 text-xs justify-self-start">Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => setScheme(prev => [...prev, { grade: '', min: 0, max: 0 }])}
                  className="text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-4 py-2 rounded-lg">
                  + Add Grade
                </button>
              </div>
            )}

            {/* Receipt Branding — logo + styled header lines shown on printed fee receipts */}
            <div className="border-t border-gray-100 pt-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Receipt Branding</h3>
                <p className="text-xs text-gray-400 mt-0.5">Shown on the header of printed fee receipts</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Logo</label>
                <div className="flex items-center gap-3">
                  {logoUrl && (
                    <img src={logoUrl} alt="School logo" className="h-12 w-12 object-contain border border-gray-200 rounded-lg p-1" />
                  )}
                  <button type="button" data-testid="btn-upload-logo" disabled={logoUploading}
                    onClick={() => logoFileInputRef.current?.click()}
                    className="text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-4 py-2 rounded-lg disabled:opacity-50">
                    {logoUploading ? 'Uploading…' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
                  </button>
                  {logoUrl && !logoUploading && (
                    <button type="button" data-testid="btn-remove-logo" onClick={() => setLogoUrl('')}
                      className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  )}
                  <input ref={logoFileInputRef} type="file" accept="image/jpeg,image/png" data-testid="input-logo-file"
                    className="hidden" onChange={handleLogoFileSelect} />
                </div>
                <p className="text-xs text-gray-400 mt-1">JPG or PNG, up to 2MB</p>
                {logoUploadError && <p className="text-xs text-red-500 mt-1">{logoUploadError}</p>}

                {logoUrl && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Logo Position</label>
                    <div className="flex gap-2">
                      {(['left', 'center', 'right'] as const).map(a => (
                        <button key={a} type="button" data-testid={`btn-logo-align-${a}`}
                          onClick={() => setLogoAlign(a)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border capitalize ${logoAlign === a ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {headerBlocks.map((b, idx) => (
                  <div key={idx} className="flex items-center gap-2 border border-gray-200 rounded-lg p-2">
                    <input placeholder="e.g. Affiliated to CBSE · Estd. 1998" data-testid={`input-header-block-text-${idx}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={b.text} maxLength={200}
                      onChange={e => setHeaderBlocks(prev => prev.map((r, i) => i === idx ? { ...r, text: e.target.value } : r))} />
                    <select data-testid={`select-header-block-size-${idx}`}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={b.size}
                      onChange={e => setHeaderBlocks(prev => prev.map((r, i) => i === idx ? { ...r, size: e.target.value as ReceiptHeaderBlock['size'] } : r))}>
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                      <option value="lg">Large</option>
                      <option value="xl">X-Large</option>
                    </select>
                    <select data-testid={`select-header-block-align-${idx}`}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={b.align}
                      onChange={e => setHeaderBlocks(prev => prev.map((r, i) => i === idx ? { ...r, align: e.target.value as ReceiptHeaderBlock['align'] } : r))}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                    <button type="button" data-testid={`btn-header-block-bold-${idx}`}
                      onClick={() => setHeaderBlocks(prev => prev.map((r, i) => i === idx ? { ...r, bold: !r.bold } : r))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${b.bold ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500'}`}>B</button>
                    <button type="button" data-testid={`btn-header-block-italic-${idx}`}
                      onClick={() => setHeaderBlocks(prev => prev.map((r, i) => i === idx ? { ...r, italic: !r.italic } : r))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs italic border ${b.italic ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500'}`}>I</button>
                    <button type="button" data-testid={`btn-header-block-remove-${idx}`}
                      onClick={() => setHeaderBlocks(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                  </div>
                ))}
              </div>
              <button type="button" data-testid="btn-add-header-block"
                disabled={headerBlocks.length >= 6}
                onClick={() => setHeaderBlocks(prev => [...prev, { ...EMPTY_HEADER_BLOCK }])}
                className="text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                + Add Line{headerBlocks.length >= 6 ? ' (max 6)' : ''}
              </button>

              {/* Live preview — mirrors exactly what prints at the top of a fee receipt */}
              <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-400 mb-2">Receipt Preview</p>
                <div className="bg-white border border-gray-200 rounded-lg p-5 max-w-md mx-auto" data-testid="receipt-header-preview">
                  <div className="border-b-2 border-gray-800 pb-2 mb-3">
                    {logoUrl && logoAlign === 'center' && (
                      <div className="text-center mb-1">
                        <img src={logoUrl} alt="School logo" className="h-14 mx-auto object-contain" />
                      </div>
                    )}
                    <div className="relative">
                      {logoUrl && logoAlign === 'left' && (
                        <img src={logoUrl} alt="School logo" className="h-16 object-contain absolute left-0 top-1/2 -translate-y-1/2" />
                      )}
                      {logoUrl && logoAlign === 'right' && (
                        <img src={logoUrl} alt="School logo" className="h-16 object-contain absolute right-0 top-1/2 -translate-y-1/2" />
                      )}
                      <div className="text-center">
                        <div className="text-lg font-bold">{profile.name || 'School Name'}</div>
                        {headerBlocks.filter(b => b.text.trim()).map((b, idx) => (
                          <div key={idx}
                            style={{
                              fontSize: HEADER_BLOCK_SIZE_PX[b.size], fontWeight: b.bold ? 700 : 400,
                              fontStyle: b.italic ? 'italic' : 'normal', textAlign: b.align,
                            }}>
                            {b.text}
                          </div>
                        ))}
                        <div className="text-xs font-bold tracking-wide mt-1">FEE RECEIPT</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">Receipt No: <strong>RCP-000-0000-000000</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-left mb-2">
                    <div><div className="text-[10px] text-gray-400">Student Name</div><div className="text-xs font-medium">Sample Student</div></div>
                    <div><div className="text-[10px] text-gray-400">Roll Number</div><div className="text-xs font-medium">wlyl-stu-sample-0000</div></div>
                    <div><div className="text-[10px] text-gray-400">Class</div><div className="text-xs font-medium">Grade 1A</div></div>
                    <div><div className="text-[10px] text-gray-400">Parent / Guardian</div><div className="text-xs font-medium">Sample Parent</div></div>
                  </div>
                  <table className="w-full text-xs border-collapse mb-2">
                    <thead><tr className="bg-gray-100"><th className="text-left p-1 border border-gray-200 text-[10px]">Fee Head</th><th className="text-left p-1 border border-gray-200 text-[10px]">Period</th><th className="text-right p-1 border border-gray-200 text-[10px]">Amount</th></tr></thead>
                    <tbody><tr><td className="p-1 border border-gray-200">Tuition Fee</td><td className="p-1 border border-gray-200">2026-27</td><td className="p-1 border border-gray-200 text-right">₹1,200</td></tr></tbody>
                    <tfoot><tr className="font-bold bg-gray-50"><td colSpan={2} className="p-1 border border-gray-200 text-right">Total Paid:</td><td className="p-1 border border-gray-200 text-right">₹1,200</td></tr></tfoot>
                  </table>
                  <div className="flex justify-between mt-4">
                    <div className="text-center border-t border-gray-800 w-28 pt-1 text-[10px] text-gray-500">Collected By</div>
                    <div className="text-center border-t border-gray-800 w-28 pt-1 text-[10px] text-gray-500">Authorized Signatory</div>
                  </div>
                  {!logoUrl && !profile.name && headerBlocks.filter(b => b.text.trim()).length === 0 && (
                    <p className="text-xs text-gray-300 text-center mt-2">No branding set — receipts will show just a generic header</p>
                  )}
                </div>
              </div>
            </div>

            {data?.school_code && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs font-semibold text-blue-600 mb-0.5">School Login Code</p>
                <p className="font-mono text-lg font-bold text-blue-800">{data.school_code}</p>
                <p className="text-xs text-blue-500 mt-1">Teachers and staff use this code to log in</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} data-testid="btn-save-profile"
                className={`px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 ${saved ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Profile & Settings'}
              </button>
              <button type="button" onClick={() => { saveGrading(new Event('submit') as unknown as React.FormEvent) }}
                className="hidden" />
            </div>
          </form>
        </div>
      )}

      {/* ══ ACADEMIC YEARS TAB ════════════════════════════════════════════════ */}
      {tab === 'academic-years' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Academic Years</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                All fees, attendance, exams and reports are scoped to the active year
              </p>
            </div>
            {!showAddYear && !editingYear && (
              <button onClick={openAddYear}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                + Add Year
              </button>
            )}
          </div>

          {yearsMsg && (
            <div className={`px-4 py-3 rounded-xl text-sm border ${yearsMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
              {yearsMsg.text}
            </div>
          )}

          {/* Add year form */}
          {showAddYear && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-indigo-800">New Academic Year</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label *</label>
                  <input value={yearForm.label} onChange={e => setYearForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="e.g. 2025-26"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                  <input type="date" value={yearForm.start_date} onChange={e => setYearForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Date *</label>
                  <input type="date" value={yearForm.end_date} onChange={e => setYearForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={yearForm.set_current}
                  onChange={e => setYearForm(f => ({ ...f, set_current: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600" />
                <span className="text-sm text-gray-700">Set as active year immediately</span>
              </label>
              <div className="flex gap-2">
                <button onClick={saveYear} disabled={yearSaving}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {yearSaving ? 'Creating…' : 'Create Academic Year'}
                </button>
                <button onClick={() => { setShowAddYear(false); setYearsMsg(null) }}
                  className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Edit year form */}
          {editingYear && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-amber-800">Edit — {editingYear.label}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <input value={yearForm.label} disabled
                    title="Label can't be changed once a year is in use — create a new year instead"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                  <input type="date" value={yearForm.start_date} onChange={e => setYearForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                  <input type="date" value={yearForm.end_date} onChange={e => setYearForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveYear} disabled={yearSaving}
                  className="px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {yearSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={cancelEditYear}
                  className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Years list */}
          {yearsLoading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : years.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl py-12 text-center">
              <p className="text-gray-400 font-medium">No academic years set up</p>
              <p className="text-gray-300 text-sm mt-1">Add your first academic year to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {years.map(y => (
                <div key={y.id} className={`bg-white border rounded-xl overflow-hidden ${y.is_current ? 'border-indigo-300 shadow-sm shadow-indigo-100' : 'border-gray-100'}`}>
                  <div className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-800">{y.label}</p>
                        {y.is_current && (
                          <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">ACTIVE</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(y.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' → '}
                        {new Date(y.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {y.student_snapshot_count > 0 && ` · ${y.student_snapshot_count} students enrolled`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!y.is_current && (
                        <button
                          onClick={() => switchYear(y.id, y.label)}
                          disabled={switchingYear === y.id}
                          className="text-xs px-3 py-1.5 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium disabled:opacity-50">
                          {switchingYear === y.id ? 'Switching…' : 'Set Active'}
                        </button>
                      )}
                      <button onClick={() => loadYearHistory(y.id)}
                        className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg font-medium">
                        {historyYearId === y.id ? 'Hide History' : 'History'}
                      </button>
                      <button onClick={() => openEditYear(y)}
                        className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg font-medium">
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* ── Read-only history of past date edits ── */}
                  {historyYearId === y.id && (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                      {historyLoading ? (
                        <p className="text-xs text-gray-400">Loading history…</p>
                      ) : historySnapshots.length === 0 ? (
                        <p className="text-xs text-gray-400">No date changes recorded for this year yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {historySnapshots.map(snap => (
                            <div key={snap.id} className="bg-white border border-gray-200 rounded-lg p-3 text-xs">
                              <p className="text-gray-500">
                                Historical record — not editable. Changed by <span className="font-medium text-gray-700">{snap.changed_by}</span> on{' '}
                                {new Date(snap.changed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                              <p className="text-gray-700 mt-1">
                                Dates changed: <span className="font-mono">{snap.old_start_date} → {snap.old_end_date}</span>
                                {' '}became{' '}
                                <span className="font-mono">{snap.new_start_date} → {snap.new_end_date}</span>
                              </p>
                              <p className="text-gray-500 mt-1">
                                {snap.bill_count} bill{snap.bill_count !== 1 ? 's' : ''} captured at time of change
                                {Object.entries(snap.status_summary).length > 0 && (
                                  <> — {Object.entries(snap.status_summary).map(([status, count]) => `${count} ${status}`).join(', ')}</>
                                )}
                              </p>
                              <div className="flex gap-2 mt-2">
                                <a href={`/api/academic-years/${y.id}/snapshot-export?school_id=${schoolId}&snapshot_id=${snap.id}&type=ledger`} download
                                  className="text-indigo-600 hover:underline">⬇ Export Ledger (old data)</a>
                                <a href={`/api/academic-years/${y.id}/snapshot-export?school_id=${schoolId}&snapshot_id=${snap.id}&type=defaulters`} download
                                  className="text-indigo-600 hover:underline">⬇ Export Defaulters (old data)</a>
                              </div>
                            </div>
                          ))}
                          <p className="text-[11px] text-gray-400">
                            Payments and audit records aren&apos;t affected by date changes — see the Payments/Audit tabs in Fee Management for the full live history.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Edit-year confirmation: warning + password ══════════════════════════ */}
      {yearConfirm && editingYear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-5">
              <h3 className="font-bold text-gray-900 text-base">Confirm Date Change — {editingYear.label}</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-600">
                Changing these dates affects which bills are currently marked overdue across the system.
              </p>
              {(yearConfirm.impact.will_become_overdue > 0 || yearConfirm.impact.will_revert_to_pending > 0) ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                  {yearConfirm.impact.will_become_overdue > 0 && (
                    <p>⚠ {yearConfirm.impact.will_become_overdue} pending bill{yearConfirm.impact.will_become_overdue !== 1 ? 's' : ''} will become <strong>overdue</strong>.</p>
                  )}
                  {yearConfirm.impact.will_revert_to_pending > 0 && (
                    <p>⚠ {yearConfirm.impact.will_revert_to_pending} overdue bill{yearConfirm.impact.will_revert_to_pending !== 1 ? 's' : ''} will revert to <strong>pending</strong>.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No bills will change overdue status with these new dates.</p>
              )}
              {yearConfirm.impact.has_bills && (
                <p className="text-sm text-gray-600">
                  The current state of all bills for this year will be saved to History before the change is applied.
                </p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Enter your password to confirm</label>
                <input type="password" value={yearConfirmPassword}
                  onChange={e => { setYearConfirmPassword(e.target.value); setYearConfirmError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') confirmSaveYear() }}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                {yearConfirmError && <p className="text-xs text-red-600 mt-1">{yearConfirmError}</p>}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    saveAbortRef.current?.abort()
                    setYearConfirm(null); setYearConfirmPassword(''); setYearConfirmError(''); setYearConfirmSaving(false)
                  }}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Cancel
                </button>
                <button onClick={confirmSaveYear} disabled={yearConfirmSaving}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  {yearConfirmSaving ? 'Saving…' : 'Confirm & Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ PLAN & FEATURES TAB ═══════════════════════════════════════════════ */}
      {tab === 'plan' && (
        <div className="space-y-4">
          {planLoading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Loading plan details…</div>
          ) : (
            <>
              {/* Current plan card */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Plan</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold px-3 py-1 rounded-full border capitalize ${TIER_COLORS[subscription?.tier ?? 'none']}`}>
                        {subscription?.tier === 'none' ? 'No Plan Assigned' : (subscription?.tier ?? 'none')}
                      </span>
                    </div>
                    {subscription?.updated_at && subscription.tier !== 'none' && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        Active since {new Date(subscription.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <a href="mailto:support@welearnyoulearn.com?subject=Plan Upgrade Request"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors">
                    Upgrade Plan →
                  </a>
                </div>
              </div>

              {/* Features grid */}
              {subscription?.tier === 'none' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
                  No plan assigned yet. Contact your WLYL representative to activate a plan and unlock features.
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-5">
                  <p className="text-sm font-semibold text-gray-700">Features included in your plan</p>
                  {CATEGORY_ORDER.map(cat => {
                    const features = ALL_FEATURES.filter(f => f.category === cat)
                    return (
                      <div key={cat}>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{cat}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {features.map(f => {
                            const on = enabledFeatures.has(f.key)
                            return (
                              <div key={f.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${on ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-400'}`}>
                                <span className={`text-xs ${on ? 'text-green-500' : 'text-gray-300'}`}>
                                  {on ? '✓' : '🔒'}
                                </span>
                                {f.label}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ STAFF ACCOUNTS TAB ════════════════════════════════════════════════ */}
      {tab === 'staff' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-800">Staff Accounts</h3>
              <p className="text-sm text-gray-400 mt-0.5">Principal and Vice Principal access — credentials sent by email</p>
            </div>
            {(() => {
              const limit = subscription?.staff_limit ?? null
              const count = staffList.filter(s => s.status === 'active').length
              return (
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {count} active{limit !== null ? ` / ${limit} allowed` : ''}
                  </p>
                  {limit !== null && count >= limit && (
                    <p className="text-xs text-amber-600 font-medium">Limit reached — upgrade to add more</p>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Staff list */}
          {staffLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="space-y-2">
              {staffList.length === 0 && (
                <p className="text-sm text-gray-400">No staff accounts yet.</p>
              )}
              {staffList.map(s => (
                <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-indigo-600 text-sm font-bold">
                        {(s.full_name || s.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{s.full_name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[s.role] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_LABELS[s.role] ?? s.role}
                        </span>
                        {s.first_login && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            Awaiting first login
                          </span>
                        )}
                        {s.status === 'inactive' && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Deactivated</span>
                        )}

                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{s.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.status === 'active' ? (
                        <>
                          <button onClick={() => resendCredentials(s.id)} disabled={resendingId === s.id}
                            className="text-xs border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                            {resendingId === s.id ? 'Sending…' : 'Resend Credentials'}
                          </button>
                          <button onClick={() => deactivateStaff(s.id)}
                            className="text-xs border border-red-200 text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors">
                            Deactivate
                          </button>
                        </>
                      ) : (
                        <button onClick={() => reactivateStaff(s.id)}
                          className="text-xs border border-green-200 text-green-600 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors">
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                  {resendMsg?.id === s.id && (
                    <p className={`text-xs mt-2 pl-12 ${resendMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{resendMsg.text}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add staff form */}
          {(() => {
            const limit = subscription?.staff_limit ?? null
            const count = staffList.filter(s => s.status === 'active').length
            const atLimit = limit !== null && count >= limit
            return (
              <div className="border-t border-gray-100 pt-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Add Staff Account</p>
                {staffError && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{staffError}</div>}
                {staffSuccess && <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">{staffSuccess}</div>}
                {atLimit ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    You&apos;ve reached the staff limit for your plan ({limit} accounts). Upgrade to add more.
                  </div>
                ) : (
                  <form onSubmit={handleAddStaff} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" placeholder="Full name *" value={staffForm.full_name} required
                        onChange={e => setStaffForm(f => ({ ...f, full_name: e.target.value }))}
                        className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                      <input type="email" placeholder="Email address *" value={staffForm.email} required
                        onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))}
                        className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    </div>
                    <div className="flex gap-3">
                      <select value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        <option value="principal">Principal</option>
                        <option value="vice_principal">Vice Principal</option>
                        <option value="school_admin">School Administrator</option>
                      </select>
                      <button type="submit" disabled={staffSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap">
                        {staffSaving ? 'Sending…' : '+ Add & Send Email'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ══ SECURITY TAB ══════════════════════════════════════════════════════ */}

      {tab === 'security' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Change Password</h3>
              <p className="text-xs text-gray-400 mt-0.5">Use a strong password with uppercase letters and numbers</p>
            </div>

            {pwdMsg && (
              <div className={`px-4 py-3 rounded-xl text-sm border ${pwdMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                {pwdMsg.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              {([
                { label: 'Current Password',     val: curPwd,     set: setCurPwd,     ph: 'Your current password',    auto: 'current-password' },
                { label: 'New Password',          val: newPwd,     set: setNewPwd,     ph: 'At least 8 characters',    auto: 'new-password' },
                { label: 'Confirm New Password',  val: confirmPwd, set: setConfirmPwd, ph: 'Repeat your new password', auto: 'new-password' },
              ] as const).map(({ label, val, set, ph, auto }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                  <input type="password" value={val} onChange={e => set(e.target.value)}
                    placeholder={ph} autoComplete={auto} required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              ))}

              {/* Strength checks */}
              {newPwd && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
                  {pwdChecks.map(c => (
                    <div key={c.label} className={`flex items-center gap-2 text-xs ${c.ok ? 'text-green-600' : 'text-gray-400'}`}>
                      <span>{c.ok ? '✓' : '○'}</span>{c.label}
                    </div>
                  ))}
                </div>
              )}

              <button type="submit" disabled={pwdSaving || !curPwd || !newPwd || !confirmPwd}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
                {pwdSaving ? 'Changing…' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Session info */}
          <div className="bg-white border border-gray-100 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Active Session</h3>
            <p className="text-xs text-gray-400 mb-4">You are currently logged in on this device</p>
            <a href="/api/auth/logout"
              className="inline-block text-sm font-medium text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors">
              Log Out
            </a>
          </div>
        </div>
      )}

      {/* ══ DANGER ZONE TAB ═══════════════════════════════════════════════════ */}
      {tab === 'danger' && (
        <div className="space-y-4">
          {dangerMsg && (
            <div className={`px-4 py-3 rounded-xl text-sm border ${dangerMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
              {dangerMsg.text}
            </div>
          )}

          {/* Export data */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Export My Data</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Request a full export of your school data — students, teachers, fees, attendance records.
                Our team will prepare and send it within 2 business days.
              </p>
            </div>
            <button onClick={() => sendAccountRequest('export')} disabled={exportSending}
              className="px-5 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {exportSending ? 'Sending request…' : 'Request Data Export'}
            </button>
          </div>

          {/* Account closure */}
          <div className="bg-white border border-red-200 rounded-xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-red-700">Request Account Closure</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                This sends a closure request to our team. Your account will be reviewed and deactivated manually.
                All data is preserved for 90 days before permanent deletion.
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 space-y-1">
              <p className="font-semibold">⚠ Before you request closure:</p>
              <ul className="list-disc list-inside space-y-0.5 mt-1">
                <li>All teachers and students will lose access immediately</li>
                <li>Fee records and reports will be unavailable</li>
                <li>Data is retained for 90 days then permanently deleted</li>
              </ul>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason for closure *</label>
              <textarea value={closureReason} onChange={e => setClosureReason(e.target.value)} rows={3}
                placeholder="Please describe why you want to close your account…"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>
            <button onClick={() => sendAccountRequest('closure')} disabled={closureSending || !closureReason.trim()}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
              {closureSending ? 'Sending request…' : 'Send Closure Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
