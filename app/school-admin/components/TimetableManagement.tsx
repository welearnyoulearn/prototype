'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { SCHEDULE, DAYS, ACADEMIC_SLOTS, ScheduleSlot, buildScheduleFromSettings, DEFAULT_SCHEDULE_SETTINGS, SchoolScheduleSettings } from '@/lib/schedule'

function canTeachGrade(teachesGrades: string | null | undefined, grade: string): boolean {
  if (!teachesGrades || !teachesGrades.trim()) return true
  return teachesGrades.split(',').map(g => g.trim()).includes(grade.trim())
}

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
type Teacher = { id: number; name: string; subject: string; staff_type: string; teaches_grades?: string }
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
type TeacherLoadSubject = {
  subject_name: string; class_count: number; total_periods: number
  classes: string; parallel_risk: boolean
}
type TeacherLoad = {
  teacher_id: number; teacher_name: string
  total_periods: number; total_slots_available: number
  overloaded: boolean; risk: 'high' | 'medium' | 'low'
  subjects: TeacherLoadSubject[]
}
type LoadSummary = {
  total_teachers: number; high_risk: number; medium_risk: number; low_risk: number
  periods_per_day: number; days_per_week: number
}

function ClassesTab({ schoolId, schedule, academicSlots }: { schoolId: number; schedule: ScheduleSlot[]; academicSlots: ScheduleSlot[] }) {
  const [classes, setClasses]       = useState<ClassRow[]>([])
  const [healthMap, setHealthMap]   = useState<Record<number, ClassHealth>>({})
  const [teachers, setTeachers]     = useState<Teacher[]>([])
  const [selected, setSelected]     = useState<ClassRow | null>(null)
  const [timetable, setTimetable]   = useState<TimetableSlot[]>([])
  const [loading, setLoading]       = useState(true)
  const [ttLoading, setTtLoading]   = useState(false)

  // Teacher load analysis panel
  const [loadData, setLoadData]           = useState<{ teachers: TeacherLoad[]; summary: LoadSummary } | null>(null)
  const [loadAnalysing, setLoadAnalysing] = useState(false)
  const [showLoadPanel, setShowLoadPanel] = useState(false)

  async function runLoadAnalysis() {
    setLoadAnalysing(true); setShowLoadPanel(true)
    try {
      const data = await fetch(`/api/class-timetable/teacher-load?school_id=${schoolId}`).then(r => r.json())
      setLoadData(data)
    } finally { setLoadAnalysing(false) }
  }

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

  // Subject assignment info (for slot-no-teacher scenario)
  type SubjectAssignment = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null }
  const [subjectAssignment, setSubjectAssignment] = useState<SubjectAssignment | null>(null)
  // All class_subjects for the selected class — used to build the "this class teachers" list
  const [classSubjects, setClassSubjects]         = useState<SubjectAssignment[]>([])
  const [changingSubjTeacher, setChangingSubjTeacher] = useState(false)
  const [newPermTeacherId, setNewPermTeacherId]     = useState<number | null>(null)
  const [savingPermTeacher, setSavingPermTeacher]   = useState(false)

  // Add subject directly from a slot
  const [addSubjMode, setAddSubjMode]   = useState(false)
  const [newSubjName, setNewSubjName]   = useState('')
  const [newSubjPPW, setNewSubjPPW]     = useState(4)
  const [addingSubj, setAddingSubj]     = useState(false)
  const [addSubjErr, setAddSubjErr]     = useState<string | null>(null)

  // Swap suggestions (shown when all class teachers are busy)
  const [showSwapHints, setShowSwapHints] = useState(false)
  const [swapping, setSwapping]           = useState(false)

  // Regenerate + Circulate
  const [regenerating, setRegenerating]     = useState(false)
  const [regenMsg, setRegenMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  const [circulating, setCirculating]       = useState(false)
  const [circulateMsg, setCirculateMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  const [conflictCount, setConflictCount]   = useState(0)
  // Track unsaved changes made after last circulation (swap / teacher edit / regenerate)
  const [hasChanges, setHasChanges]         = useState(false)

  // Conflict resolution panel
  type ConflictGroup = {
    teacher_id: number; teacher_name: string
    day_of_week: string; period_number: number; time_from: string; time_to: string
    slots: { slot_id: number; class_id: number; grade: string; section: string; subject_name: string; is_manual: boolean }[]
    alternatives: { id: number; name: string; subject: string }[]
  }
  const [showConflictPanel, setShowConflictPanel]   = useState(false)
  const [conflicts, setConflicts]                   = useState<ConflictGroup[]>([])
  const [conflictsLoading, setConflictsLoading]     = useState(false)
  const [fixingSlot, setFixingSlot]                 = useState<number | null>(null)

  // Delete timetable
  const [deletingTt, setDeletingTt]             = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Custom timetable mode
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customTemplateId, setCustomTemplateId] = useState<number | 'default'>('default')
  const [creatingCustom, setCreatingCustom] = useState(false)

  // Ref for scrolling back to top on class selection
  const rightPanelRef = useRef<HTMLDivElement>(null)

  async function deleteTimetable() {
    if (!selected) return
    setDeletingTt(true); setShowDeleteConfirm(false)
    try {
      const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
      const res = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setTimetable([])
      setConflictCount(0)
      setConflicts([])
      setShowConflictPanel(false)
      setHasChanges(false)
      setClasses(prev => prev.map(c => c.id === selected.id
        ? { ...c, timetable_generated_at: null, timetable_circulated_at: null }
        : c
      ))
      setSelected(prev => prev ? { ...prev, timetable_generated_at: null, timetable_circulated_at: null } : prev)
      refreshAllSlots(); loadHealth()
    } finally { setDeletingTt(false) }
  }

  const loadConflicts = useCallback(async () => {
    setConflictsLoading(true)
    try {
      const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
      const data = await fetch(`/api/class-timetable/conflicts?school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
      setConflicts(Array.isArray(data) ? data : [])
    } catch { setConflicts([]) }
    finally { setConflictsLoading(false) }
  }, [schoolId, selectedTemplateId])

  async function fixConflict(slotId: number, newTeacherId: number | null) {
    setFixingSlot(slotId)
    try {
      const res = await fetch('/api/class-timetable/conflicts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId, new_teacher_id: newTeacherId, school_id: schoolId }),
      })
      if (res.ok) {
        await loadConflicts()
        // Reload current class timetable if it contains the fixed slot
        if (selected) {
          const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
          const ttData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
          const slots: TimetableSlot[] = Array.isArray(ttData) ? ttData : []
          setTimetable(slots)
          setConflictCount(slots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
        }
        refreshAllSlots(); loadHealth()
      }
    } finally { setFixingSlot(null) }
  }

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
    // Scroll to the top of the timetable panel on every class click
    setTimeout(() => {
      rightPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 50)
    // Reset to school default schedule when switching classes so the grid always
    // reflects the schedule the class was generated with (avoids stale template bleed)
    setSelectedTemplateId('default')
    setActiveSchedule(schedule)
    setActiveAcademicSlots(academicSlots)
    const [data, subjsData] = await Promise.all([
      fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}&template_id=default`).then(r => r.json()),
      fetch(`/api/classes/${cls.id}/subjects`).then(r => r.json()),
    ])
    const slots: TimetableSlot[] = Array.isArray(data) ? data : []
    setTimetable(slots)
    setConflictCount(slots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
    // Load class_subjects so swap-blocking can check assigned teacher availability
    setClassSubjects(Array.isArray(subjsData) ? subjsData : [])
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
  }, [schoolId, allSchoolSlots, schedule, academicSlots])

  // ── Fetch busy teachers + subject assignment when assign-teacher modal opens ──
  useEffect(() => {
    if (!editSlot || !selected) {
      setBusyTeachers({}); setSubjectAssignment(null); setChangingSubjTeacher(false)
      setAddSubjMode(false); setNewSubjName(''); setAddSubjErr(null)
      return
    }
    setLoadingAvail(true); setConflictError(null); setAddSubjMode(false)
    setAddSubjErr(null); setChangingSubjTeacher(false); setNewPermTeacherId(null)
    setShowSwapHints(false)
    setSelTeacherId(editSlot.teacher_id ?? null)
    setApplyToAll(true)
    const pNum = Math.round(Number(editSlot.period_number))

    const tmplParamModal = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
    Promise.all([
      fetch(`/api/class-timetable?school_id=${schoolId}&day_of_week=${encodeURIComponent(editSlot.day_of_week)}&period_number=${pNum}&template_id=${tmplParamModal}`).then(r => r.json()),
      fetch(`/api/classes/${selected.id}/subjects`).then(r => r.json()),
    ]).then(([slotsData, subjsData]) => {
      // Busy teachers (other classes at this slot)
      if (Array.isArray(slotsData)) {
        const busy: Record<number, BusyInfo> = {}
        for (const row of slotsData as (TimetableSlot & { class_id?: number })[]) {
          if (row.teacher_id && row.class_id !== selected.id)
            busy[row.teacher_id] = { grade: row.grade ?? '', section: row.section ?? '', subject_name: row.subject_name ?? null }
        }
        setBusyTeachers(busy)
      }
      // All class_subjects for this class
      const allSubjs: SubjectAssignment[] = Array.isArray(subjsData) ? subjsData : []
      setClassSubjects(allSubjs)
      // The specific subject assignment for THIS slot's subject
      if (editSlot.subject_name) {
        const match = allSubjs.find(s =>
          s.subject_name.toLowerCase() === (editSlot.subject_name ?? '').toLowerCase()
        )
        setSubjectAssignment(match ?? null)
      } else {
        setSubjectAssignment(null)
      }
    })
    .catch(() => { setBusyTeachers({}); setSubjectAssignment(null); setClassSubjects([]) })
    .finally(() => setLoadingAvail(false))
  }, [editSlot, selected, schoolId])

  // ── Swap two slots from within the modal ─────────────────────────────────
  async function doSwapFromModal(slotA: TimetableSlot, slotB: TimetableSlot) {
    if (!selected) return
    setSwapping(true)
    const pA = Math.round(Number(slotA.period_number))
    const pB = Math.round(Number(slotB.period_number))
    try {
      const tmplIdForBody = selectedTemplateId === 'default' ? null : selectedTemplateId
      const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
      const res = await fetch('/api/class-timetable/swap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId, class_id: selected.id, template_id: tmplIdForBody,
          slot_a: { day: slotA.day_of_week, period_number: pA },
          slot_b: { day: slotB.day_of_week, period_number: pB },
        }),
      })
      if (res.ok) {
        const freshData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
        const freshSlots: TimetableSlot[] = Array.isArray(freshData) ? freshData : []
        setTimetable(freshSlots)
        setConflictCount(freshSlots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
        setHasChanges(true); loadHealth(); refreshAllSlots()
        setEditSlot(null)
      }
    } finally { setSwapping(false) }
  }

  // ── Add a new subject directly to a slot ─────────────────────────────────
  async function addSubjectToSlot() {
    if (!editSlot || !selected || !newSubjName.trim()) return
    setAddingSubj(true); setAddSubjErr(null)
    try {
      // 1. Create/update the class_subjects entry (no teacher yet)
      const subjRes = await fetch(`/api/classes/${selected.id}/subjects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_name: newSubjName.trim(), periods_per_week: newSubjPPW, teacher_id: null }),
      })
      if (!subjRes.ok) {
        const e = await subjRes.json()
        setAddSubjErr(e.error ?? 'Failed to add subject')
        return
      }
      // 2. Set subject_name on this slot (uses PUT /api/class-timetable with id)
      await fetch('/api/class-timetable', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editSlot.id, subject_name: newSubjName.trim(), teacher_id: null }),
      })
      // Reload timetable
      const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
      const freshData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
      const freshSlots: TimetableSlot[] = Array.isArray(freshData) ? freshData : []
      setTimetable(freshSlots)
      setConflictCount(freshSlots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
      setHasChanges(true); loadHealth()
      setEditSlot(null)
    } catch {
      setAddSubjErr('Network error — please try again')
    } finally { setAddingSubj(false) }
  }

  // ── Change permanent class_subjects teacher assignment ────────────────────
  async function savePermTeacher() {
    if (!selected || !subjectAssignment) return
    setSavingPermTeacher(true)
    try {
      await fetch(`/api/classes/${selected.id}/subjects`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectAssignment.id, teacher_id: newPermTeacherId }),
      })
      // Reload timetable to reflect teacher change
      const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
      const freshData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
      const freshSlots: TimetableSlot[] = Array.isArray(freshData) ? freshData : []
      setTimetable(freshSlots)
      setConflictCount(freshSlots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
      setHasChanges(true); loadHealth(); refreshAllSlots()
      setEditSlot(null)
    } finally { setSavingPermTeacher(false) }
  }

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
    const tmplIdForBody = selectedTemplateId === 'default' ? null : selectedTemplateId
    const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
    if (applyAll && editSlot.subject_name) {
      await fetch('/api/class-timetable', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: selected.id, school_id: schoolId, teacher_id: teacherId, apply_to_subject: true, subject_name: editSlot.subject_name, template_id: tmplIdForBody }),
      })
    } else {
      await fetch('/api/class-timetable', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: selected.id, school_id: schoolId, day_of_week: editSlot.day_of_week, period_number: pNum, teacher_id: teacherId, template_id: tmplIdForBody }),
      })
    }
    // Re-fetch timetable to get fresh has_conflict flags after teacher change
    const freshData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
    const freshSlots: TimetableSlot[] = Array.isArray(freshData) ? freshData : []
    setTimetable(freshSlots)
    setConflictCount(freshSlots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
    setSaving(false); setEditSlot(null); setHasChanges(true)
    // Refresh cached school slots + health
    refreshAllSlots(); loadHealth()
  }

  // ── 2-click swap: check BOTH teachers (current or assigned via class_subjects) ──
  function isSwapBlocked(slotA: TimetableSlot, slotB: TimetableSlot): string | null {
    // Resolve effective teacher: use current teacher, or look up assigned teacher from class_subjects
    // for no-teacher slots (e.g. English + Assign — Mary Joseph is still the English teacher)
    const effectiveTeacher = (slot: TimetableSlot): { id: number; name: string } | null => {
      if (slot.teacher_id && slot.teacher_name) return { id: slot.teacher_id, name: slot.teacher_name }
      if (slot.subject_name) {
        const cs = classSubjects.find(s => s.subject_name.toLowerCase() === (slot.subject_name ?? '').toLowerCase())
        if (cs?.teacher_id && cs?.teacher_name) return { id: cs.teacher_id, name: cs.teacher_name }
      }
      return null
    }

    const tA = effectiveTeacher(slotA)
    const tB = effectiveTeacher(slotB)

    // Check: can teacher A cover slotB's time?
    if (tA) {
      const pB = Math.round(Number(slotB.period_number))
      if (busyMap[tA.id]?.[slotB.day_of_week]?.has(pB))
        return `${tA.name} is busy at ${slotB.day_of_week} P${pB} (another class)`
    }
    // Check: can teacher B cover slotA's time?
    if (tB) {
      const pA = Math.round(Number(slotA.period_number))
      if (busyMap[tB.id]?.[slotA.day_of_week]?.has(pA))
        return `${tB.name} is busy at ${slotA.day_of_week} P${pA} (another class)`
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
    const tmplIdForBody = selectedTemplateId === 'default' ? null : selectedTemplateId
    fetch('/api/class-timetable/swap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, class_id: selected.id, template_id: tmplIdForBody,
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
      const tmplIdForBody = selectedTemplateId === 'default' ? null : selectedTemplateId
      const tmplParam = selectedTemplateId === 'default' ? 'default' : selectedTemplateId
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId, class_id: selected.id, force_replace: true,
          template_id: tmplIdForBody,
          ...(templateSettings ? { schedule_settings: templateSettings } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRegenMsg({ text: data.error || 'Regeneration failed', ok: false })
      } else {
        const parts: string[] = ['Timetable regenerated.']
        if (data.conflicts_auto_resolved > 0) parts.push(`${data.conflicts_auto_resolved} conflict(s) auto-resolved.`)
        if (data.conflicts_need_manual   > 0) parts.push(`${data.conflicts_need_manual} slot(s) need a teacher — click amber cells.`)
        setRegenMsg({ text: parts.join(' '), ok: true })
        const ttData = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
        const slots: TimetableSlot[] = Array.isArray(ttData) ? ttData : []
        setTimetable(slots)
        const newConflicts = slots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length
        setConflictCount(newConflicts)
        if (newConflicts > 0 && showConflictPanel) loadConflicts()
        setClasses(prev => prev.map(c => c.id === selected.id ? { ...c, timetable_generated_at: new Date().toISOString() } : c))
        setHasChanges(true)
        refreshAllSlots(); loadHealth()
        setTimeout(() => setRegenMsg(null), 6000)
      }
    } finally { setRegenerating(false) }
  }

  // ── Create custom blank timetable ────────────────────────────────────────
  async function createCustomTimetable() {
    if (!selected) return
    setCreatingCustom(true)
    try {
      const tmpl = customTemplateId !== 'default' ? savedTemplates.find(t => t.id === customTemplateId) : null
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId, class_id: selected.id,
          force_replace: true, custom_mode: true,
          template_id: customTemplateId !== 'default' ? customTemplateId : null,
          schedule_settings: tmpl ? tmpl.settings : undefined,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      // Reload timetable
      const tmplParam = customTemplateId !== 'default' ? customTemplateId : 'default'
      const data = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${tmplParam}`).then(r => r.json())
      const slots: TimetableSlot[] = Array.isArray(data) ? data : []
      setTimetable(slots)
      setConflictCount(0)
      setHasChanges(false)
      setSelectedTemplateId(customTemplateId)
      if (tmpl) { setActiveSchedule(buildScheduleFromSettings(tmpl.settings)); setActiveAcademicSlots(buildScheduleFromSettings(tmpl.settings).filter(s => !s.is_break)) }
      setShowCustomModal(false)
      setEditMode(true)  // auto-enter edit mode so admin can fill in subjects
      setClasses(prev => prev.map(c => c.id === selected.id ? { ...c, timetable_generated_at: new Date().toISOString() } : c))
      refreshAllSlots(); loadHealth()
    } catch (e) {
      setRegenMsg({ text: e instanceof Error ? e.message : 'Failed to create custom timetable', ok: false })
      setShowCustomModal(false)
    } finally {
      setCreatingCustom(false)
    }
  }

  // ── Circulate timetable ───────────────────────────────────────────────────
  async function circulate() {
    if (!selected) return
    setCirculating(true); setCirculateMsg(null)
    try {
      const tmplIdForBody = selectedTemplateId === 'default' ? null : selectedTemplateId
      const res = await fetch('/api/class-timetable/circulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: selected.id, template_id: tmplIdForBody }),
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
    <div className="space-y-4">

      {/* ── Teacher Load Analysis Banner ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-base">📊</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">Teacher Load Analysis</p>
              <p className="text-xs text-gray-400">Check if any teacher is overcommitted before generating — prevents conflicts at the root</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {loadData?.summary && (
              <div className="flex items-center gap-2 text-xs">
                {loadData.summary.high_risk > 0   && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{loadData.summary.high_risk} High risk</span>}
                {loadData.summary.medium_risk > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{loadData.summary.medium_risk} Medium</span>}
                {loadData.summary.high_risk === 0 && loadData.summary.medium_risk === 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ All good</span>
                )}
              </div>
            )}
            <button onClick={runLoadAnalysis} disabled={loadAnalysing}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors">
              {loadAnalysing ? 'Analysing…' : loadData ? '↻ Re-check' : 'Check Now'}
            </button>
            {loadData && (
              <button onClick={() => setShowLoadPanel(p => !p)}
                className="text-xs text-gray-400 hover:text-gray-600 font-medium">
                {showLoadPanel ? 'Hide ▲' : 'Show ▼'}
              </button>
            )}
          </div>
        </div>

        {showLoadPanel && loadData?.teachers && loadData?.summary && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            {loadData.teachers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No teacher assignments found. Add subjects to classes first.</p>
            ) : (
              <div className="space-y-2">
                {loadData.teachers.filter(t => t.risk !== 'low').length === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
                    ✓ All teachers have manageable loads — timetable generation should produce minimal conflicts.
                  </div>
                )}
                {loadData.teachers.map(teacher => (
                  <div key={teacher.teacher_id}
                    className={`rounded-xl border p-3 ${
                      teacher.risk === 'high'   ? 'bg-red-50 border-red-200' :
                      teacher.risk === 'medium' ? 'bg-amber-50 border-amber-200' :
                                                  'bg-gray-50 border-gray-200'
                    }`}>
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          teacher.risk === 'high'   ? 'bg-red-200 text-red-800' :
                          teacher.risk === 'medium' ? 'bg-amber-200 text-amber-800' :
                                                      'bg-gray-200 text-gray-600'
                        }`}>{teacher.risk.toUpperCase()}</span>
                        <span className="text-sm font-semibold text-gray-800">{teacher.teacher_name}</span>
                      </div>
                      <span className={`text-[11px] font-medium flex-shrink-0 ${
                        teacher.overloaded ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {teacher.total_periods} periods/week
                        {teacher.overloaded && <span className="ml-1 text-red-600 font-bold">⚠ overloaded</span>}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {teacher.subjects.map(s => (
                        <div key={s.subject_name} className="flex items-center justify-between text-[11px]">
                          <span className={s.parallel_risk ? 'text-gray-700 font-medium' : 'text-gray-500'}>
                            {s.subject_name}
                            {s.parallel_risk && (
                              <span className="ml-1.5 text-[10px] text-amber-600">
                                ({s.class_count} classes: {s.classes})
                              </span>
                            )}
                          </span>
                          <span className={`font-medium ${s.parallel_risk ? 'text-amber-700' : 'text-gray-400'}`}>
                            {s.total_periods} p/w
                          </span>
                        </div>
                      ))}
                    </div>
                    {teacher.risk === 'high' && teacher.subjects.some(s => s.parallel_risk) && (
                      <p className="text-[10px] text-red-600 mt-2 font-medium">
                        Fix: Split the load — assign a second teacher to some of these sections before generating.
                      </p>
                    )}
                    {teacher.risk === 'medium' && (
                      <p className="text-[10px] text-amber-700 mt-2">
                        May cause some conflicts. Generate and use swap/fix tools if needed.
                      </p>
                    )}
                  </div>
                ))}
                {/* Show low-risk teachers in a compact row */}
                {loadData.teachers.filter(t => t.risk === 'low').length > 0 && (
                  <div className="text-[10px] text-gray-400 pt-1">
                    {loadData.teachers.filter(t => t.risk === 'low').map(t => t.teacher_name).join(', ')} — load OK
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
      <div ref={rightPanelRef} className="flex-1 min-w-0">
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
                    onChange={async e => {
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
                      // Re-fetch timetable for the selected class using the new template
                      if (selected) {
                        setTtLoading(true)
                        const data = await fetch(`/api/class-timetable?class_id=${selected.id}&school_id=${schoolId}&template_id=${val}`).then(r => r.json())
                        const slots: TimetableSlot[] = Array.isArray(data) ? data : []
                        setTimetable(slots)
                        setConflictCount(slots.filter(s => (s as TimetableSlot & { has_conflict?: boolean }).has_conflict).length)
                        setHasChanges(false)
                        setTtLoading(false)
                      }
                    }}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[160px] ${
                      selectedTemplateId !== 'default'
                        ? 'border border-violet-300 text-violet-700 bg-violet-50 ring-1 ring-violet-200'
                        : 'border border-blue-200 text-blue-700 bg-blue-50'
                    }`}
                    title="Select schedule template — grid and generation both update instantly">
                    <option value="default">School Default</option>
                    {savedTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
                {timetable.length > 0 && (
                  <button onClick={() => setShowDeleteConfirm(true)} disabled={deletingTt || editMode}
                    className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
                    title="Delete this class timetable">
                    🗑 Delete
                  </button>
                )}
                {/* Custom timetable button */}
                <button onClick={() => { setShowCustomModal(true); setCustomTemplateId('default') }}
                  disabled={editMode}
                  title="Create a blank timetable and fill in subjects manually"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-40 transition-colors">
                  ✦ Custom
                </button>

                {/* Generate (first time) or Regenerate (already exists) */}
                {(() => {
                  const tmplName = selectedTemplateId !== 'default'
                    ? (savedTemplates.find(t => t.id === selectedTemplateId)?.name ?? '')
                    : ''
                  return timetable.length === 0 ? (
                    <button onClick={regenerate} disabled={regenerating}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                      {regenerating ? 'Generating…' : tmplName ? `Generate · ${tmplName}` : 'Generate Timetable'}
                    </button>
                  ) : (
                    <button onClick={regenerate} disabled={regenerating || editMode}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                      {regenerating ? 'Regenerating…' : tmplName ? `↻ Regen · ${tmplName}` : '↻ Regenerate'}
                    </button>
                  )
                })()}
                {/* Edit + Circulate — only when timetable exists */}
                {timetable.length > 0 && (
                  !editMode ? (
                    <>
                      <button onClick={() => { setEditMode(true); setSwapMsg(null); setCirculateMsg(null) }}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors">
                        ✏ Edit Timetable
                      </button>
                      <button onClick={circulate}
                        disabled={circulating || conflictCount > 0 || (!!selected.timetable_circulated_at && !hasChanges)}
                        title={conflictCount > 0 ? 'Resolve all conflicts before circulating'
                          : (!!selected.timetable_circulated_at && !hasChanges) ? 'Already circulated — make changes to re-circulate'
                          : 'Publish timetable to staff and students'}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                          hasChanges
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-300'
                            : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                        }`}>
                        {circulating ? 'Circulating...' : selected.timetable_circulated_at && !hasChanges ? '✓ Circulated' : 'Circulate'}
                      </button>
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
                  )
                )}
              </div>
            </div>

            {/* ── Custom Timetable modal ── */}
            {showCustomModal && selected && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                  <div className="mb-4">
                    <h3 className="font-bold text-gray-900 text-sm">Create Custom Timetable</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Creates a blank grid for <strong>Grade {selected.grade} – Section {selected.section}</strong>.
                      No subjects are auto-assigned — you fill in each slot manually.
                    </p>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Schedule Template</label>
                    <select
                      value={String(customTemplateId)}
                      onChange={e => setCustomTemplateId(e.target.value === 'default' ? 'default' : Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
                      <option value="default">School Default Schedule</option>
                      {savedTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {savedTemplates.length === 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">No named templates yet — using school default schedule.</p>
                    )}
                  </div>
                  <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                    This will replace the existing timetable for this class, if any.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowCustomModal(false)}
                      className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={createCustomTimetable} disabled={creatingCustom}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
                      {creatingCustom ? 'Creating…' : 'Create Blank Grid'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Delete confirmation modal ── */}
            {showDeleteConfirm && selected && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">Delete Timetable?</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        This will permanently remove the timetable for{' '}
                        <strong>Grade {selected.grade} – Section {selected.section}</strong>,
                        including all manually edited slots. You can generate a fresh one anytime.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={deleteTimetable} disabled={deletingTt}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                      {deletingTt ? 'Deleting...' : 'Delete Timetable'}
                    </button>
                  </div>
                </div>
              </div>
            )}

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

            {/* ── Conflict Resolution Panel ── */}
            {conflictCount > 0 && (
              <div className="mx-4 mt-3">
                <div className={`rounded-xl border overflow-hidden ${showConflictPanel ? 'border-red-300' : 'border-red-200'}`}>
                  {/* Header — always visible */}
                  <button
                    onClick={() => {
                      const next = !showConflictPanel
                      setShowConflictPanel(next)
                      if (next && conflicts.length === 0) loadConflicts()
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors text-left">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">!</span>
                      <span className="text-sm font-semibold text-red-800">
                        {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} — teacher double-booked
                      </span>
                      <span className="text-xs text-red-500">(Cannot circulate until resolved)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-medium">{showConflictPanel ? 'Hide' : 'Resolve →'}</span>
                      <svg className={`w-4 h-4 text-red-400 transition-transform ${showConflictPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expandable conflict list */}
                  {showConflictPanel && (
                    <div className="bg-white divide-y divide-gray-100">
                      {conflictsLoading ? (
                        <div className="py-6 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                          Loading conflicts…
                        </div>
                      ) : conflicts.length === 0 ? (
                        <div className="py-4 text-center text-gray-400 text-xs">No conflict details found — try refreshing.</div>
                      ) : (
                        conflicts.map((cg, i) => (
                          <div key={i} className="px-4 py-3 space-y-2">
                            {/* Conflict summary line */}
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="text-sm font-semibold text-gray-900">{cg.teacher_name}</span>
                                <span className="text-xs text-gray-500 ml-2">
                                  {cg.day_of_week.slice(0, 3)} · {cg.time_from}–{cg.time_to}
                                </span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {cg.slots.map(s => (
                                    <span key={s.slot_id} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${s.is_manual ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                      Gr.{s.grade}{s.section} · {s.subject_name || '?'}
                                      {s.is_manual && <span className="ml-1 text-[9px] opacity-70">manual</span>}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Fix options */}
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="text-[11px] text-gray-400 font-medium">Free a slot:</span>
                              {cg.slots.filter(s => !s.is_manual).map(s => (
                                <button key={s.slot_id}
                                  onClick={() => fixConflict(s.slot_id, null)}
                                  disabled={fixingSlot === s.slot_id}
                                  className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                                  {fixingSlot === s.slot_id ? '…' : `Clear Gr.${s.grade}${s.section}`}
                                </button>
                              ))}
                              {cg.alternatives.length > 0 && (
                                <>
                                  <span className="text-[11px] text-gray-400 font-medium ml-1">Or reassign:</span>
                                  {cg.alternatives.slice(0, 3).map(alt => (
                                    <button key={alt.id}
                                      onClick={() => fixConflict(cg.slots.find(s => !s.is_manual)?.slot_id ?? cg.slots[0].slot_id, alt.id)}
                                      disabled={!!fixingSlot}
                                      className="text-[11px] px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 transition-colors">
                                      {fixingSlot ? '…' : alt.name}
                                    </button>
                                  ))}
                                </>
                              )}
                              {cg.slots.every(s => s.is_manual) && (
                                <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  All slots are manual edits — go to the affected class to reassign
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                        <p className="text-[10px] text-gray-400">Violet = manually set (preserved on regenerate) · Red = auto-generated</p>
                        <button onClick={loadConflicts} disabled={conflictsLoading}
                          className="text-[10px] text-blue-500 hover:text-blue-700 font-medium disabled:opacity-40">
                          ↻ Refresh
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Timetable grid (days × periods) ── */}
            {timetable.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <p className="text-gray-400 text-sm">No timetable generated yet for Grade {selected.grade}-{selected.section}</p>
                <p className="text-gray-300 text-xs">Add subjects in Class Management, then click <strong className="text-blue-500">Generate Timetable</strong> above</p>
              </div>
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {/* Day column header */}
                      <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-20 border-r border-slate-700 sticky left-0 z-10">Day</th>
                      {/* Period/break columns */}
                      {activeSchedule.map(s => (
                        <th key={s.slot} className={`px-2 py-2 text-center font-semibold border-r border-slate-700 last:border-r-0 min-w-[95px] ${
                          s.is_break ? 'bg-amber-800/70 text-amber-100' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {s.is_break ? (
                            <span className="text-[10px]">{s.break_label || 'Break'}</span>
                          ) : (
                            <div>
                              <div>{s.short}</div>
                              <div className="text-[10px] font-normal text-slate-400 mt-0.5 whitespace-nowrap">{s.time_from}–{s.time_to}</div>
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => (
                      <tr key={day} className={`border-b border-gray-100 hover:bg-gray-50/30 ${day === today ? 'bg-blue-50/30' : ''}`}>
                        {/* Day label */}
                        <td className={`px-3 py-2 border-r border-gray-100 sticky left-0 z-10 ${day === today ? 'bg-blue-100' : 'bg-gray-50'}`}>
                          <span className={`font-semibold text-[11px] ${day === today ? 'text-blue-700' : 'text-gray-600'}`}>{day.slice(0, 3)}</span>
                          {day === today && <span className="block text-[9px] text-blue-400 font-medium">Today</span>}
                        </td>
                        {/* Period/break cells */}
                        {activeSchedule.map(s => {
                          if (s.is_break) return (
                            <td key={s.slot} className="px-1 py-1 border-r border-gray-100 last:border-r-0 bg-amber-50/60 text-center">
                              <span className="text-amber-400 text-[10px] italic">{s.break_label || 'Break'}</span>
                            </td>
                          )
                          const slot = timetable.find(t => t.day_of_week === day && Math.round(Number(t.period_number)) === s.slot && !t.is_break)
                          const isSelected = !!selectedSlot &&
                            selectedSlot.day_of_week === day &&
                            Math.round(Number(selectedSlot.period_number)) === s.slot
                          const isBlockedTarget = !!selectedSlot && !isSelected && slot && !slot.is_break &&
                            !!isSwapBlocked(selectedSlot, slot)
                          const isFreeTarget = !!selectedSlot && !isSelected && slot && !slot.is_break &&
                            !isSwapBlocked(selectedSlot, slot)
                          return (
                            <td key={s.slot} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                              {slot ? (
                                <button
                                  onClick={() => handleCellClick(slot)}
                                  title={isBlockedTarget && selectedSlot ? isSwapBlocked(selectedSlot, slot) ?? undefined : undefined}
                                  className={`w-full text-left rounded-lg px-2 py-1.5 min-h-[48px] transition-all select-none cursor-pointer ${
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
                                  {isFreeTarget && <p className="text-emerald-500 text-[9px] mt-0.5 font-semibold">↔ Swap</p>}
                                </button>
                              ) : (
                                <div className="rounded-lg px-2 py-1.5 border border-dashed border-gray-200 bg-gray-50 min-h-[48px] flex items-center justify-center">
                                  <span className="text-gray-200 text-[10px]">—</span>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
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

      {/* ── Slot action modal (assign teacher / add subject) ── */}
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

        // Is the assigned class_subjects teacher busy right now?
        const assignedTeacherBusy = subjectAssignment?.teacher_id
          ? busyTeachers[subjectAssignment.teacher_id] ?? null
          : null

        const TRow = ({ t, isBusy, forPerm, gradeOk = true }: { t: Teacher; isBusy: boolean; forPerm?: boolean; gradeOk?: boolean }) => {
          const busy = busyTeachers[t.id]
          const isSel = forPerm ? newPermTeacherId === t.id : selTeacherId === t.id
          return (
            <button disabled={isBusy && !forPerm}
              onClick={() => forPerm ? setNewPermTeacherId(t.id) : (!isBusy && setSelTeacherId(t.id))}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                isBusy && !forPerm ? 'opacity-40 cursor-not-allowed' : isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-800'
              }`}>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium truncate">{t.name}</span>
                {t.subject && <span className={`text-[11px] flex-shrink-0 ${isSel ? 'text-blue-200' : 'text-gray-400'}`}>· {t.subject}</span>}
                {!gradeOk && <span className={`text-[10px] px-1 py-0.5 rounded font-semibold flex-shrink-0 ${isSel ? 'bg-blue-500 text-blue-100' : 'bg-amber-100 text-amber-700'}`}>
                  ⚠ other grade
                </span>}
              </span>
              {isBusy && !forPerm && busy && <span className="text-[10px] text-red-500 font-medium ml-2 flex-shrink-0">Gr {busy.grade}-{busy.section}</span>}
            </button>
          )
        }

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditSlot(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900">
                  {addSubjMode ? 'Add New Subject' : editSlot.teacher_id ? 'Change Teacher' : subj ? 'Assign Teacher' : 'Slot Options'}
                </h3>
                <button onClick={() => setEditSlot(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>

              {/* Slot meta badges */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{editSlot.day_of_week}</span>
                <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {activeSchedule.find(s => s.slot === Math.round(Number(editSlot.period_number)))?.label}
                </span>
                {subj && !addSubjMode && <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{subj}</span>}
                {editSlot.teacher_name && !addSubjMode && <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Current: {editSlot.teacher_name}</span>}
              </div>

              {/* ── ADD SUBJECT MODE ── */}
              {addSubjMode ? (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">Add a new subject to this class. Teacher can be assigned later by clicking the slot again.</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Subject Name</label>
                    <input
                      type="text" placeholder="e.g. Sports, Art, Music..."
                      value={newSubjName} onChange={e => setNewSubjName(e.target.value)}
                      autoFocus
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Periods per week</label>
                    <input
                      type="number" min={1} max={12} value={newSubjPPW}
                      onChange={e => setNewSubjPPW(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                  {addSubjErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addSubjErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setAddSubjMode(false); setNewSubjName(''); setAddSubjErr(null) }}
                      className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50">Back</button>
                    <button onClick={addSubjectToSlot} disabled={addingSubj || !newSubjName.trim()}
                      className="flex-1 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                      {addingSubj ? 'Adding...' : 'Add Subject'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* ── SUBJECT ASSIGNMENT INFO (for slots with subject but no teacher) ── */}
                  {subj && !editSlot.teacher_id && !loadingAvail && (
                    <>
                      {subjectAssignment?.teacher_name ? (
                        <div className={`rounded-xl p-3 mb-4 border text-xs ${assignedTeacherBusy ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                          <p className="font-semibold text-gray-800 mb-1">
                            {assignedTeacherBusy ? '⚠ Assigned teacher is busy at this slot' : '✓ Assigned teacher for ' + subj}
                          </p>
                          <p className={`${assignedTeacherBusy ? 'text-amber-700' : 'text-emerald-700'}`}>
                            <span className="font-medium">{subjectAssignment.teacher_name}</span>
                            {assignedTeacherBusy && (
                              <> — currently teaching <span className="font-medium">{assignedTeacherBusy.subject_name || 'another subject'}</span> in Grade {assignedTeacherBusy.grade}-{assignedTeacherBusy.section}</>
                            )}
                          </p>
                          {assignedTeacherBusy && (
                            <div className="mt-2">
                              {!changingSubjTeacher ? (
                                <button onClick={() => { setChangingSubjTeacher(true); setNewPermTeacherId(null) }}
                                  className="text-[11px] text-blue-600 font-semibold hover:text-blue-800 underline underline-offset-2">
                                  Change permanent {subj} teacher →
                                </button>
                              ) : (
                                <div className="mt-2">
                                  <p className="text-[11px] font-semibold text-gray-700 mb-1.5">Select new permanent teacher for {subj}:</p>
                                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto bg-white divide-y divide-gray-50 mb-2">
                                    {[...availMatch, ...availOther].map(t => <TRow key={t.id} t={t} isBusy={false} forPerm gradeOk={canTeachGrade(t.teaches_grades, selected?.grade ?? '')} />)}
                                    {busyList.filter(t => t.id !== subjectAssignment.teacher_id).map(t => <TRow key={t.id} t={t} isBusy forPerm gradeOk={canTeachGrade(t.teaches_grades, selected?.grade ?? '')} />)}
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => setChangingSubjTeacher(false)}
                                      className="flex-1 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50">Cancel</button>
                                    <button onClick={savePermTeacher} disabled={savingPermTeacher || newPermTeacherId === null}
                                      className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                                      {savingPermTeacher ? 'Saving...' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : subjectAssignment && !subjectAssignment.teacher_name ? (
                        <div className="rounded-xl p-3 mb-4 border border-gray-200 bg-gray-50 text-xs text-gray-500">
                          No teacher assigned for <span className="font-medium">{subj}</span> in class subjects. Select a teacher below.
                        </div>
                      ) : null}
                    </>
                  )}

                  {/* ── TEACHER SELECTION LIST ── */}
                  {!changingSubjTeacher && (
                    <>
                      {/* Precompute class-teacher lists for the "no teacher" scenario */}
                      {(() => {
                        // Include teachers from class_subjects AND from timetable slots —
                        // auto-generation fills timetable slots but often leaves class_subjects.teacher_id=null
                        const classTeacherIds = new Set<number>([
                          ...classSubjects.map(s => s.teacher_id).filter(Boolean) as number[],
                          ...timetable.filter(s => !s.is_break && s.teacher_id).map(s => s.teacher_id as number),
                        ])
                        const freeClassTeachers = teachers.filter(t => classTeacherIds.has(t.id) && !busyTeachers[t.id])
                        const busyClassTeachers = teachers.filter(t => classTeacherIds.has(t.id) && !!busyTeachers[t.id])
                        const classTeacherSubject = (tid: number) => {
                          const fromSubjects = classSubjects.find(s => s.teacher_id === tid)?.subject_name
                          if (fromSubjects) return fromSubjects
                          const fromTimetable = timetable.find(s => s.teacher_id === tid && s.subject_name)
                          return fromTimetable?.subject_name ?? ''
                        }
                        const showClassView = classSubjects.length > 0

                        return (
                          <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                            {loadingAvail ? (
                              <div className="py-6 flex items-center justify-center gap-2 text-gray-400 text-sm">
                                <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />Checking...
                              </div>
                            ) : (
                              <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                                <button onClick={() => setSelTeacherId(null)}
                                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${selTeacherId === null ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-50 italic'}`}>
                                  — No teacher —
                                </button>

                                {showClassView ? (
                                  /* Always show THIS CLASS's teachers first, then other school staff */
                                  <>
                                    {/* ── This class's free teachers ── */}
                                    {freeClassTeachers.length > 0 && (
                                      <>
                                        <div className="px-3 py-1 bg-emerald-50 text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">
                                          Free · Grade {selected?.grade}-{selected?.section} teachers
                                        </div>
                                        {freeClassTeachers.map(t => {
                                          const subjLabel = classTeacherSubject(t.id)
                                          const isSel = selTeacherId === t.id
                                          return (
                                            <button key={t.id} onClick={() => setSelTeacherId(t.id)}
                                              className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-800'}`}>
                                              <span>
                                                <span className="font-medium">{t.name}</span>
                                                {subjLabel && <span className={`ml-1.5 text-[11px] ${isSel ? 'text-blue-200' : 'text-gray-400'}`}>· {subjLabel}</span>}
                                              </span>
                                            </button>
                                          )
                                        })}
                                      </>
                                    )}
                                    {/* ── All class teachers are busy: show swap suggestions ── */}
                                    {freeClassTeachers.length === 0 && classSubjects.length > 0 && (() => {
                                      // Find other slots in this class whose teacher is free at the current day+period
                                      const suggestions = timetable.filter(s =>
                                        !s.is_break && s.id !== editSlot.id &&
                                        s.teacher_id && s.subject_name &&
                                        !busyTeachers[s.teacher_id]
                                      )
                                      return (
                                        <>
                                          <div className="px-3 py-2.5 bg-amber-50 text-[11px] text-amber-700 font-medium border-b border-amber-100">
                                            All class teachers are busy at this slot
                                          </div>
                                          {suggestions.length > 0 && (
                                            <div className="border-b border-gray-100">
                                              <button onClick={() => setShowSwapHints(h => !h)}
                                                className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                                                <span>↔ Swap this slot to fix ({suggestions.length} option{suggestions.length !== 1 ? 's' : ''})</span>
                                                <span className="text-gray-400">{showSwapHints ? '▲' : '▼'}</span>
                                              </button>
                                              {showSwapHints && (
                                                <div className="px-3 pb-3 space-y-1.5">
                                                  <p className="text-[10px] text-gray-400 mb-1.5">
                                                    Swap <span className="font-semibold text-gray-600">{editSlot.subject_name}</span> with one of these — that teacher is free right now and can cover this period:
                                                  </p>
                                                  {suggestions.slice(0, 6).map(s => {
                                                    const pLabel = activeSchedule.find(sc => sc.slot === Math.round(Number(s.period_number)))?.label ?? `P${s.period_number}`
                                                    return (
                                                      <button key={s.id}
                                                        disabled={swapping}
                                                        onClick={() => doSwapFromModal(editSlot, s)}
                                                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-left text-[11px] transition-colors disabled:opacity-40">
                                                        <span>
                                                          <span className="font-semibold text-blue-800">{s.subject_name}</span>
                                                          <span className="text-blue-500 ml-1.5">{s.day_of_week} · {pLabel}</span>
                                                        </span>
                                                        <span className="text-emerald-600 font-medium flex-shrink-0 ml-2">
                                                          {swapping ? '…' : `${s.teacher_name} free ↔`}
                                                        </span>
                                                      </button>
                                                    )
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </>
                                      )
                                    })()}
                                    {/* ── Other school teachers free at this slot, split by grade eligibility ── */}
                                    {(() => {
                                      const classTeacherIdSet = new Set(freeClassTeachers.map(t => t.id).concat(busyClassTeachers.map(t => t.id)))
                                      const grade = selected?.grade ?? ''
                                      const otherFree = teachers.filter(t => !classTeacherIdSet.has(t.id) && !busyTeachers[t.id])
                                      const gradeOk  = otherFree.filter(t => canTeachGrade(t.teaches_grades, grade))
                                      const gradeNo  = otherFree.filter(t => !canTeachGrade(t.teaches_grades, grade))
                                      return (
                                        <>
                                          {gradeOk.length > 0 && (
                                            <>
                                              <div className="px-3 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                                Other Available Staff
                                              </div>
                                              {gradeOk.map(t => <TRow key={t.id} t={t} isBusy={false} gradeOk />)}
                                            </>
                                          )}
                                          {gradeNo.length > 0 && (
                                            <>
                                              <div className="px-3 py-1 bg-amber-50 text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
                                                Not assigned to Grade {grade}
                                              </div>
                                              {gradeNo.map(t => <TRow key={t.id} t={t} isBusy={false} gradeOk={false} />)}
                                            </>
                                          )}
                                        </>
                                      )
                                    })()}
                                    {/* ── This class's busy teachers — show what they're teaching ── */}
                                    {busyClassTeachers.length > 0 && (
                                      <>
                                        <div className="px-3 py-1 bg-red-50 text-[10px] font-semibold text-red-400 uppercase tracking-wide">
                                          Busy · Grade {selected?.grade}-{selected?.section} teachers
                                        </div>
                                        {busyClassTeachers.map(t => {
                                          const busy = busyTeachers[t.id]
                                          const subjLabel = classTeacherSubject(t.id)
                                          return (
                                            <div key={t.id} className="flex items-center justify-between px-3 py-2 gap-2">
                                              <div>
                                                <span className="text-sm font-medium text-gray-500">{t.name}</span>
                                                {subjLabel && <span className="ml-1.5 text-[11px] text-gray-400">· {subjLabel}</span>}
                                              </div>
                                              {busy && (
                                                <span className="text-[10px] text-red-500 font-medium flex-shrink-0 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                                  {busy.subject_name ? `Teaching ${busy.subject_name}` : 'Busy'} · Gr {busy.grade}-{busy.section}
                                                </span>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </>
                                    )}
                                  </>
                                ) : (
                                  /* No class_subjects loaded — show all school teachers */
                                  <>
                                    {availMatch.length > 0 && (<><div className="px-3 py-1 bg-emerald-50 text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Available · {subj || 'Subject'}</div>{availMatch.map(t => <TRow key={t.id} t={t} isBusy={false} />)}</>)}
                                    {availOther.length > 0 && (<><div className="px-3 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Available · Other</div>{availOther.map(t => <TRow key={t.id} t={t} isBusy={false} />)}</>)}
                                    {busyList.length > 0 && (<><div className="px-3 py-1 bg-red-50 text-[10px] font-semibold text-red-400 uppercase tracking-wide">Busy at this slot</div>{busyList.map(t => <TRow key={t.id} t={t} isBusy />)}</>)}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

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
                      <div className="flex gap-2 mb-3">
                        <button onClick={() => setEditSlot(null)} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
                        <button disabled={saving} onClick={() => saveEditSlot(selTeacherId, applyToAll)}
                          className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                          {saving ? 'Saving...' : editSlot.teacher_id ? 'Change' : 'Assign'}
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── ADD NEW SUBJECT OPTION ── */}
                  {!changingSubjTeacher && (
                    <div className="pt-3 border-t border-gray-100">
                      <button onClick={() => { setAddSubjMode(true); setNewSubjName(''); setNewSubjPPW(4); setAddSubjErr(null) }}
                        className="w-full py-2 border border-dashed border-violet-300 text-violet-600 rounded-xl text-xs font-medium hover:bg-violet-50 transition-colors">
                        + Add New Subject to this slot
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })()}

    </div>
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
                        <th className="px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 font-semibold text-left w-20">Day</th>
                        {academicSlots.map(s => (
                          <th key={s.slot} className="px-2 py-2 bg-gray-50 border border-gray-200 text-gray-500 font-semibold text-center min-w-[64px]">
                            <div>{s.short}</div>
                            <div className="text-[9px] font-normal text-gray-400">{s.time_from}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map(day => (
                        <tr key={day}>
                          <td className="px-3 py-1.5 border border-gray-100 bg-gray-50 whitespace-nowrap">
                            <span className="font-semibold text-gray-600 text-[11px]">{day.slice(0, 3)}</span>
                          </td>
                          {academicSlots.map(s => {
                            const key = `${day}-${s.slot}`
                            const isBlocked = unavail.some(u => u.day_of_week === day && u.period_number === s.slot)
                            const hasClass  = timetable.some(t => t.day_of_week === day && Math.round(Number(t.period_number)) === s.slot)
                            return (
                              <td key={s.slot} className="px-1 py-1 border border-gray-100 text-center">
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
                        <th className="bg-slate-800 text-slate-200 px-3 py-2.5 text-left font-semibold w-20 border-r border-slate-700 sticky left-0 z-10">Day</th>
                        {schedule.map(s => (
                          <th key={s.slot} className={`px-2 py-2 text-center font-semibold border-r border-slate-700 last:border-r-0 min-w-[85px] ${
                            s.is_break ? 'bg-amber-800/70 text-amber-100' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {s.is_break ? (
                              <span className="text-[10px]">{s.break_label || 'Break'}</span>
                            ) : (
                              <div>
                                <div>{s.short}</div>
                                <div className="text-[10px] font-normal text-slate-400 mt-0.5 whitespace-nowrap">{s.time_from}–{s.time_to}</div>
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map(day => (
                        <tr key={day} className={`border-b border-gray-100 ${day === today ? 'bg-blue-50/30' : ''}`}>
                          <td className={`px-3 py-1.5 border-r border-gray-100 sticky left-0 z-10 ${day === today ? 'bg-blue-100' : 'bg-gray-50'}`}>
                            <span className={`font-semibold text-[11px] ${day === today ? 'text-blue-700' : 'text-gray-600'}`}>{day.slice(0, 3)}</span>
                            {day === today && <span className="block text-[9px] text-blue-400 font-medium">Today</span>}
                          </td>
                          {schedule.map(s => {
                            if (s.is_break) return (
                              <td key={s.slot} className="px-1 py-1 border-r border-gray-100 last:border-r-0 bg-amber-50/60 text-center">
                                <span className="text-amber-400 text-[10px] italic">{s.break_label || 'Break'}</span>
                              </td>
                            )
                            const slot    = byDay[day]?.find(t => Math.round(Number(t.period_number)) === s.slot)
                            const blocked = unavail.some(u => u.day_of_week === day && u.period_number === s.slot)
                            return (
                              <td key={s.slot} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
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
                      ))}
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

  function computePeriodDuration(f: SchoolScheduleSettings) {
    const [h1, m1] = f.end_time.split(':').map(Number)
    const [h2, m2] = f.start_time.split(':').map(Number)
    const total = (h1 * 60 + m1) - (h2 * 60 + m2)
    return Math.max(15, Math.floor(
      (total - f.morning_break_duration - f.lunch_duration - f.afternoon_break_duration) / f.periods_per_day
    ))
  }

  const periodDuration = computePeriodDuration(form)

  // Local period duration input — lets the user set it directly; updates end_time on change
  const [periodDurInput, setPeriodDurInput] = useState<number>(() => computePeriodDuration(savedSettings))

  // Keep periodDurInput in sync when settings are loaded externally (template load, DB sync)
  useEffect(() => { setPeriodDurInput(computePeriodDuration(form)) }, [form.start_time, form.periods_per_day, form.morning_break_duration, form.lunch_duration, form.afternoon_break_duration]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePeriodDurChange(dur: number) {
    const clamped = Math.max(15, Math.min(120, dur))
    setPeriodDurInput(clamped)
    // Recompute end_time
    const [h, m] = form.start_time.split(':').map(Number)
    const startMins = h * 60 + m
    const endMins = startMins
      + form.periods_per_day * clamped
      + form.morning_break_duration
      + form.lunch_duration
      + form.afternoon_break_duration
    const hh = Math.floor(endMins / 60)
    const mm = endMins % 60
    set('end_time', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
  }

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
            </div>
          </div>
          <div>
            <span className="text-[11px] text-gray-500">Period Duration (min)</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number" min={15} max={120} step={5}
                value={periodDurInput}
                onChange={e => handlePeriodDurChange(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="text-[10px] text-gray-400">min → End: {form.end_time}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Changing this auto-adjusts the End Time above.</p>
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
