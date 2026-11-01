import type { NoticeItem } from '@/components/announcements/types'

// Someone who was away for a long time is not buried in popups: only notices from the last 14 days
// pop up, at most 3 at a time. Everything else waits in the Announcements tab, marked unread.
export const POPUP_MAX_AGE_DAYS = 14
export const POPUP_MAX_COUNT = 3

// `list` is the reader's live notices in display order (pinned, urgent first, then newest).
export function pickPopupNotices(list: NoticeItem[], now: number = Date.now()): NoticeItem[] {
  const oldest = now - POPUP_MAX_AGE_DAYS * 86_400_000
  return list
    .filter(n => !n.seen && new Date(n.published_at ?? n.created_at).getTime() >= oldest)
    .slice(0, POPUP_MAX_COUNT)
}
