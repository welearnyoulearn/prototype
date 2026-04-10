import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

export async function POST(req: NextRequest) {

  const body = await req.json()
  const { school_id, roll_number, parent_phone } = body

  if (!school_id || !roll_number?.trim() || !parent_phone?.trim()) {
    return NextResponse.json({ error: 'school_id, roll_number, and parent_phone required' }, { status: 400 })
  }

  try {
    const { rows: [student] } = await pool.query(`
      SELECT s.*, c.id AS class_id
      FROM students s
      JOIN classes c ON c.grade = s.grade AND c.section = s.section AND c.school_id = s.school_id
      WHERE s.school_id = $1 AND s.roll_number = $2 AND s.status = 'active'
    `, [parseInt(school_id), roll_number.trim()])

    if (!student) {
      return NextResponse.json({ error: 'Student not found or phone does not match' }, { status: 401 })
    }

    const phoneMatches =
      (student.parent_phone || '').trim() === parent_phone.trim()

    if (!phoneMatches) {
      return NextResponse.json({ error: 'Student not found or phone does not match' }, { status: 401 })
    }

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        section: student.section,
        roll_number: student.roll_number,
        school_id: student.school_id,
        class_id: student.class_id,
        parent_name: student.parent_name,
        parent_phone: student.parent_phone,
      },
    })
  } catch (err) {
    console.error('POST /api/parent/lookup error:', err)
    return NextResponse.json({ error: 'Failed to lookup student' }, { status: 500 })
  }
}
