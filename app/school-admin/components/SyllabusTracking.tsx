'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronUp, ChevronDown, Bell, Check } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { INK, TEAL, GOLD, CORAL, GREEN, BORDER, SURFACE, CREAM } from '@/app/components/ulearn/theme'
import { UlearnCard } from '@/app/components/ulearn/primitives'

// ── Types — matches GET /api/syllabus/analytics's extended response ────────

type ClassSubjectRow = { subject: string; teacher_name: string | null; total: number; covered: number; pct: number }
type ClassCoverage = {
  class_id: number; grade: string; section: string
  total: number; covered: number; pct: number | null
  subjects: ClassSubjectRow[]
}

type TeacherAssignmentRow = { class_id: number; grade: string; section: string; subject: string; total: number; covered: number; pct: number }
type TeacherCoverage = {
  teacher_id: number; teacher_name: string
  total: number; covered: number; pct: number | null
  assignments: TeacherAssignmentRow[]
}

type SyllabusData = {
  academic_year: string
  by_class: ClassCoverage[]
  by_teacher: TeacherCoverage[]
}

type AcademicYearOption = { id: number; label: string; is_current: boolean }

type TrendResponse = { weeks: string[]; series: { subject: string; values: (number | null)[] }[] }

// ── Status thresholds — exactly the mockup's own legend, not reused from
// elsewhere in the app (Academic Analytics' KPI cards use different bands
// tuned for a different summary; this screen's three-tier "On track / Watch
// / Behind" is a distinct, explicitly-specified scale). ──
function statusOf(pct: number | null): 'green' | 'amber' | 'red' {
  const v = pct ?? 0
  if (v >= 75) return 'green'
  if (v >= 50) return 'amber'
  return 'red'
}
const STATUS_COLOR: Record<'green' | 'amber' | 'red', string> = { green: GREEN, amber: GOLD, red: CORAL }
const STATUS_BG: Record<'green' | 'amber' | 'red', string> = { green: '#E7F3EB', amber: '#FCF1DF', red: '#FBEAE3' }
const STATUS_LABEL: Record<'green' | 'amber' | 'red', string> = { green: 'On track', amber: 'Watch', red: 'Behind' }

const CHART_PALETTE = [TEAL, GOLD, '#5B4E8A', CORAL, GREEN, '#3B6FA0']

function PctBar({ pct }: { pct: number }) {
  const status = statusOf(pct)
  return (
    <div className="flex items-center gap-2.5 min-w-[140px]">
      <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: BORDER }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
      </div>
      <span className="text-xs font-bold w-9 text-right tabular-nums" style={{ color: STATUS_COLOR[status] }}>{pct}%</span>
    </div>
  )
}

function StatusPill({ pct }: { pct: number }) {
  const status = statusOf(pct)
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: STATUS_BG[status], color: STATUS_COLOR[status] }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

// Row shapes the detail table renders — unified so class mode and teacher
// mode share one sortable-table implementation instead of two near-duplicates.
type ClassModeRow = { key: string; subject: string; teacherName: string | null; total: number; covered: number; pct: number }
type TeacherModeRow = { key: string; classLabel: string; grade: string; subject: string; total: number; covered: number; pct: number }

type SortKey = 'subject' | 'teacher' | 'class' | 'pct' | 'status'

export default function SyllabusTracking({ schoolId }: { schoolId: number }) {
  const [years, setYears] = useState<AcademicYearOption[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')

  const [mode, setMode] = useState<'class' | 'teacher'>('class')
  const [data, setData] = useState<SyllabusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null)
  const [listSearch, setListSearch] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('pct')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const [trend, setTrend] = useState<TrendResponse | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  const [nudgedKeys, setNudgedKeys] = useState<Set<string>>(new Set())
  const [nudgingKey, setNudgingKey] = useState<string | null>(null)

  // ── Academic years — real years with data for this school, current
  // labeled, most-recent-first. Switching years is a full data reload. ──
  useEffect(() => {
    fetch(`/api/academic-years?school_id=${schoolId}`)
      .then(r => r.json())
      .then((rows: AcademicYearOption[]) => {
        if (!Array.isArray(rows)) return
        setYears(rows)
        const current = rows.find(y => y.is_current)
        setSelectedYear(current ? current.label : (rows[0]?.label ?? ''))
      })
      .catch(() => {})
  }, [schoolId])

  useEffect(() => {
    if (!selectedYear) return
    loadAnalytics(selectedYear)
  }, [schoolId, selectedYear]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAnalytics(year: string) {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/syllabus/analytics?school_id=${schoolId}&academic_year=${encodeURIComponent(year)}`)
      if (!r.ok) throw new Error()
      const d: SyllabusData = await r.json()
      setData(d)
      setSelectedClassId(prev => (prev && d.by_class.some(c => c.class_id === prev)) ? prev : (d.by_class[0]?.class_id ?? null))
      setSelectedTeacherId(prev => (prev && d.by_teacher.some(t => t.teacher_id === prev)) ? prev : (d.by_teacher[0]?.teacher_id ?? null))
    } catch {
      setError('Failed to load syllabus tracking data')
    } finally {
      setLoading(false)
    }
  }

  // ── Trend — refetched whenever the selected class/teacher, mode, or year
  // changes. ──
  useEffect(() => {
    if (!selectedYear) return
    const id = mode === 'class' ? selectedClassId : selectedTeacherId
    if (id == null) { setTrend(null); return }
    setTrendLoading(true)
    const param = mode === 'class' ? `class_id=${id}` : `teacher_id=${id}`
    fetch(`/api/syllabus/analytics/trend?school_id=${schoolId}&${param}&academic_year=${encodeURIComponent(selectedYear)}`)
      .then(r => r.json())
      .then((d: TrendResponse) => setTrend(d))
      .catch(() => setTrend(null))
      .finally(() => setTrendLoading(false))
  }, [schoolId, mode, selectedClassId, selectedTeacherId, selectedYear])

  // ── Left list — classes or teachers, lowest coverage first, searchable ──
  const classListItems = useMemo(() => {
    if (!data) return []
    let items = data.by_class.map(c => ({ id: c.class_id, name: `${c.grade}-${c.section}`, sub: `${c.subjects.length} subject${c.subjects.length === 1 ? '' : 's'}`, pct: c.pct ?? 0 }))
    if (listSearch.trim()) {
      const q = listSearch.trim().toLowerCase()
      items = items.filter(i => i.name.toLowerCase().includes(q))
    }
    return items.sort((a, b) => a.pct - b.pct)
  }, [data, listSearch])

  const teacherListItems = useMemo(() => {
    if (!data) return []
    let items = data.by_teacher.map(t => ({ id: t.teacher_id, name: t.teacher_name, sub: `${t.assignments.length} class-subject${t.assignments.length === 1 ? '' : 's'}`, pct: t.pct ?? 0 }))
    if (listSearch.trim()) {
      const q = listSearch.trim().toLowerCase()
      items = items.filter(i => i.name.toLowerCase().includes(q))
    }
    return items.sort((a, b) => a.pct - b.pct)
  }, [data, listSearch])

  // ── Detail table rows for whichever entity is selected ──
  const selectedClass = data?.by_class.find(c => c.class_id === selectedClassId) ?? null
  const selectedTeacher = data?.by_teacher.find(t => t.teacher_id === selectedTeacherId) ?? null

  const classRows: ClassModeRow[] = useMemo(() => {
    if (!selectedClass) return []
    const rows = selectedClass.subjects.map(s => ({ key: s.subject, subject: s.subject, teacherName: s.teacher_name, total: s.total, covered: s.covered, pct: s.pct }))
    return sortRows(rows, sortKey, sortDir, r => r.subject, r => r.teacherName ?? '')
  }, [selectedClass, sortKey, sortDir])

  const teacherRows: TeacherModeRow[] = useMemo(() => {
    if (!selectedTeacher) return []
    const rows = selectedTeacher.assignments.map(a => ({
      key: `${a.class_id}-${a.subject}`,
      classLabel: `${a.grade}-${a.section}`,
      grade: a.grade,
      subject: a.subject,
      total: a.total, covered: a.covered, pct: a.pct,
    }))
    return sortRows(rows, sortKey === 'teacher' ? 'class' : sortKey, sortDir, r => r.subject, r => r.classLabel)
  }, [selectedTeacher, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir(d => (d === 1 ? -1 : 1) as 1 | -1); return }
    setSortKey(key)
    setSortDir(key === 'subject' || key === 'teacher' || key === 'class' || key === 'status' ? 1 : -1)
  }

  function switchMode(next: 'class' | 'teacher') {
    setMode(next)
    setSortKey('pct')
    setSortDir(-1)
    setListSearch('')
  }

  async function sendNudge(row: { key: string; subject: string; pct: number }, classLabel: string, teacherId: number | null, teacherLabel: string) {
    if (nudgedKeys.has(row.key) || !teacherId) return
    setNudgingKey(row.key)
    try {
      const res = await fetch('/api/notifications/nudge-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          teacher_id: teacherId,
          subject: row.subject,
          class_label: classLabel,
          pct: row.pct,
        }),
      })
      if (!res.ok) throw new Error()
      setNudgedKeys(prev => new Set(prev).add(row.key))
    } catch {
      // Non-fatal — the button just stays clickable so admin can retry.
    } finally {
      setNudgingKey(null)
    }
    void teacherLabel
  }

  // KPIs — computed from the same by_class data already powering the list.
  const kpis = useMemo(() => {
    if (!data) return { overallPct: 0, onTrack: 0, behind: 0, totalClasses: 0 }
    const totalChapters = data.by_class.reduce((s, c) => s + c.total, 0)
    const coveredChapters = data.by_class.reduce((s, c) => s + c.covered, 0)
    const overallPct = totalChapters > 0 ? Math.round((coveredChapters / totalChapters) * 100) : 0
    const onTrack = data.by_class.filter(c => statusOf(c.pct) === 'green').length
    const behind = data.by_class.filter(c => statusOf(c.pct) === 'red').length
    return { overallPct, onTrack, behind, totalClasses: data.by_class.length }
  }, [data])

  return (
    <div className="space-y-5">
      {/* Header + year selector */}
      <div className="rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap" style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>Syllabus Tracking</h2>
          <p className="text-sm text-gray-500 mt-0.5">Coverage by class, subject and teacher — chapter-level, updated live.</p>
        </div>
        {years.length > 0 && (
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            data-testid="syllabus-tracking-year-select"
            className="text-sm font-semibold px-3 py-2 rounded-xl border bg-white"
            style={{ borderColor: BORDER, color: INK }}
          >
            {years.map(y => (
              <option key={y.id} value={y.label}>{y.label}{y.is_current ? ' (current)' : ''}</option>
            ))}
          </select>
        )}
      </div>

      {loading && <div className="text-center py-16 text-gray-400 text-sm">Loading syllabus tracking data…</div>}
      {error && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FBEAE3', color: '#8A3A22' }}>{error}</div>}

      {!loading && data && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <UlearnCard className="p-4" borderColor={BORDER}>
              <p className="text-[11px] text-gray-400 font-medium mb-1">Overall coverage</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: INK }}>{kpis.overallPct}%</p>
            </UlearnCard>
            <UlearnCard className="p-4" borderColor={BORDER}>
              <p className="text-[11px] text-gray-400 font-medium mb-1">Classes on track</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: GREEN }}>{kpis.onTrack} <span className="text-sm text-gray-400 font-medium">/ {kpis.totalClasses}</span></p>
              <p className="text-[11px] text-gray-400 mt-1">≥75% coverage</p>
            </UlearnCard>
            <UlearnCard className="p-4" borderColor={BORDER}>
              <p className="text-[11px] text-gray-400 font-medium mb-1">Classes behind</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: kpis.behind > 0 ? CORAL : GREEN }}>{kpis.behind} <span className="text-sm text-gray-400 font-medium">/ {kpis.totalClasses}</span></p>
              <p className="text-[11px] text-gray-400 mt-1">below 50% coverage</p>
            </UlearnCard>
          </div>

          {/* View toggle */}
          <div className="inline-flex p-1 rounded-xl gap-1" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            {(['class', 'teacher'] as const).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                data-testid={`syllabus-tracking-mode-${m}`}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: mode === m ? TEAL : 'transparent', color: mode === m ? 'white' : '#6b7280' }}
              >
                By {m}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
            {/* Left: entity list */}
            <UlearnCard borderColor={BORDER} className="overflow-hidden">
              <div className="px-4 py-3.5 border-b" style={{ borderColor: BORDER }}>
                <p className="text-sm font-semibold" style={{ color: INK }}>{mode === 'class' ? 'Classes' : 'Teachers'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Sorted by lowest coverage first</p>
              </div>
              <div className="px-3.5 py-2.5 border-b" style={{ borderColor: BORDER }}>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: BORDER }}>
                  <Search size={13} className="text-gray-400 flex-shrink-0" />
                  <input
                    value={listSearch}
                    onChange={e => setListSearch(e.target.value)}
                    placeholder={mode === 'class' ? 'Search class…' : 'Search teacher…'}
                    data-testid="syllabus-tracking-search"
                    className="text-sm flex-1 min-w-0 outline-none bg-transparent"
                  />
                </div>
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {mode === 'class' ? (
                  classListItems.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No classes found.</p>
                  ) : classListItems.map(item => {
                    const active = item.id === selectedClassId
                    const status = statusOf(item.pct)
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedClassId(item.id)}
                        data-testid={`syllabus-tracking-class-${item.id}`}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left border-b transition-colors"
                        style={{ borderColor: BORDER, background: active ? '#EDF9F6' : 'white', borderLeft: active ? `3px solid ${TEAL}` : '3px solid transparent' }}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: INK }}>{item.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{item.sub}</p>
                        </div>
                        <span className="text-xs font-bold flex items-center gap-1.5 flex-shrink-0" style={{ color: STATUS_COLOR[status] }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
                          {item.pct}%
                        </span>
                      </button>
                    )
                  })
                ) : (
                  teacherListItems.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No teacher-syllabus assignments found.</p>
                  ) : teacherListItems.map(item => {
                    const active = item.id === selectedTeacherId
                    const status = statusOf(item.pct)
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedTeacherId(item.id)}
                        data-testid={`syllabus-tracking-teacher-${item.id}`}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left border-b transition-colors"
                        style={{ borderColor: BORDER, background: active ? '#EDF9F6' : 'white', borderLeft: active ? `3px solid ${TEAL}` : '3px solid transparent' }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: '#EDE9FB', color: '#5B4E8A' }}>
                            {initials(item.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: INK }}>{item.name}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{item.sub}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold flex items-center gap-1.5 flex-shrink-0" style={{ color: STATUS_COLOR[status] }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
                          {item.pct}%
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </UlearnCard>

            {/* Right: detail table + chart */}
            <div className="space-y-4">
              <UlearnCard borderColor={BORDER} className="overflow-hidden">
                <div className="px-5 pt-4 pb-2">
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-base font-semibold" style={{ color: INK }}>
                      {mode === 'class' ? (selectedClass ? `${selectedClass.grade}-${selectedClass.section}` : '—') : (selectedTeacher?.teacher_name ?? '—')}
                    </span>
                    <span className="text-sm text-gray-400 font-medium tabular-nums">
                      {mode === 'class' ? (selectedClass?.pct ?? 0) : (selectedTeacher?.pct ?? 0)}% overall
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {mode === 'class' ? 'Coverage across every subject taught to this class' : 'Coverage across every class-subject this teacher handles'}
                  </p>
                </div>
                <div className="px-5 pb-4">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: BORDER }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{
                      width: `${mode === 'class' ? (selectedClass?.pct ?? 0) : (selectedTeacher?.pct ?? 0)}%`,
                      background: STATUS_COLOR[statusOf(mode === 'class' ? selectedClass?.pct ?? 0 : selectedTeacher?.pct ?? 0)],
                    }} />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: SURFACE }}>
                        {mode === 'class' ? (
                          <>
                            <SortHeader label="Subject" sortKey="subject" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                            <SortHeader label="Teacher" sortKey="teacher" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                          </>
                        ) : (
                          <>
                            <SortHeader label="Class" sortKey="class" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                            <SortHeader label="Subject" sortKey="subject" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                          </>
                        )}
                        <SortHeader label="Chapters covered" sortKey="pct" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                        <SortHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                        <th className="px-5 py-2.5 border-b" style={{ borderColor: BORDER }} />
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: BORDER }}>
                      {mode === 'class' ? (
                        classRows.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">No subjects for this class yet.</td></tr>
                        ) : classRows.map(row => {
                          const status = statusOf(row.pct)
                          const teacherRowIdForNudge = selectedClass ? findTeacherIdByName(data.by_teacher, row.teacherName) : null
                          return (
                            <tr key={row.key} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5 font-semibold" style={{ color: INK }}>{row.subject}</td>
                              <td className="px-5 py-3.5 text-gray-500">
                                {row.teacherName ? (
                                  <span className="inline-flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: '#EDE9FB', color: '#5B4E8A' }}>{initials(row.teacherName)}</span>
                                    {row.teacherName}
                                  </span>
                                ) : <span className="text-gray-300">Unassigned</span>}
                              </td>
                              <td className="px-5 py-3.5">
                                <PctBar pct={row.pct} />
                                <p className="text-[11px] text-gray-400 mt-1 tabular-nums">{row.covered} of {row.total} chapters</p>
                              </td>
                              <td className="px-5 py-3.5"><StatusPill pct={row.pct} /></td>
                              <td className="px-5 py-3.5 text-right">
                                {status === 'red' ? (
                                  <NudgeButton
                                    sent={nudgedKeys.has(row.key)}
                                    sending={nudgingKey === row.key}
                                    disabled={!teacherRowIdForNudge}
                                    onClick={() => selectedClass && sendNudge(row, `${selectedClass.grade}-${selectedClass.section}`, teacherRowIdForNudge, row.teacherName ?? '')}
                                  />
                                ) : <span className="text-xs text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        teacherRows.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">No class-subject assignments for this teacher yet.</td></tr>
                        ) : teacherRows.map(row => {
                          const status = statusOf(row.pct)
                          return (
                            <tr key={row.key} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5 text-gray-500 font-medium tabular-nums">{row.classLabel} <span className="text-gray-300">· Grade {row.grade}</span></td>
                              <td className="px-5 py-3.5 font-semibold" style={{ color: INK }}>{row.subject}</td>
                              <td className="px-5 py-3.5">
                                <PctBar pct={row.pct} />
                                <p className="text-[11px] text-gray-400 mt-1 tabular-nums">{row.covered} of {row.total} chapters</p>
                              </td>
                              <td className="px-5 py-3.5"><StatusPill pct={row.pct} /></td>
                              <td className="px-5 py-3.5 text-right">
                                {status === 'red' ? (
                                  <NudgeButton
                                    sent={nudgedKeys.has(row.key)}
                                    sending={nudgingKey === row.key}
                                    disabled={!selectedTeacherId}
                                    onClick={() => selectedTeacher && sendNudge(row, row.classLabel, selectedTeacherId, selectedTeacher.teacher_name)}
                                  />
                                ) : <span className="text-xs text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-5 px-5 py-3.5 flex-wrap">
                  {(['green', 'amber', 'red'] as const).map(s => (
                    <span key={s} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                      {STATUS_LABEL[s]} — {s === 'green' ? '≥75%' : s === 'amber' ? '50–74%' : 'below 50%'}
                    </span>
                  ))}
                </div>
              </UlearnCard>

              {/* Trend chart */}
              <UlearnCard borderColor={BORDER} className="p-5">
                <p className="text-sm font-semibold" style={{ color: INK }}>Coverage over time</p>
                <p className="text-xs text-gray-400 mt-0.5 mb-3">
                  {mode === 'class'
                    ? <>Per subject, for <strong style={{ color: INK }}>{selectedClass ? `${selectedClass.grade}-${selectedClass.section}` : '—'}</strong></>
                    : <>Per class-subject, for <strong style={{ color: INK }}>{selectedTeacher?.teacher_name ?? '—'}</strong></>}
                  {trend && trend.weeks.length > 0 ? ` — last ${trend.weeks.length} week${trend.weeks.length === 1 ? '' : 's'}` : ''}
                </p>
                {trendLoading ? (
                  <div className="h-56 flex items-center justify-center text-sm text-gray-400">Loading trend…</div>
                ) : !trend || trend.weeks.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-sm text-gray-400 text-center px-6">
                    No coverage history yet — weekly tracking snapshots build up over time, one point per week.
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={buildChartData(trend)} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke={BORDER} vertical={false} />
                        <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={{ stroke: BORDER }} tickLine={false} />
                        <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : String(v))} contentStyle={{ borderColor: BORDER, borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                        {trend.series.map((s, i) => (
                          <Line key={s.subject} type="monotone" dataKey={s.subject} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} strokeWidth={2.25} dot={{ r: 2.5 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </UlearnCard>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sortRows<T extends { pct: number }>(
  rows: T[],
  key: SortKey,
  dir: 1 | -1,
  getSubject: (r: T) => string,
  getSecondary: (r: T) => string
): T[] {
  const copy = [...rows]
  copy.sort((a, b) => {
    if (key === 'subject') return dir * getSubject(a).localeCompare(getSubject(b))
    if (key === 'teacher' || key === 'class') return dir * getSecondary(a).localeCompare(getSecondary(b))
    if (key === 'status') return dir * (statusRank(a.pct) - statusRank(b.pct))
    return dir * (a.pct - b.pct)
  })
  return copy
}

function statusRank(pct: number): number {
  const s = statusOf(pct)
  return s === 'red' ? 0 : s === 'amber' ? 1 : 2
}

function findTeacherIdByName(byTeacher: TeacherCoverage[], name: string | null): number | null {
  if (!name) return null
  return byTeacher.find(t => t.teacher_name === name)?.teacher_id ?? null
}

function buildChartData(trend: TrendResponse) {
  return trend.weeks.map((week, i) => {
    const row: Record<string, string | number | null> = { week: formatWeekLabel(week) }
    for (const s of trend.series) row[s.subject] = s.values[i]
    return row
  })
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function SortHeader({ label, sortKey, activeKey, dir, onClick }: {
  label: string; sortKey: SortKey; activeKey: SortKey; dir: 1 | -1; onClick: (k: SortKey) => void
}) {
  const active = activeKey === sortKey
  return (
    <th
      onClick={() => onClick(sortKey)}
      data-testid={`syllabus-tracking-sort-${sortKey}`}
      className="px-5 py-2.5 text-left text-xs font-semibold border-b cursor-pointer select-none whitespace-nowrap"
      style={{ borderColor: BORDER, color: active ? INK : '#9CA3AF' }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  )
}

function NudgeButton({ sent, sending, disabled, onClick }: { sent: boolean; sending: boolean; disabled: boolean; onClick: () => void }) {
  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: '#9CA3AF', border: `1px solid ${BORDER}` }}>
        <Check size={12} /> Nudge sent
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || sending}
      data-testid="syllabus-tracking-nudge-btn"
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
      style={{ borderColor: TEAL, color: TEAL }}
    >
      <Bell size={12} /> {sending ? 'Sending…' : 'Nudge teacher'}
    </button>
  )
}
