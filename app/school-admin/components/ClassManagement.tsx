'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import StudentSyllabus from '../../student/components/StudentSyllabus'
import { useFeature } from '@/lib/features-context'
import { GRADE_SEQUENCE } from '@/lib/grades'
import { InlineLoader } from '@/components/loaders'
import { useConfirm } from '@/components/ui/use-confirm'

type Props = { schoolId: number; onNavigate?: (tab: string, subTab?: string) => void }

type ClassRow = { id: number; grade: string; section: string; class_teacher_id: number | null; class_teacher_name: string | null; student_count: number; }
type Teacher = { id: number; name: string; subject: string; employee_id: string; department: string; teaches_grades?: string; staff_type?: string }
type Subject = { id: number; subject_name: string; teacher_id: number | null; teacher_name: string | null; periods_per_week: number }
type Student = { id: number; name: string; roll_number: string; email: string; phone: string }

// Returns true when teacher has no grade restriction OR their restriction includes this grade
const StudentProfile = dynamic(() => import('./StudentProfile'), { ssr: false })

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

  // Delete-class modal: 3-option flow (deactivate / reassign to another
  // section of the same grade / handle manually) — see confirmDeleteClass().
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null)
  const [deleteMode, setDeleteMode] = useState<'deactivate' | 'reassign' | 'manual'>('deactivate')
  const [deleteTargetClassId, setDeleteTargetClassId] = useState('')
  const [deletingClass, setDeletingClass] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const rightPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Create class — backend auto-assigns subjects + teachers.
      const res = await fetch('/api/classes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, grade, section }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const subCount = data.subjects_assigned ?? 0
      const unmatched: string[] = data.unmatched_subjects ?? []
      setSetupMsg(
        unmatched.length > 0
          ? `${subCount} subjects assigned · ${unmatched.length} need a teacher (${unmatched.join(', ')})`
          : `${subCount} subjects assigned`
      )

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

  function openDeleteModal(e: React.MouseEvent, cls: ClassRow) {
    e.stopPropagation()
    setDeleteTarget(cls)
    setDeleteMode('deactivate')
    setDeleteTargetClassId('')
    setDeleteError(null)
  }

  // Runs the delete for whichever mode is currently selected in the modal.
  // 'manual' mode doesn't move/deactivate anything itself — the server just
  // re-checks the live active-student count; if any remain it 409s and this
  // re-opens the same 3-option modal instead of silently doing nothing.
  async function confirmDeleteClass() {
    if (!deleteTarget) return
    setDeletingClass(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/classes/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: deleteMode,
          targetClassId: deleteMode === 'reassign' ? Number(deleteTargetClassId) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && typeof data.activeStudentCount === 'number') {
          setDeleteError(`${data.activeStudentCount} student${data.activeStudentCount !== 1 ? 's are' : ' is'} still active in this class. Choose how to handle them, or deactivate/reassign them yourself and try again.`)
        } else {
          setDeleteError(data.error || 'Failed to delete class')
        }
        return
      }
      const id = deleteTarget.id
      setClasses(prev => prev.filter(c => c.id !== id))
      if (selectedId === id) setSelectedId(null)
      setDeleteTarget(null)
      await loadData()
      const removed = await fetch(`/api/classes?school_id=${schoolId}&removed=true`).then(r => r.json())
      setRemovedClasses(Array.isArray(removed) ? removed : [])
    } catch {
      setDeleteError('Failed to delete class')
    } finally {
      setDeletingClass(false)
    }
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

  if (loading) return (
    <div className="py-16">
      <InlineLoader portal="school-admin" label="Loading classes…" size="lg" />
    </div>
  )

  return (
    <div className="flex gap-0 h-[calc(100vh-140px)] min-h-[600px]">
      {/* ── Left sidebar: class list ── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white rounded-l-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Classes</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowAdd(v => !v)}
              className="w-6 h-6 flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white rounded-md text-sm font-bold transition-colors">+</button>
          </div>
        </div>

        {error && (
          <div className="mx-3 mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-2 text-red-400">✕</button>
          </div>
        )}

        {showAdd && (
          <form onSubmit={addClass} className="mx-3 mt-3 bg-violet-50 border border-violet-200 rounded-md p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Grade*</label>
                <input required value={newClass.grade} onChange={e => setNewClass(f => ({ ...f, grade: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 w-full" placeholder="10" />
              </div>
              <div className="w-14">
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Sec*</label>
                <input required value={newClass.section} onChange={e => setNewClass(f => ({ ...f, section: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 w-full" placeholder="A" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Assign class teacher after creating from the class overview</p>
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
            <p className="text-xs text-muted-foreground text-center py-6 px-3">No classes yet.<br/>Click + to add one.</p>
          ) : (
            sortedGrades.map(grade => (
              <div key={grade} className="mb-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-4 py-1">Grade {grade}</p>
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
                      <p className="text-xs text-muted-foreground truncate">
                        {cls.student_count} student{cls.student_count !== 1 ? 's' : ''}
                      </p>
                      {cls.class_teacher_name
                        ? <p className="text-xs text-indigo-500 font-medium truncate">CT: {cls.class_teacher_name}</p>
                        : <p className="text-xs text-amber-400">No class teacher</p>}
                    </div>
                    <button onClick={e => openDeleteModal(e, cls)} data-testid={`delete-class-${cls.id}`}
                      title={`Remove Grade ${cls.grade} – ${cls.section}`}
                      aria-label={`Remove Grade ${cls.grade} – ${cls.section}`}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
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
              className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-red-400 uppercase tracking-wider hover:bg-red-50 transition-colors">
              <span>Removed ({removedClasses.length})</span>
              <span>{showRemoved ? '▲' : '▼'}</span>
            </button>
            {showRemoved && (
              <div className="pb-2">
                {removedClasses.map(rc => (
                  <div key={rc.id} className="flex items-center justify-between px-4 py-2 opacity-60">
                    <div>
                      <p className="text-xs font-medium text-gray-500 line-through">{rc.grade}-{rc.section}</p>
                      <p className="text-xs text-muted-foreground">{rc.student_count} student{Number(rc.student_count) !== 1 ? 's' : ''} deactivated</p>
                    </div>
                    <span className="text-xs text-red-300 bg-red-50 px-1.5 py-0.5 rounded-full">Removed</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel: class detail ── */}
      <div ref={rightPanelRef} className="flex-1 min-w-0 bg-white rounded-r-xl overflow-hidden overflow-y-auto">
        {selectedClass ? (
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
            <div className="w-16 h-16 bg-violet-50 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Select a class</p>
            <p className="text-muted-foreground text-sm mt-1">Choose a class from the left to manage subjects and students</p>
          </div>
        )}
      </div>

      {/* ── Delete class modal: deactivate / reassign / manual ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !deletingClass && setDeleteTarget(null)}>
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Remove Grade {deleteTarget.grade} – {deleteTarget.section}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Its subject-teacher assignments will be permanently removed.
                  {deleteTarget.student_count > 0 && (
                    <> {deleteTarget.student_count} student{deleteTarget.student_count !== 1 ? 's are' : ' is'} still active in this class — choose what happens to them:</>
                  )}
                </p>
              </div>
            </div>

            {deleteTarget.student_count > 0 && (
              <div className="space-y-2 mb-4">
                <label className="flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors"
                  style={{ borderColor: deleteMode === 'deactivate' ? '#7c3aed' : '#e5e7eb', background: deleteMode === 'deactivate' ? '#f5f3ff' : 'white' }}>
                  <input type="radio" name="deleteMode" checked={deleteMode === 'deactivate'} onChange={() => setDeleteMode('deactivate')}
                    className="mt-0.5" data-testid="delete-mode-deactivate" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Deactivate these students</p>
                    <p className="text-xs text-muted-foreground">They&rsquo;re marked inactive — no longer counted as enrolled, portal access is revoked.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors"
                  style={{ borderColor: deleteMode === 'reassign' ? '#7c3aed' : '#e5e7eb', background: deleteMode === 'reassign' ? '#f5f3ff' : 'white' }}>
                  <input type="radio" name="deleteMode" checked={deleteMode === 'reassign'} onChange={() => setDeleteMode('reassign')}
                    className="mt-0.5" data-testid="delete-mode-reassign" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">Move them to another section</p>
                    <p className="text-xs text-muted-foreground mb-2">Same grade only — pick which section.</p>
                    {deleteMode === 'reassign' && (
                      <select value={deleteTargetClassId} onChange={e => setDeleteTargetClassId(e.target.value)}
                        data-testid="delete-reassign-target"
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 w-full">
                        <option value="">— Select section —</option>
                        {classes.filter(c => c.grade === deleteTarget.grade && c.id !== deleteTarget.id).map(c => (
                          <option key={c.id} value={c.id}>Section {c.section} ({c.student_count} students)</option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors"
                  style={{ borderColor: deleteMode === 'manual' ? '#7c3aed' : '#e5e7eb', background: deleteMode === 'manual' ? '#f5f3ff' : 'white' }}>
                  <input type="radio" name="deleteMode" checked={deleteMode === 'manual'} onChange={() => setDeleteMode('manual')}
                    className="mt-0.5" data-testid="delete-mode-manual" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">I&rsquo;ll handle it myself</p>
                    <p className="text-xs text-muted-foreground">Deactivate or move them from Students first — the class won&rsquo;t delete until none are active here.</p>
                  </div>
                </label>
              </div>
            )}

            {deleteError && (
              <div className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)} disabled={deletingClass}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDeleteClass}
                disabled={deletingClass || (deleteMode === 'reassign' && !deleteTargetClassId)}
                data-testid="confirm-delete-class"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deletingClass ? 'Removing…' : 'Remove Class'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  onNavigate?: (tab: string, subTab?: string) => void
}) {
  const hasAttendance = useFeature('attendance')
  const { confirm, ConfirmDialog } = useConfirm()
  const [tab, setTab] = useState<'overview' | 'subjects' | 'students' | 'syllabus'>('overview')
  const [attSummary, setAttSummary] = useState<{ date: string; present: number; absent: number; late: number }[]>([])
  const [attLoading, setAttLoading] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subLoading, setSubLoading] = useState(true)
  const [subjectMsg, setSubjectMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [editingClassTeacher, setEditingClassTeacher] = useState(false)
  const [ctId, setCtId] = useState(String(cls.class_teacher_id || ''))
  const [savingCT, setSavingCT] = useState(false)
  const [ctConflict, setCtConflict] = useState<{ teacherName: string; existingClass: ClassRow } | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [studLoading, setStudLoading] = useState(false)
  const [profileId, setProfileId] = useState<number | null>(null)
  const [assigningTeacherId, setAssigningTeacherId] = useState<number | null>(null) // subject id being inline-assigned
  const [inlineTeacher, setInlineTeacher] = useState('')
  // Subjects the school has subscribed to via Syllabus Customizer for this
  // class's grade — the only source of subjects offered here now, so
  // class_subjects.subject_name is always identical to
  // school_subjects.subject_name (the string /api/syllabus and the teacher
  // class-subjects gate join on). Null until subscribed.
  const [subscribedSubjects, setSubscribedSubjects] = useState<string[] | null>(null)

  const loadSubjects = useCallback(async () => {
    setSubLoading(true)
    try {
      const data = await fetch(`/api/classes/${cls.id}/subjects`).then(r => r.json())
      setSubjects(Array.isArray(data) ? data : [])
    } finally { setSubLoading(false) }
  }, [cls.id])

  const loadSubscribedSubjects = useCallback(async () => {
    try {
      const data = await fetch(`/api/school/subjects?school_id=${schoolId}`).then(r => r.json())
      const rows: { grade: string; subject_name: string }[] = Array.isArray(data.subjects) ? data.subjects : []
      const forGrade = rows.filter(s => s.grade === cls.grade).map(s => s.subject_name)
      setSubscribedSubjects(forGrade.length > 0 ? forGrade : null)
    } catch {
      setSubscribedSubjects(null)
    }
  }, [schoolId, cls.grade])

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
    setEditingClassTeacher(false)
    setCtId(String(cls.class_teacher_id || ''))
    loadSubjects()
    loadSubscribedSubjects()
    if (hasAttendance) loadAttendanceSummary()
  }, [cls.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStudents() {
    setStudLoading(true)
    try {
      const data = await fetch(`/api/students?school_id=${schoolId}&grade=${cls.grade}&section=${cls.section}`).then(r => r.json())
      setStudents(Array.isArray(data) ? data : [])
    } finally { setStudLoading(false) }
  }

  useEffect(() => {
    if (tab === 'students') loadStudents()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function removeSubject(subjectId: number, name: string) {
    const ok = await confirm(`Remove "${name}"?`, { title: 'Remove subject?', confirmText: 'Remove', destructive: true })
    if (!ok) return
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

  const totalPPW = subjects.reduce((a, s) => a + s.periods_per_week, 0)

  return (
    <div className="flex flex-col h-full">
      {ConfirmDialog}
      {profileId !== null && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
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
              <span className="text-xs text-muted-foreground">{subjects.length} subjects · {totalPPW} periods/week</span>
            </div>
          </div>
        </div>

        {/* Class teacher conflict modal */}
        {ctConflict && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setCtConflict(null)}>
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
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
          {(['overview', 'subjects', 'students', 'syllabus'] as const)
            .map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'overview' ? 'Overview' : t === 'subjects' ? `Subjects (${subjects.length})` : t === 'students' ? `Students (${cls.student_count})` : 'Syllabus'}
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
            <div className={`rounded-md border p-4 flex items-center justify-between gap-4 ${
              cls.class_teacher_name ? 'bg-violet-50 border-violet-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                  cls.class_teacher_name ? 'bg-violet-600 text-white' : 'bg-amber-200 text-amber-700'
                }`}>
                  {cls.class_teacher_name ? cls.class_teacher_name.charAt(0).toUpperCase() : '?'}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Class Teacher</p>
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
            <div className={`grid gap-3 grid-cols-2`}>
              <div className="bg-violet-50 border border-violet-200 rounded-md p-4 text-center">
                <p className="text-3xl font-semibold text-violet-700">{cls.student_count}</p>
                <p className="text-xs text-violet-600 mt-1">Students</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center">
                <p className="text-3xl font-semibold text-blue-700">{subjects.length}</p>
                <p className="text-xs text-blue-600 mt-1">Subjects</p>
              </div>
            </div>

            {/* Teachers & Subjects */}
            {subjects.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600">Teachers & Subjects</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {subjects.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                        <span className="text-sm font-medium text-gray-800">{s.subject_name}</span>
                        <span className="text-xs text-muted-foreground">{s.periods_per_week}/wk</span>
                      </div>
                      {s.teacher_name
                        ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">{s.teacher_name}</span>
                        : <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">No teacher</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attendance last 7 days — only when the school has the Attendance Tracking feature */}
            {hasAttendance && (
              <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">Attendance — Last 7 Days</p>
                  <button onClick={loadAttendanceSummary} className="text-xs text-muted-foreground hover:text-gray-600">Refresh</button>
                </div>
                {attLoading ? (
                  <div className="py-6 text-center text-muted-foreground text-xs">Loading...</div>
                ) : attSummary.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-xs">No attendance marked in the last 7 days</div>
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
                            <span className="text-xs text-muted-foreground ml-2">{row.present}/{total}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Quick actions */}
            <div className={`grid gap-3 grid-cols-2`}>
              <button onClick={() => setTab('subjects')}
                className="border border-gray-200 rounded-md p-3 text-left hover:bg-gray-50 transition-colors">
                <p className="text-sm font-semibold text-gray-700">Manage Subjects</p>
                <p className="text-xs text-muted-foreground mt-0.5">{subjects.length} assigned</p>
              </button>
              <button onClick={() => setTab('students')}
                className="border border-gray-200 rounded-md p-3 text-left hover:bg-gray-50 transition-colors">
                <p className="text-sm font-semibold text-gray-700">Student List</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cls.student_count} enrolled</p>
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

            {/* Current subjects */}
            <div className="bg-gray-50 rounded-md border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Assigned Subjects</span>
                {subjects.length > 0 && <span className="text-xs text-muted-foreground">{totalPPW} periods/week</span>}
              </div>
              {subLoading ? (
                <div className="py-6 text-center text-muted-foreground text-xs">Loading...</div>
              ) : subjects.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No subjects yet. Apply defaults or add from suggestions below.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {subjects.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{s.subject_name}</p>
                          <p className="text-xs text-muted-foreground">{s.periods_per_week} per week</p>
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
                              className="text-xs text-muted-foreground hover:text-gray-600">✕</button>
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

            {/* Subjects are subscribed via Syllabus Customizer, not added here.
                Subscribing auto-populates class_subjects for EVERY existing
                class of that grade (not just ones checked in the Subscribe
                modal), and creating a new class for an already-subscribed
                grade does the same — a matching teacher is auto-assigned
                either way, so there's no manual "add subject" step needed
                here anymore. A one-time migration backfilled any gap that
                existed from before this was fixed. */}
            {!subscribedSubjects && (
              <div className="bg-violet-50 border border-violet-200 rounded-md p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-violet-800">No subjects subscribed for Grade {cls.grade} yet</p>
                  <p className="text-xs text-violet-500 mt-0.5">Subscribe subjects in Syllabus Customizer — they&rsquo;ll be added here automatically with a teacher auto-assigned.</p>
                </div>
                <button onClick={() => onNavigate?.('curriculum')}
                  className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors flex-shrink-0">
                  Go to Syllabus Customizer →
                </button>
              </div>
            )}

          </div>
        )}

        {/* ── STUDENTS ── */}
        {tab === 'students' && (
          <div className="space-y-3">
            <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <span className="text-xs font-semibold text-gray-600">Students in {cls.grade}-{cls.section}</span>
                  <span className="text-xs text-muted-foreground ml-2">{students.length} enrolled</span>
                </div>
                <button
                  onClick={() => onNavigate?.('students', 'onboard')}
                  data-testid="class-add-student"
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Student
                </button>
              </div>

              {studLoading ? (
                <div className="py-8">
                  <InlineLoader portal="school-admin" label="" />
                </div>
              ) : students.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No students enrolled yet.
                  <button onClick={() => onNavigate?.('students', 'onboard')} className="block mx-auto mt-2 text-violet-500 hover:text-violet-700 underline text-xs">
                    Add the first student →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {students.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <span className="text-xs text-gray-300 w-5 flex-shrink-0">{i + 1}</span>
                      <button type="button" onClick={() => setProfileId(s.id)} data-testid={`class-student-${s.id}`}
                        className="flex-1 min-w-0 text-left" aria-label={`Open full profile of ${s.name}`}>
                        <p className="font-medium text-violet-700 hover:underline text-sm">{s.name}</p>
                        <p className="text-xs text-muted-foreground">Roll: {s.roll_number || '—'}</p>
                      </button>
                      {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                      <button type="button" onClick={() => setProfileId(s.id)} data-testid={`class-student-profile-${s.id}`}
                        className="text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg px-2.5 py-1 hover:bg-violet-50">Profile →</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SYLLABUS ── */}
        {tab === 'syllabus' && (
          <StudentSyllabus schoolId={schoolId} classId={cls.id} grade={cls.grade} />
        )}
      </div>
    </div>
  )
}
