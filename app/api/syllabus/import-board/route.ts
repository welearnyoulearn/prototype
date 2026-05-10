import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getDetailedSyllabus } from '@/lib/curricula'

// POST /api/syllabus/import-board
// Body: { school_id, class_id, board, grade }
// Bulk-inserts the pre-defined board syllabus (chapter + topic level) for a class.
// Safe to re-run — uses ON CONFLICT DO NOTHING.
export async function POST(req: NextRequest) {
  await ensureDB()
  try {
    const { school_id, class_id, board, grade } = await req.json()
    if (!school_id || !class_id || !board || !grade)
      return NextResponse.json({ error: 'school_id, class_id, board, grade required' }, { status: 400 })

    const syllabus = getDetailedSyllabus(board, grade)
    if (!syllabus)
      return NextResponse.json({ error: `No detailed syllabus found for ${board} grade ${grade}` }, { status: 404 })

    let inserted = 0
    let skipped = 0

    for (const subject of syllabus.subjects) {
      for (const chapter of subject.chapters) {
        for (const topic of chapter.topics) {
          const { rowCount } = await pool.query(
            `INSERT INTO syllabus_topics
               (school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order, status, published)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',FALSE)
             ON CONFLICT (class_id, subject, chapter_name, topic_name) DO NOTHING`,
            [school_id, class_id, subject.name, chapter.name, chapter.order, topic.name, topic.order],
          )
          if ((rowCount ?? 0) > 0) inserted++
          else skipped++
        }
      }
    }

    return NextResponse.json({ ok: true, inserted, skipped })
  } catch (err) {
    console.error('import-board error:', err)
    return NextResponse.json({ error: 'Failed to import syllabus' }, { status: 500 })
  }
}
