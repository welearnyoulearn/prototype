'use client'

import { useEffect, useState, useCallback, useRef, ChangeEvent } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
type Teacher = { id: number; name: string; subject: string; department: string; class_teacher_grade: string | null; class_teacher_section: string | null }
type Exam = { id: number; exam_name: string; exam_type: string; exam_date: string | null; passing_pct: number; status: string; created_by: number; created_by_name: string; grade: string; section: string; total_subjects: number; submitted_subjects: number; published_at: string | null }
type ExamSubject = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null; max_marks: number; status: string; submitted_at: string | null }
type Student = { id: number; name: string; roll_number: string }
type MarkEntry = { marks: string; absent: boolean }
type ClassSubject = { subject_name: string; teacher_id: number | null; teacher_name: string | null }

const EXAM_TYPES = [
  { key: 'unit_test', label: 'Unit Test' },
  { key: 'mid_term', label: 'Mid Term' },
  { key: 'final_exam', label: 'Final Exam' },
  { key: 'practical', label: 'Practical' },
]

function examTypeLabel(t: string) {
  return EXAM_TYPES.find(e => e.key === t)?.label ?? t
}

function gradeColor(g: string | null) {
  if (!g) return 'text-gray-400'
  if (['A1', 'A2'].includes(g)) return 'text-emerald-600'
  if (['B1', 'B2'].includes(g)) return 'text-blue-600'
  if (['C1', 'C2'].includes(g)) return 'text-amber-600'
  if (g === 'D') return 'text-orange-500'
  return 'text-red-500'
}

function calcGrade(pct: number): string {
  if (pct >= 91) return 'A1'
  if (pct >= 81) return 'A2'
  if (pct >= 71) return 'B1'
  if (pct >= 61) return 'B2'
  if (pct >= 51) return 'C1'
  if (pct >= 41) return 'C2'
  if (pct >= 33) return 'D'
  return 'E'
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

// ── Main Component ─────────────────────────────────────────────────────────
export default function ExamMarks({ classId, schoolId, grade, section, teacher, isClassTeacher, openExamId }: Props) {
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'enter' | 'review'>('list')
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<(Exam & { subjects: ExamSubject[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Create form state
  const [createForm, setCreateForm] = useState({ exam_name: '', exam_type: 'unit_test', exam_date: '', passing_pct: 35 })
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<Record<string, { checked: boolean; max_marks: number; teacher_id: number | null; teacher_name: string | null }>>({})

  // Marks entry state
  const [students, setStudents] = useState<Student[]>([])
  const [marksMap, setMarksMap] = useState<Record<number, Record<string, MarkEntry>>>({})
  const [enteringSubjects, setEnteringSubjects] = useState<ExamSubject[]>([])
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // CSV import state
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [csvError, setCsvError] = useState('')

  // Review state
  const [reviewData, setReviewData] = useState<{ students: ReviewStudent[]; subject_stats: SubjectStat[]; total_max: number; pass_count: number; fail_count: number } | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pass' | 'fail' | 'risk'>('all')
  const [publishing, setPublishing] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(false)

  type ReviewStudent = {
    student_id: number; name: string; roll_number: string
    subjects: Record<string, { marks_obtained: number | null; is_absent: boolean }>
    total_obtained: number | null; total_max: number; percentage: number | null; pass: boolean | null; grade: string | null; all_entered: boolean
  }
  type SubjectStat = { subject_name: string; max_marks: number; teacher_name: string | null; status: string; avg_marks: number | null; pass_count: number; fail_count: number; absent_count: number; entries: number }

  // Load exams list
  const loadExams = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/exams?school_id=${schoolId}&class_id=${classId}`).then(r => r.json()).catch(() => [])
    const examList = Array.isArray(res) ? res : []
    setExams(examList)
    setLoading(false)
    // Auto-open exam from notification deep-link
    if (openExamId && examList.length > 0) {
      const target = examList.find((e: Exam) => e.id === openExamId)
      if (target) openExamDetail(target)
    }
  }, [schoolId, classId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadExams() }, [loadExams])

  // Load class subjects for create form
  useEffect(() => {
    if (view !== 'create') return
    fetch(`/api/classes/${classId}?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => {
        const subs: ClassSubject[] = (data.subjects || []).map((s: { subject_name: string; teacher_id: number | null; teacher_name: string | null }) => ({
          subject_name: s.subject_name,
          teacher_id: s.teacher_id,
          teacher_name: s.teacher_name,
        }))
        setClassSubjects(subs)
        const initial: typeof selectedSubjects = {}
        subs.forEach(s => {
          initial[s.subject_name] = { checked: true, max_marks: 100, teacher_id: s.teacher_id, teacher_name: s.teacher_name }
        })
        setSelectedSubjects(initial)
      })
      .catch(() => {})
  }, [view, classId, schoolId])

  // Load exam detail
  async function loadExamDetail(examId: number) {
    const data = await fetch(`/api/exams/${examId}?school_id=${schoolId}`).then(r => r.json())
    setSelectedExam(data)
    setView('detail')
  }

  // Auto-open exam (from notification deep-link)
  async function openExamDetail(exam: Exam) {
    await loadExamDetail(exam.id)
  }

  // Load students for marks entry
  async function openMarksEntry(exam: typeof selectedExam) {
    if (!exam) return
    const [stuData, marksData] = await Promise.all([
      fetch(`/api/students?school_id=${schoolId}&grade=${grade}&section=${section}`).then(r => r.json()).catch(() => []),
      fetch(`/api/exams/${exam.id}/marks?school_id=${schoolId}`).then(r => r.json()).catch(() => null),
    ])
    const stus: Student[] = Array.isArray(stuData) ? stuData.filter((s: Student & { status: string }) => s.status === 'active') : []
    setStudents(stus)

    // Determine which subjects this teacher can enter
    const mySubjects = isClassTeacher
      ? exam.subjects
      : exam.subjects.filter(s => s.teacher_id === teacher.id)
    setEnteringSubjects(mySubjects)

    // Initialize marks map from existing data
    const init: typeof marksMap = {}
    stus.forEach(s => { init[s.id] = {} })
    if (marksData?.students) {
      marksData.students.forEach((sr: ReviewStudent) => {
        if (!init[sr.student_id]) init[sr.student_id] = {}
        mySubjects.forEach(sub => {
          const m = sr.subjects[sub.subject_name]
          if (m !== undefined) {
            init[sr.student_id][sub.subject_name] = {
              marks: m.is_absent ? '' : (m.marks_obtained !== null ? String(m.marks_obtained) : ''),
              absent: m.is_absent,
            }
          }
        })
      })
    }
    setMarksMap(init)
    setView('enter')
  }

  // Load review data
  async function openReview() {
    if (!selectedExam) return
    const data = await fetch(`/api/exams/${selectedExam.id}/marks?school_id=${schoolId}`).then(r => r.json())
    setReviewData(data)
    setView('review')
  }

  // Create exam
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createForm.exam_name.trim()) return
    const subjects = Object.entries(selectedSubjects)
      .filter(([, v]) => v.checked)
      .map(([subject_name, v]) => ({ subject_name, teacher_id: v.teacher_id, teacher_name: v.teacher_name, max_marks: v.max_marks }))
    if (subjects.length === 0) { setMsg('Select at least one subject'); return }

    setSaving(true)
    try {
      const examRes = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: classId, teacher_id: teacher.id, ...createForm }),
      }).then(r => r.json())
      if (examRes.error) { setMsg(examRes.error); return }

      // Set subjects + start collecting + notify subject teachers
      const subRes = await fetch(`/api/exams/${examRes.id}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, teacher_id: teacher.id, subjects }),
      }).then(r => r.json())

      const notified = subRes.notified ?? 0
      setMsg(notified > 0 ? `Exam created! ${notified} teacher(s) notified to enter marks.` : 'Exam created!')
      await loadExams()
      await loadExamDetail(examRes.id)
    } finally {
      setSaving(false)
    }
  }

  // Save marks (auto-save or manual)
  const saveMarks = useCallback(async (submitSubjectNames?: string[]) => {
    if (!selectedExam) return
    const entries: { student_id: number; subject_name: string; marks_obtained: number | null; is_absent: boolean }[] = []
    for (const [studentId, subjectMarks] of Object.entries(marksMap)) {
      for (const [subName, entry] of Object.entries(subjectMarks)) {
        entries.push({
          student_id: parseInt(studentId),
          subject_name: subName,
          marks_obtained: entry.absent ? null : (entry.marks === '' ? null : parseFloat(entry.marks)),
          is_absent: entry.absent,
        })
      }
    }
    const res = await fetch(`/api/exams/${selectedExam.id}/marks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId, teacher_id: teacher.id,
        entries,
        submit_subjects: submitSubjectNames ?? [],
      }),
    }).then(r => r.json())
    setLastSaved(new Date())
    return res
  }, [selectedExam, marksMap, schoolId, teacher.id])

  // Auto-save on marks change
  function updateMark(studentId: number, subjectName: string, field: 'marks' | 'absent', value: string | boolean) {
    setMarksMap(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [subjectName]: { ...(prev[studentId]?.[subjectName] || { marks: '', absent: false }), [field]: value } }
    }))
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    const t = setTimeout(() => saveMarks(), 3000)
    setAutoSaveTimer(t)
  }

  // Submit subjects and go back to detail
  async function handleSubmitSubjects() {
    setSaving(true)
    const subjectNames = enteringSubjects.map(s => s.subject_name)
    await saveMarks(subjectNames)
    setSaving(false)
    setMsg('Marks submitted!')
    await loadExamDetail(selectedExam!.id)
    setView('detail')
  }

  // Publish
  async function handlePublish() {
    if (!selectedExam || !publishConfirm) return
    setPublishing(true)
    const res = await fetch(`/api/exams/${selectedExam.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, teacher_id: teacher.id }),
    }).then(r => r.json())
    setPublishing(false)
    if (res.error) { setMsg(res.error); return }
    setMsg(`Published! ${res.students_notified} students notified.`)
    await loadExams()
    await loadExamDetail(selectedExam.id)
    setView('detail')
  }

  // Download CSV template for current marks entry
  function downloadTemplate() {
    if (!selectedExam || students.length === 0 || enteringSubjects.length === 0) return
    const subjectCols = enteringSubjects.flatMap(s => [`${s.subject_name} (/${s.max_marks})`, `${s.subject_name} Absent (Y/N)`])
    const header = ['Roll Number', 'Student Name', ...subjectCols].join(',')
    const rows = students.map(st => {
      const cols = enteringSubjects.flatMap(sub => {
        const entry = marksMap[st.id]?.[sub.subject_name]
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

  // Parse uploaded CSV and populate marks map
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

        // Map header names to subject and type (marks vs absent)
        const subjectColMap: Array<{ subjectName: string; type: 'marks' | 'absent' } | null> = headers.map(h => {
          for (const sub of enteringSubjects) {
            if (h === `${sub.subject_name} (/${sub.max_marks})`) return { subjectName: sub.subject_name, type: 'marks' }
            if (h === `${sub.subject_name} Absent (Y/N)`) return { subjectName: sub.subject_name, type: 'absent' }
          }
          return null
        })

        // Build roll_number → student_id map
        const rollMap = new Map<string, number>()
        students.forEach(s => rollMap.set(s.roll_number.trim(), s.id))

        let imported = 0
        const newMap = { ...marksMap }
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
          const roll = cells[0]
          const studentId = rollMap.get(roll)
          if (!studentId) continue
          if (!newMap[studentId]) newMap[studentId] = {}
          subjectColMap.forEach((col, idx) => {
            if (!col) return
            const val = cells[idx] ?? ''
            if (!newMap[studentId][col.subjectName]) newMap[studentId][col.subjectName] = { marks: '', absent: false }
            if (col.type === 'absent') {
              newMap[studentId][col.subjectName].absent = val.toUpperCase() === 'Y'
              if (val.toUpperCase() === 'Y') newMap[studentId][col.subjectName].marks = ''
            } else if (col.type === 'marks') {
              if (!newMap[studentId][col.subjectName].absent) {
                newMap[studentId][col.subjectName].marks = val
              }
            }
            imported++
          })
        }
        setMarksMap(newMap)
        setMsg(`CSV imported successfully! Review and submit when ready.`)
      } catch {
        setCsvError('Failed to parse CSV. Please use the downloaded template.')
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-uploaded
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

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Marks & Results — Grade {grade} {section}</h2>
              <p className="text-xs text-gray-400 mt-0.5">All exams for this class</p>
            </div>
            {isClassTeacher && (
              <button
                onClick={() => { setCreateForm({ exam_name: '', exam_type: 'unit_test', exam_date: '', passing_pct: 35 }); setView('create') }}
                className="flex items-center gap-2 bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-orange-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Exam
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}</div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-gray-500 text-sm">{isClassTeacher ? 'No exams yet. Create your first exam.' : 'No exams found for this class.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.map(exam => {
                const myPending = !isClassTeacher && exam.status === 'collecting'
                return (
                  <div
                    key={exam.id}
                    onClick={() => loadExamDetail(exam.id)}
                    className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-800 text-sm">{exam.exam_name}</h3>
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase font-medium">{examTypeLabel(exam.exam_type)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            exam.status === 'published' ? 'bg-green-100 text-green-700' :
                            exam.status === 'collecting' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{exam.status}</span>
                          {myPending && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">ENTER YOUR MARKS</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {exam.exam_date || 'No date set'} · Passing: {exam.passing_pct}%
                          {exam.status !== 'draft' && ` · ${exam.submitted_subjects}/${exam.total_subjects} subjects submitted`}
                        </p>
                      </div>
                      {exam.status !== 'draft' && (
                        <div className="flex-shrink-0">
                          <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${exam.status === 'published' ? 'bg-green-500' : 'bg-amber-400'}`}
                              style={{ width: `${exam.total_subjects > 0 ? (exam.submitted_subjects / exam.total_subjects) * 100 : 0}%` }}
                            />
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

      {/* ── CREATE VIEW ── */}
      {view === 'create' && (
        <div className="space-y-4">
          <button onClick={() => setView('list')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to exams
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main form */}
            <div className="lg:col-span-2 space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-5 py-3">
                {['Exam Details', 'Enter Marks', 'Review', 'Publish'].map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <div className="w-8 h-px bg-gray-200" />}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{i + 1}</div>
                      <span className={`text-xs font-medium hidden sm:block ${i === 0 ? 'text-orange-600' : 'text-gray-400'}`}>{s}</span>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                {/* Exam Details */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 mb-4">Exam Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Exam Name</label>
                      <input
                        value={createForm.exam_name}
                        onChange={e => setCreateForm(f => ({ ...f, exam_name: e.target.value }))}
                        placeholder="e.g. Unit Test 1"
                        required
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Exam Date</label>
                      <input
                        type="date"
                        value={createForm.exam_date}
                        onChange={e => setCreateForm(f => ({ ...f, exam_date: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Exam Type</label>
                    <div className="flex flex-wrap gap-2">
                      {EXAM_TYPES.map(t => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setCreateForm(f => ({ ...f, exam_type: t.key }))}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${createForm.exam_type === t.key ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subjects */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Subjects & Max Marks</h3>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full font-medium">
                      {Object.values(selectedSubjects).filter(v => v.checked).length} Selected
                    </span>
                  </div>
                  {classSubjects.length === 0 ? (
                    <p className="text-sm text-gray-400">Loading subjects...</p>
                  ) : (
                    <div className="space-y-2">
                      {classSubjects.map(sub => {
                        const sel = selectedSubjects[sub.subject_name]
                        return (
                          <div key={sub.subject_name} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${sel?.checked ? 'border-orange-200 bg-orange-50/40' : 'border-gray-100 bg-gray-50/50'}`}>
                            <input
                              type="checkbox"
                              checked={sel?.checked ?? false}
                              onChange={e => setSelectedSubjects(prev => ({ ...prev, [sub.subject_name]: { ...prev[sub.subject_name], checked: e.target.checked } }))}
                              className="w-4 h-4 rounded accent-orange-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">{sub.subject_name}</p>
                              <p className="text-xs text-gray-400">{sub.teacher_name || 'No teacher assigned'} {sub.teacher_id === teacher.id ? '· You' : ''}</p>
                            </div>
                            {sel?.checked && (
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500">Max:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={500}
                                  value={sel.max_marks}
                                  onChange={e => setSelectedSubjects(prev => ({ ...prev, [sub.subject_name]: { ...prev[sub.subject_name], max_marks: parseInt(e.target.value) || 100 } }))}
                                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-300"
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-orange-500 text-white font-semibold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Creating...' : 'Create Exam & Notify Teachers →'}
                </button>
              </form>
            </div>

            {/* Config sidebar */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Configuration</p>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Passing Criteria %</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={createForm.passing_pct}
                    onChange={e => setCreateForm(f => ({ ...f, passing_pct: parseInt(e.target.value) || 35 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div className="mt-3 bg-blue-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Pro Tip</p>
                  <p className="text-xs text-blue-600">Subjects are auto-assigned to their teachers from the class timetable. You can edit max marks per subject.</p>
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-white">
                <p className="text-xs text-slate-400 mb-1">Students in class</p>
                <p className="text-2xl font-bold">Grade {grade}-{section}</p>
              </div>
            </div>
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

          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-800">{selectedExam.exam_name}</h2>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">{examTypeLabel(selectedExam.exam_type)}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                    selectedExam.status === 'published' ? 'bg-green-100 text-green-700' :
                    selectedExam.status === 'collecting' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{selectedExam.status}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Grade {selectedExam.grade}-{selectedExam.section} · {selectedExam.exam_date || 'No date'} · Pass: {selectedExam.passing_pct}%
                  {selectedExam.published_at && ` · Published ${new Date(selectedExam.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isClassTeacher && selectedExam.status !== 'published' && (
                  <button
                    onClick={() => openMarksEntry(selectedExam)}
                    className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors font-medium"
                  >
                    Enter My Marks
                  </button>
                )}
                {!isClassTeacher && selectedExam.subjects.some(s => s.teacher_id === teacher.id && s.status === 'pending') && (
                  <button
                    onClick={() => openMarksEntry(selectedExam)}
                    className="bg-purple-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-purple-700 transition-colors font-medium"
                  >
                    Enter My Marks
                  </button>
                )}
                {isClassTeacher && selectedExam.status === 'collecting' &&
                  selectedExam.subjects.every(s => s.status === 'submitted') && (
                  <button
                    onClick={openReview}
                    className="bg-green-600 text-white text-sm px-5 py-2 rounded-xl hover:bg-green-700 transition-colors font-bold"
                  >
                    Review & Publish →
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {selectedExam.status !== 'draft' && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Subjects submitted</span>
                  <span>{selectedExam.subjects.filter(s => s.status === 'submitted').length} / {selectedExam.subjects.length}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${selectedExam.status === 'published' ? 'bg-green-500' : 'bg-amber-400'}`}
                    style={{ width: `${selectedExam.subjects.length > 0 ? (selectedExam.subjects.filter(s => s.status === 'submitted').length / selectedExam.subjects.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Subject cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {selectedExam.subjects.map(sub => {
              const isMySubject = sub.teacher_id === teacher.id
              const submitted = sub.status === 'submitted'
              return (
                <div key={sub.subject_name} className={`bg-white rounded-xl border p-4 ${submitted ? 'border-green-200' : isMySubject ? 'border-amber-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{sub.subject_name}</p>
                    <span className={`text-[10px] font-bold ${submitted ? 'text-green-600' : 'text-gray-400'}`}>{submitted ? '✓' : '⏳'}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{sub.teacher_name || 'Unassigned'}</p>
                  {isMySubject && <p className="text-[10px] text-blue-500 font-medium mt-0.5">You</p>}
                  <p className="text-xs text-gray-500 mt-1">/{sub.max_marks} marks</p>
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
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {lastSaved && <span>Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-bold text-gray-800">{selectedExam.exam_name} · Grade {grade}-{section}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Entering marks for: {enteringSubjects.map(s => s.subject_name).join(', ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={downloadTemplate}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1"
                  title="Download CSV template pre-filled with student list"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Template
                </button>
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="text-xs border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1 font-medium"
                  title="Upload filled CSV to import marks"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Upload CSV
                </button>
                <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                <button
                  onClick={() => saveMarks()}
                  disabled={saving}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Save Draft
                </button>
                <button
                  onClick={handleSubmitSubjects}
                  disabled={saving}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
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

          {/* Marks grid */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                    {enteringSubjects.map(sub => (
                      <th key={sub.subject_name} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[100px]">
                        {sub.subject_name}<br />
                        <span className="text-gray-400 normal-case font-normal">/{sub.max_marks}</span>
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
                        const entry = marksMap[student.id]?.[sub.subject_name] ?? { marks: '', absent: false }
                        return (
                          <td key={sub.subject_name} className="px-3 py-2 text-center">
                            {entry.absent ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">AB</span>
                                <button onClick={() => updateMark(student.id, sub.subject_name, 'absent', false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={sub.max_marks}
                                  step={0.5}
                                  value={entry.marks}
                                  onChange={e => updateMark(student.id, sub.subject_name, 'marks', e.target.value)}
                                  placeholder="—"
                                  className={`w-16 border rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                                    entry.marks !== '' && parseFloat(entry.marks) > sub.max_marks ? 'border-red-300 bg-red-50' : 'border-gray-200'
                                  }`}
                                />
                                <button
                                  onClick={() => updateMark(student.id, sub.subject_name, 'absent', true)}
                                  title="Mark Absent"
                                  className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                                >AB</button>
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

          {/* Summary banner */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-green-800">All subjects submitted for {selectedExam.exam_name}</p>
              <p className="text-sm text-green-600">Review the results below and publish when ready</p>
            </div>
          </div>

          {/* Stats */}
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

          {/* Subject cards */}
          <div className={`grid gap-3 grid-cols-${Math.min(5, reviewData.subject_stats.length)}`}>
            {reviewData.subject_stats.map(sub => (
              <div key={sub.subject_name} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{sub.subject_name}</p>
                <p className="text-lg font-bold text-gray-800">{sub.avg_marks ?? '—'}<span className="text-xs font-normal text-gray-400">/{sub.max_marks}</span></p>
                <p className="text-xs text-gray-400">P:{sub.pass_count} F:{sub.fail_count} AB:{sub.absent_count}</p>
              </div>
            ))}
          </div>

          {/* Results table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
              {(['all', 'pass', 'fail', 'risk'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setReviewFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${reviewFilter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
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
                      <th key={s.subject_name} className="text-center px-3 py-3 font-medium">{s.subject_name}<br/><span className="opacity-60">/{s.max_marks}</span></th>
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
                            <td key={sub.subject_name} className="px-3 py-2.5 text-center">
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
                        <td className={`px-3 py-2.5 text-center font-bold ${gradeColor(s.grade)}`}>{s.grade ?? '—'}</td>
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

          {/* Publish section */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Ready to announce results?</h3>
            <p className="text-sm text-gray-500 mb-4">Once published, marks will be instantly visible to all students of Grade {grade}-{section}.</p>
            <div className="space-y-2 mb-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={publishConfirm} onChange={e => setPublishConfirm(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-green-600" />
                <span className="text-sm text-gray-600">I have reviewed all subject marks and confirm they are correct.</span>
              </label>
            </div>
            <button
              onClick={handlePublish}
              disabled={!publishConfirm || publishing}
              className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {publishing ? 'Publishing...' : '✓ Publish All Results to Students'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">ACTION IS IRREVERSIBLE ONCE CONFIRMED</p>
          </div>
        </div>
      )}
    </div>
  )
}
