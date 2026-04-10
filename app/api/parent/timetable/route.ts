import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/parent/timetable?school_id=X&class_id=Y
// Returns today's timetable for the student's class
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id = p.get('school_id')
  const class_id  = p.get('class_id')
  if (!school_id || !class_id) return NextResponse.json({ error: 'school_id, class_id required' }, { status: 400 })

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = dayNames[new Date().getDay()]

  try {
    // Get active timetable version
    const { rows: [version] } = await pool.query(
      `SELECT tv.id FROM timetable_versions tv
       WHERE tv.school_id = $1 AND tv.is_active = TRUE
       ORDER BY tv.created_at DESC LIMIT 1`,
      [school_id]
    )

    if (!version) return NextResponse.json({ periods: [], day: today, message: 'No timetable configured' })

    const { rows: periods } = await pool.query(
      `SELECT ct.period_number, ct.day_of_week, ct.time_from, ct.time_to,
              s.name AS subject_name, t.name AS teacher_name, t.department
       FROM class_timetable ct
       LEFT JOIN subjects s ON s.id = ct.subject_id
       LEFT JOIN teachers t ON t.id = ct.teacher_id
       WHERE ct.school_id = $1 AND ct.class_id = $2
         AND ct.version_id = $3 AND ct.day_of_week = $4
       ORDER BY ct.period_number`,
      [school_id, class_id, version.id, today]
    )

    // Also get full week for weekly view
    const { rows: weekPeriods } = await pool.query(
      `SELECT ct.period_number, ct.day_of_week, ct.time_from, ct.time_to,
              s.name AS subject_name, t.name AS teacher_name
       FROM class_timetable ct
       LEFT JOIN subjects s ON s.id = ct.subject_id
       LEFT JOIN teachers t ON t.id = ct.teacher_id
       WHERE ct.school_id = $1 AND ct.class_id = $2 AND ct.version_id = $3
       ORDER BY ct.day_of_week, ct.period_number`,
      [school_id, class_id, version.id]
    )

    return NextResponse.json({ periods, week_periods: weekPeriods, day: today })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
