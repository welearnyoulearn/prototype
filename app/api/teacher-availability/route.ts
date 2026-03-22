import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/teacher-availability?teacher_id=X&school_id=Y
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teacher_id = searchParams.get('teacher_id')
  const school_id = searchParams.get('school_id')
  if (!teacher_id || !school_id) {
    return NextResponse.json({ error: 'teacher_id and school_id required' }, { status: 400 })
  }
  try {
    const result = await pool.query(
      `SELECT id, day_of_week, period_number, reason
       FROM teacher_unavailability
       WHERE teacher_id = $1 AND school_id = $2`,
      [teacher_id, school_id]
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 })
  }
}

// POST /api/teacher-availability — mark a slot as unavailable
export async function POST(req: NextRequest) {
  try {
    const { teacher_id, school_id, day_of_week, period_number, reason } = await req.json()
    if (!teacher_id || !school_id || !day_of_week || !period_number) {
      return NextResponse.json({ error: 'teacher_id, school_id, day_of_week, period_number required' }, { status: 400 })
    }
    const result = await pool.query(
      `INSERT INTO teacher_unavailability (teacher_id, school_id, day_of_week, period_number, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (teacher_id, day_of_week, period_number) DO NOTHING
       RETURNING *`,
      [teacher_id, school_id, day_of_week, period_number, reason || null]
    )
    return NextResponse.json(result.rows[0] || { already_set: true }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to mark unavailable' }, { status: 500 })
  }
}

// DELETE /api/teacher-availability?teacher_id=X&school_id=Y&day_of_week=Monday&period_number=2
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teacher_id = searchParams.get('teacher_id')
  const school_id = searchParams.get('school_id')
  const day_of_week = searchParams.get('day_of_week')
  const period_number = searchParams.get('period_number')
  if (!teacher_id || !school_id || !day_of_week || !period_number) {
    return NextResponse.json({ error: 'teacher_id, school_id, day_of_week, period_number required' }, { status: 400 })
  }
  try {
    await pool.query(
      `DELETE FROM teacher_unavailability
       WHERE teacher_id = $1 AND school_id = $2 AND day_of_week = $3 AND period_number = $4`,
      [teacher_id, school_id, day_of_week, period_number]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to clear slot' }, { status: 500 })
  }
}
