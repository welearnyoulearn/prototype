'use client'

import { useEffect, useMemo, useState } from 'react'
import { todayIST } from '@/lib/attendanceRules'
import ClassDashboard from '@/app/components/attendance-dashboard/ClassDashboard'
import {
  BandPill, Card, DashSkeleton, DistributionBar, ErrorBox, Kpi, PctBar, RangeControl, TrendChart,
  pctText, shortDate, useApi,
  type Distribution, type RangeKey, type Summary, type TrendPoint,
} from '@/app/components/attendance-dashboard/parts'
import StudentAttendanceModal from '@/app/components/attendance-dashboard/StudentModal'
import type { AttendanceOverview } from './AttendanceTodayPanel'

// The school admin's attendance home: how is the whole school doing → which class needs help →
// which student. Every row is clickable and leads one level down (school → class → student).

type ClassRow = Summary & {
  classId: number; grade: string; section: string; classTeacher: string | null; students: number; atRisk: number
}
type Attention = {
  id: number; name: string; grade: string; section: string; classId: number | null
  pct: number | null; absentDays: number; lastAbsent: string | null; marked: number
}
type SchoolData = {
  range: { key: RangeKey; from: string; to: string; label: string; bucket: 'day' | 'month' }
  school: Summary
  trend: TrendPoint[]
  classes: ClassRow[]
  distribution: Distribution
  attention: Attention[]
  atRiskTotal: number
  students: number
  workingDays: number
}
type Found = { id: number; name: string; grade: string; section: string; school_roll_number: number | null }

export default function AttendanceOverviewDashboard({ overview, onOpenRegister }: {
  overview: AttendanceOverview | null
  onOpenRegister: () => void
}) {
  const currentMonth = todayIST().slice(0, 7)
  const [range, setRange] = useState<RangeKey>('month')
  const [month, setMonth] = useState(currentMonth)
  const [classId, setClassId] = useState<number | null>(null)
  const [student, setStudent] = useState<{ id: number; name: string } | null>(null)
  const [classSort, setClassSort] = useState<'lowest' | 'highest' | 'class'>('lowest')

  const { data, error, loading, retry } = useApi<SchoolData>(
    classId ? null : `/api/attendance/dashboard?scope=school&range=${range}${range === 'month' ? `&month=${month}` : ''}`
  )

  // Student search
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      fetch(`/api/attendance/dashboard?scope=find&q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { students: [] }))
        .then(b => { if (!cancelled) setFound(Array.isArray(b.students) ? b.students : []) })
        .catch(() => { if (!cancelled) setFound([]) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])
  const results = q.trim().length >= 2 ? found : []

  const classes = useMemo(() => {
    const list = [...(data?.classes ?? [])]
    if (classSort === 'lowest') list.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101))
    else if (classSort === 'highest') list.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
    return list
  }, [data, classSort])

  if (classId) {
    const c = data?.classes.find(x => x.classId === classId)
    return (
      <ClassDashboard classId={classId} onBack={() => setClassId(null)}
        subtitle={c?.classTeacher ? `Class teacher: ${c.classTeacher}` : 'No class teacher assigned'} />
    )
  }

  const t = overview?.totals
  return (
    <div className="space-y-4" data-testid="att-school-dashboard">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <RangeControl range={range} month={month} currentMonth={currentMonth} onRange={setRange} onMonth={setMonth} />
        <div className="relative w-full sm:w-72">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a student (name or roll no.)" aria-label="Find a student"
            data-testid="att-find-student" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" />
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden" data-testid="att-find-results">
              {results.map(s => (
                <li key={s.id}>
                  <button type="button" data-testid={`att-find-result-${s.id}`}
                    onClick={() => { setStudent({ id: s.id, name: s.name }); setQ(''); setFound([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    {s.name} <span className="text-xs text-gray-400">· Class {s.grade}-{s.section}{s.school_roll_number !== null ? ` · Roll ${s.school_roll_number}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Today at a glance */}
      {overview && (
        <div data-testid="att-today-strip"
          className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${overview.nonWorking ? 'bg-slate-100 border-slate-200' : 'bg-white border-gray-200'}`}>
          {overview.nonWorking ? (
            <p className="text-sm text-slate-700">Today is {overview.nonWorking.kind === 'holiday' ? `a holiday — ${overview.nonWorking.title}` : 'a weekly off'}. No attendance is taken.</p>
          ) : t && (
            <div className="text-sm text-gray-700">
              <b>Today:</b> Morning marked in <b>{t.morningMarked}</b>/{t.classes} classes · Afternoon in <b>{t.afternoonMarked}</b>/{t.classes}
              {t.notMarkedMorning.length > 0 && (
                <span className="block text-xs text-red-600 mt-0.5">
                  Morning not marked yet: {t.notMarkedMorning.slice(0, 4).map(c => `${c.grade}-${c.section}`).join(', ')}{t.notMarkedMorning.length > 4 ? ` +${t.notMarkedMorning.length - 4} more` : ''}
                </span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onOpenRegister} data-testid="att-open-register"
              className="text-xs font-semibold bg-blue-600 text-white rounded-lg px-3 py-2">Open today&apos;s register</button>
            {!overview.nonWorking && (
              <a href={`/api/export/attendance?mode=absentees&date=${overview.today}`} data-testid="att-export-absentees"
                className="text-xs font-semibold border border-gray-200 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50">Absentee list (CSV)</a>
            )}
          </div>
        </div>
      )}

      {t && t.openReports > 0 && (
        <button type="button" onClick={onOpenRegister} data-testid="att-open-reports"
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <b>{t.openReports}</b> attendance mistake report{t.openReports === 1 ? '' : 's'} from teachers {t.openReports === 1 ? 'is' : 'are'} waiting — open the day register to review.
        </button>
      )}

      {error && <ErrorBox message={error} onRetry={retry} />}
      {loading && !data && <DashSkeleton />}

      {data && (
        <>
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${loading ? 'opacity-60' : ''}`}>
            <Kpi testid="att-kpi-school-pct" label="School attendance" band={data.school.band} value={pctText(data.school.pct)}
              sub={data.school.marked ? `${data.school.attended.toLocaleString('en-IN')} of ${data.school.marked.toLocaleString('en-IN')} sessions` : 'Nothing marked in this period'} />
            <Kpi testid="att-kpi-at-risk" label="Students below 75%" band={data.atRiskTotal ? 'low' : 'good'} value={data.atRiskTotal}
              sub={data.atRiskTotal ? `of ${data.students} students` : 'No one is below 75%'} />
            <Kpi testid="att-kpi-good" label="On track (90%+)" band="good" value={data.distribution.good} sub={`of ${data.students} students`} />
            <Kpi testid="att-kpi-working-days" label="School days" value={data.workingDays} sub={`${shortDate(data.range.from)} – ${shortDate(data.range.to)}`} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card title="Attendance over time" hint={data.range.bucket === 'day' ? 'School-wide, each dot is one school day.' : 'School-wide, each dot is one month.'}>
                <TrendChart points={data.trend} bucket={data.range.bucket} />
              </Card>
            </div>
            <Card title="Students by attendance" hint="Share of the school in each band">
              <DistributionBar d={data.distribution} />
            </Card>
          </div>

          <Card title="Classes" hint="Tap a class to see every student in it."
            right={(
              <select value={classSort} onChange={e => setClassSort(e.target.value as typeof classSort)} aria-label="Sort classes" data-testid="att-class-sort"
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white">
                <option value="lowest">Lowest attendance first</option>
                <option value="highest">Highest first</option>
                <option value="class">Class order</option>
              </select>
            )} testid="att-classes-card">
            {classes.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No classes yet.</p> : (
              <ul className="divide-y divide-gray-100" data-testid="att-class-list">
                {classes.map(c => (
                  <li key={c.classId}>
                    <button type="button" onClick={() => setClassId(c.classId)} data-testid={`att-class-row-${c.classId}`}
                      className="w-full text-left py-3 px-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 hover:bg-gray-50 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Class {c.grade}-{c.section}
                          <span className="text-xs font-normal text-gray-400"> · {c.students} student{c.students === 1 ? '' : 's'}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.classTeacher ?? 'No class teacher'}
                          {c.atRisk > 0 && <span className="text-red-600 font-semibold"> · {c.atRisk} below 75%</span>}
                        </p>
                      </div>
                      <BandPill band={c.band} pct={c.pct} />
                      <div className="col-span-2"><PctBar pct={c.pct} band={c.band} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Students who need attention" hint="Below 75% attendance (with at least 4 sessions marked), lowest first." testid="att-attention-card">
            {data.attention.length === 0 ? (
              <p className="text-sm text-green-700 py-2">No student is below 75% in this period.</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100" data-testid="att-attention-list">
                  {data.attention.map(s => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setStudent({ id: s.id, name: s.name })} data-testid={`att-attention-row-${s.id}`}
                        className="w-full text-left py-2.5 px-1 flex items-center justify-between gap-3 hover:bg-gray-50 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{s.name}
                            <span className="text-xs font-normal text-gray-400"> · Class {s.grade}-{s.section}</span></p>
                          <p className="text-xs text-gray-500">{s.absentDays} day{s.absentDays === 1 ? '' : 's'} absent{s.lastAbsent ? ` · last ${shortDate(s.lastAbsent)}` : ''}</p>
                        </div>
                        <BandPill band="low" pct={s.pct} />
                      </button>
                    </li>
                  ))}
                </ul>
                {data.atRiskTotal > data.attention.length && (
                  <p className="text-xs text-gray-400 mt-2">Showing the {data.attention.length} lowest of {data.atRiskTotal}. Open a class to see the rest.</p>
                )}
              </>
            )}
          </Card>
        </>
      )}

      {student && <StudentAttendanceModal studentId={student.id} name={student.name} onClose={() => setStudent(null)} />}
    </div>
  )
}
