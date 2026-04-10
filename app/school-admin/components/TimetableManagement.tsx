'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { SCHEDULE, DAYS, ACADEMIC_SLOTS, ScheduleSlot, buildScheduleFromSettings, DEFAULT_SCHEDULE_SETTINGS, SchoolScheduleSettings } from '@/lib/schedule'

// ─── Types ────────────────────────────────────────────────────────────────────
type ClassRow = {
  id: number; grade: string; section: string
  class_teacher_name: string | null
  timetable_generated_at: string | null
  timetable_circulated_at: string | null
}
type ClassHealth = {
  class_id: number
  conflict_count: number
  no_teacher_count: number
  subjects_unassigned: number
  timetable_exists: boolean
}
type Teacher = { id: number; name: string; subject: string; staff_type: string }
type TimetableSlot = {
  id: number; day_of_week: string; period_number: number
  time_from: string; time_to: string
  subject_name?: string | null; subject?: string | null
  teacher_name?: string | null; teacher_id?: number | null
  room?: string | null; is_break?: boolean; break_label?: string | null
  grade?: string; section?: string; class_id?: number
}
type UnavailSlot = { day_of_week: string; period_number: number }

function getToday(): string | null {
  const d = new Date().getDay()
  if (d === 0) return null
  if (d === 6) return 'Saturday'
  return DAYS[d - 1] ?? null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TimetableManagement({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState<'classes' | 'teachers' | 'template'>('classes')
  const [dynSchedule, setDynSchedule]   = useState<ScheduleSlot[]>(SCHEDULE)
  const [dynAcademicSlots, setDynAcademicSlots] = useState<ScheduleSlot[]>(ACADEMIC_SLOTS)
  const [scheduleSettings, setScheduleSettings] = useState<SchoolScheduleSettings>(DEFAULT_SCHEDULE_SETTINGS)

  const applySettings = useCallback((settings: SchoolScheduleSettings) => {
    const built = buildScheduleFromSettings(settings)
    setScheduleSettings(settings)
    setDynSchedule(built)
    setDynAcademicSlots(built.filter(s => !s.is_break))
  }, [])

  useEffect(() => {
    fetch(`/api/school-schedule?school_id=${schoolId}`)
      .then(r => r.json())
      .then(d => {
        if (d?.periods_per_day) {
          const settings: SchoolScheduleSettings = {
            periods_per_day: d.periods_per_day, start_time: d.start_time, end_time: d.end_time,
            morning_break_after_period: d.morning_break_after_period, morning_break_duration: d.morning_break_duration,
            lunch_after_period: d.lunch_after_period, lunch_duration: d.lunch_duration,
            afternoon_break_after_period: d.afternoon_break_after_period, afternoon_break_duration: d.afternoon_break_duration,
          }
          applySettings(settings)
        }
      })
      .catch(() => {})
  }, [schoolId, applySettings])

  return (
    <div>
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {([
          { key: 'classes',  label: 'Class Timetables',   icon: '📅' },
          { key: 'teachers', label: 'Teacher Schedules',  icon: '👩‍🏫' },
          { key: 'template', label: 'Schedule Template',  icon: '⚙️' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'classes'  && <ClassesTab  schoolId={schoolId} schedule={dynSchedule} academicSlots={dynAcademicSlots} />}
      {tab === 'teachers' && <TeachersTab schoolId={schoolId} schedule={dynSchedule} academicSlots={dynAcademicSlots} />}
      {tab === 'template' && <TemplateTab schoolId={schoolId} settings={scheduleSettings} onSaved={applySettings} />}
    </div>
  )
}

// ─── Class Timetables Tab ─────────────────────────────────────────────────────
function ClassesTab({ schoolId, schedule, academicSlots }: { schoolId: number; schedule: ScheduleSlot[]; academicSlots: ScheduleSlot[] }) {
  const [classes, setClasses]       = useState<ClassRow[]>([])
  const [healthMap, setHealthMap]   = useState<Record<number, ClassHealth>>({})
  const [teachers, setTeachers]     = useState<Teacher[]>([])
  const [selected, setSelected]     = useState<ClassRow | null>(null)
  const [timetable, setTimetable]   = useState<TimetableSlot[]>([])
  const [loading, setLoading]       = useState(true)
  const [ttLoading, setTtLoading]   = useState(false)

  // Named schedule templates — loaded once, used for template selector in Regenerate
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | 'default'>('default')

  // Active schedule — starts as school default, switches to selected template live
  const [activeSchedule, setActiveSchedule]           = useState<ScheduleSlot[]>(schedule)
  const [activeAcademicSlots, setActiveAcademicSlots] = useState<ScheduleSlot[]>(academicSlots)
  // Keep in sync with school default when parent rebuilds it (e.g. after schedule save)
  useEffect(() => {
    if (selectedTemplateId === 'default') {
      setActiveSchedule(schedule)
      setActiveAcademicSlots(academicSlots)
    }
  }, [schedule, academicSlots, selectedTemplateId])

  // Edit mode
  const [editMode, setEditMode]     = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null)
  const [swapMsg, setSwapMsg]       = useState<{ text: string; ok: boolean } | null>(null)
  // busyMap[teacherId][day] = Set of period numbers where that teacher is busy in OTHER classes
  const [busyMap, setBusyMap]       = useState<Record<number, Record<string, Set<number>>>>({})

  // Assign/change teacher modal (click on period)
  const [editSlot, setEditSlot]     = useState<TimetableSlot | null>(null)
  const [selTeacherId, setSelTeacherId] = useState<number | null>(null)
  const [applyToAll, setApplyToAll] = useState(true)
  const [saving, setSaving]         = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  type BusyInfo = { grade: string; section: string; subject_name: string | null }
  const [busyTeachers, setBusyTeachers] = useState<Record<number, BusyInfo>>({})
  const [loadingAvail, setLoadingAvail] = useState(false)

  // Regenerate + Circulate
  const [regenerating, setRegenerating]     = useState(false)
  const [regenMsg, setRegenMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  const [circulating, setCirculating]       = useState(false)
  const [circulateMsg, setCirculateMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  const [conflictCount, setConflictCount]   = useState(0)
  // Track unsaved changes made after last circulation (swap / teacher edit / regenerate)
  const [hasChanges, setHasChanges]         = useState(false)

  // Named schedule templates — loaded once, used for template selector in Regenerate
  const today = getToday()

  const loadHealth = useCallback(() => {
    fetch(`/api/class-timetable/health?school_id=${schoolId}`)
      .then(r => r.json())
      .then((rows: ClassHealth[]) => {
        if (!Array.isArray(rows)) return
        const map: Record<number, ClassHealth> = {}
        rows.forEach(r => { map[r.class_id] = r })
        setHealthMap(map)
      })
      .catch(() => {})
  }, [schoolId])

  // ── Cache all school slots on mount — avoids re-fetching on every class open ─
  type RawSlot = TimetableSlot & { class_id?: number }
  const [allSchoolSlots, setAllSchoolSlots] = useState<RawSlot[]>([])

  const refreshAllSlots = useCallback(() =>
    fetch(`/api/class-timetable?school_id=${schoolId}`).then(r => r.json())
      .then(d => setAllSchoolSlots(Array.isArray(d) ? d : []))
      .catch(() => {})
  , [schoolId])

  useEffect(() => {
    Promise.all([
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/teachers?school_id=${schoolId}&staff_type=teaching`).then(r => r.json()),
      fetch(`/api/class-timetable?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/schedule-templates?school_id=${schoolId}`).then(r => r.json()),
    ]).then(([cls, tch, allSlots, tmpls]) => {
      setClasses(Array.isArray(cls) ? cls : [])
      setTeachers(Array.isArray(tch) ? tch : [])
      setAllSchoolSlots(Array.isArray(allSlots) ? allSlots : [])
      setSavedTemplates(Array.isArray(tmpls) ? tmpls : [])
    }).finally(() => setLoading(false))
    loadHealth()
  }, [schoolId, loadHealth])

  const selectClass = useCallback(async (cls: ClassRow) => {
    setSelected(cls); setTtLoading(true)
    setEditSlot(null); setSelectedSlot(null); setSwapMsg(null)
    setRegenMsg(null); setCirculateMsg(null); setEditMode(false); setConflictCount(0); setHasChanges(false)
    const data = await fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}`).then(r => r.json())
    const slots: TimetableSlot[] = Array.isArray(data) ? data : []
    setTimetable(slots)
    setConflictCount(slots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
    // Build busy map from cached school slots (no extra API call)
    const bm: Record<number, Record<string, Set<number>>> = {}
    for (const s of allSchoolSlots) {
      if (s.class_id === cls.id || !s.teacher_id || s.is_break) continue
      if (!bm[s.teacher_id]) bm[s.teacher_id] = {}
      if (!bm[s.teacher_id][s.day_of_week]) bm[s.teacher_id][s.day_of_week] = new Set()
      bm[s.teacher_id][s.day_of_week].add(Math.round(Number(s.period_number)))
    }
    setBusyMap(bm)
    setTtLoading(false)
  }, [schoolId, allSchoolSlots])

  // ── Fetch busy teachers when assign-teacher modal opens ────────────────────
  useEffect(() => {
    if (!editSlot || !selected) { setBusyTeachers({}); return }
    setLoadingAvail(true); setConflictError(null)
    setSelTeacherId(editSlot.teacher_id ?? null)
    setApplyToAll(true)
    const pNum = Math.round(Number(editSlot.period_number))
    fetch(`/api/class-timetable?school_id=${schoolId}&day_of_week=${encodeURIComponent(editSlot.day_of_week)}&period_number=${pNum}`)
      .then(r => r.json())
      .then((rows: (TimetableSlot & { class_id?: number })[]) => {
        if (!Array.isArray(rows)) return
        const busy: Record<number, BusyInfo> = {}
        for (const row of rows) {
          if (row.teacher_id && row.class_id !== selected.id)
            busy[row.teacher_id] = { grade: row.grade ?? '', section: row.section ?? '', subject_name: row.subject_name ?? null }
        }
        setBusyTeachers(busy)
      })
      .catch(() => setBusyTeachers({}))
      .finally(() => setLoadingAvail(false))
  }, [editSlot, selected, schoolId])

  // ── Assign / change teacher ────────────────────────────────────────────────
  async function saveEditSlot(teacherId: number | null, applyAll: boolean) {
    if (!editSlot || !selected) return
    if (teacherId && busyTeachers[teacherId]) {
      const b = busyTeachers[teacherId]
      setConflictError(`${teachers.find(t => t.id === teacherId)?.name} is teaching ${b.subject_name || 'another subject'} in Grade ${b.grade}-${b.section} at this time.`)
      return
    }
    setConflictError(null); setSaving(true)
    const pNum = Math.round(Number(editSlot.period_number))
    const teacherName = teachers.find(t => t.id === teacherId)?.name ?? null
    if (applyAll && editSlot.subject_name) {
      await fetch('/api/class-timetable', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: selected.id, school_id: schoolId, teacher_id: teacherId, apply_to_subject: true, subject_name: editSlot.subject_name }),
      })
    } else {
      await fetch('/api/class-timetable', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: selected.id, school_id: schoolId, day_of_week: editSlot.day_of_week, period_number: pNum, teacher_id: teacherId }),
      })
    }
    // Re-fetch timetable to get fresh has_conflict flags after teacher change
    const freshData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}`).then(r => r.json())
    const freshSlots: TimetableSlot[] = Array.isArray(freshData) ? freshData : []
    setTimetable(freshSlots)
    setConflictCount(freshSlots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
    setSaving(false); setEditSlot(null); setHasChanges(true)
    // Refresh cached school slots + health
    refreshAllSlots(); loadHealth()
  }

  // ── 2-click swap: instant conflict check using pre-loaded busy map ────────
  function isSwapBlocked(slotA: TimetableSlot, slotB: TimetableSlot): string | null {
    if (slotA.teacher_id) {
      const pB = Math.round(Number(slotB.period_number))
      if (busyMap[slotA.teacher_id]?.[slotB.day_of_week]?.has(pB))
        return `${slotA.teacher_name ?? 'Teacher'} is busy at ${slotB.day_of_week} P${pB} (another class)`
    }
    if (slotB.teacher_id) {
      const pA = Math.round(Number(slotA.period_number))
      if (busyMap[slotB.teacher_id]?.[slotA.day_of_week]?.has(pA))
        return `${slotB.teacher_name ?? 'Teacher'} is busy at ${slotA.day_of_week} P${pA} (another class)`
    }
    return null
  }

  function doSwap(slotA: TimetableSlot, slotB: TimetableSlot) {
    if (!selected) return
    const pA = Math.round(Number(slotA.period_number))
    const pB = Math.round(Number(slotB.period_number))
    // Optimistic update — show result immediately
    setTimetable(prev => prev.map(s => {
      const aMatch = s.day_of_week === slotA.day_of_week && Math.round(Number(s.period_number)) === pA
      const bMatch = s.day_of_week === slotB.day_of_week && Math.round(Number(s.period_number)) === pB
      if (aMatch) return { ...s, subject_name: slotB.subject_name, teacher_name: slotB.teacher_name, teacher_id: slotB.teacher_id, room: slotB.room }
      if (bMatch) return { ...s, subject_name: slotA.subject_name, teacher_name: slotA.teacher_name, teacher_id: slotA.teacher_id, room: slotA.room }
      return s
    }))
    setSelectedSlot(null); setHasChanges(true)
    setSwapMsg({ text: 'Periods swapped', ok: true })
    setTimeout(() => setSwapMsg(null), 3000)
    // Fire-and-forget save; revert on failure, refresh health on success
    fetch('/api/class-timetable/swap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, class_id: selected.id,
        slot_a: { day: slotA.day_of_week, period_number: pA },
        slot_b: { day: slotB.day_of_week, period_number: pB },
      }),
    }).then(async res => {
      if (!res.ok) {
        const d = await res.json()
        setTimetable(prev => prev.map(s => {
          const aMatch = s.day_of_week === slotA.day_of_week && Math.round(Number(s.period_number)) === pA
          const bMatch = s.day_of_week === slotB.day_of_week && Math.round(Number(s.period_number)) === pB
          if (aMatch) return { ...s, subject_name: slotA.subject_name, teacher_name: slotA.teacher_name, teacher_id: slotA.teacher_id, room: slotA.room }
          if (bMatch) return { ...s, subject_name: slotB.subject_name, teacher_name: slotB.teacher_name, teacher_id: slotB.teacher_id, room: slotB.room }
          return s
        }))
        setSwapMsg({ text: d.error ?? 'Swap failed — reverted', ok: false })
      } else {
        // Refresh health glimpse after successful save
        loadHealth()
      }
    }).catch(() => {
      setTimetable(prev => prev.map(s => {
        const aMatch = s.day_of_week === slotA.day_of_week && Math.round(Number(s.period_number)) === pA
        const bMatch = s.day_of_week === slotB.day_of_week && Math.round(Number(s.period_number)) === pB
        if (aMatch) return { ...s, subject_name: slotA.subject_name, teacher_name: slotA.teacher_name, teacher_id: slotA.teacher_id, room: slotA.room }
        if (bMatch) return { ...s, subject_name: slotB.subject_name, teacher_name: slotB.teacher_name, teacher_id: slotB.teacher_id, room: slotB.room }
        return s
      }))
      setSwapMsg({ text: 'Network error — swap reverted', ok: false })
    })
  }

  function handleCellClick(slot: TimetableSlot) {
    if (slot.is_break) return
    if (!editMode) { setEditSlot(slot); return }
    if (!selectedSlot) { setSelectedSlot(slot); return }
    // Clicking the already-selected slot: deselect
    if (selectedSlot.day_of_week === slot.day_of_week &&
        Math.round(Number(selectedSlot.period_number)) === Math.round(Number(slot.period_number))) {
      setSelectedSlot(null); return
    }
    // Second click on a different slot: check and swap
    const blocked = isSwapBlocked(selectedSlot, slot)
    if (blocked) {
      setSwapMsg({ text: `Cannot swap: ${blocked}`, ok: false })
      setSelectedSlot(null)
      setTimeout(() => setSwapMsg(null), 4000)
      return
    }
    doSwap(selectedSlot, slot)
  }

  // Escape to cancel selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedSlot(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Regenerate timetable ──────────────────────────────────────────────────
  async function regenerate() {
    if (!selected) return
    setRegenerating(true); setRegenMsg(null)
    try {
      // Pass selected template's settings if not using school default
      const templateSettings = selectedTemplateId !== 'default'
        ? savedTemplates.find(t => t.id === selectedTemplateId)?.settings
        : undefined
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId, class_id: selected.id, force_replace: true,
          ...(templateSettings ? { schedule_settings: templateSettings } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRegenMsg({ text: data.error || 'Regeneration failed', ok: false })
      } else {
        setRegenMsg({ text: `Timetable regenerated — ${data.slots} slots`, ok: true })
        const ttData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}`).then(r => r.json())
        const slots: TimetableSlot[] = Array.isArray(ttData) ? ttData : []
        setTimetable(slots)
        setConflictCount(0)
        setClasses(prev => prev.map(c => c.id === selected.id ? { ...c, timetable_generated_at: new Date().toISOString() } : c))
        setHasChanges(true)
        refreshAllSlots(); loadHealth()
        setTimeout(() => setRegenMsg(null), 4000)
      }
    } finally { setRegenerating(false) }
  }

  // ── Circulate timetable ───────────────────────────────────────────────────
  async function circulate() {
    if (!selected) return
    setCirculating(true); setCirculateMsg(null)
    try {
      const res = await fetch('/api/class-timetable/circulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCirculateMsg({ text: data.error || 'Circulation failed', ok: false })
      } else {
        const circulatedAt = data.circulated_at ?? new Date().toISOString()
        setCirculateMsg({ text: `Timetable is now LIVE — ${data.staff_notified} staff and all students notified`, ok: true })
        setEditMode(false); setHasChanges(false)
        // Stamp circulation time locally so LIVE badge appears immediately
        setClasses(prev => prev.map(c => c.id === selected.id
          ? { ...c, timetable_circulated_at: circulatedAt }
          : c
        ))
        setSelected(prev => prev ? { ...prev, timetable_circulated_at: circulatedAt } : prev)
        loadHealth()
        setTimeout(() => setCirculateMsg(null), 6000)
      }
    } finally { setCirculating(false) }
  }

  // Group by grade
  const byGrade: Record<string, ClassRow[]> = {}
  for (const c of classes) {
    if (!byGrade[c.grade]) byGrade[c.grade] = []
    byGrade[c.grade].push(c)
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading...</div>

  return (
    <div className="flex gap-5">
      {/* Class sidebar */}
      <div className="w-60 flex-shrink-0 space-y-2">
        {classes.length === 0
          ? <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-4 py-8 text-center">No classes yet</p>
          : Object.entries(byGrade).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([grade, gradeClasses]) => (
            <div key={grade} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade {grade}</span>
              </div>
              {gradeClasses.map(c => {
                const h = healthMap[c.id]
                // Derive overall status
                const hasConflict   = h && h.conflict_count > 0
                const hasUnassigned = h && (h.no_teacher_count > 0 || h.subjects_unassigned > 0)
                const noTimetable   = h ? !h.timetable_exists : !c.timetable_generated_at
                const allGood       = h && h.timetable_exists && !hasConflict && !hasUnassigned
                const isLive        = !!c.timetable_circulated_at

                const statusDot = hasConflict   ? 'bg-red-500'
                                : noTimetable   ? 'bg-gray-300'
                                : hasUnassigned ? 'bg-amber-400'
                                : isLive        ? 'bg-emerald-500'
                                : allGood       ? 'bg-emerald-400'
                                : 'bg-gray-300'

                return (
                  <button key={c.id} onClick={() => selectClass(c)}
                    className={`w-full text-left px-3 py-3 border-b border-gray-50 last:border-b-0 transition-colors ${
                      selected?.id === c.id
                        ? 'bg-blue-50 border-l-[3px] border-l-blue-500'
                        : hasConflict ? 'hover:bg-red-50' : 'hover:bg-gray-50'
                    }`}>
                    {/* Row 1: section name + LIVE badge + status dot */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className={`text-sm font-semibold truncate ${selected?.id === c.id ? 'text-blue-700' : 'text-gray-800'}`}>
                          Section {c.section}
                        </p>
                        {isLive && (
                          <span className="flex-shrink-0 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full tracking-wide">LIVE</span>
                        )}
                      </div>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ml-1 ${statusDot}`} />
                    </div>
                    {/* Row 2: health glimpse points */}
                    {!h ? (
                      <p className="text-[10px] text-gray-300">Loading...</p>
                    ) : noTimetable ? (
                      <p className="text-[10px] text-gray-400 font-medium">No timetable generated</p>
                    ) : (
                      <div className="space-y-0.5">
                        {hasConflict && (
                          <p className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                            <span>⚠</span> {h.conflict_count} teacher conflict{h.conflict_count > 1 ? 's' : ''}
                          </p>
                        )}
                        {h.no_teacher_count > 0 && (
                          <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                            <span>·</span> {h.no_teacher_count} slot{h.no_teacher_count > 1 ? 's' : ''} no teacher
                          </p>
                        )}
                        {h.subjects_unassigned > 0 && (
                          <p className="text-[10px] text-orange-500 font-medium flex items-center gap-1">
                            <span>·</span> {h.subjects_unassigned} subject{h.subjects_unassigned > 1 ? 's' : ''} unassigned
                          </p>
                        )}
                        {isLive && !hasConflict && !hasUnassigned && (
                          <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                            <span>●</span> Live &amp; circulated
                          </p>
                        )}
                        {!isLive && allGood && (
                          <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                            <span>✓</span> Ready to circulate
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))
        }
      </div>

      {/* Timetable grid */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
            <p className="text-gray-400 text-sm">Select a class to view its timetable</p>
          </div>
        ) : ttLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* ── Header ── */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800">Grade {selected.grade} – Section {selected.section}</h3>
                  {selected.timetable_circulated_at && !hasChanges && (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full tracking-wide">● LIVE</span>
                  )}
                  {selected.timetable_circulated_at && hasChanges && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full tracking-wide">Changes pending</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {timetable.filter(s => !s.is_break && s.subject_name).length} of {activeAcademicSlots.length * DAYS.length} slots filled
                  {conflictCount > 0 && <span className="ml-2 text-red-500 font-medium">· {conflictCount} conflict(s)</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Template selector — switches grid preview + generation settings live */}
                {savedTemplates.length > 0 && (
                  <select
                    value={String(selectedTemplateId)}
                    onChange={e => {
                      const val = e.target.value
                      if (val === 'default') {
                        setSelectedTemplateId('default')
                        setActiveSchedule(schedule)
                        setActiveAcademicSlots(academicSlots)
                      } else {
                        const tmpl = savedTemplates.find(t => t.id === Number(val))
                        setSelectedTemplateId(Number(val))
                        if (tmpl) {
                          const built = buildScheduleFromSettings(tmpl.settings)
                          setActiveSchedule(built)
                          setActiveAcademicSlots(built.filter(s => !s.is_break))
                        }
                      }
                    }}
                    className="border border-blue-200 rounded-lg px-2 py-1.5 text-xs text-blue-700 bg-blue-50 font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[160px]"
                    title="Select schedule template — grid updates instantly">
                    <option value="default">School Default</option>
                    {savedTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
                <button onClick={regenerate} disabled={regenerating || editMode}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                  {regenerating ? 'Regenerating...' : 'Regenerate'}
                </button>
                {!editMode ? (
                  <>
                    <button onClick={() => { setEditMode(true); setSwapMsg(null); setCirculateMsg(null) }}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors">
                      ✏ Edit Timetable
                    </button>
                    {/* Circulate always visible when timetable exists — highlighted when changes pending */}
                    {timetable.length > 0 && (
                      <button onClick={circulate} disabled={circulating || conflictCount > 0}
                        title={conflictCount > 0 ? 'Resolve all conflicts before circulating' : 'Publish timetable to staff and students'}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                          hasChanges
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-300'
                            : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                        }`}>
                        {circulating ? 'Circulating...' : selected.timetable_circulated_at && !hasChanges ? '✓ Circulated' : 'Circulate'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditMode(false); setSwapMsg(null) }}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                      Done Editing
                    </button>
                    <button onClick={circulate} disabled={circulating || conflictCount > 0}
                      title={conflictCount > 0 ? 'Resolve all conflicts before circulating' : ''}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors ring-2 ring-emerald-300">
                      {circulating ? 'Circulating...' : 'Circulate'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Edit mode banner ── */}
            {editMode && (
              <div className="mx-4 mt-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 flex items-center gap-2">
                <span className="font-semibold">Edit Mode ON</span>
                <span>— <strong>Click a period to select it</strong>, then click another to swap · Click a selected period again to deselect · Press <kbd className="bg-orange-100 px-1 rounded">Esc</kbd> to exit · Hit <strong>Circulate</strong> to publish when done.</span>
              </div>
            )}
            {!editMode && timetable.length > 0 && (
              <div className="mx-4 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                Click any period to change the teacher. Enable <strong>Edit Timetable</strong> to swap periods.
              </div>
            )}

            {/* ── Status messages ── */}
            {swapMsg && (
              <div className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs border ${swapMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {swapMsg.text}
              </div>
            )}
            {regenMsg && (
              <div className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs border ${regenMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {regenMsg.text}
              </div>
            )}
            {circulateMsg && (
              <div className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs border font-medium ${circulateMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {circulateMsg.ok ? '✓ ' : '✗ '}{circulateMsg.text}
              </div>
            )}
            {/* ── Timetable grid ── */}
            {timetable.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">No timetable generated yet</div>
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-24 border-r border-slate-700 sticky left-0 z-10">Period</th>
                      {DAYS.map(d => (
                        <th key={d} className={`px-2 py-2.5 text-center font-semibold border-r border-slate-700 last:border-r-0 min-w-[100px] ${
                          d === today ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'
                        }`}>{d.slice(0, 3)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSchedule.map(s => {
                      if (s.is_break) {
                        return (
                          <tr key={s.slot} className="bg-amber-50 border-y border-amber-100">
                            <td className="px-3 py-1 border-r border-amber-100 sticky left-0 bg-amber-50 z-10">
                              <span className="font-semibold text-amber-600 text-[11px]">{s.break_label}</span>
                              <span className="block text-amber-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                            </td>
                            <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-1 text-[11px]">{s.break_label}</td>
                          </tr>
                        )
                      }
                      return (
                        <tr key={s.slot} className="border-b border-gray-100 hover:bg-gray-50/30">
                          <td className="px-3 py-1 bg-gray-50 border-r border-gray-100 sticky left-0 z-10">
                            <span className="font-semibold text-gray-600 text-[11px]">{s.short}</span>
                            <span className="block text-gray-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                          </td>
                          {DAYS.map(day => {
                            const slot = timetable.find(t => t.day_of_week === day && Math.round(Number(t.period_number)) === s.slot && !t.is_break)
                            const isSelected = !!selectedSlot &&
                              selectedSlot.day_of_week === day &&
                              Math.round(Number(selectedSlot.period_number)) === s.slot
                            // When a slot is selected: show whether this slot is a free or blocked target
                            const isBlockedTarget = !!selectedSlot && !isSelected && slot && !slot.is_break &&
                              !!isSwapBlocked(selectedSlot, slot)
                            const isFreeTarget = !!selectedSlot && !isSelected && slot && !slot.is_break &&
                              !isSwapBlocked(selectedSlot, slot)
                            return (
                              <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                                {slot ? (
                                  <button
                                    onClick={() => handleCellClick(slot)}
                                    title={isBlockedTarget && selectedSlot ? isSwapBlocked(selectedSlot, slot) ?? undefined : undefined}
                                    className={`w-full text-left rounded-lg px-2 py-1.5 min-h-[52px] transition-all select-none cursor-pointer ${
                                      isSelected
                                        ? 'ring-2 ring-yellow-400 bg-yellow-50 border border-yellow-300' :
                                      isBlockedTarget
                                        ? 'bg-red-50 border border-red-300 opacity-60 cursor-not-allowed' :
                                      isFreeTarget
                                        ? 'ring-2 ring-emerald-400 bg-emerald-50 border border-emerald-200' :
                                      (slot as TimetableSlot & { has_conflict?: boolean }).has_conflict
                                        ? 'bg-red-100 border border-red-400 hover:bg-red-200' :
                                      slot.teacher_name
                                        ? 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                                        : 'bg-red-50 border border-red-200 hover:bg-red-100'
                                    }`}>
                                    <p className="font-semibold text-gray-800 leading-tight text-[11px]">{slot.subject_name}</p>
                                    {slot.teacher_name
                                      ? <p className="text-gray-500 text-[10px] mt-0.5 truncate">{slot.teacher_name}</p>
                                      : <p className="text-red-400 text-[10px] mt-0.5 font-medium">+ Assign</p>}
                                    {(slot as TimetableSlot & { has_conflict?: boolean }).has_conflict &&
                                      <p className="text-red-500 text-[9px] mt-0.5 font-bold">⚠ Conflict</p>}
                                    {isSelected && <p className="text-yellow-600 text-[9px] mt-0.5 font-semibold">● Selected</p>}
                                    {isFreeTarget && <p className="text-emerald-500 text-[9px] mt-0.5 font-semibold">↔ Click to swap</p>}
                                  </button>
                                ) : (
                                  <div className="rounded-lg px-2 py-1.5 border border-dashed border-gray-200 bg-gray-50 min-h-[52px] flex items-center justify-center">
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
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-200 border border-emerald-300 rounded inline-block" />Has teacher</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-100 border border-red-200 rounded inline-block" />No teacher</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-200 border border-red-400 rounded inline-block" />Conflict</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-100 border border-yellow-300 rounded inline-block" />Selected</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-50 border border-emerald-400 rounded inline-block" />Swap target</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-50 border border-amber-100 rounded inline-block" />Break</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Assign Teacher modal (click on period) ── */}
      {editSlot && (() => {
        const subj = editSlot.subject_name ?? ''
        const matchFn = (t: Teacher) => {
          if (!subj) return false
          const sn = subj.toLowerCase(); const ts = (t.subject || '').toLowerCase()
          return sn === ts || ts.includes(sn) || sn.includes(ts)
        }
        const availMatch  = teachers.filter(t => !busyTeachers[t.id] && matchFn(t))
        const availOther  = teachers.filter(t => !busyTeachers[t.id] && !matchFn(t))
        const busyList    = teachers.filter(t => !!busyTeachers[t.id])

        const TRow = ({ t, isBusy }: { t: Teacher; isBusy: boolean }) => {
          const busy = busyTeachers[t.id]; const isSel = selTeacherId === t.id
          return (
            <button disabled={isBusy} onClick={() => !isBusy && setSelTeacherId(t.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                isBusy ? 'opacity-40 cursor-not-allowed' : isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-800'
              }`}>
              <span>
                <span className="font-medium">{t.name}</span>
                {t.subject && <span className={`ml-1.5 text-[11px] ${isSel ? 'text-blue-200' : 'text-gray-400'}`}>· {t.subject}</span>}
              </span>
              {isBusy && busy && <span className="text-[10px] text-red-500 font-medium ml-2 flex-shrink-0">Gr {busy.grade}-{busy.section}</span>}
            </button>
          )
        }

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditSlot(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900">{editSlot.teacher_id ? 'Change Teacher' : 'Assign Teacher'}</h3>
                <button onClick={() => setEditSlot(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{editSlot.day_of_week}</span>
                <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {activeSchedule.find(s => s.slot === Math.round(Number(editSlot.period_number)))?.label}
                </span>
                {subj && <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{subj}</span>}
                {editSlot.teacher_name && <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Current: {editSlot.teacher_name}</span>}
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                {loadingAvail ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-gray-400 text-sm">
                    <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />Checking...
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                    <button onClick={() => setSelTeacherId(null)}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${selTeacherId === null ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-50 italic'}`}>
                      — No teacher —
                    </button>
                    {availMatch.length > 0 && (<><div className="px-3 py-1 bg-emerald-50 text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Available · {subj || 'Subject'}</div>{availMatch.map(t => <TRow key={t.id} t={t} isBusy={false} />)}</>)}
                    {availOther.length > 0 && (<><div className="px-3 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Available · Other</div>{availOther.map(t => <TRow key={t.id} t={t} isBusy={false} />)}</>)}
                    {busyList.length > 0 && (<><div className="px-3 py-1 bg-red-50 text-[10px] font-semibold text-red-400 uppercase tracking-wide">Busy at this slot</div>{busyList.map(t => <TRow key={t.id} t={t} isBusy />)}</>)}
                  </div>
                )}
              </div>

              {conflictError && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{conflictError}</div>}
              {subj && (
                <label className="flex items-start gap-2 mb-4 cursor-pointer select-none">
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="mt-0.5 accent-blue-600" />
                  <span className="text-xs text-gray-600">
                    <span className="font-semibold">Apply to all {subj} periods in this class</span>
                    <span className="block text-gray-400 text-[10px] mt-0.5">Replaces teacher for every {subj} slot</span>
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <button onClick={() => setEditSlot(null)} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
                <button disabled={saving} onClick={() => saveEditSlot(selTeacherId, applyToAll)}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : editSlot.teacher_id ? 'Change' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ─── Teacher Schedules Tab ────────────────────────────────────────────────────
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
    fetch(`/api/teachers?school_id=${schoolId}`)
      .then(r => r.json())
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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      <div className="w-52 flex-shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teachers..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0
            ? <p className="text-sm text-gray-400 px-4 py-6 text-center">No teachers</p>
            : (
              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {filtered.map(t => (
                  <button key={t.id} onClick={() => selectTeacher(t)}
                    className={`w-full text-left px-4 py-3 transition-colors ${selected?.id === t.id ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'}`}>
                    <p className="text-sm font-medium text-gray-800">{t.name}</p>
                    {t.subject && <p className="text-xs text-gray-400 mt-0.5">{t.subject}</p>}
                  </button>
                ))}
              </div>
            )
          }
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-4">
        {!selected ? (
          <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
            <p className="text-gray-400 text-sm">Select a teacher to view their schedule</p>
          </div>
        ) : ttLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-gray-800">{selected.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selected.subject || 'No subject'} · {timetable.filter(s => !s.is_break && s.subject).length} periods/week
                  {unavail.length > 0 && ` · ${unavail.length} unavailable slot(s)`}
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
                          <th key={d} className="px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 font-semibold text-center min-w-[70px]">{d.slice(0, 3)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {academicSlots.map(s => (
                        <tr key={s.slot}>
                          <td className="px-3 py-1.5 border border-gray-100 bg-gray-50 whitespace-nowrap">
                            <span className="font-semibold text-gray-600">{s.short}</span>
                            <span className="block text-gray-400 text-[10px]">{s.time_from}</span>
                          </td>
                          {DAYS.map(day => {
                            const key = `${day}-${s.slot}`
                            const isBlocked = unavail.some(u => u.day_of_week === day && u.period_number === s.slot)
                            const hasClass  = timetable.some(t => t.day_of_week === day && Math.round(Number(t.period_number)) === s.slot)
                            return (
                              <td key={day} className="px-1 py-1 border border-gray-100 text-center">
                                <button onClick={() => toggleSlot(day, s.slot)} disabled={!!toggling}
                                  className={`w-full h-8 rounded-lg text-[10px] font-medium transition-colors ${
                                    isBlocked ? 'bg-red-500 text-white' :
                                    hasClass  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
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
                <p className="text-[10px] text-gray-400 mt-2">Red = blocked · Green = has class · Grey = free</p>
              </div>
            )}

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
                        if (s.is_break) return (
                          <tr key={s.slot} className="bg-amber-50 border-y border-amber-100">
                            <td className="px-3 py-1.5 border-r border-amber-100 sticky left-0 bg-amber-50 z-10">
                              <span className="font-semibold text-amber-600 text-[11px]">{s.break_label}</span>
                              <span className="block text-amber-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                            </td>
                            <td colSpan={DAYS.length} className="text-center text-amber-400 italic py-1.5 text-[11px]">{s.break_label}</td>
                          </tr>
                        )
                        return (
                          <tr key={s.slot} className="border-b border-gray-100">
                            <td className="px-3 py-1.5 bg-gray-50 border-r border-gray-100 sticky left-0 z-10">
                              <span className="font-semibold text-gray-600 text-[11px]">{s.short}</span>
                              <span className="block text-gray-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                            </td>
                            {DAYS.map(day => {
                              const slot    = byDay[day]?.find(t => Math.round(Number(t.period_number)) === s.slot)
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

// ─── Schedule Template Tab ────────────────────────────────────────────────────
// Admin configures start/end time, periods per day, break timings, and working
// days. A live preview grid updates instantly as settings change.
// Named templates can be saved and later selected when generating class timetables.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

type SavedTemplate = { id: number; name: string; settings: SchoolScheduleSettings; created_at: string }

function TemplateTab({
  schoolId,
  settings: savedSettings,
  onSaved,
}: {
  schoolId: number
  settings: SchoolScheduleSettings
  onSaved: (s: SchoolScheduleSettings) => void
}) {
  const [form, setForm]             = useState<SchoolScheduleSettings>(savedSettings)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState<{ text: string; ok: boolean } | null>(null)

  // Named templates
  const [templates, setTemplates]         = useState<SavedTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [saveAsName, setSaveAsName]       = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [showSaveAs, setShowSaveAs]       = useState(false)
  const [deletingId, setDeletingId]       = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/schedule-templates?school_id=${schoolId}`)
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setTemplatesLoading(false))
  }, [schoolId])

  async function saveAsTemplate() {
    if (!saveAsName.trim()) return
    setSavingTemplate(true)
    try {
      const res = await fetch('/api/schedule-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, name: saveAsName.trim(), settings: form }),
      })
      const data = await res.json()
      if (res.ok) {
        setTemplates(prev => {
          const filtered = prev.filter(t => t.id !== data.id)
          return [...filtered, data].sort((a, b) => a.created_at.localeCompare(b.created_at))
        })
        setSaveAsName(''); setShowSaveAs(false)
        setSaveMsg({ text: `Template "${data.name}" saved`, ok: true })
        setTimeout(() => setSaveMsg(null), 3000)
      }
    } finally { setSavingTemplate(false) }
  }

  async function deleteTemplate(id: number) {
    setDeletingId(id)
    try {
      await fetch(`/api/schedule-templates?id=${id}&school_id=${schoolId}`, { method: 'DELETE' })
      setTemplates(prev => prev.filter(t => t.id !== id))
    } finally { setDeletingId(null) }
  }

  function loadTemplate(t: SavedTemplate) {
    setForm(t.settings)
    setSaveMsg({ text: `Loaded template: "${t.name}". Modify and save to school, or regenerate class timetables.`, ok: true })
    setTimeout(() => setSaveMsg(null), 5000)
  }
  // Working days stored in localStorage per school
  const wdKey = `wdays_${schoolId}`
  const [workingDays, setWorkingDays] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [...DAYS]
    try {
      const stored = localStorage.getItem(wdKey)
      return stored ? JSON.parse(stored) : [...DAYS]
    } catch { return [...DAYS] }
  })

  // Keep form in sync if parent settings change (e.g. after initial DB load)
  useEffect(() => { setForm(savedSettings) }, [savedSettings])

  const preview = buildScheduleFromSettings(form)

  function set<K extends keyof SchoolScheduleSettings>(k: K, v: SchoolScheduleSettings[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function toggleDay(day: string) {
    setWorkingDays(prev => {
      const next = prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
      // Preserve weekday order
      const ordered = ALL_DAYS.filter(d => next.includes(d))
      localStorage.setItem(wdKey, JSON.stringify(ordered))
      return ordered
    })
  }

  function addPeriod() {
    if (form.periods_per_day >= 12) return
    set('periods_per_day', form.periods_per_day + 1)
  }
  function removePeriod() {
    if (form.periods_per_day <= 1) return
    const newCount = form.periods_per_day - 1
    setForm(prev => ({
      ...prev,
      periods_per_day: newCount,
      morning_break_after_period: Math.min(prev.morning_break_after_period, newCount),
      lunch_after_period: Math.min(prev.lunch_after_period, newCount),
      afternoon_break_after_period: Math.min(prev.afternoon_break_after_period, newCount),
    }))
  }
  function addDay() {
    const next = ALL_DAYS.find(d => !workingDays.includes(d))
    if (!next) return
    const ordered = ALL_DAYS.filter(d => workingDays.includes(d) || d === next)
    localStorage.setItem(wdKey, JSON.stringify(ordered))
    setWorkingDays(ordered)
  }
  function removeDay(day: string) {
    if (workingDays.length <= 1) return
    const next = workingDays.filter(d => d !== day)
    localStorage.setItem(wdKey, JSON.stringify(next))
    setWorkingDays(next)
  }

  async function save() {
    setSaving(true); setSaveMsg(null)
    try {
      const res = await fetch('/api/school-schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveMsg({ text: data.error ?? 'Save failed', ok: false })
      } else {
        onSaved(form)
        setSaveMsg({ text: 'Schedule template saved. Re-generate class timetables to apply.', ok: true })
        setTimeout(() => setSaveMsg(null), 6000)
      }
    } finally { setSaving(false) }
  }

  const periodDuration = Math.max(30, Math.floor(
    ((() => {
      const [h1, m1] = form.end_time.split(':').map(Number)
      const [h2, m2] = form.start_time.split(':').map(Number)
      return (h1 * 60 + m1) - (h2 * 60 + m2)
    })() - form.morning_break_duration - form.lunch_duration - form.afternoon_break_duration) / form.periods_per_day
  ))

  return (
    <div className="flex gap-5">
      {/* ── Saved templates sidebar ── */}
      <div className="w-52 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Templates</p>
            <button onClick={() => { setSaveAsName(''); setShowSaveAs(true) }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Save as</button>
          </div>

          {/* Save-as modal */}
          {showSaveAs && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4">
                <h3 className="text-sm font-bold text-gray-800 mb-1">Save as Template</h3>
                <p className="text-xs text-gray-500 mb-4">Current settings will be saved under this name.</p>
                <input
                  autoFocus
                  value={saveAsName} onChange={e => setSaveAsName(e.target.value)}
                  placeholder="e.g. Full Day, Half Day, Lower Classes…"
                  onKeyDown={e => { if (e.key === 'Enter') saveAsTemplate(); if (e.key === 'Escape') setShowSaveAs(false) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSaveAs(false)}
                    className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveAsTemplate} disabled={savingTemplate || !saveAsName.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    {savingTemplate ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {templatesLoading ? (
            <p className="text-xs text-gray-400 px-4 py-4 text-center">Loading...</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-5 text-center leading-relaxed">
              No templates yet.<br />Configure settings and click <strong>+ Save as</strong> to create one.
            </p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 group">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{t.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {t.settings.periods_per_day}p · {t.settings.start_time}–{t.settings.end_time}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => loadTemplate(t)}
                      title="Load this template into the editor"
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50">
                      Load
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} disabled={deletingId === t.id}
                      title="Delete template"
                      className="text-[10px] text-red-400 hover:text-red-600 px-1 py-0.5 rounded hover:bg-red-50 disabled:opacity-40">
                      {deletingId === t.id ? '...' : '×'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 px-1 leading-relaxed">
          Templates let you save different schedule layouts (e.g. Full Day, Half Day) and select one when generating each class timetable.
        </p>
      </div>

      {/* ── Settings panel ── */}
      <div className="w-72 flex-shrink-0 space-y-4">

        {/* Working days */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Working Days</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_DAYS.map(d => (
              <button key={d} onClick={() => toggleDay(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  workingDays.includes(d)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">{workingDays.length} working day{workingDays.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Timing */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">School Timing</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-gray-500">Start Time</span>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </label>
            <label className="block">
              <span className="text-[11px] text-gray-500">End Time</span>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </label>
          </div>
          <div>
            <span className="text-[11px] text-gray-500">Periods per Day</span>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={removePeriod} disabled={form.periods_per_day <= 1}
                className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 text-base font-bold">−</button>
              <span className="text-sm font-semibold text-gray-800 w-6 text-center">{form.periods_per_day}</span>
              <button onClick={addPeriod} disabled={form.periods_per_day >= 12}
                className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 text-base font-bold">+</button>
              <span className="text-[10px] text-gray-400 ml-1">≈ {periodDuration} min each</span>
            </div>
          </div>
        </div>

        {/* Breaks */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Breaks</p>
          {[
            { label: 'Morning Break', afterKey: 'morning_break_after_period' as const, durKey: 'morning_break_duration' as const },
            { label: 'Lunch Break',   afterKey: 'lunch_after_period' as const,         durKey: 'lunch_duration' as const },
            { label: 'Afternoon Break', afterKey: 'afternoon_break_after_period' as const, durKey: 'afternoon_break_duration' as const },
          ].map(b => (
            <div key={b.label} className="border border-gray-100 rounded-lg p-3 space-y-2">
              <p className="text-[11px] font-semibold text-gray-600">{b.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="text-[10px] text-gray-400">After period</span>
                  <input type="number" min={1} max={form.periods_per_day}
                    value={form[b.afterKey]}
                    onChange={e => set(b.afterKey, Math.min(form.periods_per_day, Math.max(1, Number(e.target.value))))}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </label>
                <label>
                  <span className="text-[10px] text-gray-400">Duration (min)</span>
                  <input type="number" min={5} max={120}
                    value={form[b.durKey]}
                    onChange={e => set(b.durKey, Math.max(5, Number(e.target.value)))}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Save */}
        {saveMsg && (
          <div className={`px-3 py-2 rounded-lg text-xs border ${saveMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {saveMsg.text}
          </div>
        )}
        <button onClick={save} disabled={saving}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save Template'}
        </button>
        <p className="text-[10px] text-gray-400 text-center">Saves as the school&apos;s default schedule. Or use <strong>+ Save as</strong> to create a named template.</p>
      </div>

      {/* ── Live preview grid ── */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Schedule Preview</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {form.periods_per_day} periods · {workingDays.length} days ·{' '}
              {periodDuration} min/period
            </p>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-28 border-r border-slate-700 sticky left-0 z-10">Slot</th>
                  {workingDays.map(d => (
                    <th key={d} className="bg-slate-800 text-slate-300 px-3 py-2.5 text-center font-semibold border-r border-slate-700 min-w-[80px] relative group">
                      <span>{d.slice(0, 3)}</span>
                      {workingDays.length > 1 && (
                        <button onClick={() => removeDay(d)}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 text-[10px] w-4 h-4 flex items-center justify-center">
                          ×
                        </button>
                      )}
                    </th>
                  ))}
                  {/* + Column button */}
                  {workingDays.length < 7 && (
                    <th className="bg-slate-700 px-2 py-2.5 text-center">
                      <button onClick={addDay}
                        className="text-slate-300 hover:text-white text-base font-bold w-6 h-6 rounded flex items-center justify-center hover:bg-slate-600 mx-auto"
                        title="Add working day">+</button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.map(s => {
                  if (s.is_break) {
                    return (
                      <tr key={s.slot} className="bg-amber-50 border-y border-amber-100">
                        <td className="px-3 py-1.5 border-r border-amber-100 sticky left-0 bg-amber-50 z-10">
                          <span className="font-semibold text-amber-600 text-[11px]">{s.break_label}</span>
                          <span className="block text-amber-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                        </td>
                        <td colSpan={workingDays.length + (workingDays.length < 7 ? 1 : 0)}
                          className="text-center text-amber-400 italic py-1 text-[11px]">{s.break_label}</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={s.slot} className="border-b border-gray-100 hover:bg-gray-50/30">
                      <td className="px-3 py-2 bg-gray-50 border-r border-gray-100 sticky left-0 z-10">
                        <span className="font-semibold text-gray-600 text-[11px]">{s.short}</span>
                        <span className="block text-gray-400 text-[10px]">{s.time_from}–{s.time_to}</span>
                      </td>
                      {workingDays.map(d => (
                        <td key={d} className="px-2 py-2 border-r border-gray-100 text-center">
                          <div className="rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5 min-h-[36px] flex items-center justify-center">
                            <span className="text-[10px] text-blue-400">{s.label}</span>
                          </div>
                        </td>
                      ))}
                      {workingDays.length < 7 && <td />}
                    </tr>
                  )
                })}
                {/* + Row button */}
                <tr className="border-t border-gray-100">
                  <td className="px-3 py-1.5 sticky left-0 bg-white z-10">
                    <button onClick={addPeriod} disabled={form.periods_per_day >= 12}
                      className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 disabled:opacity-30 font-medium"
                      title="Add period">
                      <span className="w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center text-blue-500 font-bold text-sm">+</span>
                      Add period
                    </button>
                  </td>
                  <td colSpan={workingDays.length + (workingDays.length < 7 ? 1 : 0)} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
