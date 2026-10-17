'use client'

import { useCallback, useEffect, useState } from 'react'
import { NOTIFICATIONS_CHANGED_EVENT } from './notificationGroups'
import { notificationDestination, type NotificationPortal } from './NotificationBell'

// Per-feature unread counts for the sidebar. Uses the same endpoint and the
// same type -> destination mapping as the bell, so a badge always agrees with
// where clicking the matching notification would take the user.

// The bell routes some types to screens that are not top-level sidebar items
// in every portal (e.g. a teacher's "class-view" lives under My Classes).
const BADGE_KEY_REMAP: Partial<Record<NotificationPortal, Record<string, string>>> = {
  teacher: { 'class-view': 'my-classes' },
}

// Types the bell has no destination for, but that belong to a sidebar feature.
const EXTRA_DESTINATIONS: Partial<Record<NotificationPortal, Record<string, string>>> = {
  teacher: { syllabus_behind_nudge: 'syllabus' },
}

export function navBadgeKey(type: string, portal: NotificationPortal): string | undefined {
  const key = EXTRA_DESTINATIONS[portal]?.[type] ?? notificationDestination(type, portal)
  return key ? (BADGE_KEY_REMAP[portal]?.[key] ?? key) : undefined
}

const POLL_MS = 30_000

/** Unread notification count per sidebar nav key, e.g. { 'exam-schedule': 3 }. */
export function useNavNotificationCounts(portal: NotificationPortal, enabled = true): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unread_only=true')
      if (!res.ok) return
      const rows: unknown = await res.json()
      if (!Array.isArray(rows)) return
      const next: Record<string, number> = {}
      for (const row of rows as { type?: string }[]) {
        const key = row.type ? navBadgeKey(row.type, portal) : undefined
        if (key) next[key] = (next[key] ?? 0) + 1
      }
      setCounts(next)
    } catch { /* badges are a convenience; never surface a failure */ }
  }, [portal])

  useEffect(() => {
    if (!enabled) return
    const initial = setTimeout(() => { void load() }, 0)
    const timer = setInterval(() => { if (!document.hidden) void load() }, POLL_MS)
    const onChanged = () => { void load() }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    }
  }, [enabled, load])

  return counts
}

/** Small count pill shown at the right edge of a sidebar item. Renders nothing for 0. */
export function NavBadge({ count, navKey, className = '' }: { count?: number; navKey: string; className?: string }) {
  if (!count || count < 1) return null
  return (
    <span
      data-testid={`nav-badge-${navKey}`}
      aria-label={`${count} unread notification${count === 1 ? '' : 's'}`}
      className={`ml-auto inline-flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
