import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// POST /api/notifications/nudge-teacher
// Body: { school_id, teacher_id, subject, class_label, pct }
//
// School-admin-only, one-off nudge from the Syllabus Tracking screen when a
// class-subject is "Behind" — a plain in-app notification row, same
// mechanism and shape as every other teacher-directed alert in this app
// (see PUT /api/leave-requests/:id's approved/rejected notification): a
// direct INSERT INTO notifications with sender_teacher_id left NULL (the
// sender is a school admin, not a teacher), fire-and-forget, no new
// notification channel introduced.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, teacher_id, subject, class_label, pct } = body

    if (!school_id || !teacher_id || !subject || !class_label || typeof pct !== 'number') {
      return NextResponse.json({ error: 'school_id, teacher_id, subject, class_label, pct required' }, { status: 400 })
    }

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [teacher] } = await pool.query(
      'SELECT id FROM teachers WHERE id = $1 AND school_id = $2',
      [teacher_id, access.schoolId]
    )
    if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

    let adminName = access.actor
    if (access.userId) {
      const { rows: [user] } = await pool.query('SELECT full_name FROM users WHERE id = $1', [access.userId])
      if (user?.full_name) adminName = user.full_name
    }

    await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        access.schoolId, teacher_id, 'syllabus_behind_nudge',
        'Syllabus Coverage Reminder',
        `${adminName} flagged ${subject} for ${class_label} as behind schedule (${pct}% covered).`,
        JSON.stringify({ subject, class_label, pct }),
      ]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notifications/nudge-teacher]', err)
    return NextResponse.json({ error: 'Failed to send nudge' }, { status: 500 })
  }
}
