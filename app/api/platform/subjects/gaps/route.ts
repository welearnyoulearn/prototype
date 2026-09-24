import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// GET /api/platform/subjects/gaps
//
// Structural QA check for the master catalog, surfaced after a bulk import:
// subjects with zero chapters (an import that never ran, or targeted the
// wrong subject_id) and chapters with zero topics (a chapter created but
// never populated, or a JSON paste that had a chapter with an empty
// "topics" array). Read-only — this is a checklist, not an editor; fixing a
// gap means going back to that subject's normal bulk-import/chapter-editing
// flow.
export async function GET() {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const emptySubjects = await pool.query(`
      SELECT ms.id, ms.board, ms.grade, ms.subject_name, ms.category
      FROM master_subjects ms
      LEFT JOIN master_chapters mc ON mc.subject_id = ms.id
      WHERE mc.id IS NULL
      ORDER BY ms.board, ms.grade, ms.subject_name
    `)

    const emptyChapters = await pool.query(`
      SELECT
        mc.id AS chapter_id, mc.chapter_name, mc.chapter_order,
        ms.id AS subject_id, ms.board, ms.grade, ms.subject_name, ms.category
      FROM master_chapters mc
      JOIN master_subjects ms ON ms.id = mc.subject_id
      LEFT JOIN master_topics mt ON mt.chapter_id = mc.id
      WHERE mt.id IS NULL
      ORDER BY ms.board, ms.grade, ms.subject_name, mc.chapter_order
    `)

    return NextResponse.json({
      empty_subjects: emptySubjects.rows,
      empty_chapters: emptyChapters.rows,
    })
  } catch (err) {
    console.error('platform/subjects/gaps GET error:', err)
    return NextResponse.json({ error: 'Failed to load content gaps' }, { status: 500 })
  }
}
