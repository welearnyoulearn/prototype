import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// PATCH /api/school/tasks/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const { is_active, title, instructions, task_type, max_marks, school_topic_id } = await req.json()

    // 1. Fetch task current status
    const taskRes = await pool.query('SELECT * FROM school_tasks WHERE id = $1', [id])
    if (taskRes.rowCount === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    const task = taskRes.rows[0]

    let updatedRow

    if (task.is_custom) {
      // Custom task: can edit anything
      const res = await pool.query(
        `UPDATE school_tasks
         SET school_topic_id = COALESCE($1, school_topic_id),
             title = COALESCE($2, title),
             instructions = COALESCE($3, instructions),
             task_type = COALESCE($4, task_type),
             max_marks = COALESCE($5, max_marks),
             is_active = COALESCE($6, is_active)
         WHERE id = $7
         RETURNING *`,
        [school_topic_id, title, instructions, task_type, max_marks, is_active, id]
      )
      updatedRow = res.rows[0]
    } else {
      // Global board task: only active status can be toggled, and ONLY if it is NOT mandatory
      if (is_active !== undefined) {
        if (task.is_mandatory && is_active === false) {
          return NextResponse.json({ error: 'Cannot deactivate government mandatory tasks' }, { status: 403 })
        }

        const res = await pool.query(
          `UPDATE school_tasks
           SET is_active = $1
           WHERE id = $2
           RETURNING *`,
          [is_active, id]
        )
        updatedRow = res.rows[0]
      } else {
        return NextResponse.json({ error: 'Cannot modify details of global board-mandated tasks' }, { status: 403 })
      }
    }

    return NextResponse.json({ task: updatedRow })
  } catch (err) {
    console.error('School tasks PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
