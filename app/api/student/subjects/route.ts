import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { getClassSubjects } from '@/lib/classSubjects'

// GET /api/student/subjects — this student's own class subjects and who teaches each one.
// Who can call: the student themself — the class comes from the session's own
// school/grade/section, never a query param, so a student can only ever see their own class.
export async function GET() {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { rows: [student] } = await pool.query<{ grade: string; section: string }>(
      `SELECT grade, section FROM students WHERE id = $1 AND school_id = $2`,
      [session.studentId, session.schoolId]
    )
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const { rows: [cls] } = await pool.query<{ id: number }>(
      `SELECT id FROM classes WHERE school_id = $1 AND grade = $2 AND section = $3 AND deleted_at IS NULL`,
      [session.schoolId, student.grade, student.section]
    )
    if (!cls) return NextResponse.json({ subjects: [] })

    return NextResponse.json({ subjects: await getClassSubjects(cls.id) })
  } catch (err) {
    console.error('[student/subjects]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
