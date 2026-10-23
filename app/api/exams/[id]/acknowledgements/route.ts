import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, isClassTeacherOf } from '@/lib/examsAuth'

// GET /api/exams/[id]/acknowledgements?school_id=
// The class teacher's (or admin's) view of which parents have/haven't
// acknowledged a released exam's result for their child — the roster with a
// red/green flag the flow calls for, plus the last nudge time so the UI can
// show "nudged 2 days ago" instead of a bare button with no memory.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: exam_id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')

    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (actor.kind !== 'teacher' && actor.kind !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [exam] } = await pool.query(
      `SELECT e.*, c.grade, c.section FROM exam_records e
       JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (actor.kind === 'teacher' && !await isClassTeacherOf(actor.teacherId, exam.class_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (exam.status !== 'released') {
      return NextResponse.json({ error: 'This exam has not been released yet' }, { status: 400 })
    }

    const { rows } = await pool.query(`
      SELECT
        s.id AS student_id, s.name AS student_name, s.roll_number,
        pma.acknowledged_at, pma.parent_name,
        nudge.last_nudged_at
      FROM students s
      LEFT JOIN parent_mark_acks pma ON pma.exam_id = $1 AND pma.student_id = s.id
      LEFT JOIN LATERAL (
        SELECT MAX(nudged_at) AS last_nudged_at
        FROM parent_mark_ack_nudges
        WHERE exam_id = $1 AND student_id = s.id
      ) nudge ON TRUE
      WHERE s.school_id = $2 AND s.grade = $3 AND s.section = $4 AND s.status = 'active'
      ORDER BY s.roll_number NULLS LAST, s.name
    `, [exam_id, actor.schoolId, exam.grade, exam.section])

    const acknowledged = rows.filter(r => r.acknowledged_at).length

    return NextResponse.json({
      total: rows.length,
      acknowledged,
      unacknowledged: rows.length - acknowledged,
      students: rows,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
