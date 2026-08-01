import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

// POST /api/platform/chapters
export async function POST(req: NextRequest) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id, subject_id, chapter_name, chapter_order = 0, description = '' } = await req.json()
    if (!subject_id || !chapter_name) {
      return NextResponse.json({ error: 'subject_id and chapter_name are required' }, { status: 400 })
    }

    let row;
    if (id) {
      // Update
      const res = await pool.query(
        `UPDATE master_chapters
         SET chapter_name = $1, chapter_order = $2, description = $3
         WHERE id = $4
         RETURNING *`,
        [chapter_name, chapter_order, description, id]
      )
      row = res.rows[0]
    } else {
      // Insert
      const res = await pool.query(
        `INSERT INTO master_chapters (subject_id, chapter_name, chapter_order, description)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [subject_id, chapter_name, chapter_order, description]
      )
      row = res.rows[0]
    }

    return NextResponse.json({ chapter: row })
  } catch (err) {
    console.error('Platform chapters POST error:', err)
    return NextResponse.json({ error: 'Failed to save master chapter' }, { status: 500 })
  }
}

// DELETE /api/platform/chapters?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await pool.query('DELETE FROM master_chapters WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform chapters DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete master chapter' }, { status: 500 })
  }
}
