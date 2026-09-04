'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FullPageLoader } from '@/components/loaders'
import Link from 'next/link'
import { TRANSLATIONS, type Lang } from './translations'
import ParentSyllabus from './components/ParentSyllabus'
import DigitalLibrary from '../components/library/DigitalLibrary'
import { useUsageHeartbeat } from '@/lib/useUsageHeartbeat'
import { useFeatureTracking } from '@/lib/useFeatureTracking'
import { getUsageSessionId, clearUsageSessionId } from '@/lib/usageSession'
import { PORTAL_NAV_KEY_ALIASES } from '@/lib/features'

// ── Types ─────────────────────────────────────────────────────────────────────
type Child = { id: number; name: string; grade: string; section: string; roll_number: string; school_id: number }
type Student = {
  id: number; name: string; grade: string; section: string
  roll_number: string; school_id: number; class_id: number
  parent_name: string | null; parent_phone: string | null
}
type ParentInfo = { id: number; name: string; email: string; school_id: number; school_name: string; children: Child[] }

type Summary = {
  upcoming_exams: Array<{
    id: number; exam_name: string; exam_type: string; exam_date: string
    subjects: string[]; total_subjects: number
  }>
  published_results: Array<{
    id: number; exam_name: string; exam_type: string; exam_date: string
    passing_pct: number; total_obtained: number | null; total_max: number | null
    parent_acknowledged: boolean
  }>
  unacknowledged_count: number
  recent_tasks: Array<{ title: string; due_date: string; task_type: string; submitted: boolean }>
  attendance_pct: number | null
}

type TimetablePeriod = {
  period_number: number; time_from: string; time_to: string
  subject_name: string | null; teacher_name: string | null; department: string | null
}

type AttendanceDay = { date: string; morning: string | null; afternoon: string | null; present: boolean }
type AttendanceMonth = { month: string; present: number; absent: number; late: number; total: number; pct: number }

type FeeLedger = {
  id: number; category_name: string; period_label: string; frequency: string
  amount_due: number; amount_paid: number; balance: number
  due_date: string; status: string
}
type FeePayment = {
  id: number; receipt_number: string; amount: number; payment_mode: string
  payment_status: string; paid_date: string; category_name: string; period_label: string
  transaction_ref: string | null; rejection_reason: string | null; verified_at: string | null
  notes: string | null
}
type FeeWaiver = {
  id: number; waiver_type: string; waiver_amount: number; reason: string
  granted_by_name: string | null; created_at: string
  category_name: string; period_label: string; amount_due: number
}
type FeeSummary = { total_due: number; total_paid: number; total_outstanding: number; total_waived: number; overdue_count: number }

type Activity = {
  id: number; action_type: string; action_detail: string | null; created_at: string
}
type ActivitySummary = { totalSessions: number; totalMinutes: number; lastSeen: string | null; actionTypeCounts: Record<string, number> }

// ── Constants ─────────────────────────────────────────────────────────────────
const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test', mid_term: 'Mid Term', final_exam: 'Final', practical: 'Practical'
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  page_view:    { label: 'Visited page',       color: 'bg-gray-100 text-gray-600' },
  task_view:    { label: 'Viewed task',         color: 'bg-blue-100 text-blue-700' },
  task_submit:  { label: 'Submitted task',      color: 'bg-green-100 text-green-700' },
  test_start:   { label: 'Started test',        color: 'bg-yellow-100 text-yellow-700' },
  test_submit:  { label: 'Submitted test',      color: 'bg-green-100 text-green-700' },
  doubt_ask:    { label: 'Asked doubt',         color: 'bg-purple-100 text-purple-700' },
  marks_view:   { label: 'Viewed marks',        color: 'bg-indigo-100 text-indigo-700' },
  fee_view:     { label: 'Checked fees',        color: 'bg-amber-100 text-amber-700' },
  login:        { label: 'Logged in',           color: 'bg-green-100 text-green-700' },
}

const STATUS_COLOR: Record<string, string> = {
  paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-gray-100 text-gray-600', overdue: 'bg-red-100 text-red-700',
  waived: 'bg-purple-100 text-purple-700', pending_verification: 'bg-blue-100 text-blue-700',
}

const NAV = [
  { key: 'overview',   label: 'Overview',          icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'today',      label: "Today's Schedule",   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'attendance', label: 'Attendance',         icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { key: 'fees',       label: 'Fees',               icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'exams',      label: 'Exam Calendar',      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { key: 'results',    label: 'Results',            icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'syllabus',   label: 'Syllabus',           icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { key: 'library',    label: 'Digital Library',    icon: 'M12 6.253C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253m0-13v13' },
]

// Only nav keys that map to a plan-gated ALL_FEATURES entry get checked
// against enabledFeatures — everything else has always been unconditionally
// available and stays that way. 'syllabus' resolves through
// PORTAL_NAV_KEY_ALIASES to school-admin's 'curriculum' key.
const RESTRICTABLE_NAV_KEYS = new Set(['syllabus', 'library'])

function fmt(n: number | string) { return `₹${Number(n).toLocaleString('en-IN')}` }
function timeStr(t: string) { return t ? t.slice(0, 5) : '' }
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ParentDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [parentInfo, setParentInfo] = useState<ParentInfo | null>(null)
  const [showChildPicker, setShowChildPicker] = useState(false)
  const [student, setStudent] = useState<Student | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [activeNav, setActiveNav] = useState('overview')
  const [visited, setVisited] = useState<Set<string>>(new Set(['overview']))
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string> | null>(null)

  // Filters out nav items gated by a plan feature the school doesn't have
  // enabled for this portal — null (still loading) means "show everything"
  // so the sidebar doesn't flash empty before the fetch resolves.
  function isNavItemVisible(key: string) {
    if (!RESTRICTABLE_NAV_KEYS.has(key)) return true
    if (enabledFeatures === null) return true
    return enabledFeatures.has(PORTAL_NAV_KEY_ALIASES[key] ?? key)
  }

  // Per-section data
  const [timetable, setTimetable] = useState<TimetablePeriod[]>([])
  const [timetableDay, setTimetableDay] = useState('')
  const [timetableLoading, setTimetableLoading] = useState(false)

  const [attDays, setAttDays] = useState<AttendanceDay[]>([])
  const [attMonthly, setAttMonthly] = useState<AttendanceMonth[]>([])
  const [attSummary, setAttSummary] = useState<{ totalDays: number; presentDays: number; absentDays: number; lateDays: number; pct: number | null } | null>(null)
  const [attLoading, setAttLoading] = useState(false)

  const [feeLedger, setFeeLedger] = useState<FeeLedger[]>([])
  const [feePayments, setFeePayments] = useState<FeePayment[]>([])
  const [feeWaivers, setFeeWaivers] = useState<FeeWaiver[]>([])
  const [feeSummary, setFeeSummary] = useState<FeeSummary | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeAcYear, setFeeAcYear] = useState('')
  const [feeAcYears, setFeeAcYears] = useState<string[]>([])
  const [payingLedger, setPayingLedger] = useState<FeeLedger | null>(null)
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<Set<number>>(new Set())
  const [payAmount, setPayAmount] = useState('')
  const [payUPI, setPayUPI] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [paySuccess, setPaySuccess] = useState<{ receipt_number: string; total_amount: number; entries_count: number } | null>(null)
  const [payStep, setPayStep] = useState<'form' | 'method' | 'upi-id' | 'qr' | 'txn'>('form')
  const [upiParentId, setUpiParentId] = useState('')
  const [qrRevealed, setQrRevealed] = useState(false)
  const [payTimerSecs, setPayTimerSecs] = useState(0)
  const payTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)


  const [ackingId, setAckingId] = useState<number | null>(null)
  const [ackName, setAckName]   = useState('')
  const [ackSaving, setAckSaving] = useState(false)
  const [ackError, setAckError]   = useState('')

  type AnnouncementItem = { id: number; title: string; content: string; announcement_type: string; priority: string; created_by_name: string; expires_at: string | null; created_at: string }
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [annExpanded, setAnnExpanded] = useState<number | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => {
    const saved = localStorage.getItem('parent_lang') as Lang | null
    if (saved === 'en' || saved === 'te') setLang(saved)
  }, [])
  function changeLang(l: Lang) { setLang(l); localStorage.setItem('parent_lang', l) }
  const T = TRANSLATIONS[lang]

  const trackOpen = useFeatureTracking('parent')

  function navigateTo(key: string) {
    setActiveNav(key)
    setVisited(prev => new Set([...prev, key]))
    setSidebarOpen(false)
    trackOpen(key)
  }

  // ── Data loaders ─────────────────────────────────────────────────────────────
  async function loadSummary(s: Student) {
    try {
      const [summaryRes, annRes] = await Promise.all([
        fetch(`/api/parent/child-summary?school_id=${s.school_id}&student_id=${s.id}&class_id=${s.class_id}`),
        fetch(`/api/announcements?school_id=${s.school_id}&audience=parents`),
      ])
      if (summaryRes.ok) setSummary(await summaryRes.json())
      if (annRes.ok) {
        const annData = await annRes.json()
        setAnnouncements(Array.isArray(annData) ? annData : [])
      }
    } catch { /* non-critical */ }
  }

  const loadTimetable = useCallback(async (s: Student) => {
    setTimetableLoading(true)
    try {
      const r = await fetch(`/api/parent/timetable?school_id=${s.school_id}&class_id=${s.class_id}`)
      const d = await r.json()
      setTimetable(d.periods || [])
      setTimetableDay(d.day || '')
    } catch { setTimetable([]) }
    setTimetableLoading(false)
  }, [])

  const loadAttendance = useCallback(async (s: Student) => {
    setAttLoading(true)
    try {
      const r = await fetch(`/api/parent/attendance?school_id=${s.school_id}&student_id=${s.id}&months=3`)
      const d = await r.json()
      setAttDays(d.days || [])
      setAttMonthly(d.monthly || [])
      setAttSummary(d.summary || null)
    } catch { setAttDays([]); setAttMonthly([]) }
    setAttLoading(false)
  }, [])

  const loadFees = useCallback(async (s: Student, year: string) => {
    setFeeLoading(true)
    try {
      const r = await fetch(`/api/parent/fees?school_id=${s.school_id}&student_id=${s.id}&academic_year=${year}`)
      const d = await r.json()
      setFeeLedger(d.ledger || [])
      setFeePayments(d.payments || [])
      setFeeWaivers(d.waivers || [])
      setFeeSummary(d.summary || null)
    } catch { setFeeLedger([]); setFeePayments([]); setFeeWaivers([]) }
    setFeeLoading(false)
  }, [])


  // Load section data on first visit
  useEffect(() => {
    if (!student) return
    if (activeNav === 'today' && !timetable.length && !timetableLoading) loadTimetable(student)
    if (activeNav === 'attendance' && !attDays.length && !attLoading) loadAttendance(student)
    if (activeNav === 'fees' && !feeLedger.length && !feeLoading) loadFees(student, feeAcYear)
  }, [activeNav, student]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth ──────────────────────────────────────────────────────────────────────
  async function selectChild(child: Child) {
    // Resolve class_id from grade + section
    let cid = 0
    try {
      const classRes = await fetch(`/api/classes?school_id=${child.school_id}`)
      if (classRes.ok) {
        const classes = await classRes.json()
        const cls = (classes as { id: number; grade: string; section: string }[])
          .find(c => c.grade === child.grade && c.section === child.section)
        if (cls) cid = cls.id
      }
    } catch { /* non-critical */ }

    const s: Student = { ...child, class_id: cid, parent_name: null, parent_phone: null }
    setStudent(s)
    setShowChildPicker(false)
    setSummary(null); setFeeLedger([]); setFeePayments([]); setFeeWaivers([]); setFeeSummary(null)
    setTimetable([]); setAttDays([]); setAttMonthly([]); setAttSummary(null)
    setActiveNav('overview'); setVisited(new Set(['overview']))

    await loadSummary(s)
    Promise.all([
      fetch(`/api/academic-year/current?school_id=${child.school_id}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/academic-years?school_id=${child.school_id}`).then(r => r.ok ? r.json() : []),
    ]).then(([current, all]) => {
      const allLabels: string[] = Array.isArray(all) ? all.map((y: { label: string }) => y.label) : []
      const currentLabel: string = current?.label ?? allLabels[0] ?? '2025-26'
      if (!allLabels.length) allLabels.push(currentLabel)
      setFeeAcYears(allLabels)
      setFeeAcYear(currentLabel)
    }).catch(() => { setFeeAcYears(['2025-26']); setFeeAcYear('2025-26') })
  }

  useEffect(() => {
    fetch('/api/parent/auth/me')
      .then(async r => {
        if (r.status === 401) { router.push('/parent/login'); return }
        const data = await r.json()
        setParentInfo(data)
        fetch(`/api/school/enabled-features?school_id=${data.school_id}&portal=parent`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.enabled) setEnabledFeatures(new Set<string>(d.enabled)) })
          .catch(() => {})
        if (data.children.length === 1) {
          await selectChild(data.children[0])
        } else if (data.children.length > 1) {
          setShowChildPicker(true)
        }
      })
      .catch(() => router.push('/parent/login'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useUsageHeartbeat()

  async function handleLogout() {
    const usageSessionId = getUsageSessionId()
    await fetch('/api/parent/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usageSessionId }),
    }).catch(() => {})
    clearUsageSessionId()
    router.push('/parent/login')
  }

  async function acknowledgeMarks(examId: number) {
    if (!student || !ackName.trim()) { setAckError('Parent name required'); return }
    setAckSaving(true); setAckError('')
    try {
      await fetch(`/api/exams/${examId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: student.id, school_id: student.school_id, parent_name: ackName.trim(), parent_phone: student.parent_phone }),
      })
      setAckingId(null); setAckName('')
      if (student) loadSummary(student)
    } catch { setAckError('Failed to save') }
    setAckSaving(false)
  }

  async function submitPayment(upiRef?: string) {
    if (!student) return
    setPayLoading(true)
    try {
      const isMulti = selectedLedgerIds.size > 0
      const ref = upiRef !== undefined ? upiRef : payUPI
      const body = isMulti
        ? { school_id: student.school_id, student_id: student.id, ledger_ids: Array.from(selectedLedgerIds), total_amount: parseFloat(payAmount), transaction_ref: ref || null, upi_id: ref || null }
        : { school_id: student.school_id, student_id: student.id, ledger_id: payingLedger?.id, amount: parseFloat(payAmount), upi_id: ref || null }
      const r = await fetch('/api/parent/fees', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (r.ok) {
        setPaySuccess({ receipt_number: d.receipt_number, total_amount: d.total_amount || parseFloat(payAmount), entries_count: d.entries_count || 1 })
        setPayingLedger(null); setSelectedLedgerIds(new Set()); setPayAmount(''); setPayUPI('')
        setPayStep('form'); setUpiParentId(''); setQrRevealed(false); stopPayTimer()
        loadFees(student, feeAcYear)
      }
    } catch { /* silent */ }
    setPayLoading(false)
  }

  function startPayTimer() {
    if (payTimerRef.current) clearInterval(payTimerRef.current)
    setPayTimerSecs(300)
    payTimerRef.current = setInterval(() => {
      setPayTimerSecs(s => {
        if (s <= 1) { clearInterval(payTimerRef.current!); payTimerRef.current = null; return 0 }
        return s - 1
      })
    }, 1000)
  }

  function stopPayTimer() {
    if (payTimerRef.current) { clearInterval(payTimerRef.current); payTimerRef.current = null }
    setPayTimerSecs(0)
  }

  function fmtTimer(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  function cancelPayment() {
    setPayingLedger(null); setSelectedLedgerIds(new Set())
    setPayAmount(''); setPayUPI('')
    setPayStep('form'); setUpiParentId(''); setQrRevealed(false); stopPayTimer()
  }

  async function handleIvePaid() {
    stopPayTimer()
    await submitPayment(upiParentId || undefined)
  }

  function printParentReceipt(pmt: FeePayment) {
    const modeLabel: Record<string, string> = { cash: 'Cash', cheque: 'Cheque', dd: 'Demand Draft', upi: 'UPI', online: 'Online Transfer' }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${pmt.receipt_number}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:680px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:14px;margin-bottom:20px}
  .school{font-size:20px;font-weight:bold}
  .rtitle{font-size:14px;font-weight:bold;margin-top:6px;letter-spacing:1px}
  .rno{font-size:12px;color:#555;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .lbl{font-size:11px;color:#888;margin-bottom:2px}
  .val{font-size:13px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th{background:#f3f4f6;padding:8px 10px;text-align:left;font-size:12px;border:1px solid #ddd}
  td{padding:8px 10px;font-size:13px;border:1px solid #ddd}
  .tot td{font-weight:bold;background:#f9fafb}
  .ftr{margin-top:24px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:10px}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr">
  <div class="school">Fee Receipt</div>
  <div class="rtitle">PAYMENT CONFIRMATION</div>
  <div class="rno">Receipt No: <strong>${pmt.receipt_number}</strong></div>
</div>
<table>
  <thead><tr><th>Fee Category</th><th>Period</th><th>Amount Paid</th></tr></thead>
  <tbody>
    <tr><td>${pmt.category_name}</td><td>${pmt.period_label}</td><td>₹${Number(pmt.amount).toLocaleString('en-IN')}</td></tr>
  </tbody>
  <tfoot><tr class="tot"><td colspan="2" style="text-align:right">Total Paid:</td><td>₹${Number(pmt.amount).toLocaleString('en-IN')}</td></tr></tfoot>
</table>
<div class="grid2">
  <div><div class="lbl">Payment Mode</div><div class="val">${modeLabel[pmt.payment_mode] || pmt.payment_mode}</div></div>
  <div><div class="lbl">Payment Date</div><div class="val">${pmt.paid_date}</div></div>
  ${pmt.transaction_ref ? `<div><div class="lbl">Transaction Ref</div><div class="val">${pmt.transaction_ref}</div></div>` : ''}
</div>
<div class="ftr">Generated on ${new Date().toLocaleString('en-IN')} · Computer-generated receipt · No signature required.</div>
</body></html>`
    const win = window.open('', '_blank', 'width=720,height=580')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  // ── Loading / child picker screens ───────────────────────────────────────────
  if (loading) return <FullPageLoader portal="parent" message="Loading parent dashboard" sub="Fetching your child's progress…" />

  if (showChildPicker && parentInfo) return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Select a Child</h2>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {parentInfo.name}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 shadow-sm overflow-hidden">
          {parentInfo.children.map(child => (
            <button key={child.id} onClick={() => selectChild(child)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-pink-50 transition-colors text-left">
              <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-pink-600 font-bold text-sm">{child.name.charAt(0)}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{child.name}</p>
                <p className="text-xs text-gray-400">Grade {child.grade}-{child.section} · Roll {child.roll_number}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
        <button onClick={handleLogout}
          className="w-full mt-4 text-sm text-gray-400 hover:text-red-500 py-2 transition-colors">
          Sign out
        </button>
      </div>
    </div>
  )

  if (!student) return null

  // ── Portal ────────────────────────────────────────────────────────────────────
  const latestResult = summary?.published_results[0]
  const latestPct = latestResult?.total_obtained !== null && latestResult?.total_max
    ? Math.round((latestResult.total_obtained! / latestResult.total_max!) * 100) : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={() => setSidebarOpen(o => !o)} className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm hidden sm:inline">{T.home}</Link>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <div>
            <p className="text-sm font-bold text-gray-900">{student.name}</p>
            <p className="text-xs text-gray-400">{T.grade} {student.grade}-{student.section} · {parentInfo?.school_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {feeAcYear && (
            <span
              data-testid="academic-year-badge"
              title="Active academic year — all data on this screen is scoped to this year"
              className="hidden sm:inline-flex items-center gap-1 bg-gray-100 border border-gray-200 text-gray-500 text-[10px] font-medium px-2.5 py-1 rounded-full"
            >
              📅 {feeAcYear}
            </span>
          )}
          {summary?.unacknowledged_count ? (
            <button onClick={() => navigateTo('results')}
              className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full hover:bg-red-200">
              {T.resultsToSign(summary.unacknowledged_count)}
            </button>
          ) : null}
          {(feeSummary?.overdue_count ?? 0) > 0 && (
            <button onClick={() => navigateTo('fees')}
              className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full hover:bg-amber-200">
              {T.feeOverdue(feeSummary!.overdue_count)}
            </button>
          )}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['en', 'te'] as Lang[]).map(l => (
              <button key={l} onClick={() => changeLang(l)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${lang === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {l === 'en' ? 'EN' : 'తె'}
              </button>
            ))}
          </div>
          {(parentInfo?.children?.length ?? 0) > 1 && (
            <button onClick={() => setShowChildPicker(true)}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg">
              {T.switchChild}
            </button>
          )}
          <button onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors">
            Logout
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-57px)] relative">
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        {/* Sidebar */}
        <nav className={`fixed inset-y-0 left-0 z-40 lg:relative lg:inset-y-auto lg:left-auto w-48 bg-white border-r border-gray-100 flex flex-col py-3 shrink-0 overflow-y-auto transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          {NAV.filter(item => isNavItemVisible(item.key)).map(item => (
            <button key={item.key} onClick={() => navigateTo(item.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors mx-2 rounded-lg ${
                activeNav === item.key ? 'bg-pink-50 text-pink-700' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {T.nav[item.key as keyof typeof T.nav]}
              {item.key === 'fees' && (feeSummary?.overdue_count ?? 0) > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {feeSummary!.overdue_count}
                </span>
              )}
              {item.key === 'results' && (summary?.unacknowledged_count ?? 0) > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {summary!.unacknowledged_count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">

          {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
          {visited.has('overview') && (
          <div hidden={activeNav !== 'overview'} className="max-w-3xl space-y-5">
            {/* Hero card */}
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 rounded-2xl p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-pink-200 text-xs font-semibold uppercase tracking-wide mb-1">{T.yourChild}</p>
                  <h2 className="text-xl font-black">{student.name}</h2>
                  <p className="text-pink-200 text-sm mt-0.5">{T.grade} {student.grade} · {T.section} {student.section} · {T.roll} {student.roll_number}</p>
                </div>
                <div className="text-right">
                  {summary?.attendance_pct !== null && summary?.attendance_pct !== undefined && (
                    <div>
                      <div className="text-3xl font-black">{summary.attendance_pct}%</div>
                      <div className="text-pink-200 text-xs">{T.thisMonth}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button onClick={() => navigateTo('today')} className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:border-pink-300 transition-colors group">
                <div className="text-2xl font-black text-blue-600 group-hover:text-pink-600">{timetable.length || '—'}</div>
                <div className="text-xs text-gray-500 mt-1">{T.todaysPeriods}</div>
              </button>
              <button onClick={() => navigateTo('exams')} className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:border-pink-300 transition-colors group">
                <div className="text-2xl font-black text-purple-600 group-hover:text-pink-600">{summary?.upcoming_exams?.length ?? 0}</div>
                <div className="text-xs text-gray-500 mt-1">{T.upcomingExams}</div>
              </button>
              <button onClick={() => navigateTo('results')} className={`bg-white rounded-xl border p-4 text-center hover:border-pink-300 transition-colors group ${summary?.unacknowledged_count ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                <div className={`text-2xl font-black group-hover:text-pink-600 ${summary?.unacknowledged_count ? 'text-red-600' : 'text-gray-400'}`}>
                  {summary?.unacknowledged_count ?? 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">{T.pendingSignoff}</div>
              </button>
              <button onClick={() => navigateTo('fees')} className={`bg-white rounded-xl border p-4 text-center hover:border-pink-300 transition-colors group ${(feeSummary?.overdue_count ?? 0) > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                <div className={`text-lg font-black group-hover:text-pink-600 ${(feeSummary?.overdue_count ?? 0) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {feeSummary ? fmt(feeSummary.total_outstanding) : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">{T.outstandingFees}</div>
              </button>
            </div>


            {/* Latest result */}
            {latestResult && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{T.latestResult}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{latestResult.exam_name}</p>
                    <p className="text-xs text-gray-400">{EXAM_TYPE_LABELS[latestResult.exam_type] || latestResult.exam_type} · {latestResult.exam_date}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black ${latestPct !== null ? (latestPct >= latestResult.passing_pct ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                      {latestPct !== null ? `${latestPct}%` : '—'}
                    </div>
                    {latestResult.total_obtained !== null && <div className="text-xs text-gray-400">{latestResult.total_obtained}/{latestResult.total_max}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming exams */}
            {summary?.upcoming_exams && summary.upcoming_exams.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-bold text-gray-800 mb-3">{T.upcomingExams}</p>
                <div className="space-y-2">
                  {summary.upcoming_exams.slice(0, 5).map(e => {
                    const days = Math.round((new Date(e.exam_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                    return (
                      <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{e.exam_name}</p>
                          <p className="text-xs text-gray-400">{e.subjects.slice(0,3).join(', ')}{e.subjects.length > 3 ? ` +${e.subjects.length - 3}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-600">{new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                          <p className={`text-[10px] font-bold ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {days === 0 ? T.today : days === 1 ? T.tomorrow : T.daysAway(days)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button onClick={() => navigateTo('exams')} className="mt-3 text-xs text-pink-600 font-semibold hover:underline">{T.viewFullCalendar}</button>
              </div>
            )}

            {/* Sign-off alerts */}
            {summary?.published_results.filter(r => !r.parent_acknowledged).map(r => {
              const p = r.total_obtained !== null && r.total_max ? Math.round((r.total_obtained / r.total_max) * 100) : null
              return (
                <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-amber-900">{r.exam_name} — {T.signOffNeeded}</p>
                    <p className="text-xs text-amber-700 mt-0.5">{EXAM_TYPE_LABELS[r.exam_type] || r.exam_type} · {r.exam_date}{p !== null ? ` · Score: ${p}%` : ''}</p>
                  </div>
                  <button onClick={() => { setAckingId(r.id); navigateTo('results') }}
                    className="shrink-0 bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-700">
                    {T.signNow}
                  </button>
                </div>
              )
            })}

            {/* Recent tasks */}
            {summary?.recent_tasks && summary.recent_tasks.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-bold text-gray-800 mb-3">{T.recentTasks}</p>
                <div className="space-y-1.5">
                  {summary.recent_tasks.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm text-gray-700">{t.title}</p>
                        <p className="text-xs text-gray-400">{t.task_type} · {T.due} {t.due_date}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${t.submitted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {t.submitted ? T.done : T.pending}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* School announcements for parents */}
            {announcements.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    <p className="text-sm font-bold text-gray-800">{T.schoolNotices}</p>
                    {announcements.filter(a => a.priority === 'urgent').length > 0 && (
                      <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                        {announcements.filter(a => a.priority === 'urgent').length} {T.urgent}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{T.notices(announcements.length)}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {announcements.slice(0, 4).map(a => {
                    const isUrgent = a.priority === 'urgent'
                    const isHigh = a.priority === 'high'
                    const isOpen = annExpanded === a.id
                    return (
                      <div key={a.id} className={`${isUrgent ? 'bg-red-50/40' : isHigh ? 'bg-amber-50/40' : ''}`}>
                        <button
                          onClick={() => setAnnExpanded(isOpen ? null : a.id)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                            isUrgent ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-gray-300'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {isUrgent && <span className="text-[9px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded uppercase">{T.urgent}</span>}
                              <span className="text-[10px] text-gray-400">
                                {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-gray-800 truncate">{a.title}</p>
                            {!isOpen && <p className="text-xs text-gray-400 mt-0.5 truncate">{a.content}</p>}
                          </div>
                          <svg className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 pl-9">
                            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                            {a.expires_at && (
                              <p className="text-xs text-amber-500 mt-1.5">
                                {T.expires} {new Date(a.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {announcements.length > 4 && (
                  <div className="px-4 py-2.5 border-t border-gray-50 text-center">
                    <p className="text-xs text-gray-400">{T.moreNotices(announcements.length - 4)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* ── SYLLABUS ──────────────────────────────────────────────────── */}
          {visited.has('syllabus') && isNavItemVisible('syllabus') && (
          <div hidden={activeNav !== 'syllabus'}>
            <ParentSyllabus
              schoolId={student.school_id}
              classId={student.class_id}
              studentName={student.name}
              grade={student.grade}
              section={student.section}
            />
          </div>
          )}

          {/* ── DIGITAL LIBRARY ───────────────────────────────────────────── */}
          {visited.has('library') && isNavItemVisible('library') && (
          <div hidden={activeNav !== 'library'}>
            <DigitalLibrary apiUrl={`/api/school/library?school_id=${student.school_id}&student_id=${student.id}`} />
          </div>
          )}

          {/* ── TODAY'S SCHEDULE ───────────────────────────────────────────── */}
          {visited.has('today') && (
          <div hidden={activeNav !== 'today'} className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-800">{T.nav.today}</h2>
                {timetableDay && <p className="text-xs text-gray-400">{timetableDay} · {T.grade} {student.grade}-{student.section}</p>}
              </div>
              <button onClick={() => loadTimetable(student)} className="text-xs text-pink-600 hover:text-pink-800 border border-pink-200 px-3 py-1.5 rounded-lg">{T.refresh}</button>
            </div>

            {timetableLoading ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-20 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-40" />
                </div>
              ))}</div>
            ) : timetable.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-gray-400 text-sm">{T.noTimetableToday}</p>
                <p className="text-gray-300 text-xs mt-1">{T.noTimetableHint}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const now = new Date()
                  const nowMins = now.getHours() * 60 + now.getMinutes()
                  return timetable.map(p => {
                    const [fh, fm] = p.time_from.split(':').map(Number)
                    const [th, tm] = p.time_to.split(':').map(Number)
                    const fromMins = fh * 60 + fm
                    const toMins   = th * 60 + tm
                    const isNow    = nowMins >= fromMins && nowMins <= toMins
                    const isDone   = nowMins > toMins
                    return (
                      <div key={p.period_number} className={`rounded-xl border p-4 transition-all ${
                        isNow ? 'border-pink-400 bg-pink-50 shadow-sm' : isDone ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              isNow ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-500'
                            }`}>{p.period_number}</div>
                            <div>
                              <p className={`font-semibold text-sm ${isNow ? 'text-pink-800' : 'text-gray-800'}`}>
                                {p.subject_name || T.freePeriod}
                              </p>
                              {p.teacher_name && <p className="text-xs text-gray-400">{p.teacher_name}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-semibold ${isNow ? 'text-pink-600' : 'text-gray-500'}`}>
                              {timeStr(p.time_from)} – {timeStr(p.time_to)}
                            </p>
                            {isNow && <span className="text-[10px] font-bold text-pink-600 bg-pink-100 px-1.5 py-0.5 rounded-full">{T.now}</span>}
                            {isDone && <span className="text-[10px] text-gray-400">{T.done}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>
          )}

          {/* ── ATTENDANCE ─────────────────────────────────────────────────── */}
          {visited.has('attendance') && (
          <div hidden={activeNav !== 'attendance'} className="max-w-3xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">{T.nav.attendance}</h2>
              <button onClick={() => loadAttendance(student)} className="text-xs text-pink-600 border border-pink-200 px-3 py-1.5 rounded-lg">{T.refresh}</button>
            </div>

            {attLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-20" />
              ))}</div>
            ) : attSummary ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: T.present,      value: attSummary.presentDays, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
                    { label: T.absent,       value: attSummary.absentDays,  color: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-100' },
                    { label: T.late,         value: attSummary.lateDays,    color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-100' },
                    { label: T.attendancePct, value: attSummary.pct !== null ? `${attSummary.pct}%` : '—', color: attSummary.pct !== null ? (attSummary.pct >= 75 ? 'text-green-600' : 'text-red-600') : 'text-gray-400', bg: 'bg-white', border: 'border-gray-200' },
                  ].map(c => (
                    <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 text-center`}>
                      <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
                      <div className="text-xs text-gray-500 mt-1">{c.label}</div>
                    </div>
                  ))}
                </div>

                {/* Monthly breakdown */}
                {attMonthly.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-bold text-gray-700 mb-3">{T.monthlyBreakdown}</p>
                    <div className="space-y-3">
                      {attMonthly.map(m => (
                        <div key={m.month}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-700">{new Date(m.month + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</span>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span className="text-green-600 font-semibold">{m.present}P</span>
                              <span className="text-red-500">{m.absent}A</span>
                              {m.late > 0 && <span className="text-orange-500">{m.late}L</span>}
                              <span className="font-bold text-gray-700">{m.pct}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${m.pct >= 75 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${m.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day-by-day calendar view */}
                {attDays.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-bold text-gray-700 mb-3">{T.recentDays}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {attDays.slice(0, 60).map(d => (
                        <div key={d.date} title={`${d.date}: ${d.morning || 'no data'}`}
                          className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold cursor-default ${
                            d.morning === 'present' ? 'bg-green-500 text-white' :
                            d.morning === 'absent'  ? 'bg-red-400 text-white' :
                            d.morning === 'late'    ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                          {new Date(d.date).getDate()}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" />{T.present}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400" />{T.absent}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400" />{T.late}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100" />{T.noData}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-gray-400 text-sm">{T.noAttendance}</p>
              </div>
            )}
          </div>
          )}

          {/* ── FEES ───────────────────────────────────────────────────────── */}
          {visited.has('fees') && (
          <div hidden={activeNav !== 'fees'} className="max-w-3xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">{T.feeDetails}</h2>
              <div className="flex gap-2">
                <select value={feeAcYear} onChange={e => { setFeeAcYear(e.target.value); loadFees(student, e.target.value); setSelectedLedgerIds(new Set()); setPayingLedger(null) }}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  {feeAcYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={() => loadFees(student, feeAcYear)} className="text-xs text-pink-600 border border-pink-200 px-3 py-1.5 rounded-lg">{T.refresh}</button>
              </div>
            </div>

            {/* Pay success — Receipt */}
            {paySuccess && (
              <div className="bg-white border-2 border-green-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-green-500 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    <p className="text-white font-bold">{T.paymentSuccess}</p>
                  </div>
                  <button onClick={() => setPaySuccess(null)} className="text-green-200 hover:text-white text-xl font-bold leading-none">×</button>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs text-gray-500 mb-1">Receipt Number</p>
                  <p className="text-xl font-black font-mono text-gray-800 tracking-wide">{paySuccess.receipt_number}</p>
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">Amount Paid</p>
                      <p className="text-base font-bold text-gray-700">{fmt(paySuccess.total_amount)}</p>
                    </div>
                    {paySuccess.entries_count > 1 && (
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Entries</p>
                        <p className="text-base font-bold text-gray-700">{paySuccess.entries_count}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 bg-amber-50 rounded-xl px-4 py-2.5 flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs text-amber-700">{T.adminVerify} Share receipt number <span className="font-bold font-mono">{paySuccess.receipt_number}</span> with school admin if needed.</p>
                  </div>
                </div>
              </div>
            )}

            {feeLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-16" />
              ))}</div>
            ) : (
              <>
                {/* Summary */}
                {feeSummary && (
                  <div className={`grid gap-3 ${feeSummary.total_waived > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-400">{T.totalDue}</p>
                      <p className="text-xl font-black text-gray-800 mt-1">{fmt(feeSummary.total_due)}</p>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                      <p className="text-xs text-green-600">{T.paid}</p>
                      <p className="text-xl font-black text-green-700 mt-1">{fmt(feeSummary.total_paid)}</p>
                    </div>
                    {feeSummary.total_waived > 0 && (
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
                        <p className="text-xs text-purple-600">Waived</p>
                        <p className="text-xl font-black text-purple-700 mt-1">{fmt(feeSummary.total_waived)}</p>
                      </div>
                    )}
                    <div className={`${feeSummary.total_outstanding > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} border rounded-xl p-4 text-center`}>
                      <p className={`text-xs ${feeSummary.total_outstanding > 0 ? 'text-red-500' : 'text-gray-400'}`}>{T.outstanding}</p>
                      <p className={`text-xl font-black mt-1 ${feeSummary.total_outstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmt(feeSummary.total_outstanding)}</p>
                    </div>
                  </div>
                )}

                {/* Multi-select pay bar */}
                {selectedLedgerIds.size > 0 && !payingLedger && (() => {
                  const selectedEntries = feeLedger.filter(e => selectedLedgerIds.has(e.id))
                  const totalSelected = selectedEntries.reduce((s, e) => s + Number(e.balance), 0)
                  return (
                    <div className="bg-blue-600 rounded-xl p-4 text-white">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold">{selectedLedgerIds.size} {selectedLedgerIds.size === 1 ? 'entry' : 'entries'} selected · Total {fmt(totalSelected)}</p>
                        <button onClick={() => setSelectedLedgerIds(new Set())} className="text-blue-200 hover:text-white text-xs">Clear</button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setPayAmount(String(totalSelected)); setPayingLedger({ id: -1 } as FeeLedger) }}
                          className="flex-1 bg-white text-blue-700 font-semibold py-2 rounded-lg text-sm hover:bg-blue-50"
                        >
                          Pay {fmt(totalSelected)}
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {/* Payment form (multi or single) */}
                {payingLedger && (
                  <div className="bg-white border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
                    {/* Payment header */}
                    <div className="bg-blue-600 px-5 py-4">
                      {selectedLedgerIds.size > 0 ? (
                        <div>
                          <p className="text-white font-bold text-sm">{selectedLedgerIds.size} fee entries</p>
                          <div className="mt-1.5 space-y-0.5">
                            {feeLedger.filter(e => selectedLedgerIds.has(e.id)).map(e => (
                              <div key={e.id} className="flex justify-between text-xs text-blue-100">
                                <span>{e.category_name} · {e.period_label}</span>
                                <span>{fmt(e.balance)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-white font-bold text-sm">{payingLedger.category_name} · {payingLedger.period_label}</p>
                          <p className="text-blue-100 text-xs mt-0.5">Balance due: {fmt(payingLedger.balance)}</p>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      {/* Step 1: Enter amount */}
                      {payStep === 'form' && (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Payment Amount (₹)</label>
                            <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                              placeholder="Enter amount"
                              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                            <p className="text-xs text-gray-400 mt-1">Enter less for partial payment</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setPayStep('qr'); setQrRevealed(false) }}
                              disabled={!payAmount || Number(payAmount) <= 0}
                              className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-blue-700">
                              Continue — Pay {payAmount ? fmt(payAmount) : '₹0'}
                            </button>
                            <button onClick={cancelPayment}
                              className="px-4 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50">
                              {T.cancel}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Step 2 (method) and Step 3a (upi-id) — disabled, kept for future use */}
                      {false && payStep === 'method' && null}
                      {false && payStep === 'upi-id' && null}

                      {/* Step 2: QR Code — scan and pay */}
                      {payStep === 'qr' && (
                        <div className="space-y-4">
                          <p className="text-sm font-bold text-gray-700 text-center">Scan QR &amp; Pay {fmt(payAmount)}</p>

                          <div className="flex flex-col items-center py-2">
                            <div
                              className="relative cursor-pointer select-none"
                              onClick={() => { if (!qrRevealed) setQrRevealed(true) }}>
                              <img
                                src={`/api/fees/upi-qr?amount=${encodeURIComponent(payAmount)}&school_id=${student.school_id}`}
                                alt="UPI QR Code"
                                width={220}
                                height={220}
                                className={`rounded-2xl border-2 border-gray-200 transition-all duration-500 ${!qrRevealed ? 'blur-xl scale-95' : 'blur-0 scale-100'}`}
                              />
                              {!qrRevealed && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl">
                                  <div className="w-14 h-14 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-gray-200">
                                    <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                  </div>
                                  <p className="text-xs font-bold text-gray-700 mt-2.5 bg-white/90 px-3 py-1.5 rounded-full shadow-sm">Tap to reveal QR code</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {qrRevealed ? (
                            <div className="space-y-3">
                              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                                <p className="text-xs font-semibold text-purple-800">Scan with GPay, PhonePe, Paytm or any UPI app</p>
                                <p className="text-xs text-purple-500 mt-0.5">Amount: {fmt(payAmount)} · School Fee Payment</p>
                              </div>
                              <button
                                onClick={() => setPayStep('txn')}
                                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-sm font-bold">
                                ✓ Payment Done — Enter Transaction ID
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 text-center">Tap the QR above to reveal</p>
                          )}

                          <button onClick={() => { setPayStep('form'); setQrRevealed(false) }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            Back
                          </button>
                        </div>
                      )}

                      {/* Step 3: Paste UPI Transaction ID */}
                      {payStep === 'txn' && (
                        <div className="space-y-4">
                          <div className="text-center">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <p className="text-sm font-bold text-gray-800">Payment Done! Enter Transaction ID</p>
                            <p className="text-xs text-gray-400 mt-1">Copy the UPI transaction ID from your GPay / PhonePe / Paytm receipt and paste it below</p>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">UPI Transaction ID</label>
                            <input
                              type="text"
                              placeholder="e.g. 4278563901234567 or T2506161234..."
                              value={payUPI}
                              onChange={e => setPayUPI(e.target.value)}
                              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <p className="text-xs text-gray-400 mt-1">Found in your UPI app under payment history / receipt</p>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
                            <p><span className="font-semibold text-gray-700">Amount:</span> {fmt(payAmount)}</p>
                            <p><span className="font-semibold text-gray-700">Purpose:</span> School Fee Payment</p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => submitPayment(payUPI || undefined)}
                              disabled={payLoading || !payUPI.trim()}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-40">
                              {payLoading ? 'Submitting…' : 'Submit for Verification'}
                            </button>
                            <button onClick={() => setPayStep('qr')} className="px-4 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50">
                              Back
                            </button>
                          </div>

                          <p className="text-xs text-gray-400 text-center">School admin will verify your transaction ID and confirm the payment</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ledger with checkboxes */}
                {feeLedger.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                    <p className="text-gray-400 text-sm">{T.noFeeEntries(feeAcYear)}</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{T.feeLedger} — {feeAcYear}</p>
                      {feeLedger.some(e => ['pending','partial','overdue'].includes(e.status)) && !payingLedger && (
                        <button
                          onClick={() => {
                            const pendingIds = feeLedger.filter(e => ['pending','partial','overdue'].includes(e.status)).map(e => e.id)
                            const totalBal = feeLedger.filter(e => ['pending','partial','overdue'].includes(e.status)).reduce((s, e) => s + Number(e.balance), 0)
                            setSelectedLedgerIds(new Set(pendingIds))
                            setPayAmount(String(totalBal))
                            setPayingLedger({ id: -1 } as FeeLedger)
                          }}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 font-medium"
                        >
                          Pay All Pending
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {feeLedger.map(entry => {
                        const isPending = ['pending','partial','overdue'].includes(entry.status)
                        const isSelected = selectedLedgerIds.has(entry.id)
                        return (
                          <div key={entry.id} className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                            {isPending && !payingLedger && (
                              <input type="checkbox" checked={isSelected}
                                onChange={e => {
                                  const next = new Set(selectedLedgerIds)
                                  if (e.target.checked) next.add(entry.id)
                                  else next.delete(entry.id)
                                  setSelectedLedgerIds(next)
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0" />
                            )}
                            {(!isPending || payingLedger) && <div className="w-4 flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">{entry.category_name}</p>
                              <p className="text-xs text-gray-400">{entry.period_label} · {T.dueDate} {entry.due_date}</p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-bold text-gray-800">{fmt(entry.amount_due)}</p>
                                {Number(entry.balance) > 0 && <p className="text-xs text-red-500">{T.balance} {fmt(entry.balance)}</p>}
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[entry.status] || 'bg-gray-100 text-gray-600'}`}>
                                {entry.status}
                              </span>
                              {isPending && !payingLedger && selectedLedgerIds.size === 0 && (
                                <button onClick={() => { setPayingLedger(entry); setPayAmount(String(entry.balance)); setSelectedLedgerIds(new Set()) }}
                                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 font-medium">
                                  {T.pay}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Waivers / concessions */}
                {feeWaivers.length > 0 && (
                  <div className="bg-purple-50 rounded-xl border border-purple-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-purple-100">
                      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Fee Concessions / Waivers</p>
                    </div>
                    <div className="divide-y divide-purple-50">
                      {feeWaivers.map(w => (
                        <div key={w.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{w.category_name} · {w.period_label}</p>
                            <p className="text-xs text-gray-400">{w.reason}{w.granted_by_name ? ` · Approved by ${w.granted_by_name}` : ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-purple-700">−{fmt(w.waiver_amount)}</p>
                            <p className="text-[10px] text-purple-400 capitalize">{w.waiver_type.replace('_', ' ')} waiver</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment history */}
                {feePayments.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{T.paymentHistory}</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {feePayments.map(pmt => (
                        <div key={pmt.id} className={`px-4 py-3 ${pmt.payment_status === 'rejected' ? 'bg-red-50' : ''}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">{pmt.category_name} · {pmt.period_label}</p>
                              <p className="text-xs text-gray-400">{pmt.paid_date} · {pmt.payment_mode.toUpperCase()}{pmt.transaction_ref ? ` · ${pmt.transaction_ref}` : ''}</p>
                              {pmt.payment_status === 'rejected' && pmt.rejection_reason && (
                                <p className="text-xs text-red-600 mt-1 font-medium">Rejected: {pmt.rejection_reason}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-green-700">{fmt(pmt.amount)}</p>
                              <div className="flex items-center gap-1.5 justify-end mt-0.5">
                                <span className="text-[10px] font-mono text-gray-400">{pmt.receipt_number}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  pmt.payment_status === 'completed'           ? 'bg-green-100 text-green-700' :
                                  pmt.payment_status === 'rejected'            ? 'bg-red-100 text-red-600' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {pmt.payment_status === 'pending_verification' ? T.pendingVerify :
                                   pmt.payment_status === 'rejected' ? 'Rejected' : T.confirmed}
                                </span>
                              </div>
                              {pmt.payment_status === 'completed' && (
                                <button
                                  onClick={() => printParentReceipt(pmt)}
                                  className="mt-1 text-[10px] text-blue-600 hover:text-blue-800 underline"
                                >
                                  Download Receipt
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* ── EXAM CALENDAR ─────────────────────────────────────────────── */}
          {visited.has('exams') && (
          <div hidden={activeNav !== 'exams'} className="max-w-3xl space-y-4">
            <h2 className="text-base font-bold text-gray-800">{T.examCalendar}</h2>
            {summary?.upcoming_exams && summary.upcoming_exams.length > 0 ? (
              <div className="space-y-3">
                {summary.upcoming_exams.map(e => {
                  const days = Math.round((new Date(e.exam_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                  return (
                    <div key={e.id} className={`bg-white rounded-xl border p-4 ${days <= 3 ? 'border-red-200' : days <= 7 ? 'border-amber-200' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{e.exam_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{EXAM_TYPE_LABELS[e.exam_type] || e.exam_type} · Grade {student.grade}-{student.section}</p>
                          {e.subjects.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {e.subjects.map(s => (
                                <span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-sm font-bold text-gray-700">{new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          <p className={`text-xs font-bold mt-0.5 ${days === 0 ? 'text-red-600' : days <= 3 ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {days === 0 ? `${T.today}!` : days === 1 ? T.tomorrow : T.daysAway(days)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-gray-400 text-sm">{T.noUpcomingExams}</p>
              </div>
            )}
          </div>
          )}

          {/* ── RESULTS ───────────────────────────────────────────────────── */}
          {visited.has('results') && (
          <div hidden={activeNav !== 'results'} className="max-w-2xl space-y-4">
            <h2 className="text-base font-bold text-gray-800">{T.nav.results} & {T.parentSignoff}</h2>
            {(!summary?.published_results || summary.published_results.length === 0) ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                <p className="text-gray-400 text-sm">{T.noResults}</p>
              </div>
            ) : summary.published_results.map(r => {
              const p = r.total_obtained !== null && r.total_max ? Math.round((r.total_obtained / r.total_max) * 100) : null
              const pass = p !== null ? p >= r.passing_pct : null
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{r.exam_name}</p>
                      <p className="text-xs text-gray-400">{EXAM_TYPE_LABELS[r.exam_type] || r.exam_type} · {r.exam_date}</p>
                    </div>
                    <div className="text-right">
                      {p !== null && (
                        <>
                          <div className={`text-xl font-black ${pass ? 'text-green-600' : 'text-red-600'}`}>{p}%</div>
                          <div className={`text-xs font-bold ${pass ? 'text-green-500' : 'text-red-400'}`}>{pass ? T.passing.toUpperCase() : 'FAIL'} · {r.total_obtained}/{r.total_max}</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    {r.parent_acknowledged ? (
                      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {T.acknowledged}
                      </div>
                    ) : ackingId === r.id ? (
                      <div className="space-y-2">
                        <input type="text" placeholder={`${T.yourName} *`} value={ackName}
                          onChange={e => setAckName(e.target.value)}
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        {ackError && <p className="text-xs text-red-600">{ackError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => acknowledgeMarks(r.id)} disabled={ackSaving}
                            className="flex-1 bg-blue-600 text-white text-sm rounded-lg py-2 font-semibold disabled:opacity-50">
                            {ackSaving ? T.saving : T.confirm}
                          </button>
                          <button onClick={() => { setAckingId(null); setAckName(''); setAckError('') }}
                            className="px-4 text-sm text-gray-500 border border-gray-200 rounded-lg">{T.cancel}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAckingId(r.id)}
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-amber-300 text-amber-700 text-xs font-semibold rounded-lg py-2 hover:bg-amber-50 transition-colors">
                        ✍ {T.signoffHint}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          )}


        </main>
      </div>
    </div>
  )
}
