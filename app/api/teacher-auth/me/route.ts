import { NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'

export async function GET() {
  await ensureDB()
  const session = await getTeacherSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [teacher] } = await pool.query(
    `SELECT t.*,
            c.id AS class_id,
            c.grade AS class_teacher_grade,
            c.section AS class_teacher_section,
            s.name AS school_name,
            s.school_code
     FROM teachers t
     LEFT JOIN classes c ON c.class_teacher_id = t.id AND c.school_id = t.school_id
     LEFT JOIN schools s ON s.id = t.school_id
     WHERE t.id = $1 AND t.school_id = $2 AND t.status = 'active'`,
    [session.teacherId, session.schoolId]
  )

  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  // Never expose password_hash to client
  const { password_hash: _, ...safeTeacher } = teacher
  return NextResponse.json({ ...safeTeacher, passwordChanged: session.passwordChanged })
}
