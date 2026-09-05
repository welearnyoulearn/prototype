import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusAccess } from '@/lib/auth'

// GET /api/syllabus/setup/siblings?school_id=&class_id=&subject=&academic_year=
//
// "Another section already set this up — copy it?" lookup, shown before a
// teacher starts a from-scratch first-time Setup. Finds every OTHER class
// (same grade, same subject, same school_subject_id — i.e. a genuine sibling
// section, not just a same-named subject elsewhere) that has already
// completed Class Syllabus Setup, so the frontend can offer copying one of
// them instead of forcing re-entry. Read-only — copying itself happens via
// POST /api/syllabus/setup/copy-from-sibling, only after the teacher
// previews and confirms.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')
  const subject = req.nextUrl.searchParams.get('subject')

  if (!school_id || !class_id || !subject) {
    return NextResponse.json({ error: 'school_id, class_id, subject required' }, { status: 400 })
  }
  if (!await requireSyllabusAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureDB()

    const classRes = await pool.query('SELECT grade FROM classes WHERE id = $1 AND school_id = $2', [class_id, school_id])
    if (classRes.rows.length === 0) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    const { grade } = classRes.rows[0]

    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    const subjectRes = await pool.query(
      'SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
      [school_id, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) return NextResponse.json({ siblings: [] })
    const school_subject_id = subjectRes.rows[0].id

    const { rows } = await pool.query(
      `SELECT c.id AS class_id, c.grade, c.section,
              css.setup_completed_at, te.name AS setup_by_name,
              css.semester_mode, css.semester_count,
              (SELECT COUNT(*)::int FROM class_chapter_visibility ccv
                WHERE ccv.class_id = c.id AND ccv.is_active = TRUE
                  AND EXISTS (SELECT 1 FROM school_chapters sc WHERE sc.id = ccv.school_chapter_id AND sc.school_subject_id = $2)
              ) AS active_chapters
       FROM classes c
       JOIN class_subject_setup_status css ON css.class_id = c.id AND css.school_subject_id = $2
       LEFT JOIN teachers te ON te.id = css.setup_by
       WHERE c.school_id = $1 AND c.grade = $3 AND c.id <> $4 AND c.deleted_at IS NULL
         AND css.setup_completed_at IS NOT NULL
       ORDER BY css.setup_completed_at DESC`,
      [school_id, school_subject_id, grade, class_id]
    )

    return NextResponse.json({
      school_subject_id,
      siblings: rows.map(r => ({
        class_id: r.class_id,
        grade: r.grade,
        section: r.section,
        setup_completed_at: r.setup_completed_at,
        setup_by_name: r.setup_by_name,
        semester_mode: r.semester_mode,
        semester_count: r.semester_count,
        active_chapters: r.active_chapters,
      })),
    })
  } catch (err) {
    console.error('Syllabus setup siblings GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch sibling setups' }, { status: 500 })
  }
}
