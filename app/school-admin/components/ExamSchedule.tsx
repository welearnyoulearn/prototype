'use client'

import { useEffect, useState } from 'react'
import TestCalendar from '../../components/TestCalendar'

type ClassOption = { id: number; grade: string; section: string }
type ClassDetail = { subjects: Array<{ subject_name: string; teacher_id: number | null; teacher_name: string | null }> }
type SubjectRow = { subject_name: string; max_marks: number }

// Results types
type ExamListRow = {
  id: number; exam_name: string; exam_type: string; exam_date: string
  grade: string; section: string; status: string; passing_pct: number
  total_subjects: number; submitted_subjects: number
}
type SubjectStat = {
  subject_name: string; max_marks: number; teacher_name: string | null
  avg_marks: number | null; pass_count: number; fail_count: number; absent_count: number; entries: number
}
type StudentResult = {
  student_id: number; name: string; roll_number: string
  subjects: Record<string, { marks_obtained: number | null; is_absent: boolean }>
  total_obtained: number | null; total_max: number
  percentage: number | null; pass: boolean | null; grade: string | null; all_entered: boolean
}
type MarksData = {
  exam: ExamListRow; subjects: Array<{ subject_name: string; max_marks: number }>
  students: StudentResult[]; subject_stats: SubjectStat[]
  pass_count: number; fail_count: number; total_max: number
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test', mid_term: 'Mid Term', final_exam: 'Final Exam', practical: 'Practical'
}

const EXAM_TYPES = [
  { value: 'unit_test',   label: 'Unit Test' },
  { value: 'mid_term',    label: 'Mid Term' },
  { value: 'final_exam',  label: 'Final Exam' },
  { value: 'practical',   label: 'Practical' },
]

type Props = { schoolId: number }

export default function ExamSchedule({ schoolId }: Props) {
  const [view, setView]             = useState<'calendar' | 'create' | 'results'>('calendar')
  const [classes, setClasses]       = useState<ClassOption[]>([])
  const [selectedClasses, setSelectedClasses] = useState<number[]>([])
  const [form, setForm] = useState({
    exam_name: '',
    exam_type: 'unit_test',
    exam_date: '',
    passing_pct: 33,
  })
  const [subjects, setSubjects]     = useState<SubjectRow[]>([{ subject_name: '', max_marks: 100 }])
  const [notifyStudents, setNotifyStudents] = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  // Results view state
  const [examList, setExamList]         = useState<ExamListRow[]>([])
  const [examsLoading, setExamsLoading] = useState(false)
  const [selectedExam, setSelectedExam] = useState<ExamListRow | null>(null)
  const [marksData, setMarksData]       = useState<MarksData | null>(null)
  const [marksLoading, setMarksLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`)
      .then(r => r.json())
      .then(data => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [schoolId])

  // Auto-load subjects from selected class(es)
  useEffect(() => {
    if (selectedClasses.length === 0) return
    setLoadingSubjects(true)
    // Fetch subjects of the first selected class and use as template
    fetch(`/api/classes/${selectedClasses[0]}?school_id=${schoolId}`)
      .then(r => r.json())
      .then((data: ClassDetail) => {
        const subs = (data.subjects || []).map((s) => ({
          subject_name: s.subject_name,
          max_marks: 100,
        }))
        if (subs.length > 0) setSubjects(subs)
      })
      .catch(() => {})
      .finally(() => setLoadingSubjects(false))
  }, [selectedClasses[0]]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleClass(id: number) {
    setSelectedClasses(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function addSubject() {
    setSubjects(prev => [...prev, { subject_name: '', max_marks: 100 }])
  }

  function removeSubject(i: number) {
    setSubjects(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateSubject(i: number, field: keyof SubjectRow, value: string | number) {
    setSubjects(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  async function loadExamList() {
    setExamsLoading(true); setExamList([])
    try {
      const data = await fetch(`/api/exams?school_id=${schoolId}`).then(r => r.json())
      setExamList(Array.isArray(data) ? data : [])
    } finally { setExamsLoading(false) }
  }

  async function loadMarks(exam: ExamListRow) {
    setSelectedExam(exam); setMarksLoading(true); setMarksData(null)
    try {
      const data = await fetch(`/api/exams/${exam.id}/marks?school_id=${schoolId}`).then(r => r.json())
      if (data.exam) setMarksData(data)
    } finally { setMarksLoading(false) }
  }

  async function handleCreate() {
    if (!form.exam_name.trim() || !form.exam_date || selectedClasses.length === 0) {
      setSaveError('Exam name, date and at least one class are required'); return
    }
    const validSubjects = subjects.filter(s => s.subject_name.trim())
    if (validSubjects.length === 0) { setSaveError('Add at least one subject'); return }

    setSaving(true); setSaveError(''); setSaveSuccess('')
    try {
      const res = await fetch('/api/exams/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          class_ids: selectedClasses,
          exam_name: form.exam_name.trim(),
          exam_type: form.exam_type,
          exam_date: form.exam_date,
          passing_pct: form.passing_pct,
          subjects: validSubjects.map(s => ({ subject_name: s.subject_name, teacher_id: null, teacher_name: null, max_marks: s.max_marks })),
          notify_students: notifyStudents,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error || 'Failed'); setSaving(false); return }
      setSaveSuccess(`Exam scheduled for ${data.exams_created} class(es). ${data.students_notified} students notified. Class teachers notified to assign subject teachers.`)
      setView('calendar')
      setForm({ exam_name: '', exam_type: 'unit_test', exam_date: '', passing_pct: 33 })
      setSubjects([{ subject_name: '', max_marks: 100 }])
      setSelectedClasses([])
    } catch { setSaveError('Connection error') }
    setSaving(false)
  }

  const byGrade = classes.reduce<Record<string, ClassOption[]>>((acc, c) => {
    const key = `Grade ${c.grade}`
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Exam Schedule</h2>
          <p className="text-sm text-gray-500">Schedule exams and automatically notify students, class teachers, and subject teachers</p>
        </div>
        <div className="flex gap-2">
          {([
            { key: 'calendar', label: 'Calendar' },
            { key: 'results',  label: 'Results & Analysis' },
            { key: 'create',   label: '+ Schedule Exam' },
          ] as const).map(({ key, label }) => (
            <button key={key}
              onClick={() => {
                setView(key)
                if (key === 'results' && examList.length === 0) loadExamList()
                if (key !== 'create') { setSaveSuccess(''); setSaveError('') }
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${view === key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
          {saveSuccess}
        </div>
      )}

      {view === 'calendar' && (
        <TestCalendar mode="admin" schoolId={schoolId} />
      )}

      {view === 'results' && (
        <div className="flex gap-5">
          {/* Exam list sidebar */}
          <div className="w-60 flex-shrink-0">
            {examsLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Loading exams...</div>
            ) : examList.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-10 text-center">
                <p className="text-sm text-gray-400">No exams scheduled yet.</p>
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
                  <div key={type} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                      <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{type}</span>
                    </div>
                    {exams.map(e => (
                      <button key={e.id} onClick={() => loadMarks(e)}
                        className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-b-0 transition-colors ${selectedExam?.id === e.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-50'}`}>
                        <p className={`text-xs font-semibold truncate ${selectedExam?.id === e.id ? 'text-indigo-700' : 'text-gray-800'}`}>{e.exam_name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Gr.{e.grade}-{e.section} · {new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${e.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {e.status}
                          </span>
                          <span className="text-[9px] text-gray-400">{e.submitted_subjects}/{e.total_subjects} subjects</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analysis panel */}
          <div className="flex-1 min-w-0">
            {!selectedExam ? (
              <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
                <p className="text-gray-400 text-sm">Select an exam to view results</p>
              </div>
            ) : marksLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : !marksData ? (
              <div className="bg-white rounded-xl border border-gray-200 py-24 text-center">
                <p className="text-gray-400 text-sm">No marks entered yet for this exam.</p>
              </div>
            ) : <ExamAnalysisPanel data={marksData} />}
          </div>
        </div>
      )}

      {view === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: form */}
          <div className="lg:col-span-2 space-y-4">

            {/* Exam details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">Exam Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Half Yearly Examination 2025"
                    value={form.exam_name}
                    onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type *</label>
                  <select
                    value={form.exam_type}
                    onChange={e => setForm(f => ({ ...f, exam_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Date *</label>
                  <input
                    type="date"
                    value={form.exam_date}
                    onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Passing % (default 33)</label>
                  <input
                    type="number"
                    min={0} max={100}
                    value={form.passing_pct}
                    onChange={e => setForm(f => ({ ...f, passing_pct: parseInt(e.target.value) || 33 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
            </div>

            {/* Subjects — no teacher assignment, auto-loaded from class */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-gray-800">Subjects</h3>
                <div className="flex items-center gap-3">
                  {loadingSubjects && <span className="text-xs text-gray-400">Auto-loading from class...</span>}
                  <button onClick={addSubject} className="text-xs font-semibold text-indigo-600 hover:underline">+ Add</button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                {selectedClasses.length > 0 ? 'Auto-loaded from selected class. Class teacher will assign subject teachers.' : 'Select a class first to auto-load subjects.'}
              </p>
              <div className="space-y-2">
                {subjects.map((s, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Subject name *"
                      value={s.subject_name}
                      onChange={e => updateSubject(i, 'subject_name', e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        value={s.max_marks}
                        onChange={e => updateSubject(i, 'max_marks', parseInt(e.target.value) || 100)}
                        className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-center"
                        title="Max marks"
                      />
                      <span className="text-xs text-gray-400">marks</span>
                    </div>
                    {subjects.length > 1 && (
                      <button onClick={() => removeSubject(i)} className="text-gray-300 hover:text-red-400 text-lg leading-none w-6 text-center">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Who gets notified */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs font-bold text-blue-800 mb-2">Who will be notified automatically:</p>
              <ul className="space-y-1 text-xs text-blue-700">
                <li>✓ <strong>All students</strong> in selected classes — exam date &amp; subjects</li>
                <li>✓ <strong>Class teachers</strong> of selected classes — to assign subject teachers &amp; collect marks</li>
                <li>✓ <strong>Subject teachers</strong> assigned in those classes — marks entry request</li>
              </ul>
            </div>
          </div>

          {/* Right: class picker */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Select Classes *</h3>
              <p className="text-xs text-gray-400 mb-3">First class selected auto-loads subjects</p>
              <div className="space-y-3">
                {Object.entries(byGrade).sort().map(([grade, gradeClasses]) => (
                  <div key={grade}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-gray-500">{grade}</p>
                      <button
                        className="text-[10px] text-indigo-500 font-semibold"
                        onClick={() => {
                          const ids = gradeClasses.map(c => c.id)
                          const allSelected = ids.every(id => selectedClasses.includes(id))
                          if (allSelected) setSelectedClasses(prev => prev.filter(id => !ids.includes(id)))
                          else setSelectedClasses(prev => [...new Set([...prev, ...ids])])
                        }}
                      >
                        {gradeClasses.every(c => selectedClasses.includes(c.id)) ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {gradeClasses.map(c => (
                        <button
                          key={c.id}
                          onClick={() => toggleClass(c.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                            selectedClasses.includes(c.id)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                          }`}
                        >
                          {c.grade}-{c.section}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyStudents}
                  onChange={e => setNotifyStudents(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Send notifications</p>
                  <p className="text-xs text-gray-400 mt-0.5">Notify students, class teachers, and subject teachers immediately</p>
                </div>
              </label>
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{saveError}</div>
            )}

            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors"
            >
              {saving ? 'Scheduling...' : `Schedule for ${selectedClasses.length} Class${selectedClasses.length !== 1 ? 'es' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
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

  const gradeColor = (g: string | null) => {
    if (!g) return 'text-gray-300'
    if (['A1','A2'].includes(g)) return 'text-emerald-600'
    if (['B1','B2'].includes(g)) return 'text-blue-600'
    if (['C1','C2'].includes(g)) return 'text-amber-600'
    return 'text-red-500'
  }

  return (
    <div className="space-y-4">
      {/* Exam header */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">{exam.exam_name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Grade {exam.grade} – Section {exam.section} · {new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Passing: {exam.passing_pct}%
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${exam.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {exam.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Students', value: students.length, color: 'text-gray-800' },
          { label: 'Passed', value: pass_count, color: 'text-emerald-600' },
          { label: 'Failed', value: fail_count, color: 'text-red-500' },
          { label: 'Class Avg', value: classAvg !== null ? `${classAvg}%` : '—', color: classAvg !== null ? (classAvg >= 60 ? 'text-emerald-600' : classAvg >= 40 ? 'text-amber-500' : 'text-red-500') : 'text-gray-300' },
          { label: 'Topper', value: topper ? `${topper.percentage}%` : '—', color: 'text-indigo-600', sub: topper?.name },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-gray-500 truncate mt-0.5">{sub}</p>}
            <p className="text-[10px] text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Pass rate bar */}
      {pass_count + fail_count > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Pass Rate</span>
            <span className="font-semibold">{Math.round(pass_count / (pass_count + fail_count) * 100)}%</span>
          </div>
          <div className="h-2.5 bg-red-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.round(pass_count / (pass_count + fail_count) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{pass_count} passed</span>
            <span>{fail_count} failed</span>
          </div>
        </div>
      )}

      {/* Subject stats */}
      {subject_stats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                    <tr key={s.subject_name} className="hover:bg-gray-50/50">
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
                      <td className="px-4 py-2.5 text-center text-xs text-gray-400">{s.absent_count}</td>
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

      {/* Student results table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-gray-800 text-sm">Student Results</p>
          <span className="text-xs text-gray-400">{students.length} students</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 sticky left-0 bg-gray-50">Student</th>
                {subjects.map(s => (
                  <th key={s.subject_name} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                    {s.subject_name}<br/><span className="text-[9px] font-normal text-gray-400">/{s.max_marks}</span>
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Total</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">%</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Grade</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map((s, idx) => {
                const rank = ranked.findIndex(r => r.student_id === s.student_id) + 1
                return (
                  <tr key={s.student_id} className={`hover:bg-gray-50/40 ${s.pass === false ? 'bg-red-50/20' : ''}`}>
                    <td className="px-4 py-2.5 sticky left-0 bg-white">
                      <div className="flex items-center gap-2">
                        {rank > 0 && <span className="text-[10px] text-gray-300 w-4">#{rank}</span>}
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{s.name}</p>
                          <p className="text-[10px] text-gray-400">{s.roll_number}</p>
                        </div>
                      </div>
                    </td>
                    {subjects.map(sub => {
                      const m = s.subjects[sub.subject_name]
                      if (!m) return <td key={sub.subject_name} className="px-3 py-2.5 text-center text-xs text-gray-200">—</td>
                      if (m.is_absent) return <td key={sub.subject_name} className="px-3 py-2.5 text-center"><span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">AB</span></td>
                      const subPct = m.marks_obtained !== null ? (m.marks_obtained / sub.max_marks) * 100 : null
                      return (
                        <td key={sub.subject_name} className="px-3 py-2.5 text-center">
                          <span className={`text-xs font-semibold ${subPct === null ? 'text-gray-300' : subPct >= exam.passing_pct ? 'text-gray-700' : 'text-red-500'}`}>
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
                    <td className={`px-3 py-2.5 text-center text-xs font-black ${gradeColor(s.grade)}`}>{s.grade ?? '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {s.pass === null
                        ? <span className="text-[10px] text-gray-300">Pending</span>
                        : <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
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
