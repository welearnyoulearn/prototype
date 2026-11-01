'use client'

import { useEffect, useState } from 'react'
import NoticeModal from './NoticeModal'
import { announceChange } from './announcementEvents'
import { pickPopupNotices } from '@/lib/announcementPopup'
import type { Lang, NoticeItem } from './types'

// A new announcement pops up once per person. The server remembers "seen" per account, so it never comes
// back on this or any other device (rules in lib/announcementPopup.ts).
export default function AnnouncementPopup({
  schoolId, lang = 'en', schoolName,
}: {
  schoolId: number
  lang?: Lang
  schoolName?: string
}) {
  const [queue, setQueue] = useState<NoticeItem[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/announcements?school_id=${schoolId}`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return
        const list = Array.isArray(data) ? (data as NoticeItem[]) : []
        const picked = pickPopupNotices(list)
        if (picked.length === 0) return
        setQueue(picked)
        setTotal(picked.length)
        // Mark them all seen the moment they are shown, so a closed tab or a reload never repeats them.
        Promise.all(picked.map(n => fetch(`/api/announcements/${n.id}/read`, { method: 'POST' }).catch(() => null)))
          .then(() => announceChange())
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [schoolId])

  const current = queue[0]
  if (!current) return null

  async function acknowledge(id: number) {
    setQueue(q => q.map(n => (n.id === id ? { ...n, acked: true } : n)))
    await fetch(`/api/announcements/${id}/ack`, { method: 'POST' }).catch(() => null)
    announceChange()
  }

  return (
    <div data-testid="announcement-popup" data-remaining={queue.length} data-total={total}>
      <NoticeModal notice={current} schoolName={schoolName} lang={lang} onClose={() => setQueue(q => q.slice(1))} onAck={acknowledge} />
    </div>
  )
}
