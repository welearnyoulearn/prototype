// POST /api/ai/parent-message
// Body: { school_id, student_id, concern? }
// Returns: { message: string }

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateParentMessage } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const { school_id, student_id, concern } = await req.json()
  if (!school_id || !student_id)
    return NextResponse.json({ error: 'school_id, student_id required' }, { status: 400 })
  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const { rows } = await pool.query(
      `SELECT s.name, s.grade,
        (SELECT ROUND(AVG(CASE WHEN a.status = 'present' THEN 100 ELSE 0 END))
         FROM attendance a WHERE a.student_id = s.id AND a.date >= CURRENT_DATE - INTERVAL '30 days'
        ) AS attendance_pct,
        (SELECT COUNT(*) FROM task_submissions ts
         JOIN tasks t ON t.id = ts.task_id
         WHERE ts.student_id = s.id AND ts.status = 'pending' AND t.status = 'published'
        ) AS pending_tasks
       FROM students s
       WHERE s.id = $1 AND s.school_id = $2`,
      [student_id, school_id]
    )
    if (!rows.length) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const student = rows[0]

    const message = await generateParentMessage(
      student.name, student.grade,
      {
        attendancePct: student.attendance_pct ? Number(student.attendance_pct) : undefined,
        pendingTasks: Number(student.pending_tasks) || undefined,
        concern: concern?.trim() || undefined,
      }
    )
    return NextResponse.json({ message })
  } catch (err) {
    console.error('Parent message error:', err)
    return NextResponse.json({ error: 'Failed to generate message.' }, { status: 500 })
  }
}
