'use client'

import { useEffect, useState } from 'react'
import TestCalendar from '../../components/TestCalendar'

type ClassOption = { id: number; grade: string; section: string }
type ClassDetail = { subjects: Array<{ subject_name: string; teacher_id: number | null; teacher_name: string | null }> }

type SubjectRow = { subject_name: string; max_marks: number }

const EXAM_TYPES = [
  { value: 'unit_test',   label: 'Unit Test' },
  { value: 'mid_term',    label: 'Mid Term' },
  { value: 'final_exam',  label: 'Final Exam' },
  { value: 'practical',   label: 'Practical' },
]

type Props = { schoolId: number }

export default function ExamSchedule({ schoolId }: Props) {
  const [view, setView]             = useState<'calendar' | 'create'>('calendar')
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
          <button
            onClick={() => setView('calendar')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${view === 'calendar' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Calendar View
          </button>
          <button
            onClick={() => { setView('create'); setSaveSuccess(''); setSaveError('') }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${view === 'create' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            + Schedule Exam
          </button>
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
