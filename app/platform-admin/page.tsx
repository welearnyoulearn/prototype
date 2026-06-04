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
  growth:        { this_month: number; last_month: number }
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

const TIER_LABEL: Record<string, string> = {
  basic: 'Basic', standard: 'Standard', premium: 'Premium', none: 'No Plan',
}

type Tab = 'active' | 'inactive' | 'deleted'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function isNewThisWeek(dateStr: string) {
  return Date.now() - new Date(dateStr).getTime() < 7 * 86400000
}

export default function PlatformAdmin() {
  const router = useRouter()
  const [tab, setTab]                     = useState<Tab>('active')
  const [schools, setSchools]             = useState<School[]>([])
  const [stats, setStats]                 = useState<PlatformStats | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [showModal, setShowModal]         = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [search, setSearch]               = useState('')
  const [filterTier, setFilterTier]       = useState<string>('all')
  const [highlightId, setHighlightId]     = useState<number | null>(null)
  const [createdSchool, setCreatedSchool] = useState<{ id: number; name: string; code: string; pass: string } | null>(null)

  // Admin team modal
  const [showAdminModal, setShowAdminModal]         = useState(false)
  const [adminList, setAdminList]                   = useState<{ id: number; full_name: string; email: string; status: string; created_at: string }[]>([])
  const [adminForm, setAdminForm]                   = useState({ full_name: '', email: '' })
  const [adminSubmitting, setAdminSubmitting]       = useState(false)
  const [adminError, setAdminError]                 = useState('')

  async function openAdminModal() {
    setShowAdminModal(true); setAdminError('')
    const res = await fetch('/api/platform/admins')
    if (res.ok) setAdminList(await res.json())
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (!adminForm.full_name.trim() || !adminForm.email.trim()) { setAdminError('Name and email required'); return }
    setAdminSubmitting(true); setAdminError('')
    const res = await fetch('/api/platform/admins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminForm),
    })
    const data = await res.json()
    if (!res.ok) { setAdminError(data.error || 'Failed'); setAdminSubmitting(false); return }
    setAdminList(prev => [...prev, data])
    setAdminForm({ full_name: '', email: '' })
    setAdminSubmitting(false)
  }

  const [form, setForm] = useState<FormData>({
    name: '', type: 'Private', city: '', country: '', phone: '', email: '', address: '',
  })

  const scopeForTab: Record<Tab, string> = {
    active: 'active', inactive: 'inactive', deleted: 'deleted',
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
    Promise.all([fetchSchools(tab), fetchStats()])
      .catch(() => setError('Cannot connect to database.'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to & highlight newly added school after credentials modal closes
  useEffect(() => {
    if (!highlightId) return
    const timer = setTimeout(() => {
      const el = document.getElementById(`school-row-${highlightId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    const clear = setTimeout(() => setHighlightId(null), 3500)
    return () => { clearTimeout(timer); clearTimeout(clear) }
  }, [highlightId])

  function switchTab(t: Tab) {
    setTab(t); setSearch(''); setFilterTier('all'); fetchSchools(t)
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
      setCreatedSchool({ id: data.id, name: data.name, code: data.school_code, pass: data.temp_password })
      setTab('active')
      fetchSchools('active')
      fetchStats()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create school')
    } finally { setSubmitting(false) }
  }

  function handleCredentialsDismiss() {
    if (createdSchool) setHighlightId(createdSchool.id)
    setCreatedSchool(null)
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

  // Derived analytics
  const noPlanCount = stats?.subscriptions.none ?? 0
  const paidCount   = stats ? (stats.subscriptions.basic + stats.subscriptions.standard + stats.subscriptions.premium) : 0

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300'

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
        : 'text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ── */}
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
        <div className="flex items-center gap-2">
          <button onClick={openAdminModal}
            className="text-xs text-purple-600 hover:text-purple-800 border border-purple-200 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors font-medium">
            👥 Admin Team
          </button>
          <Link href="/platform-admin/features"
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
            Feature Plans
          </Link>
          <Link href="/platform-admin/audit"
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
            Audit Log
          </Link>
          <button
            onClick={() => { fetchSchools(tab); fetchStats() }}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            title="Refresh data"
          >
            ↻ Refresh
          </button>
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

        {/* ── Platform-wide stats ── */}
        {stats && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

              {/* Active Schools */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Active Schools</p>
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900">{stats.schools.active}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {stats.growth.this_month > 0 ? (
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      +{stats.growth.this_month} this month
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">no new schools this month</span>
                  )}
                  {stats.schools.inactive > 0 &&
                    <span className="text-xs text-orange-500">{stats.schools.inactive} inactive</span>}
                </div>
              </div>

              {/* Paying schools */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">On Paid Plan</p>
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900">{paidCount}</p>
                <div className="mt-2 flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-gray-100">
                  {stats.subscriptions.premium > 0 && (
                    <div className="bg-purple-500" style={{ width: `${(stats.subscriptions.premium / Math.max(stats.schools.active, 1)) * 100}%` }} />
                  )}
                  {stats.subscriptions.standard > 0 && (
                    <div className="bg-blue-400" style={{ width: `${(stats.subscriptions.standard / Math.max(stats.schools.active, 1)) * 100}%` }} />
                  )}
                  {stats.subscriptions.basic > 0 && (
                    <div className="bg-green-400" style={{ width: `${(stats.subscriptions.basic / Math.max(stats.schools.active, 1)) * 100}%` }} />
                  )}
                </div>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {stats.subscriptions.premium > 0 &&
                    <span className="text-xs text-purple-600">{stats.subscriptions.premium} Premium</span>}
                  {stats.subscriptions.standard > 0 &&
                    <span className="text-xs text-blue-500">{stats.subscriptions.standard} Standard</span>}
                  {stats.subscriptions.basic > 0 &&
                    <span className="text-xs text-green-600">{stats.subscriptions.basic} Basic</span>}
                </div>
              </div>

              {/* Platform reach */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Platform Reach</p>
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900">
                  {(stats.teachers.total + stats.students.total).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">
                  <span className="text-gray-700 font-medium">{stats.teachers.total.toLocaleString()}</span> teachers
                  {' · '}
                  <span className="text-gray-700 font-medium">{stats.students.total.toLocaleString()}</span> students
                </p>
              </div>

              {/* No-plan pipeline */}
              <div className={`rounded-xl border p-5 ${noPlanCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className={`text-xs font-medium uppercase tracking-wide ${noPlanCount > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    No Plan Yet
                  </p>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${noPlanCount > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
                    <svg className={`w-4 h-4 ${noPlanCount > 0 ? 'text-amber-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className={`text-3xl font-black ${noPlanCount > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{noPlanCount}</p>
                <p className={`text-xs mt-1.5 ${noPlanCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {noPlanCount > 0 ? 'active schools awaiting plan assignment' : 'all active schools have a plan'}
                </p>
                {noPlanCount > 0 && (
                  <button
                    onClick={() => { setFilterTier('none'); setTab('active'); fetchSchools('active') }}
                    className="mt-2 text-xs text-amber-700 font-semibold underline hover:no-underline"
                  >
                    View & assign plans →
                  </button>
                )}
              </div>
            </div>

            {/* ── Needs-attention banner ── */}
            {stats.schools.inactive > 0 && (
              <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-orange-800">
                    <span className="font-semibold">{stats.schools.inactive} school{stats.schools.inactive !== 1 ? 's' : ''}</span> are inactive
                  </p>
                </div>
                <button onClick={() => switchTab('inactive')}
                  className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 px-3 py-1.5 rounded-lg font-medium transition-colors">
                  View Inactive →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Header + Add button ── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Schools</h2>
            <p className="text-gray-400 text-sm">{filtered.length} of {schools.length} shown</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add School
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl mb-4 w-fit">
          <button onClick={() => switchTab('active')} className={tabCls('active')}>
            Active Schools
            {stats && <span className="ml-1.5 text-gray-400 font-normal">({stats.schools.active})</span>}
          </button>
          <button onClick={() => switchTab('inactive')} className={tabCls('inactive')}>
            Inactive
            {stats?.schools.inactive ? (
              <span className="ml-1.5 text-orange-400 font-normal">({stats.schools.inactive})</span>
            ) : null}
          </button>
          <button onClick={() => switchTab('deleted')} className={tabCls('deleted')}>Deleted</button>
        </div>

        {/* ── Filters ── */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={tab === 'deleted' ? 'Search deleted schools…' : 'Search by name, city, school code…'}
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
            />
          </div>
          {tab !== 'deleted' && (
            <select
              value={filterTier} onChange={e => setFilterTier(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700"
            >
              <option value="all">All Plans</option>
              <option value="none">No Plan</option>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          )}
        </div>

        {tab === 'deleted' && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
            Soft-deleted schools — all data is preserved. Use <strong>Restore</strong> to reactivate.
          </div>
        )}

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Loading schools…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">
                {search || filterTier !== 'all'
                  ? 'No schools match your filters'
                  : tab === 'deleted'  ? 'No deleted schools'
                  : tab === 'inactive' ? 'No inactive schools'
                  : 'No active schools yet'}
              </p>
              {!search && filterTier === 'all' && tab === 'active' && (
                <p className="text-gray-400 text-sm mt-1">Click &quot;Add School&quot; to register the first school</p>
              )}
              {(search || filterTier !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setFilterTier('all') }}
                  className="mt-3 text-sm text-purple-600 hover:text-purple-800 underline"
                >
                  Clear filters
                </button>
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
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Joined</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(school => {
                  const isNew        = isNewThisWeek(school.created_at)
                  const isHighlighted = school.id === highlightId
                  return (
                    <tr
                      id={`school-row-${school.id}`}
                      key={school.id}
                      className={`transition-all duration-700 ${
                        isHighlighted
                          ? 'bg-green-50 outline outline-2 outline-green-300'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link href={`/platform-admin/schools/${school.id}`}
                            className="font-medium text-purple-700 hover:text-purple-900 hover:underline">
                            {school.name}
                          </Link>
                          {isNew && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">NEW</span>
                          )}
                        </div>
                        <div className="text-gray-400 text-xs mt-0.5">{school.type}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        {school.school_code ? (
                          <code className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded font-mono">
                            {school.school_code}
                          </code>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${TIER_BADGE[school.tier || 'none']}`}>
                          {TIER_LABEL[school.tier || 'none'] ?? school.tier}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-xs">
                        <div><span className="font-medium text-gray-800">{school.teacher_count ?? '—'}</span> teachers</div>
                        <div><span className="font-medium text-gray-800">{school.student_count ?? '—'}</span> students</div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-sm">
                        {[school.city, school.country].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                        {school.created_at ? timeAgo(school.created_at) : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          school.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {school.status}
                        </span>
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
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer summary */}
        {!loading && filtered.length > 0 && (
          <p className="mt-3 text-center text-xs text-gray-400">
            {filtered.length} school{filtered.length !== 1 ? 's' : ''}
            {(search || filterTier !== 'all') && ` — filtered from ${schools.length} total`}
          </p>
        )}
      </div>

      {/* ── Add School Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-semibold text-gray-900">Add New School</h3>
                <p className="text-xs text-gray-400 mt-0.5">School admin credentials will be generated automatically</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Name <span className="text-red-500">*</span>
                </label>
                <input type="text" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
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
                  <input type="text" required value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
                <select required value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  className={inputCls}>
                  <option value="">— Select country —</option>
                  <option value="India">India</option>
                  <option disabled>──────────</option>
                  <option value="Afghanistan">Afghanistan</option>
                  <option value="Australia">Australia</option>
                  <option value="Bangladesh">Bangladesh</option>
                  <option value="Bhutan">Bhutan</option>
                  <option value="Brazil">Brazil</option>
                  <option value="Canada">Canada</option>
                  <option value="China">China</option>
                  <option value="Egypt">Egypt</option>
                  <option value="Ethiopia">Ethiopia</option>
                  <option value="France">France</option>
                  <option value="Germany">Germany</option>
                  <option value="Ghana">Ghana</option>
                  <option value="Indonesia">Indonesia</option>
                  <option value="Iran">Iran</option>
                  <option value="Iraq">Iraq</option>
                  <option value="Japan">Japan</option>
                  <option value="Jordan">Jordan</option>
                  <option value="Kenya">Kenya</option>
                  <option value="Malaysia">Malaysia</option>
                  <option value="Maldives">Maldives</option>
                  <option value="Mexico">Mexico</option>
                  <option value="Morocco">Morocco</option>
                  <option value="Myanmar">Myanmar</option>
                  <option value="Nepal">Nepal</option>
                  <option value="Nigeria">Nigeria</option>
                  <option value="Pakistan">Pakistan</option>
                  <option value="Philippines">Philippines</option>
                  <option value="Qatar">Qatar</option>
                  <option value="Russia">Russia</option>
                  <option value="Saudi Arabia">Saudi Arabia</option>
                  <option value="Singapore">Singapore</option>
                  <option value="South Africa">South Africa</option>
                  <option value="South Korea">South Korea</option>
                  <option value="Sri Lanka">Sri Lanka</option>
                  <option value="Tanzania">Tanzania</option>
                  <option value="Thailand">Thailand</option>
                  <option value="Turkey">Turkey</option>
                  <option value="Uganda">Uganda</option>
                  <option value="Ukraine">Ukraine</option>
                  <option value="United Arab Emirates">United Arab Emirates</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="United States">United States</option>
                  <option value="Vietnam">Vietnam</option>
                  <option value="Zimbabwe">Zimbabwe</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Email <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal text-xs ml-1">(login credentials sent here)</span>
                </label>
                <input type="email" required value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="admin@schoolname.edu" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                <input type="tel" required value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Address <span className="text-red-500">*</span></label>
                <textarea required value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  rows={2} placeholder="Street, Area, City, State, PIN"
                  className={`${inputCls} resize-none`} />
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

      {/* ── School Created Credentials Modal ── */}
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
                  <code className="text-sm font-mono text-amber-900 bg-white border border-amber-200 rounded px-3 py-2 block">
                    {createdSchool.code}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">Temporary Password</p>
                  <code className="text-sm font-mono text-amber-900 bg-white border border-amber-200 rounded px-3 py-2 block">
                    {createdSchool.pass}
                  </code>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3 bg-gray-50 rounded-lg px-3 py-2">
                The school admin will be asked to change this password on first login.
              </p>
              <button
                onClick={handleCredentialsDismiss}
                className="w-full mt-4 bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Done — Go to school in list
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Team Modal ───────────────────────────────────────────────── */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Platform Admin Team</h2>
                <p className="text-xs text-gray-400 mt-0.5">Credentials are sent to their email automatically</p>
              </div>
              <button onClick={() => setShowAdminModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* Existing admins list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {adminList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No admins yet</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {adminList.map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-purple-600 text-sm font-bold">{(a.full_name || a.email).charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{a.full_name || '—'}</p>
                        <p className="text-xs text-gray-400 truncate">{a.email}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add admin form */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Invite New Admin</p>
                {adminError && (
                  <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{adminError}</div>
                )}
                <form onSubmit={handleAddAdmin} className="space-y-3">
                  <input
                    type="text" placeholder="Full name" value={adminForm.full_name}
                    onChange={e => setAdminForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                    required
                  />
                  <input
                    type="email" placeholder="Email address" value={adminForm.email}
                    onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                    required
                  />
                  <button type="submit" disabled={adminSubmitting}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                    {adminSubmitting ? 'Sending invite…' : 'Send Invite Email'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
