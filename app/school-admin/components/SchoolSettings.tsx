'use client'

import { useEffect, useState } from 'react'

type SchoolData = {
  id: number
  name: string
  type: string
  city: string
  country: string
  phone: string
  email: string
  address: string
  logo_url: string
  school_code: string
  grading_scheme: GradeRow[]
}

type GradeRow = { grade: string; min: number; max: number }

const DEFAULT_GRADING: GradeRow[] = [
  { grade: 'A+', min: 90, max: 100 },
  { grade: 'A',  min: 80, max: 89  },
  { grade: 'B+', min: 70, max: 79  },
  { grade: 'B',  min: 60, max: 69  },
  { grade: 'C',  min: 50, max: 59  },
  { grade: 'D',  min: 35, max: 49  },
  { grade: 'F',  min: 0,  max: 34  },
]

export default function SchoolSettings({ schoolId }: { schoolId: number }) {
  const [tab, setTab]         = useState<'profile' | 'grading'>('profile')
  const [data, setData]       = useState<SchoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  // Profile form
  const [profile, setProfile] = useState({
    name: '', type: '', city: '', country: '', phone: '', email: '', address: '', logo_url: '',
  })

  // Grading scheme form
  const [scheme, setScheme]   = useState<GradeRow[]>(DEFAULT_GRADING)

  useEffect(() => { loadSchool() }, [schoolId])

  async function loadSchool() {
    setLoading(true)
    try {
      const r = await fetch(`/api/schools/${schoolId}`)
      if (!r.ok) throw new Error()
      const d: SchoolData = await r.json()
      setData(d)
      setProfile({
        name:     d.name ?? '',
        type:     d.type ?? '',
        city:     d.city ?? '',
        country:  d.country ?? '',
        phone:    d.phone ?? '',
        email:    d.email ?? '',
        address:  d.address ?? '',
        logo_url: d.logo_url ?? '',
      })
      if (d.grading_scheme && Array.isArray(d.grading_scheme) && d.grading_scheme.length > 0) {
        setScheme(d.grading_scheme)
      }
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const r = await fetch(`/api/schools/${schoolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function saveGrading(e: React.FormEvent) {
    e.preventDefault()
    // Validate: no overlaps, grades 0–100
    for (let i = 0; i < scheme.length; i++) {
      if (scheme[i].min > scheme[i].max) {
        setError(`Row ${i + 1}: min must be ≤ max`); return
      }
    }
    setSaving(true); setError(''); setSaved(false)
    try {
      const r = await fetch(`/api/schools/${schoolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grading_scheme: scheme }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save grading scheme')
    } finally {
      setSaving(false)
    }
  }

  function updateSchemeRow(idx: number, field: keyof GradeRow, value: string | number) {
    setScheme(prev => prev.map((r, i) => i === idx ? { ...r, [field]: field === 'grade' ? value : Number(value) } : r))
  }

  function addGradeRow() {
    setScheme(prev => [...prev, { grade: '', min: 0, max: 0 }])
  }

  function removeGradeRow(idx: number) {
    setScheme(prev => prev.filter((_, i) => i !== idx))
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading settings…</div>

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">School Settings</h2>
        <p className="text-sm text-gray-400 mt-0.5">Manage school profile, branding and grading scheme</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([['profile', 'School Profile'], ['grading', 'Grading Scheme']] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setError('') }}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {(saved || error) && (
        <div className={`px-4 py-3 rounded-xl text-sm border ${saved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
          {saved ? '✓ Settings saved successfully' : error}
        </div>
      )}

      {/* ── PROFILE TAB ───────────────────────────────────────────── */}
      {tab === 'profile' && (
        <form onSubmit={saveProfile} className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-5">

          {/* Logo preview */}
          {profile.logo_url && (
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.logo_url} alt="Logo" className="h-16 w-16 object-contain rounded-lg border border-gray-200 bg-white p-1" />
              <div>
                <p className="text-xs font-semibold text-gray-600">Current Logo</p>
                <p className="text-xs text-gray-400 mt-0.5 break-all max-w-xs">{profile.logo_url}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Logo URL</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://… (Cloudinary or any public image URL)"
              value={profile.logo_url}
              onChange={e => setProfile(f => ({ ...f, logo_url: e.target.value }))}
            />
            <p className="text-xs text-gray-400 mt-1">Upload via Cloudinary and paste the URL here</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">School Name *</label>
              <input required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={profile.name}
                onChange={e => setProfile(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">School Type</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={profile.type}
                onChange={e => setProfile(f => ({ ...f, type: e.target.value }))}
              >
                <option value="">Select type…</option>
                <option value="private">Private</option>
                <option value="government">Government</option>
                <option value="aided">Government-Aided</option>
                <option value="international">International</option>
                <option value="cbse">CBSE</option>
                <option value="icse">ICSE</option>
                <option value="state">State Board</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">City</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={profile.city}
                onChange={e => setProfile(f => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Country</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={profile.country}
                onChange={e => setProfile(f => ({ ...f, country: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Contact Phone</label>
              <input type="tel"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="+91 99999 99999"
                value={profile.phone}
                onChange={e => setProfile(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Official Email</label>
              <input type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="office@school.edu"
                value={profile.email}
                onChange={e => setProfile(f => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Address</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={2} placeholder="Full address…"
              value={profile.address}
              onChange={e => setProfile(f => ({ ...f, address: e.target.value }))}
            />
          </div>

          {/* Read-only info */}
          {data?.school_code && (
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs font-semibold text-blue-600 mb-0.5">School Login Code</p>
              <p className="font-mono text-lg font-bold text-blue-800">{data.school_code}</p>
              <p className="text-xs text-blue-500 mt-1">Teachers and admins use this code to log in</p>
            </div>
          )}

          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      )}

      {/* ── GRADING SCHEME TAB ─────────────────────────────────────── */}
      {tab === 'grading' && (
        <form onSubmit={saveGrading} className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Grading Scheme</h3>
              <p className="text-xs text-gray-400 mt-0.5">Used for report cards and exam result displays</p>
            </div>
            <button type="button" onClick={() => setScheme(DEFAULT_GRADING)}
              className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors">
              Reset to Default
            </button>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-100">
              {['Grade Label', 'Min Marks (%)', 'Max Marks (%)', ''].map(h => (
                <div key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500">{h}</div>
              ))}
            </div>
            <div className="divide-y divide-gray-50">
              {scheme.map((row, idx) => (
                <div key={idx} className="grid grid-cols-4 items-center px-4 py-2 gap-2">
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 w-20"
                    value={row.grade}
                    onChange={e => updateSchemeRow(idx, 'grade', e.target.value)}
                    placeholder="A+"
                    maxLength={4}
                  />
                  <input type="number" min={0} max={100}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 w-24"
                    value={row.min}
                    onChange={e => updateSchemeRow(idx, 'min', e.target.value)}
                  />
                  <input type="number" min={0} max={100}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 w-24"
                    value={row.max}
                    onChange={e => updateSchemeRow(idx, 'max', e.target.value)}
                  />
                  <button type="button" onClick={() => removeGradeRow(idx)}
                    className="text-red-400 hover:text-red-600 text-xs justify-self-start transition-colors">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={addGradeRow}
              className="px-4 py-2 border border-indigo-200 text-indigo-600 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors">
              + Add Grade
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Grading Scheme'}
            </button>
          </div>

          {/* Live preview */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3">Preview</p>
            <div className="flex gap-2 flex-wrap">
              {scheme.filter(r => r.grade).map((r, i) => (
                <div key={i} className="text-center min-w-[52px]">
                  <div className="text-sm font-bold text-indigo-700 bg-indigo-100 rounded-lg px-2 py-1">{r.grade}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{r.min}–{r.max}%</div>
                </div>
              ))}
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
