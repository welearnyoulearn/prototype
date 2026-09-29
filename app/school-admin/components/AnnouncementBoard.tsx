'use client'

import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/use-confirm'
import AnnouncementComposer, { type ClassRow } from '@/components/announcements/AnnouncementComposer'
import NoticeModal from '@/components/announcements/NoticeModal'
import type { NoticeItem } from '@/components/announcements/types'
import { Archive, CheckCircle2, Clock3, Eye, FileText, Megaphone, Pencil, Pin, Plus, Send, Trash2, Undo2 } from 'lucide-react'

type Tab = 'live' | 'scheduled' | 'drafts' | 'archive' | 'deleted'
type Stats = {
  recipients: number; seen: number; acknowledged: number | null; requires_ack: boolean
  by_role: Record<string, { recipients: number; seen: number; acked: number }>
  not_seen: Array<{ id: number; name: string; role: string }>; not_seen_total: number
  not_acknowledged: Array<{ id: number; name: string; role: string }>
  history: Array<{ action: string; by_name: string | null; created_at: string; details: Record<string, unknown> | null }>
}

const TABS: Array<{ key: Tab; label: string; icon: typeof Megaphone }> = [
  { key: 'live', label: 'Live', icon: Megaphone },
  { key: 'scheduled', label: 'Scheduled', icon: Clock3 },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'archive', label: 'Archive', icon: Archive },
  { key: 'deleted', label: 'Deleted', icon: Trash2 },
]
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-600' },
  high: { label: 'High', color: 'text-amber-600' },
  normal: { label: 'Normal', color: 'text-gray-500' },
}
const TYPE_META: Record<string, { label: string; color: string }> = {
  general: { label: 'General', color: 'text-gray-600' },
  circular: { label: 'Circular', color: 'text-[#245b46]' },
  event: { label: 'Event', color: 'text-[#21686a]' },
  alert: { label: 'Alert', color: 'text-red-700' },
}
const AUDIENCE_META: Record<string, { label: string; cls: string }> = {
  all: { label: 'Everyone', cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  teachers: { label: 'Teachers', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  students: { label: 'Students', cls: 'bg-green-50 text-green-700 border-green-100' },
  parents: { label: 'Parents', cls: 'bg-purple-50 text-purple-700 border-purple-100' },
}
const ACTION_LABEL: Record<string, string> = { created: 'Published', drafted: 'Saved as draft', published: 'Published', edited: 'Edited', unpublished: 'Moved to drafts', deleted: 'Deleted', restored: 'Restored' }

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
function classesLabel(tc: NoticeItem['target_classes']): string | null {
  if (!tc || tc.length === 0) return null
  return tc.map(c => (c.section ? `${c.grade}-${c.section}` : `Grade ${c.grade}`)).join(', ')
}

export default function AnnouncementBoard({ schoolId, schoolName = 'Your School' }: { schoolId: number; schoolName?: string }) {
  const [tab, setTab] = useState<Tab>('live')
  const [mode, setMode] = useState<'list' | 'compose'>('list')
  const [editing, setEditing] = useState<NoticeItem | null>(null)
  const [editingScheduled, setEditingScheduled] = useState(false)
  const [items, setItems] = useState<NoticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [stats, setStats] = useState<Record<number, Stats | 'loading'>>({})
  const [filterAudience, setFilterAudience] = useState('all')
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [preview, setPreview] = useState<NoticeItem | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  const load = useCallback(async (which: Tab = tab) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/announcements?school_id=${schoolId}&scope=${which}`)
      const data = await r.json()
      setItems(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [schoolId, tab])

  useEffect(() => { load(tab) }, [schoolId, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`/api/classes?school_id=${schoolId}`).then(r => (r.ok ? r.json() : [])).then((rows: unknown) => {
      setClasses(Array.isArray(rows) ? (rows as ClassRow[]).map(c => ({ grade: c.grade, section: c.section })) : [])
    }).catch(() => setClasses([]))
  }, [schoolId])

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }

  async function loadStats(id: number) {
    setStats(s => ({ ...s, [id]: 'loading' }))
    try {
      const r = await fetch(`/api/announcements/${id}/stats`)
      if (r.ok) { const d: Stats = await r.json(); setStats(s => ({ ...s, [id]: d })) }
      else setStats(s => { const n = { ...s }; delete n[id]; return n })
    } catch { setStats(s => { const n = { ...s }; delete n[id]; return n }) }
  }

  function toggleExpand(n: NoticeItem) {
    const open = expanded === n.id
    setExpanded(open ? null : n.id)
    if (!open) loadStats(n.id)
  }

  async function change(n: NoticeItem, body: Record<string, unknown>, msg: string) {
    setError('')
    const r = await fetch(`/api/announcements/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Could not update the announcement'); return }
    flash(msg)
    await load()
  }

  async function handleDelete(n: NoticeItem) {
    const ok = await confirm('Delete this announcement? Everyone who could see it will lose it. It stays in the Deleted tab for your records.', { title: 'Delete announcement?', confirmText: 'Delete' })
    if (!ok) return
    const r = await fetch(`/api/announcements/${n.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Could not delete the announcement'); return }
    setItems(prev => prev.filter(a => a.id !== n.id))
  }

  const filtered = items.filter(a => {
    if (filterAudience === 'all') return true
    return a.target_audience === 'all' || a.target_audience.split(',').map(s => s.trim()).includes(filterAudience)
  })
  const urgentCount = items.filter(a => a.priority === 'urgent').length

  if (mode === 'compose') {
    return (
      <div className="space-y-5 max-w-6xl">
        <AnnouncementComposer
          schoolId={schoolId} schoolName={schoolName} classes={classes} initial={editing} initialScheduled={editingScheduled}
          onCancel={() => { setMode('list'); setEditing(null) }}
          onSaved={msg => {
            const nextTab: Tab = msg.startsWith('Saved as draft') ? 'drafts' : msg.startsWith('Announcement scheduled') ? 'scheduled' : 'live'
            setMode('list'); setEditing(null); flash(msg)
            if (nextTab !== tab) setTab(nextTab)
            else load(nextTab)
          }}
        />
        {ConfirmDialog}
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-900">Announcement board</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${items.length} in ${TABS.find(t => t.key === tab)?.label}`}
            {urgentCount > 0 && <span className="ml-2 text-red-500 font-semibold">· {urgentCount} urgent</span>}
          </p>
        </div>
        <button data-testid="ann-tab-create" onClick={() => { setEditing(null); setEditingScheduled(false); setMode('compose') }}
          className="flex min-h-10 items-center gap-2 rounded-md bg-[#245b46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#173e2f]">
          <Plus size={16} aria-hidden="true" /> New announcement
        </button>
      </div>

      <div className="flex gap-5 overflow-x-auto border-b border-gray-200" role="tablist" aria-label="Announcement status">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} data-testid={`ann-tab-${t.key}`} onClick={() => { setTab(t.key); setExpanded(null) }}
            className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition-colors ${tab === t.key ? 'border-[#245b46] text-[#173e2f]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <t.icon size={15} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      {success && <div data-testid="ann-success" className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm">✓ {success}</div>}
      {error && <div data-testid="ann-list-error" className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="flex gap-1.5 flex-wrap">
        {[{ key: 'all', label: 'All audiences' }, { key: 'teachers', label: 'Teachers' }, { key: 'students', label: 'Students' }, { key: 'parents', label: 'Parents' }].map(o => (
          <button key={o.key} onClick={() => setFilterAudience(o.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filterAudience === o.key ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="border-y border-dashed border-gray-300 py-14 text-center">
          <Megaphone className="mx-auto mb-3 h-6 w-6 text-gray-400" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-700">{tab === 'live' ? 'No live announcements' : `Nothing in ${TABS.find(t => t.key === tab)?.label}`}</p>
          <p className="mt-1 text-xs text-gray-400">{tab === 'live' ? 'Create an announcement when your school has something to share.' : 'Items will appear here when their status changes.'}</p>
        </div>
      )}

      <div className="divide-y border-y border-gray-200">
        {filtered.map(a => {
          const pm = PRIORITY_META[a.priority] ?? PRIORITY_META.normal
          const tm = TYPE_META[a.announcement_type] ?? TYPE_META.general
          const isOpen = expanded === a.id
          const st = stats[a.id]
          const cl = classesLabel(a.target_classes)
          const scheduled = tab === 'scheduled' && !!a.publish_at
          return (
            <div key={a.id} data-testid={`ann-card-${a.id}`}
              className={`${a.priority === 'urgent' ? 'border-l-2 border-l-red-600' : a.priority === 'high' ? 'border-l-2 border-l-amber-500' : ''}`}>
              <div className="flex items-start gap-3.5 px-5 py-4 cursor-pointer hover:bg-gray-50/60" onClick={() => toggleExpand(a)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-xs font-semibold uppercase tracking-[.06em] ${tm.color}`}>{tm.label}</span>
                    {a.target_audience.split(',').map(x => x.trim()).map(x => {
                      const m = AUDIENCE_META[x] ?? AUDIENCE_META.all
                      return <span key={x} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
                    })}
                    {cl && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">{cl}</span>}
                    {a.priority !== 'normal' && <span className={`text-[10px] font-bold uppercase ${pm.color}`}>● {pm.label}</span>}
                    {a.pinned && <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#245b46]"><Pin size={12} aria-hidden="true" />Pinned</span>}
                    {a.requires_ack && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><CheckCircle2 size={12} aria-hidden="true" />Needs acknowledgement</span>}
                    {a.status === 'draft' && <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full">Draft</span>}
                    {scheduled && <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800"><Clock3 size={12} aria-hidden="true" />{fmtDateTime(a.publish_at as string)}</span>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{a.title}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 flex-wrap">
                    <span className="font-medium text-gray-500">{a.created_by_name}</span>
                    <span>·</span>
                    <span>{fmtDate(a.published_at ?? a.created_at)}</span>
                    {a.expires_at && <><span>·</span><span className="text-amber-500">Expires {fmtDate(a.expires_at)}</span></>}
                    {a.status === 'published' && tab !== 'deleted' && <><span>·</span><span className="inline-flex items-center gap-1" data-testid={`ann-seen-${a.id}`}><Eye size={12} aria-hidden="true" />{a.seen_count ?? 0} seen</span></>}
                  </div>
                </div>
                <span className={`text-gray-300 mt-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
              </div>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-gray-50 space-y-4">
                  <p className="text-sm text-gray-600 mt-4 whitespace-pre-wrap leading-relaxed">{a.content}</p>

                  {/* Who has seen it */}
                  {tab !== 'deleted' && a.status !== 'draft' && (
                    <div data-testid={`ann-stats-${a.id}`} className="border-l-2 border-[#dce9dc] bg-[#f6f8f4] p-4 space-y-3">
                      {!st || st === 'loading' ? <p className="text-xs text-gray-400">Loading reach…</p> : (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span data-testid={`ann-reach-${a.id}`} className="font-semibold text-gray-700">Seen by {st.seen} of {st.recipients}</span>
                            <span className="text-xs text-gray-400">{st.recipients ? Math.round((st.seen / st.recipients) * 100) : 0}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${st.recipients ? (st.seen / st.recipients) * 100 : 0}%` }} /></div>
                          <div className="flex gap-3 flex-wrap text-xs text-gray-500">
                            {Object.entries(st.by_role).filter(([, v]) => v.recipients > 0).map(([k, v]) => (
                              <span key={k} className="capitalize">{k}: {v.seen}/{v.recipients}</span>
                            ))}
                          </div>
                          {st.requires_ack && <p data-testid={`ann-acks-${a.id}`} className="text-sm font-semibold text-amber-700">Acknowledged by {st.acknowledged ?? 0} of {st.recipients}</p>}
                          {st.not_seen_total > 0 && (
                            <details data-testid={`ann-notseen-${a.id}`}>
                              <summary className="text-xs font-semibold text-indigo-600 cursor-pointer">{st.not_seen_total} have not seen it yet</summary>
                              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                {st.not_seen.map(p => `${p.name} (${p.role})`).join(' · ')}{st.not_seen_total > st.not_seen.length ? ` … and ${st.not_seen_total - st.not_seen.length} more` : ''}
                              </p>
                            </details>
                          )}
                          {st.requires_ack && st.not_acknowledged.length > 0 && (
                            <details>
                              <summary className="text-xs font-semibold text-amber-700 cursor-pointer">{st.not_acknowledged.length} have not acknowledged</summary>
                              <p className="text-xs text-gray-500 mt-2 leading-relaxed">{st.not_acknowledged.map(p => `${p.name} (${p.role})`).join(' · ')}</p>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* History */}
                  {st && st !== 'loading' && st.history.length > 0 && (
                    <details>
                      <summary className="text-xs font-semibold text-gray-500 cursor-pointer">History ({st.history.length})</summary>
                      <ul className="mt-2 space-y-1 text-xs text-gray-500">
                        {st.history.map((h, i) => <li key={i}>{fmtDateTime(h.created_at)} — {ACTION_LABEL[h.action] ?? h.action} by {h.by_name ?? '—'}</li>)}
                      </ul>
                    </details>
                  )}

                  {tab !== 'deleted' && (
                    <div className="flex justify-end gap-2 flex-wrap pt-3 border-t border-gray-50">
                      <button data-testid={`ann-preview-${a.id}`} onClick={() => setPreview(a)} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Eye size={13} />Preview</button>
                      {a.status === 'draft' && <button data-testid={`ann-publish-${a.id}`} onClick={() => change(a, { status: 'published', publish_at: null }, 'Announcement published!')} className="inline-flex items-center gap-1.5 rounded-md bg-[#245b46] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#173e2f]"><Send size={13} />Publish</button>}
                      {a.status === 'published' && <button data-testid={`ann-pin-${a.id}`} onClick={() => change(a, { pinned: !a.pinned }, a.pinned ? 'Unpinned.' : 'Pinned to the top.')} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Pin size={13} />{a.pinned ? 'Unpin' : 'Pin'}</button>}
                      {a.status === 'published' && <button data-testid={`ann-unpublish-${a.id}`} onClick={() => change(a, { status: 'draft' }, 'Moved to drafts.')} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Undo2 size={13} />Unpublish</button>}
                      <button data-testid={`ann-edit-${a.id}`} onClick={() => { setEditing(a); setEditingScheduled(tab === 'scheduled'); setMode('compose') }} className="inline-flex items-center gap-1.5 rounded-md border border-[#c7d8cc] px-3 py-1.5 text-xs font-medium text-[#245b46] hover:bg-[#edf2eb]"><Pencil size={13} />Edit</button>
                      <button data-testid={`ann-delete-${a.id}`} onClick={() => handleDelete(a)} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 size={13} />Delete</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {preview && <NoticeModal notice={{ ...preview, seen: true, acked: false }} schoolName={schoolName} onClose={() => setPreview(null)} />}
      {ConfirmDialog}
    </div>
  )
}
