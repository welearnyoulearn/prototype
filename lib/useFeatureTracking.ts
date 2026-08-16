'use client'

import { useCallback, useRef } from 'react'

// Returns a trackOpen(navKey) function to call from a portal's navigateTo —
// fire-and-forget, deduped per nav_key per tab session so rapidly re-clicking
// the same tab doesn't spam rows (still re-tracks after a different tab is
// visited in between, since that's a genuine re-open).
export function useFeatureTracking(portal: 'school-admin' | 'teacher' | 'student' | 'parent' | 'platform-admin') {
  const lastKey = useRef<string | null>(null)

  return useCallback((navKey: string) => {
    if (lastKey.current === navKey) return
    lastKey.current = navKey
    fetch('/api/usage/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal, navKey }),
      keepalive: true,
    }).catch(() => {})
  }, [portal])
}
