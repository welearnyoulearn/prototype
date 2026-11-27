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

// Where a tapped push opens in the teacher mobile app (wlyl-teacher-mobile), mirroring the web teacher
// bell's destinations: marks work opens that class's Marks & Results (and the exam, when known), exam
// schedule changes the Exam Schedule, student doubts the Doubts screen, a syllabus nudge the Syllabus;
// anything else opens Notifications. Paths are the app's expo-router routes.
const TEACHER_SCHEDULE_TYPES = EXAM_LIST_TYPES
const TEACHER_CLASS_TYPES = new Set(['marks_entry_required', 'marks_entry_nudge', 'marks_submitted', 'exam_entry_open', 'ack_completed'])
const TEACHER_DOUBT_TYPES = new Set(['doubt_new', 'doubt_reopened', 'doubt_clarified'])

function positiveId(data: unknown, key: string): number | null {
  if (!data || typeof data !== 'object') return null
  const id = Number((data as Record<string, unknown>)[key])
  return Number.isInteger(id) && id > 0 ? id : null
}

export function teacherAppLink(type: string, data: unknown): string {
  if (TEACHER_SCHEDULE_TYPES.has(type)) return '/exam-schedule'
  if (TEACHER_DOUBT_TYPES.has(type)) return '/doubts'
  if (type === 'syllabus_behind_nudge') return '/syllabus'
  if (TEACHER_CLASS_TYPES.has(type)) {
    const classId = positiveId(data, 'class_id')
    if (!classId) return '/classes'
    const examId = positiveId(data, 'exam_id')
    return `/class/${classId}?tab=marks${examId ? `&examId=${examId}` : ''}`
  }
  return '/notifications'
}

// Where a tapped push opens in the student mobile app (wlyl-student-mobile, #552). Paths are the app's
// expo-router routes; anything without a screen of its own opens Notifications.
const STUDENT_RESULT_TYPES = new Set(['marks_released'])
const STUDENT_DOUBT_TYPES = new Set(['doubt_answered', 'doubt_explained', 'doubt_reopened', 'doubt_clarified'])

export function studentAppLink(type: string, data: unknown): string {
  if (STUDENT_RESULT_TYPES.has(type)) {
    const examId = positiveId(data, 'exam_id')
    return examId ? `/marks/${examId}` : '/progress'
  }
  if (STUDENT_DOUBT_TYPES.has(type) || type.startsWith('doubt_')) return '/doubts'
  if (type.startsWith('daily_quiz')) return '/quiz'
  if (type === 'daily_newspaper') return '/newspaper'
  if (type === 'birthday') return '/class-circle'
  return '/notifications'
}
