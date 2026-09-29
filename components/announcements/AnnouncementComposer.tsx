'use client'

import { useEffect, useMemo, useState } from 'react'
import { ANNOUNCEMENT_TEMPLATES, fillTemplate, getTemplate, type AnnouncementTemplate, type TemplateCategory } from '@/lib/announcementTemplates'
import type { TargetClass } from '@/lib/announcements'
import GreetingCard from './GreetingCard'
import NoticeModal from './NoticeModal'
import type { NoticeItem } from './types'
import { CheckCircle2, Clock3, Eye, Globe2, GraduationCap, Pin, Save, Send, UserRound, UsersRound } from 'lucide-react'

export type ClassRow = { grade: string; section: string }

type Recipients = { teachers: number; students: number; parents: number; total: number }
type ClassSel = Record<string, { all: boolean; sections: string[] }>
type Trans = { te: { title: string; content: string }; hi: { title: string; content: string } }

const AUDIENCES = [
  { key: 'teachers', label: 'Teachers', icon: UserRound },
  { key: 'students', label: 'Students', icon: GraduationCap },
  { key: 'parents', label: 'Parents', icon: UsersRound },
] as const

const CATEGORY_LABEL: Record<TemplateCategory | 'blank', string> = { festival: 'Festivals', holiday: 'Holidays', school: 'School life', blank: 'Blank' }

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function gradeOrder(g: string): number {
  const order = ['Nursery', 'LKG', 'UKG']
  const i = order.indexOf(g)
  if (i !== -1) return i - 10
  const n = Number(g)
  return Number.isNaN(n) ? 999 : n
}

// Compose / edit an announcement: pick a template (festival cards, holiday notices…), write it, choose who
// gets it (roles + classes, with a live "reaches N people" count), schedule or save as draft, and see exactly
// how it will look to teachers, students and parents before sending.
export default function AnnouncementComposer({
  schoolId, schoolName, classes, initial, initialScheduled = false, onSaved, onCancel,
}: {
  schoolId: number
  schoolName: string
  classes: ClassRow[]
  initial?: NoticeItem | null
  // the notice being edited is scheduled for the future (decided by the caller, at click time)
  initialScheduled?: boolean
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const editing = !!initial
  const [templateKey, setTemplateKey] = useState<string | null>(initial?.template_key ?? null)
  const [chosen, setChosen] = useState(editing)          // template gallery is shown until something is chosen
  const [category, setCategory] = useState<TemplateCategory | 'blank'>('festival')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [headline, setHeadline] = useState(initial?.card_data?.headline ?? '')
  const [audience, setAudience] = useState<string[]>(!initial || initial.target_audience === 'all' ? ['all'] : initial.target_audience.split(',').map(s => s.trim()))
  const [classSel, setClassSel] = useState<ClassSel>(() => {
    const sel: ClassSel = {}
    for (const t of initial?.target_classes ?? []) {
      const cur = sel[t.grade] ?? { all: false, sections: [] }
      if (t.section === null) cur.all = true; else cur.sections.push(t.section)
      sel[t.grade] = cur
    }
    return sel
  })
  const [type, setType] = useState(initial?.announcement_type ?? 'general')
  const [priority, setPriority] = useState(initial?.priority ?? 'normal')
  const [pinned, setPinned] = useState(initial?.pinned ?? false)
  const [requiresAck, setRequiresAck] = useState(initial?.requires_ack ?? false)
  const [mode, setMode] = useState<'now' | 'schedule'>(initialScheduled && initial?.publish_at ? 'schedule' : 'now')
  const [publishAt, setPublishAt] = useState(initialScheduled ? toLocalInput(initial?.publish_at) : '')
  const [expires, setExpires] = useState(initial?.expires_at ? initial.expires_at.slice(0, 10) : '')
  const [trans, setTrans] = useState<Trans>({
    te: { title: initial?.translations?.te?.title ?? '', content: initial?.translations?.te?.content ?? '' },
    hi: { title: initial?.translations?.hi?.title ?? '', content: initial?.translations?.hi?.content ?? '' },
  })
  const [showTrans, setShowTrans] = useState(!!(initial?.translations?.te || initial?.translations?.hi))
  const [recipients, setRecipients] = useState<Recipients | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const template = getTemplate(templateKey)
  const audienceStored = audience.includes('all') || audience.length === 3 ? 'all' : audience.join(',')

  const grades = useMemo(() => Array.from(new Set(classes.map(c => c.grade))).sort((a, b) => gradeOrder(a) - gradeOrder(b)), [classes])
  const sectionsOf = (g: string) => classes.filter(c => c.grade === g).map(c => c.section).sort()

  const targetClasses: TargetClass[] | null = useMemo(() => {
    const out: TargetClass[] = []
    for (const g of Object.keys(classSel)) {
      const s = classSel[g]
      if (s.all) out.push({ grade: g, section: null })
      else for (const sec of s.sections) out.push({ grade: g, section: sec })
    }
    return out.length ? out : null
  }, [classSel])

  // Live "who will get this" count
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ school_id: String(schoolId), audience: audienceStored })
        if (targetClasses) q.set('classes', JSON.stringify(targetClasses))
        const r = await fetch(`/api/announcements/recipients?${q.toString()}`)
        setRecipients(r.ok ? await r.json() : null)
      } catch { setRecipients(null) }
    }, 250)
    return () => clearTimeout(t)
  }, [schoolId, audienceStored, targetClasses])

  function pickTemplate(t: AnnouncementTemplate | null) {
    setChosen(true)
    setTemplateKey(t?.key ?? null)
    if (!t) return
    setTitle(t.title)
    setHeadline(t.headline)
    setContent(fillTemplate(t.message, schoolName))
    setType(t.type)
    setPriority(t.priority)
    setRequiresAck(!!t.requiresAck)
  }

  function toggleAudience(key: string) {
    setAudience(prev => {
      if (key === 'all') return ['all']
      const cur = prev.filter(a => a !== 'all')
      const next = cur.includes(key) ? cur.filter(a => a !== key) : [...cur, key]
      return next.length === 0 ? ['all'] : next
    })
  }

  function toggleGrade(g: string) {
    setClassSel(prev => {
      const next = { ...prev }
      if (next[g]) delete next[g]; else next[g] = { all: true, sections: [] }
      return next
    })
  }
  function toggleSection(g: string, sec: string) {
    setClassSel(prev => {
      const cur = prev[g] ?? { all: false, sections: [] }
      const secs = cur.all ? sectionsOf(g).filter(x => x !== sec) : cur.sections.includes(sec) ? cur.sections.filter(x => x !== sec) : [...cur.sections, sec]
      const next = { ...prev }
      if (secs.length === 0) delete next[g]
      else if (secs.length === sectionsOf(g).length) next[g] = { all: true, sections: [] }
      else next[g] = { all: false, sections: secs }
      return next
    })
  }

  // What recipients will see, as a notice item (used by the preview and the pop-up preview)
  const previewItem: NoticeItem = {
    id: -1, title: title || 'Your title', content: content || 'Your message…', announcement_type: type, target_audience: audienceStored,
    priority, created_by_name: 'You', expires_at: expires || null, created_at: new Date().toISOString(), pinned, requires_ack: requiresAck,
    template_key: templateKey, card_data: templateKey && headline ? { headline } : null, target_classes: targetClasses, translations: null, seen: false, acked: false,
  }

  async function save(kind: 'publish' | 'draft' | 'save') {
    setError('')
    if (!title.trim() || !content.trim()) { setError('Add a title and a message'); return }
    if (mode === 'schedule' && kind !== 'draft' && !publishAt) { setError('Pick the date and time to publish'); return }
    if (mode === 'schedule' && kind !== 'draft' && new Date(publishAt).getTime() <= Date.now()) { setError('The scheduled time must be in the future'); return }
    const translations: Record<string, { title?: string; content?: string }> = {}
    for (const l of ['te', 'hi'] as const) {
      if (trans[l].title.trim() || trans[l].content.trim()) translations[l] = { title: trans[l].title.trim() || undefined, content: trans[l].content.trim() || undefined }
    }
    const body = {
      title: title.trim(), content: content.trim(),
      announcement_type: type, priority, target_audience: audienceStored,
      pinned, requires_ack: requiresAck,
      template_key: templateKey, card_data: templateKey && headline.trim() ? { headline: headline.trim() } : null,
      target_classes: targetClasses,
      translations: Object.keys(translations).length ? translations : null,
      expires_at: expires || null,
      publish_at: mode === 'schedule' && kind !== 'draft' ? new Date(publishAt).toISOString() : null,
      ...(kind === 'draft' ? { status: 'draft' } : kind === 'publish' ? { status: 'published' } : {}),
    }
    setSaving(true)
    try {
      const r = await fetch(editing ? `/api/announcements/${initial!.id}` : '/api/announcements', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? body : { ...body, school_id: schoolId, status: kind === 'draft' ? 'draft' : 'published' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not save the announcement')
      onSaved(kind === 'draft' ? 'Saved as draft.' : editing ? 'Announcement updated.' : mode === 'schedule' ? 'Announcement scheduled.' : 'Announcement published!')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save the announcement')
    } finally {
      setSaving(false)
    }
  }

  const visibleTemplates = ANNOUNCEMENT_TEMPLATES.filter(t => t.category === category)

  // ── Step 1: template gallery ──────────────────────────────────────────────
  if (!chosen) {
    return (
      <div data-testid="ann-gallery" className="bg-white border-y border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-[#f5f7f3] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">Start from a template</h3>
            <p className="text-sm text-gray-500 mt-0.5">Festival greetings open as an animated card for teachers, students and parents.</p>
          </div>
          <button data-testid="ann-cancel" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200">Cancel</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-2 flex-wrap">
            {(['festival', 'holiday', 'school'] as TemplateCategory[]).map(c => (
              <button key={c} data-testid={`ann-cat-${c}`} onClick={() => setCategory(c)}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${category === c ? 'bg-[#245b46] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
            <button data-testid="ann-template-blank" onClick={() => pickTemplate(null)}
              className="px-4 py-2 rounded-md text-sm font-semibold bg-white border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50">
              {CATEGORY_LABEL.blank}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleTemplates.map(t => (
              <button key={t.key} data-testid={`ann-template-${t.key}`} onClick={() => pickTemplate(t)}
                className="group rounded-md overflow-hidden text-left transition-transform hover:-translate-y-0.5"
                style={{ background: `linear-gradient(135deg, ${t.gradient[0]}, ${t.gradient[1]} 55%, ${t.gradient[2]})`, color: t.dark ? '#fff' : '#1f2937' }}>
                <div className="px-3 pt-4 pb-3 text-center">
                  <div className="text-4xl leading-none group-hover:scale-110 transition-transform">{t.emoji}</div>
                  <p className="text-sm font-extrabold mt-2 leading-tight">{t.label}</p>
                  <p className="text-[10px] opacity-80 mt-0.5">{t.greeting ? 'Animated greeting card' : 'Notice with banner'}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: write, target, schedule, preview ──────────────────────────────
  const inputCls = 'w-full border border-gray-200 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#245b46]/20 focus:border-[#245b46] transition-colors'
  const label = 'block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2'

  return (
    <div data-testid="ann-form" className="grid lg:grid-cols-5 gap-5 items-start">
      <div className="lg:col-span-3 bg-white border-y border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-[#f5f7f3] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">{editing ? 'Edit announcement' : template ? `New: ${template.label}` : 'New announcement'}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{editing ? 'Changes show to the selected audience straight away' : 'Write it, choose who gets it, check the preview'}</p>
          </div>
          {!editing && (
            <button data-testid="ann-change-template" onClick={() => setChosen(false)} className="text-xs text-indigo-600 hover:underline whitespace-nowrap">Change template</button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {error && <div data-testid="ann-error" className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

          <div>
            <label className={label}>Title *</label>
            <input data-testid="ann-title" maxLength={200} className={inputCls} placeholder="e.g. School closed for Republic Day" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {template && (
            <div>
              <label className={label}>Card headline</label>
              <input data-testid="ann-headline" maxLength={120} className={inputCls} value={headline} onChange={e => setHeadline(e.target.value)} />
            </div>
          )}

          <div>
            <label className={label}>Message *</label>
            <textarea data-testid="ann-content" rows={6} maxLength={5000} className={`${inputCls} resize-none`} placeholder="Write the full announcement here…" value={content} onChange={e => setContent(e.target.value)} />
          </div>

          {/* Audience */}
          <div>
            <label className={label}>Send to *</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="ann-audience-all" onClick={() => toggleAudience('all')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${audience.includes('all') ? 'bg-[#245b46] border-[#245b46] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-[#9bb7a4]'}`}>
                <Globe2 size={15} aria-hidden="true" />Everyone
              </button>
              {AUDIENCES.map(a => {
                const on = !audience.includes('all') && audience.includes(a.key)
                return (
                  <button key={a.key} type="button" data-testid={`ann-audience-${a.key}`} onClick={() => toggleAudience(a.key)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${on ? 'bg-[#245b46] border-[#245b46] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-[#9bb7a4]'}`}>
                    <a.icon size={15} aria-hidden="true" />{a.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Classes */}
          <div>
            <label className={label}>Which classes?</label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button type="button" data-testid="ann-classes-all" onClick={() => setClassSel({})}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${targetClasses === null ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                Whole school
              </button>
              {grades.map(g => {
                const sel = classSel[g]
                return (
                  <button key={g} type="button" data-testid={`ann-grade-${g}`} onClick={() => toggleGrade(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${sel ? 'bg-indigo-100 border-indigo-400 text-indigo-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    Grade {g}{sel && !sel.all ? ` (${sel.sections.length})` : ''}
                  </button>
                )
              })}
            </div>
            {Object.keys(classSel).sort((a, b) => gradeOrder(a) - gradeOrder(b)).map(g => (
              <div key={g} className="flex items-center gap-1.5 flex-wrap mb-1.5 pl-1">
                <span className="text-[11px] font-semibold text-gray-400 w-16">Grade {g}</span>
                {sectionsOf(g).map(sec => {
                  const on = classSel[g].all || classSel[g].sections.includes(sec)
                  return (
                    <button key={sec} type="button" data-testid={`ann-section-${g}-${sec}`} onClick={() => toggleSection(g, sec)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {sec}
                    </button>
                  )
                })}
              </div>
            ))}
            <p data-testid="ann-recipients" className="text-xs mt-2 border-l-2 border-[#245b46] bg-[#edf2eb] px-3 py-2 text-[#173e2f] font-medium">
              {recipients
                ? `This will reach ${recipients.total} ${recipients.total === 1 ? 'person' : 'people'} — ${recipients.teachers} teacher${recipients.teachers === 1 ? '' : 's'} · ${recipients.students} student${recipients.students === 1 ? '' : 's'} · ${recipients.parents} parent${recipients.parents === 1 ? '' : 's'}`
                : 'Counting who will receive this…'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Type</label>
              <select data-testid="ann-type" className={`${inputCls} bg-white`} value={type} onChange={e => setType(e.target.value)}>
                <option value="general">General</option>
                <option value="circular">Circular</option>
                <option value="event">Event</option>
                <option value="alert">Alert</option>
              </select>
            </div>
            <div>
              <label className={label}>Priority</label>
              <select data-testid="ann-priority" className={`${inputCls} bg-white`} value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-3 p-3 rounded-md border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input data-testid="ann-pinned" type="checkbox" className="mt-1" checked={pinned} onChange={e => setPinned(e.target.checked)} />
              <span><span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"><Pin size={14} />Pin to top</span><span className="block text-xs text-gray-400">Stays above newer notices</span></span>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-md border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input data-testid="ann-requires-ack" type="checkbox" className="mt-1" checked={requiresAck} onChange={e => setRequiresAck(e.target.checked)} />
              <span><span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"><CheckCircle2 size={14} />Ask for acknowledgement</span><span className="block text-xs text-gray-400">People tap “I have read this”; you see who did</span></span>
            </label>
          </div>

          {/* When */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className={`${label} mb-0`}>When</p>
            <div className="flex gap-4 flex-wrap text-sm">
              <label className="flex items-center gap-2"><input data-testid="ann-mode-now" type="radio" checked={mode === 'now'} onChange={() => setMode('now')} /> Publish now</label>
              <label className="flex items-center gap-2"><input data-testid="ann-mode-schedule" type="radio" checked={mode === 'schedule'} onChange={() => setMode('schedule')} /> Schedule for later</label>
            </div>
            {mode === 'schedule' && (
              <input data-testid="ann-publish-at" type="datetime-local" className={inputCls} value={publishAt} onChange={e => setPublishAt(e.target.value)} />
            )}
            <div>
              <label className={label}>Hide after (optional)</label>
              <input data-testid="ann-expires" type="date" className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={expires} onChange={e => setExpires(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Leave blank to keep it up. After this day it moves to the Archive.</p>
            </div>
          </div>

          {/* Translations */}
          <div>
            <button type="button" data-testid="ann-toggle-translations" onClick={() => setShowTrans(v => !v)} className="text-sm font-semibold text-indigo-600 hover:underline">
              {showTrans ? '− Hide' : '+ Add'} Telugu / Hindi version
            </button>
            {showTrans && (
              <div className="mt-3 space-y-4">
                {(['te', 'hi'] as const).map(l => (
                  <div key={l} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase">{l === 'te' ? 'తెలుగు · Telugu' : 'हिन्दी · Hindi'}</p>
                    <input data-testid={`ann-title-${l}`} className={inputCls} placeholder="Title" value={trans[l].title} onChange={e => setTrans(t => ({ ...t, [l]: { ...t[l], title: e.target.value } }))} />
                    <textarea data-testid={`ann-content-${l}`} rows={3} className={`${inputCls} resize-none`} placeholder="Message" value={trans[l].content} onChange={e => setTrans(t => ({ ...t, [l]: { ...t[l], content: e.target.value } }))} />
                  </div>
                ))}
                <p className="text-xs text-gray-400">Readers who use the app in that language see this version; everyone else sees the English text above.</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 flex-wrap">
            {(!editing || initial?.status === 'draft') && (
              <button data-testid="ann-submit" disabled={saving} onClick={() => save('publish')}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#245b46] hover:bg-[#173e2f] text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : mode === 'schedule' ? <><Clock3 size={15} />Schedule</> : <><Send size={15} />{editing ? 'Publish now' : 'Publish'}</>}
              </button>
            )}
            {editing && initial?.status !== 'draft' && (
              <button data-testid="ann-submit" disabled={saving} onClick={() => save('save')}
                className="px-6 py-2.5 bg-[#245b46] hover:bg-[#173e2f] text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
            {(!editing || initial?.status === 'draft') && (
              <button data-testid="ann-save-draft" disabled={saving} onClick={() => save('draft')}
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-50 transition-colors disabled:opacity-60">
                <Save size={15} />Save draft
              </button>
            )}
            <button data-testid="ann-cancel" onClick={onCancel} className="px-4 py-2.5 text-gray-500 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:col-span-2 lg:sticky lg:top-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Live preview</p>
          <button data-testid="ann-preview-open" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245b46] hover:underline"><Eye size={14} />Open recipient preview</button>
        </div>
        <div data-testid="ann-preview">
          {template && (template.greeting || headline) ? (
            template.greeting
              ? <GreetingCard template={template} headline={headline || title || template.headline} message={content} schoolName={schoolName} compact />
              : (
                <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
                  <GreetingCard template={template} headline={headline || title || template.headline} variant="banner" />
                  <div className="p-5"><p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{content || 'Your message…'}</p></div>
                </div>
              )
          ) : (
            <div className="bg-white rounded-lg overflow-hidden border border-gray-200 p-5 space-y-2">
              <p className="text-base font-extrabold text-gray-900">{title || 'Your title'}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{content || 'Your message…'}</p>
            </div>
          )}
        </div>
        <p className="text-[11px] text-gray-400">
          {template?.greeting ? 'People see this card pop up the first time they open the app.' : 'This is how the notice opens when someone taps it.'}
        </p>
      </div>

      {previewOpen && <NoticeModal notice={previewItem} schoolName={schoolName} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}
