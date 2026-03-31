import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// POST /api/class-timetable/sync
// Propagates teacher assignments from class_subjects → class_timetable (conflict-safe).
// Teacher timetable is now derived live from class_timetable — no separate table to rebuild.
export async function POST(req: NextRequest) {
  await ensureDB()
  const { school_id } = await req.json()
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Push class_subjects.teacher_id into class_timetable rows that have no teacher yet.
    // Skip any slot where this teacher is already busy in another class at the same time.
    const { rows: csRows } = await client.query(
      `SELECT cs.class_id, cs.subject_name, cs.teacher_id
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       WHERE c.school_id = $1 AND cs.teacher_id IS NOT NULL`,
      [school_id]
    )
    let teachersPropagated = 0
    for (const cs of csRows) {
      const { rowCount } = await client.query(
        `UPDATE class_timetable ct
         SET teacher_id = $1
         WHERE ct.class_id = $2
           AND ct.subject_name = $3
           AND ct.is_break = FALSE
           AND ct.teacher_id IS DISTINCT FROM $1
           AND NOT EXISTS (
             SELECT 1 FROM class_timetable other
             WHERE other.school_id   = ct.school_id
               AND other.class_id   != ct.class_id
               AND other.day_of_week   = ct.day_of_week
               AND other.period_number = ct.period_number
               AND other.teacher_id    = $1
               AND other.is_break = FALSE
           )`,
        [cs.teacher_id, cs.class_id, cs.subject_name]
      )
      teachersPropagated += rowCount ?? 0
    }

    await client.query('COMMIT')
    return NextResponse.json({ success: true, teachers_propagated: teachersPropagated })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
