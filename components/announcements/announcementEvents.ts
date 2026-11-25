// Tiny browser event so the popup, the dashboard card, the Announcements tab and the nav badge
// stay in step without each re-reading the list after every change.
export const ANNOUNCEMENTS_CHANGED = 'wlyl:announcements-changed'

export function announceChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED))
}

// `as=` for the announcement APIs: which portal this page is. One browser can be signed in to several
// portals at once (e.g. a school admin who also opens the parent portal); the server then uses only this
// portal's session, so "seen" / "acknowledged" are recorded for the right person and the popup shows once.
export function readerAs(): string {
  if (typeof window === 'undefined') return ''
  const m = window.location.pathname.match(/^\/(teacher|student|parent)(\/|$)/)
  return m ? `as=${m[1]}` : ''
}

// Appends `as=` to an announcements URL (keeps any existing query string).
export function withReader(url: string): string {
  const as = readerAs()
  if (!as) return url
  return url + (url.includes('?') ? '&' : '?') + as
}
