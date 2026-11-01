import { test, expect } from '@playwright/test'
import { pickPopupNotices, POPUP_MAX_COUNT } from '../lib/announcementPopup'
import type { NoticeItem } from '../components/announcements/types'

// Which announcements pop up (issue #482): unseen, recent, never more than three. No database needed.
const NOW = Date.parse('2026-11-01T10:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const notice = (id: number, over: Partial<NoticeItem> = {}): NoticeItem => ({
  id, title: `N${id}`, content: 'c', announcement_type: 'general', target_audience: 'all', priority: 'normal',
  created_by_name: null, expires_at: null, created_at: daysAgo(1), pinned: false, requires_ack: false,
  template_key: null, card_data: null, target_classes: null, translations: null, seen: false, ...over,
})

test.describe('Announcement popup rules', () => {
  test('an unseen ordinary announcement pops up', () => {
    expect(pickPopupNotices([notice(1)], NOW).map(n => n.id)).toEqual([1])
  })
  test('a seen announcement never pops up again', () => {
    expect(pickPopupNotices([notice(1, { seen: true })], NOW)).toEqual([])
  })
  test('at most three pop up; the rest stay unread in the tab', () => {
    const list = [1, 2, 3, 4, 5].map(i => notice(i))
    expect(pickPopupNotices(list, NOW).map(n => n.id)).toEqual([1, 2, 3])
    expect(POPUP_MAX_COUNT).toBe(3)
  })
  test('someone who was away does not get old notices as popups', () => {
    expect(pickPopupNotices([notice(1, { created_at: daysAgo(40) }), notice(2, { published_at: daysAgo(2) })], NOW).map(n => n.id)).toEqual([2])
  })
})
