'use client'

import { useEffect, useState, Fragment } from 'react'
import { Star, Settings2, ChevronDown } from 'lucide-react'
import { FEEDBACK_CATEGORIES, feedbackCategoryLabel } from '@/lib/feedbackCategories'
import { FEEDBACK_FIELD_KEYS, FEEDBACK_FIELD_LABELS, DEFAULT_FEEDBACK_FIELD_CONFIG, type FeedbackFieldConfig, type FeedbackFieldKey } from '@/lib/feedbackFields'

type Feedback = {
  id: number; category: string | null; message: string; created_at: string
  name: string | null; phone: string | null; email: string | null
  rating: number | null; images: string[]
}
type ListResponse = { data: Feedback[]; limit: number; offset: number; total: number }

type Props = { schoolId: number }

const PAGE_SIZE = 20

// Fields the admin can toggle — Category included even though it's core to v1,
// since #99 lets it be turned off too. Message is deliberately excluded (see
// lib/feedbackFields.ts) and shown as a fixed row instead.
const CONFIGURABLE_KEYS = FEEDBACK_FIELD_KEYS

const CATEGORY_COLORS: Record<string, string> = {
  academics: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  facilities: 'bg-sky-50 text-sky-700 border-sky-200',
  staff: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  administration: 'bg-amber-50 text-amber-700 border-amber-200',
  safety: 'bg-rose-50 text-rose-700 border-rose-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function hasDetails(f: Feedback): boolean {
  return f.message.length > 160 || !!f.name || !!f.phone || !!f.email || !!f.rating || f.images.length > 0
}

export default function SchoolFeedback({ schoolId }: Props) {
  const [items, setItems] = useState<Feedback[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  const [showSettings, setShowSettings] = useState(false)
  const [fieldConfig, setFieldConfig] = useState<FeedbackFieldConfig>(DEFAULT_FEEDBACK_FIELD_CONFIG)
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  const feedbackLink = typeof window !== 'undefined' ? `${window.location.origin}/feedback/${schoolId}` : ''

  useEffect(() => { load() }, [schoolId, category, from, to, offset])
  useEffect(() => { loadConfig() }, [schoolId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ school_id: String(schoolId), limit: String(PAGE_SIZE), offset: String(offset) })
      if (category) params.set('category', category)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/feedback?${params.toString()}`)
      if (!res.ok) { setError('Failed to load feedback'); return }
      const data: ListResponse = await res.json()
      setItems(data.data)
      setTotal(data.total)
    } catch {
      setError('Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }

  async function loadConfig() {
    setConfigLoading(true)
    try {
      const res = await fetch(`/api/feedback/config?school_id=${schoolId}`)
      if (res.ok) setFieldConfig((await res.json()).field_config)
    } finally {
      setConfigLoading(false)
    }
  }

  function toggleFieldEnabled(key: FeedbackFieldKey) {
    setFieldConfig(prev => {
      const enabled = !prev[key].enabled
      return { ...prev, [key]: { enabled, required: enabled && prev[key].required } }
    })
  }

  function toggleFieldRequired(key: FeedbackFieldKey) {
    setFieldConfig(prev => ({ ...prev, [key]: { ...prev[key], required: !prev[key].required } }))
  }

  async function saveConfig() {
    setConfigSaving(true)
    try {
      const res = await fetch('/api/feedback/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, field_config: fieldConfig }),
      })
      if (res.ok) {
        setFieldConfig((await res.json()).field_config)
        setConfigSaved(true)
        setTimeout(() => setConfigSaved(false), 2000)
      }
    } finally {
      setConfigSaving(false)
    }
  }

  function updateCategory(value: string) { setCategory(value); setOffset(0) }
  function updateFrom(value: string) { setFrom(value); setOffset(0) }
  function updateTo(value: string) { setTo(value); setOffset(0) }
  function clearFilters() { setCategory(''); setFrom(''); setTo(''); setOffset(0) }

  function toggleExpanded(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function downloadQr() {
    const res = await fetch(`/api/feedback/qr?school_id=${schoolId}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'feedback-qr.png'
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyLink() {
    navigator.clipboard.writeText(feedbackLink).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">School Feedback</h2>
          <p className="text-sm text-gray-500 mt-0.5">Anonymous feedback collected from visitors via QR code or shared link.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(v => !v)}
          data-testid="feedback-settings-toggle-btn"
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
        >
          <Settings2 className="w-4 h-4" /> Form Settings
        </button>
      </div>

      {showSettings && (
        <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="feedback-settings-panel">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Customize the public form</h3>
          <p className="text-xs text-gray-500 mb-4">Choose which fields visitors see. Message is always shown and always required.</p>

          {configLoading ? (
            <div className="text-sm text-gray-400 py-4">Loading…</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                <span className="text-sm text-gray-700">Message</span>
                <span className="text-xs text-gray-400">Always required</span>
              </div>
              {CONFIGURABLE_KEYS.map(key => {
                const setting = fieldConfig[key]
                return (
                  <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                    <span className="text-sm text-gray-700">{FEEDBACK_FIELD_LABELS[key]}</span>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={setting.required}
                          disabled={!setting.enabled}
                          onChange={() => toggleFieldRequired(key)}
                          data-testid={`feedback-field-required-${key}`}
                          className="rounded disabled:opacity-30"
                        />
                        Required
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={setting.enabled}
                          onChange={() => toggleFieldEnabled(key)}
                          data-testid={`feedback-field-enabled-${key}`}
                          className="rounded"
                        />
                        Show on form
                      </label>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={configSaving}
                  data-testid="feedback-settings-save-btn"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                >
                  {configSaving ? 'Saving…' : 'Save Settings'}
                </button>
                {configSaved && <span className="text-sm text-emerald-600" data-testid="feedback-settings-saved">Saved</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col sm:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-2">
          <img
            src={`/api/feedback/qr?school_id=${schoolId}`}
            alt="Feedback QR code"
            data-testid="feedback-qr-image"
            className="w-32 h-32 border border-gray-200 rounded-lg"
          />
          <button
            type="button"
            onClick={downloadQr}
            data-testid="feedback-qr-download-btn"
            className="text-xs font-medium text-purple-700 hover:text-purple-800"
          >
            Download QR
          </button>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Shareable link</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={feedbackLink}
              data-testid="feedback-link-input"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 bg-gray-50"
            />
            <button
              type="button"
              onClick={copyLink}
              data-testid="feedback-copy-link-btn"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Print the QR code or share this link so visitors can leave feedback without logging in.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select
            value={category}
            onChange={e => updateCategory(e.target.value)}
            data-testid="feedback-filter-category"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {FEEDBACK_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={e => updateFrom(e.target.value)}
            data-testid="feedback-filter-from"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={e => updateTo(e.target.value)}
            data-testid="feedback-filter-to"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {(category || from || to) && (
          <button
            type="button"
            onClick={clearFilters}
            data-testid="feedback-filter-clear-btn"
            className="text-sm text-gray-500 hover:text-gray-700 pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-red-600" data-testid="feedback-list-error">
            {error} <button type="button" onClick={load} className="underline ml-1">Retry</button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400" data-testid="feedback-empty">
            No feedback yet. Share the QR code or link above to start collecting responses.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(f => {
                const isOpen = expanded.has(f.id)
                const showToggle = hasDetails(f)
                return (
                  <Fragment key={f.id}>
                    <tr data-testid={`feedback-row-${f.id}`}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 align-top">{fmtDate(f.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        {f.category ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.other}`}>
                            {feedbackCategoryLabel(f.category)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 align-top">
                        {isOpen ? f.message : (f.message.length > 160 ? `${f.message.slice(0, 160)}…` : f.message)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {showToggle && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(f.id)}
                            data-testid={`feedback-expand-${f.id}`}
                            className="text-gray-400 hover:text-gray-600"
                            aria-label="Show details"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (f.name || f.phone || f.email || f.rating || f.images.length > 0) && (
                      <tr>
                        <td colSpan={4} className="px-4 pb-4 pt-0">
                          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1.5" data-testid={`feedback-details-${f.id}`}>
                            {f.name && <div><span className="font-medium text-gray-500">Name:</span> {f.name}</div>}
                            {f.phone && <div><span className="font-medium text-gray-500">Phone:</span> {f.phone}</div>}
                            {f.email && <div><span className="font-medium text-gray-500">Email:</span> {f.email}</div>}
                            {!!f.rating && (
                              <div className="flex items-center gap-1">
                                <span className="font-medium text-gray-500">Rating:</span>
                                {[1, 2, 3, 4, 5].map(n => (
                                  <Star key={n} className={`w-3.5 h-3.5 ${n <= f.rating! ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-gray-300'}`} />
                                ))}
                              </div>
                            )}
                            {f.images.length > 0 && (
                              <div className="flex gap-2 pt-1">
                                {f.images.map(url => (
                                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt="Attached" className="w-14 h-14 object-cover rounded-md border border-gray-200" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              data-testid="feedback-prev-page"
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(o => o + PAGE_SIZE)}
              data-testid="feedback-next-page"
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
