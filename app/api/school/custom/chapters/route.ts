import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/school/custom/chapters
export async function POST(req: NextRequest) {
  try {
    const { id, school_subject_id, chapter_name, chapter_order = 0 } = await req.json()

    if (id) {
      // Edit existing chapter
      // Verify first if it is custom, or let them rename (only custom ones can be renamed/renamed freely, master ones are locked)
      const chapCheck = await pool.query('SELECT is_custom FROM school_chapters WHERE id = $1', [id])
      if (chapCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
      }
      // Allow editing of both custom and global board chapters (relaxation for school admins)

      const res = await pool.query(
        `UPDATE school_chapters
         SET chapter_name = $1, chapter_order = $2
         WHERE id = $3
         RETURNING *`,
        [chapter_name, chapter_order, id]
      )
      return NextResponse.json({ chapter: res.rows[0] })
    } else {
      // Create new custom chapter
      if (!school_subject_id || !chapter_name) {
        return NextResponse.json({ error: 'school_subject_id and chapter_name are required' }, { status: 400 })
      }

      const res = await pool.query(
        `INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, is_custom)
         VALUES ($1, $2, $3, TRUE)
         RETURNING *`,
        [school_subject_id, chapter_name, chapter_order]
      )
      return NextResponse.json({ chapter: res.rows[0] })
    }
  } catch (err) {
    console.error('Custom chapters POST error:', err)
    return NextResponse.json({ error: 'Failed to save chapter' }, { status: 500 })
  }
}

// DELETE /api/school/custom/chapters?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    const check = await pool.query('SELECT is_custom FROM school_chapters WHERE id = $1', [id])
    if (check.rowCount === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }
    if (!check.rows[0].is_custom) {
      return NextResponse.json({ error: 'Cannot delete global board-mandated chapters' }, { status: 403 })
    }

    await pool.query('DELETE FROM school_chapters WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Custom chapters DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 })
  }
}
