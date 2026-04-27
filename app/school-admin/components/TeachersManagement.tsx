'use client'

import { useEffect, useState } from 'react'

type Props = { schoolId: number; refreshKey?: number }

type Teacher = {
  id: number
  name: string
  email: string
  subject: string
  phone: string
  employee_id: string
  department: string
  qualification: string
  date_of_joining: string
  staff_type: string
  status: string
  class_id: number | null
  class_grade: string | null
  class_section: string | null
  teaches_grades: string | null
}

type HODAssignment = {
  id: number
  department: string
  teacher_id: number
  teacher_name: string
  teacher_subject: string
  class_ids: number[]
}

type ClassOption = { id: number; grade: string; section: string }

type EditForm = Partial<Teacher>

type TimetableSlot = {
  id: number
  day_of_week: string
  period_number: number
  time_from: string
  time_to: string
  subject: string
  grade: string
  section: string
  room: string
}

type SubDuty = {
  id: number
  period_number: number
  subject_name: string | null
  original_teacher_name: string | null
  original_teacher_department: string | null
  grade: string
  section: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

const ALL_GRADES = Array.from({ length: 12 }, (_, i) => String(i + 1))

// Multi-select grades dropdown
function GradesDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  function toggle(g: string) {
    const next = selected.includes(g) ? selected.filter(x => x !== g) : [...selected, g]
    onChange(next.sort((a, b) => parseInt(a) - parseInt(b)).join(','))
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 flex justify-between items-center">
        <span className={selected.length ? 'text-gray-900' : 'text-gray-400'}>
          {selected.length ? `Grades: ${selected.join(', ')}` : 'Select grades...'}
        </span>
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-2">
          <div className="grid grid-cols-4 gap-1">
            {ALL_GRADES.map(g => (
              <button key={g} type="button" onClick={() => toggle(g)}
                className={`py-1 rounded-lg text-xs font-medium transition-colors ${
                  selected.includes(g) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {g}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { onChange(''); setOpen(false) }}
            className="mt-2 w-full text-xs text-red-500 hover:text-red-700 text-center py-1">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

export default function TeachersManagement({ schoolId, refreshKey }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mainTab, setMainTab] = useState<'staff' | 'hod'>('staff')
  const [tab, setTab] = useState<'teaching' | 'non_teaching'>('teaching')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'removed' | 'all'>('active')
  const [deptFilter, setDeptFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Teacher | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({})
  const [saving, setSaving] = useState(false)
  const [showTimetable, setShowTimetable] = useState(false)
  const [teacherTimetable, setTeacherTimetable] = useState<TimetableSlot[]>([])
  const [teacherSubDuties, setTeacherSubDuties] = useState<SubDuty[]>([])
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<'info' | 'analytics'>('info')
  const [teacherAnalytics, setTeacherAnalytics] = useState<{
    taskCount: number; pendingLeaves: number; totalLeaves: number; subDutyCount: number; periodsPerWeek: number
  } | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [removeConsequences, setRemoveConsequences] = useState<{
    subjects_teaching: { subject_name: string; grade: string; section: string }[]
    class_teacher_of: { grade: string; section: string }[]
    timetable_slots: { subject_name: string; grade: string; section: string; day_of_week: string; period_number: number }[]
  } | null>(null)
  const [loadingConsequences, setLoadingConsequences] = useState(false)
  const [removeToast, setRemoveToast] = useState<{ name: string; summary: string[] } | null>(null)

  // HOD management state (subject-based, multiple HODs per subject)
  const [hodAssignments, setHodAssignments] = useState<HODAssignment[]>([])
  const [hodSubjects, setHodSubjects] = useState<string[]>([])
  const [hodLoading, setHodLoading] = useState(false)
  // modal: null=closed, subject=which subject, editId=editing existing assignment id (null=new)
  const [hodModal, setHodModal] = useState<{ subject: string; editId: number | null } | null>(null)
  const [hodForm, setHodForm] = useState<{ teacher_id: string; class_ids: number[] }>({ teacher_id: '', class_ids: [] })
  const [hodSaving, setHodSaving] = useState(false)
  const [classOptions, setClassOptions] = useState<ClassOption[]>([])

  useEffect(() => { loadTeachers() }, [schoolId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load HOD data whenever the HOD tab becomes active
  useEffect(() => {
    if (mainTab === 'hod') loadHODData()
  }, [mainTab, schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTeachers() {
    setLoading(true)
    try {
      const res = await fetch(`/api/teachers?school_id=${schoolId}`)
      const data = await res.json()
      setTeachers(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load teachers')
    } finally {
      setLoading(false)
    }
  }

  async function loadHODData() {
    setHodLoading(true)
    setError('')
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)

      const [hodRes, classRes] = await Promise.all([
        fetch(`/api/hod?school_id=${schoolId}`, { signal: controller.signal }),
        fetch(`/api/classes?school_id=${schoolId}`, { signal: controller.signal }),
      ])
      clearTimeout(timer)

      const hodData = await hodRes.json()
      const classData = await classRes.json()

      const hods: HODAssignment[] = Array.isArray(hodData.hods) ? hodData.hods : []
      setHodAssignments(hods)

      // Subjects: from API (teachers.subject) merged with already-assigned subjects
      const apiSubjects: string[] = Array.isArray(hodData.subjects) ? hodData.subjects : []
      const assignedSubjects: string[] = hods.map(h => h.department)
      // Also pull from teachers already in state (fallback if API returns empty)
      const teacherSubjects: string[] = teachers
        .filter(t => (t.staff_type || 'teaching') === 'teaching' && t.status === 'active' && t.subject)
        .map(t => t.subject)
      const merged = Array.from(new Set([...apiSubjects, ...assignedSubjects, ...teacherSubjects])).sort()
      setHodSubjects(merged)

      const sorted = Array.isArray(classData)
        ? classData.sort((a: ClassOption, b: ClassOption) => {
            const ga = parseInt(a.grade) || 0, gb = parseInt(b.grade) || 0
            return ga !== gb ? ga - gb : a.section.localeCompare(b.section)
          })
        : []
      setClassOptions(sorted)
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Request timed out. Check server connection.'
        : 'Failed to load HOD data'
      setError(msg)
      // Build subjects from already-loaded teachers so UI stays usable
      const teacherSubjects = Array.from(new Set(
        teachers.filter(t => (t.staff_type || 'teaching') === 'teaching' && t.status === 'active')
          .flatMap(t => [t.subject, t.department].filter(Boolean))
      )).sort()
      setHodSubjects(teacherSubjects)
    } finally {
      setHodLoading(false)
    }
  }

  async function saveHOD() {
    if (!hodModal || !hodForm.teacher_id) return
    setHodSaving(true)
    try {
      const res = await fetch('/api/hod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          department: hodModal.subject,
          teacher_id: parseInt(hodForm.teacher_id),
          class_ids: hodForm.class_ids,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Replace if same id, otherwise append
      setHodAssignments(prev => {
        const idx = prev.findIndex(h => h.id === data.id)
        if (idx >= 0) return prev.map(h => h.id === data.id ? data : h)
        return [...prev, data]
      })
      setHodModal(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save HOD')
    } finally {
      setHodSaving(false)
    }
  }

  async function removeHOD(id: number) {
    try {
      await fetch(`/api/hod?id=${id}`, { method: 'DELETE' })
      setHodAssignments(prev => prev.filter(h => h.id !== id))
    } catch {
      setError('Failed to remove HOD')
    }
  }

  function validateSave(): string | null {
    const name = (editForm.name ?? selected?.name ?? '').trim()
    const phone = (editForm.phone ?? selected?.phone ?? '').trim()
    const email = (editForm.email ?? selected?.email ?? '').trim()
    if (!name) return 'Name is required'
    if (phone && !/^\+?[\d\s\-()\[\]]{7,15}$/.test(phone)) return 'Phone must be 7–15 digits'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address'
    return null
  }

  async function handleSave() {
    if (!selected) return
    const validErr = validateSave()
    if (validErr) { setError(validErr); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/teachers/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTeachers(prev => prev.map(t => t.id === selected.id ? { ...t, ...data } : t))
      setSelected({ ...selected, ...data })
      setEditing(false); setEditForm({})
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save teacher')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus(teacher: Teacher) {
    const newStatus = teacher.status === 'active' ? 'inactive' : 'active'
    try {
      const res = await fetch(`/api/teachers/${teacher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTeachers(prev => prev.map(t => t.id === teacher.id ? { ...t, status: newStatus } : t))
      if (selected?.id === teacher.id) setSelected(s => s ? { ...s, status: newStatus } : s)
    } catch {
      setError('Failed to update status')
    }
  }

  async function loadTeacherTimetable(teacherId: number) {
    setTimetableLoading(true)
    const todayStr = new Date().toISOString().split('T')[0]
    try {
      const [ttRes, subRes] = await Promise.all([
        fetch(`/api/timetable?teacher_id=${teacherId}&school_id=${schoolId}`),
        fetch(`/api/substitutes?school_id=${schoolId}&substitute_teacher_id=${teacherId}&date=${todayStr}`),
      ])
      const ttData = await ttRes.json()
      const subData = await subRes.json()
      setTeacherTimetable(Array.isArray(ttData) ? ttData : [])
      setTeacherSubDuties(Array.isArray(subData) ? subData : [])
    } catch { setError('Failed to load timetable') }
    finally { setTimetableLoading(false) }
  }

  async function loadTeacherAnalytics(teacherId: number) {
    setAnalyticsLoading(true); setTeacherAnalytics(null)
    try {
      const [tasks, leaves, tt] = await Promise.all([
        fetch(`/api/tasks?teacher_id=${teacherId}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/leave-requests?teacher_id=${teacherId}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/timetable?teacher_id=${teacherId}&school_id=${schoolId}`).then(r => r.json()).catch(() => []),
      ])
      const taskArr = Array.isArray(tasks) ? tasks : []
      const leaveArr = Array.isArray(leaves) ? leaves : []
      const ttArr = Array.isArray(tt) ? tt : []
      const pendingLeaves = leaveArr.filter((l: { status: string }) => l.status === 'pending').length
      setTeacherAnalytics({
        taskCount: taskArr.length,
        pendingLeaves,
        totalLeaves: leaveArr.length,
        subDutyCount: teacherSubDuties.length,
        periodsPerWeek: ttArr.length,
      })
    } finally { setAnalyticsLoading(false) }
  }

  async function handleDelete(teacher: Teacher) {
    setLoadingConsequences(true)
    setShowRemoveDialog(true)
    setRemoveConsequences(null)
    try {
      const res = await fetch(`/api/teachers/${teacher.id}?consequences=true`)
      const data = await res.json()
      setRemoveConsequences({
        subjects_teaching: data.subjects_teaching ?? [],
        class_teacher_of:  data.class_teacher_of  ?? [],
        timetable_slots:   data.timetable_slots   ?? [],
      })
    } catch {
      setError('Failed to fetch removal consequences')
      setShowRemoveDialog(false)
    } finally {
      setLoadingConsequences(false)
    }
  }

  async function confirmDelete() {
    if (!selected) return
    const teacherName = selected.name
    const impact = removeConsequences
    try {
      const res = await fetch(`/api/teachers/${selected.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setTeachers(prev => prev.map(t => t.id === selected.id ? { ...t, status: 'removed' } : t))
      setShowRemoveDialog(false)
      setSelected(null)
      // Build short impact summary
      const summary: string[] = []
      if (impact) {
        if (impact.class_teacher_of.length > 0)
          summary.push(`Class teacher unlinked from ${impact.class_teacher_of.map(c => `Gr.${c.grade}-${c.section}`).join(', ')}`)
        if (impact.subjects_teaching.length > 0)
          summary.push(`Unassigned from ${impact.subjects_teaching.length} subject${impact.subjects_teaching.length !== 1 ? 's' : ''}`)
        if (impact.timetable_slots.length > 0)
          summary.push(`${impact.timetable_slots.length} timetable slot${impact.timetable_slots.length !== 1 ? 's' : ''} cleared`)
      }
      setRemoveToast({ name: teacherName, summary })
      setTimeout(() => setRemoveToast(null), 6000)
    } catch {
      setError('Failed to remove teacher')
      setShowRemoveDialog(false)
    }
  }

  function openDetail(t: Teacher) {
    setSelected(t)
    setEditing(false)
    setEditForm({})
    setDetailTab('info')
    setShowTimetable(false)
    setTeacherAnalytics(null)
  }

  const byType = teachers.filter(t => (t.staff_type || 'teaching') === tab)
  const byStatus = statusFilter === 'all'
    ? byType.filter(t => t.status !== 'removed')
    : statusFilter === 'removed'
    ? byType.filter(t => t.status === 'removed')
    : byType.filter(t => t.status === statusFilter)
  const departments = ['all', ...Array.from(new Set(byStatus.map(t => t.department).filter(Boolean)))]

  const filtered = byStatus.filter(t => {
    const matchesDept = deptFilter === 'all' || t.department === deptFilter
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.employee_id || '').toLowerCase().includes(search.toLowerCase())
    return matchesDept && matchesSearch
  })

  const grouped: Record<string, Teacher[]> = {}
  if (tab === 'teaching') {
    filtered.forEach(t => {
      const key = t.department || 'General'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(t)
    })
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300'


  if (loading) return <div className="py-12 text-center text-gray-400">Loading staff...</div>

  // All unique subjects for HOD management: from API + teachers' subject + department as fallback
  const allSubjects = Array.from(new Set([
    ...hodSubjects,
    ...teachers
      .filter(t => (t.staff_type || 'teaching') === 'teaching' && t.status === 'active')
      .flatMap(t => [t.subject, t.department].filter(Boolean)),
  ])).filter(Boolean).sort()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Staff Directory</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{teachers.length} total staff</span>
          <button onClick={loadTeachers} disabled={loading}
            title="Refresh staff list"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors disabled:opacity-40">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Main tabs: Staff Directory vs HOD Management */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        <button onClick={() => setMainTab('staff')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === 'staff' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Staff Directory
        </button>
        <button onClick={() => setMainTab('hod')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${mainTab === 'hod' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          HOD Management
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">Syllabus</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* HOD Management Panel */}
      {mainTab === 'hod' && (
        <div>
          {hodLoading ? (
            <div className="py-12 text-center text-gray-400">Loading subjects...</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-700">
                <p className="font-semibold mb-1">HOD assignment is per subject — multiple HODs allowed per subject for different class sets.</p>
                <p className="text-blue-500 text-xs">e.g. Physics HOD-1 manages Grade 9A, 9B · Physics HOD-2 manages Grade 10A, 10B. Each HOD sees Syllabus Management in their teacher portal for their assigned classes only.</p>
              </div>

              {allSubjects.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-10 text-center">
                  <p className="text-gray-400 text-sm">No subjects found. Add teachers with subject names first.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allSubjects.map(subject => {
                    const subjectHODs = hodAssignments.filter(h => h.department === subject)
                    // Teachers who teach this subject
                    const subjectTeachers = teachers.filter(t =>
                      (t.subject === subject || t.department === subject) &&
                      (t.staff_type || 'teaching') === 'teaching' && t.status === 'active'
                    )
                    return (
                      <div key={subject} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* Subject header */}
                        <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-xs font-bold">{subject.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{subject}</p>
                              <p className="text-xs text-gray-400">
                                {subjectTeachers.length} teacher{subjectTeachers.length !== 1 ? 's' : ''}
                                {subjectHODs.length > 0 && ` · ${subjectHODs.length} HOD${subjectHODs.length !== 1 ? 's' : ''} assigned`}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setHodModal({ subject, editId: null })
                              setHodForm({ teacher_id: '', class_ids: [] })
                            }}
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add HOD
                          </button>
                        </div>

                        {/* HOD assignments for this subject */}
                        {subjectHODs.length === 0 ? (
                          <div className="px-5 py-4 text-sm text-gray-400 italic">
                            No HOD assigned yet — click &quot;Add HOD&quot; to assign.
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-50">
                            {subjectHODs.map((hod, idx) => (
                              <div key={hod.id} className="px-5 py-3 flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                    {hod.teacher_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-gray-900 text-sm">{hod.teacher_name}</p>
                                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">HOD {idx + 1}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {(hod.class_ids || []).length === 0 ? (
                                        <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">No classes assigned</span>
                                      ) : (
                                        classOptions
                                          .filter(c => hod.class_ids.includes(c.id))
                                          .map(c => (
                                            <span key={c.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                              Gr.{c.grade}-{c.section}
                                            </span>
                                          ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    onClick={() => {
                                      setHodModal({ subject, editId: hod.id })
                                      setHodForm({ teacher_id: String(hod.teacher_id), class_ids: hod.class_ids || [] })
                                    }}
                                    className="text-xs text-blue-500 hover:text-blue-700 border border-blue-100 hover:border-blue-300 px-2 py-1 rounded transition-colors">
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => removeHOD(hod.id)}
                                    className="text-xs text-red-500 hover:text-red-700 border border-red-100 hover:border-red-300 px-2 py-1 rounded transition-colors">
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* HOD Add / Edit Modal */}
          {hodModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900">
                    {hodModal.editId ? 'Edit HOD' : 'Add HOD'} — {hodModal.subject}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Select the teacher and which classes they manage for this subject&apos;s syllabus</p>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Teacher</label>
                    <select
                      value={hodForm.teacher_id}
                      onChange={e => setHodForm(f => ({ ...f, teacher_id: e.target.value }))}
                      disabled={!!hodModal.editId}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-500">
                      <option value="">— Select {hodModal.subject} teacher —</option>
                      {teachers.filter(t =>
                        (t.subject === hodModal.subject || t.department === hodModal.subject) &&
                        (t.staff_type || 'teaching') === 'teaching' &&
                        t.status === 'active' &&
                        (!hodAssignments.find(h => h.department === hodModal.subject && h.teacher_id === t.id) || hodModal.editId)
                      ).map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.employee_id ? ` (${t.employee_id})` : ''}
                        </option>
                      ))}
                    </select>
                    {!hodModal.editId && teachers.filter(t => (t.subject === hodModal.subject || t.department === hodModal.subject) && t.status === 'active').length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No active teachers with subject &quot;{hodModal.subject}&quot; found. Check teacher profiles.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Classes managed by this HOD</label>
                    {classOptions.length === 0 ? (
                      <p className="text-xs text-gray-400">No classes found. Create classes first.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                        <div className="grid grid-cols-3 gap-1.5">
                          {classOptions.map(c => {
                            const isSelected = hodForm.class_ids.includes(c.id)
                            // Show warning if class is already managed by another HOD for this subject
                            const takenBy = hodAssignments.find(h =>
                              h.department === hodModal.subject &&
                              h.id !== hodModal.editId &&
                              (h.class_ids || []).includes(c.id)
                            )
                            return (
                              <button key={c.id} type="button"
                                onClick={() => setHodForm(f => ({
                                  ...f,
                                  class_ids: isSelected
                                    ? f.class_ids.filter(id => id !== c.id)
                                    : [...f.class_ids, c.id],
                                }))}
                                title={takenBy ? `Already assigned to ${takenBy.teacher_name}` : ''}
                                className={`py-1.5 px-2 rounded-lg text-xs font-medium text-center transition-colors relative ${
                                  isSelected ? 'bg-blue-600 text-white'
                                  : takenBy ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}>
                                Gr.{c.grade}-{c.section}
                                {takenBy && !isSelected && <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />}
                              </button>
                            )
                          })}
                        </div>
                        <button type="button"
                          onClick={() => setHodForm(f => ({ ...f, class_ids: [] }))}
                          className="mt-2 w-full text-[10px] text-red-400 hover:text-red-600 text-center">
                          Clear selection
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">{hodForm.class_ids.length} class{hodForm.class_ids.length !== 1 ? 'es' : ''} selected · amber = already assigned to another HOD</p>
                  </div>
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                  <button onClick={() => setHodModal(null)}
                    className="flex-1 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={saveHOD} disabled={hodSaving || !hodForm.teacher_id}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {hodSaving ? 'Saving...' : hodModal.editId ? 'Update Classes' : 'Assign HOD'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Staff Directory (only shown on staff tab) */}
      {mainTab === 'hod' ? null : <>

      {/* Staff type tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        {(['teaching', 'non_teaching'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setDeptFilter('all'); setStatusFilter('active') }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}
            <span className="ml-1.5 text-xs text-gray-400">({teachers.filter(x => (x.staff_type || 'teaching') === t).length})</span>
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..."
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
        {/* Status filter */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['active', 'inactive', 'removed', 'all'] as const).map(s => {
            const count = s === 'inactive' ? byType.filter(t => t.status === 'inactive').length
              : s === 'removed' ? byType.filter(t => t.status === 'removed').length : 0
            return (
              <button key={s} onClick={() => setStatusFilter(s as typeof statusFilter)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                {count > 0 && (
                  <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${s === 'removed' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
        {tab === 'teaching' && departments.length > 1 && (
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
            {departments.map(d => <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <p className="text-gray-400">No {statusFilter !== 'all' ? statusFilter + ' ' : ''}{tab === 'teaching' ? 'teaching' : 'non-teaching'} staff found</p>
          {(statusFilter === 'inactive' || statusFilter === 'removed') && (
            <button onClick={() => setStatusFilter('active')} className="text-blue-500 text-sm mt-2 hover:underline">
              Switch to active staff
            </button>
          )}
        </div>
      ) : tab === 'teaching' ? (
        <div className="space-y-5">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dept, members]) => (
            <div key={dept} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <span className="font-semibold text-blue-800 text-sm">{dept}</span>
                <span className="text-xs text-blue-500">{members.length} teacher{members.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {members.map(t => (
                  <TeacherCard key={t.id} teacher={t}
                    onClick={() => openDetail(t)}
                    onToggle={() => handleToggleStatus(t)}
                    onDelete={() => handleDelete(t)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filtered.map(t => (
              <TeacherCard key={t.id} teacher={t}
                onClick={() => openDetail(t)}
                onToggle={() => handleToggleStatus(t)}
                onDelete={() => handleDelete(t)} />
            ))}
          </div>
        </div>
      )}

      </> /* end staff directory fragment */}

      {/* ── Full-screen Detail Modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl my-6 shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100">
              <Avatar name={selected.name} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-bold text-gray-900 text-lg">{selected.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${selected.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {selected.status}
                  </span>
                  {selected.class_grade && (
                    <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
                      Class Teacher: Gr.{selected.class_grade}-{selected.class_section}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-0.5">{selected.employee_id}</p>
              </div>
              <button onClick={() => { setSelected(null); setEditing(false) }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0 ml-2">×</button>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 px-6 pt-4 border-b border-gray-100 pb-0">
              {(['info', 'analytics'] as const).map(t => (
                <button key={t} onClick={() => {
                  setDetailTab(t)
                  if (t === 'analytics' && !teacherAnalytics) loadTeacherAnalytics(selected.id)
                }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${detailTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t === 'info' ? 'Profile' : '360° View'}
                </button>
              ))}
            </div>

            <div className="p-6">
              {detailTab === 'info' && (
                <>
                  {!editing ? (
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                      {[
                        { label: 'Subject', value: selected.subject },
                        { label: 'Department', value: selected.department },
                        { label: 'Staff Type', value: selected.staff_type === 'non_teaching' ? 'Non-Teaching' : 'Teaching' },
                        { label: 'Qualification', value: selected.qualification },
                        { label: 'Date of Joining', value: selected.date_of_joining ? new Date(selected.date_of_joining).toLocaleDateString() : null },
                        { label: 'Email', value: selected.email },
                        { label: 'Phone', value: selected.phone },
                        { label: 'Teaches Grades', value: selected.teaches_grades },
                      ].map(({ label, value }) => value ? (
                        <div key={label}>
                          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                          <p className="text-gray-800 font-medium">{value}</p>
                        </div>
                      ) : null)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { field: 'name', label: 'Name *', type: 'text', placeholder: 'Full name' },
                        { field: 'email', label: 'Email', type: 'email', placeholder: 'teacher@school.com' },
                        { field: 'subject', label: 'Subject', type: 'text', placeholder: 'e.g. Mathematics' },
                        { field: 'phone', label: 'Phone', type: 'tel', placeholder: '10-digit number' },
                        { field: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Science' },
                        { field: 'qualification', label: 'Qualification', type: 'text', placeholder: 'e.g. B.Ed, M.Sc' },
                      ].map(({ field, label, type, placeholder }) => (
                        <div key={field}>
                          <label className="block text-xs text-gray-500 mb-1">{label}</label>
                          <input type={type} placeholder={placeholder}
                            value={(editForm as Record<string, unknown>)[field] as string ?? (selected as Record<string, unknown>)[field] as string ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                            className={inputCls} />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Staff Type</label>
                        <select value={editForm.staff_type ?? selected.staff_type ?? 'teaching'}
                          onChange={e => setEditForm(f => ({ ...f, staff_type: e.target.value }))}
                          className={inputCls}>
                          <option value="teaching">Teaching</option>
                          <option value="non_teaching">Non-Teaching</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Teaches Grades</label>
                        <GradesDropdown
                          value={editForm.teaches_grades ?? selected.teaches_grades ?? ''}
                          onChange={v => setEditForm(f => ({ ...f, teaches_grades: v }))}
                        />
                      </div>
                    </div>
                  )}

                  {/* Timetable toggle */}
                  <div className="mt-6 border-t border-gray-100 pt-4">
                    <button
                      onClick={() => {
                        const next = !showTimetable
                        setShowTimetable(next)
                        if (next) loadTeacherTimetable(selected.id)
                      }}
                      className="text-sm font-medium text-purple-600 hover:text-purple-800 flex items-center gap-2">
                      {showTimetable ? '▲ Hide Timetable' : '▼ View Weekly Timetable'}
                    </button>
                    {showTimetable && (
                      <div className="mt-3">
                        <TeacherTimetableView
                          timetable={teacherTimetable}
                          loading={timetableLoading}
                          teacherName={selected.name}
                          subDuties={teacherSubDuties}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {detailTab === 'analytics' && (
                analyticsLoading ? (
                  <div className="py-12 text-center">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : !teacherAnalytics ? null : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Periods/Week', value: teacherAnalytics.periodsPerWeek, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Tasks Assigned', value: teacherAnalytics.taskCount, color: 'text-violet-600', bg: 'bg-violet-50' },
                        { label: 'Total Leaves', value: teacherAnalytics.totalLeaves, color: 'text-orange-600', bg: 'bg-orange-50' },
                        { label: 'Pending Leaves', value: teacherAnalytics.pendingLeaves, color: 'text-red-600', bg: 'bg-red-50' },
                      ].map(({ label, value, color, bg }) => (
                        <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
                          <p className={`text-3xl font-black ${color}`}>{value}</p>
                          <p className="text-xs text-gray-500 mt-1">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
                      {[
                        { label: 'Subject', value: selected.subject },
                        { label: 'Department', value: selected.department },
                        { label: 'Teaches Grades', value: selected.teaches_grades },
                        { label: 'Class Teacher', value: selected.class_grade ? `Gr.${selected.class_grade}-${selected.class_section}` : null },
                      ].map(({ label, value }) => value ? (
                        <div key={label}>
                          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                          <p className="font-medium text-gray-700">{value}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Modal footer actions */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-wrap">
              {selected.status === 'removed' ? (
                <>
                  <div className="flex-1 text-sm text-red-500 font-medium">This teacher has been removed.</div>
                  <button onClick={async () => {
                    const res = await fetch(`/api/teachers/${selected.id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'active' }),
                    })
                    if (res.ok) {
                      setTeachers(prev => prev.map(t => t.id === selected.id ? { ...t, status: 'active' } : t))
                      setSelected(s => s ? { ...s, status: 'active' } : s)
                    }
                  }} className="border border-green-300 text-green-700 hover:bg-green-50 px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                    Restore Teacher
                  </button>
                </>
              ) : (
                <>
                  {editing ? (
                    <>
                      <button onClick={handleSave} disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button onClick={() => { setEditing(false); setEditForm({}) }}
                        className="border border-gray-200 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditing(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                      Edit Details
                    </button>
                  )}
                  <button onClick={() => handleToggleStatus(selected)}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors border ${selected.status === 'active' ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-green-200 text-green-600 hover:bg-green-50 font-semibold'}`}>
                    {selected.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button onClick={() => handleDelete(selected)}
                    className="ml-auto border border-red-200 text-red-600 px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
                    Remove from School
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Remove impact toast ── */}
      {removeToast && (
        <div className="fixed bottom-5 right-5 z-[70] bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-4 max-w-sm w-full animate-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{removeToast.name} removed</p>
              {removeToast.summary.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                  {removeToast.summary.map((s, i) => (
                    <li key={i} className="text-xs text-gray-400 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-orange-400 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 mt-1">No active assignments were affected.</p>
              )}
            </div>
            <button onClick={() => setRemoveToast(null)} className="text-gray-500 hover:text-gray-300 flex-shrink-0 mt-0.5">✕</button>
          </div>
        </div>
      )}

      {/* ── Remove Consequences Dialog ── */}
      {showRemoveDialog && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Remove {selected?.name}?</h3>
              <p className="text-xs text-gray-500 mt-0.5">Their record is kept for history. All assignments will be unlinked.</p>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
              {loadingConsequences ? (
                <div className="py-6 text-center text-gray-400 text-sm">Checking impact...</div>
              ) : removeConsequences ? (
                <>
                  {removeConsequences.class_teacher_of.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">Class Teacher of:</p>
                      {removeConsequences.class_teacher_of.map((c, i) => (
                        <p key={i} className="text-xs text-red-600">Grade {c.grade}-{c.section} (will be unassigned)</p>
                      ))}
                    </div>
                  )}
                  {removeConsequences.subjects_teaching.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-1">Teaching {removeConsequences.subjects_teaching.length} subject(s):</p>
                      {removeConsequences.subjects_teaching.map((s, i) => (
                        <p key={i} className="text-xs text-orange-600">Grade {s.grade}-{s.section}: {s.subject_name}</p>
                      ))}
                    </div>
                  )}
                  {removeConsequences.timetable_slots.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">{removeConsequences.timetable_slots.length} timetable slot(s) will lose teacher</p>
                      <p className="text-xs text-amber-600">Timetable slots will remain but teacher will be blank</p>
                    </div>
                  )}
                  {removeConsequences.class_teacher_of.length === 0 && removeConsequences.subjects_teaching.length === 0 && removeConsequences.timetable_slots.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-2">No active assignments found. Safe to remove.</p>
                  )}
                </>
              ) : null}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowRemoveDialog(false)}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={loadingConsequences}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ALL_PERIODS = [1, 2, 3, 4, 5, 6]
const PERIOD_TIMES: Record<number, { from: string; to: string }> = {
  1: { from: '08:00', to: '08:45' },
  2: { from: '08:50', to: '09:35' },
  3: { from: '09:40', to: '10:25' },
  4: { from: '10:45', to: '11:30' },
  5: { from: '11:35', to: '12:20' },
  6: { from: '12:25', to: '13:10' },
}
const BREAK_ROWS = [{ afterPeriod: 3, label: 'Break', time: '10:25–10:45' }]

function TeacherTimetableView({ timetable, loading, teacherName, subDuties }: { timetable: TimetableSlot[]; loading: boolean; teacherName: string; subDuties: SubDuty[] }) {
  if (loading) return <div className="py-6 text-center text-gray-400 text-sm">Loading timetable...</div>
  if (timetable.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-gray-400 text-sm">No timetable generated yet</p>
      </div>
    )
  }

  const byDay: Record<string, TimetableSlot[]> = {}
  DAYS.forEach(d => { byDay[d] = [] })
  timetable.forEach(p => { if (byDay[p.day_of_week]) byDay[p.day_of_week].push(p) })

  const today = (() => {
    const d = new Date().getDay()
    if (d === 0 || d === 6) return null
    return DAYS[d - 1]
  })()
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()

  const rows: ({ type: 'period'; num: number } | { type: 'break'; label: string; time: string })[] = []
  for (const p of ALL_PERIODS) {
    rows.push({ type: 'period', num: p })
    const brk = BREAK_ROWS.find(b => b.afterPeriod === p)
    if (brk) rows.push({ type: 'break', label: brk.label, time: brk.time })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-700">Weekly Timetable — {teacherName}</p>
        {subDuties.length > 0 && (
          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
            {subDuties.length} substitute period{subDuties.length > 1 ? 's' : ''} today
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="bg-slate-700 text-slate-200 px-2 py-1.5 text-left font-semibold rounded-tl-lg">P</th>
              {DAYS.map(d => (
                <th key={d} className={`px-2 py-1.5 text-center font-semibold ${d === today ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {d.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.type === 'break') {
                return (
                  <tr key={`brk-${i}`} className="bg-amber-50 border-y border-amber-100">
                    <td className="px-2 py-1 text-amber-600 font-semibold text-center">{row.label}</td>
                    <td colSpan={6} className="px-2 py-1 text-center text-amber-400 italic">{row.time}</td>
                  </tr>
                )
              }
              const pNum = row.num
              const { from, to } = PERIOD_TIMES[pNum]
              const pFromMins = parseInt(from.split(':')[0]) * 60 + parseInt(from.split(':')[1])
              const pToMins = parseInt(to.split(':')[0]) * 60 + parseInt(to.split(':')[1])
              const isCurrentPeriod = nowMins >= pFromMins && nowMins < pToMins
              return (
                <tr key={pNum} className={`border-b border-gray-100 ${isCurrentPeriod ? 'bg-orange-50/30' : ''}`}>
                  <td className="px-2 py-1.5 bg-gray-50 font-semibold text-gray-500 border-r border-gray-100 text-center whitespace-nowrap">
                    <span>{pNum}</span>
                    <span className="block text-gray-300 font-normal" style={{ fontSize: '8px' }}>{from}</span>
                  </td>
                  {DAYS.map(day => {
                    const slot = byDay[day].find(s => s.period_number === pNum)
                    const isNow = day === today && isCurrentPeriod
                    const subDuty = day === today ? subDuties.find(s => s.period_number === pNum) : undefined
                    return (
                      <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                        {slot ? (
                          <div className={`rounded px-1 py-1 text-center ${isNow ? 'border border-orange-300 bg-orange-50' : 'bg-emerald-50 border border-emerald-100'}`}>
                            <p className="font-semibold text-gray-800 leading-tight">{slot.subject}</p>
                            <p className="text-gray-400 leading-tight">Gr.{slot.grade}-{slot.section}</p>
                          </div>
                        ) : subDuty ? (
                          <div className="rounded px-1 py-1 text-center bg-amber-50 border-2 border-amber-300">
                            <p className="font-semibold text-amber-800 leading-tight text-[10px]">
                              {subDuty.subject_name || subDuty.original_teacher_department || '—'}
                            </p>
                            <p className="text-amber-600 leading-tight text-[10px]">Gr.{subDuty.grade}-{subDuty.section}</p>
                          </div>
                        ) : (
                          <div className="rounded px-1 py-1 text-center bg-gray-50 border border-gray-100">
                            <p className="text-gray-300 italic">Free</p>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{timetable.length} assigned period{timetable.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

function TeacherCard({ teacher, onClick, onToggle, onDelete }:
  { teacher: Teacher; onClick: () => void; onToggle: () => void; onDelete: () => void }) {
  const isInactive = teacher.status === 'inactive'
  const isRemoved = teacher.status === 'removed'
  return (
    <div onClick={onClick}
      className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors hover:bg-gray-50 ${isInactive || isRemoved ? 'opacity-60' : ''}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
        isRemoved ? 'bg-red-300' : isInactive ? 'bg-gray-300' : 'bg-blue-600'
      }`}>
        {teacher.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-sm ${isRemoved ? 'line-through text-gray-400' : 'text-gray-900'}`}>{teacher.name}</span>
          {teacher.class_grade && !isRemoved && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              CT: Gr.{teacher.class_grade}-{teacher.class_section}
            </span>
          )}
          {teacher.teaches_grades && !isRemoved && (
            <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
              Gr: {teacher.teaches_grades}
            </span>
          )}
          {isInactive && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Inactive</span>}
          {isRemoved && <span className="text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded font-medium">Removed</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {teacher.employee_id && <span className="text-xs text-gray-400 font-mono">{teacher.employee_id}</span>}
          {teacher.subject && <span className="text-xs text-gray-500">· {teacher.subject}</span>}
          {/* Show staff type label */}
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            teacher.staff_type === 'non_teaching' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-500'
          }`}>
            {teacher.staff_type === 'non_teaching' ? 'Non-Teaching' : 'Teaching'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        {isInactive && (
          <button onClick={onToggle}
            className="text-xs px-2.5 py-1 rounded border border-green-200 hover:bg-green-50 text-green-600 font-medium transition-colors">
            Reactivate
          </button>
        )}
        <span className={`w-2 h-2 rounded-full ${
          teacher.status === 'active' ? 'bg-green-400' : isRemoved ? 'bg-red-300' : 'bg-gray-300'
        }`} />
      </div>
    </div>
  )
}
