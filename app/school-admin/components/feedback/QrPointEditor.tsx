'use client'

import { useState, type ReactNode } from 'react'
import { CalendarClock, Check, ClipboardList, Megaphone, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ADVANCED_FORM_TYPES, POSTER_QUOTE_MAX, QR_POINT_KINDS, QR_POINT_ROLES,
  FeedbackRole, QrPointFormType, QrPointKind,
} from '@/lib/feedback-defaults'
import { ROLE_VISUAL } from '@/app/feedback/[code]/roleVisuals'
import { useFeedbackFetch } from './useFeedbackFetch'
import QrFormPreview from './QrFormPreview'
import CategoryIcon from '@/app/feedback/[code]/CategoryIcon'
import type { QrPoint } from './FeedbackQrPointsTab'

interface Category { id: number; role: FeedbackRole; key: string; label: string; icon: string | null; department: string | null; is_active: boolean }

export interface Draft {
  kind: QrPointKind
  title: string
  venue: string
  event_date: string
  details: string
  form_type: QrPointFormType
  roles: FeedbackRole[]
  category_ids: number[]
  poster_quote: string
  closes_on: string
}

function draftFrom(point: QrPoint | null): Draft {
  return {
    kind: point?.kind ?? 'event',
    title: point?.title ?? '',
    venue: point?.venue ?? '',
    event_date: point?.event_date ?? '',
    details: point?.details ?? '',
    form_type: point?.form_type ?? 'rating',
    roles: point?.roles ?? ['parent'],
    category_ids: point?.category_ids ?? [],
    poster_quote: point?.poster_quote ?? '',
    closes_on: point?.closes_on ?? '',
  }
}

// Visual language matches the other admin create forms (see
// components/announcements/AnnouncementComposer.tsx): gradient tiles with a
// big emoji that lift on hover, solid brand-green pills for toggles, green
// focus rings and primary buttons.
const BRAND = '#245b46'

const KIND_TILES: Record<QrPointKind, { gradient: string; hint: string }> = {
  event: { gradient: 'linear-gradient(135deg, #fde7dc, #fbd3c1 55%, #f6b89e)', hint: 'Annual Day, PTM, Sports Day, Science Fair…' },
  place: { gradient: 'linear-gradient(135deg, #e3efe6, #cfe3d5 55%, #b5d3bf)', hint: 'Canteen, Library, Front Office, Bus #4…' },
}

const FORM_GRADIENT: Record<QrPointFormType, string> = {
  rating: 'linear-gradient(135deg, #fff4d6, #ffe9ad 55%, #ffd97a)',
  meeting: 'linear-gradient(135deg, #e2f0ee, #c9e4df 55%, #a9d3cb)',
  event: 'linear-gradient(135deg, #fde7dc, #fbd3c1 55%, #f6b89e)',
  exam: 'linear-gradient(135deg, #ebe8f7, #d9d3f0 55%, #c2b8e6)',
  academic: 'linear-gradient(135deg, #f3ecd9, #e9dcb8 55%, #dcc792)',
  ptm: 'linear-gradient(135deg, #fbe4ec, #f6cfdd 55%, #eeb3c8)',
  staff_meeting: 'linear-gradient(135deg, #e0ecf8, #c9ddf2 55%, #aac8ea)',
}

// audience: who each form is meant for — shown on its tile and used to
// pre-fill "Who can fill it" when the form is picked (still editable).
const FORM_OPTIONS: { key: QrPointFormType; icon: string; label: string; description: string; audience: FeedbackRole[] }[] = [
  { key: 'rating', icon: '⭐', label: 'Rating form', description: 'Emoji ratings on your categories + comments & voice note', audience: ['parent', 'student', 'teacher', 'visitor'] },
  ...ADVANCED_FORM_TYPES,
]

function audienceLabel(roles: FeedbackRole[]): string {
  if (roles.length >= QR_POINT_ROLES.length) return 'For everyone'
  const names = roles.map(r => `${QR_POINT_ROLES.find(x => x.key === r)?.label.toLowerCase()}s`)
  return `For ${names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0]}`
}

const inputCls = 'w-full rounded-md border border-gray-200 px-4 py-2.5 text-base sm:text-sm transition-colors focus:border-[#245b46] focus:outline-none focus:ring-2 focus:ring-[#245b46]/20'
const label = 'mb-1.5 block text-xs font-bold text-gray-600'
const pillCls = (on: boolean) =>
  `inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${on ? 'border-[#245b46] bg-[#245b46] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-[#9bb7a4]'}`

// Emoji tile used for both the kind and the form pickers; a check badge marks the choice.
function ChoiceTile({ selected, onClick, emoji, title, subtitle, gradient, testId, tag }: {
  selected: boolean; onClick: () => void; emoji: string; title: string; subtitle: string; gradient: string; testId: string; tag?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      onClick={onClick}
      className={`group relative flex h-full flex-col items-center rounded-md px-3 pb-3 pt-4 text-center text-gray-800 transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#245b46] ${selected ? 'shadow-md ring-2 ring-[#245b46] ring-offset-2' : 'opacity-90 hover:opacity-100'}`}
      style={{ background: gradient }}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: BRAND }}>
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      <div className="text-3xl leading-none transition-transform group-hover:scale-110">{emoji}</div>
      <p className="mt-2 text-sm font-extrabold leading-tight">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-gray-700/80">{subtitle}</p>
      {tag && <span className="mt-auto rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-gray-700" style={{ marginTop: 'auto' }}>{tag}</span>}
    </button>
  )
}

function Section({ step, icon, title, children }: { step: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: BRAND }}>{step}</span>
        <span className="text-[#245b46]">{icon}</span>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </section>
  )
}

// Create/edit dialog for an event/place QR point. `point` null = create.
export default function QrPointEditor({
  schoolId, point, template, schoolQuote, onClose, onSaved,
}: {
  schoolId: number
  point: QrPoint | null
  template?: Partial<Draft> // quick-start preset for a new QR (ignored when editing)
  schoolQuote: string // used on the poster when this point has no quote of its own
  onClose: () => void
  onSaved: () => void
}) {
  const [d, setD] = useState<Draft>(() => ({ ...draftFrom(point), ...(point ? {} : template) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { data: categories } = useFeedbackFetch<Category[]>(
    `/api/feedback/categories?school_id=${schoolId}`, [schoolId], 'Failed to load categories'
  )

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD(prev => ({ ...prev, [key]: value }))

  function toggleRole(role: FeedbackRole) {
    setD(prev => {
      const roles = prev.roles.includes(role) ? prev.roles.filter(r => r !== role) : [...prev.roles, role]
      // Drop pinned categories that belong to a role no longer allowed
      const allowed = new Set((categories ?? []).filter(c => roles.includes(c.role)).map(c => c.id))
      return { ...prev, roles, category_ids: prev.category_ids.filter(id => allowed.has(id)) }
    })
  }

  // Picking a form also sets the audience it's meant for (e.g. PTM → parents);
  // the admin can still change it in step 3.
  const [audienceNote, setAudienceNote] = useState('')
  function pickForm(key: QrPointFormType) {
    const opt = FORM_OPTIONS.find(f => f.key === key)
    setD(prev => {
      if (!opt || key === 'rating' || key === prev.form_type) return { ...prev, form_type: key }
      const roles = opt.audience.filter(r => QR_POINT_ROLES.some(x => x.key === r))
      return { ...prev, form_type: key, roles, category_ids: [] }
    })
    setAudienceNote(opt && key !== 'rating' ? `${audienceLabel(opt.audience).replace('For ', 'Audience set to ')} — change it below if needed.` : '')
  }

  function toggleCategory(id: number) {
    setD(prev => ({
      ...prev,
      category_ids: prev.category_ids.includes(id) ? prev.category_ids.filter(c => c !== id) : [...prev.category_ids, id],
    }))
  }

  async function save() {
    if (!d.title.trim()) { setError('Title is required'); return }
    if (d.roles.length === 0) { setError('Pick at least one audience'); return }
    setSaving(true); setError('')
    const body = {
      kind: d.kind,
      title: d.title.trim(),
      venue: d.venue.trim() || null,
      event_date: d.event_date || null,
      details: d.details.trim() || null,
      form_type: d.form_type,
      roles: d.roles,
      category_ids: d.form_type === 'rating' ? d.category_ids : [],
      poster_quote: d.poster_quote.trim() || null,
      closes_on: d.closes_on || null,
    }
    try {
      const res = await fetch(point ? `/api/feedback/qr-points/${point.id}` : '/api/feedback/qr-points', {
        method: point ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(point ? body : { school_id: schoolId, ...body }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to save — please try again')
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save — please try again')
    } finally {
      setSaving(false)
    }
  }

  const roleCategories = (categories ?? []).filter(c => c.is_active && d.roles.includes(c.role))
  const [showPreview, setShowPreview] = useState(true)
  const isEvent = d.kind === 'event'

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto p-0 sm:max-w-2xl" data-testid="feedback-qr-point-editor">
        <DialogHeader className="border-b border-gray-200 bg-[#f5f7f3] px-6 py-5">
          <DialogTitle>{point ? 'Edit QR code' : 'New event / place QR code'}</DialogTitle>
          <p className="text-sm text-gray-500">Gets its own poster, link and report — feedback stays separate from the school-wide QR.</p>
        </DialogHeader>

        <div className="space-y-7 px-6 pb-6">
          <Section step={1} icon={<Megaphone size={16} aria-hidden="true" />} title="What is this QR for?">
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="QR type">
              {QR_POINT_KINDS.map(k => (
                <ChoiceTile
                  key={k.key}
                  testId={`feedback-qr-point-kind-${k.key}`}
                  selected={d.kind === k.key}
                  onClick={() => set('kind', k.key)}
                  emoji={k.icon}
                  title={k.label}
                  subtitle={KIND_TILES[k.key].hint}
                  gradient={KIND_TILES[k.key].gradient}
                />
              ))}
            </div>

            <div>
              <label className={label} htmlFor="qr-point-title">{isEvent ? 'Event name' : 'Place name'} *</label>
              <input
                id="qr-point-title"
                data-testid="feedback-qr-point-title-input"
                value={d.title}
                maxLength={120}
                onChange={e => set('title', e.target.value)}
                placeholder={isEvent ? 'e.g. Annual Day 2026' : 'e.g. School Canteen'}
                className={inputCls}
              />
            </div>

            <div className={`grid grid-cols-1 gap-3 ${isEvent ? 'sm:grid-cols-2' : ''}`}>
              <div>
                <label className={label} htmlFor="qr-point-venue">{isEvent ? '📍 Venue' : '📍 Location detail'}</label>
                <input id="qr-point-venue" data-testid="feedback-qr-point-venue-input" value={d.venue} maxLength={120} onChange={e => set('venue', e.target.value)} placeholder={isEvent ? 'e.g. Main Ground' : 'e.g. Ground floor, Block B'} className={inputCls} />
              </div>
              {isEvent && (
                <div>
                  <label className={label} htmlFor="qr-point-date">🗓️ Event date</label>
                  <input id="qr-point-date" type="date" data-testid="feedback-qr-point-date-input" value={d.event_date} onChange={e => set('event_date', e.target.value)} className={inputCls} />
                </div>
              )}
            </div>

            <div>
              <label className={label} htmlFor="qr-point-details">📝 Details <span className="font-normal text-gray-400">— printed on the poster</span></label>
              <textarea id="qr-point-details" data-testid="feedback-qr-point-details-input" value={d.details} maxLength={300} rows={2} onChange={e => set('details', e.target.value)} placeholder={isEvent ? 'e.g. Tell us how the celebration was — performances, seating, food stalls' : 'e.g. Tell us about food quality, hygiene and service'} className={`${inputCls} resize-none`} />
            </div>

            <div>
              <label className={label} htmlFor="qr-point-quote">💬 Poster quote</label>
              <textarea
                id="qr-point-quote"
                data-testid="feedback-qr-point-quote-input"
                value={d.poster_quote}
                maxLength={POSTER_QUOTE_MAX}
                rows={2}
                onChange={e => set('poster_quote', e.target.value)}
                placeholder={schoolQuote}
                className={`${inputCls} resize-none italic`}
              />
              <div className="mt-1 flex justify-between gap-2 text-[11px] text-gray-400">
                <span>{d.poster_quote.trim() ? 'Shown in a highlighted box on the poster.' : 'Leave empty to use the school quote.'}</span>
                <span>{d.poster_quote.length}/{POSTER_QUOTE_MAX}</span>
              </div>
            </div>
          </Section>

          <Section step={2} icon={<ClipboardList size={16} aria-hidden="true" />} title="Which form should people fill?">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Form">
              {FORM_OPTIONS.map(f => (
                <ChoiceTile
                  key={f.key}
                  testId={`feedback-qr-point-form-${f.key}`}
                  selected={d.form_type === f.key}
                  onClick={() => pickForm(f.key)}
                  emoji={f.icon}
                  title={f.label}
                  subtitle={f.description}
                  gradient={FORM_GRADIENT[f.key]}
                  tag={audienceLabel(f.audience)}
                />
              ))}
            </div>
            {audienceNote && (
              <p className="border-l-2 border-[#245b46] bg-[#edf2eb] px-3 py-2 text-xs font-medium text-[#173e2f]">{audienceNote}</p>
            )}
            {showPreview ? (
              <>
                <QrFormPreview
                  formType={d.form_type}
                  roles={d.roles}
                  categories={roleCategories}
                  pinnedIds={d.category_ids}
                />
                <button type="button" onClick={() => setShowPreview(false)} className="text-xs font-semibold text-gray-500 hover:underline">Hide preview</button>
              </>
            ) : (
              <button type="button" data-testid="feedback-qr-point-show-preview-btn" onClick={() => setShowPreview(true)} className="text-xs font-semibold text-[#245b46] hover:underline">👁 Show preview of this form</button>
            )}
          </Section>

          <Section step={3} icon={<Users size={16} aria-hidden="true" />} title="Who can fill it?">
            <div className="flex flex-wrap gap-2">
              {QR_POINT_ROLES.map(r => {
                const on = d.roles.includes(r.key)
                const { Icon } = ROLE_VISUAL[r.key]
                return (
                  <button key={r.key} type="button" aria-pressed={on} data-testid={`feedback-qr-point-role-${r.key}`} onClick={() => toggleRole(r.key)} className={pillCls(on)}>
                    <Icon size={15} aria-hidden="true" />{r.label}
                  </button>
                )
              })}
            </div>
            {d.roles.length === 1 && (
              <p className="border-l-2 border-[#245b46] bg-[#edf2eb] px-3 py-2 text-xs font-medium text-[#173e2f]">
                Only one audience — people skip the &ldquo;I am a…&rdquo; step and go straight to the form.
              </p>
            )}

            {d.form_type === 'rating' && (
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-800">⭐ Categories to rate</p>
                <p className="mb-3 text-xs text-gray-500">
                  Tick what this QR should ask about, or leave all unticked to let people choose from every category for their role.
                </p>
                {roleCategories.length === 0 ? (
                  <p className="text-xs text-gray-400">No active categories for the chosen audience.</p>
                ) : (
                  <div className="space-y-3">
                    {d.roles.map(role => {
                      const cats = roleCategories.filter(c => c.role === role)
                      if (cats.length === 0) return null
                      return (
                        <div key={role}>
                          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{QR_POINT_ROLES.find(r => r.key === role)?.label}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {cats.map(c => {
                              const on = d.category_ids.includes(c.id)
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  aria-pressed={on}
                                  data-testid={`feedback-qr-point-category-${c.id}`}
                                  onClick={() => toggleCategory(c.id)}
                                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-[#245b46] bg-[#245b46] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-[#9bb7a4]'}`}
                                >
                                  <CategoryIcon icon={c.icon} size={18} />{c.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section step={4} icon={<CalendarClock size={16} aria-hidden="true" />} title="How long should it stay open?">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={label} htmlFor="qr-point-closes">Accept feedback until</label>
                <input id="qr-point-closes" type="date" data-testid="feedback-qr-point-closes-input" value={d.closes_on} onChange={e => set('closes_on', e.target.value)} className={`${inputCls} sm:w-52`} />
              </div>
              {d.closes_on && (
                <button type="button" onClick={() => set('closes_on', '')} className="pb-2.5 text-xs font-semibold text-gray-500 hover:underline">Clear — keep open</button>
              )}
            </div>
            <p className="text-xs text-gray-400">{d.closes_on ? 'After this date the QR shows “feedback is closed”.' : 'No end date — it stays open until you pause it.'}</p>
          </Section>

          {error && <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600" data-testid="feedback-qr-point-error">{error}</div>}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" data-testid="feedback-qr-point-save-btn" onClick={save} disabled={saving} className="rounded-md bg-[#245b46] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#173e2f] disabled:opacity-60">
              {saving ? 'Saving…' : point ? 'Save changes' : 'Create QR code'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
