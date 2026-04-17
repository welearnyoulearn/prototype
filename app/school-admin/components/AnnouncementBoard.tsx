'use client'

import { useEffect, useState } from 'react'

type Announcement = {
  id: number
  title: string
  content: string
  announcement_type: string
  target_audience: string
  priority: string
  created_by_name: string
  expires_at: string | null
  created_at: string
}

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  general:  { label: 'General',  color: 'text-gray-600',   bg: 'bg-gray-100' },
  circular: { label: 'Circular', color: 'text-blue-700',   bg: 'bg-blue-100' },
  event:    { label: 'Event',    color: 'text-purple-700', bg: 'bg-purple-100' },
  alert:    { label: 'Alert',    color: 'text-red-700',    bg: 'bg-red-100' },
}

const PRIORITY_META: Record<string, { label: string; color: string; dot: string; ring: string }> = {
  normal: { label: 'Normal', color: 'text-gray-500',   dot: 'bg-gray-400',   ring: 'border-gray-100' },
  high:   { label: 'High',   color: 'text-amber-600',  dot: 'bg-amber-400',  ring: 'border-amber-200' },
  urgent: { label: 'Urgent', color: 'text-red-600',    dot: 'bg-red-500',    ring: 'border-red-200' },
}

// All valid individual audience values
const AUDIENCE_OPTIONS = [
  { key: 'teachers', label: 'Teachers', icon: '👨‍🏫', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'students', label: 'Students', icon: '🎓', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { key: 'parents',  label: 'Parents',  icon: '👨‍👩‍👧', color: 'bg-violet-100 text-violet-700 border-violet-200' },
]

function audienceDisplay(raw: string): { label: string; color: string }[] {
  if (!raw || raw === 'all') return [{ label: 'Everyone', color: 'bg-indigo-100 text-indigo-700' }]
  return raw.split(',').map(a => {
    const opt = AUDIENCE_OPTIONS.find(o => o.key === a.trim())
    return opt
      ? { label: opt.label, color: opt.color }
      : { label: a, color: 'bg-gray-100 text-gray-600' }
  })
}

function AudiencePills({ raw }: { raw: string }) {
  const chips = audienceDisplay(raw)
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.color}`}>
          {c.label}
        </span>
      ))}
    </div>
  )
}

export default function AnnouncementBoard({ schoolId }: { schoolId: number }) {
  const [tab, setTab]             = useState<'list' | 'create' | 'tvmode'>('list')
  const [items, setItems]         = useState<Announcement[]>([])
  const [loading, setLoading]     = useState(true)
  const [deleting, setDeleting]   = useState<number | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [expanded, setExpanded]   = useState<number | null>(null)
  const [filterAudience, setFilterAudience] = useState<string>('all')

  // AI Draft state
  const [showAIDraft, setShowAIDraft] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiDrafting, setAiDrafting] = useState(false)
  const [aiDraftError, setAiDraftError] = useState('')

  // TV Mode state
  const [tokens, setTokens]       = useState<Array<{ id: number; token: string; label: string; last_used_at: string | null }>>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [tokenLabel, setTokenLabel] = useState('Main Display')
  const [generatingToken, setGeneratingToken] = useState(false)

  // Form state — target_audience as array
  const [form, setForm] = useState({
    title: '', content: '',
    announcement_type: 'general',
    target_audience: ['all'] as string[],
    priority: 'normal', expires_at: '',
  })

  useEffect(() => { load() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/announcements?school_id=${schoolId}`)
      const data = await r.json()
      setItems(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  function toggleAudience(key: string) {
    setForm(f => {
      if (key === 'all') return { ...f, target_audience: ['all'] }
      const current = f.target_audience.filter(a => a !== 'all')
      const next = current.includes(key)
        ? current.filter(a => a !== key)
        : [...current, key]
      return { ...f, target_audience: next.length === 0 ? ['all'] : next }
    })
  }

  async function draftWithAI() {
    if (!aiTopic.trim()) { setAiDraftError('Enter a topic first'); return }
    setAiDrafting(true)
    setAiDraftError('')
    try {
      const audience = form.target_audience.includes('all') ? 'everyone' : form.target_audience.join(', ')
      const res = await fetch('/api/ai/draft-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: form.announcement_type, topic: aiTopic.trim(), audience }),
      })
      const data = await res.json()
      if (data.error) { setAiDraftError(data.error); return }
      setForm(f => ({ ...f, title: data.title ?? f.title, content: data.content ?? f.content }))
      setShowAIDraft(false)
      setAiTopic('')
    } catch {
      setAiDraftError('Failed to generate. Try again.')
    } finally {
      setAiDrafting(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (form.target_audience.length === 0) {
      setError('Please select at least one audience'); return
    }
    setSaving(true)
    setError('')
    try {
      const target_audience = form.target_audience.includes('all')
        ? 'all'
        : form.target_audience.join(',')

      const r = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_audience, school_id: schoolId, created_by_name: 'Admin' }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error) }
      setSuccess('Announcement published successfully!')
      setForm({ title: '', content: '', announcement_type: 'general', target_audience: ['all'], priority: 'normal', expires_at: '' })
      setTab('list')
      await load()
      setTimeout(() => setSuccess(''), 4000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create announcement')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id)
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  function fmtDate(s: string) {
    return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Filter items by audience
  const filteredItems = filterAudience === 'all'
    ? items
    : items.filter(a => {
        if (a.target_audience === 'all') return true
        return a.target_audience.split(',').map(s => s.trim()).includes(filterAudience)
      })

  const urgentCount = items.filter(a => a.priority === 'urgent').length
  const highCount   = items.filter(a => a.priority === 'high').length

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Announcements & Circulars</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {items.length} active
            {urgentCount > 0 && <span className="ml-2 text-red-500 font-semibold">· {urgentCount} urgent</span>}
            {highCount > 0 && <span className="ml-2 text-amber-500 font-semibold">· {highCount} high priority</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setTab('list'); load() }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'list'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            All Announcements
          </button>
          <button onClick={() => setTab('create')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${tab === 'create'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Announcement
          </button>
          <button onClick={async () => {
            setTab('tvmode')
            setTokensLoading(true)
            const r = await fetch(`/api/display-token?school_id=${schoolId}`)
            setTokens(await r.json())
            setTokensLoading(false)
          }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${tab === 'tvmode'
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-200'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            📺 TV Mode
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {/* ── List View ── */}
      {tab === 'list' && (
        <div className="space-y-4">

          {/* Audience filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all',      label: 'All',      count: items.length },
              { key: 'teachers', label: 'Teachers', count: items.filter(a => a.target_audience === 'all' || a.target_audience.includes('teachers')).length },
              { key: 'students', label: 'Students', count: items.filter(a => a.target_audience === 'all' || a.target_audience.includes('students')).length },
              { key: 'parents',  label: 'Parents',  count: items.filter(a => a.target_audience === 'all' || a.target_audience.includes('parents')).length },
            ].map(f => (
              <button key={f.key} onClick={() => setFilterAudience(f.key)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  filterAudience === f.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {f.label}
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  filterAudience === f.key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {loading && (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-200 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2"><div className="h-4 bg-gray-200 rounded-full w-16" /><div className="h-4 bg-gray-100 rounded-full w-14" /></div>
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
            <div className="text-center py-20 bg-white border border-gray-100 rounded-2xl">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
              <p className="text-gray-600 font-semibold">No announcements found</p>
              <p className="text-gray-400 text-sm mt-1">
                {filterAudience !== 'all' ? `No announcements for ${filterAudience} yet.` : 'Click "+ New Announcement" to post one.'}
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            {filteredItems.map(a => {
              const pm = PRIORITY_META[a.priority] ?? PRIORITY_META.normal
              const tm = TYPE_META[a.announcement_type] ?? TYPE_META.general
              const isOpen = expanded === a.id
              const isUrgent = a.priority === 'urgent'
              const isHigh = a.priority === 'high'

              return (
                <div key={a.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${
                  isUrgent ? 'border-red-200' : isHigh ? 'border-amber-200' : 'border-gray-100'
                }`}>
                  <div
                    className="flex items-start gap-3.5 px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : a.id)}
                  >
                    {/* Priority indicator */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${pm.dot}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${tm.bg} ${tm.color}`}>
                          {tm.label}
                        </span>
                        <AudiencePills raw={a.target_audience} />
                        {a.priority !== 'normal' && (
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${pm.color}`}>
                            ● {pm.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                        <span className="font-medium text-gray-500">{a.created_by_name}</span>
                        <span>·</span>
                        <span>{fmtDate(a.created_at)}</span>
                        {a.expires_at && (
                          <>
                            <span>·</span>
                            <span className="text-amber-500">Expires {fmtDate(a.expires_at)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <svg className={`w-4 h-4 text-gray-300 flex-shrink-0 mt-1.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-gray-50">
                      <p className="text-sm text-gray-600 mt-4 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                      <div className="flex justify-end mt-4 pt-3 border-t border-gray-50">
                        <button
                          onClick={() => handleDelete(a.id)}
                          disabled={deleting === a.id}
                          className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-4 py-1.5 rounded-lg transition-all disabled:opacity-40 font-medium"
                        >
                          {deleting === a.id ? 'Deleting…' : '🗑 Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Create Form ── */}
      {tab === 'create' && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-50 bg-gradient-to-r from-indigo-50 to-white">
            <h3 className="text-base font-bold text-gray-900">New Announcement</h3>
            <p className="text-sm text-gray-500 mt-0.5">Post a notice visible to selected audience</p>
          </div>

          <div className="p-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* AI Draft Banner */}
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <span className="text-sm font-semibold text-violet-800">Draft with AI</span>
                  <span className="text-[10px] bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-medium">Gemini</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowAIDraft(v => !v); setAiDraftError('') }}
                  className="text-xs text-violet-600 hover:text-violet-800 font-semibold"
                >
                  {showAIDraft ? 'Cancel' : 'Use AI →'}
                </button>
              </div>
              {!showAIDraft && (
                <p className="text-xs text-violet-600">Describe your announcement topic and let AI write the title and content for you.</p>
              )}
              {showAIDraft && (
                <div className="space-y-2 mt-1">
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); draftWithAI() } }}
                    placeholder="e.g. School closed on Friday for sports day"
                    className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                    autoFocus
                  />
                  {aiDraftError && <p className="text-xs text-red-600">{aiDraftError}</p>}
                  <button
                    type="button"
                    onClick={draftWithAI}
                    disabled={aiDrafting || !aiTopic.trim()}
                    className="w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {aiDrafting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>✨ Generate Draft</>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Title *</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="e.g. School closed for Republic Day"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Content *</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                rows={5}
                placeholder="Write the full announcement here…"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                required
              />
            </div>

            {/* Audience — multi-select chips */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Send To *</label>
              <div className="flex flex-wrap gap-2">
                {/* All chip */}
                <button
                  type="button"
                  onClick={() => toggleAudience('all')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                    form.target_audience.includes('all')
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200'
                  }`}
                >
                  🌐 Everyone
                </button>
                {AUDIENCE_OPTIONS.map(opt => {
                  const selected = !form.target_audience.includes('all') && form.target_audience.includes(opt.key)
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleAudience(opt.key)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        selected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200'
                      }`}
                    >
                      {opt.icon} {opt.label}
                      {selected && (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {form.target_audience.includes('all')
                  ? 'This announcement will be visible to all teachers, students, and parents.'
                  : `Visible only to: ${form.target_audience.join(', ')}`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Type</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition-all"
                  value={form.announcement_type}
                  onChange={e => setForm(f => ({ ...f, announcement_type: e.target.value }))}
                >
                  <option value="general">📋 General</option>
                  <option value="circular">📄 Circular</option>
                  <option value="event">🎉 Event</option>
                  <option value="alert">🚨 Alert</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Priority</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition-all"
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                >
                  <option value="normal">Normal</option>
                  <option value="high">⚠ High</option>
                  <option value="urgent">🔴 Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Expiry Date (optional)</label>
              <input
                type="date"
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">Leave blank for no expiry</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60 shadow-sm shadow-indigo-200 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Publishing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    Publish Announcement
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab('list')}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── TV Mode ── */}
      {tab === 'tvmode' && (
        <div className="space-y-5">
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">📺</div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">TV / Kiosk Mode</h3>
                <p className="text-purple-200 text-sm mt-1">
                  Generate a public display URL for your school&apos;s TV or notice board. Shows live attendance, exams, announcements, and leaderboard — auto-rotating every 10 seconds.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <input
                type="text"
                placeholder="Label this display (e.g. Main Lobby, Staff Room)"
                value={tokenLabel}
                onChange={e => setTokenLabel(e.target.value)}
                className="flex-1 bg-white/20 backdrop-blur border border-white/30 text-white placeholder-purple-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              />
              <button
                disabled={generatingToken}
                onClick={async () => {
                  setGeneratingToken(true)
                  const r = await fetch('/api/display-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ school_id: schoolId, label: tokenLabel }),
                  })
                  const t = await r.json()
                  setTokens(prev => [t, ...prev])
                  setTokenLabel('Main Display')
                  setGeneratingToken(false)
                }}
                className="bg-white text-purple-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-purple-50 disabled:opacity-50 transition-all flex-shrink-0"
              >
                {generatingToken ? 'Generating…' : '+ Generate URL'}
              </button>
            </div>
          </div>

          {tokensLoading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading display tokens…</div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm">
              No display tokens yet. Generate one above to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map(t => {
                const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/display?token=${t.token}`
                return (
                  <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{t.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.last_used_at
                            ? `Last used: ${new Date(t.last_used_at).toLocaleString('en-IN')}`
                            : 'Not yet opened'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a href={url} target="_blank" rel="noreferrer"
                          className="text-xs bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 font-semibold transition-colors flex items-center gap-1">
                          Open ↗
                        </a>
                        <button
                          onClick={async () => { await navigator.clipboard.writeText(url) }}
                          className="text-xs border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                        >
                          Copy URL
                        </button>
                        <button
                          onClick={async () => {
                            await fetch(`/api/display-token?id=${t.id}`, { method: 'DELETE' })
                            setTokens(prev => prev.filter(x => x.id !== t.id))
                          }}
                          className="text-xs border border-red-200 text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 font-medium transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-mono text-gray-500 break-all">
                      {url}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
