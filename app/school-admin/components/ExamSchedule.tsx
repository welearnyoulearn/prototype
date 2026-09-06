'use client'

import { useEffect, useState } from 'react'
import TestCalendar from '../../components/TestCalendar'
import { GRADE_COLORS, type ExamGrade } from '@/lib/examGrading'

type ClassOption = { id: number; grade: string; section: string }
type ClassSubject = { id: number; subject_name: string; teacher_name: string | null }

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
  percentage: number | null; pass: boolean | null; grade: string | null; all_entered: boolean
}
type MarksData = {
  exam: ExamListRow; subjects: Array<{ subject_name: string; max_marks: number }>
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
}

type Props = { schoolId: number }

export default function ExamSchedule({ schoolId }: Props) {
  const [view, setView] = useState<'calendar' | 'create' | 'results'>('calendar')
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
        <div className="flex gap-2">
          {([
            { key: 'calendar', label: 'Calendar' },
            { key: 'results',  label: 'Results & Release' },
            { key: 'create',   label: '+ Schedule Exam' },
          ] as const).map(({ key, label }) => (
            <button key={key} data-testid={`exam-tab-${key}`}
              onClick={() => setView(key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${view === key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'calendar' && <TestCalendar mode="admin" schoolId={schoolId} />}
      {view === 'results' && <ResultsAndRelease schoolId={schoolId} />}
      {view === 'create' && <CreateExamWizard schoolId={schoolId} classes={classes} onDone={() => setView('calendar')} />}
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
  const [form, setForm] = useState({ exam_name: '', exam_type: 'unit_test', exam_date: '', passing_pct: 35 })
  const [selectedClasses, setSelectedClasses] = useState<number[]>([])
  const [subjectPreviews, setSubjectPreviews] = useState<Record<number, ClassSubject[] | 'loading' | 'error'>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  const byGrade = classes.reduce<Record<string, ClassOption[]>>((acc, c) => {
    const key = `Grade ${c.grade}`
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  function toggleClass(id: number) {
    setSelectedClasses(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      if (!prev.includes(id) && !(id in subjectPreviews)) loadPreview(id)
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
      ids.forEach(id => { if (!(id in subjectPreviews)) loadPreview(id) })
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

  function classLabel(id: number) {
    const c = classes.find(x => x.id === id)
    return c ? `${c.grade}-${c.section}` : `#${id}`
  }

  const step1Valid = form.exam_name.trim().length > 0 && form.exam_date.length > 0
  const step2Valid = selectedClasses.length > 0
  const totalSubjectSlots = selectedClasses.reduce((sum, id) => {
    const p = subjectPreviews[id]
    return sum + (Array.isArray(p) ? p.length : 0)
  }, 0)
  const classesWithNoSubjects = selectedClasses.filter(id => Array.isArray(subjectPreviews[id]) && (subjectPreviews[id] as ClassSubject[]).length === 0)

  async function handleSubmit() {
    setSaving(true); setSaveError('')
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
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error || 'Failed to schedule exam'); setSaving(false); return }
      setSaveSuccess(`${data.exams_created} exam(s) created across ${selectedClasses.length} class(es), ${data.notified} students/parents notified.`)
      setTimeout(onDone, 1400)
    } catch {
      setSaveError('Connection error')
    }
    setSaving(false)
  }

  if (saveSuccess) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
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
                step === n ? 'bg-indigo-600 text-white' : step > n ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {step > n ? '✓' : n}
              </div>
              <span className={`text-xs font-semibold whitespace-nowrap ${step === n ? 'text-indigo-700' : 'text-gray-400'}`}>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Name *</label>
            <input type="text" placeholder="e.g. Half Yearly Examination 2025" value={form.exam_name}
              onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))}
              data-testid="exam-name-input"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type *</label>
              <select value={form.exam_type} onChange={e => setForm(f => ({ ...f, exam_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Date *</label>
              <input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))}
                data-testid="exam-date-input"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Passing %</label>
              <input type="number" min={0} max={100} value={form.passing_pct}
                onChange={e => setForm(f => ({ ...f, passing_pct: parseInt(e.target.value) || 35 }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Marks entry opens automatically for subject teachers once this date passes — no manual unlock needed.</p>
          <div className="flex justify-end pt-2">
            <button onClick={() => setStep(2)} disabled={!step1Valid} data-testid="wizard-next-1"
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
              Next: Pick Classes →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1">Select Classes *</h3>
            <p className="text-xs text-gray-400 mb-3">Pick one class, several, or a whole grade — every class gets exactly the subjects it teaches.</p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {Object.entries(byGrade).sort().map(([grade, gradeClasses]) => (
                <div key={grade}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-gray-500">{grade}</p>
                    <button className="text-[10px] text-indigo-500 font-semibold" onClick={() => toggleGrade(gradeClasses)}>
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

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-1">Subject Preview</h3>
            <p className="text-xs text-gray-400 mb-3">Exactly what each selected class already teaches — nothing custom or shared across grades.</p>
            {selectedClasses.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-10">Select a class to preview its subjects</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {selectedClasses.map(id => {
                  const preview = subjectPreviews[id]
                  return (
                    <div key={id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-bold text-gray-700">{classLabel(id)}</p>
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
                            <span key={s.id} className="text-[10px] bg-gray-50 border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{s.subject_name}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 flex justify-between pt-1">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700">← Back</button>
            <button onClick={() => setStep(3)} disabled={!step2Valid} data-testid="wizard-next-2"
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Review</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Exam:</span> <span className="font-semibold text-gray-800">{form.exam_name}</span></div>
              <div><span className="text-gray-400">Type:</span> <span className="font-semibold text-gray-800">{EXAM_TYPE_LABELS[form.exam_type]}</span></div>
              <div><span className="text-gray-400">Date:</span> <span className="font-semibold text-gray-800">{new Date(form.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
              <div><span className="text-gray-400">Passing:</span> <span className="font-semibold text-gray-800">{form.passing_pct}%</span></div>
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
              <p className="text-xs text-amber-600 mt-2">⚠ {classesWithNoSubjects.map(classLabel).join(', ')} have no subjects assigned — they'll be created but can't collect marks until Class Management assigns subjects.</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-800 mb-2">What happens next:</p>
            <ul className="space-y-1 text-xs text-blue-700">
              <li>✓ Every student and their parent(s) in these classes are notified now</li>
              <li>✓ Each class teacher is notified — they'll assign subject teachers once entry opens</li>
              <li>✓ Marks entry opens automatically the day after {form.exam_date ? new Date(form.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'the exam date'}</li>
              <li>✓ Results reach students/parents only after the class teacher reviews and you release them</li>
            </ul>
          </div>

          {saveError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{saveError}</div>}

          <div className="flex justify-between pt-1">
            <button onClick={() => setStep(2)} className="px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700">← Back</button>
            <button onClick={handleSubmit} disabled={saving} data-testid="exam-create-submit"
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors">
              {saving ? 'Creating…' : `Create ${selectedClasses.length} Exam(s)`}
            </button>
          </div>
        </div>
      )}
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
      if (!res.ok) { setReleaseError(data.error || 'Failed to release'); setReleasing(false); return }
      await loadExamList()
      await loadMarks({ ...selectedExam, status: 'released' })
    } catch { setReleaseError('Connection error') }
    setReleasing(false)
  }

  return (
    <div className="flex gap-5">
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
                  <button key={e.id} onClick={() => loadMarks(e)} data-testid={`exam-list-item-${e.id}`}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-b-0 transition-colors ${selectedExam?.id === e.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-50'}`}>
                    <p className={`text-xs font-semibold truncate ${selectedExam?.id === e.id ? 'text-indigo-700' : 'text-gray-800'}`}>{e.exam_name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Gr.{e.grade}-{e.section} · {new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_LABELS[e.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[e.status]?.label ?? e.status}
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
        ) : (
          <div className="space-y-4">
            {marksData.exam.status === 'teacher_reviewed' && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-violet-800">Reviewed by the class teacher — ready to release</p>
                  <p className="text-xs text-violet-600 mt-0.5">Releasing sends results to every student and parent in this class. This cannot be undone.</p>
                </div>
                {!releaseConfirm ? (
                  <button onClick={() => setReleaseConfirm(true)} data-testid="exam-release-button"
                    className="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors flex-shrink-0">
                    Release to Students &amp; Parents
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setReleaseConfirm(false)} className="px-3 py-2 text-xs font-semibold text-gray-500">Cancel</button>
                    <button onClick={handleRelease} disabled={releasing} data-testid="exam-release-confirm"
                      className="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                      {releasing ? 'Releasing…' : 'Confirm Release'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {releaseError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{releaseError}</div>}
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

  useEffect(() => { load() }, [examId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const d = await fetch(`/api/exams/${examId}/acknowledgements?school_id=${schoolId}`).then(r => r.json())
      if (d.students) setData(d)
    } finally { setLoading(false) }
  }

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

  if (loading) return <div className="bg-white rounded-xl border border-gray-200 py-8 text-center text-sm text-gray-400">Loading acknowledgements…</div>
  if (!data) return null

  const pct = data.total > 0 ? Math.round((data.acknowledged / data.total) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                  <p className="text-[10px] text-gray-400">{s.roll_number}{s.last_nudged_at ? ` · nudged ${timeAgo(s.last_nudged_at)}` : ''}</p>
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

  const gradeColor = (g: string | null) => g ? (GRADE_COLORS[g as ExamGrade]?.split(' ')[1] ?? 'text-gray-500') : 'text-gray-300'

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">{exam.exam_name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Grade {exam.grade} – Section {exam.section} · {new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Passing: {exam.passing_pct}%
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_LABELS[exam.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
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
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-gray-500 truncate mt-0.5">{sub}</p>}
            <p className="text-[10px] text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

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
              {students.map(s => {
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
