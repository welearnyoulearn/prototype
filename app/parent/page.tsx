'use client'

import { useState } from 'react'
import Link from 'next/link'
import TestCalendar from '../components/TestCalendar'

type Student = {
  id: number
  name: string
  grade: string
  section: string
  roll_number: string
  school_id: number
  class_id: number
  parent_name: string | null
  parent_phone: string | null
}

type ExamResult = {
  id: number
  exam_name: string
  exam_type: string
  exam_date: string
  passing_pct: number
  total_obtained: number | null
  total_max: number | null
  parent_acknowledged: boolean
}

type Summary = {
  upcoming_exams: Array<{
    id: number; exam_name: string; exam_type: string; exam_date: string
    subjects: string[]; status: string; grade: string; section: string
    total_subjects: number; submitted_subjects: number; class_id: number
  }>
  published_results: ExamResult[]
  unacknowledged_count: number
  recent_tasks: Array<{ title: string; due_date: string; task_type: string; submitted: boolean }>
  attendance_pct: number | null
}

type School = { id: number; name: string; city: string }

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test', mid_term: 'Mid Term', final_exam: 'Final Exam', practical: 'Practical'
}

const NAV = [
  { key: 'overview',  label: 'Overview',       icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'exams',     label: 'Exam Calendar',  icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { key: 'results',   label: 'Results',        icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
]

export default function ParentDashboard() {
  const [step, setStep]         = useState<'school' | 'auth' | 'portal'>('school')
  const [schools, setSchools]   = useState<School[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [loadingSchools, setLoadingSchools] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [rollNumber, setRollNumber]   = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [authError, setAuthError]     = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [student, setStudent]         = useState<Student | null>(null)
  const [summary, setSummary]         = useState<Summary | null>(null)
  const [activeNav, setActiveNav]     = useState('overview')
  const [visitedNav, setVisitedNav]   = useState<Set<string>>(new Set(['overview']))
  function navigateTo(key: string) { setActiveNav(key); setVisitedNav(prev => new Set([...prev, key])) }
  const [ackingId, setAckingId]       = useState<number | null>(null)
  const [ackName, setAckName]         = useState('')
  const [ackSaving, setAckSaving]     = useState(false)
  const [ackError, setAckError]       = useState('')

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
      setStep('portal')
    } catch { setAuthError('Connection error. Please try again.') }
    setAuthLoading(false)
  }

  async function loadSummary(s: Student) {
    try {
      const res = await fetch(`/api/parent/child-summary?school_id=${s.school_id}&student_id=${s.id}&class_id=${s.class_id}`)
      const data = await res.json()
      setSummary(data)
    } catch { /* non-critical */ }
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

  // ── School search step ─────────────────────────────────────────────────────
  if (step === 'school') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Home</Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-lg font-semibold text-gray-800">Parent Dashboard</h1>
          <span className="bg-pink-100 text-pink-700 text-xs font-medium px-3 py-1 rounded-full ml-auto">Parent</span>
        </div>
        <div className="max-w-md mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Parent Portal</h2>
            <p className="text-gray-500 text-sm">Track your child&apos;s academics, exams, and results</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search your school</label>
            <input
              type="text"
              placeholder="Type school name..."
              value={schoolSearch}
              onChange={e => searchSchools(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />

            {loadingSchools && <p className="text-xs text-gray-400 mt-2">Searching...</p>}

            {schools.length > 0 && (
              <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                {schools.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSchool(s); setSchoolSearch(s.name); setSchools([]); setStep('auth') }}
                    className="w-full text-left px-4 py-3 hover:bg-pink-50 transition-colors"
                  >
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
  }

  // ── Auth step ──────────────────────────────────────────────────────────────
  if (step === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <button onClick={() => setStep('school')} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
          <span className="text-gray-300">|</span>
          <h1 className="text-lg font-semibold text-gray-800">{selectedSchool?.name}</h1>
        </div>
        <div className="max-w-md mx-auto px-6 py-16">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Verify your child</h2>
            <p className="text-sm text-gray-500 mb-6">Enter your child&apos;s roll number and your registered phone number</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Child&apos;s Roll Number</label>
                <input
                  type="text"
                  placeholder="e.g. 2024-08A-001"
                  value={rollNumber}
                  onChange={e => setRollNumber(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Phone Number</label>
                <input
                  type="tel"
                  placeholder="Registered parent phone"
                  value={parentPhone}
                  onChange={e => setParentPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
              {authError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                  {authError}
                </div>
              )}
              <button
                onClick={handleAuth}
                disabled={authLoading || !rollNumber.trim() || !parentPhone.trim()}
                className="w-full bg-pink-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 hover:bg-pink-700 transition-colors"
              >
                {authLoading ? 'Verifying...' : 'Access Dashboard'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Portal ─────────────────────────────────────────────────────────────────
  if (!student) return null

  const pct = summary?.published_results[0]
    ? Math.round((summary.published_results[0].total_obtained! / summary.published_results[0].total_max!) * 100)
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Home</Link>
          <span className="text-gray-300">|</span>
          <div>
            <p className="text-sm font-bold text-gray-900">{student.name}</p>
            <p className="text-xs text-gray-400">Grade {student.grade}-{student.section} · Roll {student.roll_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {summary?.unacknowledged_count ? (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
              {summary.unacknowledged_count} result{summary.unacknowledged_count > 1 ? 's' : ''} to sign
            </span>
          ) : null}
          <button
            onClick={() => { setStep('auth'); setStudent(null); setSummary(null) }}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg"
          >
            Switch child
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <nav className="w-48 bg-white border-r border-gray-100 flex flex-col py-4 shrink-0">
          {NAV.map(item => (
            <button
              key={item.key}
              onClick={() => navigateTo(item.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors mx-2 rounded-lg ${
                activeNav === item.key ? 'bg-pink-50 text-pink-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">

          {/* ── Overview ──────────────────────────────────────────────── */}
          {visitedNav.has('overview') && (
          <div hidden={activeNav !== 'overview'}>
            <div className="space-y-5 max-w-3xl">
              {/* Child card */}
              <div className="bg-gradient-to-r from-pink-500 to-purple-600 rounded-2xl p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-pink-200 text-xs font-semibold uppercase tracking-wide mb-1">Your Child</p>
                    <h2 className="text-xl font-black">{student.name}</h2>
                    <p className="text-pink-200 text-sm mt-0.5">
                      Grade {student.grade} · Section {student.section} · Roll {student.roll_number}
                    </p>
                  </div>
                  <div className="text-right">
                    {summary?.attendance_pct !== null && summary?.attendance_pct !== undefined && (
                      <div>
                        <div className="text-3xl font-black">{summary.attendance_pct}%</div>
                        <div className="text-pink-200 text-xs">Attendance</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-black text-blue-600">
                    {summary?.upcoming_exams?.length ?? 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Upcoming Exams</div>
                </div>
                <div className={`bg-white rounded-xl border p-4 text-center ${summary?.unacknowledged_count ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                  <div className={`text-2xl font-black ${summary?.unacknowledged_count ? 'text-red-600' : 'text-gray-600'}`}>
                    {summary?.unacknowledged_count ?? 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Pending Sign-off</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-black text-purple-600">
                    {pct !== null && !isNaN(pct) ? `${pct}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Latest Score</div>
                </div>
              </div>

              {/* Upcoming exams */}
              {summary?.upcoming_exams && summary.upcoming_exams.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-bold text-gray-800 mb-3">Upcoming Exams</p>
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
                            <p className={`text-[10px] font-bold ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-orange-600' : 'text-gray-400'}`}>
                              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={() => navigateTo('exams')} className="mt-3 text-xs text-pink-600 font-semibold hover:underline">
                    View full calendar →
                  </button>
                </div>
              )}

              {/* Results needing sign-off */}
              {summary?.published_results.filter(r => !r.parent_acknowledged).map(r => {
                const pct = r.total_obtained !== null && r.total_max ? Math.round((r.total_obtained / r.total_max) * 100) : null
                return (
                  <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-amber-900">{r.exam_name} — Parent sign-off needed</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          {EXAM_TYPE_LABELS[r.exam_type] || r.exam_type} · {r.exam_date}
                          {pct !== null ? ` · Score: ${pct}%` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => { setAckingId(r.id); navigateTo('results') }}
                        className="shrink-0 bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-700"
                      >
                        Sign now
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Recent tasks */}
              {summary?.recent_tasks && summary.recent_tasks.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-bold text-gray-800 mb-3">Recent Tasks</p>
                  <div className="space-y-1.5">
                    {summary.recent_tasks.map((t, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm text-gray-700">{t.title}</p>
                          <p className="text-xs text-gray-400">{t.task_type} · Due {t.due_date}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                          t.submitted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {t.submitted ? 'Done' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* ── Exam Calendar ─────────────────────────────────────────── */}
          {visitedNav.has('exams') && (
          <div hidden={activeNav !== 'exams'}>
            <div className="max-w-4xl">
              <h2 className="text-base font-bold text-gray-800 mb-4">Exam Calendar</h2>
              <TestCalendar
                mode="parent"
                schoolId={student.school_id}
                classId={student.class_id}
                studentId={student.id}
              />
            </div>
          </div>
          )}

          {/* ── Results ───────────────────────────────────────────────── */}
          {visitedNav.has('results') && (
          <div hidden={activeNav !== 'results'}>
            <div className="max-w-2xl space-y-4">
              <h2 className="text-base font-bold text-gray-800">Results & Sign-off</h2>
              {(!summary?.published_results || summary.published_results.length === 0) ? (
                <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                  <p className="text-gray-400 text-sm">No published results yet</p>
                </div>
              ) : (
                summary.published_results.map(r => {
                  const pct = r.total_obtained !== null && r.total_max ? Math.round((r.total_obtained / r.total_max) * 100) : null
                  const pass = pct !== null ? pct >= r.passing_pct : null
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{r.exam_name}</p>
                          <p className="text-xs text-gray-400">{EXAM_TYPE_LABELS[r.exam_type] || r.exam_type} · {r.exam_date}</p>
                        </div>
                        <div className="text-right">
                          {pct !== null && (
                            <>
                              <div className="text-lg font-black text-gray-800">{pct}%</div>
                              <div className={`text-xs font-bold ${pass ? 'text-green-600' : 'text-red-500'}`}>
                                {pass ? 'PASS' : 'FAIL'} · {r.total_obtained}/{r.total_max}
                              </div>
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
                            You have acknowledged this result
                          </div>
                        ) : ackingId === r.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Your name (parent / guardian) *"
                              value={ackName}
                              onChange={e => setAckName(e.target.value)}
                              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                            {ackError && <p className="text-xs text-red-600">{ackError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => acknowledgeMarks(r.id)}
                                disabled={ackSaving}
                                className="flex-1 bg-blue-600 text-white text-sm rounded-lg py-2 font-semibold disabled:opacity-50"
                              >
                                {ackSaving ? 'Saving...' : 'Confirm & Sign'}
                              </button>
                              <button onClick={() => { setAckingId(null); setAckName(''); setAckError('') }}
                                className="px-4 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAckingId(r.id)}
                            className="w-full flex items-center justify-center gap-2 border border-dashed border-amber-300 text-amber-700 text-xs font-semibold rounded-lg py-2 hover:bg-amber-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            I have seen this result — tap to acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          )}
        </main>
      </div>
    </div>
  )
}
