'use client'

import { useEffect, useState } from 'react'

type Props = { schoolId: number }

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
}

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

type UnavailableSlot = {
  id: number
  day_of_week: string
  period_number: number
  reason: string | null
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

export default function TeachersManagement({ schoolId }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'teaching' | 'non_teaching'>('teaching')
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
  const [showAvailability, setShowAvailability] = useState(false)
  const [unavailableSlots, setUnavailableSlots] = useState<UnavailableSlot[]>([])
  const [availLoading, setAvailLoading] = useState(false)
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null)
  // 360° profile panel
  const [detailTab, setDetailTab] = useState<'info' | 'analytics'>('info')
  const [teacherAnalytics, setTeacherAnalytics] = useState<{
    taskCount: number; pendingLeaves: number; totalLeaves: number; subDutyCount: number; periodsPerWeek: number
  } | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  useEffect(() => { loadTeachers() }, [schoolId])

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
    if (phone && !/^\+?[\d\s\-()\[\]]{7,15}$/.test(phone)) return 'Phone must be 7–15 digits (optionally with +, spaces, or dashes)'
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
      setEditing(false)
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

  async function loadAvailability(teacherId: number) {
    setAvailLoading(true)
    try {
      const res = await fetch(`/api/teacher-availability?teacher_id=${teacherId}&school_id=${schoolId}`)
      const data = await res.json()
      setUnavailableSlots(Array.isArray(data) ? data : [])
    } catch { setError('Failed to load availability') }
    finally { setAvailLoading(false) }
  }

  async function toggleSlot(teacherId: number, day: string, pNum: number) {
    const key = `${day}-${pNum}`
    setTogglingSlot(key)
    const isUnavail = unavailableSlots.some(s => s.day_of_week === day && s.period_number === pNum)
    try {
      if (isUnavail) {
        await fetch(`/api/teacher-availability?teacher_id=${teacherId}&school_id=${schoolId}&day_of_week=${day}&period_number=${pNum}`, { method: 'DELETE' })
        setUnavailableSlots(prev => prev.filter(s => !(s.day_of_week === day && s.period_number === pNum)))
      } else {
        const res = await fetch('/api/teacher-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId, school_id: schoolId, day_of_week: day, period_number: pNum }),
        })
        const data = await res.json()
        if (!data.already_set) setUnavailableSlots(prev => [...prev, data])
      }
    } catch { setError('Failed to update availability') }
    finally { setTogglingSlot(null) }
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
      const periodsPerWeek = ttArr.length
      const pendingLeaves = leaveArr.filter((l: { status: string }) => l.status === 'pending').length
      setTeacherAnalytics({
        taskCount: taskArr.length,
        pendingLeaves,
        totalLeaves: leaveArr.length,
        subDutyCount: teacherSubDuties.length,
        periodsPerWeek,
      })
    } finally { setAnalyticsLoading(false) }
  }

  async function handleDelete(teacher: Teacher) {
    if (!confirm(`Remove ${teacher.name} from this school?`)) return
    try {
      const res = await fetch(`/api/teachers/${teacher.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setTeachers(prev => prev.filter(t => t.id !== teacher.id))
      if (selected?.id === teacher.id) setSelected(null)
    } catch {
      setError('Failed to delete teacher')
    }
  }

  const byType = teachers.filter(t => (t.staff_type || 'teaching') === tab)
  const departments = ['all', ...Array.from(new Set(byType.map(t => t.department).filter(Boolean)))]

  const filtered = byType.filter(t => {
    const matchesDept = deptFilter === 'all' || t.department === deptFilter
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.employee_id || '').toLowerCase().includes(search.toLowerCase())
    return matchesDept && matchesSearch
  })

  // Group teaching staff by department
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

  return (
    <div className="flex gap-6 h-full">
      {/* Left: List */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Staff Directory</h2>
          <div className="text-sm text-gray-400">{teachers.length} total staff</div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
          {(['teaching', 'non_teaching'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setDeptFilter('all') }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}
              <span className="ml-1.5 text-xs text-gray-400">({teachers.filter(x => (x.staff_type || 'teaching') === t).length})</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          {tab === 'teaching' && departments.length > 1 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
              {departments.map(d => <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>)}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
            <p className="text-gray-400">No {tab === 'teaching' ? 'teaching' : 'non-teaching'} staff found</p>
          </div>
        ) : tab === 'teaching' ? (
          // Department-wise grouped view
          <div className="space-y-5">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dept, members]) => (
              <div key={dept} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                  <span className="font-semibold text-blue-800 text-sm">{dept}</span>
                  <span className="text-xs text-blue-500">{members.length} teacher{members.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {members.map(t => (
                    <TeacherRow key={t.id} teacher={t} selected={selected?.id === t.id}
                      onClick={() => { setSelected(t); setEditing(false); setDetailTab('info'); setShowTimetable(false); setShowAvailability(false) }}
                      onToggle={() => handleToggleStatus(t)} onDelete={() => handleDelete(t)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Non-teaching: flat list
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filtered.map(t => (
                <TeacherRow key={t.id} teacher={t} selected={selected?.id === t.id}
                  onClick={() => { setSelected(t); setEditing(false); setDetailTab('info'); setShowTimetable(false); setShowAvailability(false) }}
                  onToggle={() => handleToggleStatus(t)} onDelete={() => handleDelete(t)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Detail panel */}
      {selected && (
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 sticky top-6">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex gap-1">
                {(['info', 'analytics'] as const).map(t => (
                  <button key={t} onClick={() => {
                    setDetailTab(t)
                    if (t === 'analytics' && !teacherAnalytics) loadTeacherAnalytics(selected.id)
                  }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${detailTab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {t === 'info' ? 'Profile' : '360° View'}
                  </button>
                ))}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Profile */}
            <div className="px-5 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <Avatar name={selected.name} size="lg" />
                <div>
                  <p className="font-bold text-gray-900">{selected.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selected.employee_id}</p>
                  <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${selected.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {selected.status}
                  </span>
                </div>
              </div>

              {selected.class_grade && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 mb-3 text-xs text-blue-700">
                  <span className="font-medium">Class Teacher:</span> Grade {selected.class_grade} – Section {selected.class_section}
                </div>
              )}

              {!editing ? (
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Subject', value: selected.subject },
                    { label: 'Department', value: selected.department },
                    { label: 'Staff Type', value: selected.staff_type === 'non_teaching' ? 'Non-Teaching' : 'Teaching' },
                    { label: 'Qualification', value: selected.qualification },
                    { label: 'Joining Date', value: selected.date_of_joining ? new Date(selected.date_of_joining).toLocaleDateString() : null },
                    { label: 'Email', value: selected.email },
                    { label: 'Phone', value: selected.phone },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex gap-2">
                      <span className="text-gray-400 w-24 flex-shrink-0">{label}</span>
                      <span className="text-gray-700 font-medium break-all">{value}</span>
                    </div>
                  ) : null)}
                </div>
              ) : (
                <div className="space-y-3">
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
                        className={inputCls + ' !text-xs !py-1.5'} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Staff Type</label>
                    <select value={editForm.staff_type ?? selected.staff_type ?? 'teaching'}
                      onChange={e => setEditForm(f => ({ ...f, staff_type: e.target.value }))}
                      className={inputCls + ' !text-xs !py-1.5'}>
                      <option value="teaching">Teaching</option>
                      <option value="non_teaching">Non-Teaching</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 space-y-2">
              {editing ? (
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditing(false); setEditForm({}) }}
                    className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => { setEditing(true); setEditForm({}) }}
                  className="w-full border border-blue-200 text-blue-600 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
                  Edit Details
                </button>
              )}
              <button
                onClick={() => {
                  const next = !showTimetable
                  setShowTimetable(next)
                  if (next) { setShowAvailability(false); loadTeacherTimetable(selected.id) }
                }}
                className="w-full border border-purple-200 text-purple-600 py-2 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors">
                {showTimetable ? 'Hide Timetable' : 'View Timetable'}
              </button>
              <button
                onClick={() => {
                  const next = !showAvailability
                  setShowAvailability(next)
                  if (next) { setShowTimetable(false); loadAvailability(selected.id) }
                }}
                className="w-full border border-teal-200 text-teal-600 py-2 rounded-lg text-sm font-medium hover:bg-teal-50 transition-colors">
                {showAvailability ? 'Hide Availability' : 'Set Availability'}
              </button>
              <button onClick={() => handleToggleStatus(selected)}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors border ${selected.status === 'active' ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                {selected.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => handleDelete(selected)}
                className="w-full border border-red-200 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
                Remove from School
              </button>
            </div>

            {/* Timetable view */}
            {detailTab === 'info' && showTimetable && (
              <div className="border-t border-gray-100">
                <TeacherTimetableView
                  timetable={teacherTimetable}
                  loading={timetableLoading}
                  teacherName={selected.name}
                  subDuties={teacherSubDuties}
                />
              </div>
            )}

            {/* Availability grid */}
            {detailTab === 'info' && showAvailability && (
              <div className="border-t border-gray-100">
                <AvailabilityGrid
                  teacherId={selected.id}
                  unavailableSlots={unavailableSlots}
                  loading={availLoading}
                  togglingSlot={togglingSlot}
                  onToggle={(day, pNum) => toggleSlot(selected.id, day, pNum)}
                />
              </div>
            )}

            {/* 360° Analytics */}
            {detailTab === 'analytics' && (
              <div className="px-5 py-5 space-y-4">
                {analyticsLoading ? (
                  <div className="py-8 text-center">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : !teacherAnalytics ? null : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Periods/Week', value: teacherAnalytics.periodsPerWeek, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Tasks Assigned', value: teacherAnalytics.taskCount, color: 'text-violet-600', bg: 'bg-violet-50' },
                        { label: 'Total Leaves', value: teacherAnalytics.totalLeaves, color: 'text-orange-600', bg: 'bg-orange-50' },
                        { label: 'Pending Leaves', value: teacherAnalytics.pendingLeaves, color: 'text-red-600', bg: 'bg-red-50' },
                      ].map(({ label, value, color, bg }) => (
                        <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                          <p className={`text-2xl font-black ${color}`}>{value}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-600 mb-2">Quick Info</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Subject</span>
                          <span className="font-medium text-gray-700">{selected.subject || '—'}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Department</span>
                          <span className="font-medium text-gray-700">{selected.department || '—'}</span>
                        </div>
                        {selected.class_grade && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Class Teacher</span>
                            <span className="font-medium text-emerald-600">Grade {selected.class_grade}-{selected.class_section}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Status</span>
                          <span className={`font-medium ${selected.status === 'active' ? 'text-emerald-600' : 'text-gray-400'}`}>{selected.status}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setDetailTab('info'); setTimeout(() => { setShowTimetable(true); loadTeacherTimetable(selected.id) }, 100) }}
                      className="w-full border border-purple-200 text-purple-600 py-2 rounded-lg text-xs font-medium hover:bg-purple-50 transition-colors">
                      View Full Timetable →
                    </button>
                  </>
                )}
              </div>
            )}
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
const BREAK_ROWS = [
  { afterPeriod: 3, label: 'Break', time: '10:25–10:45' },
]

function TeacherTimetableView({ timetable, loading, teacherName, subDuties }: { timetable: TimetableSlot[]; loading: boolean; teacherName: string; subDuties: SubDuty[] }) {
  if (loading) return <div className="px-5 py-6 text-center text-gray-400 text-xs">Loading timetable...</div>

  if (timetable.length === 0) {
    return (
      <div className="px-5 py-6 text-center">
        <p className="text-gray-400 text-xs">No timetable generated yet</p>
        <p className="text-gray-300 text-[10px] mt-1">Go to Class Management → generate timetable</p>
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

  // Build display rows: periods 1-7 with break rows inserted
  const rows: ({ type: 'period'; num: number } | { type: 'break'; label: string; time: string })[] = []
  for (const p of ALL_PERIODS) {
    rows.push({ type: 'period', num: p })
    const brk = BREAK_ROWS.find(b => b.afterPeriod === p)
    if (brk) rows.push({ type: 'break', label: brk.label, time: brk.time })
  }

  return (
    <div className="px-3 py-4">
      <div className="flex items-center justify-between px-2 mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-700">Weekly Timetable — {teacherName}</p>
        {subDuties.length > 0 && (
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
            {subDuties.length} substitute period{subDuties.length > 1 ? 's' : ''} today
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="bg-slate-700 text-slate-200 px-2 py-1.5 text-left font-semibold rounded-tl-lg">P</th>
              {DAYS.map(d => (
                <th key={d} className={`px-1.5 py-1.5 text-center font-semibold ${d === today ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
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
                    <td colSpan={5} className="px-2 py-1 text-center text-amber-400 italic">{row.time}</td>
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
                          <div className={`rounded px-1 py-1 text-center bg-amber-50 border-2 border-amber-300 ${isNow ? 'ring-1 ring-orange-400' : ''}`}>
                            <div className="flex items-center justify-center gap-0.5 mb-0.5">
                              <p className="font-semibold text-amber-800 leading-tight text-[10px]">
                                {subDuty.subject_name || subDuty.original_teacher_department || '—'}
                              </p>
                              <span className="text-[8px] bg-amber-400 text-white px-0.5 rounded font-bold leading-none py-0.5">SUB</span>
                            </div>
                            <p className="text-amber-600 leading-tight text-[10px]">Gr.{subDuty.grade}-{subDuty.section}</p>
                            <p className="text-amber-400 text-[9px] truncate">for {subDuty.original_teacher_name || 'absent'}</p>
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
      <p className="text-[10px] text-gray-400 mt-2 px-2">{timetable.length} assigned period{timetable.length !== 1 ? 's' : ''} · free slots shown in gray</p>
    </div>
  )
}

const AVAIL_PERIODS = [1, 2, 3, 4, 5, 6]
const AVAIL_PERIOD_TIMES: Record<number, string> = {
  1: '08:00', 2: '08:50', 3: '09:40', 4: '10:45', 5: '11:35', 6: '12:25',
}

function AvailabilityGrid({ teacherId, unavailableSlots, loading, togglingSlot, onToggle }: {
  teacherId: number
  unavailableSlots: UnavailableSlot[]
  loading: boolean
  togglingSlot: string | null
  onToggle: (day: string, pNum: number) => void
}) {
  if (loading) return <div className="px-5 py-6 text-center text-gray-400 text-xs">Loading availability...</div>

  const isUnavail = (day: string, pNum: number) =>
    unavailableSlots.some(s => s.day_of_week === day && s.period_number === pNum)

  const unavailCount = unavailableSlots.length

  return (
    <div className="px-3 py-4">
      <div className="flex items-center justify-between mb-2 px-2">
        <p className="text-xs font-semibold text-gray-700">Availability Grid</p>
        <span className="text-[10px] text-gray-400">{unavailCount} slot{unavailCount !== 1 ? 's' : ''} blocked</span>
      </div>
      <p className="text-[10px] text-gray-400 px-2 mb-3">Click a cell to mark/unmark unavailable. Red = blocked for timetable.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="bg-slate-700 text-slate-200 px-2 py-1.5 text-left font-semibold rounded-tl-lg w-8">P</th>
              {DAYS.map(d => (
                <th key={d} className="bg-slate-700 text-slate-300 px-1.5 py-1.5 text-center font-semibold">
                  {d.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AVAIL_PERIODS.map(pNum => (
              <tr key={pNum} className="border-b border-gray-100">
                <td className="px-2 py-1 bg-gray-50 font-semibold text-gray-500 border-r border-gray-100 text-center whitespace-nowrap">
                  <span>{pNum}</span>
                  <span className="block text-gray-300 font-normal" style={{ fontSize: '8px' }}>{AVAIL_PERIOD_TIMES[pNum]}</span>
                </td>
                {DAYS.map(day => {
                  const blocked = isUnavail(day, pNum)
                  const key = `${day}-${pNum}`
                  const toggling = togglingSlot === key
                  return (
                    <td key={day} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                      <button
                        onClick={() => onToggle(day, pNum)}
                        disabled={toggling}
                        className={`w-full rounded px-1 py-1.5 text-center transition-colors border ${
                          blocked
                            ? 'bg-red-100 border-red-300 text-red-600 hover:bg-red-200'
                            : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                        } ${toggling ? 'opacity-50' : ''}`}
                      >
                        {toggling ? '...' : blocked ? '✕' : '✓'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2 px-2">
        <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />Available
        <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1 ml-3" />Unavailable (blocked from timetable)
      </p>
    </div>
  )
}

function TeacherRow({ teacher, selected, onClick, onToggle, onDelete }:
  { teacher: Teacher; selected: boolean; onClick: () => void; onToggle: () => void; onDelete: () => void }) {
  return (
    <div onClick={onClick}
      className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${selected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${selected ? 'bg-blue-600' : 'bg-gray-300'}`}>
        {teacher.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{teacher.name}</span>
          {teacher.class_grade && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              CT: Gr.{teacher.class_grade}-{teacher.class_section}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {teacher.employee_id && <span className="text-xs text-gray-400 font-mono">{teacher.employee_id}</span>}
          {teacher.subject && <span className="text-xs text-gray-500">· {teacher.subject}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <span className={`w-2 h-2 rounded-full ${teacher.status === 'active' ? 'bg-green-400' : 'bg-gray-300'}`} />
      </div>
    </div>
  )
}
