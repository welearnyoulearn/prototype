import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const school_id = searchParams.get('school_id')
    const grade = searchParams.get('grade')
    const section = searchParams.get('section')

    const conditions: string[] = []
    const values: (string | number)[] = []

    if (school_id) { values.push(school_id); conditions.push(`school_id = $${values.length}`) }
    if (grade) { values.push(grade); conditions.push(`grade = $${values.length}`) }
    if (section) { values.push(section); conditions.push(`section = $${values.length}`) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(
      `SELECT * FROM students ${where} ORDER BY grade, section, name`,
      values
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { school_id, name, email, grade, section, phone, parent_name, parent_phone, roll_number } = await req.json()
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name are required' }, { status: 400 })

    const result = await pool.query(
      `INSERT INTO students (school_id, name, email, grade, section, phone, parent_name, parent_phone, roll_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [school_id, name, email, grade, section, phone, parent_name, parent_phone, roll_number]
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create student' }, { status: 500 })
  }
}
