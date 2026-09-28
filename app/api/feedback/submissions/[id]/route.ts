import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/feedback/submissions/[id] — single submission + its ratings, in the
// same shape as a /api/feedback/submissions list row (QR folder title, category
// icons) so the Issue Pipeline can open it in the shared detail panel.
// has_voice tells the client whether to offer a play button that hits the
// separate session-gated /api/feedback/voice/[id] route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rows: [submission] } = await pool.query(
      `SELECT s.id, s.school_id, s.role, s.is_anonymous, s.submitter_name, s.submitter_phone,
              s.quick_pick_tags, s.free_text, (s.voice_object_key IS NOT NULL) AS has_voice, s.created_at,
              s.advanced_form_type, s.advanced_form_data, s.qr_point_id, p.title AS qr_point_title, s.archived_at
       FROM feedback_submissions s
       LEFT JOIN feedback_qr_points p ON p.id = s.qr_point_id
       WHERE s.id = $1`,
      [id]
    )
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const access = await requireFeeAccess(submission.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { rows: ratings } = await pool.query(
      `SELECT r.id, r.category_key, r.category_label, c.icon, r.department, r.rating, r.priority, r.status
       FROM feedback_submission_ratings r
       LEFT JOIN feedback_categories c ON c.id = r.category_id
       WHERE r.submission_id = $1 ORDER BY r.id`,
      [id]
    )

    return NextResponse.json({ ...submission, ratings })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
