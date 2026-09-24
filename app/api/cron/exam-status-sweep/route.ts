// GET/POST /api/cron/exam-status-sweep
// Flips exam_records.status from 'scheduled' to 'collecting' once exam_date
// has passed — the "auto-unlock at exam date, no manual step" rule: a
// subject teacher can start entering marks the day after the exam without
// the class teacher or admin taking any action.
//
// Deliberately one-directional: a status is only ever moved forward here.
// An exam already in 'collecting', 'teacher_reviewed', or 'released' is left
// alone even if its exam_date is edited afterward — re-locking marks entry
// that's already in progress (or worse, already reviewed/released) because a
// date changed would destroy real work.
//
// Schedule: daily via vercel.json cron. Idempotent — re-running the same day
// only touches rows still in 'scheduled' with a past date, so a manual
// trigger is always safe.
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

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

  try {
    const { rows: opened } = await pool.query(`
      UPDATE exam_records
      SET status = 'collecting', entry_opened_at = NOW()
      WHERE status = 'scheduled' AND exam_date IS NOT NULL AND exam_date < CURRENT_DATE
      RETURNING id, school_id, class_id, exam_name
    `)

    let notified = 0
    for (const exam of opened) {
      // Subject teachers are already assigned at exam-creation time (copied
      // straight from class_subjects — see POST /api/exams/schedule), so
      // every subject teacher can be notified directly the moment entry
      // opens, no separate "assign subject teachers" step in between.
      try {
        const { rows: [cls] } = await pool.query(
          `SELECT class_teacher_id, grade, section FROM classes WHERE id = $1`,
          [exam.class_id]
        )
        const label = `Grade ${cls?.grade}-${cls?.section}`

        if (cls?.class_teacher_id) {
          await pool.query(`
            INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
            VALUES ($1, $2, 'exam_entry_open', $3, $4, $5)
          `, [
            exam.school_id, cls.class_teacher_id,
            `Marks entry open — ${exam.exam_name}`,
            `Marks entry is now open for ${exam.exam_name} (${label}). Subject teachers have been notified — you can track submissions from this exam's page.`,
            JSON.stringify({ exam_id: exam.id, class_id: exam.class_id }),
          ])
          notified++
        }

        const { rows: subjectTeachers } = await pool.query(
          `SELECT DISTINCT teacher_id, subject_name FROM exam_subjects WHERE exam_id = $1 AND teacher_id IS NOT NULL`,
          [exam.id]
        )
        for (const st of subjectTeachers) {
          if (st.teacher_id === cls?.class_teacher_id) continue // already notified above
          try {
            await pool.query(`
              INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
              VALUES ($1, $2, 'exam_entry_open', $3, $4, $5)
            `, [
              exam.school_id, st.teacher_id,
              `Enter marks — ${exam.exam_name}`,
              `Marks entry is now open for ${st.subject_name} in ${exam.exam_name} (${label}).`,
              JSON.stringify({ exam_id: exam.id, class_id: exam.class_id }),
            ])
            notified++
          } catch { /* non-critical */ }
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, exams_opened: opened.length, notified })
  } catch (err) {
    console.error('[cron/exam-status-sweep]', err)
    return NextResponse.json({ error: 'Failed to sweep exam statuses' }, { status: 500 })
  }
}
