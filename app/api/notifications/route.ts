import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, getTeacherSession, getStudentSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // The recipient is derived from the session, never from the query string.
    // Previously the session was only checked for existence and the caller-supplied
    // teacher_id/student_id/recipient_school_id was trusted, so any logged-in user
    // could read anybody else's notifications just by changing the id in the URL.
    // Precedence matches getAnySession(): teacher, then student, then school staff.
    const teacher = await getTeacherSession()
    const student = teacher ? null : await getStudentSession()
    const admin   = teacher || student ? null : await getSession()

    let recipientColumn: string
    let recipientId: number

    if (teacher) {
      recipientColumn = 'n.recipient_teacher_id'
      recipientId = teacher.teacherId
    } else if (student) {
      recipientColumn = 'n.recipient_student_id'
      recipientId = student.studentId
    } else if (admin?.schoolId) {
      recipientColumn = 'n.recipient_school_id'
      recipientId = admin.schoolId
    } else {
      // Includes parent sessions — no notification stream exists for them today.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const unread_only = new URL(req.url).searchParams.get('unread_only')

    try {
      let q = `SELECT n.*, t.name AS sender_name
               FROM notifications n
               LEFT JOIN teachers t ON n.sender_teacher_id = t.id
               WHERE `
      const vals: (string | number)[] = [recipientId]
      q += `${recipientColumn} = $1`

      if (unread_only === 'true') q += ` AND n.is_read = FALSE`
      q += ' ORDER BY n.created_at DESC LIMIT 50'
      const result = await pool.query(q, vals)
      return NextResponse.json(result.rows)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { school_id, recipient_teacher_id, recipient_school_id, sender_teacher_id, type, title, message, data } = await req.json()
    if (!school_id || !type) {
      return NextResponse.json({ error: 'school_id and type required' }, { status: 400 })
    }
    if (!recipient_teacher_id && !recipient_school_id) {
      return NextResponse.json({ error: 'recipient_teacher_id or recipient_school_id required' }, { status: 400 })
    }
    const result = await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, recipient_school_id, sender_teacher_id, type, title, message, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [school_id, recipient_teacher_id || null, recipient_school_id || null,
       sender_teacher_id || null, type, title || null, message || null,
       data ? JSON.stringify(data) : null]
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { teacher_id, school_id, student_id, notification_id } = await req.json()
    if (notification_id) {
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [notification_id])
    } else if (teacher_id) {
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE recipient_teacher_id = $1', [teacher_id])
    } else if (student_id) {
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE recipient_student_id = $1', [student_id])
    } else if (school_id) {
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE recipient_school_id = $1', [school_id])
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
