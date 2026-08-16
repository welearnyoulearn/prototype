import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getAnySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // This handler previously had NO session check at all, and school_id was pushed
    // only `if (school_id)` — so omitting the param produced an empty WHERE and
    // returned every teacher's leave records, across every school, to an entirely
    // unauthenticated caller (middleware treats /api/ as public). Authenticate
    // first, then scope to the session's school so neither hole can reopen.
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const school_id = req.nextUrl.searchParams.get('school_id')
    const teacher_id = req.nextUrl.searchParams.get('teacher_id')
    const status = req.nextUrl.searchParams.get('status')
    // active_date=YYYY-MM-DD → only return leaves where that date falls within [start_date, end_date]
    const active_date = req.nextUrl.searchParams.get('active_date')

    if (school_id && Number(school_id) !== Number(session.schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      // Seeded as $1 rather than pushed conditionally, so the WHERE clause can
      // never come out school-less.
      const conditions: string[] = ['lr.school_id = $1']
      const values: (string | number)[] = [session.schoolId]

      if (teacher_id) { values.push(teacher_id); conditions.push(`lr.teacher_id = $${values.length}`) }
      if (status) { values.push(status); conditions.push(`lr.status = $${values.length}`) }
      if (active_date) {
        values.push(active_date)
        conditions.push(`$${values.length}::date BETWEEN lr.start_date AND lr.end_date`)
      }

      const where = `WHERE ${conditions.join(' AND ')}`

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
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { teacher_id, school_id, leave_type, start_date, end_date, reason } = await req.json()
    if (!teacher_id || !school_id || !leave_type || !start_date || !end_date) {
      return NextResponse.json({ error: 'teacher_id, school_id, leave_type, start_date, end_date are required' }, { status: 400 })
    }

    // Check for overlapping pending/approved leave
    const overlap = await pool.query(
      `SELECT id, status, start_date, end_date FROM leave_requests
       WHERE teacher_id = $1
         AND status IN ('pending', 'approved')
         AND start_date::date <= $3::date
         AND end_date::date >= $2::date`,
      [teacher_id, start_date, end_date]
    )
    if (overlap.rows.length > 0) {
      const ex = overlap.rows[0]
      const s = ex.start_date?.toString().slice(0, 10)
      const e = ex.end_date?.toString().slice(0, 10)
      return NextResponse.json(
        { error: `You already have a ${ex.status} leave request for overlapping dates (${s} – ${e})` },
        { status: 409 }
      )
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
