import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { feedbackIssueUpdateSchema } from '@/lib/validation/feedback'

// PATCH /api/feedback/issues/[id] — [id] is a feedback_submission_ratings.id
// Body: { status?, priority?, department? } — status workflow + manual overrides.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [rating] } = await pool.query(
      `SELECT school_id FROM feedback_submission_ratings WHERE id = $1`,
      [id]
    )
    if (!rating) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const access = await requireFeeAccess(rating.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = feedbackIssueUpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { status, priority, department } = parsed.data
    if (status === undefined && priority === undefined && department === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const sets: string[] = []
    const values: unknown[] = []
    if (status !== undefined)     { values.push(status);     sets.push(`status = $${values.length}`) }
    if (priority !== undefined)   { values.push(priority);   sets.push(`priority = $${values.length}`) }
    if (department !== undefined) { values.push(department); sets.push(`department = $${values.length}`) }
    values.push(id)

    const { rows: [row] } = await pool.query(
      `UPDATE feedback_submission_ratings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    )
    return NextResponse.json(row)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
