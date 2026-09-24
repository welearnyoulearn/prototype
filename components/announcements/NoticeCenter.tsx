'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getTemplate } from '@/lib/announcementTemplates'
import NoticeModal from './NoticeModal'
import { localised, type Lang, type NoticeItem } from './types'
import { AlertTriangle, CalendarDays, FileText, Megaphone, Pin, Search } from 'lucide-react'

const TX = {
  en: { title: 'School notices', newCount: (n: number) => `${n} new`, viewAll: 'View all notices', search: 'Search notices…', all: 'All', unread: 'Unread', pinned: 'Pinned', action: 'Action needed', past: 'Past', none: 'No notices found', new: 'NEW', actionTag: 'Action needed', urgent: 'Urgent', back: 'Close', of: (a: number, b: number) => `Showing ${a} of ${b}` },
  te: { title: 'పాఠశాల నోటీసులు', newCount: (n: number) => `${n} కొత్తవి`, viewAll: 'అన్ని నోటీసులు చూడండి', search: 'నోటీసులు వెతకండి…', all: 'అన్నీ', unread: 'చదవనివి', pinned: 'పిన్ చేసినవి', action: 'చర్య అవసరం', past: 'పాతవి', none: 'నోటీసులు లేవు', new: 'కొత్త', actionTag: 'చర్య అవసరం', urgent: 'అత్యవసరం', back: 'మూసివేయి', of: (a: number, b: number) => `${b} లో ${a}` },
  hi: { title: 'स्कूल सूचनाएँ', newCount: (n: number) => `${n} नई`, viewAll: 'सभी सूचनाएँ देखें', search: 'सूचनाएँ खोजें…', all: 'सभी', unread: 'अपठित', pinned: 'पिन की गई', action: 'कार्रवाई आवश्यक', past: 'पुरानी', none: 'कोई सूचना नहीं', new: 'नई', actionTag: 'कार्रवाई आवश्यक', urgent: 'अत्यावश्यक', back: 'बंद करें', of: (a: number, b: number) => `${b} में से ${a}` },
} as const

const TYPE_ICON: Record<string, typeof FileText> = { general: FileText, circular: FileText, event: CalendarDays, alert: AlertTriangle }
type Filter = 'all' | 'unread' | 'pinned' | 'action' | 'past'

function fmt(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// The notices card for teacher / student / parent dashboards: latest notices with unread marks,
// a full searchable list, and the notice card popup (animated greeting cards for festive notices).
// Unseen greeting / urgent / action-needed notices pop up once so nobody misses them.
export default function NoticeCenter({
  schoolId, lang = 'en', schoolName, preview = 4,
}: {
  schoolId: number
  lang?: Lang
  schoolName?: string
  preview?: number
}) {
  const tx = TX[lang]
  const [items, setItems] = useState<NoticeItem[]>([])
  const [past, setPast] = useState<NoticeItem[] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [queue, setQueue] = useState<number[]>([])
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/announcements?school_id=${schoolId}`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return
        const list = Array.isArray(data) ? (data as NoticeItem[]) : []
        setItems(list)
        // Anything unseen that deserves a pop-up: festive card, urgent, or needs an acknowledgement
        setQueue(list.filter(n => !n.seen && (n.priority === 'urgent' || (n.requires_ack && !n.acked) || getTemplate(n.template_key)?.greeting)).map(n => n.id))
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [schoolId])

  const loadPast = useCallback(async () => {
    if (past !== null) return
    try {
      const r = await fetch(`/api/announcements?school_id=${schoolId}&scope=past`)
      const data: unknown = r.ok ? await r.json() : []
      setPast(Array.isArray(data) ? (data as NoticeItem[]) : [])
    } catch { setPast([]) }
  }, [past, schoolId])

  const activeId = openId ?? queue[0] ?? null
  const all = useMemo(() => [...items, ...(past ?? [])], [items, past])
  const active = activeId !== null ? all.find(n => n.id === activeId) ?? null : null

  const patch = (id: number, change: Partial<NoticeItem>) => {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, ...change } : n)))
    setPast(prev => (prev ? prev.map(n => (n.id === id ? { ...n, ...change } : n)) : prev))
  }

  // Opening a notice records "seen" (once)
  useEffect(() => {
    if (!active || active.seen) return
    patch(active.id, { seen: true })
    fetch(`/api/announcements/${active.id}/read`, { method: 'POST' }).catch(() => {})
  }, [active?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function acknowledge(id: number) {
    patch(id, { acked: true, seen: true })
    fetch(`/api/announcements/${id}/ack`, { method: 'POST' }).catch(() => {})
  }

  function closeModal() {
    if (activeId === null) return
    setQueue(q => q.filter(id => id !== activeId))
    setOpenId(null)
  }

  const unread = items.filter(n => !n.seen).length
  const urgent = items.filter(n => n.priority === 'urgent').length

  const filtered = useMemo(() => {
    const base = filter === 'past' ? (past ?? []) : items
    const q = query.trim().toLowerCase()
    return base.filter(n => {
      if (filter === 'unread' && n.seen) return false
      if (filter === 'pinned' && !n.pinned) return false
      if (filter === 'action' && !(n.requires_ack && !n.acked)) return false
      if (!q) return true
      const l = localised(n, lang)
      return `${l.title} ${l.content}`.toLowerCase().includes(q)
    })
  }, [items, past, filter, query, lang])

  if (!loaded) return null
  if (items.length === 0 && !active) return null

  const row = (n: NoticeItem) => {
    const tpl = getTemplate(n.template_key)
    const l = localised(n, lang)
    const TypeIcon = TYPE_ICON[n.announcement_type] ?? FileText
    return (
      <button key={n.id} data-testid={`notice-row-${n.id}`} onClick={() => setOpenId(n.id)}
        className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${n.priority === 'urgent' ? 'bg-red-50/40' : ''}`}>
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center text-[#245b46]" aria-hidden>{tpl?.greeting ? tpl.emoji : <TypeIcon size={17} />}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 flex-wrap">
            {n.pinned && <Pin size={13} className="text-[#245b46]" aria-label="pinned" />}
            <span className={`text-sm leading-snug ${n.seen ? 'font-medium text-gray-700' : 'font-bold text-gray-900'} truncate`}>{l.title}</span>
            {n.priority === 'urgent' && <span className="text-[10px] font-bold uppercase text-red-600">● {tx.urgent}</span>}
            {n.requires_ack && !n.acked && <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">{tx.actionTag}</span>}
          </span>
          <span className="block text-xs text-gray-400 mt-0.5 truncate">{n.created_by_name ?? ''} · {fmt(n.published_at ?? n.created_at)}</span>
        </span>
        {!n.seen && <span data-testid={`notice-new-dot-${n.id}`} className="mt-1.5 text-[10px] font-extrabold text-white bg-indigo-500 px-1.5 py-0.5 rounded-full">{tx.new}</span>}
      </button>
    )
  }

  return (
    <>
      {items.length > 0 && (
        <section data-testid="notice-center" className="bg-white border-y border-gray-200 overflow-hidden" aria-labelledby="notice-center-title">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone size={17} className="text-[#245b46]" aria-hidden="true" />
              <p id="notice-center-title" className="text-sm font-semibold text-gray-800">{tx.title}</p>
              {unread > 0 && <span data-testid="notice-unread-badge" className="text-[10px] bg-indigo-600 text-white font-bold px-2 py-0.5 rounded-full">{tx.newCount(unread)}</span>}
              {urgent > 0 && <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">{urgent} {tx.urgent}</span>}
            </div>
          </div>
          <div className="divide-y divide-gray-50">{items.slice(0, preview).map(row)}</div>
          <button data-testid="notice-viewall" onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border-t border-gray-100 transition-colors">
            {tx.viewAll}{items.length > preview ? ` (${items.length})` : ''} →
          </button>
        </section>
      )}

      {showAll && (
        <div className="fixed inset-0 z-[250] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowAll(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="notice-panel-title" data-testid="notice-panel" className="bg-white w-full sm:max-w-xl max-h-[88vh] rounded-t-lg sm:rounded-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 space-y-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <p id="notice-panel-title" className="flex items-center gap-2 text-base font-semibold text-gray-900"><Megaphone size={17} className="text-[#245b46]" />{tx.title}</p>
                <button data-testid="notice-panel-close" onClick={() => setShowAll(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">×</button>
              </div>
              <label className="relative block"><span className="sr-only">{tx.search}</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input data-testid="notices-search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tx.search}
                className="w-full border border-gray-200 rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#245b46]/20 focus:border-[#245b46]" /></label>
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'unread', 'pinned', 'action', 'past'] as Filter[]).map(f => (
                  <button key={f} data-testid={`notices-filter-${f}`}
                    onClick={() => { setFilter(f); if (f === 'past') loadPast() }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filter === f ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {tx[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-50 flex-1">
              {filtered.length === 0
                ? <p className="text-center text-sm text-gray-400 py-12">{tx.none}</p>
                : filtered.map(row)}
            </div>
            <p className="px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100">{tx.of(filtered.length, filter === 'past' ? (past?.length ?? 0) : items.length)}</p>
          </div>
        </div>
      )}

      {active && <NoticeModal notice={active} schoolName={schoolName} lang={lang} onClose={closeModal} onAck={acknowledge} />}
    </>
  )
}
