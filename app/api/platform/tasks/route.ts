import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/platform/tasks
export async function POST(req: NextRequest) {
  try {
    const { id, chapter_id, topic_id = null, title, instructions = '', task_type = 'homework', max_marks = 10, is_mandatory = false } = await req.json()
    if (!chapter_id || !title) {
      return NextResponse.json({ error: 'chapter_id and title are required' }, { status: 400 })
    }

    let row;
    if (id) {
      // Update
      const res = await pool.query(
        `UPDATE master_tasks
         SET topic_id = $1, title = $2, instructions = $3, task_type = $4, max_marks = $5, is_mandatory = $6
         WHERE id = $7
         RETURNING *`,
        [topic_id, title, instructions, task_type, max_marks, is_mandatory, id]
      )
      row = res.rows[0]
    } else {
      // Insert
      const res = await pool.query(
        `INSERT INTO master_tasks (chapter_id, topic_id, title, instructions, task_type, max_marks, is_mandatory)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [chapter_id, topic_id, title, instructions, task_type, max_marks, is_mandatory]
      )
      row = res.rows[0]
    }

    return NextResponse.json({ task: row })
  } catch (err) {
    console.error('Platform tasks POST error:', err)
    return NextResponse.json({ error: 'Failed to save master task' }, { status: 500 })
  }
}

// DELETE /api/platform/tasks?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    await pool.query('DELETE FROM master_tasks WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Platform tasks DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete master task' }, { status: 500 })
  }
}
