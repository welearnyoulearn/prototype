'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type School = {
  id: number
  name: string
  type: string
  city: string
  country: string
  status: string
  phone?: string
  email?: string
  address?: string
  school_code?: string
  created_at: string
}

type FormData = {
  name: string
  type: string
  city: string
  country: string
  phone: string
  email: string
  address: string
}

export default function PlatformAdmin() {
  const router = useRouter()
  const [schools, setSchools]     = useState<School[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch]       = useState('')
  const [createdSchool, setCreatedSchool] = useState<{ name: string; code: string; pass: string } | null>(null)
  const [form, setForm]           = useState<FormData>({
    name: '', type: 'Private', city: '', country: '', phone: '', email: '', address: '',
  })

  useEffect(() => {
    fetch('/api/init')
      .then(() => fetchSchools())
      .catch(() => setError('Cannot connect to database.'))
  }, [])

  async function fetchSchools() {
    setLoading(true)
    try {
      const res = await fetch('/api/schools')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSchools(data)
    } catch { setError('Failed to load schools') }
    finally { setLoading(false) }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSchools(prev => [data, ...prev])
      setShowModal(false)
      setForm({ name: '', type: 'Private', city: '', country: '', phone: '', email: '', address: '' })
      // Show credentials modal
      setCreatedSchool({ name: data.name, code: data.school_code, pass: data.temp_password })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create school')
    } finally { setSubmitting(false) }
  }

  async function toggleStatus(school: School) {
    const newStatus = school.status === 'active' ? 'inactive' : 'active'
    try {
      const res = await fetch(`/api/schools/${school.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSchools(prev => prev.map(s => s.id === school.id ? data : s))
    } catch { setError('Failed to update school status') }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this school? All its data (teachers, students, timetables) will be removed.')) return
    try {
      const res = await fetch(`/api/schools/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setSchools(prev => prev.filter(s => s.id !== id))
    } catch { setError('Failed to delete school') }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.city || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.school_code || '').toLowerCase().includes(search.toLowerCase())
  )

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <span className="font-bold text-gray-900">WLYL</span>
          </div>
          <span className="text-gray-300">|</span>
          <h1 className="text-sm font-semibold text-gray-700">Platform Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-3 py-1 rounded-full">Platform Admin</span>
          <button onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors">
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center text-sm">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Schools</h2>
            <p className="text-gray-500 text-sm mt-1">{schools.length} school{schools.length !== 1 ? 's' : ''} registered</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Add School
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Schools', value: schools.length, color: 'text-gray-900' },
            { label: 'Active', value: schools.filter(s => s.status === 'active').length, color: 'text-green-600' },
            { label: 'Inactive', value: schools.filter(s => s.status === 'inactive').length, color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <input type="text" placeholder="Search by name, city, or school code..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white" />

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading schools...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-lg">{search ? 'No schools match your search' : 'No schools yet'}</p>
              {!search && <p className="text-gray-300 text-sm mt-1">Click &quot;Add School&quot; to register the first school</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">School</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">School ID</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Contact</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Location</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(school => (
                  <tr key={school.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/platform-admin/schools/${school.id}`}
                        className="font-medium text-purple-700 hover:text-purple-900 hover:underline">{school.name}</Link>
                      <div className="text-gray-400 text-xs mt-0.5">{school.type}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      {school.school_code ? (
                        <code className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded font-mono">{school.school_code}</code>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">
                      {school.email && <div>{school.email}</div>}
                      {school.phone && <div className="text-gray-400">{school.phone}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {[school.city, school.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        school.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>{school.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Link href={`/platform-admin/schools/${school.id}`}
                          className="text-xs px-2.5 py-1 rounded border border-purple-200 hover:bg-purple-50 text-purple-600 transition-colors">
                          Manage
                        </Link>
                        <button onClick={() => toggleStatus(school)}
                          className="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
                          {school.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDelete(school.id)}
                          className="text-xs px-2.5 py-1 rounded border border-red-200 hover:bg-red-50 text-red-500 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add School Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-900">Add New School</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School Name <span className="text-red-500">*</span></label>
                <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Greenwood High School" className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                    <option>Private</option><option>Public</option><option>Charter</option><option>International</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input type="text" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="India" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Email <span className="text-gray-400 font-normal text-xs">(login credentials sent here)</span>
                </label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@schoolname.edu" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210 (7–15 digits)" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  rows={2} placeholder="Street, Area, City, State, PIN" className={`${inputCls} resize-none`} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials Modal — shown after school creation */}
      {createdSchool && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="bg-green-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">School Created!</h3>
                  <p className="text-green-200 text-sm">{createdSchool.name}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-4">
                The school admin credentials have been generated.
                {form.email ? ' An onboarding email has been sent.' : ' Copy these credentials and share them manually.'}
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">School ID (Login)</p>
                  <code className="text-sm font-mono text-amber-900 bg-white border border-amber-200 rounded px-3 py-2 block">{createdSchool.code}</code>
                </div>
                <div>
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">Temporary Password</p>
                  <code className="text-sm font-mono text-amber-900 bg-white border border-amber-200 rounded px-3 py-2 block">{createdSchool.pass}</code>
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-3 bg-gray-50 rounded-lg px-3 py-2">
                ⚠️ The school admin will be asked to change this password on first login.
              </p>

              <button onClick={() => setCreatedSchool(null)}
                className="w-full mt-4 bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
