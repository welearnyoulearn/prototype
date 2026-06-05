import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/platform/subjects/[id]/chapters
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { rows: chapters } = await pool.query(
      'SELECT * FROM master_chapters WHERE subject_id = $1 ORDER BY chapter_order, id',
      [id]
    )
    return NextResponse.json(chapters)
  } catch (err) {
    console.error('Platform chapters list GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 })
  }
}

// POST /api/platform/subjects/[id]/chapters
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: subjectId } = await params
  try {
    const { id, chapter_name, chapter_order = 0, description = '' } = await req.json()
    if (!chapter_name) {
      return NextResponse.json({ error: 'chapter_name is required' }, { status: 400 })
    }

    let row;
    if (id) {
      // Update
      const res = await pool.query(
        `UPDATE master_chapters
         SET chapter_name = $1, chapter_order = $2, description = $3
         WHERE id = $4 AND subject_id = $5
         RETURNING *`,
        [chapter_name, chapter_order, description, id, subjectId]
      )
      row = res.rows[0]
    } else {
      // Insert
      const res = await pool.query(
        `INSERT INTO master_chapters (subject_id, chapter_name, chapter_order, description)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [subjectId, chapter_name, chapter_order, description]
      )
      row = res.rows[0]
    }

    return NextResponse.json({ chapter: row })
  } catch (err) {
    console.error('Platform chapters POST error:', err)
    return NextResponse.json({ error: 'Failed to save master chapter' }, { status: 500 })
  }
}
