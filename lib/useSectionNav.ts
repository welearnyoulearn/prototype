'use client'

import { useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const PARAM = 'tab'

// Drives a portal's top-level section nav from the URL's `tab` query param
// instead of in-memory React state, so the browser/phone Back button moves
// through the portal's own screens (the way real navigation should behave)
// instead of jumping straight past all of them to whatever page preceded the
// portal. `current` is always read live from the URL, so it can never drift
// out of sync with actual browser history — including on Back/Forward, which
// Next.js already re-renders the page for via its own popstate handling.
export function useSectionNav<T extends string>(defaultSection: T) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = (searchParams.get(PARAM) as T) || defaultSection

  const navigate = useCallback((key: T) => {
    if (key === current) return
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set(PARAM, key)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }, [current, pathname, router, searchParams])

  // For context switches where the in-app "back stack" genuinely no longer
  // applies (e.g. a parent picking a different child) — replaces instead of
  // pushing, so Back doesn't return to a section that belonged to the
  // previous context.
  const reset = useCallback((key: T) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set(PARAM, key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  return { current, navigate, reset }
}
