'use client'

import { useEffect, useState } from 'react'
import { getBoardLabels } from '@/lib/board-syllabus/data'
import { useFeature } from '@/app/school-admin/features-context'

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
  board?: string
  upi_id?: string
}

const BOARDS = getBoardLabels()

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

type SubjectEntry = { name: string; periods_per_week: number }
type SubjectTemplate = {
  id: number; name: string; from_grade: number; to_grade: number; subjects: SubjectEntry[]
}

type StaffAccount = { id: number; full_name: string; email: string; role: string; status: string; first_login: boolean; created_at: string }
const ROLE_LABELS: Record<string, string> = { school_admin: 'School Admin', principal: 'Principal', vice_principal: 'Vice Principal' }
const ROLE_COLORS: Record<string, string> = { school_admin: 'bg-blue-100 text-blue-700', principal: 'bg-purple-100 text-purple-700', vice_principal: 'bg-indigo-100 text-indigo-700' }

export default function SchoolSettings({ schoolId }: { schoolId: number }) {
  const hasClassMgmt  = useFeature('class-management')
  const hasTimetable  = useFeature('timetable')
  const hasExams      = useFeature('exam-schedule')

  // Subjects tab needs class-management OR timetable; Grading needs exams
  const showSubjects  = hasClassMgmt || hasTimetable
  const showGrading   = hasExams

  type SettingsTab = 'profile' | 'grading' | 'subjects' | 'staff'
  const [tab, setTab] = useState<SettingsTab>('profile')
  const [data, setData]       = useState<SchoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  // Profile form
  const [profile, setProfile] = useState({
    name: '', type: '', city: '', country: '', phone: '', email: '', address: '', logo_url: '', board: '', upi_id: '',
  })

  // Grading scheme form
  const [scheme, setScheme]   = useState<GradeRow[]>(DEFAULT_GRADING)

  // Subject templates
  const [templates, setTemplates]       = useState<SubjectTemplate[]>([])
  const [tmplLoading, setTmplLoading]   = useState(false)

  // Staff accounts
  const [staffList, setStaffList]       = useState<StaffAccount[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffForm, setStaffForm]       = useState({ full_name: '', email: '', role: 'principal' })
  const [staffSaving, setStaffSaving]   = useState(false)
  const [staffError, setStaffError]     = useState('')
  const [staffSuccess, setStaffSuccess] = useState('')

  async function loadStaff() {
    setStaffLoading(true)
    try {
      const res = await fetch(`/api/school-admin/staff-accounts?school_id=${schoolId}`)
      if (res.ok) setStaffList(await res.json())
    } finally { setStaffLoading(false) }
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!staffForm.full_name.trim() || !staffForm.email.trim()) { setStaffError('Name and email are required'); return }
    setStaffSaving(true); setStaffError(''); setStaffSuccess('')
    const res = await fetch('/api/school-admin/staff-accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...staffForm, school_id: schoolId }),
    })
    const data = await res.json()
    if (!res.ok) { setStaffError(data.error || 'Failed'); setStaffSaving(false); return }
    setStaffList(prev => [...prev, data])
    setStaffForm({ full_name: '', email: '', role: 'principal' })
    setStaffSuccess(`✓ Account created — login credentials sent to ${data.email}`)
    setStaffSaving(false)
  }

  async function deactivateStaff(id: number) {
    if (!confirm('Deactivate this account? They will lose access.')) return
    await fetch('/api/school-admin/staff-accounts', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, status: 'inactive' } : s))
  }
  const [editingTmpl, setEditingTmpl]   = useState<SubjectTemplate | null>(null)
  const [newTmpl, setNewTmpl]           = useState({ name: '', from_grade: '1', to_grade: '5' })
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newSubjectPPW, setNewSubjectPPW]   = useState('4')
  const [showAddTmpl, setShowAddTmpl]   = useState(false)
  const [tmplMsg, setTmplMsg]           = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => { loadSchool() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'subjects') loadTemplates() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'staff') loadStaff() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTemplates() { setTemplates([]); setTmplLoading(false) }
  async function createTemplate() { alert('Subject templates not available in this version.') }
  async function saveTemplate(_tmpl: SubjectTemplate) { alert('Subject templates not available in this version.') }
  async function deleteTemplate(_id: number) { alert('Subject templates not available in this version.') }

  function addSubjectToTemplate(tmpl: SubjectTemplate) {
    const name = newSubjectName.trim()
    if (!name) return
    if (tmpl.subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setTmplMsg({ text: `"${name}" already in this template`, ok: false })
      return
    }
    const updated = { ...tmpl, subjects: [...tmpl.subjects, { name, periods_per_week: parseInt(newSubjectPPW) || 4 }] }
    setEditingTmpl(updated)
    setNewSubjectName('')
    setNewSubjectPPW('4')
  }

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
        board:    d.board ?? '',
        upi_id:   d.upi_id ?? '',
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
        body: JSON.stringify({ ...profile, board: profile.board || null, upi_id: profile.upi_id || null }),
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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {([
          { key: 'profile',  label: 'School Profile',  enabled: true },
          { key: 'grading',  label: 'Grading Scheme',  enabled: showGrading },
          { key: 'subjects', label: 'Default Subjects', enabled: showSubjects },
          { key: 'staff',    label: 'Staff Accounts',  enabled: true },
        ] as { key: SettingsTab; label: string; enabled: boolean }[]).map(({ key, label, enabled }) =>
          enabled ? (
            <button key={key} onClick={() => { setTab(key); setError(''); setStaffError(''); setStaffSuccess('') }}
              className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ) : (
            <div key={key} title={`Not available on your current plan`}
              className="px-5 py-1.5 rounded-md text-sm font-medium text-gray-300 cursor-not-allowed flex items-center gap-1.5 select-none">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {label}
            </div>
          )
        )}
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

          {/* Board / Curriculum */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Curriculum Board</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Select your board. HODs can load and publish the syllabus class-by-class from their dashboard.
              </p>
            </div>
            <div className="max-w-xs">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Board / Curriculum</label>
              <select
                value={profile.board}
                onChange={e => setProfile(f => ({ ...f, board: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— Select Board —</option>
                {BOARDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>

          {/* UPI Payment Settings */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Fee Payment — UPI ID</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Parents scan a QR code to pay fees. Set your school&apos;s UPI ID here so payments go to the correct account.
              </p>
            </div>
            <div className="max-w-sm">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">School UPI ID</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder="schoolname@upi or schoolname@ybl"
                value={profile.upi_id}
                onChange={e => setProfile(f => ({ ...f, upi_id: e.target.value.trim() }))}
              />
              <p className="text-xs text-gray-400 mt-1">Enter the UPI ID registered with your school&apos;s bank account</p>
            </div>
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
      {tab === 'grading' && !showGrading && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl py-12 text-center">
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-500 font-medium">Grading Scheme requires Exam Schedule</p>
          <p className="text-gray-400 text-sm mt-1">Enable the Exam Schedule feature in your plan to configure grading.</p>
        </div>
      )}
      {tab === 'grading' && showGrading && (
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

      {/* ── DEFAULT SUBJECTS TAB ───────────────────────────────────── */}
      {tab === 'subjects' && !showSubjects && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl py-12 text-center">
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-500 font-medium">Default Subjects requires Class Management or Timetable</p>
          <p className="text-gray-400 text-sm mt-1">Enable Class Management or Timetable in your plan to configure default subjects.</p>
        </div>
      )}
      {tab === 'subjects' && showSubjects && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Define subject sets for grade ranges. These are auto-applied when creating or managing classes.</p>
            </div>
            <button onClick={() => setShowAddTmpl(v => !v)}
              className="flex-shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
              + New Set
            </button>
          </div>

          {tmplMsg && (
            <div className={`px-4 py-3 rounded-xl text-sm border ${tmplMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
              {tmplMsg.text}
            </div>
          )}

          {/* New template form */}
          {showAddTmpl && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-indigo-800">New Subject Set</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs text-gray-500 mb-1">Set Name *</label>
                  <input value={newTmpl.name} onChange={e => setNewTmpl(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder='e.g. "Primary Subjects"' />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From Grade</label>
                  <select value={newTmpl.from_grade} onChange={e => setNewTmpl(f => ({ ...f, from_grade: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To Grade</label>
                  <select value={newTmpl.to_grade} onChange={e => setNewTmpl(f => ({ ...f, to_grade: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={createTemplate} disabled={!newTmpl.name.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  Create & Add Subjects
                </button>
                <button onClick={() => setShowAddTmpl(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {tmplLoading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl py-12 text-center">
              <p className="text-gray-400 font-medium">No subject sets yet</p>
              <p className="text-gray-300 text-sm mt-1">Create a set to auto-apply subjects when adding classes</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {templates.map(tmpl => {
                const isEditing = editingTmpl?.id === tmpl.id
                const current = isEditing ? editingTmpl! : tmpl
                return (
                  <div key={tmpl.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Template header */}
                    <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{tmpl.name}</p>
                          <p className="text-xs text-gray-400">Grade {tmpl.from_grade} – {tmpl.to_grade} · {tmpl.subjects.length} subjects</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingTmpl(isEditing ? null : { ...tmpl })}
                          className="text-xs px-3 py-1.5 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium transition-colors">
                          {isEditing ? 'Collapse' : 'Edit'}
                        </button>
                        <button onClick={() => deleteTemplate(tmpl.id)}
                          className="text-xs px-3 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg font-medium transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Subject list */}
                    {isEditing ? (
                      <div className="p-4 space-y-3">
                        {/* Existing subjects */}
                        <div className="space-y-1.5">
                          {current.subjects.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-3">No subjects yet. Add below.</p>
                          ) : current.subjects.map((s, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                <span className="text-sm font-medium text-gray-800">{s.name}</span>
                                <span className="text-xs text-gray-400">{s.periods_per_week}/week</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="number" min={1} max={12} value={s.periods_per_week}
                                  onChange={e => {
                                    const updated = { ...current, subjects: current.subjects.map((sub, i) => i === idx ? { ...sub, periods_per_week: parseInt(e.target.value) || 4 } : sub) }
                                    setEditingTmpl(updated)
                                  }}
                                  className="w-14 border border-gray-200 rounded px-2 py-0.5 text-xs text-center" />
                                <span className="text-xs text-gray-400">/wk</span>
                                <button onClick={() => setEditingTmpl({ ...current, subjects: current.subjects.filter((_, i) => i !== idx) })}
                                  className="text-red-300 hover:text-red-500 text-sm leading-none">✕</button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add subject row */}
                        <div className="flex gap-2 pt-1 border-t border-gray-100">
                          <input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubjectToTemplate(current) } }}
                            placeholder="Subject name (e.g. Mathematics)"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          <input type="number" min={1} max={12} value={newSubjectPPW} onChange={e => setNewSubjectPPW(e.target.value)}
                            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Periods" />
                          <button onClick={() => addSubjectToTemplate(current)} disabled={!newSubjectName.trim()}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                            Add
                          </button>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button onClick={() => saveTemplate(current)}
                            className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                            Save Template
                          </button>
                          <button onClick={() => setEditingTmpl(null)}
                            className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-5 py-3 flex flex-wrap gap-2">
                        {tmpl.subjects.length === 0 ? (
                          <p className="text-xs text-gray-400">No subjects — click Edit to add</p>
                        ) : tmpl.subjects.map((s, i) => (
                          <span key={i} className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-medium">
                            {s.name} <span className="text-indigo-400 font-normal">·{s.periods_per_week}/wk</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Staff Accounts Tab ─────────────────────────────────────────────── */}
      {tab === 'staff' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-bold text-gray-800">Staff Accounts</h3>
            <p className="text-sm text-gray-400 mt-0.5">Add Principal or Vice Principal — login credentials are emailed automatically</p>
          </div>

          {/* Existing staff list */}
          {staffLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="space-y-2">
              {staffList.length === 0 && <p className="text-sm text-gray-400">No staff accounts yet. Add one below.</p>}
              {staffList.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-600 text-sm font-bold">{(s.full_name || s.email).charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{s.full_name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[s.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[s.role] || s.role}
                      </span>
                      {s.first_login && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Awaiting first login</span>}
                      {s.status === 'inactive' && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Deactivated</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{s.email}</p>
                  </div>
                  {s.status === 'active' && (
                    <button onClick={() => deactivateStaff(s.id)}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded-lg transition-colors flex-shrink-0">
                      Deactivate
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add staff form */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Add Staff Account</p>
            {staffError && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{staffError}</div>}
            {staffSuccess && <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">{staffSuccess}</div>}
            <form onSubmit={handleAddStaff} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Full name *" value={staffForm.full_name} required
                  onChange={e => setStaffForm(f => ({ ...f, full_name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <input type="email" placeholder="Email address *" value={staffForm.email} required
                  onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div className="flex gap-3">
                <select value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="principal">Principal</option>
                  <option value="vice_principal">Vice Principal</option>
                  <option value="school_admin">School Administrator</option>
                </select>
                <button type="submit" disabled={staffSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap">
                  {staffSaving ? 'Sending…' : '+ Add & Send Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
