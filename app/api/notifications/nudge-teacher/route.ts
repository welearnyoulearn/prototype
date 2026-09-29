import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// POST /api/notifications/nudge-teacher
// Body: { school_id, teacher_id, class_id, subject, pct }
//
// School-admin-only, one-off nudge from the Syllabus Tracking screen when a
// class-subject is "Behind" — a plain in-app notification row, same
// mechanism and shape as every other teacher-directed alert in this app:
// a direct INSERT INTO notifications with sender_teacher_id left NULL (the
// sender is a school admin, not a teacher), fire-and-forget, no new
// notification channel introduced.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, teacher_id, class_id, subject, pct } = body

    if (!school_id || !teacher_id || !class_id || !subject || typeof pct !== 'number' || pct < 0 || pct > 100) {
      return NextResponse.json({ error: 'school_id, teacher_id, class_id, subject and pct (0-100) required' }, { status: 400 })
    }

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [assignment] } = await pool.query(
      `SELECT t.id, c.grade, c.section
         FROM class_subjects cs
         JOIN classes c ON c.id = cs.class_id AND c.school_id = $2 AND c.deleted_at IS NULL
         JOIN teachers t ON t.id = cs.teacher_id AND t.school_id = $2
          AND t.status = 'active' AND t.removed_at IS NULL
        WHERE cs.class_id = $3 AND cs.teacher_id = $1
          AND LOWER(TRIM(cs.subject_name)) = LOWER(TRIM($4))`,
      [teacher_id, access.schoolId, class_id, subject]
    )
    if (!assignment) return NextResponse.json({ error: 'Active teacher assignment not found' }, { status: 404 })
    const classLabel = `${assignment.grade}-${assignment.section}`

    let adminName = access.actor
    if (access.userId) {
      const { rows: [user] } = await pool.query('SELECT full_name FROM users WHERE id = $1', [access.userId])
      if (user?.full_name) adminName = user.full_name
    }

    const duplicate = await pool.query(
      `SELECT 1 FROM notifications
        WHERE school_id = $1 AND recipient_teacher_id = $2 AND type = 'syllabus_behind_nudge'
          AND data->>'class_id' = $3 AND LOWER(data->>'subject') = LOWER($4)
          AND created_at >= NOW() - INTERVAL '24 hours'
        LIMIT 1`,
      [access.schoolId, teacher_id, String(class_id), subject],
    )
    if (duplicate.rows.length) {
      return NextResponse.json({ error: 'A reminder was already sent for this assignment in the last 24 hours' }, { status: 409 })
    }

    await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        access.schoolId, teacher_id, 'syllabus_behind_nudge',
        'Syllabus Coverage Reminder',
        `${adminName} flagged ${subject} for ${classLabel} as behind schedule (${pct}% covered).`,
        JSON.stringify({ subject, class_id: String(class_id), class_label: classLabel, pct }),
      ]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notifications/nudge-teacher]', err)
    return NextResponse.json({ error: 'Failed to send nudge' }, { status: 500 })
  }
}
