// Tiny browser event so the popup, the dashboard card, the Announcements tab and the nav badge
// stay in step without each re-reading the list after every change.
export const ANNOUNCEMENTS_CHANGED = 'wlyl:announcements-changed'

export function announceChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED))
}
