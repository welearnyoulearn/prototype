import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusWriteAccess } from '@/lib/auth'

// POST /api/syllabus/chapters — create a bare chapter (no topic required).
// Body: { school_id, class_id, subject, chapter_name, chapter_order? }
//
// POST /api/syllabus (topic creation) always finds-or-creates its parent
// chapter as a side effect, so it can never create an empty chapter on its
// own — a teacher building up a subject from scratch (Add Chapter, then Add
// Subtopic per chapter afterward) needs a standalone way to lay down the
// chapter shell first. This is that endpoint; topics are still added via the
// existing POST /api/syllabus once the chapter exists.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()
    const { school_id, class_id, subject, chapter_name, chapter_order } = body

    if (!school_id || !class_id || !subject || !chapter_name || !String(chapter_name).trim()) {
      return NextResponse.json({ error: 'school_id, class_id, subject, chapter_name required' }, { status: 400 })
    }
    if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const classRes = await pool.query(
      'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )
    if (classRes.rows.length === 0) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    const { grade } = classRes.rows[0]
    const academic_year = body.academic_year || await resolveAcademicYear(school_id)

    // Find or create the school subject — same pattern as POST /api/syllabus,
    // so "Add Chapter" works even for a subject that has no rows at all yet
    // (a brand-new custom subject, or one Class Management assigned before
    // any content existed).
    let school_subject_id: number
    const subjectRes = await pool.query(
      'SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
      [school_id, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) {
      const insertSubj = await pool.query(
        'INSERT INTO school_subjects (school_id, grade, subject_name, academic_year) VALUES ($1, $2, $3, $4) RETURNING id',
        [school_id, grade, subject, academic_year]
      )
      school_subject_id = insertSubj.rows[0].id
    } else {
      school_subject_id = subjectRes.rows[0].id
    }

    const existing = await pool.query(
      'SELECT id FROM school_chapters WHERE school_subject_id = $1 AND chapter_name = $2',
      [school_subject_id, chapter_name]
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `A chapter named "${chapter_name}" already exists in this subject` }, { status: 409 })
    }

    let resolvedChapterOrder = chapter_order
    if (resolvedChapterOrder == null) {
      const orderRes = await pool.query(
        'SELECT COALESCE(MAX(chapter_order), -1) + 1 AS next FROM school_chapters WHERE school_subject_id = $1',
        [school_subject_id]
      )
      resolvedChapterOrder = orderRes.rows[0].next
    }

    const insertCh = await pool.query(
      'INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, is_custom) VALUES ($1, $2, $3, TRUE) RETURNING *',
      [school_subject_id, chapter_name, resolvedChapterOrder]
    )

    return NextResponse.json({ chapter: insertCh.rows[0] })
  } catch (err) {
    console.error('Syllabus chapters POST error:', err)
    return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 })
  }
}
