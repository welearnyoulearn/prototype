'use client'

import { useEffect, useState } from 'react'
import TestCalendar from '../../components/TestCalendar'
import NotificationBell from '../../components/NotificationBell'

type ClassOption = { id: number; grade: string; section: string }
type ClassSubject = { id: number; subject_name: string; teacher_name: string | null }
type ClassExamRow = { id: number; exam_name: string; exam_date: string; status: string }
type StudentOption = { id: number; name: string; roll_number: string; school_roll_number: number | null }
type ExamConflict = { exam_id: number; exam_name: string; exam_date: string; start_time: string | null; end_time: string | null; grade: string; section: string }

// Results types
type ExamListRow = {
  id: number; exam_name: string; exam_type: string; exam_date: string
  grade: string; section: string; status: string; passing_pct: number
  total_subjects: number; submitted_subjects: number
}
type SubjectStat = {
  exam_subject_id: number; subject_name: string; max_marks: number; teacher_name: string | null
  avg_marks: number | null; pass_count: number; fail_count: number; absent_count: number; entries: number
}
type StudentResult = {
  student_id: number; name: string; roll_number: string
  subjects: Record<string, { marks_obtained: number | null; is_absent: boolean }>
  total_obtained: number | null; total_max: number
  percentage: number | null; pass: boolean | null; all_entered: boolean
}
type MarksData = {
  exam: ExamListRow; subjects: Array<{ subject_name: string; max_marks: number; pass_marks: number | null }>
  students: StudentResult[]; subject_stats: SubjectStat[]
  pass_count: number; fail_count: number; total_max: number
}
type AckRow = { student_id: number; student_name: string; roll_number: string; acknowledged_at: string | null; parent_name: string | null; last_nudged_at: string | null }

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test', mid_term: 'Mid Term', final_exam: 'Final Exam', practical: 'Practical'
}

const EXAM_TYPES = [
  { value: 'unit_test',   label: 'Unit Test' },
  { value: 'mid_term',    label: 'Mid Term' },
  { value: 'final_exam',  label: 'Final Exam' },
  { value: 'practical',   label: 'Practical' },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled:        { label: 'Scheduled',       color: 'bg-gray-100 text-gray-500' },
  collecting:       { label: 'Collecting Marks', color: 'bg-amber-100 text-amber-700' },
  teacher_reviewed: { label: 'Awaiting Release', color: 'bg-violet-100 text-violet-700' },
  released:         { label: 'Released',         color: 'bg-emerald-100 text-emerald-700' },
  cancelled:        { label: 'Cancelled',        color: 'bg-red-100 text-red-600' },
}

// Turns a raw API error into something an admin can act on — a bare
// "Forbidden" from an expired/missing session is meaningless to a user who
// just clicked a button, so surface the actual actionable cause instead.
function friendlyExamError(rawError: string | undefined, status: number): string {
  if (status === 403) return 'Your session has expired or you no longer have access. Please refresh the page and sign in again.'
  return rawError || 'Something went wrong. Please try again.'
}

type Props = { schoolId: number }

export default function ExamSchedule({ schoolId }: Props) {
  const [view, setView] = useState<'calendar' | 'create' | 'manage' | 'results' | 'reminders'>('calendar')
  const [classes, setClasses] = useState<ClassOption[]>([])

  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [schoolId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Exam Schedule</h2>
          <p className="text-sm text-gray-500">Schedule exams and automatically notify students, class teachers, and parents</p>
        </div>
        <div className="flex gap-2 items-center">
          <NotificationBell schoolId={schoolId} group="exams" />
          {([
            { key: 'calendar',  label: 'Calendar' },
            { key: 'manage',    label: 'Manage Exams' },
            { key: 'results',   label: 'Results & Release' },
            { key: 'reminders', label: 'Reminders' },
            { key: 'create',    label: '+ Schedule Exam' },
          ] as const).map(({ key, label }) => (
            <button key={key} data-testid={`exam-tab-${key}`}
              onClick={() => setView(key)}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${view === key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'calendar' && <TestCalendar mode="admin" schoolId={schoolId} />}
      {view === 'manage' && <ManageExams schoolId={schoolId} />}
      {view === 'results' && <ResultsAndRelease schoolId={schoolId} />}
      {view === 'reminders' && <NotificationSettings schoolId={schoolId} />}
      {view === 'create' && <CreateExamWizard schoolId={schoolId} classes={classes} onDone={() => setView('calendar')} />}
    </div>
  )
}

// ─── Notification Settings — spec section 11's reminder toggles ───────────
type NotifSettings = {
  remind_7_day: boolean; remind_1_day: boolean; remind_exam_day: boolean
  notify_schedule_change: boolean; notify_cancelled: boolean; notify_marks_published: boolean
}

const NOTIF_GROUPS: { title: string; hint: string; toggles: { key: keyof NotifSettings; label: string; hint: string; icon: string }[] }[] = [
  {
    title: 'Reminders',
    hint: 'Sent automatically in the run-up to an exam.',
    toggles: [
      { key: 'remind_7_day',    label: '7 days before', hint: 'Upcoming Exam reminder', icon: '📢' },
      { key: 'remind_1_day',    label: '1 day before',  hint: 'Exam Tomorrow reminder', icon: '🔔' },
      { key: 'remind_exam_day', label: 'Exam day',      hint: 'Exam Today reminder',    icon: '📝' },
    ],
  },
  {
    title: 'Status Updates',
    hint: 'Sent the moment something about the exam changes.',
    toggles: [
      { key: 'notify_schedule_change', label: 'Schedule changed',  hint: 'Reschedule, venue, or instruction updates', icon: '🔁' },
      { key: 'notify_cancelled',       label: 'Exam cancelled',    hint: 'Exam Cancelled notice',                     icon: '❌' },
      { key: 'notify_marks_published', label: 'Marks published',   hint: 'Results released notice',                  icon: '📊' },
    ],
  },
]

function NotificationSettings({ schoolId }: { schoolId: number }) {
  const [settings, setSettings] = useState<NotifSettings | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    fetch(`/api/exam-notification-settings?school_id=${schoolId}`).then(r => r.json())
      .then(data => setSettings(data))
      .catch(() => {})
  }, [schoolId])

  async function toggle(key: keyof NotifSettings) {
    if (!settings) return
    const prev = settings
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    setSaving(key)
    setSaveError('')
    try {
      const res = await fetch('/api/exam-notification-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, [key]: next[key] }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSettings(prev)
        setSaveError(friendlyExamError(data.error, res.status))
      }
    } catch {
      setSettings(prev)
      setSaveError('Connection error — that change was not saved.')
    } finally { setSaving(null) }
  }

  if (!settings) return <div className="py-12 text-center text-gray-400 text-sm">Loading reminder settings…</div>

  return (
    <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-800 mb-1">Reminder &amp; Notification Settings</h3>
        <p className="text-xs text-gray-400">Choose which automatic notifications are sent to students, parents, and teachers. Turning one off never sends it twice — it simply stops sending.</p>
      </div>

      {saveError && <p className="text-xs font-semibold text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>}

      {NOTIF_GROUPS.map(group => (
        <div key={group.title}>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{group.title}</p>
          <p className="text-[11px] text-gray-300 mb-2">{group.hint}</p>
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
            {group.toggles.map(({ key, label, hint, icon }) => {
              const on = settings[key]
              const isSaving = saving === key
              return (
                <div key={key} className={`flex items-center justify-between gap-4 px-4 py-3 ${on ? 'bg-emerald-50/40' : 'bg-white'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${on ? 'bg-emerald-100' : 'bg-gray-100 grayscale opacity-60'}`}>{icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-700">{label}</p>
                      <p className="text-xs text-gray-400 truncate">{hint}</p>
                    </div>
                  </div>
                  <button onClick={() => toggle(key)} disabled={isSaving} data-testid={`notif-toggle-${key}`}
                    aria-pressed={on}
                    className={`flex items-center gap-2 flex-shrink-0 disabled:opacity-50 ${isSaving ? 'cursor-wait' : 'cursor-pointer'}`}>
                    <span className={`text-[11px] font-bold w-7 text-right ${on ? 'text-emerald-600' : 'text-gray-400'}`}>{isSaving ? '…' : on ? 'On' : 'Off'}</span>
                    <span className={`w-11 h-6 rounded-full transition-colors relative ${on ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Create Exam — 3-step wizard ───────────────────────────────────────────
// Step 1: exam details. Step 2: pick classes/grades, with a live per-class
// subject preview (no manual/custom subject entry — every class gets
// exactly the subjects it actually teaches, from class_subjects). Step 3:
// review exactly what will be created before submitting.
function CreateExamWizard({ schoolId, classes, onDone }: { schoolId: number; classes: ClassOption[]; onDone: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState({
    exam_name: '', exam_type: 'unit_test', instructions: '',
  })
  // "Single Exam" = one exam_date. "Multiple Exam" = a date range, every day
  // in the range gets its own session (e.g. a board exam running Mon-Fri,
  // one subject per day). Exactly one of the two date fields is mandatory
  // depending on which is picked.
  const [examSpan, setExamSpan] = useState<'single' | 'multiple'>('single')
  const [examDate, setExamDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  // "Single exam per day" = one time slot applied to every date above.
  // "Multiple exams per day" = 2+ time slots (e.g. a morning and an
  // afternoon paper on the same day) — mandatorily at least two, with a +
  // button to add more.
  const [dailySessions, setDailySessions] = useState<'single' | 'multiple'>('single')
  const [timeSlots, setTimeSlots] = useState<{ start: string; end: string }[]>([{ start: '', end: '' }])

  function setDailySessionsMode(mode: 'single' | 'multiple') {
    setDailySessions(mode)
    setTimeSlots(mode === 'multiple' ? [{ start: '', end: '' }, { start: '', end: '' }] : [{ start: '', end: '' }])
  }
  function updateTimeSlot(i: number, field: 'start' | 'end', value: string) {
    setTimeSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }
  function addTimeSlot() {
    setTimeSlots(prev => [...prev, { start: '', end: '' }])
  }
  function removeTimeSlot(i: number) {
    setTimeSlots(prev => prev.filter((_, idx) => idx !== i))
  }

  // Every date in [rangeStart, rangeEnd] inclusive — the calendar days this
  // exam actually runs on.
  function dateRangeList(start: string, end: string): string[] {
    const out: string[] = []
    const d = new Date(start + 'T00:00:00')
    const last = new Date(end + 'T00:00:00')
    while (d <= last) {
      out.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
    return out
  }

  const dateList = examSpan === 'single'
    ? (examDate ? [examDate] : [])
    : (rangeStart && rangeEnd && rangeStart <= rangeEnd ? dateRangeList(rangeStart, rangeEnd) : [])

  const sessions = dateList.flatMap(date =>
    timeSlots.map(t => ({ exam_date: date, start_time: t.start || null, end_time: t.end || null }))
  )

  const [selectedClasses, setSelectedClasses] = useState<number[]>([])
  const [subjectPreviews, setSubjectPreviews] = useState<Record<number, ClassSubject[] | 'loading' | 'error'>>({})
  // Exams already scheduled for each selected class — shown as a count badge
  // next to the class, and (filtered to one date) in the "what else is on
  // this day" panel inside the subject/date assignment board below.
  const [classExams, setClassExams] = useState<Record<number, ClassExamRow[] | 'loading' | 'error'>>({})
  // Multi-day exams only: which class_subject ids the admin has dragged onto
  // which date, per class. classId -> date -> class_subject_id[]. A date
  // with no entry here just gets every subject (the original default).
  // classId -> date -> slotIndex -> subjectId. Capacity 1 per slot — a
  // single-exam-per-day date has exactly one slot (only one paper that
  // day); a multiple-exams-per-day date has one slot per configured time
  // range, each independently holding at most one subject.
  const [subjectAssignments, setSubjectAssignments] = useState<Record<number, Record<string, Record<number, number>>>>({})
  const [openDatePanel, setOpenDatePanel] = useState<string | null>(null)
  const [draggedSubject, setDraggedSubject] = useState<{ classId: number; subjectId: number } | null>(null)
  const [studentScope, setStudentScope] = useState<'all' | 'specific'>('all')
  const [classRoster, setClassRoster] = useState<StudentOption[] | 'loading' | null>(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveConflicts, setSaveConflicts] = useState<ExamConflict[]>([])
  const [saveSuccess, setSaveSuccess] = useState('')

  // Specific-student targeting only makes sense with exactly one class
  // selected — spans across sections aren't a supported combination since
  // exam_applicable_students is per-exam-row and each class is its own row.
  useEffect(() => {
    const initial = setTimeout(() => {
      if (studentScope !== 'specific' || selectedClasses.length !== 1) { setClassRoster(null); return }
      setClassRoster('loading')
      const cls = classes.find(c => c.id === selectedClasses[0])
      if (!cls) return
      fetch(`/api/students?school_id=${schoolId}&grade=${encodeURIComponent(cls.grade)}&section=${encodeURIComponent(cls.section)}`)
        .then(r => r.json())
        .then(data => setClassRoster(Array.isArray(data) ? data : (Array.isArray(data?.students) ? data.students : [])))
        .catch(() => setClassRoster([]))
    }, 0)
    return () => clearTimeout(initial)
  }, [studentScope, selectedClasses, classes, schoolId])

  useEffect(() => {
    const initial = setTimeout(() => {
      if (selectedClasses.length !== 1 && studentScope === 'specific') {
        setStudentScope('all'); setSelectedStudentIds([])
      }
    }, 0)
    return () => clearTimeout(initial)
  }, [selectedClasses, studentScope])

  const byGrade = classes.reduce<Record<string, ClassOption[]>>((acc, c) => {
    const key = `Grade ${c.grade}`
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  function toggleClass(id: number) {
    setSelectedClasses(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      if (!prev.includes(id)) {
        if (!(id in subjectPreviews)) loadPreview(id)
        if (!(id in classExams)) loadClassExams(id)
      }
      return next
    })
  }

  function toggleGrade(gradeClasses: ClassOption[]) {
    const ids = gradeClasses.map(c => c.id)
    const allSelected = ids.every(id => selectedClasses.includes(id))
    if (allSelected) {
      setSelectedClasses(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setSelectedClasses(prev => [...new Set([...prev, ...ids])])
      ids.forEach(id => {
        if (!(id in subjectPreviews)) loadPreview(id)
        if (!(id in classExams)) loadClassExams(id)
      })
    }
  }

  async function loadPreview(classId: number) {
    setSubjectPreviews(prev => ({ ...prev, [classId]: 'loading' }))
    try {
      const data = await fetch(`/api/classes/${classId}?school_id=${schoolId}`).then(r => r.json())
      setSubjectPreviews(prev => ({ ...prev, [classId]: Array.isArray(data.subjects) ? data.subjects : [] }))
    } catch {
      setSubjectPreviews(prev => ({ ...prev, [classId]: 'error' }))
    }
  }

  // Existing exams for this class — powers the "N exams scheduled" badge and
  // the per-date "what else is already on this day" panel below.
  async function loadClassExams(classId: number) {
    setClassExams(prev => ({ ...prev, [classId]: 'loading' }))
    try {
      const data = await fetch(`/api/exams?school_id=${schoolId}&class_id=${classId}`).then(r => r.json())
      const rows = Array.isArray(data) ? data.filter((e: ClassExamRow) => e.status !== 'cancelled') : []
      setClassExams(prev => ({ ...prev, [classId]: rows }))
    } catch {
      setClassExams(prev => ({ ...prev, [classId]: 'error' }))
    }
  }

  // Assign one subject to one session (a date + a specific time slot) for
  // one class. Capacity 1: whatever subject already occupied that slot is
  // bumped back to the available pool, and the subject being placed is
  // first removed from wherever else it was previously assigned for that
  // class — a subject only ever occupies one session at a time.
  function assignSubjectToSlot(classId: number, subjectId: number, date: string, slotIndex: number) {
    setSubjectAssignments(prev => {
      const forClass: Record<string, Record<number, number>> = {}
      for (const [d, slots] of Object.entries(prev[classId] ?? {})) {
        const kept: Record<number, number> = {}
        for (const [idx, sid] of Object.entries(slots)) {
          if (sid === subjectId) continue // remove from its old slot
          kept[Number(idx)] = sid
        }
        forClass[d] = kept
      }
      forClass[date] = { ...(forClass[date] ?? {}), [slotIndex]: subjectId }
      return { ...prev, [classId]: forClass }
    })
  }
  function unassignSlot(classId: number, date: string, slotIndex: number) {
    setSubjectAssignments(prev => {
      const forClass = { ...(prev[classId] ?? {}) }
      const slots = { ...(forClass[date] ?? {}) }
      delete slots[slotIndex]
      forClass[date] = slots
      return { ...prev, [classId]: forClass }
    })
  }
  function unassignSubject(classId: number, subjectId: number) {
    setSubjectAssignments(prev => {
      const forClass: Record<string, Record<number, number>> = {}
      for (const [d, slots] of Object.entries(prev[classId] ?? {})) {
        const kept: Record<number, number> = {}
        for (const [idx, sid] of Object.entries(slots)) {
          if (sid === subjectId) continue
          kept[Number(idx)] = sid
        }
        forClass[d] = kept
      }
      return { ...prev, [classId]: forClass }
    })
  }

  function classLabel(id: number) {
    const c = classes.find(x => x.id === id)
    return c ? `${c.grade}-${c.section}` : `#${id}`
  }

  const dateValid = examSpan === 'single' ? examDate.length > 0 : dateList.length > 0
  // Two sessions on the same day must never share or overlap a time range —
  // same start+end, or one starting inside the other, both get rejected the
  // same way (the identical-time case is just the fully-overlapping case).
  function slotsOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
    if (!a.start || !a.end || !b.start || !b.end) return false
    return a.start < b.end && b.start < a.end
  }
  const overlappingSlotIndices = new Set<number>()
  if (dailySessions === 'multiple') {
    for (let i = 0; i < timeSlots.length; i++) {
      for (let j = i + 1; j < timeSlots.length; j++) {
        if (slotsOverlap(timeSlots[i], timeSlots[j])) { overlappingSlotIndices.add(i); overlappingSlotIndices.add(j) }
      }
    }
  }
  const timeSlotsValid = dailySessions === 'single'
    ? (!timeSlots[0].start || !timeSlots[0].end || timeSlots[0].start < timeSlots[0].end)
    : (timeSlots.length >= 2 && timeSlots.every(t => t.start && t.end && t.start < t.end) && overlappingSlotIndices.size === 0)
  const step1Valid = form.exam_name.trim().length > 0 && dateValid && timeSlotsValid
  const step2Valid = selectedClasses.length > 0 && (studentScope === 'all' || selectedStudentIds.length > 0)
  // A class "uses the board" once at least one subject has been dragged
  // anywhere for it — from then on every slot for that class is exactly
  // what was dragged there (an untouched slot means 0 subjects, not "all of
  // them"). A class the admin never touched keeps the original default:
  // every one of its subjects, on every session. Lets a plain single-date
  // exam stay a one-click flow while still allowing the same picking UI.
  function classUsesBoard(classId: number): boolean {
    return Object.values(subjectAssignments[classId] ?? {}).some(slots => Object.keys(slots).length > 0)
  }
  const totalSubjectSlots = selectedClasses.reduce((sum, id) => {
    if (classUsesBoard(id)) {
      return sum + Object.values(subjectAssignments[id] ?? {}).flatMap(slots => Object.values(slots)).length
    }
    const p = subjectPreviews[id]
    return sum + (Array.isArray(p) ? p.length : 0) * Math.max(sessions.length, 1)
  }, 0)
  const classesWithNoSubjects = selectedClasses.filter(id => Array.isArray(subjectPreviews[id]) && (subjectPreviews[id] as ClassSubject[]).length === 0)

  async function handleSubmit() {
    setSaving(true); setSaveError(''); setSaveConflicts([])
    try {
      // A class the admin never dragged a subject for keeps the original
      // default (every subject, every session) — send nothing for it at all,
      // same as before this feature existed. A class that was touched sends
      // an entry for EVERY session, even an empty one for a slot left blank
      // on purpose, so the backend can tell "used, intentionally empty"
      // apart from "never used, fall back to every subject".
      const subject_assignments = selectedClasses
        .filter(classId => classUsesBoard(classId))
        .flatMap(classId =>
          dateList.flatMap(date =>
            timeSlots.map((slot, slotIndex) => {
              const subjectId = subjectAssignments[classId]?.[date]?.[slotIndex]
              return {
                class_id: classId,
                exam_date: date,
                start_time: slot.start || null,
                class_subject_ids: subjectId != null ? [subjectId] : [],
              }
            })
          )
        )
      const res = await fetch('/api/exams/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          class_ids: selectedClasses,
          exam_name: form.exam_name.trim(),
          exam_type: form.exam_type,
          sessions,
          subject_assignments,
          instructions: form.instructions.trim() || null,
          student_scope: studentScope,
          student_ids: studentScope === 'specific' ? selectedStudentIds : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(res.status === 409 ? (data.error || 'Failed to schedule exam') : friendlyExamError(data.error, res.status))
        if (Array.isArray(data.conflicts)) setSaveConflicts(data.conflicts)
        setSaving(false)
        return
      }
      setSaveSuccess(`${data.exams_created} exam(s) created across ${selectedClasses.length} class(es), ${data.notified} student, parent, and teacher notification(s) sent.`)
      setTimeout(onDone, 1400)
    } catch {
      setSaveError('Connection error')
    }
    setSaving(false)
  }

  if (saveSuccess) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-8 text-center">
        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <p className="font-bold text-emerald-800">{saveSuccess}</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { n: 1, label: 'Exam Details' },
          { n: 2, label: 'Classes & Subjects' },
          { n: 3, label: 'Review & Create' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center gap-2 ${i > 0 ? 'flex-1' : ''}`}>
              {i > 0 && <div className={`h-0.5 flex-1 ${step > i ? 'bg-indigo-500' : 'bg-gray-200'}`} />}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                step === n ? 'bg-indigo-600 text-white' : step > n ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-muted-foreground'
              }`}>
                {step > n ? '✓' : n}
              </div>
              <span className={`text-xs font-semibold whitespace-nowrap ${step === n ? 'text-indigo-700' : 'text-muted-foreground'}`}>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div>
            <label htmlFor="exam-name" className="block text-xs font-semibold text-gray-600 mb-1">Exam Name *</label>
            <input id="exam-name" type="text" placeholder="e.g. Half Yearly Examination 2025" value={form.exam_name}
              onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))}
              data-testid="exam-name-input"
              className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label htmlFor="exam-type" className="block text-xs font-semibold text-gray-600 mb-1">Exam Type *</label>
            <select id="exam-type" value={form.exam_type} onChange={e => setForm(f => ({ ...f, exam_type: e.target.value }))}
              className="w-full max-w-xs border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Single Exam (one date) vs Multiple Exam (a date range) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Exam Duration *</label>
            <div className="flex gap-2 mb-3">
              {([
                { key: 'single',   label: 'Single Exam' },
                { key: 'multiple', label: 'Multiple Exam' },
              ] as const).map(({ key, label }) => (
                <label key={key} data-testid={`exam-span-${key}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border cursor-pointer ${examSpan === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                  <input type="radio" name="exam-span" value={key} checked={examSpan === key} onChange={() => setExamSpan(key)} className="accent-indigo-600" />
                  {label}
                </label>
              ))}
            </div>
            {examSpan === 'single' ? (
              <div className="max-w-xs">
                <label htmlFor="exam-date" className="block text-xs font-semibold text-gray-600 mb-1">Exam Date *</label>
                <input id="exam-date" type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
                  data-testid="exam-date-input"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label htmlFor="exam-range-start" className="block text-xs font-semibold text-gray-600 mb-1">Start Date *</label>
                  <input id="exam-range-start" type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                    data-testid="exam-range-start-input"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label htmlFor="exam-range-end" className="block text-xs font-semibold text-gray-600 mb-1">End Date *</label>
                  <input id="exam-range-end" type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} min={rangeStart || undefined}
                    data-testid="exam-range-end-input"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                {rangeStart && rangeEnd && rangeStart > rangeEnd && (
                  <p className="col-span-2 text-xs text-red-500">End date must be on or after start date.</p>
                )}
                {dateList.length > 0 && (
                  <p className="col-span-2 text-xs text-gray-400">{dateList.length} day(s): {dateList[0]} → {dateList[dateList.length - 1]}</p>
                )}
              </div>
            )}
          </div>

          {/* Single exam per day vs Multiple exams per day */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Sessions Per Day *</label>
            <div className="flex gap-2 mb-3">
              {([
                { key: 'single',   label: 'Single Exam Per Day' },
                { key: 'multiple', label: 'Multiple Exams Per Day' },
              ] as const).map(({ key, label }) => (
                <label key={key} data-testid={`exam-daily-sessions-${key}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border cursor-pointer ${dailySessions === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                  <input type="radio" name="daily-sessions" value={key} checked={dailySessions === key} onChange={() => setDailySessionsMode(key)} className="accent-indigo-600" />
                  {label}
                </label>
              ))}
            </div>
            <div className="space-y-2">
              {timeSlots.map((slot, i) => {
                const overlaps = overlappingSlotIndices.has(i)
                return (
                <div key={i} className="flex items-center gap-3">
                  <div className="grid grid-cols-2 gap-3 flex-1 max-w-sm">
                    <div>
                      {i === 0 && <label className="block text-xs font-semibold text-gray-600 mb-1">Start Time{dailySessions === 'multiple' ? ' *' : ''}</label>}
                      <input type="time" value={slot.start} onChange={e => updateTimeSlot(i, 'start', e.target.value)}
                        data-testid={`exam-start-time-input-${i}`}
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${overlaps ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'}`} />
                    </div>
                    <div>
                      {i === 0 && <label className="block text-xs font-semibold text-gray-600 mb-1">End Time{dailySessions === 'multiple' ? ' *' : ''}</label>}
                      <input type="time" value={slot.end} onChange={e => updateTimeSlot(i, 'end', e.target.value)}
                        data-testid={`exam-end-time-input-${i}`}
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${overlaps ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'}`} />
                    </div>
                  </div>
                  {dailySessions === 'multiple' && timeSlots.length > 2 && i >= 2 && (
                    <button onClick={() => removeTimeSlot(i)} className="text-xs text-red-400 hover:text-red-600 mt-4">remove</button>
                  )}
                  {slot.start && slot.end && slot.start >= slot.end && (
                    <p className="text-xs text-red-500 mt-4">End must be after start.</p>
                  )}
                  {overlaps && !(slot.start && slot.end && slot.start >= slot.end) && (
                    <p className="text-xs text-red-500 mt-4" data-testid={`exam-session-overlap-${i}`}>
                      {timeSlots.some((t, j) => j !== i && t.start === slot.start && t.end === slot.end)
                        ? 'Same as another session — times must be different.'
                        : 'Overlaps another session.'}
                    </p>
                  )}
                </div>
              )})}
              {dailySessions === 'multiple' && (
                <button onClick={addTimeSlot} data-testid="exam-add-session-btn"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  + Add another session
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Instructions</label>
            <textarea rows={2} placeholder="e.g. Bring your own calculator and ruler" value={form.instructions}
              onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>
          <p className="text-xs text-gray-400">Marks entry opens automatically for subject teachers once this date passes — no manual unlock needed.</p>
          <div className="flex justify-end pt-2">
            <button onClick={() => setStep(2)} disabled={!step1Valid} data-testid="wizard-next-1"
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-bold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
              Next: Pick Classes →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1">Select Classes *</h3>
            <p className="text-xs text-muted-foreground mb-3">Pick one class, several, or a whole grade — every class gets exactly the subjects it teaches.</p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {Object.entries(byGrade).sort().map(([grade, gradeClasses]) => (
                <div key={grade}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-gray-500">{grade}</p>
                    <button className="text-xs text-indigo-500 font-semibold" onClick={() => toggleGrade(gradeClasses)}>
                      {gradeClasses.every(c => selectedClasses.includes(c.id)) ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {gradeClasses.map(c => (
                      <button key={c.id} onClick={() => toggleClass(c.id)} data-testid={`exam-class-${c.id}`}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          selectedClasses.includes(c.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                        }`}>
                        {c.grade}-{c.section}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1">Subject Preview</h3>
            <p className="text-xs text-muted-foreground mb-3">Exactly what each selected class already teaches — nothing custom or shared across grades.</p>
            {selectedClasses.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-10">Select a class to preview its subjects</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {selectedClasses.map(id => {
                  const preview = subjectPreviews[id]
                  return (
                    <div key={id} className="border border-gray-100 rounded-md p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-gray-700">{classLabel(id)}</p>
                          <span className="text-[9px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-1.5 py-0.5" data-testid={`exam-count-badge-${id}`}>
                            {classExams[id] === 'loading' ? '…' : Array.isArray(classExams[id]) ? `${(classExams[id] as ClassExamRow[]).length} exam${(classExams[id] as ClassExamRow[]).length !== 1 ? 's' : ''} scheduled` : '—'}
                          </span>
                        </div>
                        <button onClick={() => toggleClass(id)} className="text-[10px] text-red-400 hover:text-red-600">remove</button>
                      </div>
                      {preview === 'loading' ? (
                        <p className="text-xs text-gray-300">Loading…</p>
                      ) : preview === 'error' ? (
                        <p className="text-xs text-red-400">Failed to load subjects</p>
                      ) : Array.isArray(preview) && preview.length === 0 ? (
                        <p className="text-xs text-amber-500">No subjects assigned to this class yet — it will be skipped for marks until subjects exist.</p>
                      ) : Array.isArray(preview) ? (
                        <div className="flex flex-wrap gap-1">
                          {preview.map(s => (
                            <span key={s.id} className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{s.subject_name}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {dateList.length > 0 && selectedClasses.length > 0 && (
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Assign Subjects to Dates</h3>
              <p className="text-xs text-gray-400 mb-3">
                {dailySessions === 'single'
                  ? 'Drag one subject onto each date — only one exam is conducted that day, so each date takes exactly one subject.'
                  : 'Each date shows its available time slots — drag one subject into each slot, since only one exam is conducted per slot.'}
                {' '}Click a date to see what else is already scheduled that day. Leave a class untouched here and it keeps getting every one of its subjects, same as before — drag at least one subject for a class to switch it to picking exactly which subjects are examined on which slot. Works the same way for every class selected.
              </p>
              <div className="space-y-5">
                {selectedClasses.map(classId => {
                  const preview = subjectPreviews[classId]
                  const allSubjects = Array.isArray(preview) ? preview : []
                  const assignedForClass = subjectAssignments[classId] ?? {}
                  const assignedIds = new Set(Object.values(assignedForClass).flatMap(slots => Object.values(slots)))
                  const availableSubjects = allSubjects.filter(s => !assignedIds.has(s.id))
                  const classExamRows = classExams[classId]

                  return (
                    <div key={classId} className="border border-gray-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-gray-700 mb-3">{classLabel(classId)}</p>
                      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
                        <div
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => { if (draggedSubject?.classId === classId) { unassignSubject(classId, draggedSubject.subjectId); setDraggedSubject(null) } }}
                          className="border border-dashed border-gray-200 rounded-xl p-2.5 min-h-[80px]">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Available Subjects</p>
                          <div className="flex flex-wrap gap-1.5">
                            {availableSubjects.length === 0 ? (
                              <p className="text-[10px] text-gray-300">{allSubjects.length === 0 ? 'No subjects for this class' : 'All subjects assigned'}</p>
                            ) : availableSubjects.map(s => (
                              <span key={s.id} draggable
                                onDragStart={() => setDraggedSubject({ classId, subjectId: s.id })}
                                onDragEnd={() => setDraggedSubject(null)}
                                data-testid={`exam-drag-subject-${classId}-${s.id}`}
                                className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded-lg cursor-grab active:cursor-grabbing font-semibold">
                                {s.subject_name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {dateList.map(date => {
                            const existingOnDate = Array.isArray(classExamRows) ? classExamRows.filter(e => e.exam_date?.slice(0, 10) === date) : []
                            const isOpen = openDatePanel === `${classId}:${date}`
                            return (
                              <div key={date} className="border border-gray-200 rounded-xl p-2">
                                <button onClick={() => setOpenDatePanel(isOpen ? null : `${classId}:${date}`)} data-testid={`exam-date-cell-${classId}-${date}`}
                                  className="w-full text-left">
                                  <p className="text-[10px] font-bold text-gray-700 hover:text-indigo-600">
                                    {new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                  </p>
                                  {existingOnDate.length > 0 && (
                                    <p className="text-[9px] text-amber-600">{existingOnDate.length} other exam{existingOnDate.length !== 1 ? 's' : ''} that day</p>
                                  )}
                                </button>
                                {isOpen && (
                                  <div className="mt-1.5 mb-1.5 bg-gray-50 border border-gray-100 rounded-lg p-1.5">
                                    <p className="text-[9px] font-semibold text-gray-400 uppercase mb-1">Scheduled on this date</p>
                                    {classExamRows === 'loading' ? (
                                      <p className="text-[9px] text-gray-300">Loading…</p>
                                    ) : existingOnDate.length === 0 ? (
                                      <p className="text-[9px] text-gray-300">Nothing else scheduled</p>
                                    ) : (
                                      <ul className="space-y-0.5">
                                        {existingOnDate.map(e => (
                                          <li key={e.id} className="text-[9px] text-gray-600">{e.exam_name}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                                <div className="space-y-1 mt-1.5">
                                  {timeSlots.map((slot, slotIndex) => {
                                    const subjectId = assignedForClass[date]?.[slotIndex]
                                    const subject = subjectId != null ? allSubjects.find(s => s.id === subjectId) : undefined
                                    const slotLabel = slot.start && slot.end ? `${slot.start}–${slot.end}` : dailySessions === 'single' ? 'This exam' : `Session ${slotIndex + 1}`
                                    return (
                                      <div key={slotIndex}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={() => { if (draggedSubject?.classId === classId) { assignSubjectToSlot(classId, draggedSubject.subjectId, date, slotIndex); setDraggedSubject(null) } }}
                                        data-testid={`exam-date-slot-${classId}-${date}-${slotIndex}`}
                                        className={`border rounded-lg px-2 py-1.5 flex items-center justify-between gap-1 min-h-[30px] ${subject ? 'border-emerald-200 bg-emerald-50' : 'border-dashed border-gray-200'}`}>
                                        <span className="text-[9px] font-semibold text-gray-400">{slotLabel}</span>
                                        {subject ? (
                                          <span className="flex items-center gap-1 bg-white border border-emerald-300 text-emerald-700 pl-1.5 pr-1 py-0.5 rounded">
                                            <span draggable
                                              onDragStart={() => setDraggedSubject({ classId, subjectId: subject.id })}
                                              onDragEnd={() => setDraggedSubject(null)}
                                              data-testid={`exam-date-subject-${classId}-${date}-${slotIndex}`}
                                              title="Drag to move, or click × to remove"
                                              className="text-[9px] cursor-grab active:cursor-grabbing font-semibold">
                                              {subject.subject_name}
                                            </span>
                                            <button type="button" onClick={() => unassignSlot(classId, date, slotIndex)}
                                              data-testid={`exam-date-subject-remove-${classId}-${date}-${slotIndex}`}
                                              title="Remove — wrong subject assigned?"
                                              className="text-emerald-500 hover:text-red-600 hover:bg-red-50 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none text-[10px] font-bold">
                                              ×
                                            </button>
                                          </span>
                                        ) : (
                                          <span className="text-[9px] text-gray-300">Drop here</span>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {selectedClasses.length === 1 && (
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Applicable Students</h3>
              <p className="text-xs text-gray-400 mb-3">By default every active student in {classLabel(selectedClasses[0])} is included. Narrow it to specific students when needed (e.g. a retest).</p>
              <div className="flex gap-2 mb-3">
                {(['all', 'specific'] as const).map(s => (
                  <button key={s} onClick={() => setStudentScope(s)} data-testid={`exam-student-scope-${s}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${studentScope === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {s === 'all' ? 'Whole Class/Section' : 'Specific Students'}
                  </button>
                ))}
              </div>
              {studentScope === 'specific' && (
                classRoster === 'loading' ? (
                  <p className="text-xs text-gray-300">Loading students…</p>
                ) : Array.isArray(classRoster) ? (
                  <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                    {classRoster.map(s => (
                      <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selectedStudentIds.includes(s.id)}
                          onChange={() => setSelectedStudentIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])} />
                        <span className="font-semibold text-gray-700">{s.name}</span>
                        <span className="text-gray-400">{s.school_roll_number ?? s.roll_number}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="text-xs text-red-400">Failed to load students</p>
              )}
              {studentScope === 'specific' && selectedStudentIds.length === 0 && (
                <p className="text-xs text-amber-500 mt-2">Select at least one student.</p>
              )}
            </div>
          )}

          <div className="lg:col-span-2 flex justify-between pt-1">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700">← Back</button>
            <button onClick={() => setStep(3)} disabled={!step2Valid} data-testid="wizard-next-2"
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-bold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Review</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Exam:</span> <span className="font-semibold text-gray-800">{form.exam_name}</span></div>
              <div><span className="text-gray-400">Type:</span> <span className="font-semibold text-gray-800">{EXAM_TYPE_LABELS[form.exam_type]}</span></div>
              <div><span className="text-gray-400">Students:</span> <span className="font-semibold text-gray-800">{studentScope === 'all' ? 'Whole class/section' : `${selectedStudentIds.length} specific student(s)`}</span></div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              {dateList.length} day{dateList.length !== 1 ? 's' : ''} × {timeSlots.length} session{timeSlots.length !== 1 ? 's' : ''}/day = {sessions.length} session(s) per class — which subject is examined on each:
            </p>
            <div className="space-y-2">
              {dateList.map(date => (
                <div key={date} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-1.5">
                    <p className="text-xs font-bold text-gray-700">
                      {new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {timeSlots.map((slot, slotIndex) => (
                      <div key={slotIndex} className="px-3 py-2">
                        <p className="text-[10px] font-semibold text-gray-400 mb-1">
                          {slot.start && slot.end ? `${slot.start}–${slot.end}` : dateList.length === 1 && timeSlots.length === 1 ? 'Exam time' : `Session ${slotIndex + 1}`}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedClasses.map(classId => {
                            const allSubjects = Array.isArray(subjectPreviews[classId]) ? (subjectPreviews[classId] as ClassSubject[]) : []
                            const subjectId = subjectAssignments[classId]?.[date]?.[slotIndex]
                            const usesBoard = classUsesBoard(classId)
                            const subjectName = usesBoard
                              ? (subjectId != null ? allSubjects.find(s => s.id === subjectId)?.subject_name ?? 'Unknown subject' : null)
                              : `All ${allSubjects.length} subject${allSubjects.length !== 1 ? 's' : ''}`
                            return (
                              <span key={classId}
                                className={`text-[10px] px-2 py-1 rounded-lg font-semibold border ${subjectName ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                                {classLabel(classId)}: {subjectName ?? 'no subject (skipped)'}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">{selectedClasses.length} class(es), {totalSubjectSlots} total subject slot(s) will be created:</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedClasses.map(id => (
                <span key={id} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded-lg font-semibold">
                  {classLabel(id)} · {Array.isArray(subjectPreviews[id]) ? (subjectPreviews[id] as ClassSubject[]).length : '…'} subjects
                </span>
              ))}
            </div>
            {classesWithNoSubjects.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">⚠ {classesWithNoSubjects.map(classLabel).join(', ')} have no subjects assigned — they&rsquo;ll be created but can&rsquo;t collect marks until Class Management assigns subjects.</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-md p-4">
            <p className="text-xs font-bold text-blue-800 mb-2">What happens next:</p>
            <ul className="space-y-1 text-xs text-blue-700">
              <li>✓ Every student and their parent(s) in these classes are notified now</li>
              <li>✓ Each class teacher and subject teacher is notified once marks entry opens — subjects are already matched to their real teacher from Class Management</li>
              <li>✓ Marks entry opens automatically the day after each session&rsquo;s own date{sessions.length > 1 ? ` — the last one is ${new Date(dateList[dateList.length - 1]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : dateList[0] ? ` (${new Date(dateList[0]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : ''}</li>
              <li>✓ Results reach students/parents only after the class teacher reviews and you release them</li>
            </ul>
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-600">
              <p className="font-semibold">{saveError}</p>
              {saveConflicts.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-red-500 list-disc list-inside">
                  {saveConflicts.map(c => (
                    <li key={c.exam_id}>
                      {c.exam_name} — Grade {c.grade}-{c.section} on {new Date(c.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {c.start_time ? ` at ${c.start_time}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-between pt-1">
            <button onClick={() => setStep(2)} className="px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700">← Back</button>
            <button onClick={handleSubmit} disabled={saving} data-testid="exam-create-submit"
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors">
              {saving ? 'Creating…' : `Create ${selectedClasses.length} Exam(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Manage Exams — edit, reschedule, cancel, delete + filters ────────────
type ManageExamRow = ExamListRow & {
  start_time: string | null; end_time: string | null; room: string | null
  class_id: number; student_scope: string; assigned_teacher_id: number | null
  assigned_teacher_name: string | null; subjects: string[]
  created_by_name: string
}

function ManageExams({ schoolId }: { schoolId: number }) {
  const [exams, setExams] = useState<ManageExamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [editing, setEditing] = useState<ManageExamRow | null>(null)
  const [cancelling, setCancelling] = useState<ManageExamRow | null>(null)
  const [deleting, setDeleting] = useState<ManageExamRow | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionConflicts, setActionConflicts] = useState<ExamConflict[]>([])

  async function load() {
    setLoading(true)
    try {
      const data = await fetch(`/api/exams?school_id=${schoolId}`).then(r => r.json())
      setExams(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }
  useEffect(() => {
    const initial = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(initial)
  }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  const grades = Array.from(new Set(exams.map(e => e.grade))).sort()
  const sections = Array.from(new Set(exams.filter(e => !filterGrade || e.grade === filterGrade).map(e => e.section))).sort()
  const subjects = Array.from(new Set(exams.flatMap(e => e.subjects ?? []))).sort()
  const teacherOptions = Array.from(
    new Map(exams.filter(e => e.assigned_teacher_id).map(e => [e.assigned_teacher_id, e.assigned_teacher_name])).entries()
  )
  const filtered = exams.filter(e =>
    (!filterType || e.exam_type === filterType) &&
    (!filterGrade || e.grade === filterGrade) &&
    (!filterSection || e.section === filterSection) &&
    (!filterSubject || (e.subjects ?? []).includes(filterSubject)) &&
    (!filterTeacher || String(e.assigned_teacher_id) === filterTeacher) &&
    (!filterStatus || e.status === filterStatus) &&
    (!filterDate || e.exam_date?.slice(0, 10) === filterDate)
  )

  async function handleCancel(exam: ManageExamRow, reason: string) {
    setActionError('')
    try {
      const res = await fetch(`/api/exams/${exam.id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, reason: reason || null }),
      })
      const data = await res.json()
      if (!res.ok) { setActionError(friendlyExamError(data.error, res.status)); return }
      setCancelling(null)
      await load()
    } catch { setActionError('Connection error') }
  }

  async function handleDelete(exam: ManageExamRow) {
    setActionError('')
    try {
      const res = await fetch(`/api/exams/${exam.id}?school_id=${schoolId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setActionError(friendlyExamError(data.error, res.status)); return }
      setDeleting(null)
      await load()
    } catch { setActionError('Connection error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} data-testid="manage-exam-filter-type"
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Types</option>
          {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterGrade} onChange={e => { setFilterGrade(e.target.value); setFilterSection('') }}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Grades</option>
          {grades.map(g => <option key={g} value={g}>Grade {g}</option>)}
        </select>
        <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Sections</option>
          {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
        </select>
        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Teachers</option>
          {teacherOptions.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} data-testid="manage-exam-filter-date"
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs" />
        {(filterType || filterGrade || filterSection || filterSubject || filterTeacher || filterStatus || filterDate) && (
          <button onClick={() => { setFilterType(''); setFilterGrade(''); setFilterSection(''); setFilterSubject(''); setFilterTeacher(''); setFilterStatus(''); setFilterDate('') }}
            className="text-xs font-semibold text-gray-400 hover:text-gray-600 px-2">Clear filters</button>
        )}
      </div>

      {actionError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
        <p className="font-semibold">{actionError}</p>
        {actionConflicts.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
            {actionConflicts.map(c => (
              <li key={c.exam_id}>{c.exam_name} — Grade {c.grade}-{c.section} on {new Date(c.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{c.start_time ? ` at ${c.start_time}` : ''}</li>
            ))}
          </ul>
        )}
      </div>}

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading exams...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center">
          <p className="text-sm text-gray-400">No exams match these filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Exam</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Class</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Date &amp; Time</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Room</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-800 text-xs">{e.exam_name}</p>
                      <p className="text-[10px] text-gray-400">{EXAM_TYPE_LABELS[e.exam_type] ?? e.exam_type}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">Gr.{e.grade}-{e.section}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {e.exam_date ? new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      {e.start_time ? ` · ${e.start_time}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{e.room || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_LABELS[e.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[e.status]?.label ?? e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {['scheduled', 'collecting'].includes(e.status) && (
                        <>
                          <button onClick={() => { setActionError(''); setActionConflicts([]); setEditing(e) }} data-testid={`manage-exam-edit-${e.id}`}
                            className="text-xs font-semibold text-indigo-600 hover:underline mr-3">Edit / Reschedule</button>
                          <button onClick={() => { setActionError(''); setCancelling(e) }} data-testid={`manage-exam-cancel-${e.id}`}
                            className="text-xs font-semibold text-amber-600 hover:underline mr-3">Cancel</button>
                          <button onClick={() => { setActionError(''); setDeleting(e) }} data-testid={`manage-exam-delete-${e.id}`}
                            className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <EditExamModal
          exam={editing} schoolId={schoolId}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
          onConflict={(msg, conflicts) => { setActionError(msg); setActionConflicts(conflicts) }}
        />
      )}

      {cancelling && (
        <ConfirmModal
          title={`Cancel "${cancelling.exam_name}"?`}
          body="Every student, their parent(s), and the class teacher will be notified this exam is off. This cannot be undone."
          confirmLabel="Cancel Exam" confirmColor="bg-amber-600 hover:bg-amber-700"
          onCancel={() => setCancelling(null)}
          onConfirm={(reason) => handleCancel(cancelling, reason ?? '')}
          withReason
        />
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete "${deleting.exam_name}"?`}
          body="This permanently removes the exam and its subjects. No one has been notified about it yet, so nothing needs to be announced. This cannot be undone."
          confirmLabel="Delete" confirmColor="bg-red-600 hover:bg-red-700"
          onCancel={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting)}
        />
      )}
    </div>
  )
}

function ConfirmModal({ title, body, confirmLabel, confirmColor, onCancel, onConfirm, withReason }: {
  title: string; body: string; confirmLabel: string; confirmColor: string
  onCancel: () => void; onConfirm: (reason?: string) => void; withReason?: boolean
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4">
        <h3 className="font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{body}</p>
        {withReason && (
          <textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-gray-500">Never mind</button>
          <button onClick={async () => { setBusy(true); await onConfirm(reason); setBusy(false) }} disabled={busy}
            className={`px-4 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-50 ${confirmColor}`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditExamModal({ exam, schoolId, onClose, onSaved, onConflict }: {
  exam: ManageExamRow; schoolId: number; onClose: () => void; onSaved: () => void
  onConflict: (msg: string, conflicts: ExamConflict[]) => void
}) {
  const [form, setForm] = useState({
    exam_name: exam.exam_name,
    exam_type: exam.exam_type,
    exam_date: exam.exam_date ? exam.exam_date.slice(0, 10) : '',
    start_time: exam.start_time ? exam.start_time.slice(0, 5) : '',
    end_time: exam.end_time ? exam.end_time.slice(0, 5) : '',
    instructions: '' as string,
  })
  const [detailLoaded, setDetailLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // The Manage Exams list row doesn't carry instructions (kept out of the
    // list query — long free text, not needed to browse the table); fetch
    // the full detail once when the edit modal opens so an edit never
    // silently blanks out existing instructions.
    fetch(`/api/exams/${exam.id}?school_id=${schoolId}`).then(r => r.json())
      .then(data => {
        setForm(f => ({ ...f, instructions: data.instructions ?? '' }))
        setDetailLoaded(true)
      })
      .catch(() => setDetailLoaded(true))
  }, [exam.id, schoolId])

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          exam_name: form.exam_name.trim() || undefined,
          exam_type: form.exam_type || undefined,
          exam_date: form.exam_date || undefined,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          instructions: form.instructions.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) { onConflict(data.error, data.conflicts ?? []); onClose(); return }
        setError(friendlyExamError(data.error, res.status)); setSaving(false); return
      }
      onSaved()
    } catch { setError('Connection error'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 my-8">
        <h3 className="font-bold text-gray-900">Edit / Reschedule Exam</h3>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Name</label>
          <input type="text" value={form.exam_name} onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type</label>
          <select value={form.exam_type} onChange={e => setForm(f => ({ ...f, exam_type: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
            <input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))}
              data-testid="edit-exam-date-input"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Start</label>
            <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">End</label>
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Instructions</label>
          <textarea rows={2} value={form.instructions} disabled={!detailLoaded}
            onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none disabled:bg-gray-50" />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-500">Cancel</button>
          <button onClick={handleSave} disabled={saving || !detailLoaded} data-testid="edit-exam-save"
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Results & Release ──────────────────────────────────────────────────────
function ResultsAndRelease({ schoolId }: { schoolId: number }) {
  const [examList, setExamList] = useState<ExamListRow[]>([])
  const [examsLoading, setExamsLoading] = useState(false)
  const [selectedExam, setSelectedExam] = useState<ExamListRow | null>(null)
  const [marksData, setMarksData] = useState<MarksData | null>(null)
  const [marksLoading, setMarksLoading] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState('')
  const [releaseConfirm, setReleaseConfirm] = useState(false)

  useEffect(() => { loadExamList() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadExamList() {
    setExamsLoading(true)
    try {
      const data = await fetch(`/api/exams?school_id=${schoolId}`).then(r => r.json())
      setExamList(Array.isArray(data) ? data : [])
    } finally { setExamsLoading(false) }
  }

  async function loadMarks(exam: ExamListRow) {
    setSelectedExam(exam); setMarksLoading(true); setMarksData(null); setReleaseError(''); setReleaseConfirm(false)
    try {
      const data = await fetch(`/api/exams/${exam.id}/marks?school_id=${schoolId}`).then(r => r.json())
      if (data.exam) setMarksData(data)
    } finally { setMarksLoading(false) }
  }

  async function handleRelease() {
    if (!selectedExam) return
    setReleasing(true); setReleaseError('')
    try {
      const res = await fetch(`/api/exams/${selectedExam.id}/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId }),
      })
      const data = await res.json()
      if (!res.ok) { setReleaseError(friendlyExamError(data.error, res.status)); setReleasing(false); return }
      await loadExamList()
      await loadMarks({ ...selectedExam, status: 'released' })
    } catch { setReleaseError('Connection error') }
    setReleasing(false)
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="w-full flex-shrink-0 lg:w-60">
        {examsLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading exams...</div>
        ) : examList.length === 0 ? (
          <div className="bg-white rounded-md border border-gray-200 py-10 text-center">
            <p className="text-sm text-muted-foreground">No exams scheduled yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(
              examList.reduce<Record<string, ExamListRow[]>>((acc, e) => {
                const k = EXAM_TYPE_LABELS[e.exam_type] ?? e.exam_type
                if (!acc[k]) acc[k] = []
                acc[k].push(e)
                return acc
              }, {})
            ).map(([type, exams]) => (
              <div key={type} className="bg-white rounded-md border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{type}</span>
                </div>
                {exams.map(e => (
                  <button key={e.id} onClick={() => loadMarks(e)} data-testid={`exam-list-item-${e.id}`}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-b-0 transition-colors ${selectedExam?.id === e.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-50'}`}>
                    <p className={`text-xs font-semibold truncate ${selectedExam?.id === e.id ? 'text-indigo-700' : 'text-gray-800'}`}>{e.exam_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Gr.{e.grade}-{e.section} · {new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${STATUS_LABELS[e.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[e.status]?.label ?? e.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{e.submitted_subjects}/{e.total_subjects} subjects</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {!selectedExam ? (
          <div className="bg-white rounded-md border border-gray-200 py-24 text-center">
            <p className="text-muted-foreground text-sm">Select an exam to view results</p>
          </div>
        ) : marksLoading ? (
          <div className="bg-white rounded-md border border-gray-200 py-24 text-center">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : !marksData ? (
          <div className="bg-white rounded-md border border-gray-200 py-24 text-center">
            <p className="text-muted-foreground text-sm">No marks entered yet for this exam.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {marksData.exam.status === 'teacher_reviewed' && (
              <div className="bg-violet-50 border border-violet-200 rounded-md p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-violet-800">Reviewed by the class teacher — ready to release</p>
                  <p className="text-xs text-violet-600 mt-0.5">Releasing sends results to every student and parent in this class. This cannot be undone.</p>
                </div>
                {!releaseConfirm ? (
                  <button onClick={() => setReleaseConfirm(true)} data-testid="exam-release-button"
                    className="px-5 py-2.5 bg-violet-600 text-white rounded-md text-sm font-bold hover:bg-violet-700 transition-colors flex-shrink-0">
                    Release to Students &amp; Parents
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setReleaseConfirm(false)} className="px-3 py-2 text-xs font-semibold text-gray-500">Cancel</button>
                    <button onClick={handleRelease} disabled={releasing} data-testid="exam-release-confirm"
                      className="px-5 py-2.5 bg-violet-600 text-white rounded-md text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                      {releasing ? 'Releasing…' : 'Confirm Release'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {releaseError && <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-600">{releaseError}</div>}
            {marksData.exam.status === 'released' && <AckTracker examId={marksData.exam.id} schoolId={schoolId} />}
            <ExamAnalysisPanel data={marksData} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Parent acknowledgement tracker ─────────────────────────────────────────
function AckTracker({ examId, schoolId }: { examId: number; schoolId: number }) {
  const [data, setData] = useState<{ total: number; acknowledged: number; unacknowledged: number; students: AckRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [nudging, setNudging] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const d = await fetch(`/api/exams/${examId}/acknowledgements?school_id=${schoolId}`).then(r => r.json())
      if (d.students) setData(d)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const initial = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(initial)
  }, [examId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function nudge(studentId: number) {
    setNudging(studentId)
    try {
      await fetch(`/api/exams/${examId}/nudge-parent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, student_id: studentId }),
      })
      await load()
    } finally { setNudging(null) }
  }

  if (loading) return <div className="bg-white rounded-md border border-gray-200 py-8 text-center text-sm text-muted-foreground">Loading acknowledgements…</div>
  if (!data) return null

  const pct = data.total > 0 ? Math.round((data.acknowledged / data.total) * 100) : 0

  return (
    <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="font-bold text-gray-800 text-sm">Parent Acknowledgements</p>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${pct === 100 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
          {data.acknowledged}/{data.total} acknowledged ({pct}%)
        </span>
      </div>
      {data.unacknowledged > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
          {data.students.filter(s => !s.acknowledged_at).map(s => (
            <div key={s.student_id} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{s.student_name}</p>
                  <p className="text-xs text-muted-foreground">{s.roll_number}{s.last_nudged_at ? ` · nudged ${timeAgo(s.last_nudged_at)}` : ''}</p>
                </div>
              </div>
              <button onClick={() => nudge(s.student_id)} disabled={nudging === s.student_id} data-testid={`nudge-parent-${s.student_id}`}
                className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50 flex-shrink-0">
                {nudging === s.student_id ? 'Nudging…' : 'Nudge'}
              </button>
            </div>
          ))}
        </div>
      )}
      {data.unacknowledged === 0 && (
        <div className="px-5 py-6 text-center text-sm text-emerald-600 font-medium">Every parent has acknowledged this result 🎉</div>
      )}
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// ─── Exam Analysis Panel ──────────────────────────────────────────────────────
function ExamAnalysisPanel({ data }: { data: MarksData }) {
  const { exam, subjects, students, subject_stats, pass_count, fail_count } = data
  const entered = students.filter(s => s.all_entered)
  const classAvg = entered.length > 0
    ? Math.round(entered.reduce((s, st) => s + (st.percentage ?? 0), 0) / entered.length * 10) / 10
    : null
  const topper = entered.length > 0 ? [...entered].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0] : null
  const ranked = [...students]
    .filter(s => s.percentage !== null)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-md border border-gray-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">{exam.exam_name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Grade {exam.grade} – Section {exam.section} · {new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Passing: {exam.passing_pct}%
            </p>
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_LABELS[exam.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
            {(STATUS_LABELS[exam.status]?.label ?? exam.status).toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Students', value: students.length, color: 'text-gray-800' },
          { label: 'Passed', value: pass_count, color: 'text-emerald-600' },
          { label: 'Failed', value: fail_count, color: 'text-red-500' },
          { label: 'Class Avg', value: classAvg !== null ? `${classAvg}%` : '—', color: classAvg !== null ? (classAvg >= 60 ? 'text-emerald-600' : classAvg >= 40 ? 'text-amber-500' : 'text-red-500') : 'text-gray-300' },
          { label: 'Topper', value: topper ? `${topper.percentage}%` : '—', color: 'text-indigo-600', sub: topper?.name },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-white rounded-md border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-semibold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-500 truncate mt-0.5">{sub}</p>}
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {pass_count + fail_count > 0 && (
        <div className="bg-white rounded-md border border-gray-200 px-5 py-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Pass Rate</span>
            <span className="font-semibold">{Math.round(pass_count / (pass_count + fail_count) * 100)}%</span>
          </div>
          <div className="h-2.5 bg-red-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.round(pass_count / (pass_count + fail_count) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{pass_count} passed</span>
            <span>{fail_count} failed</span>
          </div>
        </div>
      )}

      {subject_stats.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="font-bold text-gray-800 text-sm">Subject-wise Analysis</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Subject</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Teacher</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Max</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Avg</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Pass</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Fail</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Absent</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Pass%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {subject_stats.map(s => {
                  const total = s.pass_count + s.fail_count
                  const passPct = total > 0 ? Math.round(s.pass_count / total * 100) : null
                  const avgPct = s.avg_marks !== null ? Math.round(s.avg_marks / s.max_marks * 100) : null
                  return (
                    <tr key={s.exam_subject_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{s.subject_name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{s.teacher_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-600">{s.max_marks}</td>
                      <td className="px-4 py-2.5 text-center">
                        {avgPct !== null ? (
                          <span className={`text-xs font-semibold ${avgPct >= 60 ? 'text-emerald-600' : avgPct >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                            {s.avg_marks} ({avgPct}%)
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-semibold text-emerald-600">{s.pass_count}</td>
                      <td className="px-4 py-2.5 text-center text-xs font-semibold text-red-500">{s.fail_count}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{s.absent_count}</td>
                      <td className="px-4 py-2.5 text-center">
                        {passPct !== null ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passPct >= 80 ? 'bg-emerald-100 text-emerald-700' : passPct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                            {passPct}%
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-gray-800 text-sm">Student Results</p>
          <span className="text-xs text-muted-foreground">{students.length} students</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 sticky left-0 bg-gray-50">Student</th>
                {subjects.map(s => (
                  <th key={s.subject_name} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                    {s.subject_name}<br/><span className="text-xs font-normal text-muted-foreground">/{s.max_marks}</span>
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Total</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">%</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map(s => {
                const rank = ranked.findIndex(r => r.student_id === s.student_id) + 1
                return (
                  <tr key={s.student_id} className={`hover:bg-gray-50/40 ${s.pass === false ? 'bg-red-50/20' : ''}`}>
                    <td className="px-4 py-2.5 sticky left-0 bg-white">
                      <div className="flex items-center gap-2">
                        {rank > 0 && <span className="text-xs text-gray-300 w-4">#{rank}</span>}
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.roll_number}</p>
                        </div>
                      </div>
                    </td>
                    {subjects.map(sub => {
                      const m = s.subjects[sub.subject_name]
                      if (!m) return <td key={sub.subject_name} className="px-3 py-2.5 text-center text-xs text-gray-200">—</td>
                      if (m.is_absent) return <td key={sub.subject_name} className="px-3 py-2.5 text-center"><span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">AB</span></td>
                      const subPct = m.marks_obtained !== null ? (m.marks_obtained / sub.max_marks) * 100 : null
                      // A subject with its own configured pass_marks is judged
                      // against that directly; falls back to the exam-wide
                      // percentage for a subject nobody's configured yet.
                      const subFailed = m.marks_obtained !== null && (sub.pass_marks != null ? m.marks_obtained < sub.pass_marks : subPct !== null && subPct < exam.passing_pct)
                      return (
                        <td key={sub.subject_name} className="px-3 py-2.5 text-center">
                          <span className={`text-xs font-semibold ${subPct === null ? 'text-gray-300' : subFailed ? 'text-red-500' : 'text-gray-700'}`}>
                            {m.marks_obtained ?? '—'}
                          </span>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 text-center text-xs font-semibold text-gray-700">
                      {s.total_obtained !== null ? `${s.total_obtained}/${s.total_max}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {s.percentage !== null ? (
                        <span className={`text-xs font-bold ${s.percentage >= 60 ? 'text-emerald-600' : s.percentage >= exam.passing_pct ? 'text-amber-500' : 'text-red-500'}`}>
                          {s.percentage}%
                        </span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {s.pass === null
                        ? <span className="text-xs text-gray-300">Pending</span>
                        : <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {s.pass ? 'PASS' : 'FAIL'}
                          </span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
