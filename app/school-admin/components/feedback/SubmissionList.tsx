'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { ADVANCED_FORM_TYPES, FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { ADVANCED_FORM_FIELDS } from '@/app/feedback/[code]/types'
import { ROLE_VISUAL } from '@/app/feedback/[code]/roleVisuals'
import { useFeedbackFetch } from './useFeedbackFetch'
import SubmissionDetailSheet from './SubmissionDetailSheet'
import {
  Mood, RATING_FACE, Submission, avgRating, dayGroup, exactTime, hasOpenIssue, moodOf, ratingTint, timeAgo,
} from './submissionUi'

interface SubmissionsResponse { data: Submission[]; total: number }

// The API caps a page at 200; everything below filters that page client-side.
const PAGE = 200

type MoodFilter = 'all' | Mood | 'forms'
type Sort = 'newest' | 'oldest' | 'lowest'

const MOOD_FILTERS: { key: MoodFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unhappy', label: '😞 Unhappy' },
  { key: 'neutral', label: '😐 Neutral' },
  { key: 'happy', label: '😊 Happy' },
  { key: 'forms', label: '📋 Form requests' },
]

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-[#245b46] bg-[#245b46] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-[#9bb7a4]'}`

function searchText(s: Submission): string {
  const form = s.advanced_form_data ? Object.values(s.advanced_form_data).join(' ') : ''
  return [s.submitter_name, s.free_text, s.quick_pick_tags, form, ...s.ratings.map(r => r.category_label)]
    .filter(Boolean).join(' ').toLowerCase()
}

// First two answers of an Advanced Form, as "🤝 Admin Office · ⚡ Urgent"
function formPreview(s: Submission): string {
  if (!s.advanced_form_type || !s.advanced_form_data) return ''
  return ADVANCED_FORM_FIELDS[s.advanced_form_type]
    .filter(f => s.advanced_form_data?.[f.key] && f.type !== 'textarea' && f.type !== 'date')
    .slice(0, 3)
    .map(f => {
      const v = s.advanced_form_data![f.key]
      return `${f.optionEmojis?.[v] ?? f.emoji} ${v}`
    })
    .join('  ·  ')
}

function formText(s: Submission): string | null {
  if (!s.advanced_form_type || !s.advanced_form_data) return null
  const f = ADVANCED_FORM_FIELDS[s.advanced_form_type].find(x => x.type === 'textarea' && s.advanced_form_data?.[x.key])
  return f ? s.advanced_form_data[f.key] : null
}

export default function SubmissionList({ schoolId, source }: { schoolId: number; source: string }) {
  const { data: response, loading, error, reload } = useFeedbackFetch<SubmissionsResponse>(
    `/api/feedback/submissions?school_id=${schoolId}&source=${source}&limit=${PAGE}`, [schoolId, source], 'Failed to load submissions'
  )
  const all = useMemo(() => response?.data ?? [], [response])
  const [role, setRole] = useState('all')
  const [mood, setMood] = useState<MoodFilter>('all')
  const [withComment, setWithComment] = useState(false)
  const [withVoice, setWithVoice] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [selected, setSelected] = useState<Submission | null>(null)

  // Folder-wide summary (over everything loaded, not the filtered view)
  const summary = useMemo(() => {
    const ratings = all.flatMap(s => s.ratings)
    const avg = ratings.length ? ratings.reduce((a, r) => a + r.rating, 0) / ratings.length : null
    const moods = { happy: 0, neutral: 0, unhappy: 0 }
    all.forEach(s => { const m = moodOf(s); if (m) moods[m]++ })
    return {
      avg,
      moods,
      rated: moods.happy + moods.neutral + moods.unhappy,
      forms: all.filter(s => s.advanced_form_type).length,
      comments: all.filter(s => s.free_text || formText(s)).length,
      voice: all.filter(s => s.has_voice).length,
      flagged: all.filter(hasOpenIssue).length,
    }
  }, [all])

  const roleCounts = useMemo(() => {
    const m = new Map<string, number>()
    all.forEach(s => m.set(s.role, (m.get(s.role) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all])

  const q = query.trim().toLowerCase()
  const filtered = all
    .filter(s => role === 'all' || s.role === role)
    .filter(s => mood === 'all' || (mood === 'forms' ? !!s.advanced_form_type : moodOf(s) === mood))
    .filter(s => !withComment || !!(s.free_text || formText(s)))
    .filter(s => !withVoice || s.has_voice)
    .filter(s => !q || searchText(s).includes(q))
    .sort((a, b) => {
      if (sort === 'lowest') return (avgRating(a) ?? 6) - (avgRating(b) ?? 6) || b.created_at.localeCompare(a.created_at)
      return sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)
    })

  // Date groups only make sense for date sorts
  const groups: { label: string; items: Submission[] }[] = []
  if (sort === 'lowest') groups.push({ label: 'Lowest rated first', items: filtered })
  else filtered.forEach(s => {
    const label = dayGroup(s.created_at)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(s)
    else groups.push({ label, items: [s] })
  })

  const filtersActive = role !== 'all' || mood !== 'all' || withComment || withVoice || !!q
  function clearFilters() { setRole('all'); setMood('all'); setWithComment(false); setWithVoice(false); setQuery('') }

  if (loading && !response) return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
  if (error) return (
    <div className="py-16 text-center text-sm text-red-500">
      {error}
      <button type="button" onClick={reload} className="mt-2 block w-full font-semibold text-[#245b46] hover:underline">Retry</button>
    </div>
  )
  if (all.length === 0) return (
    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-14 text-center" data-testid="feedback-submissions-empty">
      <div className="text-5xl">📭</div>
      <p className="mt-3 text-base font-bold text-gray-900">No feedback in this folder yet</p>
      <p className="mt-1 text-sm text-gray-500">Share the QR poster — new submissions will appear here.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="feedback-submissions-summary">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-xl font-extrabold text-gray-900">💬 {response?.total ?? all.length}</div>
          <div className="text-[11px] font-semibold text-gray-400">submissions{summary.forms ? ` · ${summary.forms} form${summary.forms === 1 ? '' : 's'}` : ''}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-xl font-extrabold text-gray-900">⭐ {summary.avg != null ? summary.avg.toFixed(1) : '—'}</div>
          <div className="text-[11px] font-semibold text-gray-400">average rating</div>
        </div>
        <div className="col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:col-span-1">
          {summary.rated === 0 ? <div className="pt-1 text-xs text-gray-400">No ratings yet</div> : (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${summary.moods.happy} happy, ${summary.moods.neutral} neutral, ${summary.moods.unhappy} unhappy`}>
                <div style={{ width: `${(summary.moods.happy / summary.rated) * 100}%` }} className="bg-emerald-600" />
                <div style={{ width: `${(summary.moods.neutral / summary.rated) * 100}%` }} className="border-x-2 border-white bg-gray-300" />
                <div style={{ width: `${(summary.moods.unhappy / summary.rated) * 100}%` }} className="bg-rose-600" />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-gray-500">
                <span>😊 {summary.moods.happy}</span><span>😐 {summary.moods.neutral}</span><span>😞 {summary.moods.unhappy}</span>
              </div>
            </>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-xl font-extrabold text-gray-900">📝 {summary.comments}</div>
          <div className="text-[11px] font-semibold text-gray-400">with comments{summary.voice ? ` · 🎙️ ${summary.voice}` : ''}</div>
        </div>
        <div className={`rounded-xl border bg-white px-4 py-3 ${summary.flagged ? 'border-rose-200' : 'border-gray-200'}`}>
          <div className={`text-xl font-extrabold ${summary.flagged ? 'text-rose-700' : 'text-gray-900'}`}>🚨 {summary.flagged}</div>
          <div className="text-[11px] font-semibold text-gray-400">need attention</div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2.5 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              data-testid="feedback-submissions-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search comments, names, categories, answers…"
              className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#245b46] focus:outline-none focus:ring-2 focus:ring-[#245b46]/20"
            />
          </label>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            data-testid="feedback-submissions-sort"
            aria-label="Sort"
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#245b46] focus:outline-none"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="lowest">Lowest rated first</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {MOOD_FILTERS.filter(f => f.key !== 'forms' || summary.forms > 0).map(f => (
            <button key={f.key} type="button" aria-pressed={mood === f.key} data-testid={`feedback-submissions-mood-${f.key}`} onClick={() => setMood(f.key)} className={chip(mood === f.key)}>{f.label}</button>
          ))}
          <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
          <button type="button" aria-pressed={withComment} onClick={() => setWithComment(v => !v)} className={chip(withComment)}>📝 Has comment</button>
          {summary.voice > 0 && <button type="button" aria-pressed={withVoice} onClick={() => setWithVoice(v => !v)} className={chip(withVoice)}>🎙️ Voice note</button>}
        </div>
        {roleCounts.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="feedback-submissions-role-filter">
            <button type="button" aria-pressed={role === 'all'} onClick={() => setRole('all')} className={chip(role === 'all')}>Everyone</button>
            {roleCounts.map(([r, n]) => {
              const Icon = ROLE_VISUAL[r as keyof typeof ROLE_VISUAL]?.Icon
              return (
                <button key={r} type="button" aria-pressed={role === r} data-testid={`feedback-submissions-role-${r}`} onClick={() => setRole(r)} className={chip(role === r)}>
                  {Icon && <Icon size={13} aria-hidden="true" />}{FEEDBACK_ROLES.find(x => x.key === r)?.label ?? r} <span className="opacity-70">{n}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Showing <b className="text-gray-800">{filtered.length}</b> of {all.length}
          {response && response.total > all.length && <> (latest {all.length} of {response.total})</>}
        </span>
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-semibold text-[#245b46] hover:underline">
            <X size={12} aria-hidden="true" />Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
          🔍 Nothing matches these filters.
        </div>
      ) : groups.map(g => (
        <section key={g.label}>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{g.label} <span className="font-semibold">· {g.items.length}</span></h4>
          <ul className="space-y-2">
            {g.items.map(s => <SubmissionCard key={s.id} s={s} onOpen={() => setSelected(s)} />)}
          </ul>
        </section>
      ))}

      <SubmissionDetailSheet submission={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function SubmissionCard({ s, onOpen }: { s: Submission; onOpen: () => void }) {
  const form = s.advanced_form_type ? ADVANCED_FORM_TYPES.find(t => t.key === s.advanced_form_type) : null
  const avg = avgRating(s)
  const role = FEEDBACK_ROLES.find(r => r.key === s.role)
  const RoleIcon = ROLE_VISUAL[s.role as keyof typeof ROLE_VISUAL]?.Icon
  const flagged = hasOpenIssue(s)
  const comment = s.free_text || formText(s)
  const name = s.is_anonymous ? 'Anonymous' : (s.submitter_name || 'Anonymous')

  return (
    <li>
      <button
        type="button"
        data-testid={`feedback-submission-row-${s.id}`}
        onClick={onOpen}
        className={`flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left transition hover:-translate-y-px hover:shadow-md ${flagged ? 'border-rose-200' : 'border-gray-200 hover:border-[#9bb7a4]'}`}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${avg != null ? ratingTint(avg).avatar : 'bg-violet-100'}`} aria-hidden="true">
          {form ? form.icon : avg != null ? RATING_FACE[Math.round(avg)].emoji : '💬'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-bold text-gray-900">{s.is_anonymous ? '🔒 ' : ''}{name}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600">
              {RoleIcon && <RoleIcon size={11} aria-hidden="true" />}{role?.label ?? s.role}
            </span>
            <span className="text-gray-400" title={exactTime(s.created_at)}>{timeAgo(s.created_at)}</span>
            {s.has_voice && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-700">🎙️ Voice</span>}
            {s.archived_at && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600">🗄️ from {s.qr_point_title ?? 'School-wide QR'}</span>}
            {flagged && <span className="rounded-md bg-rose-100 px-1.5 py-0.5 font-bold text-rose-700">🚨 Needs attention</span>}
          </div>

          {form ? (
            <div className="mt-2">
              <span className="text-sm font-bold text-gray-800">{form.label}</span>
              {formPreview(s) && <p className="mt-0.5 truncate text-xs text-gray-600">{formPreview(s)}</p>}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.ratings.map(r => (
                <span key={r.category_key} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${ratingTint(r.rating).chip}`} title={`${r.category_label}: ${RATING_FACE[r.rating].label}`}>
                  {RATING_FACE[r.rating].emoji}<span className="font-medium">{r.icon}</span>{r.category_label}
                </span>
              ))}
            </div>
          )}

          {comment && (
            <p className="mt-2 line-clamp-2 border-l-2 border-gray-200 pl-2.5 text-sm italic text-gray-600">&ldquo;{comment}&rdquo;</p>
          )}
          {s.quick_pick_tags && (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.quick_pick_tags.split(',').map(t => <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{t}</span>)}
            </div>
          )}
        </div>

        {avg != null && (
          <span className="shrink-0 text-right">
            <span className="block text-sm font-extrabold text-gray-900">⭐ {avg.toFixed(1)}</span>
            <span className="block text-[10px] text-gray-400">{s.ratings.length} rating{s.ratings.length === 1 ? '' : 's'}</span>
          </span>
        )}
      </button>
    </li>
  )
}
