// Teacher Chat (#556, #558): a student asks a teacher any doubt; the two chat; parents read along; the school
// reviews what is flagged or reported. Separate from the quiz doubts in lib/studentDoubts.ts.
//
// Access rules, checked here for every read and write:
//   student  their own threads
//   teacher  threads of a subject they teach in that class now (else the class teacher)
//   parent   threads of their own child, read only; reading never moves a tick
//   school   threads of their school; every open is logged
// Ids always come from the session, passed in by lib/teacherChat/routes.ts. Inside a transaction every query
// uses the transaction's connection: production allows one connection per instance.

import type { Pool, PoolClient } from 'pg'
import {
  AUTO_CLOSE_DAYS, MAX_OPEN_THREADS, STUDENT_MESSAGES_PER_DAY, checkMessage,
  type ChatFlag, type ChatSender, type ChatStatus,
} from './rules'

export class ChatError extends Error {
  constructor(message: string, public status: number = 400) { super(message) }
}

type Queryable = Pick<Pool, 'query'>
export type ChatDb = Pick<Pool, 'query' | 'connect'>

export type ThreadSummary = {
  id: number; subject: string; title: string; status: ChatStatus; student: string; className: string
  teacher: string | null; lastMessageAt: string; unread: number; needsReview: boolean
}
export type ChatMessage = {
  id: number; sender: ChatSender; senderName: string; body: string | null; at: string
  hidden: boolean; flag: ChatFlag | null; clientMessageId: string
}
export type Cursor = { deliveredId: number; readId: number }
export type ThreadView = {
  thread: ThreadSummary
  messages: ChatMessage[]
  cursors: Record<ChatSender, Cursor>
  canSend: boolean
  closedReason: string | null
}

type Viewer =
  | { role: 'student'; studentId: number; schoolId: number }
  | { role: 'teacher'; teacherId: number; schoolId: number }
  | { role: 'parent'; parentId: number; studentId: number; schoolId: number }
  | { role: 'school'; userId: number; schoolId: number }
export type ChatViewer = Viewer
export type ChatParticipant = Extract<Viewer, { role: 'student' | 'teacher' }>

/** The teacher who answers a subject in a class today: the subject teacher, else the class teacher. */
const ROUTED_TEACHER = (classId: string, subject: string) => `COALESCE(
  (SELECT cs.teacher_id FROM class_subjects cs JOIN teachers x ON x.id = cs.teacher_id AND x.status = 'active' AND x.removed_at IS NULL
    WHERE cs.class_id = ${classId} AND LOWER(cs.subject_name) = LOWER(${subject}) ORDER BY cs.id LIMIT 1),
  (SELECT y.id FROM classes c2 JOIN teachers y ON y.id = c2.class_teacher_id AND y.status = 'active' AND y.removed_at IS NULL
    WHERE c2.id = ${classId}))`

/** The class a student is in today, or null. */
const CURRENT_CLASS = (studentId: string) => `(SELECT c3.id FROM students s3
  JOIN classes c3 ON c3.school_id = s3.school_id AND c3.grade = s3.grade AND c3.section = s3.section AND c3.deleted_at IS NULL
  WHERE s3.id = ${studentId} AND s3.status = 'active' LIMIT 1)`

async function tx<T>(db: ChatDb, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Answered threads nobody came back to are closed. Run before anything that depends on a thread's status. */
async function closeStale(db: Queryable, schoolId: number, now: Date) {
  await db.query(
    `UPDATE chat_threads SET status = 'closed' WHERE school_id = $1 AND status = 'answered' AND answered_at < $2::timestamptz - make_interval(days => $3)`,
    [schoolId, now, AUTO_CLOSE_DAYS])
}

// ── Availability ─────────────────────────────────────────────────────────────
export type StudentSetup = { available: boolean; reason: string | null; subjects: { name: string; teacher: string }[]; classId: number | null }

/** Whether this student can write today, and which subjects have a teacher to ask. */
export async function studentSetup(db: Queryable, studentId: number, schoolId: number): Promise<StudentSetup> {
  const off = (reason: string, classId: number | null = null): StudentSetup => ({ available: false, reason, subjects: [], classId })
  const { rows: [me] } = await db.query<{ class_id: number | null; enabled: boolean; has_parent: boolean }>(`
    SELECT cur.id AS class_id,
           EXISTS (SELECT 1 FROM chat_classes cc WHERE cc.class_id = cur.id) AS enabled,
           EXISTS (SELECT 1 FROM student_parents sp JOIN parents p ON p.id = sp.parent_id AND p.school_id = s.school_id WHERE sp.student_id = s.id) AS has_parent
    FROM students s LEFT JOIN LATERAL (SELECT ${CURRENT_CLASS('s.id')} AS id) cur ON TRUE
    WHERE s.id = $1 AND s.school_id = $2
  `, [studentId, schoolId])
  if (!me?.class_id) return off('You are not in a class yet.')
  if (!me.enabled) return off('Your school hasn’t opened teacher chat for your class.', me.class_id)
  if (!me.has_parent) return off('Teacher chat opens once a parent account is linked to you. Ask your school office.', me.class_id)
  const { rows } = await db.query<{ name: string; teacher: string }>(`
    SELECT q.name, t.name AS teacher
    FROM (SELECT DISTINCT ON (LOWER(subject_name)) subject_name AS name FROM class_subjects WHERE class_id = $1 ORDER BY LOWER(subject_name), id) q
    JOIN teachers t ON t.id = ${ROUTED_TEACHER('$1', 'q.name')}
    ORDER BY q.name
  `, [me.class_id])
  if (!rows.length) return off('No teachers are set up for your class yet.', me.class_id)
  return { available: true, reason: null, subjects: rows, classId: me.class_id }
}

// ── Reading ──────────────────────────────────────────────────────────────────
function scope(viewer: Viewer): { where: string; args: number[] } {
  const args = [viewer.schoolId]
  if (viewer.role === 'school') return { where: 't.school_id = $1', args }
  if (viewer.role === 'teacher') return { where: `t.school_id = $1 AND ${ROUTED_TEACHER('t.class_id', 't.subject_name')} = $2`, args: [...args, viewer.teacherId] }
  if (viewer.role === 'student') return { where: 't.school_id = $1 AND t.student_id = $2', args: [...args, viewer.studentId] }
  return {
    where: 't.school_id = $1 AND t.student_id = $2 AND EXISTS (SELECT 1 FROM student_parents sp WHERE sp.parent_id = $3 AND sp.student_id = t.student_id)',
    args: [...args, viewer.studentId, viewer.parentId],
  }
}

type ThreadRow = {
  id: number; subject_name: string; title: string; status: ChatStatus; needs_review: boolean; last_message_at: Date
  student: string; grade: string; section: string; teacher: string | null; unread: number; in_class: boolean
}

async function threadRows(db: Queryable, viewer: Viewer, threadId: number | null): Promise<ThreadRow[]> {
  const { where, args } = scope(viewer)
  const extra: unknown[] = []
  // Unread counts only mean something to the two people chatting.
  const unread = viewer.role === 'student' || viewer.role === 'teacher'
    ? `(SELECT COUNT(*)::int FROM chat_messages m WHERE m.thread_id = t.id AND m.sender_type <> '${viewer.role}'
        AND m.id > COALESCE((SELECT read_id FROM chat_cursors cu WHERE cu.thread_id = t.id AND cu.actor_type = '${viewer.role}'), 0))`
    : '0'
  let filter = ''
  if (threadId !== null) { extra.push(threadId); filter = `AND t.id = $${args.length + 1}` }
  const { rows } = await db.query<ThreadRow>(`
    SELECT t.id, t.subject_name, t.title, t.status, t.needs_review, t.last_message_at, s.name AS student, c.grade, c.section,
           tr.name AS teacher, ${unread} AS unread, (t.class_id = ${CURRENT_CLASS('t.student_id')}) AS in_class
    FROM chat_threads t
    JOIN students s ON s.id = t.student_id
    JOIN classes c ON c.id = t.class_id
    LEFT JOIN teachers tr ON tr.id = ${ROUTED_TEACHER('t.class_id', 't.subject_name')}
    WHERE ${where} ${filter}
    ORDER BY t.status = 'closed', t.last_message_at DESC, t.id DESC
    LIMIT 200
  `, [...args, ...extra])
  return rows
}

const summary = (r: ThreadRow, viewer: Viewer): ThreadSummary => ({
  id: r.id, subject: r.subject_name, title: r.title, status: r.status, student: r.student, className: `${r.grade}-${r.section}`,
  teacher: r.teacher, lastMessageAt: r.last_message_at.toISOString(), unread: r.unread,
  // Only the school sees which chats are marked for review.
  needsReview: viewer.role === 'school' && r.needs_review,
})

/** Marks everything the other side has sent as received by this participant's app. */
async function markDelivered(db: Queryable, role: ChatSender, threadIds: number[]) {
  if (!threadIds.length) return
  await db.query(`
    INSERT INTO chat_cursors (thread_id, actor_type, delivered_id)
    SELECT thread_id, $1::varchar, MAX(id) FROM chat_messages WHERE thread_id = ANY($2::int[]) AND sender_type <> $1::varchar GROUP BY thread_id
    ON CONFLICT (thread_id, actor_type) DO UPDATE SET delivered_id = EXCLUDED.delivered_id, updated_at = NOW()
      WHERE chat_cursors.delivered_id < EXCLUDED.delivered_id
  `, [role, threadIds])
}

export async function listThreads(db: Queryable, viewer: Viewer, now: Date = new Date()): Promise<ThreadSummary[]> {
  await closeStale(db, viewer.schoolId, now)
  const rows = await threadRows(db, viewer, null)
  if (viewer.role === 'student' || viewer.role === 'teacher') await markDelivered(db, viewer.role, rows.filter(r => r.unread > 0).map(r => r.id))
  return rows.map(r => summary(r, viewer))
}

async function ownThread(db: Queryable, viewer: Viewer, threadId: number): Promise<ThreadRow> {
  const [row] = await threadRows(db, viewer, threadId)
  // The same answer whether the thread does not exist or belongs to someone else.
  if (!row) throw new ChatError('Chat not found', 404)
  return row
}

export async function viewThread(db: Queryable, viewer: Viewer, threadId: number, now: Date = new Date()): Promise<ThreadView> {
  await closeStale(db, viewer.schoolId, now)
  const row = await ownThread(db, viewer, threadId)
  if (viewer.role === 'school') {
    await db.query(`INSERT INTO chat_access_log (school_id, thread_id, user_id, created_at) VALUES ($1, $2, $3, $4)`, [viewer.schoolId, threadId, viewer.userId, now])
    await db.query(`UPDATE notifications SET is_read = TRUE WHERE recipient_school_id = $1 AND type IN ('chat_safety', 'chat_report') AND is_read = FALSE AND data->>'thread_id' = $2::text`,
      [viewer.schoolId, threadId])
  }
  if (viewer.role === 'student' || viewer.role === 'teacher') await markDelivered(db, viewer.role, [threadId])
  const { rows: messages } = await db.query<{
    id: number; sender_type: ChatSender; sender_name: string; body: string; created_at: Date; hidden_at: Date | null; flag: ChatFlag | null; client_message_id: string
  }>(`SELECT id, sender_type, sender_name, body, created_at, hidden_at, flag, client_message_id FROM chat_messages WHERE thread_id = $1 ORDER BY id`, [threadId])
  const { rows: cursorRows } = await db.query<{ actor_type: ChatSender; delivered_id: number; read_id: number }>(
    `SELECT actor_type, delivered_id, read_id FROM chat_cursors WHERE thread_id = $1`, [threadId])
  const cursor = (role: ChatSender): Cursor => {
    const c = cursorRows.find(x => x.actor_type === role)
    return { deliveredId: c?.delivered_id ?? 0, readId: c?.read_id ?? 0 }
  }
  // Parents and the school see a hidden message's words (it is part of the record); the two chatting do not.
  const seesHidden = viewer.role === 'parent' || viewer.role === 'school'
  let closedReason: string | null = null
  if (row.status === 'closed') closedReason = 'This chat is closed. Start a new one to ask again.'
  else if (!row.in_class) closedReason = 'This chat belongs to an earlier class and is now read only.'
  else if (viewer.role === 'student') {
    const setup = await studentSetup(db, viewer.studentId, viewer.schoolId)
    if (!setup.available) closedReason = setup.reason
    else if (!row.teacher) closedReason = 'No teacher is set for this subject right now.'
  } else if (viewer.role === 'teacher') {
    const { rows: [on] } = await db.query(`SELECT 1 FROM chat_classes cc JOIN chat_threads t ON t.class_id = cc.class_id WHERE t.id = $1`, [threadId])
    if (!on) closedReason = 'The school has switched chat off for this class.'
  }
  return {
    thread: summary(row, viewer),
    messages: messages.map(m => ({
      id: m.id, sender: m.sender_type, senderName: m.sender_name, body: m.hidden_at && !seesHidden ? null : m.body,
      at: m.created_at.toISOString(), hidden: m.hidden_at !== null,
      // The wording flag is for the school. The student is shown the helpline text when they send it.
      flag: viewer.role === 'school' ? m.flag : null, clientMessageId: m.client_message_id,
    })),
    cursors: { student: cursor('student'), teacher: cursor('teacher') },
    canSend: (viewer.role === 'student' || viewer.role === 'teacher') && closedReason === null,
    closedReason: viewer.role === 'student' || viewer.role === 'teacher' ? closedReason : null,
  }
}

/** The participant has the thread on screen up to this message. */
export async function markRead(db: Queryable, viewer: ChatParticipant, threadId: number, upTo: number): Promise<void> {
  await ownThread(db, viewer, threadId)
  await db.query(`
    INSERT INTO chat_cursors (thread_id, actor_type, delivered_id, read_id)
    SELECT $1::int, $2::varchar, m.id, m.id FROM (SELECT MAX(id) AS id FROM chat_messages WHERE thread_id = $1 AND id <= $3 AND sender_type <> $2::varchar) m
    WHERE m.id IS NOT NULL
    ON CONFLICT (thread_id, actor_type) DO UPDATE SET
      delivered_id = GREATEST(chat_cursors.delivered_id, EXCLUDED.delivered_id),
      read_id = GREATEST(chat_cursors.read_id, EXCLUDED.read_id), updated_at = NOW()
  `, [threadId, viewer.role, upTo])
  // Reading the chat clears its bell entry, so the next message rings again.
  const column = viewer.role === 'student' ? 'recipient_student_id' : 'recipient_teacher_id'
  await db.query(`UPDATE notifications SET is_read = TRUE WHERE ${column} = $1 AND type IN ('chat_new_message', 'chat_reply') AND is_read = FALSE AND data->>'thread_id' = $2::text`,
    [senderId(viewer), threadId])
}

// ── Writing ──────────────────────────────────────────────────────────────────
async function senderName(db: Queryable, viewer: ChatParticipant): Promise<string> {
  const { rows: [r] } = viewer.role === 'student'
    ? await db.query<{ name: string }>(`SELECT name FROM students WHERE id = $1`, [viewer.studentId])
    : await db.query<{ name: string }>(`SELECT name FROM teachers WHERE id = $1`, [viewer.teacherId])
  return r?.name ?? (viewer.role === 'student' ? 'Student' : 'Teacher')
}

const senderId = (viewer: ChatParticipant) => viewer.role === 'student' ? viewer.studentId : viewer.teacherId

/** One bell entry per thread until it is read, never containing the message text. */
async function notifyOnce(db: Queryable, column: 'recipient_student_id' | 'recipient_teacher_id' | 'recipient_school_id', recipientId: number, schoolId: number, type: string, title: string, message: string, threadId: number) {
  await db.query(`
    INSERT INTO notifications (school_id, ${column}, type, title, message, data)
    SELECT $1::int, $2::int, $3::varchar, $4::varchar, $5::text, jsonb_build_object('thread_id', $6::int)
    WHERE NOT EXISTS (SELECT 1 FROM notifications n WHERE n.${column} = $2 AND n.type = $3 AND n.is_read = FALSE AND n.data->>'thread_id' = $6::text)
  `, [schoolId, recipientId, type, title, message, threadId])
}

async function afterMessage(db: Queryable, viewer: ChatParticipant, threadId: number, flag: ChatFlag | null) {
  const { rows: [t] } = await db.query<{ student_id: number; teacher_id: number | null }>(
    `SELECT student_id, ${ROUTED_TEACHER('t.class_id', 't.subject_name')} AS teacher_id FROM chat_threads t WHERE id = $1`, [threadId])
  if (viewer.role === 'student' && t.teacher_id) {
    await notifyOnce(db, 'recipient_teacher_id', t.teacher_id, viewer.schoolId, 'chat_new_message', '💬 A student sent you a message', 'Open Teacher Chat to read it.', threadId)
  }
  if (viewer.role === 'teacher') {
    await notifyOnce(db, 'recipient_student_id', t.student_id, viewer.schoolId, 'chat_reply', '💬 Your teacher replied', 'Open Teacher Chat to read it.', threadId)
  }
  if (flag === 'support') {
    await notifyOnce(db, 'recipient_school_id', viewer.schoolId, viewer.schoolId, 'chat_safety', '⚠️ A chat needs attention now', 'A message suggests someone may need support. Open Teacher Chat review.', threadId)
  }
}

function checked(body: string): ChatFlag | null {
  const result = checkMessage(body)
  if (!result.ok) throw new ChatError(result.reason, 422)
  return result.flag
}

/** Serialises one student's writes, so the daily and open-chat limits hold when requests arrive together. */
const lockStudent = (client: PoolClient, studentId: number) => client.query('SELECT 1 FROM students WHERE id = $1 FOR NO KEY UPDATE', [studentId])

async function underDailyLimit(client: PoolClient, studentId: number, now: Date) {
  const { rows: [r] } = await client.query<{ n: number }>(`
    SELECT COUNT(*)::int AS n FROM chat_messages
    WHERE sender_type = 'student' AND sender_id = $1
      AND created_at >= date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
  `, [studentId, now])
  if (r.n >= STUDENT_MESSAGES_PER_DAY) throw new ChatError(`You can send ${STUDENT_MESSAGES_PER_DAY} messages a day. Try again tomorrow.`, 429)
}

async function insertMessage(client: PoolClient, viewer: ChatParticipant, threadId: number, body: string, clientMessageId: string, flag: ChatFlag | null, now: Date): Promise<number> {
  const { rows: [m] } = await client.query<{ id: number }>(`
    INSERT INTO chat_messages (thread_id, sender_type, sender_id, sender_name, body, client_message_id, flag, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, [threadId, viewer.role, senderId(viewer), await senderName(client, viewer), body, clientMessageId, flag, now])
  await client.query(`
    UPDATE chat_threads SET last_message_at = $2, needs_review = needs_review OR $3,
      status = CASE WHEN $4::boolean THEN 'open' ELSE status END, answered_at = CASE WHEN $4::boolean THEN NULL ELSE answered_at END
    WHERE id = $1
  `, [threadId, now, flag !== null, viewer.role === 'student'])
  return m.id
}

/** A message already saved under this retry id, if any. */
async function alreadySent(db: Queryable, viewer: ChatParticipant, clientMessageId: string) {
  const { rows: [m] } = await db.query<{ id: number; thread_id: number; flag: ChatFlag | null }>(
    `SELECT id, thread_id, flag FROM chat_messages WHERE sender_type = $1 AND sender_id = $2 AND client_message_id = $3`,
    [viewer.role, senderId(viewer), clientMessageId])
  return m ?? null
}

export type Sent = { threadId: number; messageId: number; support: boolean }

export async function startThread(db: ChatDb, viewer: Extract<Viewer, { role: 'student' }>, input: { subject: string; body: string; clientMessageId: string }, now: Date = new Date()): Promise<Sent> {
  await closeStale(db, viewer.schoolId, now)
  const result = await tx(db, async client => {
    await lockStudent(client, viewer.studentId)
    const before = await alreadySent(client, viewer, input.clientMessageId)
    if (before) return { threadId: before.thread_id, messageId: before.id, flag: before.flag, repeat: true }
    const flag = checked(input.body)
    const setup = await studentSetup(client, viewer.studentId, viewer.schoolId)
    if (!setup.available) throw new ChatError(setup.reason!, 403)
    const subject = setup.subjects.find(s => s.name.toLowerCase() === input.subject.toLowerCase())
    if (!subject) throw new ChatError('Choose a subject from the list.', 400)
    const { rows: [open] } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM chat_threads WHERE student_id = $1 AND status = 'open'`, [viewer.studentId])
    if (open.n >= MAX_OPEN_THREADS) throw new ChatError(`You already have ${MAX_OPEN_THREADS} chats waiting. Continue one of them.`, 429)
    await underDailyLimit(client, viewer.studentId, now)
    const title = input.body.replace(/\s+/g, ' ').slice(0, 120)
    const { rows: [t] } = await client.query<{ id: number }>(`
      INSERT INTO chat_threads (school_id, student_id, class_id, subject_name, title, last_message_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id
    `, [viewer.schoolId, viewer.studentId, setup.classId, subject.name, title, now])
    const messageId = await insertMessage(client, viewer, t.id, input.body, input.clientMessageId, flag, now)
    return { threadId: t.id, messageId, flag, repeat: false }
  })
  if (!result.repeat) await afterMessage(db, viewer, result.threadId, result.flag)
  return { threadId: result.threadId, messageId: result.messageId, support: result.flag === 'support' }
}

export async function sendMessage(db: ChatDb, viewer: ChatParticipant, threadId: number, input: { body: string; clientMessageId: string }, now: Date = new Date()): Promise<Sent> {
  await closeStale(db, viewer.schoolId, now)
  const result = await tx(db, async client => {
    if (viewer.role === 'student') await lockStudent(client, viewer.studentId)
    // Holding the thread row keeps message ids in the order they become visible.
    await client.query('SELECT 1 FROM chat_threads WHERE id = $1 FOR UPDATE', [threadId])
    const view = await viewThread(client, viewer, threadId, now)
    const before = await alreadySent(client, viewer, input.clientMessageId)
    if (before) {
      if (before.thread_id !== threadId) throw new ChatError('That message was already sent in another chat.', 409)
      return { messageId: before.id, flag: before.flag, repeat: true }
    }
    if (!view.canSend) throw new ChatError(view.closedReason ?? 'You can’t send in this chat.', 409)
    const flag = checked(input.body)
    if (viewer.role === 'student') await underDailyLimit(client, viewer.studentId, now)
    return { messageId: await insertMessage(client, viewer, threadId, input.body, input.clientMessageId, flag, now), flag, repeat: false }
  })
  if (!result.repeat) await afterMessage(db, viewer, threadId, result.flag)
  return { threadId, messageId: result.messageId, support: result.flag === 'support' }
}

export type StatusAction = 'answered' | 'understood' | 'still_unclear'

/** Teacher: "answered". Student: "understood" (closes) or "still not clear" (back to waiting). */
export async function setStatus(db: Queryable, viewer: ChatParticipant, threadId: number, action: StatusAction, now: Date = new Date()): Promise<{ status: ChatStatus }> {
  await closeStale(db, viewer.schoolId, now)
  await ownThread(db, viewer, threadId)
  if ((action === 'answered') !== (viewer.role === 'teacher')) throw new ChatError('Not allowed', 403)
  const from = action === 'answered' ? 'open' : 'answered'
  const to: ChatStatus = action === 'answered' ? 'answered' : action === 'understood' ? 'closed' : 'open'
  // A teacher can only mark a chat answered once a teacher has actually replied since the student's last message.
  const replied = action === 'answered'
    ? `AND (SELECT sender_type FROM chat_messages WHERE thread_id = $1 ORDER BY id DESC LIMIT 1) = 'teacher'` : ''
  const { rowCount } = await db.query(`
    UPDATE chat_threads SET status = $2::varchar, answered_at = CASE WHEN $2::varchar = 'answered' THEN $4::timestamptz WHEN $2::varchar = 'open' THEN NULL ELSE answered_at END
    WHERE id = $1 AND status = $3 ${replied}
  `, [threadId, to, from, now])
  if (!rowCount) throw new ChatError(action === 'answered' ? 'Reply to the student first.' : 'This chat is not waiting for that.', 409)
  return { status: to }
}

// ── Reports and school review ────────────────────────────────────────────────
export async function reportChat(db: Queryable, viewer: Exclude<Viewer, { role: 'school' }>, threadId: number, input: { messageId: number | null; reason: string }): Promise<{ reported: true }> {
  await ownThread(db, viewer, threadId)
  if (input.messageId !== null) {
    const { rows: [m] } = await db.query(`SELECT 1 FROM chat_messages WHERE id = $1 AND thread_id = $2`, [input.messageId, threadId])
    if (!m) throw new ChatError('Message not found', 404)
  }
  const reporterId = viewer.role === 'student' ? viewer.studentId : viewer.role === 'teacher' ? viewer.teacherId : viewer.parentId
  const { rows: [today] } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM chat_reports WHERE reporter_type = $1 AND reporter_id = $2 AND created_at > NOW() - INTERVAL '1 day'`, [viewer.role, reporterId])
  if (today.n >= 20) throw new ChatError('Please contact the school office directly.', 429)
  await db.query(`INSERT INTO chat_reports (school_id, thread_id, message_id, reporter_type, reporter_id, reason) VALUES ($1, $2, $3, $4, $5, $6)`,
    [viewer.schoolId, threadId, input.messageId, viewer.role, reporterId, input.reason])
  await db.query(`UPDATE chat_threads SET needs_review = TRUE WHERE id = $1`, [threadId])
  await notifyOnce(db, 'recipient_school_id', viewer.schoolId, viewer.schoolId, 'chat_report', '🚩 A chat was reported', 'Open Teacher Chat review.', threadId)
  return { reported: true }
}

export type SchoolOverview = {
  classes: { id: number; name: string; enabled: boolean; students: number; withoutParent: number }[]
  reports: { id: number; threadId: number; messageId: number | null; by: string; reason: string; at: string; student: string }[]
  threads: ThreadSummary[]
}

export async function schoolOverview(db: Queryable, viewer: Extract<Viewer, { role: 'school' }>, now: Date = new Date()): Promise<SchoolOverview> {
  const threads = await listThreads(db, viewer, now)
  const { rows: classes } = await db.query<{ id: number; grade: string; section: string; enabled: boolean; students: number; without_parent: number }>(`
    SELECT c.id, c.grade, c.section, (cc.class_id IS NOT NULL) AS enabled,
           COUNT(s.id)::int AS students,
           COUNT(s.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM student_parents sp JOIN parents p ON p.id = sp.parent_id AND p.school_id = c.school_id WHERE sp.student_id = s.id))::int AS without_parent
    FROM classes c
    LEFT JOIN chat_classes cc ON cc.class_id = c.id
    LEFT JOIN students s ON s.school_id = c.school_id AND s.grade = c.grade AND s.section = c.section AND s.status = 'active'
    WHERE c.school_id = $1 AND c.deleted_at IS NULL
    GROUP BY c.id, c.grade, c.section, cc.class_id
    ORDER BY LENGTH(c.grade), c.grade, c.section
  `, [viewer.schoolId])
  const { rows: reports } = await db.query<{ id: number; thread_id: number; message_id: number | null; reporter_type: string; reason: string; created_at: Date; student: string }>(`
    SELECT r.id, r.thread_id, r.message_id, r.reporter_type, r.reason, r.created_at, s.name AS student
    FROM chat_reports r JOIN chat_threads t ON t.id = r.thread_id JOIN students s ON s.id = t.student_id
    WHERE r.school_id = $1 AND r.resolved_at IS NULL ORDER BY r.created_at
  `, [viewer.schoolId])
  return {
    classes: classes.map(c => ({ id: c.id, name: `${c.grade}-${c.section}`, enabled: c.enabled, students: c.students, withoutParent: c.without_parent })),
    reports: reports.map(r => ({ id: r.id, threadId: r.thread_id, messageId: r.message_id, by: r.reporter_type, reason: r.reason, at: r.created_at.toISOString(), student: r.student })),
    threads,
  }
}

export async function setClassEnabled(db: Queryable, viewer: Extract<Viewer, { role: 'school' }>, classId: number, enabled: boolean) {
  const { rows: [c] } = await db.query(`SELECT 1 FROM classes WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`, [classId, viewer.schoolId])
  if (!c) throw new ChatError('Class not found', 404)
  if (enabled) await db.query(`INSERT INTO chat_classes (class_id, school_id, enabled_by) VALUES ($1, $2, $3) ON CONFLICT (class_id) DO NOTHING`, [classId, viewer.schoolId, viewer.userId])
  else await db.query(`DELETE FROM chat_classes WHERE class_id = $1`, [classId])
  return { classId, enabled }
}

export async function hideMessage(db: Queryable, viewer: Extract<Viewer, { role: 'school' }>, messageId: number, now: Date = new Date()) {
  const { rowCount } = await db.query(`
    UPDATE chat_messages m SET hidden_at = $3, hidden_by = $4
    FROM chat_threads t WHERE m.id = $1 AND t.id = m.thread_id AND t.school_id = $2 AND m.hidden_at IS NULL
  `, [messageId, viewer.schoolId, now, viewer.userId])
  if (!rowCount) throw new ChatError('Message not found or already hidden', 404)
  return { hidden: true }
}

/** Closes a report. The thread leaves the review list once nothing on it is open. */
export async function resolveReport(db: Queryable, viewer: Extract<Viewer, { role: 'school' }>, reportId: number, resolution: string, now: Date = new Date()) {
  const { rows: [r] } = await db.query<{ thread_id: number }>(`
    UPDATE chat_reports SET resolution = $3, resolved_by = $4, resolved_at = $5
    WHERE id = $1 AND school_id = $2 AND resolved_at IS NULL RETURNING thread_id
  `, [reportId, viewer.schoolId, resolution, viewer.userId, now])
  if (!r) throw new ChatError('Report not found', 404)
  await db.query(`UPDATE chat_threads SET needs_review = EXISTS (SELECT 1 FROM chat_reports WHERE thread_id = $1 AND resolved_at IS NULL) WHERE id = $1`, [r.thread_id])
  return { resolved: true }
}

/** A flagged chat with no report: the reviewer says they have looked at it. */
export async function markReviewed(db: Queryable, viewer: Extract<Viewer, { role: 'school' }>, threadId: number) {
  await ownThread(db, viewer, threadId)
  const { rowCount } = await db.query(
    `UPDATE chat_threads SET needs_review = FALSE WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM chat_reports WHERE thread_id = $1 AND resolved_at IS NULL)`, [threadId])
  if (!rowCount) throw new ChatError('Resolve the open report first.', 409)
  return { reviewed: true }
}
