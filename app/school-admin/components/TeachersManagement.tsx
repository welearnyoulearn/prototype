'use client'

import { useEffect, useState, useMemo } from 'react'
import { Users } from 'lucide-react'
import { isValidName, NAME_INVALID_MESSAGE } from '@/lib/nameValidation'
import { EmptyState } from '@/components/ui/empty-state'
import { GradesMultiSelect } from '@/components/ui/grades-multiselect'

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

type EditForm = Partial<Teacher>

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}


export default function TeachersManagement({ schoolId, refreshKey }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'teaching' | 'non_teaching'>('teaching')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'removed' | 'all'>('active')
  const [deptFilter, setDeptFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Teacher | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({})
  const [saving, setSaving] = useState(false)
  const [detailTab, setDetailTab] = useState<'info' | 'analytics'>('info')
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [removeConsequences, setRemoveConsequences] = useState<{
    subjects_teaching: { subject_name: string; grade: string; section: string }[]
    class_teacher_of: { grade: string; section: string }[]
  } | null>(null)
  const [loadingConsequences, setLoadingConsequences] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeToast, setRemoveToast] = useState<{ name: string; summary: string[] } | null>(null)

  // Primary/core subject dropdown — same source and fallback as
  // StaffOnboarding's Subject field, so editing a teacher's core subject
  // stays in sync with the same catalog they were onboarded against, instead
  // of drifting into free-typed spelling variants over time. This is
  // teachers.subject only — the per-class assignments made in Class
  // Management (class_subjects) are a separate, free-text "other subjects
  // taught" record and are never affected by this dropdown.
  const [subscribedSubjectNames, setSubscribedSubjectNames] = useState<string[]>([])
  const [subjectInputMode, setSubjectInputMode] = useState<'dropdown' | 'manual'>('dropdown')

  useEffect(() => { loadTeachers() }, [schoolId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/school/subjects?school_id=${schoolId}`)
        if (res.ok) {
          const d = await res.json()
          const rows: { subject_name: string }[] = Array.isArray(d.subjects) ? d.subjects : []
          const names = Array.from(new Set(rows.map(r => r.subject_name))).sort()
          if (names.length > 0) {
            setSubscribedSubjectNames(names)
            return
          }
        }
        // No subscribed subjects — same fallback as onboarding: use the full
        // platform master catalog rather than forcing free text.
        const masterRes = await fetch('/api/platform/subjects')
        if (masterRes.ok) {
          const d = await masterRes.json()
          const rows: { subject_name: string }[] = Array.isArray(d.subjects) ? d.subjects : []
          const names = Array.from(new Set(rows.map(r => r.subject_name))).sort()
          setSubscribedSubjectNames(names)
        }
      } catch { /* non-critical — falls back to free text */ }
    })()
  }, [schoolId])

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

  function validateSave(): string | null {
    const name = (editForm.name ?? selected?.name ?? '').trim()
    const phone = (editForm.phone ?? selected?.phone ?? '').trim()
    const email = (editForm.email ?? selected?.email ?? '').trim()
    if (!name) return 'Name is required'
    if (!isValidName(name)) return `Name: ${NAME_INVALID_MESSAGE}`
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
      })
    } catch {
      setError('Failed to fetch removal consequences')
      setShowRemoveDialog(false)
    } finally {
      setLoadingConsequences(false)
    }
  }

  async function confirmDelete() {
    if (!selected || removing) return
    const teacherName = selected.name
    const impact = removeConsequences
    setRemoving(true)
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
      }
      setRemoveToast({ name: teacherName, summary })
      setTimeout(() => setRemoveToast(null), 6000)
    } catch {
      setError('Failed to remove teacher')
      setShowRemoveDialog(false)
    } finally {
      setRemoving(false)
    }
  }

  function openDetail(t: Teacher) {
    setSelected(t)
    setEditing(false)
    setEditForm({})
    setDetailTab('info')
  }

  const byType = useMemo(() => teachers.filter(t => (t.staff_type || 'teaching') === tab), [teachers, tab])
  const byStatus = useMemo(() => statusFilter === 'all'
    ? byType.filter(t => t.status !== 'removed')
    : statusFilter === 'removed'
    ? byType.filter(t => t.status === 'removed')
    : byType.filter(t => t.status === statusFilter), [byType, statusFilter])
  const departments = useMemo(() => ['all', ...Array.from(new Set(byStatus.map(t => t.department).filter(Boolean)))], [byStatus])

  const filtered = useMemo(() => byStatus.filter(t => {
    const matchesDept = deptFilter === 'all' || t.department === deptFilter
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.employee_id || '').toLowerCase().includes(search.toLowerCase())
    return matchesDept && matchesSearch
  }), [byStatus, deptFilter, search])

  const grouped: Record<string, Teacher[]> = useMemo(() => {
    const g: Record<string, Teacher[]> = {}
    if (tab === 'teaching') {
      filtered.forEach(t => {
        const key = t.department || 'General'
        if (!g[key]) g[key] = []
        g[key].push(t)
      })
    }
    return g
  }, [filtered, tab])

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300'


  if (loading) return <div className="py-12 text-center text-gray-400">Loading staff...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Staff Directory</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{teachers.length} total staff</span>
          <button onClick={loadTeachers} disabled={loading}
            title="Refresh staff list"
            data-testid="staff-refresh"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors disabled:opacity-40">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Staff type tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        {(['teaching', 'non_teaching'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setDeptFilter('all'); setStatusFilter('active') }}
            data-testid={`staff-type-tab-${t}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}
            <span className="ml-1.5 text-xs text-gray-400">({teachers.filter(x => (x.staff_type || 'teaching') === t).length})</span>
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..."
          data-testid="staff-search-input"
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
        {/* Status filter */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['active', 'inactive', 'removed', 'all'] as const).map(s => {
            const count = s === 'inactive' ? byType.filter(t => t.status === 'inactive').length
              : s === 'removed' ? byType.filter(t => t.status === 'removed').length : 0
            return (
              <button key={s} onClick={() => setStatusFilter(s as typeof statusFilter)}
                data-testid={`staff-status-filter-${s}`}
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
            data-testid="staff-department-filter"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
            {departments.map(d => <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={`No ${statusFilter !== 'all' ? statusFilter + ' ' : ''}${tab === 'teaching' ? 'teaching' : 'non-teaching'} staff found`}
          className="bg-white"
          action={
            (statusFilter === 'inactive' || statusFilter === 'removed') && (
              <button onClick={() => setStatusFilter('active')} className="text-blue-500 text-sm hover:underline">
                Switch to active staff
              </button>
            )
          }
        />
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
                }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${detailTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t === 'info' ? 'Profile' : 'Details'}
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
                        <label className="block text-xs text-gray-500 mb-1">Subject</label>
                        {subscribedSubjectNames.length > 0 && subjectInputMode !== 'manual' ? (
                          <select
                            data-testid="staff-edit-subject-select"
                            value={subscribedSubjectNames.includes((editForm.subject ?? selected.subject) as string) ? (editForm.subject ?? selected.subject) : ''}
                            onChange={e => {
                              if (e.target.value === '__other__') {
                                setSubjectInputMode('manual')
                                setEditForm(f => ({ ...f, subject: '' }))
                              } else {
                                setEditForm(f => ({ ...f, subject: e.target.value }))
                              }
                            }}
                            className={inputCls}>
                            <option value="">Select subject</option>
                            {subscribedSubjectNames.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                            <option value="__other__">Other (type manually)…</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input type="text" placeholder="e.g. Mathematics" data-testid="staff-edit-subject-input"
                              value={editForm.subject ?? selected.subject ?? ''}
                              onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                              className={inputCls} />
                            {subscribedSubjectNames.length > 0 && (
                              <button type="button" title="Pick from the subject list"
                                onClick={() => setSubjectInputMode('dropdown')}
                                className="text-[10px] text-blue-500 hover:text-blue-700 flex-shrink-0">↺</button>
                            )}
                          </div>
                        )}
                      </div>
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
                        <GradesMultiSelect
                          value={editForm.teaches_grades ?? selected.teaches_grades ?? ''}
                          onChange={v => setEditForm(f => ({ ...f, teaches_grades: v }))}
                          testIdBase="teacher-grade"
                          emptyLabel="All grades (no restriction)"
                          labelSeparator=": "
                          panelWidth={260}
                        />
                      </div>
                    </div>
                  )}

                </>
              )}

              {detailTab === 'analytics' && (
                  <div className="space-y-4">
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
                        data-testid="staff-save-edit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button onClick={() => { setEditing(false); setEditForm({}) }}
                        data-testid="staff-cancel-edit"
                        className="border border-gray-200 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditing(true)}
                      data-testid="staff-edit-details"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                      Edit Details
                    </button>
                  )}
                  <button onClick={() => handleToggleStatus(selected)}
                    data-testid="staff-toggle-status"
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors border ${selected.status === 'active' ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-green-200 text-green-600 hover:bg-green-50 font-semibold'}`}>
                    {selected.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button onClick={() => handleDelete(selected)}
                    data-testid="staff-remove"
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
                  {removeConsequences.class_teacher_of.length === 0 && removeConsequences.subjects_teaching.length === 0 && (
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
              <button onClick={confirmDelete} disabled={loadingConsequences || removing}
                data-testid="confirm-remove-staff"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {removing ? 'Removing…' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeacherCard({ teacher, onClick, onToggle, onDelete }:
  { teacher: Teacher; onClick: () => void; onToggle: () => void; onDelete: () => void }) {
  const isInactive = teacher.status === 'inactive'
  const isRemoved = teacher.status === 'removed'
  return (
    <div onClick={onClick}
      data-testid={`staff-card-${teacher.id}`}
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
            data-testid={`staff-reactivate-${teacher.id}`}
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
