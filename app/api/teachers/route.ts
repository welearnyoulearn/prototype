import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const staff_type = searchParams.get('staff_type')
    const department = searchParams.get('department')

    const conditions: string[] = []
    const values: (string | number)[] = []

    if (school_id) { values.push(school_id); conditions.push(`t.school_id = $${values.length}`) }
    if (staff_type) { values.push(staff_type); conditions.push(`t.staff_type = $${values.length}`) }
    if (department) { values.push(department); conditions.push(`t.department = $${values.length}`) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(
      `SELECT t.*,
              c.id AS class_id, c.grade AS class_grade, c.section AS class_section
       FROM teachers t
       LEFT JOIN classes c ON c.class_teacher_id = t.id AND c.school_id = t.school_id
       ${where}
       ORDER BY t.staff_type, t.department, t.name`,
      values
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { school_id, name, email, subject, phone, staff_type } = await req.json()
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name are required' }, { status: 400 })

    const result = await pool.query(
      'INSERT INTO teachers (school_id, name, email, subject, phone, staff_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [school_id, name, email, subject, phone, staff_type || 'teaching']
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
  }
}
