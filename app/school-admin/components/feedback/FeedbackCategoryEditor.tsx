'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, Eye, EyeOff, Lightbulb, MapPin, Pencil, Plus, Smartphone } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { FeedbackRole, QR_POINT_ROLES } from '@/lib/feedback-defaults'
import { ROLE_VISUAL } from '@/app/feedback/[code]/roleVisuals'
import CategoryPickerStep from '@/app/feedback/[code]/steps/CategoryPickerStep'
import { useFeedbackFetch } from './useFeedbackFetch'
import type { QrPoint } from './FeedbackQrPointsTab'

interface Category {
  id: number
  role: FeedbackRole
  key: string
  label: string
  icon: string | null
  department: string | null
  is_active: boolean
  sort_order: number
  rating_count: number
  avg_rating: number | null
  open_issues: number
  last_rated_at: string | null
}

// Curated picker — school-relevant emojis that render well on every platform
const EMOJIS = [
  '📚', '📖', '✏️', '📝', '🎓', '👩‍🏫', '🧑‍🎓', '🏫', '🏛️', '🧪', '💻', '🎨',
  '🎵', '🏅', '⚽', '🏃', '🍽️', '🥗', '🚌', '🚗', '🛡️', '🧼', '🚻', '🩺',
  '📢', '💬', '🤝', '💳', '🧾', '📅', '⏰', '🌳', '💡', '🧰', '☕', '🛎️',
  '🧭', '🪑', '👕', '🎒', '😊', '⭐',
]

const DEFAULT_DEPARTMENTS = ['Academics', 'Administration', 'Facilities', 'Transport', 'Sports', 'IT', 'Security', 'Accounts']

// One-tap starting points per audience (skipped when a category with that name exists)
const IDEAS: Record<string, { label: string; icon: string; department: string }[]> = {
  parent: [
    { label: 'Safety & Security', icon: '🛡️', department: 'Security' },
    { label: 'Hygiene', icon: '🧼', department: 'Facilities' },
    { label: 'Fees & Admin', icon: '💳', department: 'Accounts' },
    { label: 'Sports', icon: '🏅', department: 'Sports' },
    { label: 'Homework', icon: '📝', department: 'Academics' },
    { label: 'Uniform & Books', icon: '👕', department: 'Administration' },
  ],
  student: [
    { label: 'Library', icon: '📚', department: 'Academics' },
    { label: 'Sports', icon: '🏅', department: 'Sports' },
    { label: 'Canteen', icon: '🍽️', department: 'Facilities' },
    { label: 'Washrooms', icon: '🚻', department: 'Facilities' },
    { label: 'Clubs & Activities', icon: '🎨', department: 'Academics' },
    { label: 'Homework Load', icon: '🎒', department: 'Academics' },
  ],
  teacher: [
    { label: 'Workload', icon: '⏰', department: 'Administration' },
    { label: 'Teaching Resources', icon: '🧰', department: 'Academics' },
    { label: 'Training', icon: '🎓', department: 'Academics' },
    { label: 'Staff Room', icon: '☕', department: 'Facilities' },
    { label: 'Technology', icon: '💻', department: 'IT' },
    { label: 'Management Support', icon: '🤝', department: 'Administration' },
  ],
  visitor: [
    { label: 'Reception', icon: '🛎️', department: 'Administration' },
    { label: 'Cleanliness', icon: '🧼', department: 'Facilities' },
    { label: 'Security Check', icon: '🛡️', department: 'Security' },
    { label: 'Directions & Signage', icon: '🧭', department: 'Facilities' },
    { label: 'Waiting Area', icon: '🪑', department: 'Facilities' },
    { label: 'Staff Courtesy', icon: '😊', department: 'Administration' },
  ],
}

function slugify(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  // Non-Latin names (e.g. Telugu/Hindi) slug to nothing — fall back to a unique key
  return (slug || `category-${Date.now().toString(36)}`).slice(0, 50)
}

function ratingTone(avg: number): string {
  if (avg >= 4) return 'bg-emerald-50 text-emerald-700'
  if (avg >= 3) return 'bg-amber-50 text-amber-700'
  return 'bg-rose-50 text-rose-700'
}

async function patchCategory(id: number, body: Record<string, unknown>) {
  const res = await fetch(`/api/feedback/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Could not save — please try again')
}

const inputCls = 'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm transition-colors focus:border-[#245b46] focus:outline-none focus:ring-2 focus:ring-[#245b46]/20'

function EmojiPicker({ value, onChange, testId }: { value: string; onChange: (e: string) => void; testId?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          aria-label="Choose an icon"
          className="flex h-10 w-12 shrink-0 items-center justify-center gap-0.5 rounded-md border border-gray-200 bg-white text-xl transition-colors hover:border-[#9bb7a4]"
        >
          {value || '🏷️'}<ChevronDown size={11} className="text-gray-400" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => { onChange(e); setOpen(false) }}
              className={`flex h-8 items-center justify-center rounded-md text-lg transition hover:scale-110 hover:bg-gray-100 ${value === e ? 'bg-[#edf2eb] ring-1 ring-[#245b46]' : ''}`}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function FeedbackCategoryEditor({ schoolId, points = [] }: { schoolId: number; points?: QrPoint[] }) {
  const [role, setRole] = useState<FeedbackRole>('parent')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ label: '', icon: '', department: '' })
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [add, setAdd] = useState({ label: '', icon: '🏷️', department: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [previewPicked, setPreviewPicked] = useState<string[]>([])

  const { data, loading, error: loadError, reload } = useFeedbackFetch<Category[]>(
    `/api/feedback/categories?school_id=${schoolId}`, [schoolId], 'Failed to load categories'
  )
  const all = useMemo(() => data ?? [], [data])
  const forRole = all.filter(c => c.role === role).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const live = forRole.filter(c => c.is_active)
  const hidden = forRole.filter(c => !c.is_active)
  const departments = useMemo(
    () => [...new Set([...DEFAULT_DEPARTMENTS, ...all.map(c => c.department).filter((d): d is string => !!d)])].sort(),
    [all]
  )
  const pinnedOn = (id: number) => points.filter(p => p.form_type === 'rating' && p.category_ids.includes(id))
  const ideas = (IDEAS[role] ?? []).filter(i => !forRole.some(c => c.label.toLowerCase() === i.label.toLowerCase()))
  const duplicate = !!add.label.trim() && forRole.some(c => c.label.toLowerCase() === add.label.trim().toLowerCase())

  async function run(id: number, fn: () => Promise<void>) {
    setBusyId(id); setError('')
    try { await fn(); reload() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') } finally { setBusyId(null) }
  }

  function startEdit(c: Category) {
    setEditingId(c.id)
    setDraft({ label: c.label, icon: c.icon ?? '', department: c.department ?? '' })
  }

  async function saveEdit(c: Category) {
    if (!draft.label.trim()) return
    await run(c.id, () => patchCategory(c.id, { label: draft.label.trim(), icon: draft.icon || undefined, department: draft.department.trim() }))
    setEditingId(null)
  }

  // Swap sort_order with the neighbour — two small PATCHes
  function move(c: Category, dir: -1 | 1) {
    const i = live.findIndex(x => x.id === c.id)
    const other = live[i + dir]
    if (!other) return
    const a = c.sort_order === other.sort_order ? i : c.sort_order
    const b = c.sort_order === other.sort_order ? i + dir : other.sort_order
    void run(c.id, async () => {
      await patchCategory(c.id, { sort_order: b })
      await patchCategory(other.id, { sort_order: a })
    })
  }

  async function addCategory() {
    const label = add.label.trim()
    if (!label || duplicate) return
    setAdding(true); setAddError('')
    try {
      const res = await fetch('/api/feedback/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, role, key: slugify(label), label, icon: add.icon || undefined, department: add.department.trim() || undefined }),
      })
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'Failed to add category') }
      setAdd({ label: '', icon: '🏷️', department: '' })
      reload()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add category')
    } finally {
      setAdding(false)
    }
  }

  const roleMeta = QR_POINT_ROLES.find(r => r.key === role)

  // Plain render function (not a nested component) so edit inputs keep focus while typing
  function renderRow(c: Category, index: number) {
    const pins = pinnedOn(c.id)
    const editing = editingId === c.id
    const busy = busyId === c.id
    return (
      <li
        key={c.id}
        data-testid={`feedback-category-row-${c.key}`}
        className={`rounded-xl border bg-white p-3 transition ${editing ? 'border-[#245b46] ring-2 ring-[#245b46]/15' : 'border-gray-200 hover:border-[#9bb7a4]'} ${c.is_active ? '' : 'opacity-70'}`}
      >
        {editing ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <EmojiPicker value={draft.icon} onChange={icon => setDraft(d => ({ ...d, icon }))} />
              <input value={draft.label} maxLength={100} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} className={inputCls} aria-label="Category name" autoFocus />
            </div>
            <div className="flex flex-wrap gap-2">
              <input list="feedback-departments" value={draft.department} maxLength={100} onChange={e => setDraft(d => ({ ...d, department: e.target.value }))} placeholder="Department (who handles issues)" className={`${inputCls} min-w-[180px] flex-1`} />
              <button type="button" onClick={() => setEditingId(null)} className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => saveEdit(c)} disabled={busy || !draft.label.trim()} className="inline-flex items-center gap-1 rounded-md bg-[#245b46] px-3 py-2 text-xs font-semibold text-white hover:bg-[#173e2f] disabled:opacity-50">
                <Check size={13} aria-hidden="true" />Save
              </button>
            </div>
            {c.rating_count > 0 && <p className="text-[11px] text-gray-400">Renaming only changes new feedback — past ratings keep the name they were given under.</p>}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {c.is_active && (
              <div className="flex shrink-0 flex-col">
                <button type="button" onClick={() => move(c, -1)} disabled={busy || index === 0} aria-label={`Move ${c.label} up`} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => move(c, 1)} disabled={busy || index === live.length - 1} aria-label={`Move ${c.label} down`} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"><ArrowDown size={13} /></button>
              </div>
            )}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f7f3] text-2xl">{c.icon || '🏷️'}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`truncate text-sm font-bold ${c.is_active ? 'text-gray-900' : 'text-gray-500'}`}>{c.label}</span>
                {c.department && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{c.department}</span>}
                {pins.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title={pins.map(p => p.title).join(', ')}>
                    <MapPin size={10} aria-hidden="true" />{pins.length === 1 ? pins[0].title : `${pins.length} QR codes`}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                {c.rating_count === 0 ? <span>No ratings yet</span> : (
                  <>
                    <span>💬 <b className="text-gray-700">{c.rating_count}</b> rating{c.rating_count === 1 ? '' : 's'}</span>
                    {c.avg_rating != null && <span className={`rounded px-1 font-bold ${ratingTone(c.avg_rating)}`}>⭐ {c.avg_rating.toFixed(1)}</span>}
                    {c.open_issues > 0 && <span className="font-semibold text-rose-700">🚨 {c.open_issues} open</span>}
                  </>
                )}
              </div>
            </div>
            <button type="button" onClick={() => startEdit(c)} aria-label={`Edit ${c.label}`} title="Edit" className="shrink-0 rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"><Pencil size={14} /></button>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-gray-500" title={c.is_active ? 'Shown on the form — click to hide' : 'Hidden — click to show on the form'}>
              <Switch
                data-testid={`feedback-category-toggle-${c.key}`}
                checked={c.is_active}
                disabled={busy}
                onCheckedChange={v => run(c.id, () => patchCategory(c.id, { is_active: v }))}
                className="data-[state=checked]:bg-[#245b46]"
              />
              <span className="w-10">{c.is_active ? 'Live' : 'Hidden'}</span>
            </label>
          </div>
        )}
      </li>
    )
  }

  return (
    <div data-testid="feedback-category-editor" className="space-y-5">
      <datalist id="feedback-departments">{departments.map(d => <option key={d} value={d} />)}</datalist>

      {/* Audience tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Audience" data-testid="feedback-categories-role-select">
        {QR_POINT_ROLES.map(r => {
          const Icon = ROLE_VISUAL[r.key].Icon
          const liveCount = all.filter(c => c.role === r.key && c.is_active).length
          const on = role === r.key
          return (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`feedback-categories-role-${r.key}`}
              onClick={() => { setRole(r.key); setEditingId(null); setPreviewPicked([]) }}
              className={`group inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${on ? 'border-[#245b46] bg-[#245b46] text-white shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-[#9bb7a4]'}`}
            >
              <Icon size={16} aria-hidden="true" />{r.label}s
              <span className={`rounded-full px-1.5 text-[11px] font-bold ${on ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{liveCount}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Manage */}
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-[#9bb7a4]/60 bg-[#f5f7f3] px-4 py-3 text-xs text-[#173e2f]">
            <b>{roleMeta?.icon} {roleMeta?.label}s</b> pick from these when they scan the school-wide QR, then rate each one 😭–🤩.
            A rating of 😭 or 😞 becomes an issue for the category&apos;s <b>department</b>. Use ▲▼ to set the order they see.
          </div>

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

          {loading && !data ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
          ) : loadError ? (
            <div className="py-10 text-center text-sm text-red-500">{loadError}</div>
          ) : (
            <>
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <Eye size={13} aria-hidden="true" />On the form <span className="font-semibold text-gray-400">· {live.length}</span>
                </h3>
                {live.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">No live categories — {roleMeta?.label.toLowerCase()}s would have nothing to rate. Add one below.</p>
                ) : (
                  <ul className="space-y-2">{live.map((c, i) => renderRow(c, i))}</ul>
                )}
              </section>

              {hidden.length > 0 && (
                <section>
                  {/* Styled like the "All folders" button and pulsed 3× (while collapsed)
                      so hidden categories aren't forgotten; key restarts it per audience */}
                  <button
                    key={`${role}-${showHidden}`}
                    type="button"
                    data-testid="feedback-categories-hidden-toggle"
                    aria-expanded={showHidden}
                    onClick={() => setShowHidden(v => !v)}
                    className={`mb-2 inline-flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-2 text-sm font-bold transition-colors ${
                      showHidden
                        ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        : 'anim-attention-pulse border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    <EyeOff size={15} aria-hidden="true" />
                    {hidden.length} hidden categor{hidden.length === 1 ? 'y' : 'ies'}
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs ${showHidden ? 'bg-gray-100 text-gray-600' : 'bg-white/80 text-amber-800'}`}>
                      {showHidden ? 'Hide list' : 'Show'}
                      <ChevronDown size={13} className={`transition-transform ${showHidden ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </span>
                  </button>
                  {!showHidden && <p className="-mt-1 mb-2 text-[11px] text-gray-500">Not shown to {roleMeta?.label.toLowerCase()}s — open to switch any back on.</p>}
                  {showHidden && <ul className="space-y-2">{hidden.map((c, i) => renderRow(c, i))}</ul>}
                </section>
              )}
            </>
          )}

          {/* Add */}
          <section className="rounded-xl border border-dashed border-[#9bb7a4] bg-white p-4" data-testid="feedback-add-category">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900"><Plus size={15} className="text-[#245b46]" aria-hidden="true" />Add a category for {roleMeta?.label.toLowerCase()}s</h3>
            <div className="flex flex-wrap gap-2">
              <EmojiPicker value={add.icon} onChange={icon => setAdd(a => ({ ...a, icon }))} testId="feedback-new-category-icon" />
              <input
                data-testid="feedback-new-category-label"
                value={add.label}
                maxLength={100}
                onChange={e => setAdd(a => ({ ...a, label: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') void addCategory() }}
                placeholder="Name, e.g. Library"
                className={`${inputCls} min-w-[160px] flex-1`}
              />
              <input
                data-testid="feedback-new-category-department"
                list="feedback-departments"
                value={add.department}
                maxLength={100}
                onChange={e => setAdd(a => ({ ...a, department: e.target.value }))}
                placeholder="Department (optional)"
                className={`${inputCls} min-w-[160px] flex-1`}
              />
              <button
                type="button"
                data-testid="feedback-add-category-btn"
                onClick={addCategory}
                disabled={adding || !add.label.trim() || duplicate}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#245b46] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#173e2f] disabled:opacity-40"
              >
                <Plus size={14} aria-hidden="true" />{adding ? 'Adding…' : 'Add'}
              </button>
            </div>
            <div className="mt-2 min-h-[20px] text-xs">
              {duplicate ? (
                <span className="font-semibold text-amber-700">&ldquo;{add.label.trim()}&rdquo; already exists for {roleMeta?.label.toLowerCase()}s{hidden.some(c => c.label.toLowerCase() === add.label.trim().toLowerCase()) ? ' (hidden — switch it back on above)' : ''}.</span>
              ) : add.label.trim() ? (
                <span className="text-gray-500">Will appear as <span className="ml-1 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-[#f5f7f3] px-2 py-0.5 font-semibold text-gray-800">{add.icon} {add.label.trim()}</span>{add.department.trim() && <> · issues go to <b>{add.department.trim()}</b></>}</span>
              ) : null}
              {addError && <span className="text-red-600">{addError}</span>}
            </div>

            {ideas.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Lightbulb size={12} aria-hidden="true" />Popular ideas — tap to fill in</p>
                <div className="flex flex-wrap gap-1.5">
                  {ideas.map(i => (
                    <button
                      key={i.label}
                      type="button"
                      onClick={() => setAdd({ label: i.label, icon: i.icon, department: i.department })}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:border-[#9bb7a4]"
                    >
                      {i.icon} {i.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-4 lg:self-start" data-testid="feedback-categories-preview">
          <div className="rounded-xl border border-gray-200 bg-[#f5f7f3] p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Smartphone size={16} className="text-[#245b46]" aria-hidden="true" />What {roleMeta?.label.toLowerCase()}s see
            </p>
            <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border-[6px] border-gray-800 bg-white shadow-lg">
              <div className="max-h-[520px] overflow-y-auto p-4">
                {live.length === 0 ? (
                  <p className="py-16 text-center text-xs text-gray-400">Nothing to pick yet.</p>
                ) : (
                  <CategoryPickerStep
                    role={role}
                    categories={live.map(c => ({ id: c.id, role: c.role, key: c.key, label: c.label, icon: c.icon, department: c.department }))}
                    selected={previewPicked}
                    onToggle={key => setPreviewPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]))}
                    onBack={() => {}}
                    onContinue={() => setPreviewPicked([])}
                  />
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-gray-400">Updates as you edit · tap to try it</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
