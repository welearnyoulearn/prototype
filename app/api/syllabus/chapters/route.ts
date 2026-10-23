import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusWriteAccess } from '@/lib/auth'

// POST /api/syllabus/chapters — create a bare chapter (no topic required).
// Body: { school_id, class_id, subject, chapter_name, chapter_order?,
//         book_type?, book_name?, audience? }
//
// POST /api/syllabus (topic creation) always finds-or-creates its parent
// chapter as a side effect, so it can never create an empty chapter on its
// own — a teacher building up a subject from scratch (Add Chapter, then Add
// Subtopic per chapter afterward) needs a standalone way to lay down the
// chapter shell first. This is that endpoint; topics are still added via the
// existing POST /api/syllabus once the chapter exists.
//
// book_type/book_name/audience must be passed explicitly by the caller —
// a chapter's "book" grouping (computeBookGroups() on the client, keyed by
// book_type+book_name) previously always fell back to NULL/NULL here, which
// reads as a DIFFERENT book from a subject's real subscribed book (e.g.
// "textbook::NCERT"), so a new custom chapter silently landed in its own new
// tab instead of appending to the book the teacher was actually viewing.
// The client is responsible for sending the active book tab's own values.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()
    const { school_id, class_id, subject, chapter_name, chapter_order, book_type, book_name, audience, semester_label } = body

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
      // Link to master_subjects when exactly one board matches this
      // (grade, subject_name) — same match as the school_subjects.master_subject_id
      // backfill in lib/db.ts — so the Digital Library and syllabus materials
      // panel can find this subject's uploaded textbooks/handbooks. Left NULL
      // when there's no match or the match is ambiguous across boards. $2
      // (grade) and $3 (subject) are cast explicitly — each is used both as
      // a plain SELECT target and inside the WHERE clause (subject through
      // lower()); without the casts, pg's single-statement parameter-type
      // inference can deduce two different types for the same parameter and
      // Postgres errors with 42P08 "inconsistent types deduced for parameter".
      const insertSubj = await pool.query(
        `INSERT INTO school_subjects (school_id, grade, subject_name, academic_year, master_subject_id, board)
         SELECT $1, $2::varchar, $3::varchar, $4,
           CASE WHEN COUNT(*) = 1 THEN MAX(id) END,
           CASE WHEN COUNT(*) = 1 THEN MAX(board) END
         FROM master_subjects WHERE grade = $2::varchar AND lower(subject_name) = lower($3::varchar)
         RETURNING id`,
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

    // book_type and audience are NOT NULL columns with their own defaults
    // ('textbook', 'student') — an omitted caller value (no active book to
    // inherit from yet, e.g. a subject's very first chapter) must fall back
    // to those exact defaults in JS, since the app was passing a literal
    // NULL through and violating the constraint. book_name has no default
    // and is genuinely nullable, so it's passed through as-is.
    const insertCh = await pool.query(
      `INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, is_custom, book_type, book_name, audience)
       VALUES ($1, $2, $3, TRUE, $4, $5, $6) RETURNING *`,
      [school_subject_id, chapter_name, resolvedChapterOrder, book_type || 'textbook', book_name || null, audience || 'student']
    )

    // A subject in Semester Wise mode filters its tracking view down to
    // whichever Semester tab is active (class_chapter_visibility.semester_label)
    // — a chapter added here with no label would be created active but
    // invisible under every semester tab until the teacher went back into
    // Edit Syllabus Setup to assign one. Auto-assigning it to the semester
    // the teacher was actually looking at when they clicked Add Chapter
    // avoids that dead end; the caller only sends this when the subject is
    // actually in semester mode (full-syllabus subjects pass nothing).
    if (semester_label && class_id) {
      await pool.query(
        `INSERT INTO class_chapter_visibility (class_id, school_chapter_id, is_active, semester_label)
         VALUES ($1, $2, TRUE, $3)
         ON CONFLICT (class_id, school_chapter_id) DO UPDATE SET semester_label = EXCLUDED.semester_label`,
        [class_id, insertCh.rows[0].id, semester_label]
      )
    }

    return NextResponse.json({ chapter: insertCh.rows[0] })
  } catch (err) {
    console.error('Syllabus chapters POST error:', err)
    return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 })
  }
}
