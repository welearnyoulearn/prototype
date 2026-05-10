import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ensureDB } from '@/lib/db'
import { awardPoints } from '@/lib/rewards'

// POST /api/hub/complete
// Body: { student_id, school_id, activity_type, score?, points }
// Records a hub activity completion for today and awards points.
// Idempotent: second submission for the same activity on the same day is silently ignored.
export async function POST(req: NextRequest) {
  await ensureDB()
  try {
    const { student_id, school_id, activity_type, score = 0, points } = await req.json()

    if (!student_id || !school_id || !activity_type || points === undefined)
      return NextResponse.json({ error: 'student_id, school_id, activity_type, points required' }, { status: 400 })

    const result = await pool.query(
      `INSERT INTO student_hub_completions
         (student_id, school_id, activity_type, completed_date, score, points_earned)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)
       ON CONFLICT (student_id, activity_type, completed_date) DO NOTHING
       RETURNING id`,
      [student_id, school_id, activity_type, score, points]
    )

    if ((result.rowCount ?? 0) > 0 && points > 0) {
      await awardPoints(student_id, school_id, `hub_${activity_type}`, undefined, undefined, points, 'marketplace')
    }

    return NextResponse.json({ ok: true, points_earned: points, already_done: (result.rowCount ?? 0) === 0 })
  } catch (err) {
    console.error('hub/complete error:', err)
    return NextResponse.json({ error: 'Failed to record completion' }, { status: 500 })
  }
}
