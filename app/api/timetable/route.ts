import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/timetable?teacher_id=X&school_id=Y&day=Z
// Derives teacher's timetable directly from class_timetable (no separate timetable table).
export async function GET(req: NextRequest) {
  try {
    const authSession = await getAnySession()
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const teacher_id = searchParams.get('teacher_id')
    const school_id  = searchParams.get('school_id')
    const day        = searchParams.get('day')

    if (!teacher_id) return NextResponse.json({ error: 'teacher_id required' }, { status: 400 })
    if (school_id != null && Number(school_id) !== Number(authSession.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const vals: (string | number)[] = [teacher_id]
      let where = 'ct.teacher_id = $1 AND ct.is_break = FALSE'
      if (school_id) { vals.push(school_id); where += ` AND c.school_id = $${vals.length}` }
      if (day)       { vals.push(day);       where += ` AND ct.day_of_week = $${vals.length}` }

      const result = await pool.query(
        `SELECT
           ct.id, ct.day_of_week, ct.period_number, ct.time_from, ct.time_to,
           ct.subject_name AS subject, c.grade, c.section, ct.room,
           ct.is_manual, ct.teacher_id, c.school_id
         FROM class_timetable ct
         JOIN classes c ON c.id = ct.class_id
         WHERE ${where}
         ORDER BY
           CASE ct.day_of_week
             WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
             WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END,
           ct.period_number`,
        vals
      )
      return NextResponse.json(result.rows)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch timetable' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
