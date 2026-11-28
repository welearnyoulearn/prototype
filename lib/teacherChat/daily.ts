// The two daily jobs of Teacher Chat (#559), run by /api/cron/teacher-chat. Both are safe to run twice.
//   escalate  a doubt unanswered for 2 school days is raised once with the school and the class teacher
//   summary   one note a day to each parent whose child chatted with a teacher that day

import type { Pool } from 'pg'
import { ROUTED_TEACHER } from './service'

type Db = Pick<Pool, 'query'>
export const ESCALATE_AFTER_SCHOOL_DAYS = 2

export type DailyDeps = {
  featureOn: (schoolId: number) => Promise<boolean>
  /** Dates (YYYY-MM-DD) with no school between two dates, inclusive. */
  daysOff: (schoolId: number, from: string, to: string) => Promise<Set<string>>
}

const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10)
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** School days that have fully passed since the day the student started waiting. */
function schoolDaysPassed(from: string, today: string, off: Set<string>): number {
  let n = 0
  for (let d = nextDay(from); d <= today; d = nextDay(d)) if (!off.has(d)) n++
  return n
}

export async function escalateOverdue(db: Db, deps: DailyDeps, now: Date = new Date()): Promise<{ escalated: number }> {
  const { rows } = await db.query<{ id: number; school_id: number; waiting_since: Date; teacher_id: number | null; class_teacher_id: number | null }>(`
    SELECT t.id, t.school_id, t.waiting_since, ${ROUTED_TEACHER('t.class_id', 't.subject_name')} AS teacher_id, c.class_teacher_id
    FROM chat_threads t JOIN classes c ON c.id = t.class_id
    WHERE t.status = 'open' AND t.escalated_at IS NULL AND t.waiting_since < $1::timestamptz - INTERVAL '1 day'
    ORDER BY t.school_id, t.id LIMIT 2000
  `, [now])
  const today = istDate(now)
  let escalated = 0
  for (const t of rows) {
    if (!await deps.featureOn(t.school_id)) continue
    const from = istDate(t.waiting_since)
    if (schoolDaysPassed(from, today, await deps.daysOff(t.school_id, from, today)) < ESCALATE_AFTER_SCHOOL_DAYS) continue
    const claimed = await db.query(`UPDATE chat_threads SET escalated_at = $2 WHERE id = $1 AND escalated_at IS NULL`, [t.id, now])
    if (!claimed.rowCount) continue
    escalated++
    const note = (column: 'recipient_school_id' | 'recipient_teacher_id', id: number) => db.query(`
      INSERT INTO notifications (school_id, ${column}, type, title, message, data)
      VALUES ($1, $2, 'chat_overdue', '⏳ A student is still waiting', 'A doubt has had no answer for two school days.', jsonb_build_object('thread_id', $3::int))
    `, [t.school_id, id, t.id])
    await note('recipient_school_id', t.school_id)
    if (t.class_teacher_id && t.class_teacher_id !== t.teacher_id) await note('recipient_teacher_id', t.class_teacher_id)
  }
  return { escalated }
}

export async function parentDailySummary(db: Db, deps: DailyDeps, now: Date = new Date()): Promise<{ sent: number }> {
  const today = istDate(now)
  const { rows } = await db.query<{ school_id: number; parent_id: number; student_id: number; student: string; messages: number }>(`
    SELECT t.school_id, sp.parent_id, t.student_id, s.name AS student, COUNT(m.id)::int AS messages
    FROM chat_messages m
    JOIN chat_threads t ON t.id = m.thread_id
    JOIN students s ON s.id = t.student_id
    JOIN student_parents sp ON sp.student_id = t.student_id
    JOIN parents p ON p.id = sp.parent_id AND p.school_id = t.school_id
    WHERE m.created_at >= $1::date::timestamp AT TIME ZONE 'Asia/Kolkata' AND m.created_at <= $2
    GROUP BY t.school_id, sp.parent_id, t.student_id, s.name
  `, [today, now])
  let sent = 0
  for (const r of rows) {
    if (!await deps.featureOn(r.school_id)) continue
    const { rowCount } = await db.query(`
      INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data)
      SELECT $1::int, $2::int, 'chat_parent_summary', '💬 Today’s teacher chats', $3::text, jsonb_build_object('student_id', $4::int, 'date', $5::text)
      WHERE NOT EXISTS (SELECT 1 FROM notifications n WHERE n.recipient_parent_id = $2 AND n.type = 'chat_parent_summary'
        AND n.data->>'student_id' = $4::text AND n.data->>'date' = $5)
    `, [r.school_id, r.parent_id, `${r.student} and their teachers exchanged ${r.messages} message${r.messages === 1 ? '' : 's'} today. You can read them in Teacher Chats.`, r.student_id, today])
    sent += rowCount ?? 0
  }
  return { sent }
}
