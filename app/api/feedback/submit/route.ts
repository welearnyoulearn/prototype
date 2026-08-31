import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { FEEDBACK_CATEGORY_VALUES } from '@/lib/feedbackCategories'
import { MAX_FEEDBACK_IMAGES, type FeedbackFieldConfig } from '@/lib/feedbackFields'
import { getFieldConfig } from '@/lib/feedbackFieldsServer'

// Cloudinary URLs an image field is allowed to reference — anything else is
// rejected rather than stored/rendered, since it didn't come through our own
// signed upload flow (see /api/feedback/upload-sign).
const cloudinaryUrlPattern = process.env.CLOUDINARY_CLOUD_NAME
  ? new RegExp(`^https://res\\.cloudinary\\.com/${process.env.CLOUDINARY_CLOUD_NAME}/`)
  : null

// No auth required — public anonymous submission, same pattern as
// app/api/parent/lookup/route.ts.
// Known limitation: no rate-limiting/spam protection in v1 (see DOCS/KNOWN_ISSUES.md).
const SubmitSchema = z.object({
  school_id: z.coerce.number().int().positive(),
  category: z.enum(FEEDBACK_CATEGORY_VALUES).optional(),
  message: z.string().trim().min(1, 'Message is required').max(2000, 'Message is too long'),
  name: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  images: z.array(z.string().url()).max(MAX_FEEDBACK_IMAGES).optional(),
})

// Cross-checks the payload against the school's live field config — the
// authority on what's required/allowed is the config, never the client.
// Returns an error string, or null if the payload passes.
function validateAgainstConfig(
  data: z.infer<typeof SubmitSchema>,
  fields: FeedbackFieldConfig
): string | null {
  if (fields.category.required && !data.category) return 'Category is required'
  if (fields.name.required && !data.name?.trim()) return 'Name is required'
  if (fields.phone.required && !data.phone?.trim()) return 'Phone number is required'
  if (fields.email.required && !data.email?.trim()) return 'Email is required'
  if (fields.rating.required && !data.rating) return 'Rating is required'
  if (fields.photo.required && !data.images?.length) return 'At least one photo is required'
  if (data.images?.length && cloudinaryUrlPattern) {
    if (data.images.some(url => !cloudinaryUrlPattern.test(url))) return 'Invalid image reference'
  }
  return null
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data

  try {
    const { rows: [school] } = await pool.query(
      `SELECT id, status FROM schools WHERE id = $1`, [data.school_id]
    )
    if (!school || school.status !== 'active') {
      return NextResponse.json({ error: 'school_not_found' }, { status: 404 })
    }

    const fields = await getFieldConfig(data.school_id)
    const validationError = validateAgainstConfig(data, fields)
    if (validationError) {
      return NextResponse.json({ error: 'invalid_input', message: validationError }, { status: 400 })
    }

    // A disabled field's value is dropped here, never stored — turning a field
    // off in Form Settings is a privacy guarantee, not just a UI hint.
    await pool.query(
      `INSERT INTO school_feedback (school_id, category, message, name, phone, email, rating, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.school_id,
        fields.category.enabled ? data.category ?? null : null,
        data.message,
        fields.name.enabled ? data.name?.trim() || null : null,
        fields.phone.enabled ? data.phone?.trim() || null : null,
        fields.email.enabled ? data.email?.trim() || null : null,
        fields.rating.enabled ? data.rating ?? null : null,
        JSON.stringify(fields.photo.enabled ? data.images ?? [] : []),
      ]
    )
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('POST /api/feedback/submit error:', err)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }
}
