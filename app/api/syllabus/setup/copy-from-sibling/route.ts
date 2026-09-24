import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSyllabusWriteAccess, getTeacherSession } from '@/lib/auth'

// POST /api/syllabus/setup/copy-from-sibling
// Body: { school_id, source_class_id, target_class_id, school_subject_id }
//
// Applies another class's already-completed Class Syllabus Setup selection
// onto this class verbatim — same chapter/topic active flags, same semester
// grouping — as a one-click alternative to running Setup from scratch. This
// is functionally identical to what POST /api/syllabus/setup/apply would do
// if the teacher had manually re-entered the source class's exact choices;
// it just reads them from the source class's own visibility rows instead of
// a submitted payload. Only ever offered by the frontend after the teacher
// has previewed the source class's setup and explicitly confirmed — this
// route itself doesn't gate on that, same trust boundary as apply itself
// (an authenticated write-access caller is trusted to have shown the right
// UI before calling it).
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()
    const { school_id, source_class_id, target_class_id, school_subject_id } = body

    if (!school_id || !source_class_id || !target_class_id || !school_subject_id) {
      return NextResponse.json({ error: 'school_id, source_class_id, target_class_id, school_subject_id required' }, { status: 400 })
    }
    if (source_class_id === target_class_id) {
      return NextResponse.json({ error: 'Source and target class must be different' }, { status: 400 })
    }

    const writeSession = await requireSyllabusWriteAccess(school_id)
    if (!writeSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Both classes must actually belong to this school, and both must be
    // for the same school_subject_id's grade — defense in depth against a
    // stale/malformed payload copying visibility across the wrong subject
    // or a different school's class.
    const { rows: classRows } = await pool.query(
      `SELECT id, grade FROM classes WHERE id = ANY($1::int[]) AND school_id = $2`,
      [[source_class_id, target_class_id], school_id]
    )
    if (classRows.length !== 2) {
      return NextResponse.json({ error: 'Source or target class not found in this school' }, { status: 404 })
    }
    if (classRows[0].grade !== classRows[1].grade) {
      return NextResponse.json({ error: 'Source and target class must be the same grade' }, { status: 400 })
    }

    const { rows: [sourceStatus] } = await pool.query(
      `SELECT setup_completed_at, semester_mode, semester_count FROM class_subject_setup_status
       WHERE class_id = $1 AND school_subject_id = $2`,
      [source_class_id, school_subject_id]
    )
    if (!sourceStatus?.setup_completed_at) {
      return NextResponse.json({ error: 'Source class has not completed Syllabus Setup for this subject' }, { status: 409 })
    }

    const teacherSession = await getTeacherSession()
    const setup_by = teacherSession?.teacherId ?? null

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Copy chapter visibility — every school_chapter under this subject,
      // matching the source class's is_active/semester_label exactly.
      await client.query(
        `INSERT INTO class_chapter_visibility (class_id, school_chapter_id, is_active, semester_label, updated_by, updated_at)
         SELECT $1, sc.id,
                COALESCE(src.is_active, TRUE),
                src.semester_label,
                $3, NOW()
         FROM school_chapters sc
         LEFT JOIN class_chapter_visibility src ON src.class_id = $2 AND src.school_chapter_id = sc.id
         WHERE sc.school_subject_id = $4
         ON CONFLICT (class_id, school_chapter_id) DO UPDATE
           SET is_active = EXCLUDED.is_active, semester_label = EXCLUDED.semester_label,
               updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [target_class_id, source_class_id, setup_by, school_subject_id]
      )

      // Copy topic visibility the same way, for every topic under this subject.
      await client.query(
        `INSERT INTO class_topic_visibility (class_id, school_topic_id, is_active, updated_by, updated_at)
         SELECT $1, st.id,
                COALESCE(src.is_active, TRUE),
                $3, NOW()
         FROM school_topics st
         JOIN school_chapters sc ON sc.id = st.school_chapter_id
         LEFT JOIN class_topic_visibility src ON src.class_id = $2 AND src.school_topic_id = st.id
         WHERE sc.school_subject_id = $4
         ON CONFLICT (class_id, school_topic_id) DO UPDATE
           SET is_active = EXCLUDED.is_active, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [target_class_id, source_class_id, setup_by, school_subject_id]
      )

      await client.query(
        `INSERT INTO class_subject_setup_status (class_id, school_subject_id, setup_completed_at, setup_by, semester_mode, semester_count)
         VALUES ($1, $2, NOW(), $3, $4, $5)
         ON CONFLICT (class_id, school_subject_id) DO UPDATE
           SET setup_completed_at = NOW(), setup_by = EXCLUDED.setup_by,
               semester_mode = EXCLUDED.semester_mode, semester_count = EXCLUDED.semester_count`,
        [target_class_id, school_subject_id, setup_by, sourceStatus.semester_mode, sourceStatus.semester_count]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return NextResponse.json({ ok: true, setup_completed_at: new Date().toISOString() })
  } catch (err) {
    console.error('Syllabus setup copy-from-sibling error:', err)
    return NextResponse.json({ error: 'Failed to copy syllabus setup' }, { status: 500 })
  }
}
