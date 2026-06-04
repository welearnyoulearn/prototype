// POST /api/ai/leave-coverage
// Body: { school_id, leave_request_id }
// Returns: { suggestion: string }

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateCoverageSuggestion } from '@/lib/gemini'
import { getAnySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { school_id, leave_request_id } = await req.json()
  if (!school_id || !leave_request_id)
    return NextResponse.json({ error: 'school_id, leave_request_id required' }, { status: 400 })
  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    // Get leave request + absent teacher info
    const { rows: leaveRows } = await pool.query(
      `SELECT lr.start_date, lr.end_date, lr.leave_type,
              t.name AS teacher_name, t.subject
       FROM leave_requests lr
       JOIN teachers t ON t.id = lr.teacher_id
       WHERE lr.id = $1 AND lr.school_id = $2`,
      [leave_request_id, school_id]
    )
    if (!leaveRows.length) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    const leave = leaveRows[0]

    // Get uncovered timetable periods for the absent teacher during their leave
    const { rows: periods } = await pool.query(
      `SELECT DISTINCT ct.day_of_week, ct.time_from, ct.time_to, c.grade, c.section
       FROM class_timetable ct
       JOIN classes c ON c.id = ct.class_id
       WHERE ct.teacher_id = (
         SELECT id FROM teachers WHERE name = $1 AND school_id = $2 LIMIT 1
       )
         AND ct.school_id = $2
         AND ct.is_break = FALSE
       LIMIT 10`,
      [leave.teacher_name, school_id]
    )

    // Get other available teachers
    const { rows: otherTeachers } = await pool.query(
      `SELECT name, subject FROM teachers
       WHERE school_id = $1 AND status = 'active' AND name != $2
       LIMIT 8`,
      [school_id, leave.teacher_name]
    )

    const periodsList = periods.map(p => ({
      class: `Grade ${p.grade}-${p.section}`,
      day: p.day_of_week,
      time: `${p.time_from}–${p.time_to}`
    }))

    const suggestion = await generateCoverageSuggestion(
      leave.teacher_name, leave.subject, periodsList, otherTeachers
    )
    return NextResponse.json({ suggestion })
  } catch (err) {
    console.error('Leave coverage error:', err)
    return NextResponse.json({ error: 'Failed to generate suggestion.' }, { status: 500 })
  }
}
