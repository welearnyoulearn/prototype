import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/syllabus/publish
// Body: { school_id, class_id, subject }
// Sets all draft (published=FALSE) topics for this class+subject to published=TRUE.
export async function POST(req: NextRequest) {
  try {
    const { school_id, class_id, subject } = await req.json()
    if (!school_id || !class_id || !subject)
      return NextResponse.json({ error: 'school_id, class_id, subject required' }, { status: 400 })

    const result = await pool.query(
      `UPDATE syllabus_topics SET published = TRUE
       WHERE school_id = $1 AND class_id = $2 AND subject = $3 AND published = FALSE`,
      [school_id, class_id, subject]
    )
    return NextResponse.json({ ok: true, published: result.rowCount ?? 0 })
  } catch (err) {
    console.error('Syllabus publish error:', err)
    return NextResponse.json({ error: 'Failed to publish syllabus' }, { status: 500 })
  }
}
