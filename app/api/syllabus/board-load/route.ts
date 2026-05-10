import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getGradeData } from '@/lib/board-syllabus/data'

// POST /api/syllabus/board-load
// Bulk-inserts board syllabus topics for a class.
// Body: { school_id, class_id, grade, board, overwrite? }
// overwrite=true clears existing pending topics first (never touches covered ones).
export async function POST(req: NextRequest) {
  try {
    const { school_id, class_id, grade, board, overwrite = false } = await req.json()

    if (!school_id || !class_id || !grade || !board) {
      return NextResponse.json({ error: 'school_id, class_id, grade, board are required' }, { status: 400 })
    }

    const gradeData = getGradeData(board, String(grade))
    if (!gradeData) {
      return NextResponse.json({ error: `No syllabus data found for board=${board} grade=${grade}` }, { status: 404 })
    }

    // Update school board field
    await pool.query(`UPDATE schools SET board = $1 WHERE id = $2`, [board, school_id])

    // Build flat arrays for a single bulk INSERT (one DB round-trip instead of N)
    const subjects: string[]      = []
    const chapterNames: string[]  = []
    const chapterOrders: number[] = []
    const topicNames: string[]    = []
    const topicOrders: number[]   = []

    for (const subjectEntry of gradeData.subjects) {
      for (const chapter of subjectEntry.chapters) {
        for (const topic of chapter.topics) {
          subjects.push(subjectEntry.subject)
          chapterNames.push(chapter.chapter_name)
          chapterOrders.push(chapter.chapter_order)
          topicNames.push(topic.topic_name)
          topicOrders.push(topic.topic_order)
        }
      }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (overwrite) {
        await client.query(
          `DELETE FROM syllabus_topics WHERE class_id = $1 AND school_id = $2 AND status = 'pending'`,
          [class_id, school_id]
        )
      }

      // Single bulk INSERT via unnest — all topics in one round-trip
      // published=FALSE: topics start as drafts until HOD reviews and publishes
      const result = await client.query(
        `INSERT INTO syllabus_topics
          (school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order, status, published)
         SELECT $1, $2,
           unnest($3::text[]),
           unnest($4::text[]),
           unnest($5::int[]),
           unnest($6::text[]),
           unnest($7::int[]),
           'pending',
           FALSE
         ON CONFLICT (class_id, subject, chapter_name, topic_name) DO NOTHING`,
        [school_id, class_id, subjects, chapterNames, chapterOrders, topicNames, topicOrders]
      )

      await client.query('COMMIT')

      const inserted = result.rowCount ?? 0
      const skipped  = subjects.length - inserted

      return NextResponse.json({
        success: true,
        inserted,
        skipped,
        subjects: gradeData.subjects.map(s => s.subject),
        message: `Loaded ${inserted} topics across ${gradeData.subjects.length} subjects for Grade ${grade}`,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('board-load error:', error)
    return NextResponse.json({ error: 'Failed to load board syllabus' }, { status: 500 })
  }
}

// GET /api/syllabus/board-load?school_id=X
// Returns the school's current board setting and per-class syllabus status
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const school_id = sp.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    const [schoolRes, classRes] = await Promise.all([
      pool.query(`SELECT id, name, board FROM schools WHERE id = $1`, [school_id]),
      pool.query(
        `SELECT
           c.id, c.grade, c.section,
           COUNT(st.id) AS total_topics,
           COUNT(st.id) FILTER (WHERE st.status = 'covered') AS covered_topics
         FROM classes c
         LEFT JOIN syllabus_topics st ON st.class_id = c.id AND st.school_id = c.school_id
         WHERE c.school_id = $1 AND c.deleted_at IS NULL
         GROUP BY c.id, c.grade, c.section
         ORDER BY c.grade::int NULLS LAST, c.section`,
        [school_id]
      ),
    ])

    if (schoolRes.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    return NextResponse.json({
      board: schoolRes.rows[0].board,
      classes: classRes.rows,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch syllabus status' }, { status: 500 })
  }
}
