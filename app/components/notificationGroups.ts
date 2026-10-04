// Which feature a notification belongs to, and how to summarise a pile of them.
// The bell groups by this so "12 notifications" reads as "Exams · 7, Marks & Results · 5".
// One primary group per type, so nothing is ever counted twice.

export type NotificationGroupId = 'exams' | 'marks' | 'messages' | 'cover' | 'other'

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroupId, string> = {
  exams: 'Exams',
  marks: 'Marks & Results',
  messages: 'Messages',
  cover: 'Timetable & Cover',
  other: 'Other',
}

// type -> [group, short label used in the summary line]
const TYPES: Record<string, [NotificationGroupId, string]> = {
  exam_scheduled: ['exams', 'New exam'],
  exam_updated: ['exams', 'Rescheduled'],
  exam_cancelled: ['exams', 'Cancelled'],
  exam_reminder_7day: ['exams', '7-day reminder'],
  exam_reminder_1day: ['exams', 'Tomorrow'],
  exam_reminder_today: ['exams', 'Today'],
  exam_entry_open: ['exams', 'Marks open'],
  exam_reviewed: ['exams', 'Ready to release'],
  marks_entry_required: ['marks', 'Enter marks'],
  marks_entry_nudge: ['marks', 'Reminder'],
  marks_submitted: ['marks', 'Submitted'],
  marks_published: ['marks', 'Published'],
  marks_released: ['marks', 'Results out'],
  ack_nudge: ['marks', 'Sign-off needed'],
  ack_completed: ['marks', 'Signed off'],
  teacher_broadcast: ['messages', 'Message'],
  period_delay: ['cover', 'Delay'],
  substitute_needed: ['cover', 'Cover needed'],
  substitute_assigned: ['cover', 'Cover assigned'],
}

export function groupOf(type: string): NotificationGroupId {
  return TYPES[type]?.[0] ?? 'other'
}

function shortLabel(type: string): string {
  return TYPES[type]?.[1] ?? type.replace(/_/g, ' ')
}

export type NotificationGroup<T> = {
  id: NotificationGroupId
  label: string
  items: T[]
  unread: number
  summary: string
}

// Newest-first input stays newest-first inside each group; groups are ordered by unread count.
export function buildGroups<T extends { type: string; is_read: boolean }>(items: T[]): NotificationGroup<T>[] {
  const byGroup = new Map<NotificationGroupId, T[]>()
  for (const n of items) {
    const id = groupOf(n.type)
    const list = byGroup.get(id)
    if (list) list.push(n)
    else byGroup.set(id, [n])
  }
  return [...byGroup.entries()]
    .map(([id, list]) => ({
      id,
      label: NOTIFICATION_GROUP_LABELS[id],
      items: list,
      unread: list.filter(n => !n.is_read).length,
      summary: summarise(list),
    }))
    .sort((a, b) => b.unread - a.unread)
}

// "Today ×3, Tomorrow ×2 +1 more" — the two most common kinds, so the user can decide whether to open the group.
function summarise(list: { type: string }[]): string {
  const counts = new Map<string, number>()
  for (const n of list) counts.set(shortLabel(n.type), (counts.get(shortLabel(n.type)) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 2).map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(', ')
  const rest = ranked.length - 2
  return rest > 0 ? `${top} +${rest} more` : top
}
