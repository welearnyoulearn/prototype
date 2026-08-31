import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { FEEDBACK_FIELD_KEYS, DEFAULT_FEEDBACK_FIELD_CONFIG, normalizeFieldConfig, type FeedbackFieldConfig } from '@/lib/feedbackFields'
import { getFieldConfig } from '@/lib/feedbackFieldsServer'

const FieldSettingSchema = z.object({ enabled: z.boolean(), required: z.boolean() })

const FieldConfigSchema = z.object(
  Object.fromEntries(FEEDBACK_FIELD_KEYS.map(key => [key, FieldSettingSchema.optional()]))
) as z.ZodType<Partial<FeedbackFieldConfig>>

const PutSchema = z.object({
  school_id: z.coerce.number().int().positive(),
  field_config: FieldConfigSchema,
})

export async function GET(req: NextRequest) {
  const schoolId = req.nextUrl.searchParams.get('school_id')
  const access = await requireFeeAccess(schoolId)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    return NextResponse.json({ field_config: await getFieldConfig(access.schoolId) })
  } catch (err) {
    console.error('GET /api/feedback/config error:', err)
    return NextResponse.json({ error: 'Failed to load form settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = PutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { school_id, field_config } = parsed.data

  const access = await requireFeeAccess(school_id)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const { rows: [existing] } = await pool.query(
      `SELECT field_config FROM school_feedback_form_config WHERE school_id = $1`,
      [access.schoolId]
    )
    const merged = normalizeFieldConfig({ ...(existing?.field_config ?? DEFAULT_FEEDBACK_FIELD_CONFIG), ...field_config })

    await pool.query(
      `INSERT INTO school_feedback_form_config (school_id, field_config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (school_id) DO UPDATE SET field_config = $2, updated_at = NOW()`,
      [access.schoolId, JSON.stringify(merged)]
    )
    return NextResponse.json({ field_config: merged })
  } catch (err) {
    console.error('PUT /api/feedback/config error:', err)
    return NextResponse.json({ error: 'Failed to save form settings' }, { status: 500 })
  }
}
