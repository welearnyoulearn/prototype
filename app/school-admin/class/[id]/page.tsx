'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { CURRICULA } from '@/lib/curricula'

// ─── Types ────────────────────────────────────────────────────────────────────
type ClassInfo = {
  id: number; school_id: number; grade: string; section: string
  class_teacher_id: number | null; class_teacher_name: string | null
  timetable_generated_at: string | null; student_count?: number
}
type Subject = {
  id: number; subject_name: string; teacher_id: number | null
  teacher_name: string | null; periods_per_week: number
}
type Teacher = { id: number; name: string; subject: string; employee_id: string; department: string }
type TimetableSlot = {
  id: number; day_of_week: string; period_number: number
  time_from: string; time_to: string
  subject_name: string | null; teacher_id: number | null; teacher_name: string | null
  is_break: boolean; break_label: string | null; room: string | null
}
type Student = { id: number; name: string; roll_number: string; email: string; phone: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ─── Subject suggestions by grade ─────────────────────────────────────────────
function getSuggestedSubjects(grade: string): string[] {
  const g = String(grade)
  const cbse = CURRICULA['CBSE']?.find(x => x.grade === g)
  const apssc = CURRICULA['APSSC']?.find(x => x.grade === g)
  const names = new Set<string>()
  cbse?.subjects.forEach(s => names.add(s.name))
  apssc?.subjects.forEach(s => names.add(s.name))
  // Fallback common subjects
  if (names.size === 0) {
    ['English', 'Mathematics', 'Science', 'Social Science', 'Hindi', 'Physical Education'].forEach(s => names.add(s))
  }
  return Array.from(names)
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ClassDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const classId = params.id as string
  const schoolId = searchParams.get('school_id') || ''

  const [cls, setCls] = useState<ClassInfo | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'subjects' | 'timetable' | 'students'>('subjects')

  // Subjects state
  const [addingSubject, setAddingSubject] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newSubjectPPW, setNewSubjectPPW] = useState('4')
  const [newSubjectTeacher, setNewSubjectTeacher] = useState('')
  const [removingSubjectId, setRemovingSubjectId] = useState<number | null>(null)
  const [subjectMsg, setSubjectMsg] = useState('')

  // Class teacher state
  const [editingClassTeacher, setEditingClassTeacher] = useState(false)
  const [classTeacherId, setClassTeacherId] = useState('')
  const [savingClassTeacher, setSavingClassTeacher] = useState(false)

  // Timetable state
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [ttLoading, setTtLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editTeacher, setEditTeacher] = useState('')

  // Students state
  const [students, setStudents] = useState<Student[]>([])
  const [studLoading, setStudLoading] = useState(false)

  const loadSubjects = useCallback(async () => {
    const data = await fetch(`/api/classes/${classId}/subjects`).then(r => r.json())
    setSubjects(Array.isArray(data) ? data : [])
  }, [classId])

  const loadTimetable = useCallback(async () => {
    if (!schoolId) return
    setTtLoading(true)
    try {
      const data = await fetch(`/api/class-timetable?class_id=${classId}&school_id=${schoolId}`).then(r => r.json())
      setTimetable(Array.isArray(data) ? data : [])
    } finally { setTtLoading(false) }
  }, [classId, schoolId])

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const [clsData, subData, tchData] = await Promise.all([
          fetch(`/api/classes/${classId}`).then(r => r.json()),
          fetch(`/api/classes/${classId}/subjects`).then(r => r.json()),
          schoolId ? fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json()) : Promise.resolve([]),
        ])
        if (clsData.error) { setError(clsData.error); return }
        setCls(clsData)
        setSubjects(Array.isArray(subData) ? subData : [])
        setTeachers(Array.isArray(tchData) ? tchData : [])
      } catch {
        setError('Failed to load class details')
      } finally { setLoading(false) }
    }
    init()
  }, [classId, schoolId])

  useEffect(() => {
    if (tab === 'timetable') loadTimetable()
    if (tab === 'students' && cls) loadStudents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function loadStudents() {
    if (!cls || !schoolId) return
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
      setSubjectMsg(`"${subjectName}" is already added`)
      setTimeout(() => setSubjectMsg(''), 3000)
      return
    }
    setAddingSubject(true)
    try {
      const res = await fetch(`/api/classes/${classId}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_name: subjectName,
          teacher_id: teacherId || null,
          periods_per_week: parseInt(ppw || '4') || 4,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadSubjects()
      setNewSubjectName(''); setNewSubjectPPW('4'); setNewSubjectTeacher('')
      setSubjectMsg(`✓ ${subjectName} added${data.teacher_name ? ` · Teacher: ${data.teacher_name}` : ''}`)
      setTimeout(() => setSubjectMsg(''), 4000)
    } catch (err: unknown) {
      setSubjectMsg(err instanceof Error ? err.message : 'Failed to add subject')
    } finally { setAddingSubject(false) }
  }

  async function removeSubject(subjectId: number, name: string) {
    if (!confirm(`Remove "${name}" from this class?`)) return
    setRemovingSubjectId(subjectId)
    try {
      await fetch(`/api/classes/${classId}/subjects?subject_id=${subjectId}`, { method: 'DELETE' })
      await loadSubjects()
    } finally { setRemovingSubjectId(null) }
  }

  async function saveClassTeacher() {
    setSavingClassTeacher(true)
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_teacher_id: classTeacherId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const t = teachers.find(t => t.id === parseInt(classTeacherId)) || null
      setCls(prev => prev ? { ...prev, class_teacher_id: data.class_teacher_id, class_teacher_name: t?.name || null } : prev)
      setEditingClassTeacher(false)
    } finally { setSavingClassTeacher(false) }
  }

  async function generateTimetable(forceReplace: boolean) {
    setGenerating(true); setGenMsg(null)
    try {
      const res = await fetch('/api/class-timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId ? parseInt(schoolId) : cls?.school_id, class_id: parseInt(classId), force_replace: forceReplace }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGenMsg({ text: `Generated ${data.slots} slots successfully`, ok: true })
      await loadTimetable()
      // Update local cls to reflect timetable_generated_at
      setCls(prev => prev ? { ...prev, timetable_generated_at: new Date().toISOString() } : prev)
    } catch (err: unknown) {
      setGenMsg({ text: err instanceof Error ? err.message : 'Generation failed', ok: false })
    } finally { setGenerating(false) }
  }

  async function saveSlotEdit(slotId: number) {
    try {
      await fetch('/api/class-timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slotId, subject_name: editSubject || null, teacher_id: editTeacher ? parseInt(editTeacher) : null }),
      })
      setEditingSlotId(null)
      await loadTimetable()
    } catch { setError('Failed to update slot') }
  }

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300'

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <p className="text-red-600">{error}</p>
      <button onClick={() => router.back()} className="text-violet-600 underline text-sm">Go back</button>
    </div>
  )

  if (!cls) return null

  const hasTimetable = timetable.length > 0 || !!cls.timetable_generated_at
  const suggestions = getSuggestedSubjects(cls.grade)
  const existingNames = new Set(subjects.map(s => s.subject_name.toLowerCase()))
  const availableSuggestions = suggestions.filter(s => !existingNames.has(s.toLowerCase()))
  const totalPPW = subjects.reduce((a, s) => a + s.periods_per_week, 0)

  // Group timetable by day
  const ttByDay: Record<string, TimetableSlot[]> = {}
  for (const slot of timetable) {
    if (!ttByDay[slot.day_of_week]) ttByDay[slot.day_of_week] = []
    ttByDay[slot.day_of_week].push(slot)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => router.back()}
              className="text-gray-400 hover:text-gray-700 flex items-center gap-1 text-sm transition-colors">
              ← Back
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-500">Class Management</span>
          </div>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Grade {cls.grade} – {cls.section}</h1>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                {editingClassTeacher ? (
                  <div className="flex items-center gap-2">
                    <select value={classTeacherId} onChange={e => setClassTeacherId(e.target.value)}
                      className={inp + ' text-xs py-1'}>
                      <option value="">— No class teacher —</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>)}
                    </select>
                    <button onClick={saveClassTeacher} disabled={savingClassTeacher}
                      className="text-xs bg-violet-600 text-white px-3 py-1 rounded-lg hover:bg-violet-700 disabled:opacity-50">
                      {savingClassTeacher ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingClassTeacher(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditingClassTeacher(true); setClassTeacherId(String(cls.class_teacher_id || '')) }}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-violet-600 transition-colors">
                    <span className="text-gray-400">CT:</span>
                    {cls.class_teacher_name
                      ? <span className="font-medium">{cls.class_teacher_name}</span>
                      : <span className="text-amber-500 italic">Not assigned</span>}
                    <span className="text-xs text-gray-300 ml-1">✎</span>
                  </button>
                )}
                <span className="text-xs text-gray-400">
                  {subjects.length} subject{subjects.length !== 1 ? 's' : ''} · {totalPPW} periods/week
                </span>
                {hasTimetable && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    Timetable Active
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-5xl mx-auto flex gap-0">
          {(['subjects', 'timetable', 'students'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'subjects' ? `Subjects (${subjects.length})` : t === 'timetable' ? 'Timetable' : 'Students'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* ── SUBJECTS TAB ── */}
        {tab === 'subjects' && (
          <div className="space-y-5">
            {subjectMsg && (
              <div className={`rounded-lg px-4 py-3 text-sm ${subjectMsg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {subjectMsg}
              </div>
            )}

            {/* Current subjects */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">Assigned Subjects</h3>
                {subjects.length > 0 && (
                  <span className="text-xs text-gray-400">{totalPPW} periods/week total</span>
                )}
              </div>
              {subjects.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  No subjects added yet. Add from suggestions below or type a custom subject.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {subjects.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{s.subject_name}</p>
                          <p className="text-xs text-gray-400">{s.periods_per_week} periods/week</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {s.teacher_name ? (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                            {s.teacher_name}
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">
                            No teacher
                          </span>
                        )}
                        <button
                          onClick={() => removeSubject(s.id, s.subject_name)}
                          disabled={removingSubjectId === s.id}
                          className="text-red-300 hover:text-red-500 text-xs p-1 transition-colors disabled:opacity-40">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggestions */}
            {availableSuggestions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-800 text-sm mb-1">Suggested for Grade {cls.grade}</h3>
                <p className="text-xs text-gray-400 mb-3">Click to add instantly. Teacher will be auto-assigned.</p>
                <div className="flex flex-wrap gap-2">
                  {availableSuggestions.map(name => (
                    <button key={name}
                      onClick={() => addSubject(name)}
                      disabled={addingSubject}
                      className="text-sm px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-400 transition-colors disabled:opacity-50 flex items-center gap-1">
                      <span className="text-violet-400">+</span> {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom add form */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">Add Custom Subject</h3>
              <div className="flex gap-3 flex-wrap">
                <input
                  value={newSubjectName}
                  onChange={e => setNewSubjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubject(newSubjectName, newSubjectPPW, newSubjectTeacher)}
                  className={inp + ' flex-1 min-w-40'}
                  placeholder="Subject name e.g. Telugu, Drawing..."
                />
                <input
                  type="number" min={1} max={12}
                  value={newSubjectPPW}
                  onChange={e => setNewSubjectPPW(e.target.value)}
                  className={inp + ' w-24'}
                  placeholder="Periods"
                />
                <select value={newSubjectTeacher} onChange={e => setNewSubjectTeacher(e.target.value)}
                  className={inp + ' w-48'}>
                  <option value="">Auto-assign teacher</option>
                  {teachers.filter(t => t.subject).map(t => (
                    <option key={t.id} value={t.id}>{t.name} – {t.subject}</option>
                  ))}
                </select>
                <button
                  onClick={() => addSubject(newSubjectName, newSubjectPPW, newSubjectTeacher)}
                  disabled={addingSubject || !newSubjectName.trim()}
                  className="px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {addingSubject ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>

            {/* Go to timetable nudge */}
            {subjects.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    {hasTimetable ? 'Timetable is active for this class.' : 'Ready to generate timetable!'}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {hasTimetable
                      ? 'You can regenerate if subjects changed.'
                      : `${subjects.length} subjects configured · ${totalPPW} periods/week`}
                  </p>
                </div>
                <button onClick={() => setTab('timetable')}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  {hasTimetable ? 'View Timetable →' : 'Generate Timetable →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TIMETABLE TAB ── */}
        {tab === 'timetable' && (
          <div className="space-y-5">
            {/* Controls */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-semibold text-gray-800 text-sm">
                  {subjects.length === 0
                    ? 'Add subjects first before generating a timetable.'
                    : hasTimetable
                    ? 'Timetable is generated. You can regenerate if subjects changed.'
                    : `${subjects.length} subject(s) ready · click Generate to create timetable.`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Regenerate keeps manually-set slots. Force replace wipes everything.
                </p>
              </div>
              {subjects.length > 0 && (
                <div className="flex gap-2">
                  {hasTimetable && (
                    <button onClick={() => generateTimetable(true)} disabled={generating}
                      className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                      Force Replace
                    </button>
                  )}
                  <button onClick={() => generateTimetable(false)} disabled={generating}
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                    {generating
                      ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
                      : hasTimetable ? '↻ Regenerate' : '⚡ Generate Timetable'}
                  </button>
                </div>
              )}
            </div>

            {genMsg && (
              <div className={`rounded-xl px-4 py-3 text-sm border ${genMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {genMsg.text}
              </div>
            )}

            {/* Timetable grid */}
            {ttLoading ? (
              <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Loading timetable...
              </div>
            ) : timetable.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
                No timetable generated yet.
              </div>
            ) : (
              <div className="space-y-3">
                {DAYS.filter(day => ttByDay[day]?.length).map(day => (
                  <div key={day} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                      <span className="font-semibold text-gray-700 text-sm">{day}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {(ttByDay[day] || []).sort((a, b) => a.period_number - b.period_number).map(slot => (
                        <div key={slot.id} className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors ${slot.is_break ? 'bg-amber-50/50' : ''}`}>
                          <div className="w-16 flex-shrink-0 text-xs text-gray-400 text-right">
                            {slot.time_from}–{slot.time_to}
                          </div>
                          {slot.is_break ? (
                            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                              {slot.break_label || 'Break'}
                            </span>
                          ) : editingSlotId === slot.id ? (
                            <div className="flex items-center gap-2 flex-1 flex-wrap">
                              <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                                className={inp + ' w-40 text-xs py-1'} placeholder="Subject" />
                              <select value={editTeacher} onChange={e => setEditTeacher(e.target.value)}
                                className={inp + ' text-xs py-1'}>
                                <option value="">No teacher</option>
                                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                              <button onClick={() => saveSlotEdit(slot.id)}
                                className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">Save</button>
                              <button onClick={() => setEditingSlotId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="text-xs text-gray-400 w-6">{slot.period_number}</span>
                              <span className="font-medium text-gray-900 text-sm flex-1">{slot.subject_name || '—'}</span>
                              {slot.teacher_name ? (
                                <span className="text-xs text-gray-500 truncate max-w-32">{slot.teacher_name}</span>
                              ) : (
                                <span className="text-xs text-amber-500 italic">No teacher</span>
                              )}
                              <button
                                onClick={() => { setEditingSlotId(slot.id); setEditSubject(slot.subject_name || ''); setEditTeacher(String(slot.teacher_id || '')) }}
                                className="text-xs text-gray-300 hover:text-gray-600 p-1 ml-1 transition-colors">✎</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STUDENTS TAB ── */}
        {tab === 'students' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">Students</h3>
              <span className="text-xs text-gray-400">{students.length} student{students.length !== 1 ? 's' : ''}</span>
            </div>
            {studLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Loading students...</div>
            ) : students.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">No students enrolled in this class.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {students.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <span className="text-xs text-gray-300 w-6">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                      <p className="text-xs text-gray-400">Roll: {s.roll_number}{s.email ? ` · ${s.email}` : ''}</p>
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
