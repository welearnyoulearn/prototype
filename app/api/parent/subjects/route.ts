import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getParentSession } from '@/lib/auth'
import { parentOwnsStudent } from '@/lib/examsAuth'
import { getClassSubjects, getClassTeacher, getSchoolContact } from '@/lib/classSubjects'

// GET /api/parent/subjects?student_id=X — one child's class subjects (with each subject's
// teacher), the class teacher's own name and phone, and the school's contact details
// (administration number, address, email) — everything a parent needs to reach someone.
// Who can call: a parent, and only for a child student_parents actually links them to.
export async function GET(req: NextRequest) {
  try {
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const studentId = Number(req.nextUrl.searchParams.get('student_id'))
    if (!studentId) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
    if (!await parentOwnsStudent(session.parentId, studentId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows: [student] } = await pool.query<{ grade: string; section: string }>(
      `SELECT grade, section FROM students WHERE id = $1 AND school_id = $2`,
      [studentId, session.schoolId]
    )
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const { rows: [cls] } = await pool.query<{ id: number }>(
      `SELECT id FROM classes WHERE school_id = $1 AND grade = $2 AND section = $3`,
      [session.schoolId, student.grade, student.section]
    )

    const [subjects, classTeacher, school] = await Promise.all([
      cls ? getClassSubjects(cls.id) : Promise.resolve([]),
      cls ? getClassTeacher(cls.id) : Promise.resolve(null),
      getSchoolContact(session.schoolId),
    ])

    return NextResponse.json({ subjects, class_teacher: classTeacher, school })
  } catch (err) {
    console.error('[parent/subjects]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
