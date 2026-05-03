import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'

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
    invalidateCache(`classes:${result.rows[0].school_id}`)
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update class' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { rows: [cls] } = await pool.query('SELECT school_id, grade, section FROM classes WHERE id=$1', [id])
    if (!cls) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Deactivate all students in this class so autoSync won't recreate it
    await pool.query(
      `UPDATE students SET status = 'inactive' WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
      [cls.school_id, cls.grade, cls.section]
    )

    // Clear associated data
    await pool.query('DELETE FROM class_timetable WHERE class_id = $1', [id])
    await pool.query('DELETE FROM class_subjects WHERE class_id = $1', [id])
    await pool.query('DELETE FROM substitute_assignments WHERE class_id = $1', [id])

    // Soft-delete: mark deleted_at instead of hard deleting so it appears in "Removed" list
    await pool.query('UPDATE classes SET deleted_at = NOW() WHERE id = $1', [id])

    invalidateCache(`classes:${cls.school_id}`)
    invalidateCache(`timetable:school:${cls.school_id}`)
    invalidateCache(`health:${cls.school_id}`)
    invalidateCache(`timetable:class:${id}`)
    invalidateCache(`subjects:class:${id}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 })
  }
}
