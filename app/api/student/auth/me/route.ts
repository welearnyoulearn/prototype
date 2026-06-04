import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession } from '@/lib/auth'

export async function GET() {
  const session = await getStudentSession()
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const result = await pool.query(
    `SELECT s.id, s.name, s.email, s.phone, s.grade, s.section, s.roll_number,
            s.school_id, s.parent_name, s.parent_phone, s.parent_email,
            s.password_changed,
            sc.name AS school_name, sc.city AS school_city
     FROM students s
     JOIN schools sc ON sc.id = s.school_id
     WHERE s.id = $1 AND s.status = 'active'`,
    [session.studentId]
  )

  if (result.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}
