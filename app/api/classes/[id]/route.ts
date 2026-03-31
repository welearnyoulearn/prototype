import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const classRes = await pool.query(
      `SELECT c.*, t.name AS class_teacher_name
       FROM classes c LEFT JOIN teachers t ON c.class_teacher_id = t.id
       WHERE c.id = $1`,
      [id]
    )
    if (!classRes.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Get subjects from class_subjects (source of truth for what subjects are assigned)
    const subjectsRes = await pool.query(
      `SELECT cs.id, cs.subject_name, cs.teacher_id, cs.periods_per_week,
              t.name AS teacher_name
       FROM class_subjects cs
       LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = $1
       ORDER BY cs.subject_name`,
      [id]
    )
    const subjects = subjectsRes.rows

    return NextResponse.json({ ...classRes.rows[0], subjects })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch class' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { class_teacher_id } = await req.json()
    const result = await pool.query(
      'UPDATE classes SET class_teacher_id = $1 WHERE id = $2 RETURNING *',
      [class_teacher_id || null, id]
    )
    if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update class' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    // Cascade cleanup — delete all data associated with this class before deleting the class
    await pool.query('DELETE FROM class_timetable WHERE class_id = $1', [id])
    await pool.query('DELETE FROM class_subjects WHERE class_id = $1', [id])
    await pool.query('DELETE FROM substitute_assignments WHERE class_id = $1', [id])
    await pool.query('DELETE FROM classes WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 })
  }
}
