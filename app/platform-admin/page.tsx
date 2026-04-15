'use client'

import { useEffect, useState, useCallback } from 'react'
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
  deleted_at?: string
  tier?: string
  teacher_count?: number
  student_count?: number
}

type PlatformStats = {
  schools:       { total: number; active: number; inactive: number }
  teachers:      { total: number }
  students:      { total: number }
  subscriptions: { basic: number; standard: number; premium: number; none: number }
}

type FormData = {
  name: string; type: string; city: string; country: string
  phone: string; email: string; address: string
}

const TIER_BADGE: Record<string, string> = {
  basic:    'bg-green-100 text-green-700',
  standard: 'bg-blue-100 text-blue-700',
  premium:  'bg-purple-100 text-purple-700',
  none:     'bg-gray-100 text-gray-500',
}

type Tab = 'active' | 'inactive' | 'deleted'

export default function PlatformAdmin() {
  const router = useRouter()
  const [tab, setTab]                   = useState<Tab>('active')
  const [schools, setSchools]           = useState<School[]>([])
  const [stats, setStats]               = useState<PlatformStats | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [search, setSearch]             = useState('')
  const [filterTier, setFilterTier]     = useState<string>('all')
  const [createdSchool, setCreatedSchool] = useState<{ name: string; code: string; pass: string } | null>(null)
  const [form, setForm] = useState<FormData>({
    name: '', type: 'Private', city: '', country: '', phone: '', email: '', address: '',
  })

  const scopeForTab: Record<Tab, string> = {
    active:   'active',
    inactive: 'inactive',
    deleted:  'deleted',
  }

  const fetchSchools = useCallback(async (t: Tab = tab) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/schools?scope=${scopeForTab[t]}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSchools(data)
    } catch { setError('Failed to load schools') }
    finally { setLoading(false) }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/init')
      .then(() => Promise.all([fetchSchools(tab), fetchStats()]))
      .catch(() => setError('Cannot connect to database.'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(t: Tab) {
    setTab(t)
    setSearch('')
    setFilterTier('all')
    fetchSchools(t)
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/platform/stats')
      if (res.ok) setStats(await res.json())
    } catch { /* non-critical */ }
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
      setShowModal(false)
      setForm({ name: '', type: 'Private', city: '', country: '', phone: '', email: '', address: '' })
      setCreatedSchool({ name: data.name, code: data.school_code, pass: data.temp_password })
      fetchSchools('active')
      fetchStats()
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
      setSchools(prev => prev.filter(s => s.id !== school.id))
      fetchStats()
    } catch { setError('Failed to update school status') }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"?\n\nThe school will be soft-deleted — all data is preserved and can be restored later.`)) return
    try {
      const res = await fetch(`/api/schools/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setSchools(prev => prev.filter(s => s.id !== id))
      fetchStats()
    } catch { setError('Failed to delete school') }
  }

  async function handleRestore(id: number, name: string) {
    if (!confirm(`Restore "${name}"? It will become active again.`)) return
    try {
      const res = await fetch(`/api/schools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      })
      if (!res.ok) throw new Error()
      setSchools(prev => prev.filter(s => s.id !== id))
      fetchStats()
    } catch { setError('Failed to restore school') }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const filtered = schools.filter(s => {
    const matchSearch = !search || (
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.city || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.school_code || '').toLowerCase().includes(search.toLowerCase())
    )
    const matchTier = filterTier === 'all' || (s.tier || 'none') === filterTier
    return matchSearch && matchTier
  })

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300'

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
        : 'text-gray-500 hover:text-gray-700'
    }`

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
          <Link href="/platform-admin/features"
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
            Feature Plans
          </Link>
          <Link href="/platform-admin/audit"
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
            Audit Log
          </Link>
          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-3 py-1 rounded-full">Platform Admin</span>
          <button onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors">
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center text-sm">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Platform-wide stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Schools</p>
              <p className="text-3xl font-black text-gray-900 mt-1">{stats.schools.total}</p>
              <p className="text-xs text-gray-400 mt-1">
                <span className="text-green-600 font-medium">{stats.schools.active} active</span>
                {stats.schools.inactive > 0 && ` · ${stats.schools.inactive} inactive`}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Teachers</p>
              <p className="text-3xl font-black text-gray-900 mt-1">{stats.teachers.total}</p>
              <p className="text-xs text-gray-400 mt-1">active across all schools</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Students</p>
              <p className="text-3xl font-black text-gray-900 mt-1">{stats.students.total}</p>
              <p className="text-xs text-gray-400 mt-1">enrolled across all schools</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Subscriptions</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {stats.subscriptions.premium > 0 && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                    {stats.subscriptions.premium} Premium
                  </span>
                )}
                {stats.subscriptions.standard > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {stats.subscriptions.standard} Standard
                  </span>
                )}
                {stats.subscriptions.basic > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    {stats.subscriptions.basic} Basic
                  </span>
                )}
                {stats.subscriptions.none > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                    {stats.subscriptions.none} No Plan
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Header + Add */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Schools</h2>
            <p className="text-gray-400 text-sm">{filtered.length} of {schools.length} shown</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Add School
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl mb-4 w-fit">
          <button onClick={() => switchTab('active')}   className={tabCls('active')}>Active Schools</button>
          <button onClick={() => switchTab('inactive')} className={tabCls('inactive')}>Inactive</button>
          <button onClick={() => switchTab('deleted')}  className={tabCls('deleted')}>Deleted</button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input type="text"
            placeholder={tab === 'deleted' ? 'Search deleted schools…' : 'Search by name, city, school code…'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white" />
          {tab !== 'deleted' && (
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700">
              <option value="all">All Plans</option>
              <option value="none">No Plan</option>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          )}
        </div>

        {/* Deleted tab notice */}
        {tab === 'deleted' && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
            Soft-deleted schools — all data is preserved. Use <strong>Restore</strong> to reactivate.
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading schools…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-lg">
                {search || filterTier !== 'all'
                  ? 'No schools match your filters'
                  : tab === 'deleted'   ? 'No deleted schools'
                  : tab === 'inactive' ? 'No inactive schools'
                  : 'No active schools yet'}
              </p>
              {!search && filterTier === 'all' && tab === 'active' && (
                <p className="text-gray-300 text-sm mt-1">Click &quot;Add School&quot; to register the first school</p>
              )}
            </div>
          ) : tab === 'deleted' ? (
            /* ── Deleted schools table ── */
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">School</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">School ID</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Staff / Students</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Deleted On</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(school => (
                  <tr key={school.id} className="hover:bg-red-50/30 transition-colors opacity-75">
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-gray-600 line-through">{school.name}</span>
                      <div className="text-gray-400 text-xs mt-0.5">{school.type}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      {school.school_code
                        ? <code className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-1 rounded font-mono">{school.school_code}</code>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">
                      <div><span className="font-medium">{school.teacher_count ?? '—'}</span> teachers</div>
                      <div><span className="font-medium">{school.student_count ?? '—'}</span> students</div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">
                      {school.deleted_at ? new Date(school.deleted_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Link href={`/platform-admin/schools/${school.id}`}
                          className="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
                          View Data
                        </Link>
                        <button onClick={() => handleRestore(school.id, school.name)}
                          className="text-xs px-2.5 py-1 rounded border border-green-200 hover:bg-green-50 text-green-600 font-medium transition-colors">
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* ── Active / Inactive schools table ── */
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">School</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">School ID</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Plan</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Staff / Students</th>
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
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${TIER_BADGE[school.tier || 'none']}`}>
                        {school.tier === 'none' || !school.tier ? 'No Plan' : school.tier}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">
                      <div><span className="font-medium text-gray-800">{school.teacher_count ?? '—'}</span> teachers</div>
                      <div><span className="font-medium text-gray-800">{school.student_count ?? '—'}</span> students</div>
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
                          className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                            school.status === 'active'
                              ? 'border-gray-200 hover:bg-gray-50 text-gray-600'
                              : 'border-green-200 hover:bg-green-50 text-green-600 font-medium'
                          }`}>
                          {school.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDelete(school.id, school.name)}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
                  <input type="text" required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
                <input type="text" required value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="India" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Email <span className="text-red-500">*</span> <span className="text-gray-400 font-normal text-xs">(login credentials sent here)</span>
                </label>
                <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@schoolname.edu" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210" className={inputCls} />
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
                  {submitting ? 'Creating…' : 'Create School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* School Created Credentials Modal */}
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
                School admin credentials have been generated. Copy and share them with the school.
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
                The school admin will be asked to change this password on first login.
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
