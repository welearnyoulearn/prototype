import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/syllabus/setup/status?school_id=&school_subject_id=
//
// School-admin's READ-ONLY view of Class Syllabus Setup — for every class in
// this subject's grade, whether that class has ever completed Apply
// (setup_completed_at), who did it, and (if completed) the current
// active/total chapter and topic counts. Admin never edits this here — the
// per-item chapter/topic selection stays exclusive to the class's own
// assigned teacher via the Setup screen in the Syllabus Tracking tab. This
// route exists purely so an admin can SEE what's been curated per class,
// not change it.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const school_subject_id = req.nextUrl.searchParams.get('school_subject_id')

  if (!school_id || !school_subject_id) {
    return NextResponse.json({ error: 'school_id, school_subject_id required' }, { status: 400 })
  }
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureDB()

    const subjectRes = await pool.query(
      'SELECT id, grade FROM school_subjects WHERE id = $1 AND school_id = $2',
      [school_subject_id, school_id]
    )
    if (subjectRes.rows.length === 0) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const { grade } = subjectRes.rows[0]

    // Total chapters/topics in the school's own copy — the denominator every
    // class's active count is measured against, regardless of whether that
    // class has set up yet.
    const totalsRes = await pool.query(
      `SELECT
         COUNT(DISTINCT sc.id)::int AS total_chapters,
         COUNT(st.id)::int AS total_topics
       FROM school_chapters sc
       LEFT JOIN school_topics st ON st.school_chapter_id = sc.id
       WHERE sc.school_subject_id = $1`,
      [school_subject_id]
    )
    const { total_chapters, total_topics } = totalsRes.rows[0]

    // Every class in this subject's grade, whether or not it has set up yet
    // — a class with no class_subject_setup_status row simply shows
    // setup_completed_at: null and active counts equal to the totals above
    // (nothing deselected, matching the "no row = active" rule everywhere
    // else in this feature).
    const classesRes = await pool.query(
      `SELECT
         c.id AS class_id, c.grade, c.section,
         css.setup_completed_at,
         te.name AS setup_by_name,
         (
           SELECT COUNT(*)::int FROM school_chapters sc
           WHERE sc.school_subject_id = $1
             AND COALESCE((SELECT ccv.is_active FROM class_chapter_visibility ccv
                           WHERE ccv.class_id = c.id AND ccv.school_chapter_id = sc.id), TRUE)
         ) AS active_chapters,
         (
           SELECT COUNT(*)::int FROM school_topics st
           JOIN school_chapters sc2 ON sc2.id = st.school_chapter_id
           WHERE sc2.school_subject_id = $1
             AND COALESCE((SELECT ccv2.is_active FROM class_chapter_visibility ccv2
                           WHERE ccv2.class_id = c.id AND ccv2.school_chapter_id = sc2.id), TRUE)
             AND COALESCE((SELECT ctv.is_active FROM class_topic_visibility ctv
                           WHERE ctv.class_id = c.id AND ctv.school_topic_id = st.id), TRUE)
         ) AS active_topics
       FROM classes c
       LEFT JOIN class_subject_setup_status css ON css.class_id = c.id AND css.school_subject_id = $1
       LEFT JOIN teachers te ON te.id = css.setup_by
       WHERE c.school_id = $2 AND c.grade = $3 AND c.deleted_at IS NULL
       ORDER BY c.section`,
      [school_subject_id, school_id, grade]
    )

    return NextResponse.json({
      school_subject_id: Number(school_subject_id),
      grade,
      total_chapters,
      total_topics,
      classes: classesRes.rows.map(r => ({
        class_id: r.class_id,
        grade: r.grade,
        section: r.section,
        setup_completed_at: r.setup_completed_at,
        setup_by_name: r.setup_by_name,
        active_chapters: r.active_chapters,
        active_topics: r.active_topics,
      })),
    })
  } catch (err) {
    console.error('Syllabus setup status GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch syllabus setup status' }, { status: 500 })
  }
}
