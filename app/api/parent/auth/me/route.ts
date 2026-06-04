import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getParentSession } from '@/lib/auth'

export async function GET() {
  const session = await getParentSession()
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // Get parent info + all linked children
  const parentResult = await pool.query(
    `SELECT p.id, p.name, p.email, p.phone, p.school_id, p.password_changed,
            s.name AS school_name
     FROM parents p
     LEFT JOIN schools s ON s.id = p.school_id
     WHERE p.id = $1`,
    [session.parentId]
  )
  if (parentResult.rows.length === 0) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })

  const parent = parentResult.rows[0]

  // Get linked students
  const studentsResult = await pool.query(
    `SELECT st.id, st.name, st.grade, st.section, st.roll_number, st.school_id
     FROM student_parents sp
     JOIN students st ON st.id = sp.student_id
     WHERE sp.parent_id = $1 AND st.status = 'active'
     ORDER BY st.grade, st.name`,
    [session.parentId]
  )

  return NextResponse.json({ ...parent, children: studentsResult.rows })
}
