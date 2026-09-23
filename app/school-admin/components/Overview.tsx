'use client'

import { useEffect, useState, useCallback } from 'react'
import { useFeature } from '@/lib/features-context'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowRight, CalendarDays, RefreshCw } from 'lucide-react'

type Props = { schoolId: number; onNavigate?: (key: string) => void }

type Stats          = { teachers: number; students: number; classes: number }
type AttendanceSummary = { class_id: number; grade: string; section: string; morning_present: number; morning_absent: number; morning_total: number; morning_marked: boolean }
type ExamRow           = { id: number; exam_name: string; exam_date: string; exam_type: string; grade: string; section: string }

function StatCard({ label, value, sub, onClick }: {
  label: string; value: number | string; sub?: string; color: string; bg: string; border: string; onClick?: () => void
}) {
  return (
    <button onClick={onClick} className="group portal-metric min-w-0 text-left transition-colors hover:bg-[#eef2eb]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#67736b]">{label}</p>
        <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-[#67736b] transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-[#202a25] tabular-nums sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs leading-relaxed text-[#67736b]">{sub}</p>}
    </button>
  )
}

function HealthBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="portal-metric" role="status" aria-busy="true" aria-label="Loading school summary">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-7 w-16 mb-2" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  )
}

export default function Overview({ schoolId, onNavigate }: Props) {
  // Feature flags — only fetch/render what this plan allows
  const hasAttendance     = useFeature('attendance')
  const hasExams          = useFeature('exam-marks')
  const hasFeeManagement  = useFeature('fee-management')

  const [stats, setStats]                     = useState<Stats>({ teachers: 0, students: 0, classes: 0 })
  const [attendance, setAttendance]           = useState<AttendanceSummary[]>([])
  const [attHoliday, setAttHoliday]           = useState<{ kind: string; title: string } | null>(null)
  const [upcomingExams, setUpcomingExams]     = useState<ExamRow[]>([])
  const [feeOverdue, setFeeOverdue]           = useState(0)
  const [feeOutstanding, setFeeOutstanding]   = useState(0)
  const [loading, setLoading]                 = useState(true)
  const [currentYear, setCurrentYear]         = useState<string | null>(null)

  const load = useCallback(async (year?: string) => {
    setLoading(true)
    const todayStr = new Date().toISOString().split('T')[0]
    const yearToUse = year ?? currentYear ?? '2025-26'

    // Build features list for batched API — only request what's enabled
    const featuresList = [
      hasAttendance  && 'attendance',
      hasExams       && 'exams',
      hasFeeManagement && 'fees',
    ].filter(Boolean).join(',')

    try {
      const res = await fetch(
        `/api/admin/overview?school_id=${schoolId}&features=${featuresList}&date=${todayStr}&year=${yearToUse}`
      )
      if (!res.ok) throw new Error('overview fetch failed')
      const d = await res.json()

      // Core
      setStats({
        teachers:     d.core?.teachers     ?? 0,
        students:     d.core?.students     ?? 0,
        classes:      d.core?.classes      ?? 0,
      })

      // Feature-gated
      if (d.attendance !== null) setAttendance(Array.isArray(d.attendance) ? d.attendance : [])
      setAttHoliday(d.attendance_holiday ?? null)
      if (d.exams      !== null) setUpcomingExams(Array.isArray(d.exams) ? d.exams : [])
      if (d.fees       !== null) {
        setFeeOverdue(Number(d.fees?.overdue_count) || 0)
        setFeeOutstanding(Number(d.fees?.total_outstanding) || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [schoolId, hasAttendance, hasExams, hasFeeManagement])

  // Fetch current academic year once, then load overview with it
  useEffect(() => {
    fetch(`/api/academic-year/current?school_id=${schoolId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const label = d?.label ?? null
        setCurrentYear(label)
        load(label ?? undefined)
      })
      .catch(() => load())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId])


  const todayLabel   = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
  const attMarked    = attendance.filter(a => a.morning_marked).length
  const attTotal     = attendance.length
  const attPresent   = attendance.reduce((s, a) => s + (a.morning_present || 0), 0)
  const attStudents  = attendance.reduce((s, a) => s + (a.morning_total || 0), 0)
  const attPct       = attStudents > 0 ? Math.round((attPresent / attStudents) * 100) : null
  // On a holiday / weekly off nothing is expected, so nothing is "not marked".
  const attNotMarked = attHoliday ? 0 : attTotal - attMarked
  const alertCount = attNotMarked + (hasFeeManagement && feeOverdue > 0 ? 1 : 0)

  // Count cards (shown at bottom)
  const countCards = [
    { label: 'Teachers', value: stats.teachers, sub: 'Active staff',   color: 'text-[#235b46]',    bg: 'bg-blue-50',    border: 'border-blue-200',    nav: 'teachers' },
    { label: 'Students', value: stats.students, sub: 'Enrolled',       color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', nav: 'students' },
    { label: 'Classes',  value: stats.classes,  sub: 'Configured',     color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-200',  nav: 'class-management' },
  ]

  // Feature metric cards (shown as KPI row)
  const metricCards = [
    ...(hasAttendance ? [{
      label: "Today's Attendance",
      value: attPct !== null ? `${attPct}%` : '—',
      sub: attPct !== null ? `${attPresent} of ${attStudents} present` : 'Not yet marked',
      color: attPct !== null ? (attPct >= 80 ? 'text-emerald-600' : attPct >= 60 ? 'text-amber-600' : 'text-red-600') : 'text-[#67736b]',
      bg: 'bg-gray-50', border: 'border-gray-200', nav: 'attendance',
    }] : []),
    ...(hasFeeManagement ? [{
      label: 'Fee Outstanding',
      value: feeOutstanding > 0 ? `₹${Number(feeOutstanding).toLocaleString('en-IN')}` : '₹0',
      sub: feeOverdue > 0 ? `${feeOverdue} overdue entr${feeOverdue > 1 ? 'ies' : 'y'}` : 'All clear',
      color: feeOverdue > 0 ? 'text-red-600' : 'text-green-600',
      bg: feeOverdue > 0 ? 'bg-red-50' : 'bg-green-50',
      border: feeOverdue > 0 ? 'border-red-200' : 'border-green-200',
      nav: 'fee-management',
    }] : []),
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-7">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-medium text-[#67736b]">School workspace</p>
          <h1 className="portal-section-heading">School overview</h1>
          <p className="text-sm leading-relaxed text-[#67736b] mt-1.5">
            {todayLabel}
            {!loading && alertCount > 0 && ` · ${alertCount} item${alertCount > 1 ? 's' : ''} need attention`}
            {!loading && alertCount === 0 && ' · All clear today'}
          </p>
        </div>
        <button onClick={() => load()} aria-label="Refresh school overview"
          className="flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-[#dce2db] bg-white px-3 text-sm text-[#465449] transition-colors hover:bg-[#eef2eb]">
          <RefreshCw size={15} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* ── Alert strip (feature-gated) ── */}
      {!loading && (
        <div className="space-y-2">
          {hasAttendance && attHoliday && (
            <div data-testid="overview-holiday-banner" className="bg-[#eef2eb] border border-[#dce2db] rounded-md px-4 py-3 flex items-center gap-3 text-[#465449]">
              <CalendarDays size={18} className="shrink-0" aria-hidden="true" />
              <p className="text-sm font-medium text-[#465449]">
                Today is {attHoliday.kind === 'holiday' ? `a holiday — ${attHoliday.title}` : 'a weekly off'}. Attendance is not taken.
              </p>
            </div>
          )}
          {hasAttendance && attNotMarked > 0 && (
            <div className="bg-[#eef4ee] border border-[#d7e5d9] rounded-md px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#e0eadf] text-[#235b46] flex items-center justify-center text-sm font-bold flex-shrink-0">{attNotMarked}</span>
                <p className="text-sm font-semibold text-[#235b46]">{attNotMarked} class{attNotMarked > 1 ? 'es haven\'t' : ' hasn\'t'} marked attendance today</p>
              </div>
              <button onClick={() => onNavigate?.('attendance')}
                className="text-xs font-semibold text-[#235b46] hover:text-[#235b46] border border-blue-200 hover:border-blue-400 min-h-10 px-3 py-1.5 rounded-md transition-colors flex-shrink-0">
                View →
              </button>
            </div>
          )}
          {hasFeeManagement && feeOverdue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{feeOverdue}</span>
                <div>
                  <p className="text-sm font-semibold text-red-800">{feeOverdue} overdue fee entr{feeOverdue > 1 ? 'ies' : 'y'}</p>
                  <p className="text-xs text-red-500">
                    ₹{Number(feeOutstanding).toLocaleString('en-IN')} outstanding
                  </p>
                </div>
              </div>
              <button onClick={() => onNavigate?.('fee-management')}
                className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 min-h-10 px-3 py-1.5 rounded-md transition-colors flex-shrink-0">
                Collect Fees →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Quick actions ── */}
      {!loading && (() => {
        const quickActions = [
          { label: 'Mark Attendance',  sub: 'Daily register',                 nav: 'attendance',      color: 'bg-[#235b46]',    show: hasAttendance },
          { label: 'Collect Fees',     sub: feeOverdue > 0 ? `${feeOverdue} overdue` : 'Fee management', nav: 'fee-management', color: 'bg-amber-600', show: hasFeeManagement },
        ].filter(a => a.show)

        if (quickActions.length === 0) return null
        return (
          <div className="flex flex-wrap gap-3">
            {quickActions.map(({ label, sub, nav }, index) => (
              <button key={nav} onClick={() => onNavigate?.(nav)}
                className={`flex min-h-12 flex-1 items-center justify-between gap-6 rounded-md border px-4 py-3 text-left transition-colors sm:flex-none ${index === 0 ? 'border-[#235b46] bg-[#235b46] text-white hover:bg-[#1b4837]' : 'border-[#dce2db] bg-white text-[#235b46] hover:bg-[#eef2eb]'}`}>
                <div><p className="font-semibold text-sm">{label}</p><p className={`text-xs mt-1 ${index === 0 ? 'text-[#dce9df]' : 'text-[#67736b]'}`}>{sub}</p></div>
                <ArrowRight size={17} aria-hidden="true" className="shrink-0" />
              </button>
            ))}
          </div>
        )
      })()}

      {/* ── Feature metric cards (attendance %, fees) ── */}
      {metricCards.length > 0 && (
        <div className={`grid border-y border-[#dce2db] divide-y divide-[#dce2db] sm:divide-x sm:divide-y-0 ${metricCards.length === 1 ? 'grid-cols-1' : metricCards.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
          {loading
            ? Array.from({ length: metricCards.length || 2 }).map((_, i) => <StatCardSkeleton key={i} />)
            : metricCards.map(card => (
                <StatCard key={card.nav} label={card.label} value={card.value} sub={card.sub}
                  color={card.color} bg={card.bg} border={card.border}
                  onClick={() => onNavigate?.(card.nav)} />
              ))
          }
        </div>
      )}

      {/* ── Health panels row (only panels for enabled features) ── */}
      {!loading && (hasAttendance || hasExams) && (
        <div className={`grid gap-6 ${[hasAttendance, hasExams].filter(Boolean).length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>

          {hasAttendance && (
            <section className="portal-panel p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#202a25] text-base">Attendance today</h2>
                <button onClick={() => onNavigate?.('attendance')} className="text-xs text-[#235b46] hover:text-[#173e2f] min-h-10 inline-flex items-center">View →</button>
              </div>
              {attendance.length === 0 ? (
                <p className="text-xs text-[#67736b] text-center py-4">No attendance data yet</p>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Classes marked</span>
                      <span className="font-semibold text-gray-700">{attMarked}/{attTotal}</span>
                    </div>
                    <HealthBar value={attMarked} max={attTotal} color="bg-[#5b8b65]" />
                  </div>
                  {attPct !== null && (
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Present rate</span>
                        <span className={`font-semibold ${attPct >= 80 ? 'text-emerald-600' : attPct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{attPct}%</span>
                      </div>
                      <HealthBar value={attPresent} max={attStudents}
                        color={attPct >= 80 ? 'bg-emerald-400' : attPct >= 60 ? 'bg-amber-400' : 'bg-red-400'} />
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-base font-semibold text-emerald-600">{attPresent}</p><p className="text-xs text-[#67736b]">Present</p></div>
                    <div><p className="text-base font-semibold text-red-500">{attStudents - attPresent}</p><p className="text-xs text-[#67736b]">Absent</p></div>
                    <div><p className="text-base font-semibold text-gray-500">{attNotMarked}</p><p className="text-xs text-[#67736b]">Unmarked</p></div>
                  </div>
                </div>
              )}
            </section>
          )}

          {hasExams && (
            <section className="portal-panel p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#202a25] text-base">Upcoming exams</h2>
                <button onClick={() => onNavigate?.('exam-schedule')} className="text-xs text-[#235b46] hover:text-[#173e2f] min-h-10 inline-flex items-center">View all →</button>
              </div>
              {upcomingExams.length === 0 ? (
                <p className="text-xs text-[#67736b] text-center py-4">No exams in next 7 days</p>
              ) : (
                <div className="space-y-2">
                  {upcomingExams.map(e => {
                    const d = new Date(e.exam_date)
                    const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    const isToday = e.exam_date.slice(0, 10) === new Date().toISOString().slice(0, 10)
                    return (
                      <div key={e.id} className={`flex items-center gap-3 p-2 rounded-lg ${isToday ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50'}`}>
                        <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${isToday ? 'bg-[#235b46] text-white' : 'bg-gray-100 text-gray-600'}`}>
                          <span className="text-xs font-bold leading-none">{label.split(' ')[1]}</span>
                          <span className="text-sm font-semibold leading-none">{label.split(' ')[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{e.exam_name}</p>
                          <p className="text-xs text-[#67736b]">Grade {e.grade} · {e.exam_type}</p>
                        </div>
                        {isToday && <span className="text-[11px] font-bold bg-[#235b46] text-white px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0">TODAY</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ── Count cards (teachers / students / classes) at bottom ── */}
      <div>
        <h2 className="text-base text-[#202a25] font-semibold mb-3">School summary</h2>
        <div className="grid grid-cols-1 divide-y divide-[#dce2db] border-y border-[#dce2db] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
            : countCards.map(card => (
                <StatCard key={card.nav} label={card.label} value={card.value} sub={card.sub}
                  color={card.color} bg={card.bg} border={card.border}
                  onClick={() => onNavigate?.(card.nav)} />
              ))
          }
        </div>
      </div>

    </div>
  )
}
