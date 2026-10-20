// Where a tapped push notification should open, for the installed parent app (the wlyl-parent-app PWA).
//
// The platform knows the notification type and its data; the PWA owns its own routes. The platform
// hands the PWA a path ("/exams/12") in the push data and the PWA's service worker opens it. Other
// portals (the web bell) ignore it: their service worker just focuses the open window.
//
// Paths are the parent app's routes: /exams, /exams/[id], /attendance, /fees, /notifications.

export type PushRole = 'teacher' | 'student' | 'parent' | 'school'

const EXAM_LIST_TYPES = new Set([
  'exam_scheduled', 'exam_updated', 'exam_cancelled',
  'exam_reminder_7day', 'exam_reminder_1day', 'exam_reminder_today',
])
// These carry data.exam_id and land on that exam's mark sheet.
const EXAM_DETAIL_TYPES = new Set(['marks_released', 'ack_nudge'])

function examIdOf(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const id = Number((data as { exam_id?: unknown }).exam_id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** App path to open for a push, or null when the recipient's portal has no deep links. */
export function pushLinkFor(role: PushRole, type: string, data: unknown): string | null {
  if (role !== 'parent') return null
  if (EXAM_DETAIL_TYPES.has(type)) {
    const id = examIdOf(data)
    return id ? `/exams/${id}` : '/exams'
  }
  if (EXAM_LIST_TYPES.has(type)) return '/exams'
  return '/notifications'
}

// The mobile app (wlyl-parent-mobile) opens only its top-level screens from a push (src/lib/push.ts
// routeForPush) and sends anything else to /notifications, so an exam link becomes the exam list there.
export function mobilePushLink(link: string | null): string {
  if (!link) return '/notifications'
  return link.startsWith('/exams/') ? '/exams' : link
}
