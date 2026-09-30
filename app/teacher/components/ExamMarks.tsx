'use client'

import { useEffect, useState, useCallback, useRef, ChangeEvent } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart3, CheckCircle2, Eye } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
type Teacher = { id: number; name: string; subject: string; department: string }
type Exam = {
  id: number; exam_name: string; exam_type: string; exam_date: string | null; passing_pct: number
  status: string; created_by_name: string; grade: string; section: string
  total_subjects: number; assigned_subjects: number; submitted_subjects: number; released_at: string | null
}
type ExamSubject = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null; max_marks: number; pass_marks: number | null; status: string; submitted_at: string | null }
type Student = { id: number; name: string; roll_number: string }
type MarkEntry = { marks: string; absent: boolean }

const EXAM_TYPES = [
  { key: 'unit_test', label: 'Unit Test' },
  { key: 'mid_term', label: 'Mid Term' },
  { key: 'final_exam', label: 'Final Exam' },
  { key: 'practical', label: 'Practical' },
]

function examTypeLabel(t: string) {
  return EXAM_TYPES.find(e => e.key === t)?.label ?? t
}

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (quoted) throw new Error('Unclosed quoted field')
  if (cell.length > 0 || row.length > 0) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  return rows
}


const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled:        { label: 'Scheduled',        color: 'bg-gray-100 text-gray-500' },
  collecting:       { label: 'Collecting Marks', color: 'bg-amber-100 text-amber-700' },
  teacher_reviewed: { label: 'Sent to Admin',    color: 'bg-violet-100 text-violet-700' },
  released:         { label: 'Released',         color: 'bg-emerald-100 text-emerald-700' },
}

// ── Props ──────────────────────────────────────────────────────────────────
type Props = {
  classId: number
  schoolId: number
  grade: string
  section: string
  teacher: Teacher
  isClassTeacher: boolean
  openExamId?: number  // auto-open this exam's marks entry from notification deep-link
}

type ReviewStudent = {
  student_id: number; name: string; roll_number: string
  subjects: Record<string, { marks_obtained: number | null; is_absent: boolean }>
  total_obtained: number | null; total_max: number; percentage: number | null; pass: boolean | null; all_entered: boolean
}
type SubjectStat = { exam_subject_id: number; subject_name: string; max_marks: number; pass_marks: number | null; teacher_name: string | null; status: string; avg_marks: number | null; pass_count: number; fail_count: number; absent_count: number; entries: number }

// ── Main Component ─────────────────────────────────────────────────────────
export default function ExamMarks({ classId, schoolId, grade, section, teacher, isClassTeacher, openExamId }: Props) {
  const [view, setView] = useState<'list' | 'detail' | 'pick' | 'configure' | 'enter' | 'review'>('list')
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<(Exam & { subjects: ExamSubject[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [errMsg, setErrMsg] = useState('')

  // Marks are entered one subject at a time — a teacher with more than one
  // pending subject in this class picks which one first, rather than seeing
  // every subject's columns mixed together in one grid.
  const [pickSubjects, setPickSubjects] = useState<ExamSubject[]>([])

  // Max-marks / pass-marks setup — one-time, per subject, required before its
  // marks grid opens. Always exactly one subject at a time; kept as an array
  // only so the save loop stays simple. Keyed by exam_subject_id.
  const [configSubjects, setConfigSubjects] = useState<ExamSubject[]>([])
  const [configValues, setConfigValues] = useState<Record<number, { max: string; pass: string }>>({})
  const [configError, setConfigError] = useState('')
  const [configSaving, setConfigSaving] = useState(false)

  // Subject ids the class teacher has nudged this session — used only to
  // disable the button briefly after sending, not persisted state.
  const [nudgedSubjectId, setNudgedSubjectId] = useState<number | null>(null)

  // Marks entry state
  const [students, setStudents] = useState<Student[]>([])
  const [marksMap, setMarksMap] = useState<Record<number, Record<number, MarkEntry>>>({})
  const [enteringSubjects, setEnteringSubjects] = useState<ExamSubject[]>([])
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const marksMapRef = useRef(marksMap)
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const editRevisionRef = useRef(0)
  const dirtyRef = useRef(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // CSV import state
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [csvError, setCsvError] = useState('')

  // Review state
  const [reviewData, setReviewData] = useState<{ students: ReviewStudent[]; subject_stats: SubjectStat[]; total_max: number; pass_count: number; fail_count: number } | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pass' | 'fail' | 'risk'>('all')
  const [sendingToAdmin, setSendingToAdmin] = useState(false)
  const [reviewConfirm, setReviewConfirm] = useState(false)

  const loadExams = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/exams?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => [])
    const examList = Array.isArray(res) ? res : []
    setExams(examList)
    setLoading(false)
    if (openExamId && examList.length > 0) {
      const target = examList.find((e: Exam) => e.id === openExamId)
      if (target) loadExamDetail(target.id)
    }
  }, [schoolId, classId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const initial = setTimeout(() => { void loadExams() }, 0)
    return () => clearTimeout(initial)
  }, [loadExams])

  async function loadExamDetail(examId: number) {
    const data = await fetch(`/api/exams/${examId}?school_id=${schoolId}`).then(r => r.json())
    setSelectedExam(data)
    setView('detail')
  }

  // A subject with no teacher_id (class_subjects never had one assigned)
  // can only be self-assigned by the class teacher — a single-subject fix,
  // not a wholesale reassignment screen, since every other subject already
  // has its real teacher copied in at exam-creation time.
  async function assignSelfToSubject(examSubjectId: number) {
    if (!selectedExam) return
    setSaving(true); setErrMsg('')
    try {
      const res = await fetch(`/api/exams/${selectedExam.id}/subjects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, assignments: [{ exam_subject_id: examSubjectId, teacher_id: teacher.id }] }),
      }).then(r => r.json())
      if (res.error) { setErrMsg(res.error); setSaving(false); return }
      if (res.assigned === 0) { setErrMsg('You are not listed as a teacher for this subject in Class Management.'); setSaving(false); return }
      await loadExamDetail(selectedExam.id)
    } finally { setSaving(false) }
  }

  // Load students + existing marks for entry. Scoped to subjects this
  // teacher may edit — always just their own assigned subject(s), whether or
  // not they're also this class's class teacher (that role's extra
  // abilities — reopening, nudging, self-assigning an unassigned subject,
  // reviewing — live in the checklist grid, not in this button). Any of
  // those subjects still missing its max/pass marks setup is routed through
  // the configure step first — marks can't be meaningfully entered (or later
  // analyzed pass/fail) without that.
  async function openMarksEntry(exam: typeof selectedExam) {
    if (!exam) return
    const mySubjects = exam.subjects.filter(s => s.teacher_id === teacher.id && s.status === 'pending')
    if (mySubjects.length === 0) return
    if (mySubjects.length === 1) { await selectSubjectToEnter(exam, mySubjects[0]); return }
    setPickSubjects(mySubjects)
    setView('pick')
  }

  // One subject chosen (either the only one, or picked from the list) —
  // route through the one-time configure step if it's never been set up,
  // otherwise straight into its own marks grid.
  async function selectSubjectToEnter(exam: typeof selectedExam, sub: ExamSubject) {
    if (!exam) return
    if (sub.pass_marks == null) {
      setConfigSubjects([sub])
      setConfigValues(prev => (prev[sub.id] ? prev : { ...prev, [sub.id]: { max: String(sub.max_marks ?? 100), pass: '' } }))
      setConfigError('')
      setView('configure')
      return
    }
    await loadMarksGrid(exam, [sub])
  }

  async function loadMarksGrid(exam: typeof selectedExam, mySubjects: ExamSubject[]) {
    if (!exam) return
    const [stuData, marksData] = await Promise.all([
      fetch(`/api/students?school_id=${schoolId}&grade=${grade}&section=${section}`).then(r => r.json()).catch(() => []),
      fetch(`/api/exams/${exam.id}/marks?school_id=${schoolId}`).then(r => r.json()).catch(() => null),
    ])
    if (!marksData || marksData.error) {
      setErrMsg(marksData?.error || 'Unable to load marks. Check your connection and retry.')
      return
    }
    const applicableIds = new Set<number>((marksData.students ?? []).map((student: ReviewStudent) => student.student_id))
    const stus: Student[] = Array.isArray(stuData)
      ? stuData.filter((student: Student & { status: string }) => student.status === 'active' && applicableIds.has(student.id))
      : []
    setStudents(stus)
    setEnteringSubjects(mySubjects)

    // GET /api/exams/[id]/marks always returns a { marks_obtained: null,
    // is_absent: false } placeholder for a subject nobody's touched — never
    // `undefined` — so only hydrate a cell when there's REAL data (a mark or
    // an explicit Absent). Pulling in every placeholder here used to mean
    // Save Draft / the Back button's auto-save sent a blank row for every
    // untouched student, which then made that student look "fully entered"
    // (0 marks, automatically failing) to the class teacher's checklist and
    // review screen even though no one had entered anything for them.
    const init: typeof marksMap = {}
    stus.forEach(s => { init[s.id] = {} })
    if (marksData?.students) {
      marksData.students.forEach((sr: ReviewStudent) => {
        if (!init[sr.student_id]) init[sr.student_id] = {}
        mySubjects.forEach(sub => {
          const m = sr.subjects[sub.subject_name]
          if (m && (m.marks_obtained !== null || m.is_absent)) {
            init[sr.student_id][sub.id] = { marks: m.is_absent ? '' : String(m.marks_obtained), absent: m.is_absent }
          }
        })
      })
    }
    setMarksMap(init)
    marksMapRef.current = init
    dirtyRef.current = false
    setSaveState('idle')
    setView('enter')
  }

  // Saves max/pass marks for every subject in configSubjects, then — once
  // all of them are configured — moves straight into the marks grid.
  async function handleSaveConfig() {
    if (!selectedExam) return
    for (const sub of configSubjects) {
      const v = configValues[sub.id]
      const max = Number(v?.max ?? '')
      const pass = Number(v?.pass ?? '')
      if (!Number.isInteger(max) || max <= 0) { setConfigError(`${sub.subject_name}: max marks must be a whole number greater than 0`); return }
      if (!Number.isInteger(pass) || pass < 0 || pass > max) { setConfigError(`${sub.subject_name}: pass marks must be a whole number between 0 and ${max}`); return }
    }
    setConfigSaving(true); setConfigError('')
    try {
      for (const sub of configSubjects) {
        const v = configValues[sub.id]
        const res = await fetch(`/api/exams/${selectedExam.id}/subjects/${sub.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: schoolId, max_marks: Number(v.max), pass_marks: Number(v.pass) }),
        }).then(r => r.json())
        if (res.error) { setConfigError(res.error); setConfigSaving(false); return }
      }
      const fresh = await fetch(`/api/exams/${selectedExam.id}?school_id=${schoolId}`).then(r => r.json())
      setSelectedExam(fresh)
      const configuredId = configSubjects[0].id
      const freshSub = fresh.subjects.find((s: ExamSubject) => s.id === configuredId)
      await loadMarksGrid(fresh, freshSub ? [freshSub] : configSubjects)
    } finally { setConfigSaving(false) }
  }

  async function openReview() {
    if (!selectedExam) return
    const data = await fetch(`/api/exams/${selectedExam.id}/marks?school_id=${schoolId}`).then(r => r.json())
    setReviewData(data)
    setView('review')
  }

  const saveMarks = useCallback(async (submitIds?: number[]) => {
    if (!selectedExam) return
    const snapshot = marksMapRef.current
    const revision = editRevisionRef.current
    const entries: { exam_subject_id: number; student_id: number; marks_obtained: number | null; is_absent: boolean }[] = []
    for (const [studentId, subjectMarks] of Object.entries(snapshot)) {
      for (const [subId, entry] of Object.entries(subjectMarks)) {
        // A cell that's blank and not marked Absent has no real data to
        // save — sending it anyway would write a row that looks "entered"
        // (0 marks) to every completeness/pass-fail check downstream.
        if (!entry.absent && entry.marks === '') continue
        entries.push({
          exam_subject_id: Number(subId), student_id: Number(studentId),
          marks_obtained: entry.absent ? null : parseFloat(entry.marks),
          is_absent: entry.absent,
        })
      }
    }
    const request = async () => {
      setSaveState('saving')
      try {
      const res = await fetch(`/api/exams/${selectedExam.id}/marks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, entries, submit_subject_ids: submitIds ?? [] }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveState('error'); return data }
      setLastSaved(new Date())
      setSaveState('saved')
      if (editRevisionRef.current === revision) dirtyRef.current = false
      return data
      } catch {
        setSaveState('error')
        return null
      }
    }
    const queued = saveQueueRef.current.then(request, request)
    saveQueueRef.current = queued.then(() => undefined, () => undefined)
    return queued
  }, [selectedExam, schoolId])

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload)
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [])

  function updateMark(studentId: number, subjectId: number, field: 'marks' | 'absent', value: string | boolean) {
    setMarksMap(prev => {
      const next = {
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [subjectId]: { ...(prev[studentId]?.[subjectId] || { marks: '', absent: false }), [field]: value } },
      }
      marksMapRef.current = next
      return next
    })
    editRevisionRef.current++
    dirtyRef.current = true
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { void saveMarks() }, 3000)
  }

  function overMax(subjectId: number, marks: string): boolean {
    const sub = enteringSubjects.find(s => s.id === subjectId)
    if (!sub || marks === '') return false
    const n = parseFloat(marks)
    return !Number.isNaN(n) && (n > sub.max_marks || n < 0)
  }

  // Every student needs either a mark or an explicit Absent for every subject
  // being entered right now — the backend already refuses an incomplete
  // submit, but catching it here means the teacher sees exactly who's
  // missing before they click Submit, not a rejection after.
  function isFilled(studentId: number, subjectId: number): boolean {
    const entry = marksMap[studentId]?.[subjectId]
    return !!entry && (entry.absent || entry.marks !== '')
  }
  const missingStudents = students.filter(st => enteringSubjects.some(sub => !isFilled(st.id, sub.id)))

  async function handleSubmitSubjects() {
    if (missingStudents.length > 0) {
      setErrMsg(`${missingStudents.length} student(s) still need a mark or Absent before you can submit — see the highlighted rows.`)
      return
    }
    const invalid = enteringSubjects.some(sub =>
      students.some(st => overMax(sub.id, marksMap[st.id]?.[sub.id]?.marks ?? ''))
    )
    if (invalid) { setErrMsg('Fix the highlighted marks before submitting — a value above max marks or below 0 will be rejected.'); return }

    setSaving(true); setErrMsg('')
    const subjectIds = enteringSubjects.map(s => s.id)
    const res = await saveMarks(subjectIds)
    setSaving(false)
    if (!res || res.error) { setErrMsg(res?.error || 'Failed to submit'); return }
    setMsg(`${res.submitted_subjects?.length ?? 0} subject(s) submitted.`)
    await loadExamDetail(selectedExam!.id)
    setView('detail')
  }

  async function reopenSubject(subjectId: number) {
    if (!selectedExam) return
    await fetch(`/api/exams/${selectedExam.id}/subjects/${subjectId}/reopen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId }),
    })
    await loadExamDetail(selectedExam.id)
  }

  async function nudgeSubjectTeacher(subjectId: number) {
    if (!selectedExam) return
    setNudgedSubjectId(subjectId)
    const res = await fetch(`/api/exams/${selectedExam.id}/subjects/${subjectId}/nudge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId }),
    }).then(r => r.json()).catch(() => ({ error: 'Connection error' }))
    if (res.error) { setErrMsg(res.error); setNudgedSubjectId(null); return }
    setMsg('Reminder sent.')
  }

  async function handleSendToAdmin() {
    if (!selectedExam || !reviewConfirm) return
    setSendingToAdmin(true); setErrMsg('')
    const res = await fetch(`/api/exams/${selectedExam.id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId }),
    }).then(r => r.json())
    setSendingToAdmin(false)
    if (res.error) { setErrMsg(res.error); return }
    setMsg('Sent to school admin for release.')
    await loadExams()
    await loadExamDetail(selectedExam.id)
    setView('detail')
  }

  function downloadTemplate() {
    if (!selectedExam || students.length === 0 || enteringSubjects.length === 0) return
    const subjectCols = enteringSubjects.flatMap(s => [`${s.subject_name} (/${s.max_marks})`, `${s.subject_name} Absent (Y/N)`])
    const header = ['Roll Number', 'Student Name', ...subjectCols].map(csvCell).join(',')
    const rows = students.map(st => {
      const cols = enteringSubjects.flatMap(sub => {
        const entry = marksMap[st.id]?.[sub.id]
        const absent = entry?.absent ? 'Y' : 'N'
        const marks = entry?.absent ? '' : (entry?.marks ?? '')
        return [marks, absent]
      })
      return [st.roll_number, st.name, ...cols].map(csvCell).join(',')
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedExam.exam_name.replace(/\s+/g, '_')}_${grade}${section}_marks_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleCSVUpload(e: ChangeEvent<HTMLInputElement>) {
    setCsvError('')
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const rows = parseCSV(text.trim())
        if (rows.length < 2) { setCsvError('CSV is empty or missing data rows'); return }
        const headers = rows[0].map(h => h.trim())

        const subjectColMap: Array<{ subjectId: number; type: 'marks' | 'absent' } | null> = headers.map(h => {
          for (const sub of enteringSubjects) {
            if (h === `${sub.subject_name} (/${sub.max_marks})`) return { subjectId: sub.id, type: 'marks' }
            if (h === `${sub.subject_name} Absent (Y/N)`) return { subjectId: sub.id, type: 'absent' }
          }
          return null
        })

        const rollMap = new Map<string, number>()
        students.forEach(s => rollMap.set(s.roll_number.trim(), s.id))

        let matchedRows = 0
        let skippedRows = 0
        const newMap = { ...marksMap }
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].map(cell => cell.trim())
          const roll = cells[0]
          const studentId = rollMap.get(roll)
          if (!studentId) { skippedRows++; continue }
          matchedRows++
          if (!newMap[studentId]) newMap[studentId] = {}
          subjectColMap.forEach((col, idx) => {
            if (!col) return
            const val = cells[idx] ?? ''
            if (!newMap[studentId][col.subjectId]) newMap[studentId][col.subjectId] = { marks: '', absent: false }
            if (col.type === 'absent') {
              newMap[studentId][col.subjectId].absent = val.toUpperCase() === 'Y'
              if (val.toUpperCase() === 'Y') newMap[studentId][col.subjectId].marks = ''
            } else if (col.type === 'marks' && !newMap[studentId][col.subjectId].absent) {
              newMap[studentId][col.subjectId].marks = val
            }
          })
        }
        setMarksMap(newMap)
        marksMapRef.current = newMap
        editRevisionRef.current++
        dirtyRef.current = true
        setMsg(skippedRows > 0
          ? `Imported ${matchedRows} student(s). ${skippedRows} row(s) skipped — roll number not found.`
          : `Imported ${matchedRows} student(s). Review and submit when ready.`)
      } catch {
        setCsvError('Failed to parse CSV. Please use the downloaded template.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {msg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
          {msg}
          <button onClick={() => setMsg('')} className="text-blue-400 hover:text-blue-600 ml-4">✕</button>
        </div>
      )}
      {errMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
          {errMsg}
          <button onClick={() => setErrMsg('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Marks & Results — Grade {grade} {section}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Exams are scheduled by school admin. Class teachers assign subject teachers once entry opens.</p>
          </div>

          {loading ? (
            <div className="space-y-2" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Loading exams</span>
              {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : exams.length === 0 ? (
            <div className="border-y border-gray-200 py-14 text-center">
              <BarChart3 className="mx-auto mb-3 h-6 w-6 text-gray-400" aria-hidden="true" />
              <p className="font-medium text-gray-700 text-sm">No exams scheduled</p>
              <p className="mt-1 text-xs text-gray-400">New exams will appear here when the school publishes them.</p>
            </div>
          ) : (
            <div className="divide-y border-y border-gray-200">
              {exams.map(exam => {
                const myPending = !isClassTeacher && exam.status === 'collecting'
                const statusInfo = STATUS_LABELS[exam.status] ?? { label: exam.status, color: 'bg-gray-100 text-gray-500' }
                return (
                  <div key={exam.id} onClick={() => loadExamDetail(exam.id)} data-testid={`exam-card-${exam.id}`}
                    className="px-1 py-4 cursor-pointer hover:bg-teal-50/40 transition-colors sm:px-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-800 text-sm">{exam.exam_name}</h3>
                          <span className="text-xs text-gray-500">{examTypeLabel(exam.exam_type)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusInfo.color}`}>{statusInfo.label}</span>
                          {myPending && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">ENTER YOUR MARKS</span>}
                          {isClassTeacher && exam.status === 'collecting' && exam.assigned_subjects < exam.total_subjects && (
                            <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold" title="One or more subjects have no teacher in Class Management">NEEDS A TEACHER</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {exam.exam_date || 'No date set'} · Passing: {exam.passing_pct}%
                          {exam.status !== 'scheduled' && ` · ${exam.submitted_subjects}/${exam.total_subjects} subjects submitted`}
                        </p>
                      </div>
                      {exam.status !== 'scheduled' && (
                        <div className="flex-shrink-0">
                          <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${exam.status === 'released' ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${exam.total_subjects > 0 ? (exam.submitted_subjects / exam.total_subjects) * 100 : 0}%` }} />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1 text-right">{exam.submitted_subjects}/{exam.total_subjects}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {view === 'detail' && selectedExam && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); loadExams() }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              All Exams
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-xs text-gray-600 font-medium">{selectedExam.exam_name}</span>
          </div>

          <div className="border-y border-gray-200 py-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-800">{selectedExam.exam_name}</h2>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">{examTypeLabel(selectedExam.exam_type)}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${STATUS_LABELS[selectedExam.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[selectedExam.status]?.label ?? selectedExam.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Grade {selectedExam.grade}-{selectedExam.section} · {selectedExam.exam_date || 'No date'} · Pass: {selectedExam.passing_pct}%
                  · Created by {selectedExam.created_by_name}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* "Enter My Marks" is scoped to subjects THIS teacher is
                    assigned to — being the class teacher doesn't mean you
                    teach every subject in the class. A class teacher who
                    also needs to fill in for an unassigned subject does that
                    via "I'll enter this one" in the checklist below first,
                    which is what makes it theirs to enter. */}
                {selectedExam.status === 'collecting' && selectedExam.subjects.some(s => s.teacher_id === teacher.id && s.status === 'pending') && (
                  <button onClick={() => openMarksEntry(selectedExam)} data-testid="open-enter-marks"
                    className="bg-[#21686a] text-white text-sm px-4 py-2 rounded-md hover:bg-[#164749] transition-colors font-medium">
                    Enter My Marks
                  </button>
                )}
                {/* Peek at the full class memorandum any time entry has
                    started — doesn't require every subject to be submitted,
                    unlike "Review & Send to Admin" below. Same table a
                    school admin sees on Results & Release. */}
                {isClassTeacher && selectedExam.status !== 'scheduled' && (
                  <button onClick={openReview} data-testid="open-view-marks"
                    className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-md hover:bg-gray-50 transition-colors font-medium">
                    <Eye className="w-4 h-4" /> View Marks
                  </button>
                )}
                {isClassTeacher && selectedExam.status === 'collecting' && selectedExam.subjects.length > 0 && (() => {
                  const allSubmitted = selectedExam.subjects.every(s => s.status === 'submitted')
                  return (
                    <button onClick={openReview} disabled={!allSubmitted} data-testid="open-review"
                      title={allSubmitted ? undefined : 'Unlocks once every subject below is Entered'}
                      className={`text-sm px-5 py-2 rounded-xl font-bold transition-colors ${
                        allSubmitted ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}>
                      Review & Send to Admin →
                    </button>
                  )
                })()}
              </div>
            </div>

            {/* Whole-class submission progress is a class-teacher concern — a
                subject teacher only needs to know their own subject's status,
                shown on their own card in the grid below instead. */}
            {isClassTeacher && selectedExam.status !== 'scheduled' && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Subjects submitted</span>
                  <span>{selectedExam.subjects.filter(s => s.status === 'submitted').length} / {selectedExam.subjects.length}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${selectedExam.status === 'released' ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    style={{ width: `${selectedExam.subjects.length > 0 ? (selectedExam.subjects.filter(s => s.status === 'submitted').length / selectedExam.subjects.length) * 100 : 0}%` }} />
                </div>
                {selectedExam.status === 'collecting' && !selectedExam.subjects.every(s => s.status === 'submitted') && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    &ldquo;Review &amp; Send to Admin&rdquo; unlocks here once every subject below is <span className="font-semibold text-green-700">Entered</span> — nudge whoever&rsquo;s still Pending.
                  </p>
                )}
              </div>
            )}

            {selectedExam.status === 'scheduled' && (
              <p className="mt-4 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Marks entry opens automatically on {selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : 'the exam date'}.
              </p>
            )}
          </div>

          {/* Class teacher: a checklist of every subject in the class — who
              teaches it and whether they've submitted, so it's obvious at a
              glance whether the exam is ready to review and send to admin. */}
          {isClassTeacher && (
            <div className="grid grid-cols-2 border-y border-gray-200 sm:grid-cols-3 lg:grid-cols-5">
              {selectedExam.subjects.map(sub => {
                const isMySubject = sub.teacher_id === teacher.id
                const submitted = sub.status === 'submitted'
                return (
                  <div key={sub.id} className={`p-4 border-b border-r ${submitted ? 'border-green-200 bg-green-50/30' : isMySubject ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{sub.subject_name}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${submitted ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100'}`}>
                        {submitted ? 'Entered' : 'Pending'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{sub.teacher_name || 'No teacher in Class Management'}</p>
                    {isMySubject && <p className="text-[10px] text-blue-500 font-medium mt-0.5">You</p>}
                    <p className="text-xs mt-1">
                      {sub.pass_marks != null
                        ? <span className="text-gray-500">/{sub.max_marks} marks · pass {sub.pass_marks}</span>
                        : <span className="text-gray-300 italic">Max/pass marks not set yet</span>}
                    </p>
                    {submitted && selectedExam.status === 'collecting' && (
                      <button onClick={() => reopenSubject(sub.id)} data-testid={`reopen-subject-${sub.id}`}
                        className="mt-2 text-[10px] text-amber-600 hover:text-amber-800 font-semibold underline">Reopen to fix</button>
                    )}
                    {!sub.teacher_id && selectedExam.status === 'collecting' && (
                      <button onClick={() => assignSelfToSubject(sub.id)} disabled={saving} data-testid={`assign-self-${sub.id}`}
                        className="mt-2 text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline disabled:opacity-50">I&rsquo;ll enter this one</button>
                    )}
                    {!submitted && sub.teacher_id && !isMySubject && selectedExam.status === 'collecting' && (
                      <button onClick={() => nudgeSubjectTeacher(sub.id)} disabled={nudgedSubjectId === sub.id} data-testid={`nudge-subject-${sub.id}`}
                        className="mt-2 text-[10px] text-amber-600 hover:text-amber-800 font-semibold underline disabled:opacity-50 disabled:no-underline block">
                        {nudgedSubjectId === sub.id ? 'Reminded ✓' : 'Nudge teacher'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Subject teacher: only their own subject(s) in this class — not
              the whole class's subject roster, which is the class teacher's
              concern, not theirs. */}
          {!isClassTeacher && (
            <div className="grid grid-cols-1 border-y border-gray-200 sm:grid-cols-2">
              {selectedExam.subjects.filter(sub => sub.teacher_id === teacher.id).map(sub => {
                const submitted = sub.status === 'submitted'
                return (
                  <div key={sub.id} className={`p-4 border-b border-r ${submitted ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{sub.subject_name}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${submitted ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100'}`}>
                        {submitted ? 'Submitted' : 'Not entered yet'}
                      </span>
                    </div>
                    <p className="text-xs">
                      {sub.pass_marks != null
                        ? <span className="text-gray-500">/{sub.max_marks} marks · pass {sub.pass_marks}</span>
                        : <span className="text-gray-300 italic">Max/pass marks not set yet</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PICK VIEW — which of my pending subjects am I entering marks for ── */}
      {view === 'pick' && selectedExam && (
        <div className="space-y-4">
          <button onClick={() => setView('detail')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-800">Which subject?</h2>
            <p className="text-xs text-gray-400 mt-0.5 mb-4">You have more than one subject pending for {selectedExam.exam_name} — pick one to enter marks for.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pickSubjects.map(sub => (
                <button key={sub.id} onClick={() => selectSubjectToEnter(selectedExam, sub)} data-testid={`pick-subject-${sub.id}`}
                  className="text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-[#21686a] hover:bg-teal-50/40 transition-colors">
                  <p className="text-sm font-semibold text-gray-800">{sub.subject_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sub.pass_marks != null ? `/${sub.max_marks} marks · pass ${sub.pass_marks}` : 'Max/pass marks not set yet'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIGURE VIEW — max/pass marks, required once per subject before its grid opens ── */}
      {view === 'configure' && selectedExam && (
        <div className="space-y-4">
          <button onClick={() => setView(pickSubjects.length > 1 ? 'pick' : 'detail')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-800">Set max marks &amp; pass marks</h2>
            <p className="text-xs text-gray-400 mt-0.5 mb-4">One-time setup for {configSubjects[0]?.subject_name} — this decides what marks are entered out of, and how pass/fail is calculated for this subject in every report.</p>
            <div className="space-y-3">
              {configSubjects.map(sub => {
                const v = configValues[sub.id] ?? { max: '100', pass: '' }
                return (
                  <div key={sub.id} className="flex items-center gap-3 flex-wrap border border-gray-100 rounded-lg p-3">
                    <p className="text-sm font-semibold text-gray-700 w-32 flex-shrink-0">{sub.subject_name}</p>
                    <div>
                      <label htmlFor={`config-max-${sub.id}`} className="block text-[10px] font-semibold text-gray-500 mb-0.5">Max Marks</label>
                      <input id={`config-max-${sub.id}`} type="number" min={1} step={1} value={v.max}
                        onChange={e => setConfigValues(prev => ({ ...prev, [sub.id]: { ...v, max: e.target.value } }))}
                        data-testid={`config-max-${sub.id}`}
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label htmlFor={`config-pass-${sub.id}`} className="block text-[10px] font-semibold text-gray-500 mb-0.5">Pass Marks</label>
                      <input id={`config-pass-${sub.id}`} type="number" min={0} step={1} value={v.pass}
                        onChange={e => setConfigValues(prev => ({ ...prev, [sub.id]: { ...v, pass: e.target.value } }))}
                        data-testid={`config-pass-${sub.id}`}
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    </div>
                  </div>
                )
              })}
            </div>
            {configError && <p className="text-xs text-red-500 mt-3">{configError}</p>}
            <button onClick={handleSaveConfig} disabled={configSaving} data-testid="config-save-continue"
              className="mt-4 bg-[#21686a] text-white text-sm px-4 py-2 rounded-md hover:bg-[#164749] transition-colors font-medium disabled:opacity-50">
              {configSaving ? 'Saving…' : 'Save & Enter Marks →'}
            </button>
          </div>
        </div>
      )}

      {/* ── MARKS ENTRY VIEW ── */}
      {view === 'enter' && selectedExam && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={async () => {
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
              const result = await saveMarks()
              if (result && !('error' in result)) setView('detail')
            }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <div className="flex items-center gap-2 text-xs">
              {saveState === 'saving' && <span className="text-gray-400">Saving…</span>}
              {saveState === 'saved' && lastSaved && <span className="text-emerald-500">Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
              {saveState === 'error' && <span className="text-red-500 font-semibold">Save failed — retry</span>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-bold text-gray-800">{selectedExam.exam_name} · Grade {grade}-{section}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Entering marks for: {enteringSubjects.map(s => s.subject_name).join(', ')}</p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={downloadTemplate} className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1" title="Download CSV template pre-filled with student list">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Template
                </button>
                <button onClick={() => csvInputRef.current?.click()} className="text-xs border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1 font-medium" title="Upload filled CSV to import marks">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Upload CSV
                </button>
                <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                <button onClick={() => saveMarks()} disabled={saving} className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Save Draft</button>
                <button onClick={handleSubmitSubjects} disabled={saving || missingStudents.length > 0} data-testid="submit-marks"
                  title={missingStudents.length > 0 ? `${missingStudents.length} student(s) still need a mark or Absent` : undefined}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? 'Saving...' : missingStudents.length > 0 ? `${missingStudents.length} student(s) left` : 'Submit Marks ✓'}
                </button>
              </div>
            </div>
          </div>
          {csvError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-xl flex items-center justify-between">
              {csvError}
              <button onClick={() => setCsvError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                    {enteringSubjects.map(sub => (
                      <th key={sub.id} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[100px]">
                        {sub.subject_name}<br /><span className="text-gray-400 normal-case font-normal">/{sub.max_marks}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {students.map((student, idx) => {
                    const rowMissing = enteringSubjects.some(sub => !isFilled(student.id, sub.id))
                    return (
                    <tr key={student.id} className={rowMissing ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50/50'}>
                      <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-800 text-sm">{student.name}</p>
                        <p className="text-xs text-gray-400">Roll {student.roll_number}{rowMissing && <span className="ml-1.5 text-amber-600 font-semibold">· needs marks or Absent</span>}</p>
                      </td>
                      {enteringSubjects.map(sub => {
                        const entry = marksMap[student.id]?.[sub.id] ?? { marks: '', absent: false }
                        const invalid = overMax(sub.id, entry.marks)
                        return (
                          <td key={sub.id} className="px-3 py-2 text-center">
                            {entry.absent ? (
                              <button onClick={() => updateMark(student.id, sub.id, 'absent', false)}
                                data-testid={`unmark-absent-${student.id}-${sub.id}`} title="Click to undo — mark present again"
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 border border-red-200 hover:bg-red-200 px-2.5 py-1 rounded-full transition-colors">
                                Absent <span className="text-red-400">✕</span>
                              </button>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1.5">
                                  <input type="number" min={0} max={sub.max_marks} step={0.5} value={entry.marks}
                                    onChange={e => updateMark(student.id, sub.id, 'marks', e.target.value)}
                                    data-testid={`mark-input-${student.id}-${sub.id}`}
                                    placeholder="—"
                                    className={`w-16 border rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 ${invalid ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                                  <button onClick={() => updateMark(student.id, sub.id, 'absent', true)} data-testid={`mark-absent-${student.id}-${sub.id}`} title="Mark this student absent"
                                    className="text-[10px] font-semibold text-gray-500 bg-gray-100 hover:bg-red-100 hover:text-red-600 border border-gray-200 hover:border-red-200 px-2 py-1 rounded-full transition-colors">
                                    Absent
                                  </button>
                                </div>
                                {invalid && <span className="text-xs text-red-600">Maximum {sub.max_marks}</span>}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-gray-400">
                Click the &ldquo;Absent&rdquo; pill to mark a student absent. Marks auto-save every 3 seconds.
                {missingStudents.length > 0 && <span className="text-amber-600 font-semibold"> · {missingStudents.length} student(s) still need an entry.</span>}
              </p>
              <p className="text-xs text-gray-400">Tip: Download the CSV template, fill offline in Excel, then upload.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW VIEW ── */}
      {view === 'review' && selectedExam && reviewData && (
        <div className="space-y-4">
          <button onClick={() => setView('detail')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Exam
          </button>

          {(() => {
            const allSubmitted = selectedExam.subjects.length > 0 && selectedExam.subjects.every(s => s.status === 'submitted')
            return allSubmitted ? (
              <div className="bg-green-50 border-l-2 border-green-600 px-5 py-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-700" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-green-800">All subjects submitted for {selectedExam.exam_name}</p>
                  <p className="text-sm text-green-600">Review the results below, then send to school admin for release</p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border-l-2 border-amber-500 px-5 py-4 flex items-center gap-3">
                <Eye className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-amber-800">Progress view — {selectedExam.subjects.filter(s => s.status === 'submitted').length}/{selectedExam.subjects.length} subjects submitted</p>
                  <p className="text-sm text-amber-600">Sending to school admin unlocks once every subject below is submitted.</p>
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-2 border-y border-gray-200 sm:grid-cols-4">
            {[
              { label: 'Total Students', val: reviewData.students.length, color: 'text-gray-800' },
              { label: 'Will Pass', val: reviewData.pass_count, color: 'text-green-600' },
              { label: 'Will Fail', val: reviewData.fail_count, color: 'text-red-500' },
              { label: 'Class Average', val: (() => {
                const pcts = reviewData.students.filter(s => s.percentage !== null).map(s => s.percentage as number)
                return pcts.length > 0 ? `${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}%` : '—'
              })(), color: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="border-r border-gray-200 p-4 text-left last:border-r-0">
                <p className={`text-2xl font-semibold tracking-tight ${s.color}`}>{s.val}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid border-y border-gray-200" style={{ gridTemplateColumns: `repeat(${Math.min(5, reviewData.subject_stats.length)}, minmax(0, 1fr))` }}>
            {reviewData.subject_stats.map(sub => {
              const hasEntries = sub.pass_count + sub.fail_count + sub.absent_count > 0
              return (
                <div key={sub.exam_subject_id} className="border-r border-gray-200 p-4 last:border-r-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{sub.subject_name}</p>
                  {sub.pass_marks == null ? (
                    <p className="text-xs text-gray-300 italic py-1">Max/pass marks not set yet</p>
                  ) : !hasEntries ? (
                    <p className="text-xs text-gray-400 py-1">Max {sub.max_marks} · Pass {sub.pass_marks}<br/><span className="text-gray-300">No marks entered yet</span></p>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-gray-800">{sub.avg_marks ?? '—'}<span className="text-xs font-normal text-gray-400">/{sub.max_marks}</span></p>
                      <p className="text-xs text-gray-400">P:{sub.pass_count} F:{sub.fail_count} AB:{sub.absent_count}</p>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
              {(['all', 'pass', 'fail', 'risk'] as const).map(f => (
                <button key={f} onClick={() => setReviewFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${reviewFilter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {f === 'all' ? `All (${reviewData.students.length})` :
                   f === 'pass' ? `Pass (${reviewData.pass_count})` :
                   f === 'fail' ? `Fail (${reviewData.fail_count})` :
                   `At Risk (${reviewData.students.filter(s => s.percentage !== null && s.percentage >= selectedExam.passing_pct && s.percentage < selectedExam.passing_pct + 10).length})`}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs">
                    <th className="text-left px-4 py-3 font-semibold text-white">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-white">Student</th>
                    {reviewData.subject_stats.map(s => (
                      <th key={s.exam_subject_id} className="text-center px-3 py-3 font-semibold text-white">{s.subject_name}<br/><span className="text-slate-300 font-normal">/{s.max_marks}</span></th>
                    ))}
                    <th className="text-center px-3 py-3 font-semibold text-white">Total<br/><span className="text-slate-300 font-normal">/{reviewData.total_max}</span></th>
                    <th className="text-center px-3 py-3 font-semibold text-white">%</th>
                    <th className="text-center px-3 py-3 font-semibold text-white">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reviewData.students
                    .filter(s => {
                      if (reviewFilter === 'pass') return s.pass === true
                      if (reviewFilter === 'fail') return s.pass === false
                      if (reviewFilter === 'risk') return s.percentage !== null && s.percentage >= selectedExam.passing_pct && s.percentage < selectedExam.passing_pct + 10
                      return true
                    })
                    .map((s, idx) => (
                      <tr key={s.student_id} className={s.pass === false ? 'bg-red-50/40' : s.pass === true && s.percentage && s.percentage >= 80 ? 'bg-green-50/30' : ''}>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-400">Roll {s.roll_number}</p>
                        </td>
                        {reviewData.subject_stats.map(sub => {
                          const m = s.subjects[sub.subject_name]
                          return (
                            <td key={sub.exam_subject_id} className="px-3 py-2.5 text-center">
                              {m?.is_absent ? (
                                <span className="text-xs font-bold text-red-500">AB</span>
                              ) : m?.marks_obtained !== null && m?.marks_obtained !== undefined ? (
                                <span className={`text-sm font-medium ${(m.marks_obtained / sub.max_marks) * 100 < selectedExam.passing_pct ? 'text-red-500' : 'text-gray-700'}`}>
                                  {m.marks_obtained}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2.5 text-center font-semibold text-gray-800">{s.total_obtained ?? '—'}</td>
                        <td className="px-3 py-2.5 text-center font-semibold text-gray-700">{s.percentage !== null ? `${s.percentage}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          {s.pass === null ? <span className="text-xs text-gray-400">—</span> :
                           s.pass ? <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">PASS</span> :
                           <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">FAIL</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedExam.subjects.length > 0 && selectedExam.subjects.every(s => s.status === 'submitted') && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Ready to send to school admin?</h3>
              <p className="text-sm text-gray-500 mb-4">School admin does a final check and releases results to students and parents — nothing is visible to them until that happens.</p>
              <div className="space-y-2 mb-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={reviewConfirm} onChange={e => setReviewConfirm(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-green-600" />
                  <span className="text-sm text-gray-600">I have reviewed all subject marks and confirm they are correct.</span>
                </label>
              </div>
              <button onClick={handleSendToAdmin} disabled={!reviewConfirm || sendingToAdmin} data-testid="send-to-admin"
                className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors">
                {sendingToAdmin ? 'Sending…' : '✓ Send to School Admin for Release'}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">MARKS ARE LOCKED ONCE SENT</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
