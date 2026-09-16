'use client'

import { useCallback, useState } from 'react'

// In-app Back/Forward for a portal's top-level nav (activeNav-style state) —
// not the browser's history/URL. `current` is derived from history[index] so
// it can never drift out of sync with the stack; navigate() truncates any
// "forward" entries past the current point, same as normal browser history.
export function useNavHistory<T extends string>(initial: T) {
  const [nav, setNav] = useState<{ history: T[]; index: number }>({ history: [initial], index: 0 })
  const current = nav.history[nav.index]

  const navigate = useCallback((key: T) => {
    setNav(prev => {
      if (prev.history[prev.index] === key) return prev
      const truncated = prev.history.slice(0, prev.index + 1)
      return { history: [...truncated, key], index: truncated.length }
    })
  }, [])

  const goBack = useCallback(() => {
    setNav(prev => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev))
  }, [])

  const goForward = useCallback(() => {
    setNav(prev => (prev.index < prev.history.length - 1 ? { ...prev, index: prev.index + 1 } : prev))
  }, [])

  // Clears the whole stack instead of pushing onto it — for cases where the
  // history genuinely no longer applies (e.g. a parent portal switching
  // between children: "back" targets belonged to the previous child's data).
  const reset = useCallback((key: T) => {
    setNav({ history: [key], index: 0 })
  }, [])

  return {
    current,
    navigate,
    goBack,
    goForward,
    reset,
    canGoBack: nav.index > 0,
    canGoForward: nav.index < nav.history.length - 1,
  }
}
