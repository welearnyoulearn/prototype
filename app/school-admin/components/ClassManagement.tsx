'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { CURRICULA } from '@/lib/curricula'

type Props = { schoolId: number }

type ClassRow = { id: number; grade: string; section: string; class_teacher_id: number | null; class_teacher_name: string | null; student_count: number; timetable_generated_at: string | null }
type Teacher = { id: number; name: string; subject: string; employee_id: string; department: string }
type Subject = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null; periods_per_week: number }
type TimetableSlot = { id: number; day_of_week: string; period_number: number; time_from: string; time_to: string; subject_name: string | null; teacher_id: number | null; teacher_name: string | null; is_break: boolean; break_label: string | null; room: string | null; has_conflict?: boolean; source?: string }
type Student = { id: number; name: string; roll_number: string; email: string; phone: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getSuggestedSubjects(grade: string): string[] {
  const g = String(grade)
  const cbse = CURRICULA['CBSE']?.find(x => x.grade === g)
  const apssc = CURRICULA['APSSC']?.find(x => x.grade === g)
  const names = new Set<string>()
  cbse?.subjects.forEach(s => names.add(s.name))
  apssc?.subjects.forEach(s => names.add(s.name))
  if (names.size === 0) {
    ['English', 'Mathematics', 'Science', 'Social Science', 'Hindi', 'Physical Education'].forEach(s => names.add(s))
  }
  return Array.from(names)
}

export default function ClassManagement({ schoolId }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Selected class
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedClass = classes.find(c => c.id === selectedId) ?? null

  // Add class form
  const [showAdd, setShowAdd] = useState(false)
  const [newClass, setNewClass] = useState({ grade: '', section: '', class_teacher_id: '' })
  const [addingClass, setAddingClass] = useState(false)
  const [setupMsg, setSetupMsg] = useState<string | null>(null)

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300'

  useEffect(() => { loadData() }, [schoolId])

  async function loadData() {
    setLoading(true)
    try {
      const [cls, tch] = await Promise.all([
        fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json()),
      ])
      setClasses(Array.isArray(cls) ? cls : [])
      setTeachers(Array.isArray(tch) ? tch : [])
    } catch { setError('Failed to load') }
    finally { setLoading(false) }
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault()
    const grade = newClass.grade.trim()
    const section = newClass.section.trim().toUpperCase()
    if (!grade || !section) { setError('Grade and Section required'); return }
    if (!/^[0-9]+$/.test(grade) || parseInt(grade) < 1 || parseInt(grade) > 12) { setError('Grade must be 1–12'); return }
    if (!/^[A-Z]$/.test(section)) { setError('Section must be a single letter A–Z'); return }
    setAddingClass(true)
    setSetupMsg('Creating class...')
    try {
      // Step 1: Create class — backend auto-assigns subjects + teachers
      const res = await fetch('/api/classes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, grade, section, class_teacher_id: newClass.class_teacher_id || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Step 2: Auto-generate timetable
      const subCount = data.subjects_assigned ?? 0
      setSetupMsg(`${subCount} subjects assigned · Generating timetable...`)
      await fetch('/api/class-timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: data.id }),
      })

      setNewClass({ grade: '', section: '', class_teacher_id: '' })
      setShowAdd(false)
      setSetupMsg(null)
      await loadData()
      setSelectedId(data.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add class')
      setSetupMsg(null)
    }
    finally { setAddingClass(false) }
  }

  async function deleteClass(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    if (!confirm('Delete this class and all its data?')) return
    try {
      await fetch(`/api/classes/${id}`, { method: 'DELETE' })
      setClasses(prev => prev.filter(c => c.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch { setError('Failed to delete class') }
  }

  // Group by grade
  const byGrade: Record<string, ClassRow[]> = {}
  for (const c of classes) {
    if (!byGrade[c.grade]) byGrade[c.grade] = []
    byGrade[c.grade].push(c)
  }
  const sortedGrades = Object.keys(byGrade).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b)
    return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb
  })

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading classes...</div>

  return (
    <div className="flex gap-0 h-full min-h-[600px]">
      {/* ── Left sidebar: class list ── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white rounded-l-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Classes</span>
          <button onClick={() => setShowAdd(v => !v)}
            className="w-6 h-6 flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white rounded-md text-sm font-bold transition-colors">+</button>
        </div>

        {error && (
          <div className="mx-3 mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-2 text-red-400">✕</button>
          </div>
        )}

        {showAdd && (
          <form onSubmit={addClass} className="mx-3 mt-3 bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Grade*</label>
                <input required value={newClass.grade} onChange={e => setNewClass(f => ({ ...f, grade: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 w-full" placeholder="10" />
              </div>
              <div className="w-14">
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Sec*</label>
                <input required value={newClass.section} onChange={e => setNewClass(f => ({ ...f, section: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 w-full" placeholder="A" />
              </div>
            </div>
            <select value={newClass.class_teacher_id} onChange={e => setNewClass(f => ({ ...f, class_teacher_id: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none w-full">
              <option value="">No class teacher</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="flex gap-1.5">
              <button type="submit" disabled={addingClass}
                className="flex-1 bg-violet-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50">
                {addingClass ? (setupMsg ?? 'Setting up...') : 'Create & Setup'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-200 text-gray-500 text-xs py-1.5 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {classes.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6 px-3">No classes yet.<br/>Click + to add one.</p>
          ) : (
            sortedGrades.map(grade => (
              <div key={grade} className="mb-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-1">Grade {grade}</p>
                {byGrade[grade].map(cls => (
                  <div key={cls.id}
                    onClick={() => setSelectedId(cls.id)}
                    className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                      selectedId === cls.id ? 'bg-violet-50 border-r-2 border-violet-500' : 'hover:bg-gray-50'
                    }`}>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${selectedId === cls.id ? 'text-violet-700' : 'text-gray-800'}`}>
                        {cls.grade}-{cls.section}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {cls.student_count} students
                      </p>
                      {cls.timetable_generated_at
                        ? <p className="text-[10px] text-emerald-500 font-medium">Timetable ready</p>
                        : <p className="text-[10px] text-amber-400">No timetable</p>}
                    </div>
                    <button onClick={e => deleteClass(e, cls.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 text-xs p-0.5 transition-all flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: class detail ── */}
      <div className="flex-1 min-w-0 bg-white rounded-r-xl overflow-hidden">
        {selectedClass ? (
          <ClassDetail
            cls={selectedClass}
            schoolId={schoolId}
            teachers={teachers}
            onClassUpdated={(updates) => setClasses(prev => prev.map(c => c.id === updates.id ? { ...c, ...updates } : c))}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-24 text-center px-8">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Select a class</p>
            <p className="text-gray-400 text-sm mt-1">Choose a class from the left to manage subjects, timetable and students</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Class Detail (right panel) ────────────────────────────────────────────────
function ClassDetail({
  cls, schoolId, teachers, onClassUpdated
}: {
  cls: ClassRow
  schoolId: number
  teachers: Teacher[]
  onClassUpdated: (updates: Partial<ClassRow> & { id: number }) => void
}) {
  const [tab, setTab] = useState<'subjects' | 'timetable' | 'students'>('subjects')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subLoading, setSubLoading] = useState(true)
  const [subjectMsg, setSubjectMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [addingSubject, setAddingSubject] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [newPPW, setNewPPW] = useState('4')
  const [newTeacher, setNewTeacher] = useState('')
  const [editingClassTeacher, setEditingClassTeacher] = useState(false)
  const [ctId, setCtId] = useState(String(cls.class_teacher_id || ''))
  const [savingCT, setSavingCT] = useState(false)
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [ttLoading, setTtLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [editSlotId, setEditSlotId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editTeacher, setEditTeacher] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [studLoading, setStudLoading] = useState(false)

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300'

  const loadSubjects = useCallback(async () => {
    setSubLoading(true)
    try {
      const data = await fetch(`/api/classes/${cls.id}/subjects`).then(r => r.json())
      setSubjects(Array.isArray(data) ? data : [])
    } finally { setSubLoading(false) }
  }, [cls.id])

  const loadTimetable = useCallback(async () => {
    setTtLoading(true)
    try {
      const data = await fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}`).then(r => r.json())
      setTimetable(Array.isArray(data) ? data : [])
    } finally { setTtLoading(false) }
  }, [cls.id, schoolId])

  // Reset state when class changes
  useEffect(() => {
    setTab('subjects')
    setSubjectMsg(null)
    setGenMsg(null)
    setEditSlotId(null)
    setEditingClassTeacher(false)
    setCtId(String(cls.class_teacher_id || ''))
    loadSubjects()
  }, [cls.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'timetable') loadTimetable()
    if (tab === 'students') loadStudents()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStudents() {
    setStudLoading(true)
    try {
      const data = await fetch(`/api/students?school_id=${schoolId}&grade=${cls.grade}&section=${cls.section}`).then(r => r.json())
      setStudents(Array.isArray(data) ? data : [])
    } finally { setStudLoading(false) }
  }

  async function addSubject(name: string, ppw?: string, teacherId?: string) {
    const subjectName = name.trim()
    if (!subjectName) return
    if (subjects.some(s => s.subject_name.toLowerCase() === subjectName.toLowerCase())) {
      setSubjectMsg({ text: `"${subjectName}" is already added`, ok: false })
      setTimeout(() => setSubjectMsg(null), 3000)
      return
    }
    setAddingSubject(true)
    setSubjectMsg(null)
    try {
      const res = await fetch(`/api/classes/${cls.id}/subjects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_name: subjectName, teacher_id: teacherId || null, periods_per_week: parseInt(ppw || '4') || 4 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadSubjects()
      setNewName(''); setNewPPW('4'); setNewTeacher('')
      setSubjectMsg({ text: `✓ ${subjectName} added${data.teacher_name ? ` · Teacher: ${data.teacher_name}` : ''}`, ok: true })
      setTimeout(() => setSubjectMsg(null), 4000)
    } catch (err: unknown) {
      setSubjectMsg({ text: err instanceof Error ? err.message : 'Failed to add subject', ok: false })
    } finally { setAddingSubject(false) }
  }

  async function removeSubject(subjectId: number, name: string) {
    if (!confirm(`Remove "${name}"?`)) return
    setRemovingId(subjectId)
    try {
      await fetch(`/api/classes/${cls.id}/subjects?subject_id=${subjectId}`, { method: 'DELETE' })
      await loadSubjects()
    } finally { setRemovingId(null) }
  }

  async function saveClassTeacher() {
    setSavingCT(true)
    try {
      const res = await fetch(`/api/classes/${cls.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_teacher_id: ctId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const t = teachers.find(t => t.id === parseInt(ctId)) || null
      onClassUpdated({ id: cls.id, class_teacher_id: data.class_teacher_id, class_teacher_name: t?.name || null })
      setEditingClassTeacher(false)
    } finally { setSavingCT(false) }
  }

  async function generateTimetable(forceReplace: boolean) {
    setGenerating(true); setGenMsg(null)
    try {
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, class_id: cls.id, force_replace: forceReplace }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGenMsg({ text: `Generated ${data.slots} slots successfully`, ok: true })
      await loadTimetable()
    } catch (err: unknown) {
      setGenMsg({ text: err instanceof Error ? err.message : 'Generation failed', ok: false })
    } finally { setGenerating(false) }
  }

  async function saveSlotEdit(slotId: number) {
    try {
      await fetch('/api/class-timetable', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slotId, subject_name: editSubject || null, teacher_id: editTeacher ? parseInt(editTeacher) : null }),
      })
      setEditSlotId(null)
      await loadTimetable()
    } catch { /* silent */ }
  }

  const hasTimetable = timetable.length > 0
  const totalPPW = subjects.reduce((a, s) => a + s.periods_per_week, 0)
  const suggestions = getSuggestedSubjects(cls.grade)
  const existingNames = new Set(subjects.map(s => s.subject_name.toLowerCase()))
  const availableSuggestions = suggestions.filter(s => !existingNames.has(s.toLowerCase()))

  const ttByDay: Record<string, TimetableSlot[]> = {}
  for (const slot of timetable) {
    if (!ttByDay[slot.day_of_week]) ttByDay[slot.day_of_week] = []
    ttByDay[slot.day_of_week].push(slot)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Grade {cls.grade} – {cls.section}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {editingClassTeacher ? (
                <div className="flex items-center gap-2">
                  <select value={ctId} onChange={e => setCtId(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300">
                    <option value="">— No class teacher —</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={saveClassTeacher} disabled={savingCT}
                    className="text-xs bg-violet-600 text-white px-2.5 py-1 rounded-lg hover:bg-violet-700 disabled:opacity-50">
                    {savingCT ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingClassTeacher(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditingClassTeacher(true)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 transition-colors">
                  <span className="text-gray-400">CT:</span>
                  {cls.class_teacher_name
                    ? <span className="font-medium">{cls.class_teacher_name}</span>
                    : <span className="text-amber-500 italic">Not assigned</span>}
                  <span className="text-gray-300 ml-0.5">✎</span>
                </button>
              )}
              <span className="text-xs text-gray-400">{subjects.length} subjects · {totalPPW} periods/week</span>
              {hasTimetable && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Timetable Active</span>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-3 -mb-4">
          {(['subjects', 'timetable', 'students'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'subjects' ? `Subjects (${subjects.length})` : t === 'timetable' ? 'Timetable' : 'Students'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* ── SUBJECTS ── */}
        {tab === 'subjects' && (
          <div className="space-y-4">
            {subjectMsg && (
              <div className={`rounded-lg px-4 py-2.5 text-sm border ${subjectMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {subjectMsg.text}
              </div>
            )}

            {/* Current subjects */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Assigned Subjects</span>
                {subjects.length > 0 && <span className="text-xs text-gray-400">{totalPPW} periods/week</span>}
              </div>
              {subLoading ? (
                <div className="py-6 text-center text-gray-400 text-xs">Loading...</div>
              ) : subjects.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">No subjects yet. Add from suggestions below.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {subjects.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{s.subject_name}</p>
                          <p className="text-xs text-gray-400">{s.periods_per_week} per week</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {s.teacher_name
                          ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">{s.teacher_name}</span>
                          : <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">No teacher</span>}
                        <button onClick={() => removeSubject(s.id, s.subject_name)} disabled={removingId === s.id}
                          className="text-red-300 hover:text-red-500 text-xs p-1 transition-colors disabled:opacity-40">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggestions */}
            {availableSuggestions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-700 mb-0.5">Suggested for Grade {cls.grade}</p>
                <p className="text-xs text-gray-400 mb-3">Click to add · teacher auto-assigned</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSuggestions.map(name => (
                    <button key={name} onClick={() => addSubject(name)} disabled={addingSubject}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-400 transition-colors disabled:opacity-50 flex items-center gap-1">
                      <span className="text-violet-400">+</span> {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom add */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Add Custom Subject</p>
              <div className="flex gap-2 flex-wrap">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubject(newName, newPPW, newTeacher)}
                  className={inp + ' flex-1 min-w-36 text-sm'} placeholder="Subject name" />
                <input type="number" min={1} max={12} value={newPPW} onChange={e => setNewPPW(e.target.value)}
                  className={inp + ' w-20 text-sm'} placeholder="Periods" />
                <select value={newTeacher} onChange={e => setNewTeacher(e.target.value)}
                  className={inp + ' w-44 text-sm'}>
                  <option value="">Auto-assign teacher</option>
                  {teachers.filter(t => t.subject).map(t => <option key={t.id} value={t.id}>{t.name} – {t.subject}</option>)}
                </select>
                <button onClick={() => addSubject(newName, newPPW, newTeacher)}
                  disabled={addingSubject || !newName.trim()}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {addingSubject ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>

            {subjects.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    {hasTimetable ? 'Timetable active.' : 'Ready to generate timetable!'}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {hasTimetable ? 'Regenerate if subjects changed.' : `${subjects.length} subjects · ${totalPPW} periods/week`}
                  </p>
                </div>
                <button onClick={() => setTab('timetable')}
                  className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                  {hasTimetable ? 'View →' : 'Generate →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TIMETABLE ── */}
        {tab === 'timetable' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {subjects.length === 0 ? 'Add subjects first.' : hasTimetable ? 'Timetable generated.' : `${subjects.length} subjects ready.`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Regenerate keeps manual slots. Force replace wipes all.</p>
              </div>
              {subjects.length > 0 && (
                <div className="flex gap-2">
                  {hasTimetable && (
                    <button onClick={() => generateTimetable(true)} disabled={generating}
                      className="px-3 py-1.5 border border-red-200 text-red-600 text-xs rounded-lg hover:bg-red-50 disabled:opacity-50">
                      Force Replace
                    </button>
                  )}
                  <button onClick={() => generateTimetable(false)} disabled={generating}
                    className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {generating
                      ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
                      : hasTimetable ? '↻ Regenerate' : '⚡ Generate Timetable'}
                  </button>
                </div>
              )}
            </div>

            {genMsg && (
              <div className={`rounded-xl px-4 py-2.5 text-sm border ${genMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {genMsg.text}
              </div>
            )}

            {ttLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />Loading...
              </div>
            ) : timetable.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
                No timetable yet.
              </div>
            ) : (
              <TimetableGrid
                timetable={timetable}
                teachers={teachers}
                editSlotId={editSlotId}
                editSubject={editSubject}
                editTeacher={editTeacher}
                setEditSlotId={setEditSlotId}
                setEditSubject={setEditSubject}
                setEditTeacher={setEditTeacher}
                onSaveSlot={saveSlotEdit}
              />
            )}
          </div>
        )}

        {/* ── STUDENTS ── */}
        {tab === 'students' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-600">Students</span>
              <span className="text-xs text-gray-400">{students.length} enrolled</span>
            </div>
            {studLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
            ) : students.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No students enrolled.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {students.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <span className="text-xs text-gray-300 w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                      <p className="text-xs text-gray-400">Roll: {s.roll_number}</p>
                    </div>
                    {s.phone && <span className="text-xs text-gray-400">{s.phone}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Timetable Grid (periods × days) ──────────────────────────────────────────
function TimetableGrid({
  timetable, teachers, editSlotId, editSubject, editTeacher,
  setEditSlotId, setEditSubject, setEditTeacher, onSaveSlot,
}: {
  timetable: TimetableSlot[]
  teachers: Teacher[]
  editSlotId: number | null
  editSubject: string
  editTeacher: string
  setEditSlotId: (id: number | null) => void
  setEditSubject: (v: string) => void
  setEditTeacher: (v: string) => void
  onSaveSlot: (id: number) => void
}) {
  const activeDays = DAYS.filter(d => timetable.some(s => s.day_of_week === d))

  // Build period rows: unique period_number sorted ascending
  const periodNumbers = Array.from(new Set(timetable.map(s => s.period_number))).sort((a, b) => a - b)

  // Slot lookup: day+period → slot
  const slotMap = new Map<string, TimetableSlot>()
  for (const s of timetable) slotMap.set(`${s.day_of_week}-${s.period_number}`, s)

  // Colour by subject name
  const subjectColors: Record<string, string> = {}
  const palette = [
    'bg-blue-50 border-blue-200 text-blue-800',
    'bg-violet-50 border-violet-200 text-violet-800',
    'bg-emerald-50 border-emerald-200 text-emerald-800',
    'bg-rose-50 border-rose-200 text-rose-800',
    'bg-amber-50 border-amber-200 text-amber-800',
    'bg-cyan-50 border-cyan-200 text-cyan-800',
    'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800',
    'bg-teal-50 border-teal-200 text-teal-800',
    'bg-orange-50 border-orange-200 text-orange-800',
    'bg-sky-50 border-sky-200 text-sky-800',
  ]
  let colorIdx = 0
  for (const s of timetable) {
    if (!s.is_break && s.subject_name && !subjectColors[s.subject_name]) {
      subjectColors[s.subject_name] = palette[colorIdx % palette.length]
      colorIdx++
    }
  }

  // Get time label from the first day that has this period
  function getTime(period: number) {
    const s = timetable.find(t => t.period_number === period)
    return s ? `${s.time_from}–${s.time_to}` : ''
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-24 border-r border-gray-200 sticky left-0 bg-gray-50 z-10">
                Period
              </th>
              {activeDays.map(day => (
                <th key={day} className="px-2 py-2.5 text-center font-semibold text-gray-600 min-w-[110px] border-r border-gray-100 last:border-r-0">
                  {day.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periodNumbers.map(period => {
              // Determine if this period is a break (check any day)
              const sampleSlot = activeDays.map(d => slotMap.get(`${d}-${period}`)).find(Boolean)
              const isBreakRow = sampleSlot?.is_break ?? false

              return (
                <tr key={period} className={`border-b border-gray-100 last:border-b-0 ${isBreakRow ? 'bg-amber-50/60' : 'hover:bg-gray-50/50'}`}>
                  {/* Period label */}
                  <td className="px-3 py-2 border-r border-gray-200 sticky left-0 bg-inherit z-10">
                    {isBreakRow ? (
                      <span className="text-amber-600 font-medium text-[10px]">{sampleSlot?.break_label || 'Break'}</span>
                    ) : (
                      <div>
                        <div className="font-semibold text-gray-700">P{period}</div>
                        <div className="text-gray-400 text-[10px] mt-0.5 whitespace-nowrap">{getTime(period)}</div>
                      </div>
                    )}
                  </td>

                  {/* Day cells */}
                  {activeDays.map(day => {
                    const slot = slotMap.get(`${day}-${period}`)
                    if (!slot) return (
                      <td key={day} className="px-2 py-2 border-r border-gray-100 last:border-r-0 text-center text-gray-200">—</td>
                    )
                    if (slot.is_break) return (
                      <td key={day} className="px-2 py-2 border-r border-gray-100 last:border-r-0 text-center">
                        <span className="text-amber-500 text-[10px]">Break</span>
                      </td>
                    )
                    if (editSlotId === slot.id) return (
                      <td key={day} className="px-2 py-1.5 border-r border-gray-100 last:border-r-0" colSpan={1}>
                        <div className="flex flex-col gap-1">
                          <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                            className="border border-gray-200 rounded px-1.5 py-1 text-[10px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 w-full" placeholder="Subject" />
                          <select value={editTeacher} onChange={e => setEditTeacher(e.target.value)}
                            className="border border-gray-200 rounded px-1 py-1 text-[10px] text-gray-900 bg-white focus:outline-none w-full">
                            <option value="">No teacher</option>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <div className="flex gap-1">
                            <button onClick={() => onSaveSlot(slot.id)}
                              className="flex-1 bg-blue-600 text-white text-[10px] py-0.5 rounded hover:bg-blue-700">Save</button>
                            <button onClick={() => setEditSlotId(null)}
                              className="flex-1 border border-gray-200 text-gray-500 text-[10px] py-0.5 rounded hover:bg-gray-50">✕</button>
                          </div>
                        </div>
                      </td>
                    )
                    const isConflict = slot.has_conflict === true
                    const isManual = slot.source === 'manual'
                    const colorCls = isConflict
                      ? 'bg-red-50 border-red-400 text-red-800'
                      : slot.subject_name
                      ? subjectColors[slot.subject_name] ?? 'bg-gray-50 border-gray-200 text-gray-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                    return (
                      <td key={day} className="px-1.5 py-1.5 border-r border-gray-100 last:border-r-0">
                        <div
                          className={`rounded-lg border px-2 py-1.5 cursor-pointer hover:opacity-80 transition-opacity group relative ${colorCls}`}
                          onClick={() => { setEditSlotId(slot.id); setEditSubject(slot.subject_name || ''); setEditTeacher(String(slot.teacher_id || '')) }}
                          title={isConflict ? `⚠ ${slot.teacher_name} is also teaching another class at this slot` : undefined}
                        >
                          {/* Conflict badge */}
                          {isConflict && (
                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">!</span>
                          )}
                          {/* Manual override dot */}
                          {isManual && !isConflict && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-violet-400 rounded-full" title="Manually set" />
                          )}
                          <div className="font-semibold text-[11px] leading-tight truncate">
                            {slot.subject_name || <span className="text-gray-300 italic">Empty</span>}
                          </div>
                          {slot.teacher_name ? (
                            <div className={`text-[10px] truncate mt-0.5 ${isConflict ? 'text-red-600 font-medium' : 'opacity-70'}`}>
                              {isConflict ? '⚠ ' : ''}{slot.teacher_name}
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-500 mt-0.5 italic">No teacher</div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          Teacher conflict — same teacher in two classes at this slot
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />
          Manually set — preserved during regeneration
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200 inline-block" />
          No teacher assigned
        </div>
      </div>
    </div>
  )
}
