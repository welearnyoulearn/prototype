import { z } from 'zod'

export const FEEDBACK_ROLE_VALUES = ['parent', 'student', 'teacher', 'visitor', 'other'] as const

export const feedbackRatingSchema = z.object({
  category_key: z.string().min(1).max(50),
  rating: z.number().int().min(1).max(5),
})

// Public POST /api/feedback/submit body. name/phone are accepted even when
// is_anonymous is true — the route itself is the enforcement point that
// drops them server-side regardless of what the client sent, so this schema
// only checks shape, not the anonymity rule.
export const feedbackSubmitSchema = z.object({
  code: z.string().min(1).max(20),
  role: z.enum(FEEDBACK_ROLE_VALUES),
  is_anonymous: z.boolean(),
  name: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(50).optional(),
  ratings: z.array(feedbackRatingSchema).min(1, 'At least one category rating is required').max(20, 'Too many ratings in one submission'),
  quick_picks: z.array(z.string().max(100)).max(20).optional(),
  free_text: z.string().trim().max(2000).optional(),
  voice_key: z.string().max(255).optional(),
})

export const feedbackVoiceUploadUrlSchema = z.object({
  code: z.string().min(1).max(20),
})

export const feedbackCategoryCreateSchema = z.object({
  school_id: z.number().int().positive(),
  role: z.enum(FEEDBACK_ROLE_VALUES),
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

export const feedbackSettingsUpdateSchema = z.object({
  school_id: z.number().int().positive(),
  is_active: z.boolean(),
})

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
