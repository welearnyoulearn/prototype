import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { resolveAcademicYear } from '@/lib/academicYear'

// POST /api/school/subjects/create-custom
// body: { school_id, grade, subject_name, academic_year? }
//
// Creates a bare school_subjects row with no master_subject_id — for any
// subject a school teaches that Platform Admin's master catalog doesn't
// cover (a locally-taught subject, or a board/subject combination that was
// never added upstream). Available regardless of whether the school has
// subscribed to other master-catalog subjects — this isn't only for a
// brand-new school with nothing yet, a school that's already subscribed to
// several subjects can still add one more this way for a gap in the
// catalog. No chapters/topics are created here; those are filled in later
// via Class Management assignment + the teacher-facing syllabus bootstrap
// flows (POST /api/syllabus/chapters, /api/school/syllabus/bulk-import,
// /api/school/syllabus/bootstrap-chapters).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, grade, subject_name } = body
    let academic_year = body.academic_year

    if (!school_id || !grade || !subject_name || !String(subject_name).trim()) {
      return NextResponse.json({ error: 'school_id, grade, subject_name are required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!academic_year) {
      academic_year = await resolveAcademicYear(school_id)
    }

    const existing = await pool.query(
      'SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
      [school_id, grade, subject_name.trim(), academic_year]
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `"${subject_name}" already exists for Grade ${grade} (${academic_year})` }, { status: 409 })
    }

    const result = await pool.query(
      `INSERT INTO school_subjects (school_id, subject_name, grade, academic_year, category)
       VALUES ($1, $2, $3, $4, 'academic')
       RETURNING *`,
      [school_id, subject_name.trim(), grade, academic_year]
    )

    return NextResponse.json({ subject: result.rows[0] }, { status: 201 })
  } catch (err) {
    console.error('school/subjects/create-custom POST error:', err)
    return NextResponse.json({ error: 'Failed to create subject' }, { status: 500 })
  }
}
