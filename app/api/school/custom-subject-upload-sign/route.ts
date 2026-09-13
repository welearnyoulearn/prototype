import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import pool, { ensureDB } from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { requireSyllabusWriteAccess } from '@/lib/auth'
import { resolveAcademicYear } from '@/lib/academicYear'

function sanitizeSegment(seg: string): string {
  return seg.replace(/[^a-zA-Z0-9-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'UNKNOWN'
}

// POST /api/school/custom-subject-upload-sign
// body: { school_id, class_id, subject, filename, content_type? }
//
// Presigns a direct-to-R2 upload for a CUSTOM subject's syllabus PDF (a
// school-created subject with no master_subjects/board link — the AI Hub
// injects this content directly into prompts instead of running it through
// the standard board-content RAG pipeline). Restricted to genuinely custom
// subjects: a subject that already has board content goes through the
// platform-admin materials pipeline instead, never this one.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { school_id, class_id, subject, filename, content_type } = await req.json()

    if (!school_id || !class_id || !subject) {
      return NextResponse.json({ error: 'school_id, class_id, subject are required' }, { status: 400 })
    }
    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 })
    }
    if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const classRes = await pool.query('SELECT grade FROM classes WHERE id = $1 AND school_id = $2', [class_id, school_id])
    if (classRes.rows.length === 0) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    const { grade } = classRes.rows[0]

    const academic_year = await resolveAcademicYear(school_id)
    const subjectRes = await pool.query(
      'SELECT id, board FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
      [school_id, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) return NextResponse.json({ error: 'Subject not found for this class' }, { status: 404 })
    const { id: school_subject_id, board } = subjectRes.rows[0]
    if (board) {
      return NextResponse.json(
        { error: 'This subject is linked to a board and already has standard content — custom PDF upload is only for subjects without a board.' },
        { status: 400 }
      )
    }

    const r2 = r2Config()
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `custom-subjects/${sanitizeSegment(String(school_id))}/${sanitizeSegment(String(school_subject_id))}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

    const uploadUrl = await getSignedUrl(
      r2.client,
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        ContentType: typeof content_type === 'string' && content_type ? content_type : 'application/pdf',
      }),
      { expiresIn: 600 },
    )

    return NextResponse.json({ uploadUrl, key, school_subject_id })
  } catch (err) {
    console.error('custom-subject-upload-sign POST error:', err)
    const message = err instanceof Error && err.message.startsWith('R2 not configured')
      ? err.message
      : 'Failed to prepare upload'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
