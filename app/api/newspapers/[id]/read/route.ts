import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { awardPoints } from '@/lib/rewards'

// POST /api/newspapers/[id]/read { school_id, student_id, quiz_result?: 'correct' | 'wrong' | 'skipped' }
// Marks newspaper as read (idempotent) and handles quiz points.
// Points: always +1 for reading, +2 if quiz correct, -1 if quiz wrong.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id } = await params
  const body = await req.json()
  const { school_id, student_id, quiz_result } = body // quiz_result: 'correct' | 'wrong' | 'skipped'

  if (!school_id || !student_id) {
    return NextResponse.json({ error: 'school_id and student_id required' }, { status: 400 })
  }

  try {
    // Check if already read
    const { rows: [existing] } = await pool.query(
      'SELECT id, points_awarded FROM student_newspaper_reads WHERE student_id = $1 AND newspaper_id = $2',
      [student_id, id]
    )

    if (existing) {
      return NextResponse.json({ already_read: true, points_awarded: existing.points_awarded })
    }

    // Award base reading point
    const basePts = await awardPoints(parseInt(student_id), parseInt(school_id), 'newspaper_read', parseInt(id), 'newspaper')

    // Award quiz bonus / penalty
    let quizPts = 0
    if (quiz_result === 'correct') {
      quizPts = 2
      await pool.query(
        `INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type)
         VALUES ($1, $2, 'newspaper_quiz_correct', 2, $3, 'newspaper')`,
        [student_id, school_id, id]
      )
    } else if (quiz_result === 'wrong') {
      quizPts = -1
      // Only deduct if student has points to lose (prevent going below 0 total)
      const { rows: [{ total }] } = await pool.query(
        `SELECT COALESCE(SUM(points), 0) AS total FROM student_points WHERE student_id = $1`,
        [student_id]
      )
      if (parseInt(total) > 0) {
        await pool.query(
          `INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type)
           VALUES ($1, $2, 'newspaper_quiz_wrong', -1, $3, 'newspaper')`,
          [student_id, school_id, id]
        )
      } else {
        quizPts = 0 // don't penalise if at 0
      }
    }

    const totalPoints = basePts + quizPts

    await pool.query(
      `INSERT INTO student_newspaper_reads (student_id, newspaper_id, school_id, points_awarded)
       VALUES ($1, $2, $3, $4)`,
      [student_id, id, school_id, totalPoints]
    )

    return NextResponse.json({ success: true, points_awarded: totalPoints, base_pts: basePts, quiz_pts: quizPts })
  } catch (err) {
    console.error('Newspaper read API error:', err)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
