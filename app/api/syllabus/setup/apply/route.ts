import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusWriteAccess, getTeacherSession } from '@/lib/auth'

// POST /api/syllabus/setup/apply
// Body: { school_id, class_id, subject, academic_year?,
//         semester_mode?, semester_count?,
//         chapters: [{ school_chapter_id, is_active, semester_label?, topics: [{ school_topic_id, is_active }] }] }
//
// This is the ONLY place class_chapter_visibility/class_topic_visibility
// rows ever get written — never on subscribe, never just from opening or
// viewing the Setup screen. Writes a row for EVERY item in the payload,
// checked or not: an explicit is_active: false row is what actually
// enforces a teacher's deselection from this point on (absence of a row
// means "active" everywhere else in the system, so an unchecked item MUST
// get a real row, not just be omitted). Only touches items present in the
// payload — chapters/topics added to the school copy after this request was
// built are untouched (see: newly-added custom content defaults active,
// handled entirely by the "no row = active" rule, not by this route).
//
// semester_label is a PER-CLASS grouping aid (class_chapter_visibility.semester_label)
// — deliberately separate from school_chapters.semester, the shared column
// every class/teacher of a subscribed subject sees the same book-tab
// grouping through. Two classes can split the same subject into different
// semester counts/labels without affecting each other or the school's copy.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()
    const { school_id, class_id, subject, chapters, semester_mode, semester_count } = body

    if (!school_id || !class_id || !subject || !Array.isArray(chapters)) {
      return NextResponse.json({ error: 'school_id, class_id, subject, chapters[] required' }, { status: 400 })
    }

    const writeSession = await requireSyllabusWriteAccess(school_id)
    if (!writeSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // setup_by is a teachers.id — only meaningful when the actor actually is
    // a teacher. A school-admin/principal/VP/platform_admin applying setup
    // (e.g. helping a teacher set it up) leaves this NULL rather than
    // pointing at a nonexistent or wrong teacher row.
    const teacherSession = await getTeacherSession()
    const setup_by = teacherSession?.teacherId ?? null

    const classRes = await pool.query(
      'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )
    if (classRes.rows.length === 0) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    const { grade } = classRes.rows[0]
    const academic_year = body.academic_year || await resolveAcademicYear(school_id)

    const subjectRes = await pool.query(
      'SELECT id, board FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
      [school_id, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const school_subject_id = subjectRes.rows[0].id
    const board = subjectRes.rows[0].board

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      for (const ch of chapters) {
        const { school_chapter_id, is_active, topics, semester_label } = ch
        if (!school_chapter_id || typeof is_active !== 'boolean') {
          throw new Error('Each chapter entry needs school_chapter_id and a boolean is_active')
        }

        // Defense in depth: only touch chapters that actually belong to this
        // subject — a malformed or stale payload can't write visibility for
        // some other subject's chapter under this class.
        const ownsChapter = await client.query(
          'SELECT 1 FROM school_chapters WHERE id = $1 AND school_subject_id = $2',
          [school_chapter_id, school_subject_id]
        )
        if (ownsChapter.rowCount === 0) {
          throw new Error(`Chapter ${school_chapter_id} does not belong to this subject`)
        }

        await client.query(
          `INSERT INTO class_chapter_visibility (class_id, school_chapter_id, is_active, semester_label, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (class_id, school_chapter_id) DO UPDATE
             SET is_active = EXCLUDED.is_active, semester_label = EXCLUDED.semester_label,
                 updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [class_id, school_chapter_id, is_active, semester_label || null, setup_by]
        )

        if (Array.isArray(topics)) {
          for (const t of topics) {
            const { school_topic_id, is_active: topicActive } = t
            if (!school_topic_id || typeof topicActive !== 'boolean') {
              throw new Error('Each topic entry needs school_topic_id and a boolean is_active')
            }
            const ownsTopic = await client.query(
              'SELECT 1 FROM school_topics WHERE id = $1 AND school_chapter_id = $2',
              [school_topic_id, school_chapter_id]
            )
            if (ownsTopic.rowCount === 0) {
              throw new Error(`Topic ${school_topic_id} does not belong to chapter ${school_chapter_id}`)
            }
            await client.query(
              `INSERT INTO class_topic_visibility (class_id, school_topic_id, is_active, updated_by, updated_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (class_id, school_topic_id) DO UPDATE
                 SET is_active = EXCLUDED.is_active, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
              [class_id, school_topic_id, topicActive, setup_by]
            )
          }
        }
      }

      await client.query(
        `INSERT INTO class_subject_setup_status (class_id, school_subject_id, setup_completed_at, setup_by, semester_mode, semester_count)
         VALUES ($1, $2, NOW(), $3, $4, $5)
         ON CONFLICT (class_id, school_subject_id) DO UPDATE
           SET setup_completed_at = NOW(), setup_by = EXCLUDED.setup_by,
               semester_mode = EXCLUDED.semester_mode, semester_count = EXCLUDED.semester_count`,
        [class_id, school_subject_id, setup_by, !!semester_mode, semester_mode ? (semester_count || null) : null]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Return the updated tree — same shape as GET /api/syllabus/setup — so
    // the frontend can render the post-Apply state without a second round trip.
    const { rows } = await pool.query(
      `SELECT
         sc.id AS chapter_id, sc.chapter_name, sc.chapter_order,
         sc.book_type, sc.audience, sc.book_name, sc.is_custom AS chapter_is_custom,
         COALESCE(ccv.is_active, TRUE) AS chapter_is_active,
         ccv.semester_label,
         st.id AS topic_id, st.topic_name, st.topic_order, st.is_custom AS topic_is_custom,
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
      school_chapter_id: number; chapter_name: string; chapter_order: number
      book_type: string | null; audience: string | null; book_name: string | null
      is_custom: boolean; is_active: boolean; semester_label: string | null
      topics: { school_topic_id: number; topic_name: string; topic_order: number; is_custom: boolean; is_active: boolean }[]
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
    console.error('Syllabus setup apply error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to apply syllabus setup' }, { status: 500 })
  }
}
