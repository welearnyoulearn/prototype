import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // MyClasses builds a class teacher's own class from class_teacher_grade/section,
    // so the classes join has to be here — without it they only see classes they
    // happen to have timetable slots for.
    const result = await pool.query(
      `SELECT t.id, t.name, t.email, t.subject, t.department, t.employee_id,
              t.school_id, t.staff_type, t.password_changed,
              s.name AS school_name, s.city AS school_city,
              c.id AS class_id,
              c.grade AS class_teacher_grade,
              c.section AS class_teacher_section
       FROM teachers t
       JOIN schools s ON s.id = t.school_id
       LEFT JOIN classes c ON c.class_teacher_id = t.id AND c.school_id = t.school_id
                          AND c.deleted_at IS NULL
       WHERE t.id = $1 AND t.removed_at IS NULL`,
      [session.teacherId]
    )

    if (result.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
