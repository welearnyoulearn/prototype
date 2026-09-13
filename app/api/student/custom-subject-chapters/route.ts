import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { resolveAcademicYear } from '@/lib/academicYear'

// GET /api/student/custom-subject-chapters?subject=...
// Lists the chapters available for a CUSTOM subject (board is null) so the
// chat UI can show a chapter picker before the student asks — mirrors
// exactly what /api/student/ask itself checks, so a chapter name that shows
// up here is guaranteed to be a valid `chapter` value for that same request.
export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    const { schoolId, grade } = session

    const subject = req.nextUrl.searchParams.get('subject')
    if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })

    // Same academic-year fallback as /api/student/ask — see its comment.
    const academic_year = await resolveAcademicYear(schoolId)
    const subjectRes = await pool.query(
      `SELECT id, board FROM school_subjects
       WHERE school_id = $1 AND grade = $2 AND subject_name = $3
       ORDER BY (academic_year = $4) DESC, academic_year DESC
       LIMIT 1`,
      [schoolId, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) return NextResponse.json({ error: 'Subject not found for your grade' }, { status: 404 })
    const { id: schoolSubjectId, board } = subjectRes.rows[0]
    if (board) return NextResponse.json({ chapters: [] }) // standard subject — no chapter picker

    const { rows } = await pool.query(
      'SELECT chapter FROM custom_subject_chapters WHERE school_id = $1 AND custom_subject_id = $2 ORDER BY chapter',
      [schoolId, schoolSubjectId]
    )
    return NextResponse.json({ chapters: rows.map(r => r.chapter) })
  } catch (err: unknown) {
    console.error('[API] /api/student/custom-subject-chapters', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
