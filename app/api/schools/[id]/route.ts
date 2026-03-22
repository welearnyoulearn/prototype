import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await pool.query('SELECT * FROM schools WHERE id = $1', [id])
    if (result.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch school' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name, type, city, country, status } = body

    const result = await pool.query(
      `UPDATE schools SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        city = COALESCE($3, city),
        country = COALESCE($4, country),
        status = COALESCE($5, status)
       WHERE id = $6 RETURNING *`,
      [name, type, city, country, status, id]
    )
    if (result.rowCount === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update school' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await pool.query('DELETE FROM schools WHERE id = $1', [id])
    if (result.rowCount === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    return NextResponse.json({ message: 'School deleted' })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete school' }, { status: 500 })
  }
}
