import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  await ensureDB()
  const school_id = req.nextUrl.searchParams.get('school_id')
  const teacher_id = req.nextUrl.searchParams.get('teacher_id')
  const status = req.nextUrl.searchParams.get('status')
  // active_date=YYYY-MM-DD → only return leaves where that date falls within [start_date, end_date]
  const active_date = req.nextUrl.searchParams.get('active_date')

  try {
    const conditions: string[] = []
    const values: (string | number)[] = []

    if (school_id) { values.push(school_id); conditions.push(`lr.school_id = $${values.length}`) }
    if (teacher_id) { values.push(teacher_id); conditions.push(`lr.teacher_id = $${values.length}`) }
    if (status) { values.push(status); conditions.push(`lr.status = $${values.length}`) }
    if (active_date) {
      values.push(active_date)
      conditions.push(`$${values.length}::date BETWEEN lr.start_date AND lr.end_date`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(
      `SELECT lr.*, t.name AS teacher_name, t.employee_id, t.department
       FROM leave_requests lr
       JOIN teachers t ON lr.teacher_id = t.id
       ${where}
       ORDER BY lr.created_at DESC`,
      values
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch leave requests' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { teacher_id, school_id, leave_type, start_date, end_date, reason } = await req.json()
    if (!teacher_id || !school_id || !leave_type || !start_date || !end_date) {
      return NextResponse.json({ error: 'teacher_id, school_id, leave_type, start_date, end_date are required' }, { status: 400 })
    }
    const result = await pool.query(
      `INSERT INTO leave_requests (teacher_id, school_id, leave_type, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [teacher_id, school_id, leave_type, start_date, end_date, reason || null]
    )
    const lr = result.rows[0]

    // Notify school admin
    const teacher = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacher_id])
    const teacherName = teacher.rows[0]?.name || 'A teacher'
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_school_id, sender_teacher_id, type, title, message, data)
       VALUES ($1,$2,$3,'leave_request',$4,$5,$6)`,
      [school_id, school_id, teacher_id,
       `Leave Request: ${teacherName}`,
       `${teacherName} has requested ${leave_type} leave from ${start_date} to ${end_date}${reason ? ': ' + reason : ''}`,
       JSON.stringify({ leave_request_id: lr.id, leave_type, start_date, end_date })]
    ).catch(() => {/* non-fatal */})

    return NextResponse.json(lr, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create leave request' }, { status: 500 })
  }
}
