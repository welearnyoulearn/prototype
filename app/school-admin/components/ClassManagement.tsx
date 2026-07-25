'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { CURRICULA } from '@/lib/curricula'
import StudentSyllabus from '../../student/components/StudentSyllabus'
import { GRADE_SEQUENCE } from '@/lib/grades'

type Props = { schoolId: number; onNavigate?: (tab: string) => void }

type ClassRow = { id: number; grade: string; section: string; class_teacher_id: number | null; class_teacher_name: string | null; student_count: number; timetable_generated_at: string | null }
type Teacher = { id: number; name: string; subject: string; employee_id: string; department: string; teaches_grades?: string; staff_type?: string }
type Subject = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null; periods_per_week: number }
type TimetableSlot = { id: number; day_of_week: string; period_number: number; time_from: string; time_to: string; subject_name: string | null; teacher_id: number | null; teacher_name: string | null; is_break: boolean; break_label: string | null; room: string | null; has_conflict?: boolean; source?: string }
type Student = { id: number; name: string; roll_number: string; email: string; phone: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getSuggestedSubjects(grade: string, curriculum: 'CBSE' | 'APSSC' | 'SSC' | 'both'): string[] {
  const g = String(grade)
  const names = new Set<string>()

  if (curriculum === 'CBSE' || curriculum === 'both') {
    CURRICULA['CBSE']?.find(x => x.grade === g)?.subjects.forEach(s => names.add(s.name))
  }
  if (curriculum === 'APSSC' || curriculum === 'SSC' || curriculum === 'both') {
    // SSC and APSSC use the same curriculum data
    CURRICULA['APSSC']?.find(x => x.grade === g)?.subjects.forEach(s => names.add(s.name))
  }
  if (names.size === 0) {
    ;['English', 'Mathematics', 'Science', 'Social Science', 'Telugu', 'Physical Education'].forEach(s => names.add(s))
  }
  return Array.from(names)
}

// Returns true when teacher has no grade restriction OR their restriction includes this grade
function canTeachGrade(teachesGrades: string | null | undefined, grade: string): boolean {
  if (!teachesGrades || !teachesGrades.trim()) return true
  return teachesGrades.split(',').map(g => g.trim()).includes(grade.trim())
}

export default function ClassManagement({ schoolId, onNavigate }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [removedClasses, setRemovedClasses] = useState<{ id: number; grade: string; section: string; student_count: number; deleted_at: string }[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)

  // Selected class
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedClass = classes.find(c => c.id === selectedId) ?? null

  // Add class form
  const [showAdd, setShowAdd] = useState(false)
  const [newClass, setNewClass] = useState({ grade: '', section: '' })
  const [addingClass, setAddingClass] = useState(false)
  const [setupMsg, setSetupMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  // Default subject sets panel (replaces school settings)
  const [showDefaultSets, setShowDefaultSets] = useState(false)
  const [allTemplates, setAllTemplates] = useState<{ id: number; name: string; from_grade: number; to_grade: number; subjects: { name: string; periods_per_week: number }[] }[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [newSetFrom, setNewSetFrom] = useState('1')
  const [newSetTo, setNewSetTo] = useState('5')
  const [newSetSubjects, setNewSetSubjects] = useState<{ name: string }[]>([{ name: '' }])
  const [newSetCurriculum, setNewSetCurriculum] = useState<'CBSE' | 'APSSC' | 'SSC' | 'both'>('both')
  const [showSetSuggestions, setShowSetSuggestions] = useState(true)
  const [savingSet, setSavingSet] = useState(false)
  const [setMsg, setSetMsg] = useState<string | null>(null)

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300'
  const rightPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData(); autoSync() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll newly selected class into view in the sidebar list
  useEffect(() => {
    if (!selectedId) return
    setTimeout(() => {
      document.getElementById(`class-item-${selectedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 100)
  }, [selectedId])

  // Scroll right panel to top when class selection changes
  useEffect(() => {
    if (selectedId) rightPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedId])

  async function loadData() {
    setLoading(true)
    try {
      const [cls, tch, removed] = await Promise.all([
        fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/teachers?school_id=${schoolId}`).then(r => r.json()),
        fetch(`/api/classes?school_id=${schoolId}&removed=true`).then(r => r.json()),
      ])
      setClasses(Array.isArray(cls) ? cls : [])
      setRemovedClasses(Array.isArray(removed) ? removed : [])
      if (Array.isArray(tch)) {
        const seen = new Set<number>()
        setTeachers(tch.filter((t: Teacher) => { if (seen.has(t.id)) return false; seen.add(t.id); return true }))
      } else { setTeachers([]) }
    } catch { setError('Failed to load') }
    finally { setLoading(false) }
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault()
    const grade = newClass.grade.trim()
    const section = newClass.section.trim().toUpperCase()
    if (!grade || !section) { setError('Grade and Section required'); return }
    const maxNumericGrade = Math.max(...GRADE_SEQUENCE.filter(g => /^\d+$/.test(g)).map(Number))
    if (!/^[0-9]+$/.test(grade) || parseInt(grade) < 1 || parseInt(grade) > maxNumericGrade) { setError(`Grade must be 1–${maxNumericGrade}`); return }
    if (!/^[A-Z]$/.test(section)) { setError('Section must be a single letter A–Z'); return }
    setAddingClass(true)
    setSetupMsg('Creating class...')
    try {
      // Step 1: Create class — backend auto-assigns subjects + teachers
      const res = await fetch('/api/classes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, grade, section }),
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

      setNewClass({ grade: '', section: '' })
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
    if (!confirm('Delete this class? All students in this class will be deactivated.')) return
    try {
      await fetch(`/api/classes/${id}`, { method: 'DELETE' })
      setClasses(prev => prev.filter(c => c.id !== id))
      if (selectedId === id) setSelectedId(null)
      // Refresh removed list so it appears immediately
      const removed = await fetch(`/api/classes?school_id=${schoolId}&removed=true`).then(r => r.json())
      setRemovedClasses(Array.isArray(removed) ? removed : [])
    } catch { setError('Failed to delete class') }
  }

  async function autoSync() { /* sync not available in wlylV1 */ }
  async function loadAllTemplates() { setAllTemplates([]); setLoadingTemplates(false) }
  async function saveDefaultSet(e: React.FormEvent) { e.preventDefault(); alert('Subject templates not available in this version.') }
  async function deleteDefaultSet(_id: number) { alert('Subject templates not available in this version.') }

  async function syncFromStudents() { setSyncing(false) }

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

  if (loading) return (
    <div className="py-16 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-full border-3 border-gray-200 border-t-violet-600 animate-spin" style={{ borderWidth: 3 }} />
      <p className="text-gray-400 text-sm">Loading classes…</p>
    </div>
  )

  return (
    <div className="flex gap-0 h-full min-h-[600px]">
      {/* ── Left sidebar: class list ── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white rounded-l-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Classes</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowDefaultSets(v => !v); setSelectedId(null); if (!allTemplates.length) loadAllTemplates() }}
              title="Default Subject Sets"
              className={`w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors ${showDefaultSets ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>
            <button onClick={syncFromStudents} disabled={syncing} title="Sync classes from student data"
              className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-md text-xs transition-colors disabled:opacity-50">
              <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={() => setShowAdd(v => !v)}
              className="w-6 h-6 flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white rounded-md text-sm font-bold transition-colors">+</button>
          </div>
        </div>

        {syncMsg && (
          <div className={`mx-3 mt-2 px-3 py-2 rounded-lg text-xs ${syncMsg.startsWith('✓') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {syncMsg}
          </div>
        )}

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
            <p className="text-[10px] text-gray-400">Assign class teacher after creating from the class overview</p>
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
                    id={`class-item-${cls.id}`}
                    onClick={() => setSelectedId(cls.id)}
                    className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                      selectedId === cls.id ? 'bg-violet-50 border-r-2 border-violet-500' : 'hover:bg-gray-50'
                    }`}>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${selectedId === cls.id ? 'text-violet-700' : 'text-gray-800'}`}>
                        {cls.grade}-{cls.section}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {cls.student_count} student{cls.student_count !== 1 ? 's' : ''}
                      </p>
                      {cls.class_teacher_name
                        ? <p className="text-[10px] text-indigo-500 font-medium truncate">CT: {cls.class_teacher_name}</p>
                        : <p className="text-[10px] text-amber-400">No class teacher</p>}
                      {cls.timetable_generated_at
                        ? <p className="text-[10px] text-emerald-500 font-medium">Timetable ready</p>
                        : <p className="text-[10px] text-gray-300">No timetable</p>}
                    </div>
                    <button onClick={e => deleteClass(e, cls.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 text-xs p-0.5 transition-all flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* ── Removed Classes section ── */}
        {removedClasses.length > 0 && (
          <div className="border-t border-gray-100 mt-1">
            <button onClick={() => setShowRemoved(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold text-red-400 uppercase tracking-wider hover:bg-red-50 transition-colors">
              <span>Removed ({removedClasses.length})</span>
              <span>{showRemoved ? '▲' : '▼'}</span>
            </button>
            {showRemoved && (
              <div className="pb-2">
                {removedClasses.map(rc => (
                  <div key={rc.id} className="flex items-center justify-between px-4 py-2 opacity-60">
                    <div>
                      <p className="text-xs font-medium text-gray-500 line-through">{rc.grade}-{rc.section}</p>
                      <p className="text-[10px] text-gray-400">{rc.student_count} student{Number(rc.student_count) !== 1 ? 's' : ''} deactivated</p>
                    </div>
                    <span className="text-[9px] text-red-300 bg-red-50 px-1.5 py-0.5 rounded-full">Removed</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel: class detail or default sets ── */}
      <div ref={rightPanelRef} className="flex-1 min-w-0 bg-white rounded-r-xl overflow-hidden overflow-y-auto">
        {showDefaultSets ? (
          /* Default Subject Sets Panel */
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Default Subject Sets</h3>
                <p className="text-xs text-gray-400 mt-0.5">Define default subjects per grade range — apply them with one click on any class</p>
              </div>
              <button onClick={() => setShowDefaultSets(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Existing sets */}
            {loadingTemplates ? (
              <div className="py-6 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />Loading…
              </div>
            ) : allTemplates.length > 0 ? (
              <div className="space-y-2">
                {allTemplates.map(t => (
                  <div key={t.id} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                          Grade {t.from_grade}–{t.to_grade}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.subjects.map((s, i) => (
                          <span key={i} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{s.name}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => deleteDefaultSet(t.id)}
                      className="text-red-300 hover:text-red-500 flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No default sets yet. Create one below.</p>
            )}

            {/* Create new set */}
            <form onSubmit={saveDefaultSet} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">Create New Default Set</p>

              {setMsg && (
                <div className={`text-xs px-3 py-2 rounded-lg ${setMsg.startsWith('✓') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {setMsg}
                </div>
              )}

              <input value={newSetName} onChange={e => setNewSetName(e.target.value)} required
                className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Set name (e.g. Primary – Grades 1 to 5)" />

              {/* Grade range */}
              <div className="flex gap-4 items-center flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">From Grade</span>
                  <select value={newSetFrom} onChange={e => setNewSetFrom(e.target.value)}
                    className="border border-indigo-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
                    {GRADE_SEQUENCE.filter(g => /^\d+$/.test(g)).map(Number).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">To Grade</span>
                  <select value={newSetTo} onChange={e => setNewSetTo(e.target.value)}
                    className="border border-indigo-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
                    {GRADE_SEQUENCE.filter(g => /^\d+$/.test(g)).map(Number).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              {/* Curriculum-based suggestions — collapsible */}
              {(() => {
                const from = parseInt(newSetFrom), to = parseInt(newSetTo)
                const names = new Set<string>()
                for (let g = from; g <= to; g++) {
                  if (newSetCurriculum === 'CBSE' || newSetCurriculum === 'both') {
                    CURRICULA['CBSE']?.find(x => x.grade === String(g))?.subjects.forEach(s => names.add(s.name))
                  }
                  if (newSetCurriculum === 'APSSC' || newSetCurriculum === 'SSC' || newSetCurriculum === 'both') {
                    CURRICULA['APSSC']?.find(x => x.grade === String(g))?.subjects.forEach(s => names.add(s.name))
                  }
                }
                const added = new Set(newSetSubjects.map(s => s.name.trim().toLowerCase()).filter(Boolean))
                const available = Array.from(names).filter(n => !added.has(n.toLowerCase()))
                return (
                  <div className="bg-white border border-indigo-100 rounded-xl overflow-hidden">
                    {/* Header — always visible, toggle suggestions */}
                    <button type="button"
                      onClick={() => setShowSetSuggestions(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <span className="text-xs font-semibold text-indigo-700">
                          Suggested Subjects
                          {names.size > 0 && <span className="ml-1.5 text-indigo-400 font-normal">· {available.length} available for Grade {newSetFrom}–{newSetTo}</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-indigo-400">{showSetSuggestions ? 'hide' : 'show'}</span>
                        <svg className={`w-3.5 h-3.5 text-indigo-400 transition-transform ${showSetSuggestions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Collapsible body */}
                    {showSetSuggestions && (
                      <div className="px-3 pb-3 space-y-2.5 border-t border-indigo-50">
                        {/* Curriculum selector */}
                        <div className="flex items-center gap-1.5 pt-2.5 flex-wrap">
                          <span className="text-[10px] font-medium text-gray-500 mr-1">Curriculum:</span>
                          {(['CBSE', 'APSSC', 'SSC', 'both'] as const).map(c => (
                            <button key={c} type="button" onClick={() => setNewSetCurriculum(c)}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors border ${
                                newSetCurriculum === c
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                              }`}>
                              {c === 'both' ? 'All' : c === 'APSSC' ? 'AP SSC' : c}
                            </button>
                          ))}
                        </div>

                        {names.size === 0 ? (
                          <p className="text-xs text-gray-400 italic">No curriculum data for this grade range.</p>
                        ) : available.length > 0 ? (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {available.map(name => (
                                <button key={name} type="button"
                                  onClick={() => {
                                    const emptyIdx = newSetSubjects.findIndex(s => !s.name.trim())
                                    if (emptyIdx >= 0) {
                                      setNewSetSubjects(prev => prev.map((x, i) => i === emptyIdx ? { name } : x))
                                    } else {
                                      setNewSetSubjects(prev => [...prev, { name }])
                                    }
                                  }}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 transition-colors flex items-center gap-1">
                                  <span className="text-indigo-400 font-bold text-[10px]">+</span> {name}
                                </button>
                              ))}
                            </div>
                            {available.length > 1 && (
                              <button type="button"
                                onClick={() => {
                                  const current = newSetSubjects.filter(s => s.name.trim())
                                  setNewSetSubjects([...current, ...available.map(n => ({ name: n }))])
                                }}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2">
                                Add all {available.length} →
                              </button>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 italic">All suggestions already added.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Added subjects list */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-600">
                    Subjects to include
                    {newSetSubjects.filter(s => s.name.trim()).length > 0 &&
                      <span className="ml-1.5 text-indigo-600 font-semibold">{newSetSubjects.filter(s => s.name.trim()).length} added</span>
                    }
                  </p>
                  {newSetSubjects.filter(s => s.name.trim()).length > 0 && (
                    <button type="button" onClick={() => setNewSetSubjects([{ name: '' }])}
                      className="text-[10px] text-red-400 hover:text-red-600">Clear all</button>
                  )}
                </div>
                {newSetSubjects.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={s.name} onChange={e => setNewSetSubjects(prev => prev.map((x, j) => j === i ? { name: e.target.value } : x))}
                      className="flex-1 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      placeholder={`Subject ${i + 1}`} />
                    {newSetSubjects.length > 1 && (
                      <button type="button" onClick={() => setNewSetSubjects(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-300 hover:text-red-500 text-sm px-1">×</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setNewSetSubjects(prev => [...prev, { name: '' }])}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Add custom subject</button>
              </div>

              <button type="submit" disabled={savingSet || !newSetName.trim() || newSetSubjects.every(s => !s.name.trim())}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {savingSet ? 'Saving…' : `Save Default Set${newSetSubjects.filter(s => s.name.trim()).length > 0 ? ` (${newSetSubjects.filter(s => s.name.trim()).length} subjects)` : ''}`}
              </button>
            </form>
          </div>
        ) : selectedClass ? (
          <ClassDetail
            cls={selectedClass}
            schoolId={schoolId}
            teachers={teachers}
            allClasses={classes}
            onClassUpdated={(updates) => setClasses(prev => prev.map(c => c.id === updates.id ? { ...c, ...updates } : c))}
            onNavigate={onNavigate}
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
            <p className="text-gray-300 text-xs mt-3">Use the <span className="font-medium text-indigo-400">📋 icon</span> in the sidebar to manage default subject sets</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Class Detail (right panel) ────────────────────────────────────────────────
function ClassDetail({
  cls, schoolId, teachers, allClasses, onClassUpdated, onNavigate
}: {
  cls: ClassRow
  schoolId: number
  teachers: Teacher[]
  allClasses: ClassRow[]
  onClassUpdated: (updates: Partial<ClassRow> & { id: number }) => void
  onNavigate?: (tab: string) => void
}) {
  const [tab, setTab] = useState<'overview' | 'subjects' | 'timetable' | 'students' | 'syllabus'>('overview')
  const [attSummary, setAttSummary] = useState<{ date: string; present: number; absent: number; late: number }[]>([])
  const [attLoading, setAttLoading] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subLoading, setSubLoading] = useState(true)
  const [subjectMsg, setSubjectMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [addingSubject, setAddingSubject] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [newTeacher, setNewTeacher] = useState('')
  const [editingClassTeacher, setEditingClassTeacher] = useState(false)
  const [ctId, setCtId] = useState(String(cls.class_teacher_id || ''))
  const [savingCT, setSavingCT] = useState(false)
  const [ctConflict, setCtConflict] = useState<{ teacherName: string; existingClass: ClassRow } | null>(null)
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [ttLoading, setTtLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [deletingTt, setDeletingTt] = useState(false)
  const [showDeleteTtConfirm, setShowDeleteTtConfirm] = useState(false)
  const [editSlotId, setEditSlotId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editTeacher, setEditTeacher] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [studLoading, setStudLoading] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [addStudentForm, setAddStudentForm] = useState({ name: '', roll_number: '', email: '', phone: '', parent_name: '', parent_phone: '' })
  const [addingStudent, setAddingStudent] = useState(false)
  const [addStudentMsg, setAddStudentMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [assigningTeacherId, setAssigningTeacherId] = useState<number | null>(null) // subject id being inline-assigned
  const [inlineTeacher, setInlineTeacher] = useState('')
  const [templates, setTemplates] = useState<{ id: number; name: string; from_grade: number; to_grade: number; subjects: { name: string; periods_per_week: number }[] }[]>([])
  const [applyingDefaults, setApplyingDefaults] = useState(false)
  const [defaultsMsg, setDefaultsMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [selectedCurriculum, setSelectedCurriculum] = useState<'CBSE' | 'APSSC' | 'SSC' | 'both'>('both')

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

  async function loadAttendanceSummary() {
    setAttLoading(true)
    try {
      const rows: { date: string; present: number; absent: number; late: number }[] = []
      const today = new Date()
      const promises = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        return fetch(`/api/attendance?class_id=${cls.id}&school_id=${schoolId}&date=${dateStr}&summary=true`)
          .then(r => r.json())
          .then(data => {
            const m = data.morning
            if (m && m.total > 0) rows.push({ date: dateStr, present: m.present, absent: m.absent, late: m.late || 0 })
          })
          .catch(() => {})
      })
      await Promise.all(promises)
      rows.sort((a, b) => a.date.localeCompare(b.date))
      setAttSummary(rows)
    } finally { setAttLoading(false) }
  }

  // Reset state when class changes
  useEffect(() => {
    setTab('overview')
    setSubjectMsg(null)
    setGenMsg(null)
    setEditSlotId(null)
    setEditingClassTeacher(false)
    setCtId(String(cls.class_teacher_id || ''))
    loadSubjects()
    loadAttendanceSummary()
  }, [cls.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'timetable') loadTimetable()
    if (tab === 'students') loadStudents()
    if (tab === 'subjects' && templates.length === 0) setTemplates([])
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStudents() {
    setStudLoading(true)
    try {
      const data = await fetch(`/api/students?school_id=${schoolId}&grade=${cls.grade}&section=${cls.section}`).then(r => r.json())
      setStudents(Array.isArray(data) ? data : [])
    } finally { setStudLoading(false) }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!addStudentForm.name.trim()) return
    setAddingStudent(true); setAddStudentMsg(null)
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, grade: cls.grade, section: cls.section, ...addStudentForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAddStudentForm({ name: '', roll_number: '', email: '', phone: '', parent_name: '', parent_phone: '' })
      setShowAddStudent(false)
      await loadStudents()
      onClassUpdated({ id: cls.id, student_count: cls.student_count + 1 })
      const msg = data.parent_warning
        ? `✓ ${data.name} added — ⚠ ${data.parent_warning}`
        : `✓ ${data.name} added to ${cls.grade}-${cls.section}`
      setAddStudentMsg({ text: msg, ok: !data.parent_warning })
      setTimeout(() => setAddStudentMsg(null), data.parent_warning ? 12000 : 4000)
    } catch (err: unknown) {
      setAddStudentMsg({ text: err instanceof Error ? err.message : 'Failed to add student', ok: false })
    } finally { setAddingStudent(false) }
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
      setNewName(''); setNewTeacher('')
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

  async function saveClassTeacher(force = false) {
    // Conflict check: is this teacher already a class teacher of another class?
    if (ctId && !force) {
      const tid = parseInt(ctId)
      const conflict = allClasses.find(c => c.id !== cls.id && c.class_teacher_id === tid)
      if (conflict) {
        const teacher = teachers.find(t => t.id === tid)
        setCtConflict({ teacherName: teacher?.name ?? 'This teacher', existingClass: conflict })
        return
      }
    }
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
      setCtConflict(null)
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
      const parts: string[] = [`Generated successfully.`]
      if (data.conflicts_auto_resolved > 0) parts.push(`${data.conflicts_auto_resolved} conflict(s) auto-resolved.`)
      if (data.conflicts_need_manual  > 0) parts.push(`${data.conflicts_need_manual} slot(s) need a teacher — click the amber cells to assign.`)
      setGenMsg({ text: parts.join(' '), ok: true })
      onClassUpdated({ id: cls.id, timetable_generated_at: new Date().toISOString() } as Partial<ClassRow> & { id: number })
      await loadTimetable()
    } catch (err: unknown) {
      setGenMsg({ text: err instanceof Error ? err.message : 'Generation failed', ok: false })
    } finally { setGenerating(false) }
  }

  async function deleteTimetable() {
    setDeletingTt(true); setGenMsg(null); setShowDeleteTtConfirm(false)
    try {
      const res = await fetch(`/api/class-timetable?class_id=${cls.id}&school_id=${schoolId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setTimetable([])
      onClassUpdated({ id: cls.id, timetable_generated_at: null } as Partial<ClassRow> & { id: number })
      setGenMsg({ text: 'Timetable deleted. You can generate a new one anytime.', ok: true })
    } catch (err: unknown) {
      setGenMsg({ text: err instanceof Error ? err.message : 'Delete failed', ok: false })
    } finally { setDeletingTt(false) }
  }

  async function applyDefaults() {
    const gradeNum = parseInt(cls.grade)
    const applicable = templates.filter(t => !isNaN(gradeNum) && gradeNum >= t.from_grade && gradeNum <= t.to_grade)
    if (applicable.length === 0) {
      setDefaultsMsg({ text: 'No default subject set applies to Grade ' + cls.grade + '. Create one in School Settings → Default Subjects.', ok: false })
      setTimeout(() => setDefaultsMsg(null), 5000)
      return
    }
    setApplyingDefaults(true); setDefaultsMsg(null)
    let added = 0; const skipped: string[] = []
    for (const tmpl of applicable) {
      for (const subj of tmpl.subjects) {
        if (subjects.some(s => s.subject_name.toLowerCase() === subj.name.toLowerCase())) {
          skipped.push(subj.name); continue
        }
        try {
          await fetch(`/api/classes/${cls.id}/subjects`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_name: subj.name, periods_per_week: subj.periods_per_week }),
          })
          added++
        } catch { /* skip */ }
      }
    }
    await loadSubjects()
    const msg = added > 0 ? `✓ Added ${added} subject${added > 1 ? 's' : ''}${skipped.length ? ` · ${skipped.length} already existed` : ''}` : 'All subjects from the default set already exist'
    setDefaultsMsg({ text: msg, ok: added > 0 })
    setApplyingDefaults(false)
    setTimeout(() => setDefaultsMsg(null), 5000)
  }

  async function assignTeacherInline(subjectId: number) {
    if (!inlineTeacher) return
    try {
      await fetch(`/api/classes/${cls.id}/subjects`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, teacher_id: parseInt(inlineTeacher) }),
      })
      await loadSubjects()
      setAssigningTeacherId(null); setInlineTeacher('')
    } catch { /* silent */ }
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
  const existingNames = new Set(subjects.map(s => s.subject_name.toLowerCase()))
  const suggestions = getSuggestedSubjects(cls.grade, selectedCurriculum)
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
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={ctId} onChange={e => setCtId(e.target.value)}
                    className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 min-w-[200px]">
                    <option value="">— No class teacher —</option>
                    {(() => {
                      const teaching   = teachers.filter(t => t.staff_type !== 'non_teaching')
                      const eligible   = teaching.filter(t => canTeachGrade(t.teaches_grades, cls.grade))
                      const ineligible = teaching.filter(t => !canTeachGrade(t.teaches_grades, cls.grade))
                      return (
                        <>
                          {eligible.length > 0 && <optgroup label={`Grade ${cls.grade} teachers`}>
                            {eligible.map(t => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` · ${t.subject}` : ''}</option>)}
                          </optgroup>}
                          {ineligible.length > 0 && <optgroup label="Other grades">
                            {ineligible.map(t => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` · ${t.subject}` : ''}</option>)}
                          </optgroup>}
                        </>
                      )
                    })()}
                  </select>
                  <button onClick={() => saveClassTeacher()} disabled={savingCT}
                    className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium">
                    {savingCT ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingClassTeacher(false); setCtId(String(cls.class_teacher_id || '')) }}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {cls.class_teacher_name ? (
                    <span className="inline-flex items-center gap-1.5 bg-violet-100 text-violet-800 text-sm px-3 py-1 rounded-full font-medium">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
                      {cls.class_teacher_name}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-1 rounded-full font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      No class teacher assigned
                    </span>
                  )}
                  <button onClick={() => setEditingClassTeacher(true)}
                    className="text-xs text-violet-500 hover:text-violet-700 underline underline-offset-2">
                    {cls.class_teacher_name ? 'Change' : 'Assign'}
                  </button>
                </div>
              )}
              <span className="text-xs text-gray-400">{subjects.length} subjects · {totalPPW} periods/week</span>
              {hasTimetable && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Timetable Active</span>}
            </div>
          </div>
        </div>

        {/* Class teacher conflict modal */}
        {ctConflict && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setCtConflict(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Teacher Already Assigned</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    <strong>{ctConflict.teacherName}</strong> is already the Class Teacher of{' '}
                    <span className="font-semibold text-violet-700">Grade {ctConflict.existingClass.grade} – {ctConflict.existingClass.section}</span>.
                  </p>
                  <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    A teacher can serve as class teacher for multiple classes, but this may cause scheduling conflicts. Do you want to proceed?
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setCtConflict(null)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel — pick another
                </button>
                <button onClick={() => saveClassTeacher(true)} disabled={savingCT}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {savingCT ? 'Saving...' : 'Assign Anyway'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 mt-3 -mb-4">
          {(['overview', 'subjects', 'timetable', 'students', 'syllabus'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'overview' ? 'Overview' : t === 'subjects' ? `Subjects (${subjects.length})` : t === 'timetable' ? 'Timetable' : t === 'students' ? `Students (${cls.student_count})` : 'Syllabus'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="space-y-5">
            {/* Class Teacher Banner */}
            <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
              cls.class_teacher_name ? 'bg-violet-50 border-violet-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                  cls.class_teacher_name ? 'bg-violet-600 text-white' : 'bg-amber-200 text-amber-700'
                }`}>
                  {cls.class_teacher_name ? cls.class_teacher_name.charAt(0).toUpperCase() : '?'}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Class Teacher</p>
                  {cls.class_teacher_name
                    ? <p className="font-bold text-gray-900 text-sm">{cls.class_teacher_name}</p>
                    : <p className="font-semibold text-amber-700 text-sm">Not assigned yet</p>}
                </div>
              </div>
              <button onClick={() => setEditingClassTeacher(true)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  cls.class_teacher_name
                    ? 'border-violet-300 text-violet-700 hover:bg-violet-100'
                    : 'border-amber-300 text-amber-700 hover:bg-amber-100'
                }`}>
                {cls.class_teacher_name ? 'Change' : 'Assign Now'}
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-black text-violet-700">{cls.student_count}</p>
                <p className="text-xs text-violet-600 mt-1">Students</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-black text-blue-700">{subjects.length}</p>
                <p className="text-xs text-blue-600 mt-1">Subjects</p>
              </div>
              <div className={`border rounded-xl p-4 text-center ${cls.timetable_generated_at ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className={`text-xs font-bold mt-1 ${cls.timetable_generated_at ? 'text-green-700' : 'text-amber-600'}`}>
                  {cls.timetable_generated_at ? 'Timetable Ready' : 'No Timetable'}
                </p>
                {cls.timetable_generated_at && (
                  <p className="text-[10px] text-green-500 mt-0.5">
                    {new Date(cls.timetable_generated_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Teachers & Subjects */}
            {subjects.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600">Teachers & Subjects</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {subjects.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                        <span className="text-sm font-medium text-gray-800">{s.subject_name}</span>
                        <span className="text-xs text-gray-400">{s.periods_per_week}/wk</span>
                      </div>
                      {s.teacher_name
                        ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">{s.teacher_name}</span>
                        : <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">No teacher</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attendance last 7 days */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Attendance — Last 7 Days</p>
                <button onClick={loadAttendanceSummary} className="text-xs text-gray-400 hover:text-gray-600">Refresh</button>
              </div>
              {attLoading ? (
                <div className="py-6 text-center text-gray-400 text-xs">Loading...</div>
              ) : attSummary.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-xs">No attendance marked in the last 7 days</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {attSummary.map(row => {
                    const total = row.present + row.absent + row.late
                    const pct = total > 0 ? Math.round((row.present / total) * 100) : 0
                    const d = new Date(row.date + 'T00:00:00')
                    return (
                      <div key={row.date} className="flex items-center gap-4 px-4 py-2.5">
                        <div className="w-20 flex-shrink-0">
                          <p className="text-xs font-semibold text-gray-700">
                            {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <div className="flex-1">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 80 ? 'bg-green-400' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="text-right w-24 flex-shrink-0">
                          <span className={`text-xs font-bold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{pct}%</span>
                          <span className="text-xs text-gray-400 ml-2">{row.present}/{total}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setTab('subjects')}
                className="border border-gray-200 rounded-xl p-3 text-left hover:bg-gray-50 transition-colors">
                <p className="text-sm font-semibold text-gray-700">Manage Subjects</p>
                <p className="text-xs text-gray-400 mt-0.5">{subjects.length} assigned</p>
              </button>
              <button onClick={() => setTab('timetable')}
                className="border border-gray-200 rounded-xl p-3 text-left hover:bg-gray-50 transition-colors">
                <p className="text-sm font-semibold text-gray-700">View Timetable</p>
                <p className="text-xs text-gray-400 mt-0.5">{cls.timetable_generated_at ? 'Generated' : 'Not generated'}</p>
              </button>
              <button onClick={() => setTab('students')}
                className="border border-gray-200 rounded-xl p-3 text-left hover:bg-gray-50 transition-colors">
                <p className="text-sm font-semibold text-gray-700">Student List</p>
                <p className="text-xs text-gray-400 mt-0.5">{cls.student_count} enrolled</p>
              </button>
            </div>
          </div>
        )}

        {/* ── SUBJECTS ── */}
        {tab === 'subjects' && (
          <div className="space-y-4">
            {subjectMsg && (
              <div className={`rounded-lg px-4 py-2.5 text-sm border ${subjectMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {subjectMsg.text}
              </div>
            )}

            {/* Apply defaults banner */}
            {(() => {
              const gradeNum = parseInt(cls.grade)
              const applicable = templates.filter(t => !isNaN(gradeNum) && gradeNum >= t.from_grade && gradeNum <= t.to_grade)
              if (applicable.length === 0) return null
              return (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">Default subject set available</p>
                    <p className="text-xs text-indigo-500 mt-0.5">
                      {applicable.map(t => t.name).join(', ')} · {applicable.reduce((a, t) => a + t.subjects.length, 0)} subjects
                    </p>
                  </div>
                  <button onClick={applyDefaults} disabled={applyingDefaults}
                    className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {applyingDefaults ? 'Applying...' : 'Apply Defaults'}
                  </button>
                </div>
              )
            })()}

            {defaultsMsg && (
              <div className={`px-4 py-2.5 rounded-xl text-sm ${defaultsMsg.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                {defaultsMsg.text}
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
                <div className="py-8 text-center text-gray-400 text-sm">No subjects yet. Apply defaults or add from suggestions below.</div>
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
                        {assigningTeacherId === s.id ? (
                          <div className="flex items-center gap-1.5">
                            <select value={inlineTeacher} onChange={e => setInlineTeacher(e.target.value)}
                              autoFocus
                              className="border border-violet-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 max-w-[180px]">
                              <option value="">Select teacher...</option>
                              {(() => {
                                const eligible   = teachers.filter(t => t.staff_type !== 'non_teaching' && canTeachGrade(t.teaches_grades, cls.grade))
                                const ineligible = teachers.filter(t => t.staff_type !== 'non_teaching' && !canTeachGrade(t.teaches_grades, cls.grade))
                                return (
                                  <>
                                    {eligible.length > 0 && <optgroup label={`Grade ${cls.grade} teachers`}>
                                      {eligible.map(t => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` · ${t.subject}` : ''}</option>)}
                                    </optgroup>}
                                    {ineligible.length > 0 && <optgroup label="Other grades (not assigned)">
                                      {ineligible.map(t => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` · ${t.subject}` : ''}</option>)}
                                    </optgroup>}
                                  </>
                                )
                              })()}
                            </select>
                            <button onClick={() => assignTeacherInline(s.id)} disabled={!inlineTeacher}
                              className="text-xs px-2 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">✓</button>
                            <button onClick={() => { setAssigningTeacherId(null); setInlineTeacher('') }}
                              className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                        ) : s.teacher_name ? (
                          <button onClick={() => { setAssigningTeacherId(s.id); setInlineTeacher('') }}
                            className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 hover:bg-emerald-100 transition-colors">
                            {s.teacher_name}
                          </button>
                        ) : (
                          <button onClick={() => { setAssigningTeacherId(s.id); setInlineTeacher('') }}
                            className="text-xs bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                            Assign Teacher
                          </button>
                        )}
                        <button onClick={() => removeSubject(s.id, s.subject_name)} disabled={removingId === s.id}
                          className="text-red-300 hover:text-red-500 text-xs p-1 transition-colors disabled:opacity-40">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Curriculum picker + Suggestions */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Suggested Subjects — Grade {cls.grade}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Pick curriculum · click subject to add · teacher auto-assigned</p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {(['CBSE', 'APSSC', 'SSC', 'both'] as const).map(c => (
                    <button key={c} onClick={() => setSelectedCurriculum(c)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                        selectedCurriculum === c
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                      }`}>
                      {c === 'both' ? 'All' : c === 'APSSC' ? 'AP SSC' : c}
                    </button>
                  ))}
                </div>
              </div>
              {availableSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availableSuggestions.map(name => (
                    <button key={name} onClick={() => addSubject(name)} disabled={addingSubject}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-400 transition-colors disabled:opacity-50 flex items-center gap-1">
                      <span className="text-violet-400 font-bold">+</span> {name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">All suggested subjects for this curriculum are already added.</p>
              )}
            </div>

            {/* Custom add */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Add Custom Subject</p>
              <div className="flex gap-2 flex-wrap">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubject(newName, '4', newTeacher)}
                  className={inp + ' flex-1 min-w-36 text-sm'} placeholder="Subject name" />
                <select value={newTeacher} onChange={e => setNewTeacher(e.target.value)}
                  className={inp + ' w-56 text-sm'}>
                  <option value="">Auto-assign teacher</option>
                  {(() => {
                    const eligible   = teachers.filter(t => t.subject && canTeachGrade(t.teaches_grades, cls.grade))
                    const ineligible = teachers.filter(t => t.subject && !canTeachGrade(t.teaches_grades, cls.grade))
                    return (
                      <>
                        {eligible.length > 0 && <optgroup label={`Grade ${cls.grade} teachers`}>
                          {eligible.map(t => <option key={t.id} value={t.id}>{t.name} – {t.subject}</option>)}
                        </optgroup>}
                        {ineligible.length > 0 && <optgroup label="Other grades">
                          {ineligible.map(t => <option key={t.id} value={t.id}>{t.name} – {t.subject}</option>)}
                        </optgroup>}
                      </>
                    )
                  })()}
                </select>
                <button onClick={() => addSubject(newName, '4', newTeacher)}
                  disabled={addingSubject || !newName.trim()}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {addingSubject ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>

            {subjects.length > 0 && (
              <div className={`rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3 ${hasTimetable ? 'bg-emerald-50 border border-emerald-200' : 'bg-blue-50 border border-blue-200'}`}>
                <div>
                  <p className={`text-sm font-medium ${hasTimetable ? 'text-emerald-800' : 'text-blue-800'}`}>
                    {hasTimetable ? '✓ Timetable is active.' : `${subjects.length} subject${subjects.length !== 1 ? 's' : ''} added — timetable not generated yet.`}
                  </p>
                  <p className={`text-xs mt-0.5 ${hasTimetable ? 'text-emerald-600' : 'text-blue-600'}`}>
                    {hasTimetable ? `${subjects.length} subjects · ${totalPPW} periods/week` : 'Go to the Timetable tab to generate.'}
                  </p>
                </div>
                <button onClick={() => setTab('timetable')}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg ${hasTimetable ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {hasTimetable ? 'View Timetable →' : 'Go to Timetable →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TIMETABLE ── */}
        {tab === 'timetable' && (
          <div className="space-y-4">
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
              /* ── No timetable yet: show generate CTA ── */
              <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                {subjects.length === 0 ? (
                  <>
                    <div>
                      <p className="text-gray-700 font-semibold">No subjects added yet</p>
                      <p className="text-gray-400 text-sm mt-1">Add subjects in the Subjects tab first, then come back to generate the timetable.</p>
                    </div>
                    <button onClick={() => setTab('subjects')}
                      className="px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700">
                      Go to Subjects →
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-gray-700 font-semibold">Ready to generate!</p>
                      <p className="text-gray-400 text-sm mt-1">{subjects.length} subject{subjects.length !== 1 ? 's' : ''} · {totalPPW} periods/week</p>
                    </div>
                    <button onClick={() => generateTimetable(false)} disabled={generating}
                      className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      {generating
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
                        : <>⚡ Generate Timetable</>}
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* ── Timetable exists: show read-only grid ── */
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-gray-400">{subjects.length} subjects · {totalPPW} periods/week</p>
                  <button onClick={() => {/* navigate to timetable tab handled by parent */}}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors">
                    Manage in Timetable tab →
                  </button>
                </div>
                <TimetableGrid
                  timetable={timetable}
                  teachers={teachers}
                  editSlotId={null}
                  editSubject={''}
                  editTeacher={''}
                  setEditSlotId={() => {}}
                  setEditSubject={() => {}}
                  setEditTeacher={() => {}}
                  onSaveSlot={() => {}}
                />
              </>
            )}
          </div>
        )}

        {/* ── STUDENTS ── */}
        {tab === 'students' && (
          <div className="space-y-3">
            {addStudentMsg && (
              <div className={`rounded-lg px-4 py-2.5 text-sm border ${addStudentMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {addStudentMsg.text}
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <span className="text-xs font-semibold text-gray-600">Students in {cls.grade}-{cls.section}</span>
                  <span className="text-xs text-gray-400 ml-2">{students.length} enrolled</span>
                </div>
                <button
                  onClick={() => setShowAddStudent(v => !v)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    showAddStudent ? 'bg-violet-600 text-white border-violet-600' : 'border-violet-200 text-violet-600 hover:bg-violet-50'
                  }`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Student
                </button>
              </div>

              {/* Quick add student form */}
              {showAddStudent && (
                <form onSubmit={handleAddStudent} className="px-4 py-4 bg-violet-50 border-b border-violet-100 space-y-3">
                  <p className="text-xs font-semibold text-violet-700 mb-1">
                    New student → Grade {cls.grade} – Section {cls.section}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Name <span className="text-red-400">*</span></label>
                      <input required value={addStudentForm.name}
                        onChange={e => setAddStudentForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                        placeholder="Full name" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Roll No.</label>
                      <input value={addStudentForm.roll_number}
                        onChange={e => setAddStudentForm(f => ({ ...f, roll_number: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                        placeholder="e.g. 23" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Phone</label>
                      <input value={addStudentForm.phone}
                        onChange={e => setAddStudentForm(f => ({ ...f, phone: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                        placeholder="Student phone" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Email</label>
                      <input type="email" value={addStudentForm.email}
                        onChange={e => setAddStudentForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                        placeholder="student@email.com" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Parent Name</label>
                      <input value={addStudentForm.parent_name}
                        onChange={e => setAddStudentForm(f => ({ ...f, parent_name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                        placeholder="Parent full name" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Parent Phone</label>
                      <input value={addStudentForm.parent_phone}
                        onChange={e => setAddStudentForm(f => ({ ...f, parent_phone: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                        placeholder="Parent phone" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={addingStudent}
                      className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-xs py-1.5 rounded-lg font-medium disabled:opacity-50">
                      {addingStudent ? 'Adding...' : 'Add Student'}
                    </button>
                    <button type="button" onClick={() => setShowAddStudent(false)}
                      className="flex-1 border border-gray-200 text-gray-500 text-xs py-1.5 rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {studLoading ? (
                <div className="py-8 text-center">
                  <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : students.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  No students enrolled yet.
                  <button onClick={() => setShowAddStudent(true)} className="block mx-auto mt-2 text-violet-500 hover:text-violet-700 underline text-xs">
                    Add the first student →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {students.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <span className="text-xs text-gray-300 w-5 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                        <p className="text-xs text-gray-400">Roll: {s.roll_number || '—'}</p>
                      </div>
                      {s.phone && <span className="text-xs text-gray-400">{s.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SYLLABUS ── */}
        {tab === 'syllabus' && (
          <StudentSyllabus schoolId={schoolId} classId={cls.id} />
        )}
      </div>
    </div>
  )
}

// ─── Timetable Grid (days × periods) ──────────────────────────────────────────
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

  // Periods sorted ascending
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

  // Get time label for a period (from any day that has it)
  function getTime(period: number) {
    const s = timetable.find(t => t.period_number === period)
    return s ? `${s.time_from}–${s.time_to}` : ''
  }

  // Is this period a break across all days?
  function isBreakPeriod(period: number) {
    const sample = activeDays.map(d => slotMap.get(`${d}-${period}`)).find(Boolean)
    return sample?.is_break ?? false
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {/* Day column header */}
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-20 border-r border-gray-200 sticky left-0 bg-gray-50 z-10">
                Day
              </th>
              {/* Period columns */}
              {periodNumbers.map(period => {
                const isBreak = isBreakPeriod(period)
                const sample = activeDays.map(d => slotMap.get(`${d}-${period}`)).find(Boolean)
                return (
                  <th key={period} className={`px-2 py-2 text-center font-semibold min-w-[100px] border-r border-gray-100 last:border-r-0 ${isBreak ? 'bg-amber-50' : ''}`}>
                    {isBreak ? (
                      <span className="text-amber-600 text-[10px] font-semibold">{sample?.break_label || 'Break'}</span>
                    ) : (
                      <div>
                        <div className="text-gray-600">P{period}</div>
                        <div className="text-gray-400 text-[10px] font-normal mt-0.5 whitespace-nowrap">{getTime(period)}</div>
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {activeDays.map(day => (
              <tr key={day} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/30">
                {/* Day label */}
                <td className="px-3 py-2 border-r border-gray-200 sticky left-0 bg-white z-10">
                  <span className="font-semibold text-gray-700 text-[11px]">{day.slice(0, 3)}</span>
                </td>

                {/* Period cells */}
                {periodNumbers.map(period => {
                  const slot = slotMap.get(`${day}-${period}`)
                  if (!slot) return (
                    <td key={period} className="px-2 py-2 border-r border-gray-100 last:border-r-0 text-center text-gray-200">—</td>
                  )
                  if (slot.is_break) return (
                    <td key={period} className="px-2 py-2 border-r border-gray-100 last:border-r-0 text-center bg-amber-50/60">
                      <span className="text-amber-500 text-[10px]">Break</span>
                    </td>
                  )
                  if (editSlotId === slot.id) return (
                    <td key={period} className="px-2 py-1.5 border-r border-gray-100 last:border-r-0">
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
                    <td key={period} className="px-1.5 py-1.5 border-r border-gray-100 last:border-r-0">
                      <div
                        className={`rounded-lg border px-2 py-1.5 cursor-pointer hover:opacity-80 transition-opacity group relative ${colorCls}`}
                        onClick={() => { setEditSlotId(slot.id); setEditSubject(slot.subject_name || ''); setEditTeacher(String(slot.teacher_id || '')) }}
                        title={isConflict ? `⚠ ${slot.teacher_name} is also teaching another class at this slot` : undefined}
                      >
                        {isConflict && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">!</span>
                        )}
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
            ))}
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
