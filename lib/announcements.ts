import { z } from 'zod'

export const ANNOUNCEMENT_TYPES = ['general', 'circular', 'event', 'alert'] as const
export const ANNOUNCEMENT_PRIORITIES = ['normal', 'high', 'urgent'] as const
const INDIVIDUAL_AUDIENCES = ['teachers', 'students', 'parents'] as const

// 'all', or a comma-separated subset of teachers / students / parents.
const audience = z.string().trim().refine(
  v => v.split(',').map(s => s.trim()).every(p => p === 'all' || (INDIVIDUAL_AUDIENCES as readonly string[]).includes(p)),
  'Invalid target_audience'
)

// YYYY-MM-DD, and a real calendar date
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expires_at must be YYYY-MM-DD').refine(v => !isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid expires_at')

const title = z.string().trim().min(1, 'title required').max(200, 'title must be 200 characters or fewer')
const content = z.string().trim().min(1, 'content required').max(5000, 'content must be 5000 characters or fewer')

export const AnnouncementCreateSchema = z.object({
  school_id: z.union([z.number(), z.string()]),
  title,
  content,
  announcement_type: z.enum(ANNOUNCEMENT_TYPES).default('general'),
  target_audience: audience.default('all'),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES).default('normal'),
  expires_at: z.union([dateOnly, z.literal(''), z.null()]).optional(),
})

export const AnnouncementPatchSchema = z.object({
  title: title.optional(),
  content: content.optional(),
  announcement_type: z.enum(ANNOUNCEMENT_TYPES).optional(),
  target_audience: audience.optional(),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES).optional(),
  // null or '' clears the expiry; a date sets it
  expires_at: z.union([dateOnly, z.literal(''), z.null()]).optional().transform(v => (v === undefined ? undefined : v === '' ? null : v)),
})

// Stored form of an audience: all three individual audiences collapse to 'all'; order is stable.
export function normaliseAudience(raw: string): string {
  const parts = Array.from(new Set(raw.split(',').map(s => s.trim()).filter(Boolean)))
  if (parts.includes('all')) return 'all'
  const ordered = INDIVIDUAL_AUDIENCES.filter(a => parts.includes(a))
  return ordered.length === INDIVIDUAL_AUDIENCES.length ? 'all' : ordered.join(',')
}
