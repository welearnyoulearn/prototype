'use client'

import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/use-confirm'
import AnnouncementComposer, { type ClassRow } from '@/components/announcements/AnnouncementComposer'
import NoticeModal from '@/components/announcements/NoticeModal'
import { getTemplate } from '@/lib/announcementTemplates'
import type { NoticeItem } from '@/components/announcements/types'

type Tab = 'live' | 'scheduled' | 'drafts' | 'archive' | 'deleted'
type Stats = {
  recipients: number; seen: number; acknowledged: number | null; requires_ack: boolean
  by_role: Record<string, { recipients: number; seen: number; acked: number }>
  not_seen: Array<{ id: number; name: string; role: string }>; not_seen_total: number
  not_acknowledged: Array<{ id: number; name: string; role: string }>
  history: Array<{ action: string; by_name: string | null; created_at: string; details: Record<string, unknown> | null }>
}

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'live', label: 'Live', icon: '📣' },
  { key: 'scheduled', label: 'Scheduled', icon: '🕒' },
  { key: 'drafts', label: 'Drafts', icon: '📝' },
  { key: 'archive', label: 'Archive', icon: '🗄️' },
  { key: 'deleted', label: 'Deleted', icon: '🗑' },
]
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-600' },
  high: { label: 'High', color: 'text-amber-600' },
  normal: { label: 'Normal', color: 'text-gray-500' },
}
const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  general: { label: 'General', color: 'text-gray-600', bg: 'bg-gray-100', icon: '📋' },
  circular: { label: 'Circular', color: 'text-blue-600', bg: 'bg-blue-50', icon: '📄' },
  event: { label: 'Event', color: 'text-purple-600', bg: 'bg-purple-50', icon: '🎉' },
  alert: { label: 'Alert', color: 'text-red-600', bg: 'bg-red-50', icon: '🚨' },
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
          <h2 className="text-lg font-bold text-gray-800">Announcement Board</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${items.length} in ${TABS.find(t => t.key === tab)?.label}`}
            {urgentCount > 0 && <span className="ml-2 text-red-500 font-semibold">· {urgentCount} urgent</span>}
          </p>
        </div>
        <button data-testid="ann-tab-create" onClick={() => { setEditing(null); setEditingScheduled(false); setMode('compose') }}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 flex items-center gap-1.5">
          <span className="text-base leading-none">＋</span> New announcement
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} data-testid={`ann-tab-${t.key}`} onClick={() => { setTab(t.key); setExpanded(null) }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.icon} {t.label}
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
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-16 text-center">
          <p className="text-4xl mb-2">{TABS.find(t => t.key === tab)?.icon}</p>
          <p className="text-sm text-gray-500">{tab === 'live' ? 'No live announcements. Click “New announcement” to post one.' : `Nothing in ${TABS.find(t => t.key === tab)?.label}.`}</p>
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.map(a => {
          const pm = PRIORITY_META[a.priority] ?? PRIORITY_META.normal
          const tm = TYPE_META[a.announcement_type] ?? TYPE_META.general
          const tpl = getTemplate(a.template_key)
          const isOpen = expanded === a.id
          const st = stats[a.id]
          const cl = classesLabel(a.target_classes)
          const scheduled = tab === 'scheduled' && !!a.publish_at
          return (
            <div key={a.id} data-testid={`ann-card-${a.id}`}
              className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${a.priority === 'urgent' ? 'border-red-200' : a.priority === 'high' ? 'border-amber-200' : 'border-gray-100'}`}>
              <div className="flex items-start gap-3.5 px-5 py-4 cursor-pointer hover:bg-gray-50/60" onClick={() => toggleExpand(a)}>
                <div className="text-2xl leading-none mt-0.5" aria-hidden>{tpl?.emoji ?? tm.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${tm.bg} ${tm.color}`}>{tm.label}</span>
                    {a.target_audience.split(',').map(x => x.trim()).map(x => {
                      const m = AUDIENCE_META[x] ?? AUDIENCE_META.all
                      return <span key={x} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
                    })}
                    {cl && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">{cl}</span>}
                    {a.priority !== 'normal' && <span className={`text-[10px] font-bold uppercase ${pm.color}`}>● {pm.label}</span>}
                    {a.pinned && <span className="text-[10px] font-bold text-indigo-600">📌 Pinned</span>}
                    {a.requires_ack && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">✅ Needs acknowledgement</span>}
                    {a.status === 'draft' && <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full">Draft</span>}
                    {scheduled && <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full">🕒 {fmtDateTime(a.publish_at as string)}</span>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{a.title}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 flex-wrap">
                    <span className="font-medium text-gray-500">{a.created_by_name}</span>
                    <span>·</span>
                    <span>{fmtDate(a.published_at ?? a.created_at)}</span>
                    {a.expires_at && <><span>·</span><span className="text-amber-500">Expires {fmtDate(a.expires_at)}</span></>}
                    {a.status === 'published' && tab !== 'deleted' && <><span>·</span><span data-testid={`ann-seen-${a.id}`}>👁 {a.seen_count ?? 0} seen</span></>}
                  </div>
                </div>
                <span className={`text-gray-300 mt-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
              </div>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-gray-50 space-y-4">
                  <p className="text-sm text-gray-600 mt-4 whitespace-pre-wrap leading-relaxed">{a.content}</p>

                  {/* Who has seen it */}
                  {tab !== 'deleted' && a.status !== 'draft' && (
                    <div data-testid={`ann-stats-${a.id}`} className="rounded-xl bg-gray-50 p-4 space-y-3">
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
                          {st.requires_ack && <p data-testid={`ann-acks-${a.id}`} className="text-sm font-semibold text-amber-700">✅ Acknowledged by {st.acknowledged ?? 0} of {st.recipients}</p>}
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
                      <button data-testid={`ann-preview-${a.id}`} onClick={() => setPreview(a)} className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 py-1.5 rounded-lg font-medium">👁 Preview</button>
                      {a.status === 'draft' && <button data-testid={`ann-publish-${a.id}`} onClick={() => change(a, { status: 'published', publish_at: null }, 'Announcement published!')} className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg font-medium">📣 Publish</button>}
                      {a.status === 'published' && <button data-testid={`ann-pin-${a.id}`} onClick={() => change(a, { pinned: !a.pinned }, a.pinned ? 'Unpinned.' : 'Pinned to the top.')} className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 py-1.5 rounded-lg font-medium">{a.pinned ? '📌 Unpin' : '📌 Pin'}</button>}
                      {a.status === 'published' && <button data-testid={`ann-unpublish-${a.id}`} onClick={() => change(a, { status: 'draft' }, 'Moved to drafts.')} className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 py-1.5 rounded-lg font-medium">↩ Unpublish</button>}
                      <button data-testid={`ann-edit-${a.id}`} onClick={() => { setEditing(a); setEditingScheduled(tab === 'scheduled'); setMode('compose') }} className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:bg-indigo-50 px-4 py-1.5 rounded-lg font-medium">✏ Edit</button>
                      <button data-testid={`ann-delete-${a.id}`} onClick={() => handleDelete(a)} className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 px-4 py-1.5 rounded-lg font-medium">🗑 Delete</button>
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
