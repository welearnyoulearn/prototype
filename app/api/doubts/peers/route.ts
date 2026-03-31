import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/doubts/peers?class_id=&school_id=&student_id=
// Returns anonymized open/in-progress doubts from classmates.
// - Names replaced with "Anonymous"
// - is_mine: true if this is the requesting student's own doubt
// - has_upvoted: true if student already upvoted
// - Excludes resolved doubts (they are surfaced as FAQs instead)
export async function GET(req: NextRequest) {
  await ensureDB()
  const { searchParams } = req.nextUrl
  const school_id  = searchParams.get('school_id')
  const class_id   = searchParams.get('class_id')
  const student_id = searchParams.get('student_id')

  if (!school_id || !class_id || !student_id) {
    return NextResponse.json({ error: 'school_id, class_id and student_id required' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `SELECT
      d.id,
      d.subject,
      d.question,
      d.status,
      d.created_at,
      d.last_message_at,
      d.message_count,
      d.upvote_count,
      d.task_id,
      tk.title AS task_title,
      -- is_mine: student can see it's their own doubt (no anonymization needed)
      (d.student_id = $3) AS is_mine,
      -- has_upvoted: did this student upvote it?
      EXISTS (
        SELECT 1 FROM doubt_upvotes u
        WHERE u.doubt_id = d.id AND u.student_id = $3
      ) AS has_upvoted
     FROM doubts d
     LEFT JOIN tasks tk ON tk.id = d.task_id
     WHERE d.class_id = $1
       AND d.school_id = $2
       AND d.status IN ('open', 'in_progress')
     ORDER BY
       -- Prioritise by upvotes, then recency
       d.upvote_count DESC,
       COALESCE(d.last_message_at, d.created_at) DESC`,
    [class_id, school_id, student_id]
  )

  // Anonymize: strip identifying info for peer doubts
  const anonymized = rows.map(r => ({
    id: r.id,
    subject: r.subject,
    question: r.question,
    status: r.status,
    created_at: r.created_at,
    last_message_at: r.last_message_at,
    message_count: r.message_count,
    upvote_count: r.upvote_count,
    task_title: r.task_title,
    is_mine: r.is_mine,
    has_upvoted: r.has_upvoted,
    // Never expose student name/roll for peer doubts
    display_name: r.is_mine ? 'You' : 'Anonymous',
  }))

  return NextResponse.json(anonymized)
}
