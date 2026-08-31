// The fixed palette of optional fields a school admin can turn on/off for their
// public feedback form (issue #99). `message` is intentionally excluded — it's
// always enabled and required, with no toggle, since a feedback form without a
// message field defeats the point of the feature.
export const FEEDBACK_FIELD_KEYS = ['category', 'name', 'phone', 'email', 'rating', 'photo'] as const
export type FeedbackFieldKey = typeof FEEDBACK_FIELD_KEYS[number]

export type FieldSetting = { enabled: boolean; required: boolean }
export type FeedbackFieldConfig = Record<FeedbackFieldKey, FieldSetting>

// Matches exactly what v1 shipped — existing schools see no behavior change
// until an admin opts into the new fields.
export const DEFAULT_FEEDBACK_FIELD_CONFIG: FeedbackFieldConfig = {
  category: { enabled: true, required: true },
  name: { enabled: false, required: false },
  phone: { enabled: false, required: false },
  email: { enabled: false, required: false },
  rating: { enabled: false, required: false },
  photo: { enabled: false, required: false },
}

export const FEEDBACK_FIELD_LABELS: Record<FeedbackFieldKey, string> = {
  category: 'Category',
  name: 'Name',
  phone: 'Phone Number',
  email: 'Email',
  rating: 'Rating',
  photo: 'Photo',
}

export const MAX_FEEDBACK_IMAGES = 3
export const MAX_FEEDBACK_IMAGE_BYTES = 5 * 1024 * 1024

// A field the config marks not-enabled can never be required — normalizes
// whatever a client (or a stale DB row) sends into a consistent shape.
export function normalizeFieldConfig(partial: Partial<FeedbackFieldConfig> | null | undefined): FeedbackFieldConfig {
  const out = { ...DEFAULT_FEEDBACK_FIELD_CONFIG }
  for (const key of FEEDBACK_FIELD_KEYS) {
    const setting = partial?.[key]
    if (!setting) continue
    out[key] = { enabled: !!setting.enabled, required: !!setting.enabled && !!setting.required }
  }
  return out
}
