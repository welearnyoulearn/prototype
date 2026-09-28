import { z } from 'zod'
import {
  FEEDBACK_ROLE_KEYS, ADVANCED_FORM_TYPE_KEYS, POSTER_QUOTE_MAX, VOICE_CONTENT_TYPES,
  QR_POINT_KIND_KEYS, QR_POINT_FORM_TYPE_KEYS, QR_POINT_ROLE_KEYS,
} from '../feedback-defaults'

export const feedbackRatingSchema = z.object({
  category_key: z.string().min(1).max(50),
  rating: z.number().int().min(1).max(5),
})

// Public POST /api/feedback/submit body. name/phone are accepted even when
// is_anonymous is true — the route itself is the enforcement point that
// drops them server-side regardless of what the client sent, so this schema
// only checks shape, not the anonymity rule.
//
// ratings is optional here (unlike the original "at least one rating"
// requirement) because the Advanced Forms flow (advanced_form_type set)
// skips category ratings entirely in favor of a structured form — the
// route itself enforces "ratings OR advanced_form_type, not neither",
// since that cross-field rule reads more clearly as a plain `if` than as
// a zod union/refine.
export const feedbackSubmitSchema = z.object({
  code: z.string().min(1).max(20),
  role: z.enum(FEEDBACK_ROLE_KEYS),
  is_anonymous: z.boolean(),
  name: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(50).optional(),
  ratings: z.array(feedbackRatingSchema).max(20, 'Too many ratings in one submission').optional(),
  quick_picks: z.array(z.string().max(100)).max(20).optional(),
  free_text: z.string().trim().max(2000).optional(),
  voice_key: z.string().max(255).optional(),
  advanced_form_type: z.enum(ADVANCED_FORM_TYPE_KEYS).optional(),
  advanced_form_data: z.record(z.string().max(50), z.string().trim().max(2000)).optional(),
})

export const feedbackVoiceUploadUrlSchema = z.object({
  code: z.string().min(1).max(20),
  content_type: z.enum(VOICE_CONTENT_TYPES).default('audio/webm'),
})

export const feedbackCategoryCreateSchema = z.object({
  school_id: z.number().int().positive(),
  role: z.enum(FEEDBACK_ROLE_KEYS),
  key: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/, 'key must be lowercase-kebab'),
  label: z.string().trim().min(1).max(100),
  icon: z.string().trim().max(10).optional(),
  department: z.string().trim().max(100).optional(),
})

export const feedbackCategoryUpdateSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  icon: z.string().trim().max(10).optional(),
  department: z.string().trim().max(100).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

// Partial update — send only what changed. poster_quote: '' or null resets
// to DEFAULT_POSTER_QUOTE.
export const feedbackSettingsUpdateSchema = z.object({
  school_id: z.number().int().positive(),
  is_active: z.boolean().optional(),
  poster_quote: z.string().trim().max(POSTER_QUOTE_MAX).nullable().optional(),
}).refine(b => b.is_active !== undefined || b.poster_quote !== undefined, { message: 'Nothing to update' })

export const feedbackRegenerateCodeSchema = z.object({
  school_id: z.number().int().positive(),
})

// 'high'/'medium' only — matches priorityForRating() in the submit route
// (rating 1 -> high, 2 -> medium, 3-5 -> null/not-an-issue) and the admin
// UI's Issue type. Widening this to include 'low' would let an admin PATCH
// a value the rest of the pipeline never produces and doesn't render for.
export const feedbackIssueUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'dismissed']).optional(),
  priority: z.enum(['high', 'medium']).nullable().optional(),
  department: z.string().trim().max(100).optional(),
})

// ── QR points ───────────────────────────────────────────────────────────
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

const qrPointFields = {
  kind: z.enum(QR_POINT_KIND_KEYS),
  title: z.string().trim().min(1, 'Title is required').max(120),
  venue: optionalText(120),
  event_date: isoDate.nullable().optional(),
  details: optionalText(300),
  form_type: z.enum(QR_POINT_FORM_TYPE_KEYS),
  roles: z.array(z.enum(QR_POINT_ROLE_KEYS)).min(1, 'Pick at least one audience').max(QR_POINT_ROLE_KEYS.length),
  category_ids: z.array(z.number().int().positive()).max(50).optional(),
  poster_quote: optionalText(POSTER_QUOTE_MAX),
  closes_on: isoDate.nullable().optional(),
}

export const feedbackQrPointCreateSchema = z.object({
  school_id: z.number().int().positive(),
  ...qrPointFields,
})

export const feedbackQrPointUpdateSchema = z.object({
  ...qrPointFields,
  is_active: z.boolean(),
}).partial()

// POST /api/feedback/archive — Clear folder (archive), or restore / purge the Archive
export const feedbackArchiveSchema = z.object({
  school_id: z.number().int().positive(),
  action: z.enum(['archive', 'restore', 'purge']),
  source: z.string().min(1).max(20),
  older_than_days: z.number().int().min(1).max(3650).nullable().optional(),
})
