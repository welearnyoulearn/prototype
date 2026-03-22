'use client'

import { useState } from 'react'

type Teacher = {
  id: number
  name: string
  employee_id: string
  subject: string
  department: string
  qualification: string
  email: string
  phone: string
  staff_type: string
  date_of_joining: string | null
  teaches_grades: string | null
  class_teacher_grade: string | null
  class_teacher_section: string | null
  status: string
}

type Props = {
  teacher: Teacher
  onUpdate: (updated: Teacher) => void
}

export default function TeacherProfile({ teacher, onUpdate }: Props) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Teacher>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/teachers/${teacher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdate({ ...teacher, ...data })
      setEditing(false)
      setForm({})
      setSuccess('Profile updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300'

  const fields: { field: keyof Teacher; label: string; type?: string }[] = [
    { field: 'name', label: 'Full Name' },
    { field: 'email', label: 'Email', type: 'email' },
    { field: 'phone', label: 'Phone' },
    { field: 'subject', label: 'Subject' },
    { field: 'department', label: 'Department' },
    { field: 'qualification', label: 'Qualification' },
    { field: 'date_of_joining', label: 'Date of Joining', type: 'date' },
    { field: 'teaches_grades', label: 'Teaches Grades (e.g. 8A,8B,9A)' },
  ]

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">My Profile</h2>
          <p className="text-sm text-gray-500 mt-0.5">View and update your information</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="border border-blue-200 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setForm({}) }}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">✓ {success}</div>
      )}

      {/* Avatar + badge */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
            {teacher.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{teacher.name}</h3>
            <p className="text-sm text-gray-500 font-mono">{teacher.employee_id}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${teacher.staff_type === 'teaching' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {teacher.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}
              </span>
              {teacher.class_teacher_grade && teacher.class_teacher_section && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                  CT: Grade {teacher.class_teacher_grade} – Sec {teacher.class_teacher_section}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${teacher.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {teacher.status}
              </span>
            </div>
          </div>
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Email', value: teacher.email },
              { label: 'Phone', value: teacher.phone },
              { label: 'Subject', value: teacher.subject },
              { label: 'Department', value: teacher.department },
              { label: 'Qualification', value: teacher.qualification },
              { label: 'Date of Joining', value: teacher.date_of_joining ? new Date(teacher.date_of_joining).toLocaleDateString() : null },
              { label: 'Teaches Grades', value: teacher.teaches_grades },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm text-gray-900 font-medium">{value || <span className="text-gray-300">Not set</span>}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map(({ field, label, type }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type={type || 'text'}
                  value={(form[field] as string) ?? (teacher[field] as string) ?? ''}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className={inputCls} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
