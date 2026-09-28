import type { AdvancedFormType } from '@/app/feedback/[code]/types'

export interface SubmissionRating {
  category_key: string
  category_label: string
  icon: string | null
  rating: number
  priority: string | null
  status: string
}

export interface Submission {
  id: number
  role: string
  is_anonymous: boolean
  submitter_name: string | null
  submitter_phone: string | null
  quick_pick_tags: string | null
  free_text: string | null
  has_voice: boolean
  created_at: string
  ratings: SubmissionRating[]
  advanced_form_type: AdvancedFormType | null
  advanced_form_data: Record<string, string> | null
  qr_point_id: number | null
  qr_point_title: string | null
  archived_at?: string | null
}

export const RATING_FACE: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😭', label: 'Terrible' },
  2: { emoji: '😞', label: 'Bad' },
  3: { emoji: '😐', label: 'Okay' },
  4: { emoji: '😊', label: 'Good' },
  5: { emoji: '🤩', label: 'Amazing' },
}

// Rating → tint for chips/avatars. Always shown next to the face emoji +
// label, so the colour is never the only cue.
export function ratingTint(rating: number): { chip: string; avatar: string } {
  if (rating <= 2) return { chip: 'border-rose-200 bg-rose-50 text-rose-800', avatar: 'bg-rose-100' }
  if (rating < 4) return { chip: 'border-amber-200 bg-amber-50 text-amber-800', avatar: 'bg-amber-100' }
  return { chip: 'border-emerald-200 bg-emerald-50 text-emerald-800', avatar: 'bg-emerald-100' }
}

export function avgRating(s: Submission): number | null {
  if (s.ratings.length === 0) return null
  return s.ratings.reduce((sum, r) => sum + r.rating, 0) / s.ratings.length
}

export type Mood = 'happy' | 'neutral' | 'unhappy'
// Any 1–2 rating makes the whole submission "unhappy" — one bad experience
// is what the school needs to see, even if other categories were fine.
export function moodOf(s: Submission): Mood | null {
  if (s.ratings.length === 0) return null
  if (s.ratings.some(r => r.rating <= 2)) return 'unhappy'
  return (avgRating(s) ?? 0) >= 4 ? 'happy' : 'neutral'
}

export function hasOpenIssue(s: Submission): boolean {
  return s.ratings.some(r => r.priority && r.status === 'open')
}

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function exactTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// "Today" / "Yesterday" / "Sat, 12 Sept" — list group headers
export function dayGroup(iso: string): string {
  const d = new Date(iso)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}
