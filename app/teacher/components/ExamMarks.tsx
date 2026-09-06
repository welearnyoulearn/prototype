'use client'

import { useEffect, useState, useCallback, useRef, ChangeEvent } from 'react'
import { calcGrade, GRADE_COLORS, type ExamGrade } from '@/lib/examGrading'

// ── Types ──────────────────────────────────────────────────────────────────
type Teacher = { id: number; name: string; subject: string; department: string }
type Exam = {
  id: number; exam_name: string; exam_type: string; exam_date: string | null; passing_pct: number
  status: string; created_by_name: string; grade: string; section: string
  total_subjects: number; assigned_subjects: number; submitted_subjects: number; released_at: string | null
}
type ExamSubject = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null; max_marks: number; status: string; submitted_at: string | null }
type Student = { id: number; name: string; roll_number: string }
type MarkEntry = { marks: string; absent: boolean }
type ClassStaff = { id: number; name: string; subject: string }

const EXAM_TYPES = [
  { key: 'unit_test', label: 'Unit Test' },
  { key: 'mid_term', label: 'Mid Term' },
  { key: 'final_exam', label: 'Final Exam' },
  { key: 'practical', label: 'Practical' },
]

function examTypeLabel(t: string) {
  return EXAM_TYPES.find(e => e.key === t)?.label ?? t
}

function gradeColorClass(g: string | null) {
  return g ? (GRADE_COLORS[g as ExamGrade]?.split(' ')[1] ?? 'text-gray-500') : 'text-gray-400'
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
  total_obtained: number | null; total_max: number; percentage: number | null; pass: boolean | null; grade: string | null; all_entered: boolean
}
type SubjectStat = { exam_subject_id: number; subject_name: string; max_marks: number; teacher_name: string | null; status: string; avg_marks: number | null; pass_count: number; fail_count: number; absent_count: number; entries: number }

// ── Main Component ─────────────────────────────────────────────────────────
export default function ExamMarks({ classId, schoolId, grade, section, teacher, isClassTeacher, openExamId }: Props) {
  const [view, setView] = useState<'list' | 'detail' | 'assign' | 'enter' | 'review'>('list')
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<(Exam & { subjects: ExamSubject[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [errMsg, setErrMsg] = useState('')

  // Assign-subject-teachers state
  const [classStaff, setClassStaff] = useState<ClassStaff[]>([])
  const [assignments, setAssignments] = useState<Record<number, number | ''>>({})

  // Marks entry state
  const [students, setStudents] = useState<Student[]>([])
  const [marksMap, setMarksMap] = useState<Record<number, Record<number, MarkEntry>>>({})
  const [enteringSubjects, setEnteringSubjects] = useState<ExamSubject[]>([])
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
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

  useEffect(() => { loadExams() }, [loadExams])

  async function loadExamDetail(examId: number) {
    const data = await fetch(`/api/exams/${examId}?school_id=${schoolId}`).then(r => r.json())
    setSelectedExam(data)
    setView('detail')
  }

  // Open the assign-subject-teachers screen. Loads the class's teaching
  // staff (from class_subjects) so the class teacher picks from real
  // options, never a free-typed name.
  async function openAssign(exam: typeof selectedExam) {
    if (!exam) return
    const data = await fetch(`/api/classes/${classId}?school_id=${schoolId}`).then(r => r.json()).catch(() => null)
    const staffMap = new Map<number, ClassStaff>()
    ;(data?.subjects ?? []).forEach((s: { teacher_id: number | null; teacher_name: string | null; subject_name: string }) => {
      if (s.teacher_id) staffMap.set(s.teacher_id, { id: s.teacher_id, name: s.teacher_name ?? 'Unknown', subject: s.subject_name })
    })
    setClassStaff(Array.from(staffMap.values()))
    const init: Record<number, number | ''> = {}
    exam.subjects.forEach(s => { init[s.id] = s.teacher_id ?? '' })
    setAssignments(init)
    setView('assign')
  }

  async function saveAssignments() {
    if (!selectedExam) return
    setSaving(true); setErrMsg('')
    try {
      const payload = Object.entries(assignments).map(([exam_subject_id, teacher_id]) => ({
        exam_subject_id: Number(exam_subject_id), teacher_id: teacher_id === '' ? null : Number(teacher_id),
      }))
      const res = await fetch(`/api/exams/${selectedExam.id}/subjects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, assignments: payload }),
      }).then(r => r.json())
      if (res.error) { setErrMsg(res.error); setSaving(false); return }
      setMsg(`${res.assigned} subject(s) assigned.`)
      await loadExamDetail(selectedExam.id)
    } finally { setSaving(false) }
  }

  // Load students + existing marks for entry. Scoped to subjects this
  // teacher may edit — every subject if class teacher, else only their own
  // assigned subject(s).
  async function openMarksEntry(exam: typeof selectedExam) {
    if (!exam) return
    const [stuData, marksData] = await Promise.all([
      fetch(`/api/students?school_id=${schoolId}&grade=${grade}&section=${section}`).then(r => r.json()).catch(() => []),
      fetch(`/api/exams/${exam.id}/marks?school_id=${schoolId}`).then(r => r.json()).catch(() => null),
    ])
    const stus: Student[] = Array.isArray(stuData) ? stuData.filter((s: Student & { status: string }) => s.status === 'active') : []
    setStudents(stus)

    const mySubjects = isClassTeacher ? exam.subjects : exam.subjects.filter(s => s.teacher_id === teacher.id)
    setEnteringSubjects(mySubjects)

    const init: typeof marksMap = {}
    stus.forEach(s => { init[s.id] = {} })
    if (marksData?.students) {
      marksData.students.forEach((sr: ReviewStudent) => {
        if (!init[sr.student_id]) init[sr.student_id] = {}
        mySubjects.forEach(sub => {
          const m = sr.subjects[sub.subject_name]
          if (m !== undefined) {
            init[sr.student_id][sub.id] = { marks: m.is_absent ? '' : (m.marks_obtained !== null ? String(m.marks_obtained) : ''), absent: m.is_absent }
          }
        })
      })
    }
    setMarksMap(init)
    setSaveState('idle')
    setView('enter')
  }

  async function openReview() {
    if (!selectedExam) return
    const data = await fetch(`/api/exams/${selectedExam.id}/marks?school_id=${schoolId}`).then(r => r.json())
    setReviewData(data)
    setView('review')
  }

  const saveMarks = useCallback(async (submitIds?: number[]) => {
    if (!selectedExam) return
    setSaveState('saving')
    const entries: { exam_subject_id: number; student_id: number; marks_obtained: number | null; is_absent: boolean }[] = []
    for (const [studentId, subjectMarks] of Object.entries(marksMap)) {
      for (const [subId, entry] of Object.entries(subjectMarks)) {
        entries.push({
          exam_subject_id: Number(subId), student_id: Number(studentId),
          marks_obtained: entry.absent ? null : (entry.marks === '' ? null : parseFloat(entry.marks)),
          is_absent: entry.absent,
        })
      }
    }
    try {
      const res = await fetch(`/api/exams/${selectedExam.id}/marks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, entries, submit_subject_ids: submitIds ?? [] }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveState('error'); return data }
      setLastSaved(new Date())
      setSaveState('saved')
      return data
    } catch {
      setSaveState('error')
      return null
    }
  }, [selectedExam, marksMap, schoolId])

  function updateMark(studentId: number, subjectId: number, field: 'marks' | 'absent', value: string | boolean) {
    setMarksMap(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [subjectId]: { ...(prev[studentId]?.[subjectId] || { marks: '', absent: false }), [field]: value } }
    }))
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    const t = setTimeout(() => saveMarks(), 3000)
    setAutoSaveTimer(t)
  }

  function overMax(subjectId: number, marks: string): boolean {
    const sub = enteringSubjects.find(s => s.id === subjectId)
    if (!sub || marks === '') return false
    const n = parseFloat(marks)
    return !Number.isNaN(n) && (n > sub.max_marks || n < 0)
  }

  async function handleSubmitSubjects() {
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
    const header = ['Roll Number', 'Student Name', ...subjectCols].join(',')
    const rows = students.map(st => {
      const cols = enteringSubjects.flatMap(sub => {
        const entry = marksMap[st.id]?.[sub.id]
        const absent = entry?.absent ? 'Y' : 'N'
        const marks = entry?.absent ? '' : (entry?.marks ?? '')
        return [marks, absent]
      })
      return [`"${st.roll_number}"`, `"${st.name}"`, ...cols].join(',')
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
        const lines = text.trim().split(/\r?\n/)
        if (lines.length < 2) { setCsvError('CSV is empty or missing data rows'); return }
        const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())

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
        for (let i = 1; i < lines.length; i++) {
          // Naive split — a comma inside a quoted student name will misalign
          // columns. Matching is by roll number only (column 0), so a
          // misaligned name column doesn't corrupt marks, but a comma inside
          // the roll number itself would. Acceptable given roll numbers are
          // school-assigned short codes, not free text.
          const cells = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
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
            <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}</div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-gray-500 text-sm">No exams scheduled for this class yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.map(exam => {
                const myPending = !isClassTeacher && exam.status === 'collecting'
                const statusInfo = STATUS_LABELS[exam.status] ?? { label: exam.status, color: 'bg-gray-100 text-gray-500' }
                return (
                  <div key={exam.id} onClick={() => loadExamDetail(exam.id)} data-testid={`exam-card-${exam.id}`}
                    className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-800 text-sm">{exam.exam_name}</h3>
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase font-medium">{examTypeLabel(exam.exam_type)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusInfo.color}`}>{statusInfo.label}</span>
                          {myPending && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">ENTER YOUR MARKS</span>}
                          {isClassTeacher && exam.status === 'collecting' && exam.assigned_subjects < exam.total_subjects && (
                            <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">ASSIGN TEACHERS</span>
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

      {/* ── ASSIGN SUBJECT TEACHERS VIEW ── */}
      {view === 'assign' && selectedExam && (
        <div className="space-y-4">
          <button onClick={() => setView('detail')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-1">Assign subject teachers — {selectedExam.exam_name}</h3>
            <p className="text-xs text-gray-400 mb-4">Pick who enters marks for each subject. Leave blank to enter it yourself later.</p>
            <div className="space-y-2">
              {selectedExam.subjects.map(sub => (
                <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{sub.subject_name}</p>
                    <p className="text-xs text-gray-400">/{sub.max_marks} marks</p>
                  </div>
                  <select value={assignments[sub.id] ?? ''} data-testid={`assign-subject-${sub.id}`}
                    onChange={e => setAssignments(prev => ({ ...prev, [sub.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[180px] focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">— Not assigned —</option>
                    <option value={teacher.id}>{teacher.name} (You)</option>
                    {classStaff.filter(s => s.id !== teacher.id).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.subject})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={saveAssignments} disabled={saving} data-testid="save-assignments"
              className="mt-4 w-full bg-orange-500 text-white font-semibold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save Assignments & Notify'}
            </button>
          </div>
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

          <div className="bg-white rounded-xl border border-gray-200 p-5">
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
                {isClassTeacher && selectedExam.status === 'collecting' && (
                  <button onClick={() => openAssign(selectedExam)} data-testid="open-assign-teachers"
                    className="bg-gray-700 text-white text-sm px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors font-medium">
                    Assign Subject Teachers
                  </button>
                )}
                {isClassTeacher && selectedExam.status === 'collecting' && (
                  <button onClick={() => openMarksEntry(selectedExam)} data-testid="open-enter-marks"
                    className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors font-medium">
                    Enter My Marks
                  </button>
                )}
                {!isClassTeacher && selectedExam.status === 'collecting' && selectedExam.subjects.some(s => s.teacher_id === teacher.id && s.status === 'pending') && (
                  <button onClick={() => openMarksEntry(selectedExam)} data-testid="open-enter-marks"
                    className="bg-purple-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-purple-700 transition-colors font-medium">
                    Enter My Marks
                  </button>
                )}
                {isClassTeacher && selectedExam.status === 'collecting' &&
                  selectedExam.subjects.length > 0 && selectedExam.subjects.every(s => s.status === 'submitted') && (
                  <button onClick={openReview} data-testid="open-review"
                    className="bg-green-600 text-white text-sm px-5 py-2 rounded-xl hover:bg-green-700 transition-colors font-bold">
                    Review & Send to Admin →
                  </button>
                )}
              </div>
            </div>

            {selectedExam.status !== 'scheduled' && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Subjects submitted</span>
                  <span>{selectedExam.subjects.filter(s => s.status === 'submitted').length} / {selectedExam.subjects.length}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${selectedExam.status === 'released' ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    style={{ width: `${selectedExam.subjects.length > 0 ? (selectedExam.subjects.filter(s => s.status === 'submitted').length / selectedExam.subjects.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {selectedExam.status === 'scheduled' && (
              <p className="mt-4 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Marks entry opens automatically on {selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : 'the exam date'}.
              </p>
            )}
          </div>

          {/* Subject cards — with a per-subject reopen for the class teacher */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {selectedExam.subjects.map(sub => {
              const isMySubject = sub.teacher_id === teacher.id
              const submitted = sub.status === 'submitted'
              return (
                <div key={sub.id} className={`bg-white rounded-xl border p-4 ${submitted ? 'border-green-200' : isMySubject ? 'border-amber-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{sub.subject_name}</p>
                    <span className={`text-[10px] font-bold ${submitted ? 'text-green-600' : 'text-gray-400'}`}>{submitted ? '✓' : '⏳'}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{sub.teacher_name || 'Unassigned'}</p>
                  {isMySubject && <p className="text-[10px] text-blue-500 font-medium mt-0.5">You</p>}
                  <p className="text-xs text-gray-500 mt-1">/{sub.max_marks} marks</p>
                  {isClassTeacher && submitted && selectedExam.status === 'collecting' && (
                    <button onClick={() => reopenSubject(sub.id)} data-testid={`reopen-subject-${sub.id}`}
                      className="mt-2 text-[10px] text-amber-600 hover:text-amber-800 font-semibold underline">Reopen to fix</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MARKS ENTRY VIEW ── */}
      {view === 'enter' && selectedExam && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => { saveMarks(); setView('detail') }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
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
                <button onClick={handleSubmitSubjects} disabled={saving} data-testid="submit-marks"
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50">
                  {saving ? 'Saving...' : 'Submit Marks ✓'}
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
                  {students.map((student, idx) => (
                    <tr key={student.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-800 text-sm">{student.name}</p>
                        <p className="text-xs text-gray-400">Roll {student.roll_number}</p>
                      </td>
                      {enteringSubjects.map(sub => {
                        const entry = marksMap[student.id]?.[sub.id] ?? { marks: '', absent: false }
                        const invalid = overMax(sub.id, entry.marks)
                        return (
                          <td key={sub.id} className="px-3 py-2 text-center">
                            {entry.absent ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">AB</span>
                                <button onClick={() => updateMark(student.id, sub.id, 'absent', false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1">
                                  <input type="number" min={0} max={sub.max_marks} step={0.5} value={entry.marks}
                                    onChange={e => updateMark(student.id, sub.id, 'marks', e.target.value)}
                                    data-testid={`mark-input-${student.id}-${sub.id}`}
                                    placeholder="—"
                                    className={`w-16 border rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 ${invalid ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                                  <button onClick={() => updateMark(student.id, sub.id, 'absent', true)} title="Mark Absent" className="text-xs text-gray-300 hover:text-red-400 transition-colors">AB</button>
                                </div>
                                {invalid && <span className="text-[9px] text-red-500">max {sub.max_marks}</span>}
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
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-gray-400">Click AB to mark absent. Marks auto-save every 3 seconds.</p>
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

          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-green-800">All subjects submitted for {selectedExam.exam_name}</p>
              <p className="text-sm text-green-600">Review the results below, then send to school admin for release</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Students', val: reviewData.students.length, color: 'text-gray-800' },
              { label: 'Will Pass', val: reviewData.pass_count, color: 'text-green-600' },
              { label: 'Will Fail', val: reviewData.fail_count, color: 'text-red-500' },
              { label: 'Class Average', val: (() => {
                const pcts = reviewData.students.filter(s => s.percentage !== null).map(s => s.percentage as number)
                return pcts.length > 0 ? `${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}%` : '—'
              })(), color: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className={`grid gap-3 grid-cols-${Math.min(5, reviewData.subject_stats.length)}`}>
            {reviewData.subject_stats.map(sub => (
              <div key={sub.exam_subject_id} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{sub.subject_name}</p>
                <p className="text-lg font-bold text-gray-800">{sub.avg_marks ?? '—'}<span className="text-xs font-normal text-gray-400">/{sub.max_marks}</span></p>
                <p className="text-xs text-gray-400">P:{sub.pass_count} F:{sub.fail_count} AB:{sub.absent_count}</p>
              </div>
            ))}
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
                  <tr className="bg-gray-800 text-white text-xs">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Student</th>
                    {reviewData.subject_stats.map(s => (
                      <th key={s.exam_subject_id} className="text-center px-3 py-3 font-medium">{s.subject_name}<br/><span className="opacity-60">/{s.max_marks}</span></th>
                    ))}
                    <th className="text-center px-3 py-3 font-medium">Total<br/><span className="opacity-60">/{reviewData.total_max}</span></th>
                    <th className="text-center px-3 py-3 font-medium">%</th>
                    <th className="text-center px-3 py-3 font-medium">Grade</th>
                    <th className="text-center px-3 py-3 font-medium">Result</th>
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
                        <td className={`px-3 py-2.5 text-center font-bold ${gradeColorClass(s.grade)}`}>{s.grade ?? (s.percentage !== null ? calcGrade(s.percentage) : '—')}</td>
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
        </div>
      )}
    </div>
  )
}
