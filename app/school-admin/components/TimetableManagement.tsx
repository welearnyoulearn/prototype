'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { SCHEDULE, DAYS, ACADEMIC_SLOTS, ScheduleSlot, buildScheduleFromSettings, DEFAULT_SCHEDULE_SETTINGS } from '@/lib/schedule'

// ─── Types ────────────────────────────────────────────────────────────────────
type ClassRow = {
  id: number; grade: string; section: string
  class_teacher_name: string | null
  timetable_generated_at: string | null
}
type Teacher = { id: number; name: string; subject: string; staff_type: string }
type TimetableSlot = {
  id: number; day_of_week: string; period_number: number
  time_from: string; time_to: string
  subject_name?: string | null; subject?: string | null
  teacher_name?: string | null; teacher_id?: number | null
  room?: string | null; is_break?: boolean; break_label?: string | null
  grade?: string; section?: string
}
type UnavailSlot = { day_of_week: string; period_number: number }
type ClassSubstitute = {
  id: number; period_number: number; subject_name: string | null
  original_teacher_name: string | null; substitute_teacher_name: string | null
  date: string
}
type SubjectReport = {
  subject_name: string; periods_per_week: number
  teacher_id: number | null; teacher_name: string | null
  potential_teachers: { id: number; name: string }[]
  status: 'assigned' | 'available' | 'missing'
}
type ClassReport = {
  id: number; grade: string; section: string
  class_teacher_id: number | null; class_teacher_name: string | null
  subjects: SubjectReport[]
  total_subjects: number; assigned_subjects: number
  unassigned_subjects: number; missing_subjects: number
  total_periods_per_week: number
  has_timetable: boolean; timetable_slots: number
  timetable_generated_at: string | null
  issues: string[]; ready: boolean; can_generate: boolean
}
type ValidationResult = {
  classes: ClassReport[]
  summary: { total: number; ready: number; has_timetable: number; total_teachers: number; issues: string[] }
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────
function getAnchorMonday(): Date {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  if (dow === 0) monday.setDate(today.getDate() + 1)
  else monday.setDate(today.getDate() - (dow - 1))
  monday.setHours(0, 0, 0, 0)
  return monday
}
function getWeekDates(weekOffset = 0): Record<string, string> {
  const monday = getAnchorMonday()
  monday.setDate(monday.getDate() + weekOffset * 7)
  const result: Record<string, string> = {}
  DAYS.forEach((day, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    result[day] = d.toISOString().split('T')[0]
  })
  return result
}
function getToday(): string | null {
  const d = new Date().getDay()
  if (d === 0) return null
  if (d === 6) return 'Saturday'
  return DAYS[d - 1] ?? null
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Status badge helpers
const STATUS_COLOR: Record<string, string> = {
  assigned: 'bg-emerald-100 text-emerald-700',
  available: 'bg-amber-100 text-amber-700',
  missing: 'bg-red-100 text-red-700',
}
const STATUS_ICON: Record<string, string> = { assigned: '✓', available: '!', missing: '✗' }

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TimetableManagement({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState<'readiness' | 'classes' | 'teachers'>('readiness')
  const [dynSchedule, setDynSchedule] = useState<ScheduleSlot[]>(SCHEDULE)
  const [dynAcademicSlots, setDynAcademicSlots] = useState<ScheduleSlot[]>(ACADEMIC_SLOTS)

  useEffect(() => {
    fetch(`/api/school-schedule?school_id=${schoolId}`)
      .then(r => r.json())
      .then(d => {
        if (d && d.periods_per_day) {
          const built = buildScheduleFromSettings(d)
          setDynSchedule(built)
          setDynAcademicSlots(built.filter(s => !s.is_break))
        }
      })
      .catch(() => {/* use defaults */})
  }, [schoolId])

  const tabs = [
    { key: 'readiness', label: 'Setup & Generate', icon: '⚡' },
    { key: 'classes',   label: 'Class Timetables', icon: '📅' },
    { key: 'teachers',  label: 'Teacher Timetables', icon: '👩‍🏫' },
  ] as const

  const schedInfo = (() => {
    const acSlots = dynAcademicSlots
    const first = acSlots[0]
    const last = acSlots[acSlots.length - 1]
    return first && last
      ? `${first.time_from}–${last.time_to} · ${acSlots.length} periods + ${dynSchedule.filter(s => s.is_break).length} breaks · Mon–Sat`
      : '08:30–17:00 · 8 periods + 3 breaks · Mon–Sat'
  })()

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Timetable Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">School day {schedInfo}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'readiness' && <ReadinessTab schoolId={schoolId} schedule={dynSchedule} />}
      {tab === 'classes'   && <ClassesTab   schoolId={schoolId} schedule={dynSchedule} academicSlots={dynAcademicSlots} />}
      {tab === 'teachers'  && <TeachersTab  schoolId={schoolId} schedule={dynSchedule} academicSlots={dynAcademicSlots} />}
    </div>
  )
}

// ─── Readiness & Generate Tab ─────────────────────────────────────────────────
function ReadinessTab({ schoolId, schedule }: { schoolId: number; schedule: ScheduleSlot[] }) {
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState<number | 'all' | null>(null)
  const [genResult, setGenResult] = useState<{ msg: string; isError: boolean; issues?: unknown[] } | null>(null)
  const [expandedClass, setExpandedClass] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)

  const loadValidation = useCallback(async () => {
    setLoading(true)
    setGenResult(null)
    try {
      const data = await fetch(`/api/class-timetable/validate?school_id=${schoolId}`).then(r => r.json())
      setValidation(data)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { loadValidation() }, [loadValidation])

  async function generateClass(classId: number | null) {
    setGenerating(classId ?? 'all')
    setGenResult(null)
    try {
      const body: Record<string, unknown> = { school_id: schoolId, force_replace: false }
      if (classId) body.class_id = classId
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenResult({ msg: data.error || 'Generation failed', isError: true })
      } else {
        const issueCount = (data.issues || []).length
        setGenResult({
          msg: `Generated ${data.slots} slots across ${data.classes_generated} class(es) — synced to all teacher & student views${issueCount > 0 ? ` · ${issueCount} class(es) have unfilled slots` : ''}`,
          isError: false,
          issues: data.issues,
        })
        await loadValidation()
      }
    } finally { setGenerating(null) }
  }

  async function syncTeachers() {
    setSyncing(true)
    setGenResult(null)
    try {
      const res = await fetch('/api/class-timetable/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId }),
      })
      const data = await res.json()
      if (res.ok) {
        setGenResult({
          msg: `Teachers synced — ${data.teachers_propagated ?? 0} slot(s) updated from subject assignments.`,
          isError: false,
        })
        await loadValidation()
      } else {
        setGenResult({ msg: data.error || 'Sync failed', isError: true })
      }
    } finally { setSyncing(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
      Checking readiness...
    </div>
  )
  if (!validation) return null

  const { classes, summary } = validation
  const ungeneratedReady = classes.filter(c => c.can_generate && !c.has_timetable)
  const allGenerated = classes.every(c => c.has_timetable)

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Summary header */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Classes', val: summary.total, color: 'text-gray-800' },
          { label: 'With Timetable', val: summary.has_timetable, color: 'text-emerald-600' },
          { label: 'Ready to Generate', val: ungeneratedReady.length, color: 'text-blue-600' },
          { label: 'Teaching Staff', val: summary.total_teachers, color: 'text-purple-600' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className={`text-2xl font-bold ${color}`}>{val}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {allGenerated ? 'All class timetables are generated.' : `${ungeneratedReady.length} class${ungeneratedReady.length !== 1 ? 'es' : ''} ready to generate.`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Generate fills slots based on subjects + teachers. Drag-drop to reorder in Class Timetables tab.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={loadValidation}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            Refresh
          </button>
          <button
            onClick={syncTeachers}
            disabled={syncing || generating !== null}
            className="px-4 py-2 border border-purple-200 text-purple-600 text-sm font-medium rounded-lg hover:bg-purple-50 disabled:opacity-50 transition-colors flex items-center gap-2">
            {syncing ? (
              <><div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />Syncing...</>
            ) : '↻ Sync Teachers'}
          </button>
          {ungeneratedReady.length > 0 && (
            <button
              onClick={() => generateClass(null)}
              disabled={generating !== null}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
              {generating === 'all' ? (
                <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
              ) : <>⚡ Generate All ({ungeneratedReady.length})</>}
            </button>
          )}
        </div>
      </div>


      {/* Generation result */}
      {genResult && (
        <div className={`rounded-xl border px-5 py-4 text-sm ${genResult.isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <div className="flex items-start justify-between gap-3">
            <span>{genResult.msg}</span>
            <button onClick={() => setGenResult(null)} className="opacity-60 hover:opacity-100 flex-shrink-0 text-lg leading-none">×</button>
          </div>
          {(genResult.issues as Array<{ class: string; unfilled_slots: number; missing_teachers: string[] }> || []).map((issue) => (
            <div key={issue.class} className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2">
              <strong>Grade {issue.class}</strong>: {issue.unfilled_slots} unfilled slots
              {issue.missing_teachers.length > 0 && ` · No teacher for: ${issue.missing_teachers.join(', ')}`}
            </div>
          ))}
        </div>
      )}

      {/* Per-class cards */}
      <div className="space-y-3">
        {classes.map(cls => (
          <div key={cls.id} className={`bg-white rounded-xl border overflow-hidden transition-all ${
            cls.has_timetable ? 'border-emerald-200' : cls.can_generate ? 'border-blue-200' : 'border-gray-200'
          }`}>
            {/* Card header */}
            <div className="flex items-center gap-4 px-5 py-4">
              {/* Status dot */}
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                cls.has_timetable ? 'bg-emerald-500' : cls.can_generate ? 'bg-blue-400' : 'bg-amber-400'
              }`} />

              {/* Grade info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900 text-base">Grade {cls.grade}–{cls.section}</span>
                  {cls.has_timetable && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold uppercase">
                      Generated {cls.timetable_generated_at ? fmtDate(cls.timetable_generated_at) : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {cls.total_subjects} subjects · {cls.total_periods_per_week} periods/week
                  {cls.class_teacher_name ? ` · CT: ${cls.class_teacher_name}` : ' · No class teacher'}
                  {cls.missing_subjects > 0 && <span className="text-red-500 ml-1">· {cls.missing_subjects} subject(s) need teacher</span>}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setExpandedClass(expandedClass === cls.id ? null : cls.id)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 transition-colors">
                  {expandedClass === cls.id ? 'Hide ▲' : 'Details ▼'}
                </button>

                {cls.can_generate ? (
                  <button
                    onClick={() => generateClass(cls.id)}
                    disabled={generating !== null}
                    className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-1.5">
                    {generating === cls.id ? (
                      <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
                    ) : cls.has_timetable ? '↻ Regenerate' : '⚡ Generate'}
                  </button>
                ) : (
                  <span className="text-xs text-amber-600 border border-amber-200 bg-amber-50 px-3 py-1 rounded-lg">
                    Fix issues first
                  </span>
                )}
              </div>
            </div>

            {/* Expanded subject detail */}
            {expandedClass === cls.id && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                {cls.subjects.length === 0 ? (
                  <p className="text-sm text-gray-400">No subjects assigned to this class. Go to Curriculum section.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Subject Coverage</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {cls.subjects.map(sub => (
                        <div key={sub.subject_name} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                          sub.status === 'assigned' ? 'bg-white border-emerald-200' :
                          sub.status === 'available' ? 'bg-amber-50 border-amber-200' :
                          'bg-red-50 border-red-200'
                        }`}>
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${STATUS_COLOR[sub.status]}`}>
                            {STATUS_ICON[sub.status]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800 truncate">{sub.subject_name}</p>
                            <p className="text-gray-400 truncate">
                              {sub.teacher_name ?? (
                                sub.status === 'available'
                                  ? `${sub.potential_teachers[0]?.name ?? ''} (not assigned)`
                                  : 'No teacher in school'
                              )} · {sub.periods_per_week}p/wk
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {cls.issues.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {cls.issues.map((issue, i) => (
                          <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                            <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>{issue}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Schedule reference */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">School Schedule Reference</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {schedule.map(s => (
            <div key={s.slot} className={`rounded-lg px-2 py-2 text-center text-xs ${
              s.is_break ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-gray-50 border border-gray-100 text-gray-600'
            }`}>
              <p className="font-semibold">{s.short}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.time_from}</p>
              <p className="text-[10px] text-gray-400">–{s.time_to}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-400 rounded-full inline-block" />Assigned teacher</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full inline-block" />Teacher available but not assigned</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full inline-block" />No teacher in school for this subject</span>
        </div>
      </div>
    </div>
  )
}

// ─── Class Timetables Tab (with drag-drop editor) ──────────────────────────────
function ClassesTab({ schoolId, schedule, academicSlots }: { schoolId: number; schedule: ScheduleSlot[]; academicSlots: ScheduleSlot[] }) {
  const [classes, setClasses]           = useState<ClassRow[]>([])
  const [selected, setSelected]         = useState<ClassRow | null>(null)
  const [timetable, setTimetable]       = useState<TimetableSlot[]>([])
  const [loading, setLoading]           = useState(true)
  const [ttLoading, setTtLoading]       = useState(false)
  const [classSubstitutes, setClassSubstitutes] = useState<ClassSubstitute[]>([])
  const [weekOffset, setWeekOffset]     = useState(0)
  const [editMode, setEditMode]         = useState(false)
  const [dragSlot, setDragSlot]         = useState<TimetableSlot | null>(null)
  const [dragOver, setDragOver]         = useState<{ day: string; slot: number } | null>(null)
  const [swapping, setSwapping]         = useState(false)
  const [swapMsg, setSwapMsg]           = useState<{ text: string; ok: boolean } | null>(null)
  const [editSlot, setEditSlot]         = useState<TimetableSlot | null>(null)
  const [teachers, setTeachers]         = useState<Teacher[]>([])
  const [saving, setSaving]             = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null)
  const [applyToAll, setApplyToAll]     = useState(true)
  type BusyInfo = { grade: string; section: string; subject_name: string | null }
  const [busyTeachers, setBusyTeachers] = useState<Record<number, BusyInfo>>({})
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [timingMode, setTimingMode]     = useState(false)
  const [timingEdits, setTimingEdits]   = useState<Record<number, { time_from: string; time_to: string }>>({})
  const [timingSaving, setTimingSaving] = useState(false)
  const [timingMsg, setTimingMsg]       = useState<{ text: string; ok: boolean } | null>(null)
  const today = getToday()

  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json())
      .then(d => setClasses(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
    fetch(`/api/teachers?school_id=${schoolId}&staff_type=teaching`).then(r => r.json())
      .then(d => setTeachers(Array.isArray(d) ? d : []))
  }, [schoolId])

  async function selectClass(cls: ClassRow) {
    setSelected(cls); setTtLoading(true); setClassSubstitutes([]); setEditMode(false); setSwapMsg(null)
    const [ttData, subData] = await Promise.all([
      fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/substitutes?school_id=${schoolId}&class_id=${cls.id}`).then(r => r.json()),
    ])
    setTimetable(Array.isArray(ttData) ? ttData : [])
    setClassSubstitutes(Array.isArray(subData) ? subData : [])
    setTtLoading(false)
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────
  function onDragStart(slot: TimetableSlot) {
    if (!slot.is_break) setDragSlot(slot)
  }
  function onDragOver(e: React.DragEvent, day: string, slotNum: number) {
    e.preventDefault()
    setDragOver({ day, slot: slotNum })
  }
  function onDragLeave() { setDragOver(null) }

  async function onDrop(e: React.DragEvent, targetSlot: TimetableSlot) {
    e.preventDefault()
    setDragOver(null)
    if (!dragSlot || !selected || targetSlot.is_break) return
    if (dragSlot.id === targetSlot.id) { setDragSlot(null); return }

    setSwapping(true); setSwapMsg(null)
    const res = await fetch('/api/class-timetable/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, class_id: selected.id,
        slot_a: { day: dragSlot.day_of_week, period_number: Math.round(Number(dragSlot.period_number)) },
        slot_b: { day: targetSlot.day_of_week, period_number: Math.round(Number(targetSlot.period_number)) },
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setSwapMsg({ text: data.conflicts?.[0] ?? data.error ?? 'Swap failed', ok: false })
    } else {
      setSwapMsg({ text: 'Slots swapped successfully', ok: true })
      // Optimistic update in local state
      setTimetable(prev => prev.map(s => {
        const aMatch = s.day_of_week === dragSlot.day_of_week && Math.round(Number(s.period_number)) === Math.round(Number(dragSlot.period_number))
        const bMatch = s.day_of_week === targetSlot.day_of_week && Math.round(Number(s.period_number)) === Math.round(Number(targetSlot.period_number))
        if (aMatch) return { ...s, subject_name: targetSlot.subject_name, teacher_name: targetSlot.teacher_name, teacher_id: targetSlot.teacher_id, room: targetSlot.room }
        if (bMatch) return { ...s, subject_name: dragSlot.subject_name, teacher_name: dragSlot.teacher_name, teacher_id: dragSlot.teacher_id, room: dragSlot.room }
        return s
      }))
    }
    setDragSlot(null); setSwapping(false)
    setTimeout(() => setSwapMsg(null), 3000)
  }

  // ── Fetch busy teachers when edit modal opens ──────────────────────────────
  useEffect(() => {
    if (!editSlot || !selected) { setBusyTeachers({}); return }
    setLoadingAvail(true)
    setConflictError(null)
    setSelectedTeacherId(editSlot.teacher_id ?? null)
    setApplyToAll(true)
    const pNum = Math.round(Number(editSlot.period_number))
    fetch(`/api/class-timetable?school_id=${schoolId}&day_of_week=${encodeURIComponent(editSlot.day_of_week)}&period_number=${pNum}`)
      .then(r => r.json())
      .then((rows: TimetableSlot[]) => {
        if (!Array.isArray(rows)) return
        const busy: Record<number, BusyInfo> = {}
        for (const row of rows) {
          // A teacher is "busy" if they're assigned to a DIFFERENT class at this slot
          if (row.teacher_id && (row as TimetableSlot & { class_id?: number }).class_id !== selected.id) {
            busy[row.teacher_id] = {
              grade: row.grade ?? '',
              section: row.section ?? '',
              subject_name: row.subject_name ?? null,
            }
          }
        }
        setBusyTeachers(busy)
      })
      .catch(() => setBusyTeachers({}))
      .finally(() => setLoadingAvail(false))
  }, [editSlot, selected, schoolId])

  // ── Edit slot (assign/change teacher) ──────────────────────────────────────
  // applyToAll=true → replace teacher on ALL periods of this subject in the class
  async function saveEditSlot(teacherId: number | null, applyAll: boolean) {
    if (!editSlot || !selected) return
    // Block if teacher is busy at this slot in another class
    if (teacherId && busyTeachers[teacherId]) {
      const b = busyTeachers[teacherId]
      setConflictError(`${teachers.find(t => t.id === teacherId)?.name} is already teaching ${b.subject_name || 'another subject'} in Grade ${b.grade}-${b.section} at this time.`)
      return
    }
    setConflictError(null)
    setSaving(true)
    const pNum = Math.round(Number(editSlot.period_number))
    const teacherName = teachers.find(t => t.id === teacherId)?.name ?? null

    if (applyAll && editSlot.subject_name) {
      await fetch('/api/class-timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selected.id, school_id: schoolId,
          teacher_id: teacherId,
          apply_to_subject: true,
          subject_name: editSlot.subject_name,
        }),
      })
      // Update all slots for this subject in local state
      setTimetable(prev => prev.map(s =>
        s.subject_name === editSlot.subject_name
          ? { ...s, teacher_id: teacherId, teacher_name: teacherName }
          : s
      ))
    } else {
      await fetch('/api/class-timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selected.id, school_id: schoolId,
          day_of_week: editSlot.day_of_week, period_number: pNum,
          teacher_id: teacherId,
        }),
      })
      setTimetable(prev => prev.map(s =>
        s.day_of_week === editSlot.day_of_week && Math.round(Number(s.period_number)) === pNum
          ? { ...s, teacher_id: teacherId, teacher_name: teacherName }
          : s
      ))
    }
    setSaving(false); setEditSlot(null)
  }

  // ── Save timing edits ──────────────────────────────────────────────────────
  async function saveTimings() {
    const entries = Object.entries(timingEdits)
    if (entries.length === 0) { setTimingMode(false); return }
    setTimingSaving(true); setTimingMsg(null)
    try {
      await Promise.all(entries.map(([periodNum, times]) =>
        fetch('/api/class-timetable', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: schoolId, period_number: parseInt(periodNum), ...times }),
        })
      ))
      setTimingMsg({ text: `Updated ${entries.length} slot timing(s) across all classes.`, ok: true })
      setTimingEdits({})
      setTimingMode(false)
      // Reload timetable if a class is selected
      if (selected) {
        const ttData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}`).then(r => r.json())
        setTimetable(Array.isArray(ttData) ? ttData : [])
      }
    } catch {
      setTimingMsg({ text: 'Failed to save timings', ok: false })
    } finally {
      setTimingSaving(false)
      setTimeout(() => setTimingMsg(null), 4000)
    }
  }

  // Derive slot times from actual class_timetable data (overrides schedule after timing edits).
  // class_timetable.time_from/time_to are updated by PATCH, so this stays accurate after saves.
  const effectiveSlotTimes: Record<number, { time_from: string; time_to: string }> = {}
  for (const row of timetable) {
    const pn = Math.round(Number(row.period_number))
    if (!effectiveSlotTimes[pn] && row.time_from && row.time_to) {
      effectiveSlotTimes[pn] = { time_from: row.time_from, time_to: row.time_to }
    }
  }

  // Organize classes by grade
  const byGrade: Record<string, ClassRow[]> = {}
  for (const c of classes) {
    if (!byGrade[c.grade]) byGrade[c.grade] = []
    byGrade[c.grade].push(c)
  }
  const weekDates = getWeekDates(weekOffset)
  const subsThisWeek = classSubstitutes.filter(s => s.date >= weekDates['Monday'] && s.date <= weekDates['Saturday'])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading classes...</div>

  return (
    <div className="flex gap-5">
      {/* Class list */}
      <div className="w-52 flex-shrink-0 space-y-3">
        {classes.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">No classes</p>
        ) : (
          Object.entries(byGrade).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([grade, gradeClasses]) => (
            <div key={grade} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade {grade}</span>
              </div>
              {gradeClasses.map(c => (
                <button key={c.id} onClick={() => selectClass(c)}
                  className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 last:border-b-0 transition-colors ${
                    selected?.id === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  Section {c.section}
                  {c.timetable_generated_at && <span className="block text-[10px] text-emerald-500 font-normal">✓ Generated</span>}
                  {!c.timetable_generated_at && <span className="block text-[10px] text-amber-500 font-normal">Not generated</span>}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Timetable grid */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <p className="text-gray-400 text-sm">Select a class to view and edit its timetable</p>
          </div>
        ) : ttLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-gray-800">Grade {selected.grade} – Section {selected.section}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {timetable.filter(s => !s.is_break && s.subject_name).length} of {academicSlots.length * DAYS.length} academic slots filled
                  {selected.timetable_generated_at ? ` · Generated ${fmtDate(selected.timetable_generated_at)}` : ' · Not generated yet'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {subsThisWeek.length > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">
                    {subsThisWeek.length} sub period{subsThisWeek.length > 1 ? 's' : ''} this week
                  </span>
                )}
                <button onClick={() => { setTimingMode(v => !v); setTimingEdits({}) }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    timingMode ? 'bg-teal-600 text-white border-teal-600' : 'border-teal-300 text-teal-600 hover:bg-teal-50'
                  }`}>
                  {timingMode ? '× Close Timings' : '⏱ Edit Timings'}
                </button>
                {timetable.length > 0 && (
                  <button onClick={() => setEditMode(v => !v)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      editMode ? 'bg-orange-500 text-white border-orange-500' : 'border-orange-300 text-orange-600 hover:bg-orange-50'
                    }`}>
                    {editMode ? '✓ Edit Mode ON' : '✏ Edit Mode'}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button onClick={() => setWeekOffset(w => w - 1)} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">← Prev</button>
                  <button onClick={() => setWeekOffset(0)} className={`px-2 py-1 text-xs border rounded-lg ${weekOffset === 0 ? 'border-orange-300 bg-orange-50 text-orange-700 font-medium' : 'border-gray-200 hover:bg-gray-50'}`}>This Week</button>
                  <button onClick={() => setWeekOffset(w => w + 1)} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Next →</button>
                </div>
              </div>
            </div>

            {/* Swap messages */}
            {swapMsg && (
              <div className={`mx-4 mt-3 px-4 py-2 rounded-lg text-xs border ${swapMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {swapMsg.text}
              </div>
            )}
            <div className="mx-4 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <strong>Click any period</strong> to assign or change the teacher.
              {timetable.length > 0 && (
                <span className="ml-2 text-blue-500">Enable <strong>Edit Mode</strong> to drag-and-drop periods to swap their order.</span>
              )}
            </div>
            {editMode && (
              <div className="mx-4 mt-1 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                <strong>Edit Mode ON:</strong> Drag any period to swap it with another slot.
              </div>
            )}
            {swapping && (
              <div className="mx-4 mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />Checking conflicts and swapping...
              </div>
            )}
            {timingMsg && (
              <div className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs border ${timingMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {timingMsg.text}
              </div>
            )}

            {/* Timing editor panel */}
            {timingMode && (
              <div className="mx-4 mt-3 bg-teal-50 border border-teal-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide">Edit Period Timings (applies school-wide)</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setTimingMode(false); setTimingEdits({}) }}
                      className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveTimings} disabled={timingSaving || Object.keys(timingEdits).length === 0}
                      className="px-3 py-1 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors font-semibold">
                      {timingSaving ? 'Saving...' : `Save ${Object.keys(timingEdits).length > 0 ? `(${Object.keys(timingEdits).length} changed)` : ''}`}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {schedule.map(s => {
                    const edit = timingEdits[s.slot]
                    const curFrom = edit?.time_from ?? effectiveSlotTimes[s.slot]?.time_from ?? s.time_from
                    const curTo = edit?.time_to ?? effectiveSlotTimes[s.slot]?.time_to ?? s.time_to
                    const changed = !!edit
                    return (
                      <div key={s.slot} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${s.is_break ? 'bg-amber-50 border border-amber-200' : changed ? 'bg-white border border-teal-300' : 'bg-white border border-gray-100'}`}>
                        <span className={`w-20 text-xs font-semibold ${s.is_break ? 'text-amber-600' : 'text-gray-700'}`}>{s.label}</span>
                        <div className="flex items-center gap-2">
                          <input type="time" value={curFrom}
                            onChange={e => setTimingEdits(prev => ({ ...prev, [s.slot]: { time_from: e.target.value, time_to: prev[s.slot]?.time_to ?? s.time_to } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-300 w-28" />
                          <span className="text-gray-400 text-xs">–</span>
                          <input type="time" value={curTo}
                            onChange={e => setTimingEdits(prev => ({ ...prev, [s.slot]: { time_from: prev[s.slot]?.time_from ?? s.time_from, time_to: e.target.value } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-300 w-28" />
                        </div>
                        {changed && <span className="text-[10px] text-teal-600 font-semibold">Changed</span>}
                        {s.is_break && <span className="text-[10px] text-amber-500 ml-1">break</span>}
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-teal-600 mt-2">Changes update all existing timetable slots with the same period number school-wide.</p>
              </div>
            )}

            {timetable.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <p className="text-sm">No timetable generated yet</p>
                <p className="text-xs text-gray-300 mt-1">Go to Setup & Generate tab</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-slate-800 text-slate-200 px-3 py-3 text-left font-semibold w-32 border-r border-slate-700 sticky left-0 z-10">
                        Slot / Time
                      </th>
                      {DAYS.map(d => (
                        <th key={d} className={`px-2 py-3 text-center font-semibold border-r border-slate-700 last:border-r-0 min-w-[110px] ${
                          d === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {d.slice(0, 3)}
                          {d === today && <span className="block text-[10px] font-normal text-blue-200">Today</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map(scheduleSlot => {
                      // Priority: 1) unsaved edit  2) actual DB data  3) school_schedule_settings
                      const slotFrom = timingEdits[scheduleSlot.slot]?.time_from ?? effectiveSlotTimes[scheduleSlot.slot]?.time_from ?? scheduleSlot.time_from
                      const slotTo = timingEdits[scheduleSlot.slot]?.time_to ?? effectiveSlotTimes[scheduleSlot.slot]?.time_to ?? scheduleSlot.time_to
                      if (scheduleSlot.is_break) {
                        return (
                          <tr key={scheduleSlot.slot} className="bg-amber-50 border-y border-amber-100">
                            <td className="px-3 py-2 border-r border-amber-100 sticky left-0 bg-amber-50 z-10">
                              <span className="font-semibold text-amber-600 text-[11px]">{scheduleSlot.break_label}</span>
                              <span className="block text-amber-400 text-[10px] font-normal">{slotFrom}–{slotTo}</span>
                            </td>
                            <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-2 text-[11px]">
                              {scheduleSlot.break_label} · {slotFrom} – {slotTo}
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={scheduleSlot.slot} className="border-b border-gray-100 hover:bg-gray-50/30">
                          <td className="px-3 py-2 bg-gray-50 border-r border-gray-100 sticky left-0 z-10">
                            <span className="font-bold text-gray-700 text-[11px]">{scheduleSlot.short}</span>
                            <span className="block text-gray-400 text-[10px] font-normal">{slotFrom}–{slotTo}</span>
                          </td>
                          {DAYS.map(day => {
                            const slot = timetable.find(s =>
                              s.day_of_week === day && Math.round(Number(s.period_number)) === scheduleSlot.slot
                            )
                            const cellDate = weekDates[day]
                            const sub = cellDate ? classSubstitutes.find(s => s.date.slice(0, 10) === cellDate && Math.round(Number(s.period_number)) === scheduleSlot.slot) : undefined
                            const hasSub = !!sub
                            const isDragging = dragSlot && dragSlot.day_of_week === day && Math.round(Number(dragSlot.period_number)) === scheduleSlot.slot
                            const isDropTarget = dragOver && dragOver.day === day && dragOver.slot === scheduleSlot.slot
                            const hasNoTeacher = slot?.subject_name && !slot?.teacher_id

                            return (
                              <td
                                key={day}
                                className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 align-top transition-colors ${
                                  isDropTarget ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : hasSub ? 'bg-amber-50/30' : ''
                                } ${isDragging ? 'opacity-40' : ''}`}
                                onDragOver={editMode && slot && !slot.is_break ? (e) => onDragOver(e, day, scheduleSlot.slot) : undefined}
                                onDragLeave={editMode ? onDragLeave : undefined}
                                onDrop={editMode && slot ? (e) => onDrop(e, slot) : undefined}
                              >
                                {slot ? (
                                  <div
                                    draggable={editMode && !slot.is_break}
                                    onDragStart={editMode && !slot.is_break ? () => onDragStart(slot) : undefined}
                                    // Teacher assign/change: always clickable on any academic slot
                                    onClick={!slot.is_break ? () => setEditSlot(slot) : undefined}
                                    className={`rounded-lg px-2 py-2 min-h-[54px] select-none ${
                                      !slot.is_break ? 'cursor-pointer' : ''
                                    } ${
                                      editMode && !slot.is_break ? 'active:cursor-grabbing hover:ring-2 hover:ring-orange-300' :
                                      !slot.is_break ? 'hover:ring-2 hover:ring-blue-200' : ''
                                    } ${
                                      hasSub ? 'border-2 border-amber-300 bg-amber-50' :
                                      hasNoTeacher ? 'bg-red-50 border border-red-200' :
                                      slot.subject_name ? 'bg-emerald-50 border border-emerald-200' :
                                      'bg-gray-50 border border-gray-100'
                                    }`}
                                  >
                                    {slot.subject_name ? (
                                      <>
                                        <p className={`font-semibold leading-tight text-[11px] ${hasSub ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                          {slot.subject_name}
                                        </p>
                                        {hasSub && (
                                          <>
                                            <span className="text-[9px] font-bold bg-amber-400 text-white px-1 py-0.5 rounded uppercase">SUB</span>
                                            <p className="text-[10px] text-amber-700 font-medium mt-0.5">{sub.substitute_teacher_name}</p>
                                          </>
                                        )}
                                        {!hasSub && (
                                          slot.teacher_name
                                            ? <p className="text-gray-500 text-[10px] mt-0.5">{slot.teacher_name}</p>
                                            : <button
                                                onClick={e => { e.stopPropagation(); setEditSlot(slot) }}
                                                className="mt-0.5 text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-100 transition-colors"
                                              >+ Assign Teacher</button>
                                        )}
                                        {slot.room && <p className="text-gray-400 text-[10px] mt-0.5">{slot.room}</p>}
                                        {editMode
                                          ? <p className="text-orange-400 text-[9px] mt-0.5">drag to swap</p>
                                          : <p className="text-blue-300 text-[9px] mt-0.5">click to change teacher</p>
                                        }
                                      </>
                                    ) : (
                                      <div className="flex items-center justify-center h-full min-h-[38px]">
                                        <span className="text-gray-300 italic text-[10px]">Free</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="rounded-lg px-2 py-2 bg-gray-50 border border-dashed border-gray-200 min-h-[54px] flex items-center justify-center">
                                    <span className="text-gray-200 text-[10px]">—</span>
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend */}
            {timetable.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-200 border border-emerald-300 rounded inline-block" />Period with teacher</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-100 border border-red-200 rounded inline-block" />No teacher assigned</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-200 border border-amber-300 rounded inline-block" />Substitute active</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-50 border border-amber-100 rounded inline-block" />Break slot</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit slot modal */}
      {editSlot && (() => {
        const subj = editSlot.subject_name ?? ''
        const matchTeacher = (t: Teacher) => {
          if (!subj) return false
          const sn = subj.toLowerCase(); const ts = (t.subject || '').toLowerCase()
          return sn === ts || ts.includes(sn) || sn.includes(ts)
        }
        const availableMatch   = teachers.filter(t => !busyTeachers[t.id] && matchTeacher(t))
        const availableOther   = teachers.filter(t => !busyTeachers[t.id] && !matchTeacher(t))
        const busyList         = teachers.filter(t => !!busyTeachers[t.id])

        const TeacherRow = ({ t, isBusy }: { t: Teacher; isBusy: boolean }) => {
          const busy = busyTeachers[t.id]
          const isSelected = selectedTeacherId === t.id
          return (
            <button
              key={t.id}
              disabled={isBusy}
              onClick={() => !isBusy && setSelectedTeacherId(t.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                isBusy ? 'opacity-50 cursor-not-allowed bg-gray-50' :
                isSelected ? 'bg-blue-600 text-white' :
                'hover:bg-gray-50 text-gray-800'
              }`}
            >
              <span>
                <span className="font-medium">{t.name}</span>
                {t.subject && <span className={`ml-1.5 text-[11px] ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>· {t.subject}</span>}
              </span>
              {isBusy && busy && (
                <span className="text-[10px] text-red-500 font-medium flex-shrink-0 ml-2">
                  Busy · Gr {busy.grade}-{busy.section}
                  {busy.subject_name ? ` · ${busy.subject_name}` : ''}
                </span>
              )}
              {!isBusy && isSelected && (
                <span className="text-[11px] text-blue-200 flex-shrink-0 ml-2">✓ Selected</span>
              )}
            </button>
          )
        }

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditSlot(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-900">
                  {editSlot.teacher_id ? 'Change Teacher' : 'Assign Teacher'}
                </h3>
                <button onClick={() => setEditSlot(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{editSlot.day_of_week}</span>
                <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {schedule.find(s => s.slot === Math.round(Number(editSlot.period_number)))?.label}
                </span>
                {subj && <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{subj}</span>}
                {editSlot.teacher_name && (
                  <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    Current: {editSlot.teacher_name}
                  </span>
                )}
              </div>

              {/* Teacher list */}
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                {loadingAvail ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-gray-400 text-sm">
                    <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Checking availability...
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                    {/* No teacher option */}
                    <button
                      onClick={() => setSelectedTeacherId(null)}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        selectedTeacherId === null ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-50 italic'
                      }`}
                    >— No teacher assigned —</button>

                    {/* Available: subject match */}
                    {availableMatch.length > 0 && (
                      <>
                        <div className="px-3 py-1 bg-emerald-50 text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">
                          ✓ Available — {subj || 'Subject'} Teachers
                        </div>
                        {availableMatch.map(t => <TeacherRow key={t.id} t={t} isBusy={false} />)}
                      </>
                    )}

                    {/* Available: other */}
                    {availableOther.length > 0 && (
                      <>
                        <div className="px-3 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                          ✓ Available — Other Staff
                        </div>
                        {availableOther.map(t => <TeacherRow key={t.id} t={t} isBusy={false} />)}
                      </>
                    )}

                    {/* Busy teachers */}
                    {busyList.length > 0 && (
                      <>
                        <div className="px-3 py-1 bg-red-50 text-[10px] font-semibold text-red-400 uppercase tracking-wide">
                          ✗ Busy at this slot — cannot assign
                        </div>
                        {busyList.map(t => <TeacherRow key={t.id} t={t} isBusy />)}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Conflict error */}
              {conflictError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {conflictError}
                </div>
              )}

              {/* Apply to all toggle */}
              {subj && (
                <label className="flex items-start gap-2 mb-4 cursor-pointer select-none">
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="mt-0.5 accent-blue-600" />
                  <span className="text-xs text-gray-600">
                    <span className="font-semibold">Apply to all {subj} periods in this class</span>
                    <span className="block text-gray-400 text-[10px] mt-0.5">
                      Replaces teacher for every {subj} slot · availability shown for current slot only
                    </span>
                  </span>
                </label>
              )}

              <div className="flex gap-2">
                <button onClick={() => setEditSlot(null)}
                  className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  disabled={saving}
                  onClick={() => saveEditSlot(selectedTeacherId, applyToAll)}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving...' : editSlot.teacher_id ? 'Change Teacher' : 'Assign Teacher'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Teacher Timetables Tab ───────────────────────────────────────────────────
function TeachersTab({ schoolId, schedule, academicSlots }: { schoolId: number; schedule: ScheduleSlot[]; academicSlots: ScheduleSlot[] }) {
  const [teachers, setTeachers]   = useState<Teacher[]>([])
  const [selected, setSelected]   = useState<Teacher | null>(null)
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [unavail, setUnavail]     = useState<UnavailSlot[]>([])
  const [ttLoading, setTtLoading] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [showAvail, setShowAvail] = useState(false)
  const [toggling, setToggling]   = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const today = getToday()

  useEffect(() => {
    fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json())
      .then(d => setTeachers(Array.isArray(d) ? d.filter((t: Teacher) => t.staff_type !== 'non_teaching') : []))
      .finally(() => setLoading(false))
  }, [schoolId])

  async function selectTeacher(t: Teacher) {
    setSelected(t); setTtLoading(true); setShowAvail(false)
    const [tt, av] = await Promise.all([
      fetch(`/api/timetable?teacher_id=${t.id}&school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/teacher-availability?teacher_id=${t.id}&school_id=${schoolId}`).then(r => r.json()),
    ])
    setTimetable(Array.isArray(tt) ? tt : [])
    setUnavail(Array.isArray(av) ? av : [])
    setTtLoading(false)
  }

  async function toggleSlot(day: string, slotNum: number) {
    if (!selected) return
    const key = `${day}-${slotNum}`
    setToggling(key)
    const isBlocked = unavail.some(s => s.day_of_week === day && s.period_number === slotNum)
    try {
      if (isBlocked) {
        await fetch(`/api/teacher-availability?teacher_id=${selected.id}&school_id=${schoolId}&day_of_week=${day}&period_number=${slotNum}`, { method: 'DELETE' })
        setUnavail(prev => prev.filter(s => !(s.day_of_week === day && s.period_number === slotNum)))
      } else {
        const res = await fetch('/api/teacher-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: selected.id, school_id: schoolId, day_of_week: day, period_number: slotNum }),
        })
        const data = await res.json()
        if (!data.already_set) setUnavail(prev => [...prev, { day_of_week: day, period_number: slotNum }])
      }
    } finally { setToggling(null) }
  }

  const byDay: Record<string, TimetableSlot[]> = {}
  DAYS.forEach(d => { byDay[d] = [] })
  timetable.forEach(p => { if (byDay[p.day_of_week]) byDay[p.day_of_week].push(p) })

  const filtered = teachers.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.subject || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="py-12 text-center text-gray-400">Loading teachers...</div>

  return (
    <div className="flex gap-5">
      {/* Teacher list */}
      <div className="w-52 flex-shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teachers..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0
            ? <p className="text-sm text-gray-400 px-4 py-6 text-center">No teachers found</p>
            : (
              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {filtered.map(t => (
                  <button key={t.id} onClick={() => selectTeacher(t)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selected?.id === t.id ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
                    }`}>
                    <p className="text-sm font-medium text-gray-800">{t.name}</p>
                    {t.subject && <p className="text-xs text-gray-400 mt-0.5">{t.subject}</p>}
                    <p className="text-[10px] text-gray-300 mt-0.5">{timetable.filter(s => s.day_of_week !== undefined).length > 0 && selected?.id === t.id ? `${timetable.length}p/wk` : ''}</p>
                  </button>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 space-y-4">
        {!selected ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <p className="text-gray-400 text-sm">Select a teacher to view their timetable</p>
          </div>
        ) : ttLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-gray-800">{selected.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selected.subject || 'No subject'} · {timetable.length} periods/week
                  {unavail.length > 0 && ` · ${unavail.length} unavailability slot(s)`}
                </p>
              </div>
              <button onClick={() => setShowAvail(v => !v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  showAvail ? 'bg-teal-600 text-white border-teal-600' : 'border-teal-200 text-teal-600 hover:bg-teal-50'
                }`}>
                {showAvail ? 'Hide Availability' : 'Set Availability'}
                {unavail.length > 0 && !showAvail && (
                  <span className="ml-1.5 bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full">{unavail.length}</span>
                )}
              </button>
            </div>

            {/* Availability editor */}
            {showAvail && (
              <div className="bg-white rounded-xl border border-teal-200 p-5">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
                  Unavailability — click to block/unblock slots for timetable generation
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 font-semibold text-left w-24">Period</th>
                        {DAYS.map(d => (
                          <th key={d} className="px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 font-semibold text-center min-w-[70px]">
                            {d.slice(0, 3)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {academicSlots.map(s => (
                        <tr key={s.slot}>
                          <td className="px-3 py-1.5 border border-gray-100 bg-gray-50 whitespace-nowrap">
                            <span className="font-semibold text-gray-600">{s.short}</span>
                            <span className="block text-[10px] text-gray-400">{s.time_from}</span>
                          </td>
                          {DAYS.map(day => {
                            const key = `${day}-${s.slot}`
                            const isBlocked = unavail.some(u => u.day_of_week === day && u.period_number === s.slot)
                            const hasClass = timetable.some(t => t.day_of_week === day && Math.round(Number(t.period_number)) === s.slot)
                            return (
                              <td key={day} className="px-1 py-1 border border-gray-100 text-center">
                                <button
                                  onClick={() => toggleSlot(day, s.slot)}
                                  disabled={!!toggling}
                                  title={isBlocked ? 'Click to unblock' : hasClass ? 'Has class assigned' : 'Click to block'}
                                  className={`w-full h-8 rounded-lg text-[10px] font-medium transition-colors ${
                                    isBlocked ? 'bg-red-500 text-white' :
                                    hasClass ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                    'bg-gray-50 border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-400'
                                  }`}>
                                  {toggling === key ? '...' : isBlocked ? '✗' : hasClass ? '✓' : '—'}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  Red = blocked for generation · Green = has class · Grey = free
                </p>
              </div>
            )}

            {/* Teacher timetable grid */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Weekly Schedule</p>
              </div>
              {timetable.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">No timetable assigned yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-28 border-r border-slate-700 sticky left-0 z-10">Period</th>
                        {DAYS.map(d => (
                          <th key={d} className={`px-2 py-2.5 text-center font-semibold border-r border-slate-700 last:border-r-0 min-w-[90px] ${
                            d === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'
                          }`}>{d.slice(0, 3)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map(s => {
                        if (s.is_break) {
                          return (
                            <tr key={s.slot} className="bg-amber-50 border-y border-amber-100">
                              <td className="px-3 py-1.5 border-r border-amber-100 sticky left-0 bg-amber-50 z-10">
                                <span className="font-semibold text-amber-600 text-[11px]">{s.break_label}</span>
                                <span className="block text-amber-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                              </td>
                              <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-1.5 text-[11px]">{s.break_label}</td>
                            </tr>
                          )
                        }

                        return (
                          <tr key={s.slot} className="border-b border-gray-100">
                            <td className="px-3 py-1.5 bg-gray-50 border-r border-gray-100 sticky left-0 z-10">
                              <span className="font-semibold text-gray-600 text-[11px]">{s.short}</span>
                              <span className="block text-gray-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                            </td>
                            {DAYS.map(day => {
                              const slot = byDay[day]?.find(t => Math.round(Number(t.period_number)) === s.slot)
                              const blocked = unavail.some(u => u.day_of_week === day && u.period_number === s.slot)
                              return (
                                <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                                  {blocked ? (
                                    <div className="rounded px-1.5 py-1.5 bg-red-50 border border-red-200 min-h-[42px] flex items-center justify-center">
                                      <span className="text-red-300 text-[10px] italic">Unavailable</span>
                                    </div>
                                  ) : slot ? (
                                    <div className="rounded px-1.5 py-1.5 bg-emerald-50 border border-emerald-200 min-h-[42px]">
                                      <p className="font-semibold text-gray-800 leading-tight text-[11px]">{slot.subject}</p>
                                      {slot.grade && <p className="text-gray-500 text-[10px]">Gr.{slot.grade}–{slot.section}</p>}
                                      {slot.room && <p className="text-gray-400 text-[10px]">{slot.room}</p>}
                                    </div>
                                  ) : (
                                    <div className="rounded px-1.5 py-1.5 bg-gray-50 border border-gray-100 min-h-[42px] flex items-center justify-center">
                                      <span className="text-gray-200 text-[10px]">Free</span>
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
