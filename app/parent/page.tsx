'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { TRANSLATIONS, type Lang } from './translations'
import ParentMarketplace from './components/ParentMarketplace'
import ParentSyllabus from './components/ParentSyllabus'

// ── Types ─────────────────────────────────────────────────────────────────────
type Student = {
  id: number; name: string; grade: string; section: string
  roll_number: string; school_id: number; class_id: number
  parent_name: string | null; parent_phone: string | null
}
type School = { id: number; name: string; city: string }

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
  transaction_ref: string | null
}
type FeeSummary = { total_due: number; total_paid: number; total_outstanding: number; overdue_count: number }

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
  { key: 'overview',    label: 'Overview',         icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'today',       label: "Today's Schedule",  icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'syllabus',    label: 'Syllabus',          icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { key: 'attendance',  label: 'Attendance',        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { key: 'fees',        label: 'Fees',              icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'exams',       label: 'Exam Calendar',     icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { key: 'results',     label: 'Results',           icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'weekly-tests', label: 'Weekly Tests',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { key: 'activity',    label: 'Activity Log',      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'ai-chats',    label: 'AI Chat History',   icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { key: 'marketplace', label: 'Marketplace',        icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
]

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
  const [step, setStep]       = useState<'school' | 'auth' | 'portal'>('school')
  const [schools, setSchools] = useState<School[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [loadingSchools, setLoadingSchools] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [rollNumber, setRollNumber] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [authError, setAuthError]   = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [student, setStudent] = useState<Student | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [activeNav, setActiveNav] = useState('overview')
  const [visited, setVisited] = useState<Set<string>>(new Set(['overview']))

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
  const [feeSummary, setFeeSummary] = useState<FeeSummary | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeAcYear, setFeeAcYear] = useState('')
  const [feeAcYears, setFeeAcYears] = useState<string[]>([])
  const [payingLedger, setPayingLedger] = useState<FeeLedger | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payUPI, setPayUPI] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [paySuccess, setPaySuccess] = useState<{ receipt_number: string } | null>(null)

  const [activity, setActivity] = useState<Activity[]>([])
  const [actSummary, setActSummary] = useState<ActivitySummary | null>(null)
  const [actLoading, setActLoading] = useState(false)
  const [actDays, setActDays] = useState(7)

  type WeeklyTestHistory = { id: number; week_start: string; status: string; score: number | null; max_score: number | null; submitted_at: string | null }
  const [weeklyTests, setWeeklyTests] = useState<WeeklyTestHistory[]>([])
  const [weeklyTestsLoading, setWeeklyTestsLoading] = useState(false)

  type AIChatSession = { id: number; subject: string | null; messages: { role: string; content: string }[]; created_at: string }
  const [aiChatSessions, setAiChatSessions] = useState<AIChatSession[]>([])
  const [aiChatsLoading, setAiChatsLoading] = useState(false)
  const [aiChatExpanded, setAiChatExpanded] = useState<number | null>(null)

  const loadWeeklyTests = useCallback(async (s: Student) => {
    setWeeklyTestsLoading(true)
    try {
      const r = await fetch(`/api/weekly-test/history?student_id=${s.id}&school_id=${s.school_id}&limit=10`)
      const d = await r.json()
      setWeeklyTests(d.tests || [])
    } catch { setWeeklyTests([]) }
    setWeeklyTestsLoading(false)
  }, [])

  const loadAiChats = useCallback(async (s: Student) => {
    setAiChatsLoading(true)
    try {
      const r = await fetch(`/api/ai/chat-sessions?school_id=${s.school_id}&student_id=${s.id}&limit=20`)
      const d = await r.json()
      setAiChatSessions(d.sessions || [])
    } catch { setAiChatSessions([]) }
    setAiChatsLoading(false)
  }, [])

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

  function navigateTo(key: string) {
    setActiveNav(key)
    setVisited(prev => new Set([...prev, key]))
    setSidebarOpen(false)
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
      setFeeSummary(d.summary || null)
    } catch { setFeeLedger([]); setFeePayments([]) }
    setFeeLoading(false)
  }, [])

  const loadActivity = useCallback(async (s: Student, days = 7) => {
    setActLoading(true)
    try {
      const r = await fetch(`/api/parent/activity?school_id=${s.school_id}&student_id=${s.id}&days=${days}`)
      const d = await r.json()
      setActivity(d.activity || [])
      setActSummary(d.summary || null)
    } catch { setActivity([]) }
    setActLoading(false)
  }, [])

  // Load section data on first visit
  useEffect(() => {
    if (!student) return
    if (activeNav === 'today' && !timetable.length && !timetableLoading) loadTimetable(student)
    if (activeNav === 'attendance' && !attDays.length && !attLoading) loadAttendance(student)
    if (activeNav === 'fees' && !feeLedger.length && !feeLoading) loadFees(student, feeAcYear)
    if (activeNav === 'weekly-tests' && !weeklyTests.length && !weeklyTestsLoading) loadWeeklyTests(student)
    if (activeNav === 'activity' && !activity.length && !actLoading) loadActivity(student, actDays)
    if (activeNav === 'ai-chats' && !aiChatSessions.length && !aiChatsLoading) loadAiChats(student)
  }, [activeNav, student]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth ──────────────────────────────────────────────────────────────────────
  async function searchSchools(q: string) {
    setSchoolSearch(q)
    if (q.length < 2) { setSchools([]); return }
    setLoadingSchools(true)
    try {
      const res = await fetch(`/api/schools?search=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSchools(Array.isArray(data) ? data.slice(0, 8) : [])
    } catch { setSchools([]) }
    setLoadingSchools(false)
  }

  async function handleAuth() {
    if (!selectedSchool || !rollNumber.trim() || !parentPhone.trim()) return
    setAuthLoading(true); setAuthError('')
    try {
      const res = await fetch('/api/parent/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: selectedSchool.id, roll_number: rollNumber.trim(), parent_phone: parentPhone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthError(data.error || 'Not found'); setAuthLoading(false); return }
      setStudent(data.student)
      await loadSummary(data.student)
      // Load weekly tests eagerly so overview card shows immediately
      loadWeeklyTests(data.student)
      // Load academic years for fee selector
      Promise.all([
        fetch(`/api/academic-year/current?school_id=${data.student.school_id}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/academic-years?school_id=${data.student.school_id}`).then(r => r.ok ? r.json() : []),
      ]).then(([current, all]) => {
        const allLabels: string[] = Array.isArray(all) ? all.map((y: { label: string }) => y.label) : []
        const currentLabel: string = current?.label ?? allLabels[0] ?? '2025-26'
        if (!allLabels.length) allLabels.push(currentLabel)
        setFeeAcYears(allLabels)
        setFeeAcYear(currentLabel)
      }).catch(() => { setFeeAcYears(['2025-26']); setFeeAcYear('2025-26') })
      setStep('portal')
    } catch { setAuthError('Connection error. Please try again.') }
    setAuthLoading(false)
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

  async function submitPayment() {
    if (!student || !payingLedger) return
    setPayLoading(true)
    try {
      const r = await fetch('/api/parent/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: student.school_id, student_id: student.id,
          ledger_id: payingLedger.id, amount: parseFloat(payAmount), upi_id: payUPI,
        }),
      })
      const d = await r.json()
      if (r.ok) {
        setPaySuccess({ receipt_number: d.receipt_number })
        setPayingLedger(null); setPayAmount(''); setPayUPI('')
        loadFees(student, feeAcYear)
      }
    } catch { /* silent */ }
    setPayLoading(false)
  }

  // ── School search ─────────────────────────────────────────────────────────────
  if (step === 'school') return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">{T.home}</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-semibold text-gray-800">{T.parentPortal}</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['en', 'te'] as Lang[]).map(l => (
              <button key={l} onClick={() => changeLang(l)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${lang === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {l === 'en' ? 'EN' : 'తె'}
              </button>
            ))}
          </div>
          <span className="bg-pink-100 text-pink-700 text-xs font-medium px-3 py-1 rounded-full">Parent</span>
        </div>
      </div>
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{T.parentPortal}</h2>
          <p className="text-gray-500 text-sm">{T.tagline}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-2">{T.searchSchool}</label>
          <input type="text" placeholder={T.typeSchool} value={schoolSearch}
            onChange={e => searchSchools(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
          {loadingSchools && <p className="text-xs text-gray-400 mt-2">{T.searching}</p>}
          {schools.length > 0 && (
            <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
              {schools.map(s => (
                <button key={s.id} onClick={() => { setSelectedSchool(s); setSchoolSearch(s.name); setSchools([]); setStep('auth') }}
                  className="w-full text-left px-4 py-3 hover:bg-pink-50 transition-colors">
                  <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.city}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ── Auth ──────────────────────────────────────────────────────────────────────
  if (step === 'auth') return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => setStep('school')} className="text-gray-400 hover:text-gray-600 text-sm">{T.back}</button>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-semibold text-gray-800">{selectedSchool?.name}</h1>
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['en', 'te'] as Lang[]).map(l => (
            <button key={l} onClick={() => changeLang(l)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${lang === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {l === 'en' ? 'EN' : 'తె'}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{T.verifyChild}</h2>
          <p className="text-sm text-gray-500 mb-6">{T.verifySubtitle}</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{T.rollNumber}</label>
              <input type="text" placeholder={T.rollPlaceholder} value={rollNumber}
                onChange={e => setRollNumber(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{T.phoneNumber}</label>
              <input type="tel" placeholder={T.phonePlaceholder} value={parentPhone}
                onChange={e => setParentPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
            </div>
            {authError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{authError}</div>}
            <button onClick={handleAuth} disabled={authLoading || !rollNumber.trim() || !parentPhone.trim()}
              className="w-full bg-pink-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 hover:bg-pink-700 transition-colors">
              {authLoading ? T.verifying : T.accessDashboard}
            </button>
          </div>
        </div>
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
            <p className="text-xs text-gray-400">{T.grade} {student.grade}-{student.section} · {selectedSchool?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <button onClick={() => { setStep('auth'); setStudent(null); setSummary(null) }}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg">
            {T.switchChild}
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-57px)] relative">
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        {/* Sidebar */}
        <nav className={`fixed inset-y-0 left-0 z-40 lg:relative lg:inset-y-auto lg:left-auto w-48 bg-white border-r border-gray-100 flex flex-col py-3 shrink-0 overflow-y-auto transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          {NAV.map(item => (
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

            {/* This week's test result — shown only after student submits */}
            {weeklyTests.length > 0 && weeklyTests[0].status === 'submitted' && (() => {
              const t = weeklyTests[0]
              const pct = t.score !== null && t.max_score ? Math.round(t.score / t.max_score * 100) : null
              if (pct === null) return null
              const bg = pct >= 80 ? 'from-green-50 to-green-100 border-green-200' : pct >= 50 ? 'from-yellow-50 to-yellow-100 border-yellow-200' : 'from-red-50 to-red-100 border-red-200'
              const col = pct >= 80 ? 'text-green-700' : pct >= 50 ? 'text-yellow-700' : 'text-red-700'
              return (
                <button onClick={() => navigateTo('weekly-tests')}
                  className={`w-full text-left bg-gradient-to-r ${bg} border rounded-xl p-4 hover:shadow-sm transition-all`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{T.thisWeeksTest}</p>
                      <p className={`text-sm font-bold ${col}`}>
                        {pct >= 80 ? T.excellent : pct >= 50 ? T.goodEffort : T.needsRevision}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-black ${col}`}>{pct}%</p>
                      <p className="text-xs text-gray-400">{t.score}/{t.max_score}</p>
                    </div>
                  </div>
                </button>
              )
            })()}

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
          {visited.has('syllabus') && (
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
                <select value={feeAcYear} onChange={e => { setFeeAcYear(e.target.value); loadFees(student, e.target.value) }}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  {feeAcYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={() => loadFees(student, feeAcYear)} className="text-xs text-pink-600 border border-pink-200 px-3 py-1.5 rounded-lg">{T.refresh}</button>
              </div>
            </div>

            {/* Pay success */}
            {paySuccess && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-green-800">{T.paymentSuccess}</p>
                  <p className="text-xs text-green-600 mt-0.5">{T.receipt} <span className="font-mono font-bold">{paySuccess.receipt_number}</span> · {T.adminVerify}</p>
                </div>
                <button onClick={() => setPaySuccess(null)} className="text-green-400 hover:text-green-600 text-lg font-bold">×</button>
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
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-400">{T.totalDue}</p>
                      <p className="text-xl font-black text-gray-800 mt-1">{fmt(feeSummary.total_due)}</p>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                      <p className="text-xs text-green-600">{T.paid}</p>
                      <p className="text-xl font-black text-green-700 mt-1">{fmt(feeSummary.total_paid)}</p>
                    </div>
                    <div className={`${feeSummary.total_outstanding > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} border rounded-xl p-4 text-center`}>
                      <p className={`text-xs ${feeSummary.total_outstanding > 0 ? 'text-red-500' : 'text-gray-400'}`}>{T.outstanding}</p>
                      <p className={`text-xl font-black mt-1 ${feeSummary.total_outstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmt(feeSummary.total_outstanding)}</p>
                    </div>
                  </div>
                )}

                {/* Payment form */}
                {payingLedger && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                    <p className="text-sm font-bold text-blue-900 mb-1">{T.payOnline} — {payingLedger.category_name} · {payingLedger.period_label}</p>
                    <p className="text-xs text-blue-600 mb-4">{T.balance} {fmt(payingLedger.balance)} · {T.paymentVerifyHint}</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600">{T.amount}</label>
                          <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                            placeholder={String(payingLedger.balance)}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">{T.upiRef}</label>
                          <input type="text" value={payUPI} onChange={e => setPayUPI(e.target.value)}
                            placeholder="yourname@upi"
                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={submitPayment} disabled={payLoading || !payAmount}
                          className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                          {payLoading ? T.submitting : T.submitPayment(payAmount ? fmt(payAmount) : '₹0')}
                        </button>
                        <button onClick={() => { setPayingLedger(null); setPayAmount(''); setPayUPI('') }}
                          className="px-4 border border-gray-200 text-gray-500 rounded-lg text-sm">{T.cancel}</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ledger */}
                {feeLedger.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                    <p className="text-gray-400 text-sm">{T.noFeeEntries(feeAcYear)}</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{T.feeLedger} — {feeAcYear}</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {feeLedger.map(entry => (
                        <div key={entry.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{entry.category_name}</p>
                            <p className="text-xs text-gray-400">{entry.period_label} · {T.dueDate} {entry.due_date}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-800">{fmt(entry.amount_due)}</p>
                              {Number(entry.balance) > 0 && <p className="text-xs text-red-500">{T.balance} {fmt(entry.balance)}</p>}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[entry.status] || 'bg-gray-100 text-gray-600'}`}>
                              {entry.status}
                            </span>
                            {['pending', 'partial', 'overdue'].includes(entry.status) && !payingLedger && (
                              <button onClick={() => { setPayingLedger(entry); setPayAmount(String(entry.balance)) }}
                                className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 font-medium">
                                {T.pay}
                              </button>
                            )}
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
                        <div key={pmt.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{pmt.category_name} · {pmt.period_label}</p>
                            <p className="text-xs text-gray-400">{pmt.paid_date} · {pmt.payment_mode.toUpperCase()}{pmt.transaction_ref ? ` · ${pmt.transaction_ref}` : ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-green-700">{fmt(pmt.amount)}</p>
                            <div className="flex items-center gap-1.5 justify-end mt-0.5">
                              <span className="text-[10px] font-mono text-gray-400">{pmt.receipt_number}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[pmt.payment_status] || 'bg-gray-100 text-gray-600'}`}>
                                {pmt.payment_status === 'pending_verification' ? T.pendingVerify : T.confirmed}
                              </span>
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

          {/* ── WEEKLY TESTS ──────────────────────────────────────────────── */}
          {visited.has('weekly-tests') && (
          <div hidden={activeNav !== 'weekly-tests'} className="max-w-2xl space-y-4">
            <h2 className="text-base font-bold text-gray-800">{T.weeklyTests}</h2>
            <p className="text-xs text-gray-500">AI-generated tests from covered syllabus topics · 1 test per week</p>

            {weeklyTestsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : weeklyTests.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                <div className="text-3xl mb-2">📝</div>
                <p className="text-sm text-gray-500 font-medium">{T.noTestHistory}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {weeklyTests.map(t => {
                  const pct = t.score !== null && t.max_score ? Math.round(t.score / t.max_score * 100) : null
                  const weekLabel = new Date(t.week_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  const scoreColor = pct === null ? 'text-gray-400' : pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
                  const scoreBg    = pct === null ? 'bg-gray-50 border-gray-200' : pct >= 80 ? 'bg-green-50 border-green-200' : pct >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'
                  return (
                    <div key={t.id} className={`rounded-xl border p-4 ${scoreBg}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Week of {weekLabel}</p>
                          {t.submitted_at && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {T.submitted} {new Date(t.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                        </div>
                        {t.status === 'submitted' && pct !== null ? (
                          <div className="text-right">
                            <p className={`text-2xl font-black ${scoreColor}`}>{pct}%</p>
                            <p className="text-xs text-gray-500">{t.score}/{t.max_score}</p>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-yellow-600 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full">
                            {T.missed}
                          </span>
                        )}
                      </div>
                      {pct !== null && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${scoreColor}`}>
                            {pct >= 80 ? T.excellent : pct >= 50 ? T.goodEffort : T.needsRevision}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )}

          {/* ── ACTIVITY LOG ──────────────────────────────────────────────── */}
          {visited.has('activity') && (
          <div hidden={activeNav !== 'activity'} className="max-w-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-800">{T.activityLog}</h2>
                <p className="text-xs text-gray-400">What {student.name.split(' ')[0]} has been doing in the student portal</p>
              </div>
              <div className="flex gap-2">
                <select value={actDays} onChange={e => { const d = parseInt(e.target.value); setActDays(d); loadActivity(student, d) }}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  <option value={7}>{T.lastDays(7)}</option>
                  <option value={14}>{T.lastDays(14)}</option>
                  <option value={30}>{T.lastDays(30)}</option>
                </select>
                <button onClick={() => loadActivity(student, actDays)} className="text-xs text-pink-600 border border-pink-200 px-3 py-1.5 rounded-lg">{T.refresh}</button>
              </div>
            </div>

            {actLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-14" />
              ))}</div>
            ) : (
              <>
                {/* Activity summary */}
                {actSummary && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-xl font-black text-gray-800">{actSummary.totalSessions}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{T.sessions}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-xl font-black text-gray-800">{actSummary.totalMinutes}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{T.minutes}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-xs font-bold text-gray-700">{actSummary.lastSeen ? relTime(actSummary.lastSeen) : '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Last seen</p>
                    </div>
                  </div>
                )}

                {/* Activity type breakdown */}
                {actSummary && Object.keys(actSummary.actionTypeCounts).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity Breakdown</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(actSummary.actionTypeCounts).map(([type, count]) => (
                        <div key={type} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ACTION_LABELS[type]?.color || 'bg-gray-100 text-gray-600'}`}>
                          {ACTION_LABELS[type]?.label || type} · {count}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {activity.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                    <p className="text-gray-400 text-sm">{T.noActivity}</p>
                    <p className="text-gray-300 text-xs mt-1">Activity is logged when {student.name.split(' ')[0]} uses the student portal</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="divide-y divide-gray-50">
                      {activity.map(a => (
                        <div key={a.id} className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_LABELS[a.action_type]?.color || 'bg-gray-100 text-gray-600'}`}>
                              {ACTION_LABELS[a.action_type]?.label || a.action_type}
                            </span>
                            {a.action_detail && <span className="text-sm text-gray-700">{a.action_detail}</span>}
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 ml-3">{relTime(a.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* ── AI CHAT HISTORY ────────────────────────────────────────────── */}
          {visited.has('ai-chats') && (
          <div hidden={activeNav !== 'ai-chats'} className="max-w-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-800">{T.aiChatHistory}</h2>
                <p className="text-xs text-gray-400">{student.name.split(' ')[0]}&apos;s conversations with the AI tutor</p>
              </div>
              <button onClick={() => loadAiChats(student)} className="text-xs text-pink-600 border border-pink-200 px-3 py-1.5 rounded-lg">{T.refresh}</button>
            </div>

            {/* Info banner */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-violet-500 text-lg flex-shrink-0">✨</span>
              <div>
                <p className="text-sm font-semibold text-violet-800">AI Tutor conversations</p>
                <p className="text-xs text-violet-600 mt-0.5">Every time {student.name.split(' ')[0]} chats with the AI Tutor in their portal, those conversations are saved here so you can see what they&apos;re studying and what doubts they have.</p>
              </div>
            </div>

            {aiChatsLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-16" />
              ))}</div>
            ) : aiChatSessions.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-2xl mb-2">✨</p>
                <p className="text-gray-400 text-sm">{T.noChats}</p>
                <p className="text-gray-300 text-xs mt-1">{student.name.split(' ')[0]} hasn&apos;t used the AI Tutor yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {aiChatSessions.map(session => {
                  const msgCount = Array.isArray(session.messages) ? session.messages.length : 0
                  const firstMsg = Array.isArray(session.messages) ? session.messages.find(m => m.role === 'user') : null
                  const isOpen = aiChatExpanded === session.id
                  return (
                    <div key={session.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setAiChatExpanded(isOpen ? null : session.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-sm">✨</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {session.subject && (
                              <span className="text-[10px] bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-full">
                                {session.subject}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">{msgCount} messages</span>
                          </div>
                          {firstMsg && (
                            <p className="text-sm text-gray-700 truncate mt-0.5">{firstMsg.content}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-xs text-gray-400">{relTime(session.created_at)}</p>
                          <svg className={`w-3.5 h-3.5 text-gray-300 mt-1 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {isOpen && Array.isArray(session.messages) && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3 max-h-80 overflow-y-auto">
                          {session.messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                m.role === 'user'
                                  ? 'bg-violet-600 text-white rounded-br-sm'
                                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                              }`}>
                                {m.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )}

          {/* ── MARKETPLACE ────────────────────────────────────────────────── */}
          {visited.has('marketplace') && (
          <div hidden={activeNav !== 'marketplace'} className="max-w-2xl">
            <ParentMarketplace
              studentId={student.id}
              schoolId={student.school_id}
              studentName={student.name}
            />
          </div>
          )}

        </main>
      </div>
    </div>
  )
}
