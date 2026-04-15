import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await pool.query('SELECT * FROM students WHERE id = $1', [id])
    if (result.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { name, email, grade, section, phone, parent_name, parent_phone, parent_email, status } = await req.json()
    const result = await pool.query(
      `UPDATE students SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        grade = COALESCE($3, grade),
        section = COALESCE($4, section),
        phone = COALESCE($5, phone),
        parent_name = COALESCE($6, parent_name),
        parent_phone = COALESCE($7, parent_phone),
        parent_email = COALESCE($8, parent_email),
        status = COALESCE($9, status)
       WHERE id = $10 RETURNING *`,
      [name, email, grade, section, phone, parent_name, parent_phone, parent_email, status, id]
    )
    if (result.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    // Soft-delete: mark as inactive so history is preserved
    const result = await pool.query(
      `UPDATE students SET status = 'inactive' WHERE id = $1 RETURNING *`,
      [id]
    )
    if (result.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to remove student' }, { status: 500 })
  }
}
