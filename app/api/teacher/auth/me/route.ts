import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const result = await pool.query(
      `SELECT t.id, t.name, t.email, t.subject, t.department, t.employee_id,
              t.school_id, t.staff_type, t.password_changed, t.date_of_birth,
              s.name AS school_name, s.city AS school_city,
              COALESCE((
                SELECT json_agg(json_build_object('id', c.id, 'grade', c.grade, 'section', c.section)
                                ORDER BY c.grade, c.section)
                FROM classes c
                WHERE c.class_teacher_id = t.id AND c.school_id = t.school_id
                  AND c.deleted_at IS NULL
              ), '[]'::json) AS class_teacher_assignments
       FROM teachers t
       JOIN schools s ON s.id = t.school_id
       WHERE t.id = $1 AND t.removed_at IS NULL`,
      [session.teacherId]
    )

    if (result.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    const teacher = result.rows[0]
    const firstClass = teacher.class_teacher_assignments[0] ?? null
    return NextResponse.json({
      ...teacher,
      // Retain these fields for older clients while exposing every assignment.
      class_id: firstClass?.id ?? null,
      class_teacher_grade: firstClass?.grade ?? null,
      class_teacher_section: firstClass?.section ?? null,
    })
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
