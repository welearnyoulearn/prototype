'use client'

import { useEffect, useState } from 'react'
import { ANNOUNCEMENTS_CHANGED } from './announcementEvents'
import type { NoticeItem } from './types'

// How many live announcements this person has not seen yet (for the Announcements tab badge).
export function useUnreadAnnouncements(schoolId: number | null | undefined): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!schoolId) return
    let cancelled = false
    const load = () => {
      fetch(`/api/announcements?school_id=${schoolId}`)
        .then(r => (r.ok ? r.json() : []))
        .then((data: unknown) => {
          if (cancelled) return
          const list = Array.isArray(data) ? (data as NoticeItem[]) : []
          setCount(list.filter(n => !n.seen).length)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener(ANNOUNCEMENTS_CHANGED, load)
    return () => { cancelled = true; window.removeEventListener(ANNOUNCEMENTS_CHANGED, load) }
  }, [schoolId])
  return count
}
