import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusWriteAccess } from '@/lib/auth'

// POST /api/school/syllabus/bootstrap-chapters
// body: { school_id, class_id, subject, count }
//
// The "I don't have a PDF, I just know how many chapters my textbook has"
// path — creates `count` empty dummy chapters ("Chapter 1", "Chapter 2", ...)
// for a subject with no content yet, so the teacher has a starting shell to
// rename and fill in (via POST /api/school/custom/chapters for renames and
// POST /api/syllabus for subtopics) instead of typing every chapter name up
// front.
const MAX_BOOTSTRAP_CHAPTERS = 50

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const { school_id, class_id, subject, count } = await req.json()

    if (!school_id || !class_id || !subject) {
      return NextResponse.json({ error: 'school_id, class_id, subject required' }, { status: 400 })
    }
    if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > MAX_BOOTSTRAP_CHAPTERS) {
      return NextResponse.json({ error: `count must be a whole number between 1 and ${MAX_BOOTSTRAP_CHAPTERS}` }, { status: 400 })
    }

    const classRes = await pool.query(
      'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )
    if (classRes.rows.length === 0) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    const { grade } = classRes.rows[0]
    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

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
      // when there's no match or the match is ambiguous across boards.
      // $2 (grade) and $3 (subject) are cast explicitly — each is used both
      // as a plain SELECT target (feeding school_subjects' columns) and
      // inside the WHERE clause (grade directly, subject through lower());
      // without the casts, pg's single-statement parameter-type inference
      // can deduce two different types for the same parameter across those
      // positions and Postgres errors with 42P08 "inconsistent types
      // deduced for parameter" — confirmed both $2 and $3 need it, not just $2.
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

    const orderRes = await pool.query(
      'SELECT COALESCE(MAX(chapter_order), -1) + 1 AS next FROM school_chapters WHERE school_subject_id = $1',
      [school_subject_id]
    )
    let nextOrder: number = orderRes.rows[0].next

    // Chapter names must not collide with anything already there — start
    // numbering from the count of existing chapters + 1 so "Chapter 1" isn't
    // reused if the teacher bootstraps twice.
    const existingCountRes = await pool.query(
      'SELECT COUNT(*)::int AS n FROM school_chapters WHERE school_subject_id = $1',
      [school_subject_id]
    )
    const startAt = existingCountRes.rows[0].n + 1

    const created = []
    for (let i = 0; i < n; i++) {
      const chapterName = `Chapter ${startAt + i}`
      const insertCh = await pool.query(
        'INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, is_custom) VALUES ($1, $2, $3, TRUE) RETURNING *',
        [school_subject_id, chapterName, nextOrder]
      )
      created.push(insertCh.rows[0])
      nextOrder += 1
    }

    return NextResponse.json({ ok: true, chapters: created })
  } catch (err) {
    console.error('school/syllabus/bootstrap-chapters POST error:', err)
    return NextResponse.json({ error: 'Failed to create chapters' }, { status: 500 })
  }
}
