import pool from '@/lib/db'
import { DEFAULT_FEEDBACK_FIELD_CONFIG, normalizeFieldConfig, type FeedbackFieldConfig } from '@/lib/feedbackFields'

// Server-only (touches the DB pool) — kept out of lib/feedbackFields.ts so that
// client component (the public form page) can import the field constants
// without pulling `pg` into the browser bundle.
export async function getFieldConfig(schoolId: number): Promise<FeedbackFieldConfig> {
  const { rows: [row] } = await pool.query(
    `SELECT field_config FROM school_feedback_form_config WHERE school_id = $1`,
    [schoolId]
  )
  return row ? normalizeFieldConfig(row.field_config) : DEFAULT_FEEDBACK_FIELD_CONFIG
}
