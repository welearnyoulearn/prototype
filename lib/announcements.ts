import { z } from 'zod'
import { TEMPLATE_KEYS } from '@/lib/announcementTemplates'

export const ANNOUNCEMENT_TYPES = ['general', 'circular', 'event', 'alert'] as const
export const ANNOUNCEMENT_PRIORITIES = ['normal', 'high', 'urgent'] as const
export const ANNOUNCEMENT_STATUSES = ['draft', 'published'] as const
const INDIVIDUAL_AUDIENCES = ['teachers', 'students', 'parents'] as const

// 'all', or a comma-separated subset of teachers / students / parents.
const audience = z.string().trim().refine(
  v => v.split(',').map(s => s.trim()).every(p => p === 'all' || (INDIVIDUAL_AUDIENCES as readonly string[]).includes(p)),
  'Invalid target_audience'
)

// YYYY-MM-DD, and a real calendar date
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expires_at must be YYYY-MM-DD').refine(v => !isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid expires_at')

// An ISO date-time (what <input type="datetime-local"> + a timezone offset produces) — used for scheduling.
const dateTime = z.string().refine(v => !isNaN(Date.parse(v)), 'publish_at must be a valid date and time')

const title = z.string().trim().min(1, 'title required').max(200, 'title must be 200 characters or fewer')
const content = z.string().trim().min(1, 'content required').max(5000, 'content must be 5000 characters or fewer')

// Which classes see it. section null = every section of that grade. Applies to students, their parents
// and the teachers of those classes; teachers/students/parents outside the list do not see it.
const targetClasses = z.array(z.object({
  grade: z.string().trim().min(1).max(20),
  section: z.string().trim().min(1).max(10).nullable(),
})).max(300)

const cardData = z.object({ headline: z.string().trim().min(1).max(120) })

const translationEntry = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().max(5000).optional(),
})
const translations = z.object({ te: translationEntry.optional(), hi: translationEntry.optional() })

const shared = {
  announcement_type: z.enum(ANNOUNCEMENT_TYPES),
  target_audience: audience,
  priority: z.enum(ANNOUNCEMENT_PRIORITIES),
  status: z.enum(ANNOUNCEMENT_STATUSES),
  pinned: z.boolean(),
  requires_ack: z.boolean(),
  template_key: z.enum(TEMPLATE_KEYS as [string, ...string[]]).nullable(),
  card_data: cardData.nullable(),
  target_classes: targetClasses.nullable(),
  translations: translations.nullable(),
}
const expiresAt = z.union([dateOnly, z.literal(''), z.null()])
const publishAt = z.union([dateTime, z.literal(''), z.null()])

export const AnnouncementCreateSchema = z.object({
  school_id: z.union([z.number(), z.string()]),
  title,
  content,
  announcement_type: shared.announcement_type.default('general'),
  target_audience: shared.target_audience.default('all'),
  priority: shared.priority.default('normal'),
  status: shared.status.default('published'),
  pinned: shared.pinned.default(false),
  requires_ack: shared.requires_ack.default(false),
  template_key: shared.template_key.optional(),
  card_data: shared.card_data.optional(),
  target_classes: shared.target_classes.optional(),
  translations: shared.translations.optional(),
  expires_at: expiresAt.optional(),
  publish_at: publishAt.optional(),
})

export const AnnouncementPatchSchema = z.object({
  title: title.optional(),
  content: content.optional(),
  announcement_type: shared.announcement_type.optional(),
  target_audience: shared.target_audience.optional(),
  priority: shared.priority.optional(),
  status: shared.status.optional(),
  pinned: shared.pinned.optional(),
  requires_ack: shared.requires_ack.optional(),
  template_key: shared.template_key.optional(),
  card_data: shared.card_data.optional(),
  target_classes: shared.target_classes.optional(),
  translations: shared.translations.optional(),
  // null or '' clears the expiry / the schedule; a value sets it
  expires_at: expiresAt.optional().transform(v => (v === undefined ? undefined : v === '' ? null : v)),
  publish_at: publishAt.optional().transform(v => (v === undefined ? undefined : v === '' ? null : v)),
})

// Stored form of an audience: all three individual audiences collapse to 'all'; order is stable.
export function normaliseAudience(raw: string): string {
  const parts = Array.from(new Set(raw.split(',').map(s => s.trim()).filter(Boolean)))
  if (parts.includes('all')) return 'all'
  const ordered = INDIVIDUAL_AUDIENCES.filter(a => parts.includes(a))
  return ordered.length === INDIVIDUAL_AUDIENCES.length ? 'all' : ordered.join(',')
}

// Same class listed twice / a grade-wide entry plus one of its sections collapses to the grade-wide entry.
export type TargetClass = { grade: string; section: string | null }
export function normaliseClasses(list: TargetClass[] | null | undefined): TargetClass[] | null {
  if (!list || list.length === 0) return null
  const wholeGrades = new Set(list.filter(c => c.section === null).map(c => c.grade))
  const seen = new Set<string>()
  const out: TargetClass[] = []
  for (const c of list) {
    if (c.section !== null && wholeGrades.has(c.grade)) continue
    const key = `${c.grade}|${c.section ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

// Does a (grade, section) fall inside a target list? null list = whole school.
export function classMatches(targets: TargetClass[] | null | undefined, grade: string | null, section: string | null): boolean {
  if (!targets || targets.length === 0) return true
  if (!grade) return false
  return targets.some(t => t.grade === grade && (t.section === null || t.section === section))
}

// The audience roles a stored target_audience value reaches
export function audienceRoles(raw: string): Array<'teacher' | 'student' | 'parent'> {
  if (raw === 'all') return ['teacher', 'student', 'parent']
  const parts = raw.split(',').map(s => s.trim())
  const roles: Array<'teacher' | 'student' | 'parent'> = []
  if (parts.includes('teachers')) roles.push('teacher')
  if (parts.includes('students')) roles.push('student')
  if (parts.includes('parents')) roles.push('parent')
  return roles
}
