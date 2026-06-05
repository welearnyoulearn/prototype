import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getTeacherSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const result = await pool.query(
      `SELECT t.id, t.name, t.email, t.subject, t.department, t.employee_id,
              t.school_id, t.staff_type, t.password_changed,
              s.name AS school_name, s.city AS school_city
       FROM teachers t
       JOIN schools s ON s.id = t.school_id
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
