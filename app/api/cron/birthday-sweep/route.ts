// GET/POST /api/cron/birthday-sweep
//
// Runs once daily at midnight IST (vercel.json cron: "30 18 * * *" UTC —
// Vercel Cron has no timezone option, so 18:30 UTC = 00:00 IST). Finds every
// student/teacher/parent whose date_of_birth's month+day matches "today" in
// IST (computed fresh here, not from the server's local clock, so this is
// correct regardless of what time the job actually executes or is manually
// re-triggered) and inserts one birthday_posts row per person.
//
// The UNIQUE(person_type, person_id, post_date) constraint on birthday_posts
// is the actual once-per-year guarantee, not this job's own discipline — the
// `RETURNING id` from an ON CONFLICT DO NOTHING insert tells us whether a row
// was newly created THIS run, and the birthday/circle notification is only
// ever sent when it was, so a duplicate run (retry, manual re-trigger) never
// double-posts or double-notifies anyone.
//
// Students get a circle post (class_circle_id set, lazily created via
// getOrCreateClassCircle) plus a notification; teachers and parents get a
// notification only — no circle visibility, per product decision.
//
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOrCreateClassCircle } from '@/lib/classCircle'
import { getISTDateParts } from '@/lib/birthday'

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { month, day, dateStr } = getISTDateParts()

  try {
    let studentPosts = 0
    let teacherNotifications = 0
    let parentNotifications = 0

    // ── Students: circle post + notification ──────────────────────────────
    const students = await pool.query(
      `SELECT id, school_id, grade, name FROM students
       WHERE date_of_birth IS NOT NULL AND status = 'active'
         AND EXTRACT(MONTH FROM date_of_birth) = $1 AND EXTRACT(DAY FROM date_of_birth) = $2`,
      [month, day]
    )
    for (const s of students.rows) {
      const circleId = await getOrCreateClassCircle(s.school_id, s.grade)
      const inserted = await pool.query(
        `INSERT INTO birthday_posts (person_type, person_id, class_circle_id, post_date)
         VALUES ('student', $1, $2, $3)
         ON CONFLICT (person_type, person_id, post_date) DO NOTHING
         RETURNING id`,
        [s.id, circleId, dateStr]
      )
      if (inserted.rows.length > 0) {
        studentPosts++
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_student_id, type, title, message)
           VALUES ($1, $2, 'birthday', '🎉 Happy Birthday!', $3)`,
          [s.school_id, s.id, `Wishing you a wonderful birthday, ${s.name}! Check your Class Circle to see who's wished you.`]
        )
      }
    }

    // ── Teachers: notification only ────────────────────────────────────────
    const teachers = await pool.query(
      `SELECT id, school_id, name FROM teachers
       WHERE date_of_birth IS NOT NULL AND removed_at IS NULL
         AND EXTRACT(MONTH FROM date_of_birth) = $1 AND EXTRACT(DAY FROM date_of_birth) = $2`,
      [month, day]
    )
    for (const t of teachers.rows) {
      const inserted = await pool.query(
        `INSERT INTO birthday_posts (person_type, person_id, class_circle_id, post_date)
         VALUES ('teacher', $1, NULL, $2)
         ON CONFLICT (person_type, person_id, post_date) DO NOTHING
         RETURNING id`,
        [t.id, dateStr]
      )
      if (inserted.rows.length > 0) {
        teacherNotifications++
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message)
           VALUES ($1, $2, 'birthday', '🎉 Happy Birthday!', $3)`,
          [t.school_id, t.id, `Wishing you a wonderful birthday, ${t.name}!`]
        )
      }
    }

    // ── Parents: notification only ─────────────────────────────────────────
    const parents = await pool.query(
      `SELECT id, school_id, name FROM parents
       WHERE date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM date_of_birth) = $1 AND EXTRACT(DAY FROM date_of_birth) = $2`,
      [month, day]
    )
    for (const p of parents.rows) {
      const inserted = await pool.query(
        `INSERT INTO birthday_posts (person_type, person_id, class_circle_id, post_date)
         VALUES ('parent', $1, NULL, $2)
         ON CONFLICT (person_type, person_id, post_date) DO NOTHING
         RETURNING id`,
        [p.id, dateStr]
      )
      if (inserted.rows.length > 0) {
        parentNotifications++
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_parent_id, type, title, message)
           VALUES ($1, $2, 'birthday', '🎉 Happy Birthday!', $3)`,
          [p.school_id, p.id, `Wishing you a wonderful birthday, ${p.name || 'there'}!`]
        )
      }
    }

    return NextResponse.json({ date: dateStr, studentPosts, teacherNotifications, parentNotifications })
  } catch (error) {
    console.error('[cron/birthday-sweep]', error)
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
