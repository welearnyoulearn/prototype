import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/feedback/submissions/[id] — single submission + its ratings.
// has_voice tells the client whether to offer a play button that hits the
// separate session-gated /api/feedback/voice/[id] route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [submission] } = await pool.query(
      `SELECT id, school_id, role, is_anonymous, submitter_name, submitter_phone,
              quick_pick_tags, free_text, (voice_object_key IS NOT NULL) AS has_voice, created_at,
              advanced_form_type, advanced_form_data
       FROM feedback_submissions WHERE id = $1`,
      [id]
    )
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const access = await requireFeeAccess(submission.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { rows: ratings } = await pool.query(
      `SELECT id, category_key, category_label, department, rating, priority, status
       FROM feedback_submission_ratings WHERE submission_id = $1 ORDER BY id`,
      [id]
    )

    return NextResponse.json({ ...submission, ratings })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
