import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await pool.query(
      `SELECT t.*, c.grade AS class_teacher_grade, c.section AS class_teacher_section
       FROM teachers t
       LEFT JOIN classes c ON c.class_teacher_id = t.id
       WHERE t.id = $1`,
      [id]
    )
    if (result.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch teacher' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const { name, email, subject, phone, department, qualification, date_of_joining, staff_type, status } = body

    const result = await pool.query(
      `UPDATE teachers SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        subject = COALESCE($3, subject),
        phone = COALESCE($4, phone),
        department = COALESCE($5, department),
        qualification = COALESCE($6, qualification),
        date_of_joining = COALESCE($7, date_of_joining),
        staff_type = COALESCE($8, staff_type),
        status = COALESCE($9, status)
       WHERE id = $10 RETURNING *`,
      [name, email, subject, phone, department, qualification, date_of_joining, staff_type, status, id]
    )
    if (result.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update teacher' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    // Null out teacher assignments in timetable and subject assignments before deleting
    await pool.query('UPDATE class_timetable SET teacher_id = NULL, is_manual = FALSE WHERE teacher_id = $1', [id])
    await pool.query('UPDATE class_subjects SET teacher_id = NULL WHERE teacher_id = $1', [id])
    const result = await pool.query('DELETE FROM teachers WHERE id = $1', [id])
    if (result.rowCount === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    return NextResponse.json({ message: 'Teacher deleted' })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete teacher' }, { status: 500 })
  }
}
