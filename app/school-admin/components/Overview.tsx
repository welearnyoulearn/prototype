'use client'

import { useEffect, useState, useCallback } from 'react'
import { useFeature } from '@/lib/features-context'
import { Skeleton } from '@/components/ui/skeleton'

type Props = { schoolId: number; onNavigate?: (key: string) => void }

type Stats          = { teachers: number; students: number; classes: number; pendingLeaves: number }
type UncoveredPeriod = { class_id: number; grade: string; section: string; period_number: number; subject_name: string | null; time_from: string; time_to: string; teacher_id: number; teacher_name: string; department: string; leave_request_id: number; leave_type: string }
type AttendanceSummary = { class_id: number; grade: string; section: string; morning_present: number; morning_absent: number; morning_total: number; morning_marked: boolean }
type HealthTimetable   = { class_id: number; timetable_exists: boolean; conflict_count: number; no_teacher_count: number; subjects_unassigned: number }
type ExamRow           = { id: number; exam_name: string; exam_date: string; exam_type: string; grade: string; section: string }

function StatCard({ label, value, sub, color, bg, border, onClick }: {
  label: string; value: number | string; sub?: string; color: string; bg: string; border: string; onClick?: () => void
}) {
  return (
    <button onClick={onClick}
      className={`${bg} ${border} border rounded-2xl p-5 text-left w-full hover:shadow-md hover:scale-[1.02] transition-all group`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      <p className="text-[10px] text-gray-300 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to view →</p>
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
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5" role="status" aria-busy="true">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-7 w-16 mb-2" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  )
}

export default function Overview({ schoolId, onNavigate }: Props) {
  // Feature flags — only fetch/render what this plan allows
  const hasAttendance     = useFeature('attendance')
  const hasLeave          = useFeature('leave-requests')
  const hasCover          = useFeature('emergency-cover')
  const hasTimetable      = useFeature('timetable')
  const hasExams          = useFeature('exam-marks')
  const hasFeeManagement  = useFeature('fee-management')

  const [stats, setStats]                     = useState<Stats>({ teachers: 0, students: 0, classes: 0, pendingLeaves: 0 })
  const [uncovered, setUncovered]             = useState<UncoveredPeriod[]>([])
  const [attendance, setAttendance]           = useState<AttendanceSummary[]>([])
  const [timetableHealth, setTimetableHealth] = useState<HealthTimetable[]>([])
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
      hasLeave       && 'leave',
      hasCover       && 'cover',
      hasAttendance  && 'attendance',
      hasTimetable   && 'timetable',
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
        pendingLeaves: d.leaves?.count     ?? 0,
      })

      // Feature-gated
      if (d.uncovered  !== null) setUncovered(Array.isArray(d.uncovered) ? d.uncovered : [])
      if (d.attendance !== null) setAttendance(Array.isArray(d.attendance) ? d.attendance : [])
      if (d.timetable  !== null) setTimetableHealth(Array.isArray(d.timetable) ? d.timetable : [])
      if (d.exams      !== null) setUpcomingExams(Array.isArray(d.exams) ? d.exams : [])
      if (d.fees       !== null) {
        setFeeOverdue(Number(d.fees?.overdue_count) || 0)
        setFeeOutstanding(Number(d.fees?.total_outstanding) || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [schoolId, hasAttendance, hasLeave, hasCover, hasTimetable, hasExams, hasFeeManagement])

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
  const attNotMarked = attTotal - attMarked
  const ttConflicts  = timetableHealth.filter(h => h.conflict_count > 0).length
  const ttNoTeacher  = timetableHealth.reduce((s, h) => s + h.no_teacher_count, 0)
  const ttNoTimetable = timetableHealth.filter(h => !h.timetable_exists).length
  const ttHealthy    = timetableHealth.filter(h => h.timetable_exists && h.conflict_count === 0 && h.no_teacher_count === 0).length

  const uncByTeacher = new Map<number, { name: string; leave_type: string; periods: UncoveredPeriod[] }>()
  for (const p of uncovered) {
    if (!uncByTeacher.has(p.teacher_id)) uncByTeacher.set(p.teacher_id, { name: p.teacher_name, leave_type: p.leave_type, periods: [] })
    uncByTeacher.get(p.teacher_id)!.periods.push(p)
  }

  const alertCount = uncovered.length + ttConflicts + (stats.pendingLeaves > 0 ? 1 : 0) + attNotMarked + (hasFeeManagement && feeOverdue > 0 ? 1 : 0)

  // Count cards (shown at bottom)
  const countCards = [
    { label: 'Teachers', value: stats.teachers, sub: 'Active staff',   color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    nav: 'teachers' },
    { label: 'Students', value: stats.students, sub: 'Enrolled',       color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', nav: 'students' },
    { label: 'Classes',  value: stats.classes,  sub: 'Configured',     color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-200',  nav: 'class-management' },
  ]

  // Feature metric cards (shown as KPI row)
  const metricCards = [
    ...(hasAttendance ? [{
      label: "Today's Attendance",
      value: attPct !== null ? `${attPct}%` : '—',
      sub: attPct !== null ? `${attPresent} of ${attStudents} present` : 'Not yet marked',
      color: attPct !== null ? (attPct >= 80 ? 'text-emerald-600' : attPct >= 60 ? 'text-amber-600' : 'text-red-600') : 'text-gray-400',
      bg: 'bg-gray-50', border: 'border-gray-200', nav: 'attendance',
    }] : []),
    ...(hasLeave ? [{
      label: 'Pending Leaves', value: stats.pendingLeaves, sub: 'Awaiting approval',
      color: stats.pendingLeaves > 0 ? 'text-orange-600' : 'text-gray-400',
      bg: stats.pendingLeaves > 0 ? 'bg-orange-50' : 'bg-gray-50',
      border: stats.pendingLeaves > 0 ? 'border-orange-200' : 'border-gray-200',
      nav: 'leave-requests',
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
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-900">School Dashboard</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {todayLabel}
            {!loading && alertCount > 0 && ` · ${alertCount} item${alertCount > 1 ? 's' : ''} need attention`}
            {!loading && alertCount === 0 && ' · All clear today'}
          </p>
        </div>
        <button onClick={() => load()}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Refresh
        </button>
      </div>

      {/* ── Alert strip (feature-gated) ── */}
      {!loading && (
        <div className="space-y-2">
          {hasCover && uncovered.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold flex-shrink-0">!</span>
                <div>
                  <p className="text-sm font-semibold text-red-800">{uncovered.length} uncovered period{uncovered.length > 1 ? 's' : ''} today</p>
                  <p className="text-xs text-red-500">{uncByTeacher.size} teacher{uncByTeacher.size > 1 ? 's' : ''} absent without substitute</p>
                </div>
              </div>
              <button onClick={() => onNavigate?.('emergency-cover')}
                className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                Assign Cover →
              </button>
            </div>
          )}
          {hasTimetable && ttConflicts > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold flex-shrink-0">⚠</span>
                <p className="text-sm font-semibold text-amber-800">{ttConflicts} class{ttConflicts > 1 ? 'es have' : ' has'} teacher conflicts in timetable</p>
              </div>
              <button onClick={() => onNavigate?.('timetable')}
                className="text-xs font-semibold text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                Fix Conflicts →
              </button>
            </div>
          )}
          {hasLeave && stats.pendingLeaves > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{stats.pendingLeaves}</span>
                <p className="text-sm font-semibold text-orange-800">Leave request{stats.pendingLeaves > 1 ? 's' : ''} awaiting approval</p>
              </div>
              <button onClick={() => onNavigate?.('leave-requests')}
                className="text-xs font-semibold text-orange-600 hover:text-orange-800 border border-orange-200 hover:border-orange-400 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                Review →
              </button>
            </div>
          )}
          {hasAttendance && attNotMarked > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{attNotMarked}</span>
                <p className="text-sm font-semibold text-blue-800">{attNotMarked} class{attNotMarked > 1 ? 'es haven\'t' : ' hasn\'t'} marked attendance today</p>
              </div>
              <button onClick={() => onNavigate?.('attendance')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                View →
              </button>
            </div>
          )}
          {hasFeeManagement && feeOverdue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
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
                className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                Collect Fees →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Quick actions ── */}
      {!loading && (() => {
        const quickActions = [
          { label: 'Mark Attendance',  sub: 'Daily register',                 nav: 'attendance',      color: 'bg-blue-600',    show: hasAttendance },
          { label: 'Review Leaves',    sub: `${stats.pendingLeaves} pending`,  nav: 'leave-requests',  color: 'bg-orange-500',  show: hasLeave },
          { label: 'Timetable',        sub: 'Manage schedules',                nav: 'timetable',       color: 'bg-emerald-600', show: hasTimetable },
          { label: 'Collect Fees',     sub: feeOverdue > 0 ? `${feeOverdue} overdue` : 'Fee management', nav: 'fee-management', color: 'bg-amber-600', show: hasFeeManagement },
        ].filter(a => a.show)

        if (quickActions.length === 0) return null
        return (
          <div className={`grid gap-3 ${quickActions.length <= 2 ? 'grid-cols-2' : quickActions.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
            {quickActions.map(({ label, sub, nav, color }) => (
              <button key={nav} onClick={() => onNavigate?.(nav)}
                className={`${color} text-white rounded-2xl p-4 text-left hover:opacity-90 hover:shadow-lg hover:scale-[1.02] transition-all`}>
                <p className="font-bold text-sm">{label}</p>
                <p className="text-xs opacity-70 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
        )
      })()}

      {/* ── Feature metric cards (attendance %, leaves, fees) ── */}
      {metricCards.length > 0 && (
        <div className={`grid gap-4 ${metricCards.length === 1 ? 'grid-cols-1' : metricCards.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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
      {!loading && (hasTimetable || hasAttendance || hasExams) && (
        <div className={`grid gap-4 ${[hasTimetable, hasAttendance, hasExams].filter(Boolean).length === 3 ? 'grid-cols-3' : [hasTimetable, hasAttendance, hasExams].filter(Boolean).length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>

          {hasTimetable && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-gray-800 text-sm">Timetable Health</p>
                <button onClick={() => onNavigate?.('timetable')} className="text-xs text-blue-500 hover:text-blue-700">View →</button>
              </div>
              {timetableHealth.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No classes configured yet</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Classes with timetable</span>
                      <span className="font-semibold text-gray-700">{timetableHealth.length - ttNoTimetable}/{timetableHealth.length}</span>
                    </div>
                    <HealthBar value={timetableHealth.length - ttNoTimetable} max={timetableHealth.length} color="bg-emerald-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Conflict-free</span>
                      <span className="font-semibold text-gray-700">{ttHealthy}/{timetableHealth.length}</span>
                    </div>
                    <HealthBar value={ttHealthy} max={timetableHealth.length} color="bg-blue-400" />
                  </div>
                  <div className="pt-2 border-t border-gray-50 flex gap-3 flex-wrap">
                    {ttConflicts > 0 && <span className="text-[11px] text-red-500 font-medium">{ttConflicts} conflict{ttConflicts > 1 ? 's' : ''}</span>}
                    {ttNoTeacher > 0 && <span className="text-[11px] text-amber-500 font-medium">{ttNoTeacher} no teacher</span>}
                    {ttNoTimetable > 0 && <span className="text-[11px] text-gray-400 font-medium">{ttNoTimetable} not generated</span>}
                    {ttConflicts === 0 && ttNoTeacher === 0 && ttNoTimetable === 0 && (
                      <span className="text-[11px] text-emerald-600 font-semibold">All timetables healthy ✓</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasAttendance && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-gray-800 text-sm">Attendance Today</p>
                <button onClick={() => onNavigate?.('attendance')} className="text-xs text-blue-500 hover:text-blue-700">View →</button>
              </div>
              {attendance.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No attendance data yet</p>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Classes marked</span>
                      <span className="font-semibold text-gray-700">{attMarked}/{attTotal}</span>
                    </div>
                    <HealthBar value={attMarked} max={attTotal} color="bg-blue-400" />
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
                    <div><p className="text-base font-black text-emerald-600">{attPresent}</p><p className="text-[10px] text-gray-400">Present</p></div>
                    <div><p className="text-base font-black text-red-500">{attStudents - attPresent}</p><p className="text-[10px] text-gray-400">Absent</p></div>
                    <div><p className="text-base font-black text-gray-500">{attNotMarked}</p><p className="text-[10px] text-gray-400">Unmarked</p></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasExams && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-gray-800 text-sm">Upcoming Exams</p>
                <button onClick={() => onNavigate?.('exam-schedule')} className="text-xs text-blue-500 hover:text-blue-700">View all →</button>
              </div>
              {upcomingExams.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No exams in next 7 days</p>
              ) : (
                <div className="space-y-2">
                  {upcomingExams.map(e => {
                    const d = new Date(e.exam_date)
                    const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    const isToday = e.exam_date.slice(0, 10) === new Date().toISOString().slice(0, 10)
                    return (
                      <div key={e.id} className={`flex items-center gap-3 p-2 rounded-lg ${isToday ? 'bg-blue-50 border border-blue-100' : 'hover:bg-gray-50'}`}>
                        <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          <span className="text-[10px] font-bold leading-none">{label.split(' ')[1]}</span>
                          <span className="text-sm font-black leading-none">{label.split(' ')[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{e.exam_name}</p>
                          <p className="text-[10px] text-gray-400">Grade {e.grade} · {e.exam_type}</p>
                        </div>
                        {isToday && <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0">TODAY</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Uncovered periods detail ── */}
      {!loading && hasCover && uncovered.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <p className="text-sm font-bold text-red-800">Uncovered Periods — {todayLabel}</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {Array.from(uncByTeacher.values()).map(({ name, leave_type, periods }) => (
              <div key={name} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-red-700 font-bold text-xs">{name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{name}</p>
                    <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{leave_type}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-1.5">
                    {periods.map((p, i) => (
                      <span key={i} className="flex items-center gap-1 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1 text-xs">
                        <span className="font-bold text-gray-700">P{p.period_number}</span>
                        {p.subject_name && <span className="text-gray-500">{p.subject_name}</span>}
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-600 font-medium">Cl.{p.grade}-{p.section}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Count cards (teachers / students / classes) at bottom ── */}
      <div>
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">School Summary</p>
        <div className="grid grid-cols-3 gap-4">
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
