// GET/POST /api/cron/exam-reminders
// Sends the 7-day-before / 1-day-before / exam-day reminders from the spec
// to every applicable student and their linked parent(s). Distinct from
// exam-status-sweep, which only flips status once the date passes — this
// cron never changes exam_records, it only reads exam_date and notifies.
//
// Dedup: exam_reminders_sent(exam_id, reminder_type) is UNIQUE — a reminder
// is only ever sent once per exam per type, however many times this cron
// runs on the same day (a manual trigger, a Vercel retry, a redeploy that
// re-fires the daily schedule).
//
// Per-school opt-out: exam_notification_settings.remind_7_day / remind_1_day
// / remind_exam_day (spec section 11) — a school with a row disabling a
// reminder type is skipped for that type; a school with no row yet defaults
// to all reminders on (same default the settings API seeds).
//
// Schedule: daily via vercel.json cron, same time as exam-status-sweep.
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

const REMINDERS: { type: string; offsetDays: number; settingCol: string }[] = [
  { type: 'exam_reminder_7day', offsetDays: 7, settingCol: 'remind_7_day' },
  { type: 'exam_reminder_1day', offsetDays: 1, settingCol: 'remind_1_day' },
  { type: 'exam_reminder_today', offsetDays: 0, settingCol: 'remind_exam_day' },
]

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/exam-reminders] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let remindersSent = 0
    let examsProcessed = 0

    for (const reminder of REMINDERS) {
      const { rows: exams } = await pool.query(`
        SELECT e.id, e.school_id, e.class_id, e.exam_name, e.exam_type, e.start_time, e.end_time, e.room, e.student_scope,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          c.grade, c.section, c.class_teacher_id
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        LEFT JOIN exam_notification_settings ens ON ens.school_id = e.school_id
        WHERE e.exam_date = CURRENT_DATE + $1::int
          AND e.status IN ('scheduled', 'collecting')
          AND COALESCE(ens.${reminder.settingCol}, TRUE) = TRUE
          AND NOT EXISTS (SELECT 1 FROM exam_reminders_sent ers WHERE ers.exam_id = e.id AND ers.reminder_type = $2)
      `, [reminder.offsetDays, reminder.type])

      for (const exam of exams) {
        examsProcessed++
        // Claim this (exam, reminder_type) before sending — if two cron runs
        // race, only one wins the INSERT and sends.
        const claimed = await pool.query(
          `INSERT INTO exam_reminders_sent (exam_id, reminder_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id`,
          [exam.id, reminder.type]
        )
        if (claimed.rows.length === 0) continue

        const studentIds = exam.student_scope === 'specific'
          ? (await pool.query(`SELECT student_id FROM exam_applicable_students WHERE exam_id = $1`, [exam.id])).rows.map((r: { student_id: number }) => r.student_id)
          : (await pool.query(
              `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
              [exam.school_id, exam.grade, exam.section]
            )).rows.map((r: { id: number }) => r.id)

        const timeLabel = exam.start_time ? ` at ${String(exam.start_time).slice(0, 5)}` : ''
        const roomLabel = exam.room ? ` (Room ${exam.room})` : ''
        let title: string
        let message: string
        if (reminder.offsetDays === 7) {
          title = `📢 Upcoming Exam`
          message = `${exam.exam_name} is scheduled on ${exam.exam_date}${timeLabel}.`
        } else if (reminder.offsetDays === 1) {
          title = `🔔 Exam Tomorrow`
          message = `${exam.exam_name}${timeLabel}${roomLabel}.`
        } else {
          title = `📝 Exam Today`
          const endLabel = exam.end_time ? `–${String(exam.end_time).slice(0, 5)}` : ''
          message = `${exam.exam_name}${timeLabel}${endLabel}${roomLabel}`
        }
        const data = JSON.stringify({ exam_id: exam.id, class_id: exam.class_id })

        for (const sid of studentIds) {
          try {
            await pool.query(
              `INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5, $6)`,
              [exam.school_id, sid, reminder.type, title, message, data]
            )
            remindersSent++
          } catch { /* non-critical */ }
        }
        if (studentIds.length > 0) {
          try {
            const { rows: parentLinks } = await pool.query(
              `SELECT DISTINCT sp.parent_id FROM student_parents sp
               JOIN parents p ON p.id = sp.parent_id
               WHERE sp.student_id = ANY($1::int[]) AND p.school_id = $2`, [studentIds, exam.school_id]
            )
            for (const link of parentLinks) {
              await pool.query(
                `INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5, $6)`,
                [exam.school_id, link.parent_id, reminder.type, title, message, data]
              )
              remindersSent++
            }
          } catch { /* non-critical */ }
        }
      }
    }

    return NextResponse.json({ success: true, exams_processed: examsProcessed, reminders_sent: remindersSent })
  } catch (err) {
    console.error('[cron/exam-reminders]', err)
    return NextResponse.json({ error: 'Failed to send exam reminders' }, { status: 500 })
  }
}
