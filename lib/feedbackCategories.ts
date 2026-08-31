// Fixed, hardcoded feedback categories — NOT admin-configurable (product
// decision for v1). Shared by the public submit form, the Zod validator on
// POST /api/feedback/submit, and the school-admin filter dropdown. The
// `value` strings are also the exact values allowed by the CHECK constraint
// on school_feedback.category in lib/db.ts — keep both in sync if this ever
// changes.
export const FEEDBACK_CATEGORIES = [
  { value: 'academics', label: 'Academics' },
  { value: 'facilities', label: 'Facilities & Infrastructure' },
  { value: 'staff', label: 'Staff & Teachers' },
  { value: 'administration', label: 'Administration' },
  { value: 'safety', label: 'Safety & Security' },
  { value: 'other', label: 'Other' },
] as const

export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]['value']

export const FEEDBACK_CATEGORY_VALUES = FEEDBACK_CATEGORIES.map(c => c.value) as [FeedbackCategory, ...FeedbackCategory[]]

export function feedbackCategoryLabel(value: string): string {
  return FEEDBACK_CATEGORIES.find(c => c.value === value)?.label ?? value
}
