import type { TargetClass } from '@/lib/announcements'

export type Lang = 'en' | 'te' | 'hi'

export type NoticeItem = {
  id: number
  title: string
  content: string
  announcement_type: 'general' | 'circular' | 'event' | 'alert' | string
  target_audience: string
  priority: 'normal' | 'high' | 'urgent' | string
  created_by_name: string | null
  expires_at: string | null
  created_at: string
  updated_at?: string | null
  published_at?: string
  status?: 'draft' | 'published'
  publish_at?: string | null
  pinned: boolean
  requires_ack: boolean
  template_key: string | null
  card_data: { headline: string } | null
  target_classes: TargetClass[] | null
  translations: { te?: { title?: string; content?: string }; hi?: { title?: string; content?: string } } | null
  // readers only
  seen?: boolean
  acked?: boolean
  // staff only
  seen_count?: number
  ack_count?: number
}

// The title / body in the reader's language when the school provided one, else the original
export function localised(n: Pick<NoticeItem, 'title' | 'content' | 'translations'>, lang: Lang): { title: string; content: string } {
  const t = lang === 'en' ? undefined : n.translations?.[lang]
  return { title: t?.title?.trim() || n.title, content: t?.content?.trim() || n.content }
}
