import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusAccess, getTeacherSession } from '@/lib/auth'

// GET /api/school/subjects/materials?school_id=&grade=&subject_name=
// Returns the textbook/handbook files uploaded (once, platform-side) against
// the master subject this school's (grade, subject_name) is subscribed to.
// Role determines what's visible: school admin/principal/VP and the subject's
// own teacher see both types; students and parents only ever see textbooks.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const grade = req.nextUrl.searchParams.get('grade')
  const subject_name = req.nextUrl.searchParams.get('subject_name')

  if (!school_id || !grade || !subject_name) {
    return NextResponse.json({ error: 'school_id, grade and subject_name are required' }, { status: 400 })
  }

  const access = await requireSyllabusAccess(school_id)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureDB()

    // A teacher only sees materials for subjects they're actually assigned to
    // teach at that grade — mirrors the class_subjects check used elsewhere
    // to scope a teacher's syllabus visibility.
    if (access.role === 'teacher') {
      const teacherSession = await getTeacherSession()
      const { rows: assignedRows } = await pool.query(
        `SELECT 1
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id
         WHERE cs.teacher_id = $1 AND cs.subject_name = $2 AND c.grade = $3 AND c.school_id = $4
         LIMIT 1`,
        [teacherSession?.teacherId, subject_name, grade, school_id]
      )
      if (assignedRows.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    const { rows: subjectRows } = await pool.query(
      `SELECT master_subject_id FROM school_subjects
       WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4`,
      [school_id, grade, subject_name, academic_year]
    )
    const masterSubjectId = subjectRows[0]?.master_subject_id
    if (!masterSubjectId) return NextResponse.json([])

    const studentOnly = access.role === 'student' || access.role === 'parent'
    const query = studentOnly
      ? `SELECT id, material_type, title, file_url, created_at FROM master_subject_materials
         WHERE subject_id = $1 AND material_type = 'textbook' ORDER BY created_at`
      : `SELECT id, material_type, title, file_url, created_at FROM master_subject_materials
         WHERE subject_id = $1 ORDER BY material_type, created_at`

    const { rows } = await pool.query(query, [masterSubjectId])
    return NextResponse.json(rows)
  } catch (err) {
    console.error('School subject materials GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 })
  }
}
