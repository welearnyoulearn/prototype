'use client'

import { useEffect, useState } from 'react'

type Props = { schoolId: number }

type Student = {
  id: number
  name: string
  email: string
  grade: string
  section: string
  roll_number: string
  parent_name: string
  parent_phone: string
  phone: string
  status: string
}

type EditForm = Partial<Student>

export default function StudentsManagement({ schoolId }: Props) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Student | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadStudents() }, [schoolId])

  async function loadStudents() {
    setLoading(true)
    try {
      const res = await fetch(`/api/students?school_id=${schoolId}`)
      const data = await res.json()
      setStudents(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load students')
    } finally {
      setLoading(false)
    }
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
    if (!confirm(`Remove ${student.name}?`)) return
    try {
      const res = await fetch(`/api/students/${student.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setStudents(prev => prev.filter(s => s.id !== student.id))
      if (selected?.id === student.id) setSelected(null)
    } catch {
      setError('Failed to delete student')
    }
  }

  const grades = ['all', ...Array.from(new Set(students.map(s => s.grade).filter(Boolean))).sort()]
  const sections = ['all', ...Array.from(new Set(
    students.filter(s => gradeFilter === 'all' || s.grade === gradeFilter).map(s => s.section).filter(Boolean)
  )).sort()]

  const filtered = students.filter(s => {
    const matchesGrade = gradeFilter === 'all' || s.grade === gradeFilter
    const matchesSection = sectionFilter === 'all' || s.section === sectionFilter
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.roll_number || '').toLowerCase().includes(search.toLowerCase())
    return matchesGrade && matchesSection && matchesSearch
  })

  // Group by grade-section
  const grouped: Record<string, Student[]> = {}
  filtered.forEach(s => {
    const key = s.grade && s.section ? `Grade ${s.grade} – Section ${s.section}` : s.grade ? `Grade ${s.grade}` : 'Unassigned'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  })

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-300'

  if (loading) return <div className="py-12 text-center text-gray-400">Loading students...</div>

  return (
    <div className="flex gap-6">
      {/* Left: List */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Students</h2>
          <span className="text-sm text-gray-400">{students.length} total students</span>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..."
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

        {/* Stats chips */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {Array.from(new Set(students.map(s => s.grade).filter(Boolean))).sort().map(g => {
            const count = students.filter(s => s.grade === g).length
            return (
              <button key={g} onClick={() => { setGradeFilter(g === gradeFilter ? 'all' : g); setSectionFilter('all') }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${gradeFilter === g ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
                Grade {g} · {count}
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
            <p className="text-gray-400">No students found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, members]) => (
              <div key={group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
                  <span className="font-semibold text-green-800 text-sm">{group}</span>
                  <span className="text-xs text-green-500">{members.length} student{members.length !== 1 ? 's' : ''}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Student ID</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Name</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Parent</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Contact</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {members.map(s => (
                      <tr key={s.id} onClick={() => { setSelected(s); setEditing(false) }}
                        className={`cursor-pointer transition-colors ${selected?.id === s.id ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{s.roll_number || '—'}</td>
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
            ))}
          </div>
        )}
      </div>

      {/* Right: Detail panel */}
      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 sticky top-6">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-800 text-sm">Student Details</span>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="px-5 py-5 border-b border-gray-100">
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
                  ].map(({ field, label, type, placeholder }) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type={type} placeholder={placeholder}
                        value={(editForm as Record<string, string>)[field] ?? (selected as Record<string, string>)[field] ?? ''}
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
                <button onClick={() => setEditing(true)}
                  className="w-full border border-green-200 text-green-600 py-2 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors">
                  Edit Details
                </button>
              )}
              <button onClick={() => handleDelete(selected)}
                className="w-full border border-red-200 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
                Remove Student
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
