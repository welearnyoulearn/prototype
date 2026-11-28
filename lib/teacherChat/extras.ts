// Phase 2 of Teacher Chat (#559): chat hours, online status, saved replies, parent alert choice and the
// school's reply-time figures. Ids come from the session, passed in by lib/teacherChat/routes.ts.

import type { Pool } from 'pg'
import { checkMessage } from './rules'
import { DEFAULT_HOURS, ONLINE_SECONDS, hoursText, withinHours, type ChatHours } from './hours'
import { ChatError } from './errors'

type Db = Pick<Pool, 'query'>
export const MAX_SAVED_REPLIES = 20
export const MAX_SAVED_REPLY = 500

// ── Chat hours ───────────────────────────────────────────────────────────────
export async function chatHours(db: Db, schoolId: number): Promise<ChatHours> {
  const { rows: [r] } = await db.query<ChatHours>(
    `SELECT TO_CHAR(opens, 'HH24:MI') AS opens, TO_CHAR(closes, 'HH24:MI') AS closes FROM chat_settings WHERE school_id = $1`, [schoolId])
  return r ?? DEFAULT_HOURS
}

export async function setChatHours(db: Db, schoolId: number, userId: number, hours: ChatHours): Promise<ChatHours> {
  if (hours.closes <= hours.opens) throw new ChatError('The closing time must be after the opening time.', 400)
  await db.query(`
    INSERT INTO chat_settings (school_id, opens, closes, updated_by) VALUES ($1, $2, $3, $4)
    ON CONFLICT (school_id) DO UPDATE SET opens = EXCLUDED.opens, closes = EXCLUDED.closes, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `, [schoolId, hours.opens, hours.closes, userId])
  return hours
}

// ── Online status ────────────────────────────────────────────────────────────
export async function touchPresence(db: Db, role: 'student' | 'teacher', id: number, now: Date) {
  await db.query(`
    INSERT INTO chat_presence (actor_type, actor_id, last_seen_at) VALUES ($1, $2, $3)
    ON CONFLICT (actor_type, actor_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
      WHERE chat_presence.last_seen_at < EXCLUDED.last_seen_at - INTERVAL '15 seconds'
  `, [role, id, now])
}

export type Presence = { online: boolean; hint: string | null }

/** Whether the other person is on their chat screen. Only ever shown during chat hours, and a teacher may hide it. */
export async function presenceOf(db: Db, schoolId: number, other: 'student' | 'teacher', otherId: number | null, now: Date): Promise<Presence> {
  const hours = await chatHours(db, schoolId)
  const hint = other === 'teacher' ? hoursText(hours) : null
  if (otherId === null || !withinHours(hours, now)) return { online: false, hint }
  const { rows: [r] } = await db.query(`
    SELECT 1 FROM chat_presence p
    WHERE p.actor_type = $1 AND p.actor_id = $2 AND p.last_seen_at > $3::timestamptz - make_interval(secs => $4)
      AND NOT ($1 = 'teacher' AND EXISTS (SELECT 1 FROM chat_teacher_prefs tp WHERE tp.teacher_id = $2 AND tp.hide_online))
  `, [other, otherId, now, ONLINE_SECONDS])
  return r ? { online: true, hint: null } : { online: false, hint }
}

// ── Teacher: own settings and saved replies ─────────────────────────────────
export type TeacherSettings = { hideOnline: boolean; hours: ChatHours; savedReplies: { id: number; body: string }[] }

export async function teacherSettings(db: Db, teacherId: number, schoolId: number): Promise<TeacherSettings> {
  const { rows: [p] } = await db.query<{ hide_online: boolean }>(`SELECT hide_online FROM chat_teacher_prefs WHERE teacher_id = $1`, [teacherId])
  const { rows } = await db.query<{ id: number; body: string }>(`SELECT id, body FROM chat_saved_replies WHERE teacher_id = $1 ORDER BY id`, [teacherId])
  return { hideOnline: p?.hide_online ?? false, hours: await chatHours(db, schoolId), savedReplies: rows }
}

export async function setHideOnline(db: Db, teacherId: number, hide: boolean) {
  await db.query(`INSERT INTO chat_teacher_prefs (teacher_id, hide_online) VALUES ($1, $2) ON CONFLICT (teacher_id) DO UPDATE SET hide_online = EXCLUDED.hide_online`, [teacherId, hide])
  return { hideOnline: hide }
}

export async function addSavedReply(db: Db, teacherId: number, body: string): Promise<{ id: number; body: string }> {
  const check = checkMessage(body)
  if (!check.ok) throw new ChatError(check.reason, 422)
  const { rows: [r] } = await db.query<{ id: number; body: string }>(`
    INSERT INTO chat_saved_replies (teacher_id, body)
    SELECT $1::int, $2::text WHERE (SELECT COUNT(*) FROM chat_saved_replies WHERE teacher_id = $1) < $3
    RETURNING id, body
  `, [teacherId, body, MAX_SAVED_REPLIES])
  if (!r) throw new ChatError(`You can keep ${MAX_SAVED_REPLIES} saved replies. Remove one first.`, 429)
  return r
}

export async function deleteSavedReply(db: Db, teacherId: number, id: number) {
  const { rowCount } = await db.query(`DELETE FROM chat_saved_replies WHERE id = $1 AND teacher_id = $2`, [id, teacherId])
  if (!rowCount) throw new ChatError('Saved reply not found', 404)
  return { deleted: true }
}

// ── Parent: instant alerts ──────────────────────────────────────────────────
export async function parentAlerts(db: Db, parentId: number) {
  const { rows: [r] } = await db.query<{ instant: boolean }>(`SELECT instant FROM chat_parent_prefs WHERE parent_id = $1`, [parentId])
  return { instant: r?.instant ?? false }
}

export async function setParentAlerts(db: Db, parentId: number, instant: boolean) {
  await db.query(`INSERT INTO chat_parent_prefs (parent_id, instant) VALUES ($1, $2) ON CONFLICT (parent_id) DO UPDATE SET instant = EXCLUDED.instant`, [parentId, instant])
  return { instant }
}

// ── School: how quickly doubts are answered ─────────────────────────────────
export type TeacherReplyStats = { teacher: string; waiting: number; overdue: number; avgReplyHours: number | null }

/** Per teacher: chats waiting now, those already escalated, and the average time to answer over 30 days. */
export async function replyStats(db: Db, schoolId: number, routedTeacher: string, now: Date): Promise<TeacherReplyStats[]> {
  const { rows } = await db.query<{ teacher: string | null; waiting: number; overdue: number; avg_hours: string | null }>(`
    WITH mine AS (
      SELECT t.id, ${routedTeacher} AS teacher_id, t.waiting_since, t.escalated_at, t.status FROM chat_threads t WHERE t.school_id = $1
    ), waiting AS (
      SELECT teacher_id, COUNT(*) FILTER (WHERE status = 'open' AND waiting_since IS NOT NULL)::int AS waiting,
             COUNT(*) FILTER (WHERE status = 'open' AND waiting_since IS NOT NULL AND escalated_at IS NOT NULL)::int AS overdue
      FROM mine GROUP BY teacher_id
    ), runs AS (
      -- A reply answers everything the student wrote since the previous reply: time it from the first of those.
      SELECT m.thread_id, m.sender_type, m.sender_id, m.created_at,
             COUNT(*) FILTER (WHERE m.sender_type = 'teacher') OVER (PARTITION BY m.thread_id ORDER BY m.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS run
      FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
      WHERE t.school_id = $1 AND t.last_message_at > $2::timestamptz - INTERVAL '30 days'
    ), answered AS (
      SELECT MIN(sender_id) FILTER (WHERE sender_type = 'teacher') AS teacher_id,
             MIN(created_at) FILTER (WHERE sender_type = 'student') AS asked,
             MIN(created_at) FILTER (WHERE sender_type = 'teacher') AS replied
      FROM runs GROUP BY thread_id, COALESCE(run, 0)
    ), speed AS (
      SELECT teacher_id, AVG(EXTRACT(EPOCH FROM (replied - asked)) / 3600) AS avg_hours
      FROM answered WHERE asked IS NOT NULL AND replied IS NOT NULL AND replied > $2::timestamptz - INTERVAL '30 days' GROUP BY teacher_id
    )
    SELECT te.name AS teacher, COALESCE(w.waiting, 0) AS waiting, COALESCE(w.overdue, 0) AS overdue, s.avg_hours
    FROM waiting w FULL JOIN speed s ON s.teacher_id = w.teacher_id
    LEFT JOIN teachers te ON te.id = COALESCE(w.teacher_id, s.teacher_id)
    ORDER BY COALESCE(w.overdue, 0) DESC, COALESCE(w.waiting, 0) DESC, te.name NULLS FIRST
  `, [schoolId, now])
  return rows.map(r => ({ teacher: r.teacher ?? 'No teacher assigned', waiting: r.waiting, overdue: r.overdue, avgReplyHours: r.avg_hours === null ? null : Math.round(Number(r.avg_hours) * 10) / 10 }))
}
