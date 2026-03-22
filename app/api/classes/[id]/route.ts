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

    const subjectsRes = await pool.query(
      `SELECT cs.*, t.name AS teacher_name
       FROM class_subjects cs
       LEFT JOIN teachers t ON cs.teacher_id = t.id
       WHERE cs.class_id = $1
       ORDER BY cs.subject_name`,
      [id]
    )
    return NextResponse.json({ ...classRes.rows[0], subjects: subjectsRes.rows })
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
    await pool.query('DELETE FROM classes WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 })
  }
}
