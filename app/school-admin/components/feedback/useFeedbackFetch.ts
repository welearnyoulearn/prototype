import { useCallback, useEffect, useState } from 'react'

// Shared fetch-on-mount/on-dependency-change for the Feedback Management
// admin tabs — all five (Dashboard/Submissions/Issue Pipeline/Categories/
// Settings) previously hand-rolled the identical loading/error/reload
// plumbing. `reload()` lets a component re-fetch after a mutation (e.g.
// after PATCHing a category) without duplicating the fetch logic itself.
export function useFeedbackFetch<T>(url: string, deps: unknown[], errorMessage = 'Failed to load') {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback(() => setReloadToken(t => t + 1), [])

  // Standard fetch-on-mount/on-dependency-change. The react-compiler
  // set-state-in-effect rule flags this shape even when, as here, the
  // effect genuinely reaches out to an external system rather than
  // deriving state from props — see git history on FeedbackDashboardTab.tsx
  // for the fuller investigation into why this rule fires here but not on
  // other fetch-on-mount code elsewhere in the codebase.
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then((json: T) => { if (!cancelled) { setData(json); setError('') } })
      .catch(() => { if (!cancelled) setError(errorMessage) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url, reloadToken, ...deps])
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  return { data, loading, error, reload }
}
