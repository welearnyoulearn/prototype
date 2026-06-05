import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

// GET /api/parent/timetable?school_id=X&class_id=Y
// Returns today's timetable for the student's class (reads class_timetable directly)
export async function GET(req: NextRequest) {
  try {
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id')
    const class_id  = p.get('class_id')
    if (!school_id || !class_id) return NextResponse.json({ error: 'school_id, class_id required' }, { status: 400 })

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const today = dayNames[new Date().getDay()]

    try {
      const { rows: periods } = await pool.query(
        `SELECT ct.period_number, ct.day_of_week, ct.time_from, ct.time_to,
                ct.subject_name, t.name AS teacher_name, t.department,
                ct.is_break, ct.break_label
         FROM class_timetable ct
         LEFT JOIN teachers t ON t.id = ct.teacher_id
         WHERE ct.school_id = $1 AND ct.class_id = $2
           AND ct.day_of_week = $3 AND ct.template_id IS NULL
         ORDER BY ct.period_number`,
        [school_id, class_id, today]
      )

      const { rows: weekPeriods } = await pool.query(
        `SELECT ct.period_number, ct.day_of_week, ct.time_from, ct.time_to,
                ct.subject_name, t.name AS teacher_name, ct.is_break, ct.break_label
         FROM class_timetable ct
         LEFT JOIN teachers t ON t.id = ct.teacher_id
         WHERE ct.school_id = $1 AND ct.class_id = $2 AND ct.template_id IS NULL
         ORDER BY ct.day_of_week, ct.period_number`,
        [school_id, class_id]
      )

      return NextResponse.json({ periods, week_periods: weekPeriods, day: today })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
