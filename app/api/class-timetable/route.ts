import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id = searchParams.get('class_id')
  const teacher_id = searchParams.get('teacher_id')
  const date = searchParams.get('date') // YYYY-MM-DD — overlays substitute info for that date

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    const vals: (string | number)[] = [school_id]

    const selectExtra = date
      ? `, sa.substitute_teacher_id, st.name AS substitute_teacher_name, sa.id AS substitute_assignment_id`
      : ''

    let fromClause = `FROM class_timetable ct LEFT JOIN teachers t ON ct.teacher_id = t.id`
    if (date) {
      vals.push(date) // $2 = date
      fromClause += `
             LEFT JOIN substitute_assignments sa
               ON sa.class_id = ct.class_id
              AND sa.period_number = ct.period_number
              AND sa.school_id = ct.school_id
              AND sa.date = $2
             LEFT JOIN teachers st ON st.id = sa.substitute_teacher_id`
    }

    let whereClause = ` WHERE ct.school_id = $1`
    if (class_id) { whereClause += ` AND ct.class_id = $${vals.length + 1}`; vals.push(class_id) }
    if (teacher_id) { whereClause += ` AND ct.teacher_id = $${vals.length + 1}`; vals.push(teacher_id) }

    const q = `SELECT ct.*, t.name AS teacher_name, t.employee_id${selectExtra}
             ${fromClause}${whereClause}
             ORDER BY CASE ct.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, ct.period_number`

    const result = await pool.query(q, vals)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch class timetable' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, subject_name, teacher_id, room, time_from, time_to } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const result = await pool.query(
      `UPDATE class_timetable
       SET subject_name = $1,
           teacher_id = $2,
           room = COALESCE($3, room),
           time_from = COALESCE($4, time_from),
           time_to = COALESCE($5, time_to)
       WHERE id = $6 RETURNING *`,
      [subject_name || null, teacher_id || null, room, time_from, time_to, id]
    )
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const class_id = searchParams.get('class_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    if (class_id) {
      await pool.query('DELETE FROM class_timetable WHERE class_id = $1 AND school_id = $2', [class_id, school_id])
    } else {
      await pool.query('DELETE FROM class_timetable WHERE school_id = $1', [school_id])
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete timetable' }, { status: 500 })
  }
}
