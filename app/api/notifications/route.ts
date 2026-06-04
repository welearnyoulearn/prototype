import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getAnySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const teacher_id = searchParams.get('teacher_id')
  const recipient_school_id = searchParams.get('recipient_school_id')
  const student_id = searchParams.get('student_id')
  const unread_only = searchParams.get('unread_only')

  if (!teacher_id && !recipient_school_id && !student_id) {
    return NextResponse.json({ error: 'teacher_id, recipient_school_id, or student_id required' }, { status: 400 })
  }
  try {
    let q = `SELECT n.*, t.name AS sender_name
             FROM notifications n
             LEFT JOIN teachers t ON n.sender_teacher_id = t.id
             WHERE `
    const vals: (string | number)[] = []

    if (teacher_id) {
      vals.push(teacher_id)
      q += `n.recipient_teacher_id = $${vals.length}`
    } else if (student_id) {
      vals.push(student_id)
      q += `n.recipient_student_id = $${vals.length}`
    } else {
      vals.push(recipient_school_id!)
      q += `n.recipient_school_id = $${vals.length}`
    }

    if (unread_only === 'true') q += ` AND n.is_read = FALSE`
    q += ' ORDER BY n.created_at DESC LIMIT 50'
    const result = await pool.query(q, vals)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
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
