'use client'

import { useMemo, useState } from 'react'
import { todayIST } from '@/lib/attendanceRules'
import {
  BandPill, Card, DashSkeleton, DistributionBar, ErrorBox, Kpi, PctBar, RangeControl, TrendChart,
  WeekdayChart, pctText, shortDate, useApi,
  type Distribution, type RangeKey, type Summary, type TrendPoint,
} from './parts'
import StudentAttendanceModal from './StudentModal'

// One class, student by student. Used by the class teacher ("My class") and by the school admin
// when they open a class from the school dashboard. Tap a student to see their own calendar.

type StudentRow = Summary & {
  id: number; name: string; rollNumber: number | null
  absentDays: number; lastAbsent: string | null; absentStreak: number
  today: 'present' | 'late' | 'absent' | 'mixed' | null
}
type ClassData = {
  range: { key: RangeKey; from: string; to: string; label: string; bucket: 'day' | 'month' }
  class: { id: number; grade: string; section: string }
  summary: Summary
  distribution: Distribution
  atRisk: number
  students: StudentRow[]
  trend: TrendPoint[]
  weekday: { weekday: number; pct: number | null; absent: number; marked: number }[]
  workingDays: number
  today: string
  todayNonWorking: string | null
}

type Filter = 'all' | 'attention' | 'today'
type Sort = 'lowest' | 'name' | 'absences'

const needsAttention = (s: StudentRow) => (s.band === 'low' && s.marked >= 4) || s.absentStreak >= 3

export default function ClassDashboard({ classId, subtitle, onBack, onOpenProfile }: {
  classId: number; subtitle?: string; onBack?: () => void
  onOpenProfile?: (studentId: number) => void
}) {
  const currentMonth = todayIST().slice(0, 7)
  const [range, setRange] = useState<RangeKey>('month')
  const [month, setMonth] = useState(currentMonth)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('lowest')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<{ id: number; name: string } | null>(null)

  const { data, error, loading, retry } = useApi<ClassData>(
    `/api/attendance/dashboard?scope=class&class_id=${classId}&range=${range}${range === 'month' ? `&month=${month}` : ''}`
  )

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const list = data.students.filter(s =>
      (filter === 'all' || (filter === 'attention' ? needsAttention(s) : s.today === 'absent' || s.today === 'mixed')) &&
      (!q || s.name.toLowerCase().includes(q) || String(s.rollNumber ?? '') === q))
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'absences' ? b.absentDays - a.absentDays || a.name.localeCompare(b.name)
        : (a.pct ?? 101) - (b.pct ?? 101) || a.name.localeCompare(b.name))
  }, [data, filter, sort, search])

  const absentToday = data?.students.filter(s => s.today === 'absent' || s.today === 'mixed').length ?? 0
  const attentionCount = data?.students.filter(needsAttention).length ?? 0

  return (
    <div className="space-y-4" data-testid="att-class-dashboard">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} data-testid="att-dash-back" aria-label="Back"
              className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600">‹</button>
          )}
          <div>
            <h3 className="text-lg font-bold text-gray-900">{data ? `Class ${data.class.grade}-${data.class.section}` : 'Class'}</h3>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        <RangeControl range={range} month={month} currentMonth={currentMonth} onRange={setRange} onMonth={setMonth} />
      </div>

      {error && <ErrorBox message={error} onRetry={retry} />}
      {loading && !data && <DashSkeleton />}

      {data && (
        <>
          {data.todayNonWorking && (
            <div data-testid="att-dash-holiday" className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700">
              Today is a holiday ({data.todayNonWorking}) — no attendance is taken.
            </div>
          )}

          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${loading ? 'opacity-60' : ''}`}>
            <Kpi testid="att-kpi-class-pct" label="Class attendance" band={data.summary.band} value={pctText(data.summary.pct)}
              sub={data.summary.marked ? `${data.summary.attended} of ${data.summary.marked} sessions attended` : 'Nothing marked in this period'} />
            <Kpi testid="att-kpi-attention" label="Need attention" band={attentionCount ? 'low' : 'good'} value={attentionCount}
              sub={attentionCount ? `below 75%, or absent 3+ days running` : 'Everyone is on track'} />
            <Kpi testid="att-kpi-absent-today" label="Absent today"
              value={data.todayNonWorking ? '—' : absentToday}
              sub={data.todayNonWorking ? 'Holiday' : absentToday ? 'in at least one session' : 'None reported'} />
            <Kpi testid="att-kpi-days" label="School days" value={data.workingDays} sub={`${shortDate(data.range.from)} – ${shortDate(data.range.to)}`} />
          </div>

          <Card title="Attendance over time" hint={data.range.bucket === 'day' ? 'Each dot is one school day.' : 'Each dot is one month.'}>
            <TrendChart points={data.trend} bucket={data.range.bucket} />
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card title="How the class is doing" hint="Students by their attendance %">
              <DistributionBar d={data.distribution} />
            </Card>
            <Card title="Which days are missed?" hint="Share of sessions with an absence, by weekday">
              <WeekdayChart rows={data.weekday} />
            </Card>
          </div>

          <Card title={`Students (${data.students.length})`} hint="Tap a student to see their calendar and history." testid="att-students-card">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <div className="inline-flex bg-gray-100 rounded-xl p-1">
                {([['all', 'All'], ['attention', `Need attention (${attentionCount})`], ['today', `Absent today (${absentToday})`]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} data-testid={`att-filter-${k}`} aria-pressed={filter === k}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{label}</button>
                ))}
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or roll no." aria-label="Search students"
                data-testid="att-student-search" className="flex-1 min-w-[10rem] border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort students" data-testid="att-student-sort"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                <option value="lowest">Lowest attendance first</option>
                <option value="absences">Most absent days first</option>
                <option value="name">Name (A–Z)</option>
              </select>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                {data.students.length === 0 ? 'No students in this class yet.' : 'No students match.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100" data-testid="att-student-list">
                {rows.map(s => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setOpen({ id: s.id, name: s.name })} data-testid={`att-student-row-${s.id}`}
                      className="w-full text-left py-3 px-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 hover:bg-gray-50 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{s.name}
                          {s.rollNumber !== null && <span className="text-xs font-normal text-gray-400"> · Roll {s.rollNumber}</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>{s.absentDays} day{s.absentDays === 1 ? '' : 's'} absent</span>
                          {s.late > 0 && <span>{s.late} late</span>}
                          {s.absentStreak >= 2 && <span className="text-red-600 font-semibold">{s.absentStreak} days in a row</span>}
                          {s.lastAbsent && <span>last absent {shortDate(s.lastAbsent)}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <BandPill band={s.band} pct={s.pct} />
                        {s.today && s.today !== 'present' && (
                          <p className={`text-[11px] font-semibold mt-1 ${s.today === 'late' ? 'text-amber-600' : 'text-red-600'}`}>
                            {s.today === 'late' ? 'Late today' : s.today === 'mixed' ? 'Absent part of today' : 'Absent today'}
                          </p>
                        )}
                      </div>
                      <div className="col-span-2"><PctBar pct={s.pct} band={s.band} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {open && <StudentAttendanceModal studentId={open.id} name={open.name} onClose={() => setOpen(null)} onOpenProfile={onOpenProfile} />}
    </div>
  )
}
