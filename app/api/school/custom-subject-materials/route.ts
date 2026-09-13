import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSyllabusWriteAccess } from '@/lib/auth'
import { resolveAcademicYear } from '@/lib/academicYear'
import { ingestCustomSubjectPdf } from '@/lib/ai/custom-content'

// POST /api/school/custom-subject-materials
// body: { school_id, school_subject_id, file_key, title? }
//
// Registers a just-uploaded custom-subject PDF (already PUT to R2 via
// /api/school/custom-subject-upload-sign) and kicks off text extraction.
// Responds immediately — extraction runs fire-and-forget (same pattern this
// repo already uses for welcome emails) so the teacher's upload isn't held
// up by PDF parsing/OCR, which can take a while for a large file.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { school_id, school_subject_id, file_key, title } = await req.json()

    if (!school_id || !school_subject_id || !file_key) {
      return NextResponse.json({ error: 'school_id, school_subject_id, file_key are required' }, { status: 400 })
    }
    if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const subjectRes = await pool.query(
      'SELECT board, subject_name FROM school_subjects WHERE id = $1 AND school_id = $2',
      [school_subject_id, school_id]
    )
    if (subjectRes.rows.length === 0) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    const { board, subject_name } = subjectRes.rows[0]
    if (board) {
      return NextResponse.json({ error: 'This subject is linked to a board — custom PDF upload is only for subjects without a board.' }, { status: 400 })
    }
    if (typeof file_key !== 'string' || !file_key.startsWith('custom-subjects/')) {
      return NextResponse.json({ error: 'Invalid file_key' }, { status: 400 })
    }

    const academic_year = await resolveAcademicYear(school_id)
    const bookTitle = (typeof title === 'string' && title.trim()) ? title.trim() : subject_name

    ingestCustomSubjectPdf({
      schoolId: school_id,
      customSubjectId: school_subject_id,
      r2Key: file_key,
      bookTitle,
      academicYear: academic_year,
    }).catch(console.error)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('custom-subject-materials POST error:', err)
    return NextResponse.json({ error: 'Failed to register upload' }, { status: 500 })
  }
}
