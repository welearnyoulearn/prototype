'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

type SchoolDetail = {
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
  tier?: string
  teacher_count?: number
  student_count?: number
  admin_email?: string
  admin_first_login?: boolean
}

type EditForm = {
  name: string; type: string; city: string; country: string
  phone: string; email: string; address: string; status: string
}

type Feature = { key: string; label: string; category: string }
type FeatureMatrix = Record<string, Record<string, boolean>>  // feature_key → { basic, standard, premium }

const TIER_META = [
  { key: 'none',     label: 'No Plan',  color: 'gray',   border: 'border-gray-200',   bg: 'bg-gray-50',   ring: 'ring-2 ring-gray-400',    dot: 'border-gray-500 bg-gray-500',     badge: 'bg-gray-100 text-gray-600',     bullet: 'bg-gray-400' },
  { key: 'basic',    label: 'Basic',    color: 'green',  border: 'border-green-300',  bg: 'bg-green-50',  ring: 'ring-2 ring-green-500',   dot: 'border-green-500 bg-green-500',   badge: 'bg-green-100 text-green-700',   bullet: 'bg-green-500' },
  { key: 'standard', label: 'Standard', color: 'blue',   border: 'border-blue-300',   bg: 'bg-blue-50',   ring: 'ring-2 ring-blue-500',    dot: 'border-blue-500 bg-blue-500',     badge: 'bg-blue-100 text-blue-700',     bullet: 'bg-blue-500' },
  { key: 'premium',  label: 'Premium',  color: 'purple', border: 'border-purple-300', bg: 'bg-purple-50', ring: 'ring-2 ring-purple-500',  dot: 'border-purple-500 bg-purple-500', badge: 'bg-purple-100 text-purple-700', bullet: 'bg-purple-500' },
]

export default function SchoolDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const schoolId = params.id as string

  const [school, setSchool]       = useState<SchoolDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // Feature plan config (from platform admin)
  const [features, setFeatures]   = useState<Feature[]>([])
  const [matrix, setMatrix]       = useState<FeatureMatrix>({})
  const [featLoading, setFeatLoading] = useState(true)

  // Subscription
  const [selectedTier, setSelectedTier] = useState<string>('none')
  const [savingSub, setSavingSub]       = useState(false)
  const [savedSub, setSavedSub]         = useState(false)
  const [tierPopup, setTierPopup]       = useState<{ tier: string; from: string } | null>(null)

  // Edit mode
  const [editing, setEditing]     = useState(false)
  const [editForm, setEditForm]   = useState<EditForm>({ name: '', type: '', city: '', country: '', phone: '', email: '', address: '', status: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  // Reset password
  const [resetting, setResetting]   = useState(false)
  const [resetCreds, setResetCreds] = useState<{ code: string; pass: string } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        await fetch('/api/init')
        const [schoolRes, featRes] = await Promise.all([
          fetch(`/api/schools/${schoolId}`),
          fetch('/api/platform/features'),
        ])
        const schoolData = await schoolRes.json()
        const featData   = await featRes.json()

        if (!schoolRes.ok) throw new Error(schoolData.error)

        setSchool(schoolData)
        setSelectedTier(schoolData.tier || 'none')
        setEditForm({
          name: schoolData.name || '', type: schoolData.type || 'Private',
          city: schoolData.city || '', country: schoolData.country || '',
          phone: schoolData.phone || '', email: schoolData.email || '',
          address: schoolData.address || '', status: schoolData.status || 'active',
        })

        if (featData.features) {
          setFeatures(featData.features)
          setMatrix(featData.matrix)
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load school')
      } finally {
        setLoading(false)
        setFeatLoading(false)
      }
    }
    load()
  }, [schoolId])

  async function handleSaveSub() {
    setSavingSub(true); setSavedSub(false); setError('')
    const prevTier = school?.tier || 'none'
    try {
      const res = await fetch(`/api/schools/${schoolId}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSchool(s => s ? { ...s, tier: data.tier } : s)
      setSavedSub(true)
      setTierPopup({ tier: selectedTier, from: prevTier })
      setTimeout(() => setSavedSub(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSavingSub(false) }
  }

  async function handleSaveEdit() {
    setSavingEdit(true); setError('')
    try {
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSchool(s => s ? { ...s, ...data } : s)
      setEditing(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally { setSavingEdit(false) }
  }

  async function handleResetPassword() {
    if (!confirm('Generate a new temporary password for this school admin?')) return
    setResetting(true); setError('')
    try {
      const res = await fetch('/api/platform/schools/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: parseInt(schoolId) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResetCreds({ code: data.school_code, pass: data.temp_password })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally { setResetting(false) }
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete "${school?.name}"?`)) return
    try {
      const res = await fetch(`/api/schools/${schoolId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.push('/platform-admin')
    } catch { setError('Failed to delete school') }
  }

  // Cumulative: Standard includes Basic features, Premium includes all
  const TIER_INCLUDES: Record<string, string[]> = {
    basic:    ['basic'],
    standard: ['basic', 'standard'],
    premium:  ['basic', 'standard', 'premium'],
  }

  function getFeaturesForTier(tierKey: string): string[] {
    if (tierKey === 'none') return []
    const tiers = TIER_INCLUDES[tierKey] ?? [tierKey]
    return features
      .filter(f => {
        const fMatrix = matrix[f.key]
        // No config row = new feature, enabled by default for all tiers
        if (!fMatrix) return true
        return tiers.some(t => fMatrix[t] !== false)
      })
      .map(f => f.label)
  }

  const inputCls   = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300'
  const hasChanged = school?.tier !== selectedTier
  const currentBadge = TIER_META.find(t => t.key === (school?.tier || 'none'))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </div>
    )
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 font-medium">School not found</p>
          <Link href="/platform-admin" className="text-purple-600 text-sm mt-2 block hover:underline">← Back</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/platform-admin" className="text-gray-400 hover:text-gray-600 text-sm">← Platform Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-medium text-sm">{school.name}</span>
        </div>
        <span className="bg-purple-100 text-purple-700 text-xs font-medium px-3 py-1 rounded-full">Platform Admin</span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* ── School Info Card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">School Info</h2>
            <div className="flex gap-2">
              {!editing ? (
                <button onClick={() => setEditing(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors">
                  Edit
                </button>
              ) : (
                <>
                  <button onClick={() => setEditing(false)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} disabled={savingEdit}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50">
                    {savingEdit ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">School Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                  <option>Private</option><option>Public</option><option>Charter</option><option>International</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <input type="text" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                <input type="text" value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <textarea value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} rows={2} className={`${inputCls} resize-none`} />
              </div>
            </div>
          ) : (
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xl flex-shrink-0">
                  {school.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-gray-900">{school.name}</h1>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${school.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {school.status}
                    </span>
                    {currentBadge && (
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${currentBadge.badge}`}>
                        {currentBadge.label}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-0.5">{[school.type, school.city, school.country].filter(Boolean).join(' · ')}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400">School ID</p>
                  <code className="text-xs font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded mt-0.5 block truncate">{school.school_code || '—'}</code>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Teachers</p>
                  <p className="font-bold text-gray-900 text-lg">{school.teacher_count ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Students</p>
                  <p className="font-bold text-gray-900 text-lg">{school.student_count ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Created</p>
                  <p className="text-sm text-gray-700 mt-0.5">{new Date(school.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>

              {(school.email || school.phone || school.address) && (
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                  {school.email && <div><p className="text-xs text-gray-400">Email</p><p className="text-sm text-gray-700 mt-0.5 truncate">{school.email}</p></div>}
                  {school.phone && <div><p className="text-xs text-gray-400">Phone</p><p className="text-sm text-gray-700 mt-0.5">{school.phone}</p></div>}
                  {school.address && <div><p className="text-xs text-gray-400">Address</p><p className="text-sm text-gray-700 mt-0.5 leading-snug">{school.address}</p></div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── School Admin Account ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">School Admin Account</h2>
              <p className="text-xs text-gray-400 mt-0.5">Login credentials and access control</p>
            </div>
            <button onClick={handleResetPassword} disabled={resetting}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50 font-medium">
              {resetting ? 'Resetting…' : 'Reset Password'}
            </button>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-gray-400 mb-1">Login ID (School Code)</p>
                <code className="text-sm font-mono text-purple-700 bg-purple-50 border border-purple-100 px-2 py-1 rounded block truncate">
                  {school.school_code || '—'}
                </code>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Admin Email</p>
                <p className="text-sm text-gray-800">{school.admin_email || <span className="text-gray-400">Not set</span>}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Account Status</p>
                {school.admin_first_login ? (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Awaiting First Login</span>
                ) : (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Active</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Subscription Plan ────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">Subscription Plan</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Features shown below are based on your{' '}
                <Link href="/platform-admin/features" className="text-purple-600 hover:underline">Feature Plan config</Link>.
                Changes take effect immediately.
              </p>
            </div>
          </div>

          <div className="px-6 py-5">
            {featLoading ? (
              <p className="text-gray-400 text-sm">Loading plan features…</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {TIER_META.map(tier => {
                  const tierFeatures = getFeaturesForTier(tier.key)
                  const isSelected   = selectedTier === tier.key

                  return (
                    <div
                      key={tier.key}
                      onClick={() => setSelectedTier(tier.key)}
                      className={`relative rounded-xl border-2 p-5 cursor-pointer transition-all hover:shadow-md
                        ${tier.bg} ${tier.border}
                        ${isSelected ? tier.ring : ''}`}
                    >
                      {/* Radio + label */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? tier.dot : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className="font-bold text-gray-900 text-base">{tier.label}</span>
                        {tier.key !== 'none' && (
                          <span className="ml-auto text-xs font-semibold text-gray-500">
                            {tierFeatures.length} feature{tierFeatures.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Feature list */}
                      {tier.key === 'none' ? (
                        <p className="text-xs text-gray-400 ml-7">No features — school admin cannot log in.</p>
                      ) : tierFeatures.length === 0 ? (
                        <p className="text-xs text-gray-400 ml-7 italic">
                          No features configured.{' '}
                          <Link href="/platform-admin/features" className="text-purple-600 hover:underline" onClick={e => e.stopPropagation()}>
                            Set up Feature Plans →
                          </Link>
                        </p>
                      ) : (
                        <ul className="ml-7 space-y-1 max-h-40 overflow-y-auto">
                          {tierFeatures.map(f => (
                            <li key={f} className="flex items-center gap-2 text-xs text-gray-700">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tier.bullet}`} />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-4 mt-5">
              <button onClick={handleSaveSub} disabled={savingSub || !hasChanged}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {savingSub ? 'Saving…' : 'Assign Plan'}
              </button>
              {savedSub && <span className="text-green-600 text-sm font-medium">✓ Plan assigned — school admin sidebar updated</span>}
              {!hasChanged && !savedSub && <span className="text-gray-400 text-sm">No changes</span>}
            </div>
          </div>
        </div>

        {/* ── Danger Zone ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 bg-red-50">
            <h2 className="font-semibold text-red-800">Danger Zone</h2>
            <p className="text-xs text-red-600 mt-0.5">Permanent — cannot be undone.</p>
          </div>
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Delete this school</p>
              <p className="text-xs text-gray-500 mt-0.5">Removes the school and all associated data — teachers, students, timetables, attendance records.</p>
            </div>
            <button onClick={handleDelete}
              className="ml-6 flex-shrink-0 text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors">
              Delete School
            </button>
          </div>
        </div>
      </div>

      {/* Reset Password Credentials Modal */}
      {resetCreds && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="bg-amber-500 px-6 py-5 rounded-t-2xl">
              <h3 className="text-white font-bold text-lg">New Credentials Generated</h3>
              <p className="text-amber-100 text-sm mt-0.5">Share these with the school admin</p>
            </div>
            <div className="px-6 py-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">School ID (Login)</p>
                  <code className="text-sm font-mono text-amber-900 bg-white border border-amber-200 rounded px-3 py-2 block">{resetCreds.code}</code>
                </div>
                <div>
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">New Temporary Password</p>
                  <code className="text-sm font-mono text-amber-900 bg-white border border-amber-200 rounded px-3 py-2 block">{resetCreds.pass}</code>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3 bg-gray-50 rounded-lg px-3 py-2">
                ⚠️ School admin will be forced to set a new password on next login.
              </p>
              <button onClick={() => setResetCreds(null)}
                className="w-full mt-4 bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tier Assignment Confirmation Popup ── */}
      {tierPopup && school && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            {(() => {
              const meta = TIER_META.find(t => t.key === tierPopup.tier) ?? TIER_META[0]
              const fromMeta = TIER_META.find(t => t.key === tierPopup.from) ?? TIER_META[0]
              const isUpgrade = ['none','basic','standard','premium'].indexOf(tierPopup.tier) > ['none','basic','standard','premium'].indexOf(tierPopup.from)
              return (
                <>
                  <div className={`${meta.bg} px-6 py-5 border-b ${meta.border}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${meta.bg} border-2 ${meta.border} flex items-center justify-center`}>
                        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-base">Plan {isUpgrade ? 'Upgraded' : 'Changed'}!</h3>
                        <p className="text-gray-500 text-xs">{school.name}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-5">
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <div className="text-center">
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${fromMeta.badge}`}>{fromMeta.label}</span>
                        <p className="text-xs text-gray-400 mt-1">Before</p>
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      <div className="text-center">
                        <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${meta.badge}`}>{meta.label}</span>
                        <p className="text-xs text-gray-400 mt-1">Now</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 text-center">
                      School admin will see updated features on next login.
                    </p>
                    <button onClick={() => setTierPopup(null)}
                      className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                      Done
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
