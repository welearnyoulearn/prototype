'use client'

import { useState } from 'react'
import { CalendarDays, Check, Link2, MapPin, MessageSquare, Pause, Pencil, Play, Plus, QrCode, Search, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DEFAULT_POSTER_QUOTE, FEEDBACK_ROLES, QR_POINT_KINDS,
  FeedbackRole, QrPointFormType, QrPointKind, qrPointFormLabel, formatFeedbackDate as formatPointDate,
} from '@/lib/feedback-defaults'
import { ROLE_VISUAL } from '@/app/feedback/[code]/roleVisuals'
import { useFeedbackFetch } from './useFeedbackFetch'
import PosterShareCard from './PosterShareCard'
import QrPointEditor, { type Draft } from './QrPointEditor'
import DeleteQrPointDialog from './DeleteQrPointDialog'
import { ClearFolderDialog } from './FolderMaintenance'

export interface QrPoint {
  id: number
  code: string
  kind: QrPointKind
  title: string
  venue: string | null
  event_date: string | null
  details: string | null
  form_type: QrPointFormType
  roles: FeedbackRole[]
  category_ids: number[]
  poster_quote: string | null
  closes_on: string | null
  is_active: boolean
  is_expired: boolean
  feedback_url: string
  response_count: number
  last_response_at: string | null
  archived_count: number // this folder's reviews sitting in the Archive (deleted with the folder)
  avg_rating: number | null
  open_issues: number
}

interface SchoolPosterSettings { school_name: string; poster_quote: string }

type StatusKey = 'active' | 'paused' | 'closed'
type Filter = 'all' | StatusKey

// One-click starting points for the most common QR codes — each opens the
// editor pre-filled (form + audience + kind), the admin just adds the details.
const QUICK_STARTS: { emoji: string; label: string; template: Partial<Draft> }[] = [
  { emoji: '🎉', label: 'Annual Day', template: { kind: 'event', title: 'Annual Day', form_type: 'event', roles: ['parent', 'student', 'teacher', 'visitor'] } },
  { emoji: '👨‍👩‍👧', label: 'PTM', template: { kind: 'event', title: 'Parent–Teacher Meeting', form_type: 'ptm', roles: ['parent'] } },
  { emoji: '👩‍🏫', label: 'Staff meeting', template: { kind: 'event', title: "Teachers' Meeting", form_type: 'staff_meeting', roles: ['teacher'] } },
  { emoji: '🍽️', label: 'Canteen', template: { kind: 'place', title: 'School Canteen', form_type: 'rating', roles: ['student', 'teacher'] } },
  { emoji: '🚌', label: 'School bus', template: { kind: 'place', title: 'School Bus', form_type: 'rating', roles: ['parent', 'student'] } },
  { emoji: '📚', label: 'Library', template: { kind: 'place', title: 'Library', form_type: 'rating', roles: ['student', 'teacher'] } },
]

const KIND_BANNER: Record<QrPointKind, string> = {
  event: 'linear-gradient(135deg, #fde7dc, #fbd3c1 55%, #f6b89e)',
  place: 'linear-gradient(135deg, #e3efe6, #cfe3d5 55%, #b5d3bf)',
}

const STATUS_STYLE: Record<StatusKey, { label: string; dot: string; pill: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500', pill: 'bg-white/80 text-emerald-700' },
  paused: { label: 'Paused', dot: 'bg-gray-400', pill: 'bg-white/80 text-gray-600' },
  closed: { label: 'Closed', dot: 'bg-rose-500', pill: 'bg-white/80 text-rose-600' },
}

function pointSubtitle(p: QrPoint): string {
  return [formatPointDate(p.event_date), p.venue].filter(Boolean).join('  ·  ')
}

function statusOf(p: QrPoint): StatusKey {
  if (!p.is_active) return 'paused'
  if (p.is_expired) return 'closed'
  return 'active'
}

// "Closes today" / "Closes in 3 days" / "Closed 2 days ago" from a YYYY-MM-DD date
function closingNote(p: QrPoint): string | null {
  if (!p.closes_on) return null
  const [y, m, d] = p.closes_on.split('-').map(Number)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000)
  if (days < 0) return `Closed ${-days} day${days === -1 ? '' : 's'} ago`
  if (days === 0) return 'Closes today'
  if (days === 1) return 'Closes tomorrow'
  return `Closes in ${days} days`
}

export default function FeedbackQrPointsTab({
  schoolId, points, loading, error, reload, onViewResponses,
}: {
  schoolId: number
  points: QrPoint[]
  loading: boolean
  error: string
  reload: () => void
  onViewResponses: (pointId: number) => void
}) {
  const { data: settings } = useFeedbackFetch<SchoolPosterSettings>(
    `/api/feedback/settings?school_id=${schoolId}`, [schoolId], 'Failed to load settings'
  )
  // undefined = closed, null = creating, QrPoint = editing
  const [editing, setEditing] = useState<QrPoint | null | undefined>(undefined)
  const [template, setTemplate] = useState<Partial<Draft> | undefined>(undefined)
  const [posterFor, setPosterFor] = useState<QrPoint | null>(null)
  const [deleting, setDeleting] = useState<QrPoint | null>(null)
  const [clearFor, setClearFor] = useState<QrPoint | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  function openCreate(t?: Partial<Draft>) {
    setTemplate(t)
    setEditing(null)
  }

  async function toggleActive(p: QrPoint) {
    setBusyId(p.id); setActionError('')
    try {
      const res = await fetch(`/api/feedback/qr-points/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !p.is_active }),
      })
      if (!res.ok) throw new Error()
      reload()
    } catch {
      setActionError('Failed to update — please try again')
    } finally {
      setBusyId(null)
    }
  }

  async function copyLink(p: QrPoint) {
    try {
      await navigator.clipboard.writeText(p.feedback_url)
      setCopiedId(p.id)
      setTimeout(() => setCopiedId(c => (c === p.id ? null : c)), 2000)
    } catch {
      setActionError('Copy failed — open "Poster & Share" to copy the link')
    }
  }

  const schoolName = settings?.school_name ?? ''
  const schoolQuote = settings?.poster_quote ?? DEFAULT_POSTER_QUOTE

  function shareMessage(p: QrPoint): string {
    const when = formatPointDate(p.event_date)
    const quote = p.poster_quote || schoolQuote
    return `${schoolName} would love your feedback on ${p.title}${when ? ` (${when})` : ''}!\n"${quote}"\n\nShare it here (no login needed): ${p.feedback_url}`
  }

  const counts: Record<Filter, number> = {
    all: points.length,
    active: points.filter(p => statusOf(p) === 'active').length,
    paused: points.filter(p => statusOf(p) === 'paused').length,
    closed: points.filter(p => statusOf(p) === 'closed').length,
  }
  const totalResponses = points.reduce((sum, p) => sum + p.response_count, 0)
  const totalIssues = points.reduce((sum, p) => sum + p.open_issues, 0)
  const q = query.trim().toLowerCase()
  const visible = points.filter(p =>
    (filter === 'all' || statusOf(p) === filter) &&
    (!q || p.title.toLowerCase().includes(q) || (p.venue ?? '').toLowerCase().includes(q))
  )

  return (
    <div data-testid="feedback-qr-points-tab" className="space-y-5">
      {/* Header + summary */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900">Event &amp; Place QR codes</h3>
          <p className="text-sm text-gray-500">Each gets its own poster, link and report — feedback stays separate from the school-wide QR.</p>
        </div>
        <button type="button" data-testid="feedback-new-qr-point-btn" onClick={() => openCreate()} className="inline-flex items-center gap-1.5 rounded-md bg-[#245b46] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#173e2f]">
          <Plus size={16} aria-hidden="true" />New QR code
        </button>
      </div>

      {points.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { emoji: '📍', value: points.length, label: 'QR codes' },
            { emoji: '🟢', value: counts.active, label: 'accepting feedback' },
            { emoji: '💬', value: totalResponses, label: 'responses' },
            { emoji: '🚨', value: totalIssues, label: 'open issues', alert: totalIssues > 0 },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border bg-white px-4 py-3 ${s.alert ? 'border-rose-200' : 'border-gray-200'}`}>
              <div className={`text-xl font-extrabold ${s.alert ? 'text-rose-600' : 'text-gray-900'}`}>{s.emoji} {s.value}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick start */}
      <div className="rounded-xl border border-dashed border-[#9bb7a4] bg-[#f5f7f3] p-3">
        <p className="mb-2 text-xs font-bold text-gray-600">⚡ Quick start — pick one and just add the date &amp; venue</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_STARTS.map(t => (
            <button
              key={t.label}
              type="button"
              data-testid={`feedback-qr-quickstart-${t.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              onClick={() => openCreate(t.template)}
              className="group inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:border-[#9bb7a4] hover:shadow-sm"
            >
              <span className="transition-transform group-hover:scale-125">{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {actionError && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{actionError}</div>}

      {loading && points.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-500">{error}</div>
      ) : points.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center" data-testid="feedback-qr-points-empty">
          <div className="text-5xl">🏷️</div>
          <p className="mt-3 text-base font-bold text-gray-900">No event or place QR codes yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">Make one for your next event or a busy spot on campus — print the poster, stick it up, and its feedback lands in its own folder.</p>
          <button type="button" onClick={() => openCreate()} className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[#245b46] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#173e2f]">
            <Plus size={16} aria-hidden="true" />Create your first QR code
          </button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter QR codes">
              {(['all', 'active', 'paused', 'closed'] as Filter[]).map(f => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  data-testid={`feedback-qr-filter-${f}`}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${filter === f ? 'bg-[#245b46] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {f === 'all' ? 'All' : STATUS_STYLE[f].label} <span className="opacity-70">{counts[f]}</span>
                </button>
              ))}
            </div>
            <label className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                data-testid="feedback-qr-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or venue"
                className="w-56 rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-[#245b46] focus:outline-none focus:ring-2 focus:ring-[#245b46]/20"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No QR codes match — try another filter or search.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map(p => {
                const status = statusOf(p)
                const st = STATUS_STYLE[status]
                const kind = QR_POINT_KINDS.find(k => k.key === p.kind)
                const closing = closingNote(p)
                return (
                  <div
                    key={p.id}
                    data-testid={`feedback-qr-point-card-${p.id}`}
                    className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-md ${status === 'active' ? '' : 'opacity-80'}`}
                  >
                    {/* Banner */}
                    <div className="flex items-start gap-3 px-4 pb-3 pt-4" style={{ background: KIND_BANNER[p.kind] }}>
                      <button
                        type="button"
                        onClick={() => setPosterFor(p)}
                        title="Open poster"
                        className="shrink-0 rounded-lg bg-white p-1 shadow-sm transition hover:scale-105"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/feedback/qr?school_id=${schoolId}&point_id=${p.id}`} alt="" className="h-14 w-14" loading="lazy" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700/80">{kind?.icon} {kind?.label}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}
                          </span>
                        </div>
                        <h4 className="mt-1 line-clamp-2 break-words text-base font-extrabold leading-snug text-gray-900" title={p.title}>{p.title}</h4>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
                      {/* Where & when */}
                      <div className="space-y-1 text-xs text-gray-600">
                        {p.event_date && <div className="flex items-center gap-1.5"><CalendarDays size={13} className="shrink-0 text-gray-400" aria-hidden="true" />{formatPointDate(p.event_date)}</div>}
                        {p.venue && <div className="flex min-w-0 items-center gap-1.5"><MapPin size={13} className="shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{p.venue}</span></div>}
                      </div>

                      {/* Form + audience */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-[#edf2eb] px-2 py-1 text-[11px] font-semibold text-[#173e2f]">{qrPointFormLabel(p.form_type)}</span>
                        {p.roles.map(r => {
                          const { Icon } = ROLE_VISUAL[r]
                          return (
                            <span key={r} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600">
                              <Icon size={12} aria-hidden="true" />{FEEDBACK_ROLES.find(x => x.key === r)?.label ?? r}
                            </span>
                          )
                        })}
                      </div>
                      {closing && (
                        <p className={`mt-2 text-[11px] font-semibold ${status === 'closed' ? 'text-rose-600' : 'text-amber-700'}`}>⏰ {closing}</p>
                      )}

                      {/* Stats */}
                      <div className="mt-3 grid grid-cols-3 divide-x divide-gray-100 rounded-lg bg-gray-50 py-2 text-center">
                        <div><div className="text-sm font-extrabold text-gray-900">💬 {p.response_count}</div><div className="text-[10px] text-gray-400">responses</div></div>
                        <div><div className="text-sm font-extrabold text-gray-900">⭐ {p.avg_rating != null ? p.avg_rating.toFixed(1) : '—'}</div><div className="text-[10px] text-gray-400">avg rating</div></div>
                        <div><div className={`text-sm font-extrabold ${p.open_issues > 0 ? 'text-rose-600' : 'text-gray-900'}`}>🚨 {p.open_issues}</div><div className="text-[10px] text-gray-400">open issues</div></div>
                      </div>

                      {/* Actions */}
                      <div className="mt-auto flex items-center gap-2 pt-4">
                        <button type="button" data-testid={`feedback-qr-point-poster-btn-${p.id}`} onClick={() => setPosterFor(p)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#245b46] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#173e2f]">
                          <QrCode size={14} aria-hidden="true" />Poster &amp; Share
                        </button>
                        <button type="button" data-testid={`feedback-qr-point-responses-btn-${p.id}`} onClick={() => onViewResponses(p.id)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#9bb7a4] py-2 text-xs font-semibold text-[#245b46] transition-colors hover:bg-[#edf2eb]">
                          <MessageSquare size={14} aria-hidden="true" />Responses{p.response_count > 0 ? ` (${p.response_count})` : ''}
                        </button>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => copyLink(p)} title={copiedId === p.id ? 'Copied!' : 'Copy link'} aria-label="Copy link" className="rounded-md border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800">
                            {copiedId === p.id ? <Check size={14} className="text-emerald-600" aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
                          </button>
                          <button type="button" data-testid={`feedback-qr-point-edit-btn-${p.id}`} onClick={() => setEditing(p)} title="Edit" aria-label="Edit" className="rounded-md border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800">
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            data-testid={`feedback-qr-point-toggle-btn-${p.id}`}
                            onClick={() => toggleActive(p)}
                            disabled={busyId === p.id}
                            title={p.is_active ? 'Pause — stop accepting feedback' : 'Resume'}
                            aria-label={p.is_active ? 'Pause' : 'Resume'}
                            className="rounded-md border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50"
                          >
                            {p.is_active ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            data-testid={`feedback-qr-point-delete-btn-${p.id}`}
                            onClick={() => setDeleting(p)}
                            title="Delete QR code and its feedback"
                            aria-label="Delete"
                            className="rounded-md border border-gray-200 p-2 text-gray-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {editing !== undefined && (
        <QrPointEditor
          schoolId={schoolId}
          point={editing}
          template={template}
          schoolQuote={schoolQuote}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); reload() }}
        />
      )}

      {deleting && (
        <DeleteQrPointDialog
          schoolId={schoolId}
          point={deleting}
          onClose={() => setDeleting(null)}
          onPauseInstead={() => { const p = deleting; setDeleting(null); toggleActive(p) }}
          onClearInstead={() => { setClearFor(deleting); setDeleting(null) }}
          onDeleted={() => { setDeleting(null); reload() }}
        />
      )}
      {clearFor && (
        <ClearFolderDialog
          schoolId={schoolId}
          source={String(clearFor.id)}
          folderName={`${QR_POINT_KINDS.find(k => k.key === clearFor.kind)?.icon ?? ''} ${clearFor.title}`}
          onClose={() => setClearFor(null)}
          onDone={() => { setClearFor(null); reload() }}
        />
      )}

      <Dialog open={!!posterFor} onOpenChange={open => !open && setPosterFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto" data-testid="feedback-qr-point-poster-dialog">
          {posterFor && (
            <>
              <DialogHeader><DialogTitle className="line-clamp-2 break-words">{posterFor.title} — QR poster</DialogTitle></DialogHeader>
              <p className="-mt-2 break-all text-xs text-gray-400" data-testid="feedback-qr-point-url">{posterFor.feedback_url}</p>
              <PosterShareCard
                testIdPrefix="feedback-qr-point"
                content={{
                  schoolName,
                  quote: posterFor.poster_quote || schoolQuote,
                  feedbackUrl: posterFor.feedback_url,
                  qrSrc: `/api/feedback/qr?school_id=${schoolId}&point_id=${posterFor.id}`,
                  event: {
                    title: posterFor.title,
                    subtitle: pointSubtitle(posterFor) || undefined,
                    details: posterFor.details || undefined,
                  },
                }}
                fileName={`feedback-qr-${posterFor.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'poster'}`}
                shareTitle={`${posterFor.title} — share your feedback with ${schoolName}`}
                shareMessage={shareMessage(posterFor)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
