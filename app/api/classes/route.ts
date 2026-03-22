import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    const result = await pool.query(
      `SELECT c.*, t.name AS class_teacher_name,
              (SELECT COUNT(*) FROM students s WHERE s.grade = c.grade AND s.section = c.section AND s.school_id = c.school_id) AS student_count
       FROM classes c
       LEFT JOIN teachers t ON c.class_teacher_id = t.id
       WHERE c.school_id = $1
       ORDER BY c.grade, c.section`,
      [school_id]
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { school_id, grade, section, class_teacher_id } = await req.json()
    if (!school_id || !grade || !section) {
      return NextResponse.json({ error: 'school_id, grade, section required' }, { status: 400 })
    }
    const result = await pool.query(
      `INSERT INTO classes (school_id, grade, section, class_teacher_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [school_id, grade.trim(), section.trim(), class_teacher_id || null]
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'This class already exists' }, { status: 409 })
    }
    console.error(error)
    return NextResponse.json({ error: 'Failed to create class' }, { status: 500 })
  }
}
