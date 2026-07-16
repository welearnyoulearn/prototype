import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/platform/chapters/[id]/tasks
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { rows: tasks } = await pool.query(
      'SELECT * FROM master_tasks WHERE chapter_id = $1 ORDER BY id',
      [id]
    )
    return NextResponse.json(tasks)
  } catch (err) {
    console.error('Platform tasks list GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

// POST /api/platform/chapters/[id]/tasks
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params
  try {
    const { id, topic_id = null, title, instructions = '', task_type = 'homework', max_marks = 10, is_mandatory = false } = await req.json()
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    let row;
    if (id) {
      // Update
      const res = await pool.query(
        `UPDATE master_tasks
         SET topic_id = $1, title = $2, instructions = $3, task_type = $4, max_marks = $5, is_mandatory = $6
         WHERE id = $7 AND chapter_id = $8
         RETURNING *`,
        [topic_id, title, instructions, task_type, max_marks, is_mandatory, id, chapterId]
      )
      row = res.rows[0]
    } else {
      // Insert
      const res = await pool.query(
        `INSERT INTO master_tasks (chapter_id, topic_id, title, instructions, task_type, max_marks, is_mandatory)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [chapterId, topic_id, title, instructions, task_type, max_marks, is_mandatory]
      )
      row = res.rows[0]
    }

    return NextResponse.json({ task: row })
  } catch (err) {
    console.error('Platform tasks POST error:', err)
    return NextResponse.json({ error: 'Failed to save master task' }, { status: 500 })
  }
}
