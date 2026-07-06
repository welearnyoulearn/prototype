'use client'

import { useEffect, useState, useCallback } from 'react'

type Props = { schoolId: number; refreshKey?: number }

type Student = {
  id: number
  name: string
  email: string
  grade: string
  section: string
  roll_number: string
  school_roll_number: number | null
  parent_name: string
  parent_phone: string
  parent_email: string
  phone: string
  status: string
}

type DupStudentRecord = {
  id: number; name: string; grade: string; section: string
  school_roll_number: number | null; roll_number: string
  phone: string; parent_phone: string; parent_name: string
  created_at: string; status: string
}

type DupGroup = {
  keep: DupStudentRecord
  duplicates: (DupStudentRecord & { reason: string })[]
  reason: string
}

type EditForm = Partial<Student>

type StudentPerf = {
  attendance_pct: number | null
  task_submission_rate: number | null
  avg_score_pct: number | null
  points: number
  engagement: number
  rank: number
}
type StudentRewards = {
  total_points: number
  badges: { badge_type: string; earned_at: string }[]
  streak: { current_streak: number; longest_streak: number } | null
}

type DuplicatesPanelProps = {
  dupGroups: DupGroup[]
  dupLoading: boolean
  dupError: string
  dupTotalCount: number
  selectedDupGroups: Set<number>
  dupDeleting: boolean
  dupConfirm: 'selected' | 'all' | null
  onScan: () => void
  onSelectGroup: (keepId: number, checked: boolean) => void
  onSelectAll: (checked: boolean) => void
  onDeleteSelected: () => void
  onDeleteAll: () => void
  onConfirmDelete: (mode: 'selected' | 'all') => void
  onCancelConfirm: () => void
}

function DuplicatesPanel({
  dupGroups, dupLoading, dupError, dupTotalCount, selectedDupGroups,
  dupDeleting, dupConfirm, onScan, onSelectGroup, onSelectAll,
  onDeleteSelected, onDeleteAll, onConfirmDelete, onCancelConfirm,
}: DuplicatesPanelProps) {
  const selectedCount = selectedDupGroups.size
  const selectedDupCount = Array.from(selectedDupGroups).reduce((sum, keepId) => {
    const g = dupGroups.find(g => g.keep.id === keepId)
    return sum + (g ? g.duplicates.length : 0)
  }, 0)

  function reasonLabel(reason: string) {
    if (reason === 'roll_number') return 'Same roll number'
    if (reason === 'name+parent_phone') return 'Same name + parent phone'
    if (reason === 'name+phone') return 'Same name + phone'
    return reason
  }

  function fmtTime(iso: string) {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          {dupTotalCount > 0 && !dupLoading && (
            <p className="text-sm text-orange-700 font-semibold">
              Found {dupTotalCount} duplicate record{dupTotalCount !== 1 ? 's' : ''} in {dupGroups.length} group{dupGroups.length !== 1 ? 's' : ''}
            </p>
          )}
          {!dupLoading && dupTotalCount === 0 && dupGroups.length === 0 && (
            <p className="text-sm text-gray-400">No duplicates found</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            data-testid="scan-duplicates-btn"
            onClick={onScan}
            disabled={dupLoading}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">
            <svg className={`w-3.5 h-3.5 ${dupLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {dupLoading ? 'Scanning...' : 'Scan for Duplicates'}
          </button>
          {dupTotalCount > 0 && (
            <button
              data-testid="delete-all-duplicates-btn"
              onClick={onDeleteAll}
              disabled={dupDeleting}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-40">
              Delete All Duplicates
            </button>
          )}
        </div>
      </div>

      {dupError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{dupError}</div>
      )}

      {dupGroups.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox"
              checked={selectedDupGroups.size === dupGroups.length}
              onChange={e => onSelectAll(e.target.checked)}
              className="rounded border-gray-300" />
            Select All
          </label>
          {selectedCount > 0 && (
            <button
              data-testid="delete-selected-duplicates-btn"
              onClick={onDeleteSelected}
              disabled={dupDeleting}
              className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-medium disabled:opacity-40">
              Delete Selected ({selectedDupCount} duplicate{selectedDupCount !== 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}

      {dupLoading && (
        <div className="py-12 text-center text-gray-400">
          <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Scanning for duplicates...
        </div>
      )}

      {!dupLoading && dupGroups.length === 0 && dupTotalCount === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <p className="text-gray-400 text-sm">Click &quot;Scan for Duplicates&quot; to check for duplicate students</p>
        </div>
      )}

      <div className="space-y-4">
        {dupGroups.map(group => (
          <div key={group.keep.id}
            className={`bg-white rounded-xl border overflow-hidden ${selectedDupGroups.has(group.keep.id) ? 'border-orange-300' : 'border-gray-200'}`}>
            <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input type="checkbox"
                  checked={selectedDupGroups.has(group.keep.id)}
                  onChange={e => onSelectGroup(group.keep.id, e.target.checked)}
                  className="rounded border-gray-300" />
                <div>
                  <span className="font-semibold text-orange-800 text-sm">{group.keep.name}</span>
                  <span className="ml-2 text-xs text-orange-600">
                    Grade {group.keep.grade}{group.keep.section ? ` · Section ${group.keep.section}` : ''}
                    {group.keep.school_roll_number != null ? ` · Roll ${group.keep.school_roll_number}` : ''}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">— {reasonLabel(group.reason)}</span>
                </div>
              </div>
              <button
                data-testid={`delete-group-${group.keep.id}`}
                onClick={() => onSelectGroup(group.keep.id, true)}
                className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors">
                Select Group
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              <div className="px-5 py-3 flex items-center gap-4 bg-green-50/30">
                <span className="text-xs font-semibold text-green-700 w-14 flex-shrink-0">KEEP</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">{group.keep.name}</span>
                  <span className="ml-2 text-xs text-gray-400 font-mono">{group.keep.roll_number}</span>
                </div>
                <span className="text-xs text-gray-400">Created {fmtTime(group.keep.created_at)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${group.keep.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {group.keep.status}
                </span>
              </div>

              {group.duplicates.map(dup => (
                <div key={dup.id} className="px-5 py-3 flex items-center gap-4 bg-red-50/20">
                  <span className="text-xs font-semibold text-red-600 w-14 flex-shrink-0">DELETE</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-700">{dup.name}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{dup.roll_number}</span>
                  </div>
                  <span className="text-xs text-gray-400">Created {fmtTime(dup.created_at)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dup.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {dup.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {dupConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-gray-900 mb-3">
              Delete {dupConfirm === 'all' ? dupTotalCount : selectedDupCount} duplicate record{(dupConfirm === 'all' ? dupTotalCount : selectedDupCount) !== 1 ? 's' : ''}?
            </h3>
            <div className="space-y-2 mb-5 text-sm">
              <p className="flex items-center gap-2 text-green-700">
                <span>✓</span> Keeping oldest record for each student
              </p>
              <p className="flex items-center gap-2 text-red-700">
                <span>✗</span> Deleting {dupConfirm === 'all' ? dupTotalCount : selectedDupCount} newer duplicate{(dupConfirm === 'all' ? dupTotalCount : selectedDupCount) !== 1 ? 's' : ''}
              </p>
              <p className="flex items-center gap-2 text-amber-700">
                <span>⚠</span> Fee records will be reassigned to the kept record
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={onCancelConfirm}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                data-testid="confirm-delete-duplicates-btn"
                onClick={() => onConfirmDelete(dupConfirm)}
                disabled={dupDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-40">
                {dupDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StudentsManagement({ schoolId, refreshKey }: Props) {
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<{ id: number; grade: string; section: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all' | 'duplicates'>('active')
  const [dupGroups, setDupGroups] = useState<DupGroup[]>([])
  const [dupLoading, setDupLoading] = useState(false)
  const [dupTotalCount, setDupTotalCount] = useState(0)
  const [selectedDupGroups, setSelectedDupGroups] = useState<Set<number>>(new Set())
  const [dupError, setDupError] = useState('')
  const [dupConfirm, setDupConfirm] = useState<'selected' | 'all' | null>(null)
  const [dupDeleting, setDupDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Student | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({})
  const [saving, setSaving] = useState(false)
  const [detailTab, setDetailTab] = useState<'info' | 'performance'>('info')
  const [studentPerf, setStudentPerf] = useState<StudentPerf | null>(null)
  const [studentRewards, setStudentRewards] = useState<StudentRewards | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)

  // Auto-scroll to top when this module opens
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/students?school_id=${schoolId}`).then(r => r.json()),
      fetch(`/api/classes?school_id=${schoolId}`).then(r => r.json()),
    ]).then(([stu, cls]) => {
      // Normalise section to uppercase so "a" and "A" are the same class
      const normStu = Array.isArray(stu) ? stu.map((s: Student) => ({ ...s, section: s.section?.toUpperCase() ?? s.section })) : []
      setStudents(normStu)
      setClasses(Array.isArray(cls) ? cls : [])
    }).catch(() => setError('Failed to load students')).finally(() => setLoading(false))
  }, [schoolId, refreshKey])

  async function loadStudentPerformance(student: Student) {
    setPerfLoading(true); setStudentPerf(null); setStudentRewards(null)
    try {
      const cls = classes.find(c => c.grade === student.grade && c.section === student.section)
      const [rewards, perf] = await Promise.all([
        fetch(`/api/students/${student.id}/rewards?school_id=${schoolId}`).then(r => r.json()).catch(() => null),
        cls
          ? fetch(`/api/classes/${cls.id}/performance?school_id=${schoolId}&days=30`).then(r => r.json()).catch(() => null)
          : Promise.resolve(null),
      ])
      if (rewards) setStudentRewards({ total_points: rewards.total_points ?? 0, badges: rewards.badges ?? [], streak: rewards.streak ?? null })
      if (perf && perf.students) {
        const me = perf.students.find((s: { id: number }) => s.id === student.id)
        if (me) setStudentPerf(me)
      }
    } finally { setPerfLoading(false) }
  }

  async function reloadStudents() {
    setLoading(true)
    try {
      const res = await fetch(`/api/students?school_id=${schoolId}`)
      const data = await res.json()
      setStudents(Array.isArray(data) ? data : [])
    } catch { setError('Failed to refresh students') }
    finally { setLoading(false) }
  }

  const loadDuplicates = useCallback(async () => {
    setDupLoading(true); setDupError('')
    try {
      const res = await fetch(`/api/students/duplicates?school_id=${schoolId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDupGroups(data.groups ?? [])
      setDupTotalCount(data.total_duplicates ?? 0)
      setSelectedDupGroups(new Set())
    } catch (err: unknown) {
      setDupError(err instanceof Error ? err.message : 'Failed to scan duplicates')
    } finally { setDupLoading(false) }
  }, [schoolId])

  async function handleDeleteDuplicates(mode: 'selected' | 'all') {
    setDupDeleting(true); setDupConfirm(null); setDupError('')
    try {
      const body = mode === 'all'
        ? { school_id: schoolId, cleanup_all: true }
        : {
            school_id: schoolId,
            duplicate_ids: Array.from(selectedDupGroups).flatMap(keepId => {
              const g = dupGroups.find(grp => grp.keep.id === keepId)
              return g ? g.duplicates.map(d => d.id) : []
            }),
          }
      const res = await fetch('/api/students/duplicates/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadDuplicates()
      reloadStudents()
    } catch (err: unknown) {
      setDupError(err instanceof Error ? err.message : 'Cleanup failed')
    } finally { setDupDeleting(false) }
  }

  function validateSave(): string | null {
    const name = (editForm.name ?? selected?.name ?? '').trim()
    const phone = (editForm.phone ?? selected?.phone ?? '').trim()
    const parentPhone = (editForm.parent_phone ?? selected?.parent_phone ?? '').trim()
    const email = (editForm.email ?? selected?.email ?? '').trim()
    if (!name) return 'Student name is required'
    if (phone && !/^\+?[\d\s\-()\[\]]{7,15}$/.test(phone)) return 'Phone must be 7–15 digits'
    if (parentPhone && !/^\+?[\d\s\-()\[\]]{7,15}$/.test(parentPhone)) return "Parent's phone must be 7–15 digits"
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address'
    return null
  }

  async function handleSave() {
    if (!selected) return
    const validErr = validateSave()
    if (validErr) { setError(validErr); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/students/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStudents(prev => prev.map(s => s.id === selected.id ? { ...s, ...data } : s))
      setSelected({ ...selected, ...data })
      setEditing(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save student')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(student: Student) {
    if (!confirm(`Remove ${student.name}? They will be marked inactive and can be restored later.`)) return
    try {
      const res = await fetch(`/api/students/${student.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, status: 'inactive' } : s))
      if (selected?.id === student.id) setSelected({ ...student, status: 'inactive' })
      reloadStudents()
    } catch {
      setError('Failed to remove student')
    }
  }

  async function handleRestore(student: Student) {
    try {
      const res = await fetch(`/api/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, status: 'active' } : s))
      if (selected?.id === student.id) setSelected({ ...student, status: 'active' })
      reloadStudents()
    } catch {
      setError('Failed to restore student')
    }
  }

  const activeStudents = students.filter(s => s.status === 'active' || !s.status)
  const inactiveStudents = students.filter(s => s.status === 'inactive')

  const displayStudents = statusFilter === 'active' ? activeStudents
    : statusFilter === 'inactive' ? inactiveStudents
    : statusFilter === 'duplicates' ? activeStudents
    : students

  const grades = ['all', ...Array.from(new Set(displayStudents.map(s => s.grade).filter(Boolean)))
    .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))]
  // Sections are already normalised to uppercase; show only sections for the selected grade
  const sections = ['all', ...Array.from(new Set(
    displayStudents
      .filter(s => gradeFilter === 'all' || s.grade === gradeFilter)
      .map(s => (s.section ?? '').toUpperCase())
      .filter(Boolean)
  )).sort()]

  const filtered = displayStudents.filter(s => {
    const sec = (s.section ?? '').toUpperCase()
    const matchesGrade   = gradeFilter === 'all' || s.grade === gradeFilter
    const matchesSection = sectionFilter === 'all' || sec === sectionFilter.toUpperCase()
    const q = search.trim().toLowerCase()
    const matchesSearch  = !q || [
      s.name,
      s.email,
      s.phone,
      s.roll_number,
      s.school_roll_number != null ? String(s.school_roll_number) : '',
      s.parent_name,
      s.parent_phone,
      s.parent_email,
      s.grade,
      s.section,
    ].some(v => (v || '').toLowerCase().includes(q))
    return matchesGrade && matchesSection && matchesSearch
  })

  // Group by grade-section, sort numerically by grade then alphabetically by section
  const grouped: Record<string, Student[]> = {}
  filtered.forEach(s => {
    const sec = (s.section ?? '').toUpperCase()
    const key = s.grade && sec ? `Grade ${s.grade} – Section ${sec}` : s.grade ? `Grade ${s.grade}` : 'Unassigned'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  })

  function sortGroupKey(a: string, b: string) {
    const ga = parseInt(a.match(/Grade (\d+)/)?.[1] ?? '0')
    const gb = parseInt(b.match(/Grade (\d+)/)?.[1] ?? '0')
    if (ga !== gb) return ga - gb
    return a.localeCompare(b)
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300'

  if (loading) return <div className="py-12 text-center text-gray-400">Loading students...</div>

  return (
    <div className="flex gap-6">
      {/* Left: List */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Students</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{students.length} total · {activeStudents.length} active · {inactiveStudents.length} removed</span>
            <button onClick={reloadStudents} disabled={loading}
              title="Refresh student list"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors disabled:opacity-40">
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          {(['active', 'inactive', 'all'] as const).map(key => {
            const labels: Record<string, string> = { active: 'Active', inactive: 'Removed', all: 'All' }
            return (
              <button key={key} onClick={() => { setStatusFilter(key); setGradeFilter('all'); setSectionFilter('all') }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {labels[key]}
                {key === 'inactive' && inactiveStudents.length > 0 && (
                  <span className="ml-1.5 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">{inactiveStudents.length}</span>
                )}
              </button>
            )
          })}
          <button
            data-testid="duplicates-tab-btn"
            onClick={() => { setStatusFilter('duplicates'); if (dupGroups.length === 0 && !dupLoading) loadDuplicates() }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === 'duplicates' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Duplicates
            {dupTotalCount > 0 && (
              <span className="ml-1.5 bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full">{dupTotalCount}</span>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {statusFilter === 'duplicates' ? (
          <DuplicatesPanel
            dupGroups={dupGroups}
            dupLoading={dupLoading}
            dupError={dupError}
            dupTotalCount={dupTotalCount}
            selectedDupGroups={selectedDupGroups}
            dupDeleting={dupDeleting}
            dupConfirm={dupConfirm}
            onScan={loadDuplicates}
            onSelectGroup={(keepId, checked) => {
              setSelectedDupGroups(prev => {
                const next = new Set(prev)
                if (checked) next.add(keepId); else next.delete(keepId)
                return next
              })
            }}
            onSelectAll={checked => {
              if (checked) setSelectedDupGroups(new Set(dupGroups.map(g => g.keep.id)))
              else setSelectedDupGroups(new Set())
            }}
            onDeleteSelected={() => setDupConfirm('selected')}
            onDeleteAll={() => setDupConfirm('all')}
            onConfirmDelete={handleDeleteDuplicates}
            onCancelConfirm={() => setDupConfirm(null)}
          />
        ) : (
        <>
        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, ID, email, phone, parent..."
            className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300" />
          <select value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setSectionFilter('all') }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
            {grades.map(g => <option key={g} value={g}>{g === 'all' ? 'All Grades' : `Grade ${g}`}</option>)}
          </select>
          <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
            {sections.map(s => <option key={s} value={s}>{s === 'all' ? 'All Sections' : `Section ${s}`}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
            <p className="text-gray-400">No students found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort(([a], [b]) => sortGroupKey(a, b)).map(([group, members]) => (
              <div key={group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
                  <span className="font-semibold text-green-800 text-sm">{group}</span>
                  <span className="text-xs text-green-600 font-medium">{members.length} student{members.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium text-amber-700 text-xs bg-amber-50 w-14">Roll</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Name</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Parent</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Contact</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...members].sort((a, b) => {
                      if (a.school_roll_number != null && b.school_roll_number != null) return a.school_roll_number - b.school_roll_number
                      if (a.school_roll_number != null) return -1
                      if (b.school_roll_number != null) return 1
                      return a.name.localeCompare(b.name)
                    }).map(s => (
                      <tr key={s.id} onClick={() => { setSelected(s); setEditing(false); setEditForm({}); setDetailTab('info'); setStudentPerf(null); setStudentRewards(null) }}
                        className={`cursor-pointer transition-colors ${selected?.id === s.id ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-3 text-center font-semibold text-sm text-amber-700 bg-amber-50/40">
                          {s.school_roll_number ?? <span className="text-gray-300 font-normal text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">{s.name}</td>
                        <td className="px-5 py-3 text-gray-600 text-xs">{s.parent_name || '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{s.parent_phone || s.phone || '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Removed Classes section — shows class-groups from inactive students */}
        {statusFilter === 'active' && inactiveStudents.length > 0 && (() => {
          const removedGroups: Record<string, number> = {}
          inactiveStudents.forEach(s => {
            const sec = (s.section ?? '').toUpperCase()
            if (s.grade && sec) {
              const key = `${s.grade}-${sec}`
              removedGroups[key] = (removedGroups[key] || 0) + 1
            }
          })
          const keys = Object.keys(removedGroups).sort((a, b) => {
            const [ag] = a.split('-'); const [bg] = b.split('-')
            return (parseInt(ag) || 0) - (parseInt(bg) || 0)
          })
          if (keys.length === 0) return null
          return (
            <div className="mt-4 bg-white rounded-xl border border-red-100 overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                <span className="font-semibold text-red-700 text-sm">Removed Classes</span>
                <span className="text-xs text-red-500">{keys.length} class{keys.length !== 1 ? 'es' : ''} · {inactiveStudents.length} students deactivated</span>
              </div>
              <div className="divide-y divide-gray-100">
                {keys.map(k => (
                  <div key={k} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm font-medium text-gray-500 line-through">Grade {k.split('-')[0]} – Section {k.split('-')[1]}</span>
                    <span className="text-xs text-gray-400">{removedGroups[k]} student{removedGroups[k] !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
        </>
        )}
      </div>

      {/* Right: Detail panel */}
      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 sticky top-6 flex flex-col max-h-[calc(100vh-6rem)] overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex gap-1">
                {(['info', 'performance'] as const).map(t => (
                  <button key={t} onClick={() => {
                    setDetailTab(t)
                    if (t === 'performance' && !studentPerf && !perfLoading) loadStudentPerformance(selected)
                  }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${detailTab === t ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {t === 'info' ? 'Profile' : '360° View'}
                  </button>
                ))}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1">
            {detailTab === 'performance' ? (
              <div className="px-5 py-5">
                {/* Avatar header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {selected.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{selected.name}</p>
                    <p className="text-xs text-gray-400">Grade {selected.grade} – Sec {selected.section} · {selected.roll_number}</p>
                  </div>
                </div>
                {perfLoading ? (
                  <div className="py-8 text-center"><div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                ) : (
                  <div className="space-y-4">
                    {/* Performance metrics */}
                    {studentPerf ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Attendance', value: studentPerf.attendance_pct, good: 80, warn: 60 },
                          { label: 'Tasks Done', value: studentPerf.task_submission_rate, good: 70, warn: 50 },
                          { label: 'Avg Score', value: studentPerf.avg_score_pct, good: 60, warn: 40 },
                          { label: 'Engagement', value: studentPerf.engagement, good: 70, warn: 50 },
                        ].map(({ label, value, good, warn }) => (
                          <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                            <p className={`text-xl font-black ${value === null ? 'text-gray-300' : value >= good ? 'text-emerald-600' : value >= warn ? 'text-amber-500' : 'text-red-500'}`}>
                              {value === null ? '—' : `${value}%`}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center">No performance data yet for this class.</p>
                    )}
                    {studentPerf && (
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                        <span className="text-xs text-gray-500">Class Rank</span>
                        <span className="text-sm font-black text-violet-600">#{studentPerf.rank}</span>
                      </div>
                    )}
                    {/* Rewards */}
                    {studentRewards && (
                      <div className="space-y-2">
                        <div className="bg-amber-50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                          <span className="text-xs text-amber-700 font-semibold">Total Points</span>
                          <span className="text-sm font-black text-amber-600">{studentRewards.total_points}</span>
                        </div>
                        {studentRewards.streak && studentRewards.streak.current_streak > 0 && (
                          <div className="bg-orange-50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                            <span className="text-xs text-orange-700 font-semibold">Current Streak</span>
                            <span className="text-sm font-black text-orange-500">{studentRewards.streak.current_streak} days</span>
                          </div>
                        )}
                        {studentRewards.badges.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1.5">Badges Earned ({studentRewards.badges.length})</p>
                            <div className="flex flex-wrap gap-1.5">
                              {studentRewards.badges.map((b, i) => (
                                <span key={i} className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium capitalize">
                                  {(b.badge_type ?? '').replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Parent info */}
                    {(selected.parent_name || selected.parent_phone || selected.parent_email) && (
                      <div className="bg-blue-50 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Parent</p>
                        {selected.parent_name && <p className="text-xs font-semibold text-gray-800">{selected.parent_name}</p>}
                        {selected.parent_phone && <p className="text-xs text-gray-500">{selected.parent_phone}</p>}
                        {selected.parent_email && <p className="text-xs text-gray-400">{selected.parent_email}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
            <><div className="px-5 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{selected.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{selected.roll_number}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selected.grade && selected.section ? `Grade ${selected.grade} – Section ${selected.section}` : ''}
                  </p>
                </div>
              </div>

              {!editing ? (
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Email', value: selected.email },
                    { label: 'Phone', value: selected.phone },
                    { label: 'Parent', value: selected.parent_name },
                    { label: 'Parent Ph.', value: selected.parent_phone },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex gap-2">
                      <span className="text-gray-400 w-20 flex-shrink-0 text-xs">{label}</span>
                      <span className="text-gray-700 text-xs break-all">{value}</span>
                    </div>
                  ) : null)}
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { field: 'name', label: 'Name *', type: 'text', placeholder: 'Full name' },
                    { field: 'email', label: 'Email', type: 'email', placeholder: 'student@email.com' },
                    { field: 'grade', label: 'Grade', type: 'text', placeholder: 'e.g. 8' },
                    { field: 'section', label: 'Section', type: 'text', placeholder: 'e.g. A' },
                    { field: 'phone', label: 'Phone', type: 'tel', placeholder: '10-digit number' },
                    { field: 'parent_name', label: 'Parent Name', type: 'text', placeholder: 'Parent full name' },
                    { field: 'parent_phone', label: 'Parent Phone', type: 'tel', placeholder: '10-digit number' },
                    { field: 'parent_email', label: 'Parent Email', type: 'email', placeholder: 'parent@email.com' },
                  ].map(({ field, label, type, placeholder }) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type={type} placeholder={placeholder}
                        value={(editForm as Record<string, unknown>)[field] as string ?? (selected as Record<string, unknown>)[field] as string ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                        className={inputCls + ' !text-xs !py-1.5'} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-4 space-y-2">
              {editing ? (
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditing(false); setEditForm({}) }}
                    className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => { setEditForm({}); setEditing(true) }}
                  className="w-full border border-green-200 text-green-600 py-2 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors">
                  Edit Details
                </button>
              )}
              {selected.status === 'inactive' ? (
                <button onClick={() => handleRestore(selected)}
                  className="w-full border border-green-300 text-green-700 py-2 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors">
                  ↩ Restore Student
                </button>
              ) : (
                <button onClick={() => handleDelete(selected)}
                  className="w-full border border-red-200 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
                  Remove Student
                </button>
              )}
            </div>
            </>) /* end info tab */}
            </div> {/* end scroll wrapper */}

          </div>
        </div>
      )}
    </div>
  )
}









