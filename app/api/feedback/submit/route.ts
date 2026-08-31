import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { FEEDBACK_CATEGORY_VALUES } from '@/lib/feedbackCategories'

// No auth required — public anonymous submission, same pattern as
// app/api/parent/lookup/route.ts. No name/contact/rating fields on purpose.
// Known limitation: no rate-limiting/spam protection in v1 (see docs/KNOWN_ISSUES.md).
const SubmitSchema = z.object({
  school_id: z.coerce.number().int().positive(),
  category: z.enum(FEEDBACK_CATEGORY_VALUES),
  message: z.string().trim().min(1, 'Message is required').max(2000, 'Message is too long'),
})

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
  const { school_id, category, message } = parsed.data

  try {
    const { rows: [school] } = await pool.query(
      `SELECT id, status FROM schools WHERE id = $1`, [school_id]
    )
    if (!school || school.status !== 'active') {
      return NextResponse.json({ error: 'school_not_found' }, { status: 404 })
    }

    await pool.query(
      `INSERT INTO school_feedback (school_id, category, message) VALUES ($1, $2, $3)`,
      [school_id, category, message]
    )
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    console.error('POST /api/feedback/submit error:', err)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }
}
