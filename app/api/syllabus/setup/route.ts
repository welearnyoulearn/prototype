import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusAccess } from '@/lib/auth'

// GET /api/syllabus/setup?school_id=&class_id=&subject=&academic_year=
//
// The Setup screen's own data source — same chapter->topic tree shape as
// GET /api/syllabus, but deliberately WITHOUT any school_topic_progress join:
// this is a selection screen (what should this class even see), not a
// tracking screen (what's been covered). Each chapter/topic carries its
// CURRENT is_active state from class_chapter_visibility/class_topic_visibility
// (defaulting to true when no row exists — that default reflects real DB
// state, not the Setup screen's own first-visit checkbox default, which the
// frontend applies separately only when setup_completed_at is null).
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

    const classRes = await pool.query(
      'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )
    if (classRes.rows.length === 0) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    const { grade } = classRes.rows[0]

    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    const subjectRes = await pool.query(
      'SELECT id, board FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
      [school_id, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) {
      // No school_subjects row yet — nothing to set up. The frontend should
      // route a teacher here only for a subject that already has content
      // (or send them to the bootstrap flow instead); this is a clean 404,
      // not an error state.
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const school_subject_id = subjectRes.rows[0].id
    const board = subjectRes.rows[0].board

    const { rows } = await pool.query(
      `SELECT
         sc.id AS chapter_id,
         sc.chapter_name,
         sc.chapter_order,
         sc.book_type,
         sc.audience,
         sc.book_name,
         sc.is_custom AS chapter_is_custom,
         COALESCE(ccv.is_active, TRUE) AS chapter_is_active,
         ccv.semester_label,
         st.id AS topic_id,
         st.topic_name,
         st.topic_order,
         st.is_custom AS topic_is_custom,
         COALESCE(ctv.is_active, TRUE) AS topic_is_active
       FROM school_chapters sc
       LEFT JOIN school_topics st ON st.school_chapter_id = sc.id
       LEFT JOIN class_chapter_visibility ccv ON ccv.class_id = $2 AND ccv.school_chapter_id = sc.id
       LEFT JOIN class_topic_visibility ctv ON ctv.class_id = $2 AND ctv.school_topic_id = st.id
       WHERE sc.school_subject_id = $1
       ORDER BY sc.chapter_order, sc.chapter_name, st.topic_order, st.topic_name`,
      [school_subject_id, class_id]
    )

    const chapterMap = new Map<number, {
      school_chapter_id: number
      chapter_name: string
      chapter_order: number
      book_type: string | null
      audience: string | null
      book_name: string | null
      is_custom: boolean
      is_active: boolean
      // Per-CLASS semester grouping assigned in the Setup screen — distinct
      // from school_chapters' own shared `semester` column (the school-wide
      // book-tab grouping used elsewhere), deliberately not surfaced here
      // since this screen only ever needs the per-class one.
      semester_label: string | null
      topics: {
        school_topic_id: number
        topic_name: string
        topic_order: number
        is_custom: boolean
        is_active: boolean
      }[]
    }>()

    for (const row of rows) {
      if (!chapterMap.has(row.chapter_id)) {
        chapterMap.set(row.chapter_id, {
          school_chapter_id: row.chapter_id,
          chapter_name: row.chapter_name,
          chapter_order: row.chapter_order,
          book_type: row.book_type ?? null,
          audience: row.audience ?? null,
          book_name: row.book_name ?? null,
          is_custom: !!row.chapter_is_custom,
          is_active: !!row.chapter_is_active,
          semester_label: row.semester_label ?? null,
          topics: [],
        })
      }
      if (row.topic_id != null) {
        chapterMap.get(row.chapter_id)!.topics.push({
          school_topic_id: row.topic_id,
          topic_name: row.topic_name,
          topic_order: row.topic_order,
          is_custom: !!row.topic_is_custom,
          is_active: !!row.topic_is_active,
        })
      }
    }

    const statusRes = await pool.query(
      'SELECT setup_completed_at, semester_mode, semester_count FROM class_subject_setup_status WHERE class_id = $1 AND school_subject_id = $2',
      [class_id, school_subject_id]
    )
    const status = statusRes.rows[0]

    return NextResponse.json({
      subject,
      board,
      school_subject_id,
      setup_completed_at: status?.setup_completed_at ?? null,
      semester_mode: status?.semester_mode ?? false,
      semester_count: status?.semester_count ?? null,
      chapters: Array.from(chapterMap.values()),
    })
  } catch (err) {
    console.error('Syllabus setup GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch syllabus setup' }, { status: 500 })
  }
}
