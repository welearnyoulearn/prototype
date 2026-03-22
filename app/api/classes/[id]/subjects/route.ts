import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { subject_name, teacher_id, periods_per_week } = await req.json()
    if (!subject_name?.trim()) {
      return NextResponse.json({ error: 'subject_name required' }, { status: 400 })
    }
    const ppw = Math.min(12, Math.max(1, parseInt(periods_per_week) || 4))
    const result = await pool.query(
      `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, subject_name.trim(), teacher_id || null, ppw]
    )
    // also fetch teacher name
    let row = result.rows[0]
    if (teacher_id) {
      const t = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacher_id])
      row = { ...row, teacher_name: t.rows[0]?.name || null }
    }
    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to add subject' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const subject_id = req.nextUrl.searchParams.get('subject_id')
  if (!subject_id) return NextResponse.json({ error: 'subject_id required' }, { status: 400 })
  try {
    await pool.query('DELETE FROM class_subjects WHERE id = $1 AND class_id = $2', [subject_id, id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete subject' }, { status: 500 })
  }
}
