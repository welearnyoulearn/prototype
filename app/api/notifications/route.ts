import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getSession, getTeacherSession, getStudentSession, getParentSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // The recipient is derived from the session, never from the query string.
    // Previously the session was only checked for existence and the caller-supplied
    // teacher_id/student_id/recipient_school_id was trusted, so any logged-in user
    // could read anybody else's notifications just by changing the id in the URL.
    // Precedence matches getAnySession(): teacher, then student, then parent, then school staff.
    const teacher = await getTeacherSession()
    const student = teacher ? null : await getStudentSession()
    const parent  = teacher || student ? null : await getParentSession()
    // passive: NotificationBell polls every 30s — that must not count as user activity.
    const admin   = teacher || student || parent ? null : await getSession({ passive: true })

    let recipientColumn: string
    let recipientId: number

    if (teacher) {
      recipientColumn = 'n.recipient_teacher_id'
      recipientId = teacher.teacherId
    } else if (student) {
      recipientColumn = 'n.recipient_student_id'
      recipientId = student.studentId
    } else if (parent) {
      recipientColumn = 'n.recipient_parent_id'
      recipientId = parent.parentId
    } else if (admin?.schoolId) {
      recipientColumn = 'n.recipient_school_id'
      recipientId = admin.schoolId
    } else {
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

// The notification recipient, derived from whichever session is present — same precedence as
// GET above and getAnySession(): teacher, then student, then parent, then school staff.
async function sessionRecipient(): Promise<{ column: string; id: number } | null> {
  const teacher = await getTeacherSession()
  if (teacher) return { column: 'recipient_teacher_id', id: teacher.teacherId }
  const student = await getStudentSession()
  if (student) return { column: 'recipient_student_id', id: student.studentId }
  const parent = await getParentSession()
  if (parent) return { column: 'recipient_parent_id', id: parent.parentId }
  const admin = await getSession()
  if (admin?.schoolId) return { column: 'recipient_school_id', id: admin.schoolId }
  return null
}

const RECIPIENT_TABLES = [
  ['recipient_teacher_id', 'teachers'],
  ['recipient_student_id', 'students'],
  ['recipient_parent_id',  'parents'],
] as const

const createBody = z.object({
  recipient_teacher_id: z.coerce.number().int().positive().optional(),
  recipient_student_id: z.coerce.number().int().positive().optional(),
  recipient_parent_id:  z.coerce.number().int().positive().optional(),
  recipient_school:     z.boolean().optional(),
  type:    z.string().trim().min(1).max(50),
  title:   z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  data:    z.record(z.string(), z.unknown()).optional(),
}).passthrough() // school_id / sender_teacher_id / recipient_school_id from older clients are ignored

// Only school staff and teachers may create notifications, and only for people in their own
// school. The school and the sender come from the session, never from the body.
export async function POST(req: NextRequest) {
  try {
    const teacher = await getTeacherSession()
    const staff   = teacher ? null : await getSession()
    const schoolId = teacher?.schoolId ?? staff?.schoolId
    if (!schoolId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = createBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    const b = parsed.data
    const legacySchoolRecipient = (b as { recipient_school_id?: unknown }).recipient_school_id != null
    const toSchool = b.recipient_school === true || legacySchoolRecipient
    if (!b.recipient_teacher_id && !b.recipient_student_id && !b.recipient_parent_id && !toSchool) {
      return NextResponse.json({ error: 'a recipient_* id is required' }, { status: 400 })
    }
    const legacySchoolId = (b as { school_id?: unknown }).school_id
    if (legacySchoolId != null && Number(legacySchoolId) !== schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Every named recipient must belong to the caller's school.
    for (const [key, table] of RECIPIENT_TABLES) {
      const id = b[key]
      if (!id) continue
      const { rowCount } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 AND school_id = $2`, [id, schoolId])
      if (!rowCount) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }

    const result = await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, recipient_student_id, recipient_parent_id, recipient_school_id, sender_teacher_id, type, title, message, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [schoolId, b.recipient_teacher_id ?? null, b.recipient_student_id ?? null, b.recipient_parent_id ?? null,
       toSchool ? schoolId : null, teacher?.teacherId ?? null, b.type, b.title ?? null, b.message ?? null,
       b.data ? JSON.stringify(b.data) : null]
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}

// Marks the caller's own notifications read — one by id, or all of them. Like GET, the
// recipient comes from the session; teacher_id/student_id/parent_id/school_id in the body
// are ignored (they used to let anyone mark anybody's notifications read).
export async function PUT(req: NextRequest) {
  try {
    const recipient = await sessionRecipient()
    if (!recipient) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { notification_id?: unknown; notification_ids?: unknown }

    // A batch (e.g. "mark this group read") — still limited to the caller's own rows.
    if (body.notification_ids !== undefined) {
      const ids = Array.isArray(body.notification_ids) ? body.notification_ids.map(Number) : []
      if (ids.length === 0 || ids.length > 200 || ids.some(id => !Number.isInteger(id) || id <= 0)) {
        return NextResponse.json({ error: 'notification_ids must be 1-200 positive integers' }, { status: 400 })
      }
      await pool.query(`UPDATE notifications SET is_read = TRUE WHERE id = ANY($1::int[]) AND ${recipient.column} = $2`, [ids, recipient.id])
      return NextResponse.json({ success: true })
    }

    const notificationId = body.notification_id == null ? null : Number(body.notification_id)
    if (notificationId !== null && (!Number.isInteger(notificationId) || notificationId <= 0)) {
      return NextResponse.json({ error: 'Invalid notification_id' }, { status: 400 })
    }

    if (notificationId !== null) {
      await pool.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND ${recipient.column} = $2`, [notificationId, recipient.id])
    } else {
      await pool.query(`UPDATE notifications SET is_read = TRUE WHERE ${recipient.column} = $1`, [recipient.id])
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
