import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'

// GET /api/platform/library
//
// WLYL Digital Library, platform-admin view: every textbook/handbook
// uploaded against any master subject, across every board and grade —
// the catalog-wide counterpart of a school's /api/school/library.
export async function GET() {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { rows } = await pool.query(
      `SELECT s.id AS subject_id, s.board, s.grade, s.subject_name, s.category,
              m.id AS material_id, m.material_type, m.title, m.file_url, m.created_at
       FROM master_subjects s
       JOIN master_subject_materials m ON m.subject_id = s.id
       ORDER BY s.board, ${gradeOrderSql('s.grade')}, s.subject_name, m.material_type, m.created_at`
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('Platform library GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch library' }, { status: 500 })
  }
}
