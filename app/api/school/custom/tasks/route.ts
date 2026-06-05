import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/school/custom/tasks
export async function POST(req: NextRequest) {
  try {
    const { id, school_chapter_id, school_topic_id = null, title, instructions = '', task_type = 'homework', max_marks = 10 } = await req.json()

    if (id) {
      // Edit task
      const taskCheck = await pool.query('SELECT is_custom FROM school_tasks WHERE id = $1', [id])
      if (taskCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }
      // Allow editing of both custom and global board tasks (relaxation for school admins)

      const res = await pool.query(
        `UPDATE school_tasks
         SET school_topic_id = $1, title = $2, instructions = $3, task_type = $4, max_marks = $5
         WHERE id = $6
         RETURNING *`,
        [school_topic_id, title, instructions, task_type, max_marks, id]
      )
      return NextResponse.json({ task: res.rows[0] })
    } else {
      // Create new custom task
      if (!school_chapter_id || !title) {
        return NextResponse.json({ error: 'school_chapter_id and title are required' }, { status: 400 })
      }

      const res = await pool.query(
        `INSERT INTO school_tasks (school_chapter_id, school_topic_id, title, instructions, task_type, max_marks, is_mandatory, is_active, is_custom)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, TRUE, TRUE)
         RETURNING *`,
        [school_chapter_id, school_topic_id, title, instructions, task_type, max_marks]
      )
      return NextResponse.json({ task: res.rows[0] })
    }
  } catch (err) {
    console.error('Custom tasks POST error:', err)
    return NextResponse.json({ error: 'Failed to save task' }, { status: 500 })
  }
}

// DELETE /api/school/custom/tasks?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    const check = await pool.query('SELECT is_custom FROM school_tasks WHERE id = $1', [id])
    if (check.rowCount === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (!check.rows[0].is_custom) {
      return NextResponse.json({ error: 'Cannot delete global board tasks' }, { status: 403 })
    }

    await pool.query('DELETE FROM school_tasks WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Custom tasks DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
