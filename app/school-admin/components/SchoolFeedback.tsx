'use client'

import { useEffect, useState } from 'react'
import { FEEDBACK_CATEGORIES, feedbackCategoryLabel } from '@/lib/feedbackCategories'

type Feedback = { id: number; category: string; message: string; created_at: string }
type ListResponse = { data: Feedback[]; limit: number; offset: number; total: number }

type Props = { schoolId: number }

const PAGE_SIZE = 20

const CATEGORY_COLORS: Record<string, string> = {
  academics: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  facilities: 'bg-sky-50 text-sky-700 border-sky-200',
  staff: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  administration: 'bg-amber-50 text-amber-700 border-amber-200',
  safety: 'bg-rose-50 text-rose-700 border-rose-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

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

  const feedbackLink = typeof window !== 'undefined' ? `${window.location.origin}/feedback/${schoolId}` : ''

  useEffect(() => { load() }, [schoolId, category, from, to, offset])

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
      <div>
        <h2 className="text-xl font-bold text-gray-900">School Feedback</h2>
        <p className="text-sm text-gray-500 mt-0.5">Anonymous feedback collected from visitors via QR code or shared link.</p>
      </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(f => {
                const isLong = f.message.length > 160
                const isOpen = expanded.has(f.id)
                return (
                  <tr key={f.id} data-testid={`feedback-row-${f.id}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtDate(f.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.other}`}>
                        {feedbackCategoryLabel(f.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {isLong && !isOpen ? `${f.message.slice(0, 160)}…` : f.message}
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(f.id)}
                          className="ml-2 text-purple-700 hover:text-purple-800 text-xs font-medium"
                        >
                          {isOpen ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </td>
                  </tr>
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
