'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Keeps a loading state visible for at least `minMs` once it turns true,
 * so a fetch that resolves in 40ms doesn't flash the loader on/off. Once
 * `isLoading` goes false, the returned value follows after the remaining
 * time (if any) has elapsed — never cuts a loader short, never holds it
 * artificially past its own minimum window.
 */
export function useMinimumDelay(isLoading: boolean, minMs = 350): boolean {
  const [shown, setShown] = useState(isLoading)
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      shownAtRef.current = Date.now()
      setShown(true) // eslint-disable-line react-hooks/set-state-in-effect -- this effect's whole job is synchronizing internal debounced state with the external isLoading prop; same pattern already present elsewhere in the codebase (e.g. app/teacher/components/ClassView.tsx)
      return
    }
    const startedAt = shownAtRef.current
    if (startedAt == null) {
      setShown(false)
      return
    }
    const elapsed = Date.now() - startedAt
    const remaining = Math.max(0, minMs - elapsed)
    const t = setTimeout(() => setShown(false), remaining)
    return () => clearTimeout(t)
  }, [isLoading, minMs])

  return shown
}
