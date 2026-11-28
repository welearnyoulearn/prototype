// Needs a throwaway LOCAL Postgres:
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55558/wlyl_chat_unit npx tsx --test lib/teacherChat/*.test.ts
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { ensureTeacherChatSchema } from './schema'
import {
  ChatError, hideMessage, listThreads, markRead, markReviewed, reportChat, resolveReport, schoolOverview, sendMessage,
  setClassEnabled, setStatus, startThread, studentSetup, viewThread,
} from './service'
import { MAX_OPEN_THREADS, STUDENT_MESSAGES_PER_DAY } from './rules'

const url = process.env.TEST_DATABASE_URL
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('TEST_DATABASE_URL must be a local database')
const opts = { skip: url ? false : 'set TEST_DATABASE_URL to a throwaway local Postgres' }

let pool: Pool
const insert = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: number }>(`${sql} RETURNING id`, args)).rows[0].id
const rejects = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: unknown) => e instanceof ChatError && e.status === status)

/** A school with one class (chat on), a maths teacher, a class teacher, a student and their parent. */
async function school() {
  const schoolId = await insert(`INSERT INTO schools (name) VALUES ('Test school')`)
  const mathsId = await insert(`INSERT INTO teachers (school_id, name) VALUES ($1, 'Maths Teacher')`, [schoolId])
  const classTeacherId = await insert(`INSERT INTO teachers (school_id, name) VALUES ($1, 'Class Teacher')`, [schoolId])
  const classId = await insert(`INSERT INTO classes (school_id, grade, section, class_teacher_id) VALUES ($1, '9', 'A', $2)`, [schoolId, classTeacherId])
  await insert(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Maths', $2)`, [classId, mathsId])
  await insert(`INSERT INTO class_subjects (class_id, subject_name) VALUES ($1, 'Science')`, [classId])
  const child = async () => {
    const studentId = await insert(`INSERT INTO students (school_id, name, grade, section) VALUES ($1, 'Child', '9', 'A')`, [schoolId])
    const parentId = await insert(`INSERT INTO parents (school_id, name) VALUES ($1, 'Parent')`, [schoolId])
    await insert(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [studentId, parentId])
    return {
      student: { role: 'student' as const, studentId, schoolId },
      parent: { role: 'parent' as const, parentId, studentId, schoolId },
    }
  }
  const office = { role: 'school' as const, userId: 1, schoolId }
  await setClassEnabled(pool, office, classId, true)
  return {
    schoolId, classId, office, child,
    maths: { role: 'teacher' as const, teacherId: mathsId, schoolId },
    classTeacher: { role: 'teacher' as const, teacherId: classTeacherId, schoolId },
    ...(await child()),
  }
}

const msg = (body: string, clientMessageId: string = randomUUID()) => ({ body, clientMessageId })
const ask = (s: Awaited<ReturnType<typeof school>>, body = 'How do I factorise this?', subject = 'Maths') =>
  startThread(pool, s.student, { subject, ...msg(body) })

before(async () => {
  if (!url) return
  pool = new Pool({ connectionString: url, max: 6 })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255));
    CREATE TABLE IF NOT EXISTS teachers (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255), status VARCHAR(20) DEFAULT 'active', removed_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS students (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255), grade VARCHAR(20), section VARCHAR(10), status VARCHAR(20) DEFAULT 'active');
    CREATE TABLE IF NOT EXISTS classes (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, grade VARCHAR(20), section VARCHAR(10), class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS class_subjects (id SERIAL PRIMARY KEY, class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE, subject_name VARCHAR(100), teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS parents (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255));
    CREATE TABLE IF NOT EXISTS student_parents (id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id) ON DELETE CASCADE, parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS plan_features (feature_key VARCHAR(50), tier VARCHAR(20), enabled BOOLEAN, UNIQUE(feature_key, tier));
    CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, school_id INTEGER, recipient_student_id INTEGER, recipient_teacher_id INTEGER, recipient_school_id INTEGER, recipient_parent_id INTEGER, push_sent_at TIMESTAMPTZ, type VARCHAR(50), title VARCHAR(200), message TEXT, data JSONB, is_read BOOLEAN DEFAULT FALSE);
  `)
  await ensureTeacherChatSchema(pool)
  await ensureTeacherChatSchema(pool) // safe to run twice
})
after(async () => { await pool?.end() })

test('the feature is seeded off for every plan', opts, async () => {
  const { rows } = await pool.query(`SELECT enabled FROM plan_features WHERE feature_key = 'teacher-chat'`)
  assert.deepEqual(rows.map(r => r.enabled), [false, false, false])
})

test('a doubt goes to the subject teacher, else the class teacher', opts, async () => {
  const s = await school()
  const setup = await studentSetup(pool, s.student.studentId, s.schoolId)
  assert.deepEqual(setup.subjects, [{ name: 'Maths', teacher: 'Maths Teacher' }, { name: 'Science', teacher: 'Class Teacher' }])
  const maths = await ask(s)
  const science = await ask(s, 'Why is the sky blue?', 'science')
  assert.deepEqual((await listThreads(pool, s.maths)).map(t => t.id), [maths.threadId])
  assert.deepEqual((await listThreads(pool, s.classTeacher)).map(t => t.id), [science.threadId])
})

test('no chat when the class is off or the student has no linked parent', opts, async () => {
  const s = await school()
  const { threadId } = await ask(s)
  await setClassEnabled(pool, s.office, s.classId, false)
  await rejects(ask(s), 403)
  await rejects(sendMessage(pool, s.student, threadId, msg('hello')), 409)
  await rejects(sendMessage(pool, s.maths, threadId, msg('hello')), 409)
  assert.equal((await viewThread(pool, s.parent, threadId)).messages.length, 1, 'history stays visible')
  await setClassEnabled(pool, s.office, s.classId, true)
  await pool.query(`DELETE FROM student_parents WHERE student_id = $1`, [s.student.studentId])
  await rejects(ask(s), 403)
  await rejects(sendMessage(pool, s.student, threadId, msg('hello')), 409)
})

test('nobody else can read or write a chat', opts, async () => {
  const s = await school()
  const other = await school()
  const classmate = await s.child()
  const { threadId } = await ask(s)
  for (const outsider of [classmate.student, other.student, other.maths, s.classTeacher, classmate.parent, other.parent, other.office]) {
    await rejects(viewThread(pool, outsider, threadId), 404)
  }
  for (const outsider of [classmate.student, other.maths, s.classTeacher]) {
    await rejects(sendMessage(pool, outsider, threadId, msg('let me in')), 404)
    await rejects(markRead(pool, outsider, threadId, 999999), 404)
  }
  // A parent naming another family's child still sees nothing.
  await rejects(viewThread(pool, { ...classmate.parent, studentId: s.student.studentId }, threadId), 404)
  await rejects(reportChat(pool, classmate.parent, threadId, { messageId: null, reason: 'not mine' }), 404)
})

test('ticks move saved → delivered → read, and a parent reading changes nothing', opts, async () => {
  const s = await school()
  const { threadId, messageId } = await ask(s)
  const cursors = async () => (await viewThread(pool, s.parent, threadId)).cursors
  await viewThread(pool, s.parent, threadId)
  await viewThread(pool, s.office, threadId)
  assert.deepEqual(await cursors(), { student: { deliveredId: 0, readId: 0 }, teacher: { deliveredId: 0, readId: 0 } })
  const [listed] = await listThreads(pool, s.maths)
  assert.equal(listed.unread, 1)
  assert.deepEqual((await cursors()).teacher, { deliveredId: messageId, readId: 0 })
  await markRead(pool, s.maths, threadId, messageId)
  assert.deepEqual((await cursors()).teacher, { deliveredId: messageId, readId: messageId })
  await markRead(pool, s.maths, threadId, 0)
  assert.deepEqual((await cursors()).teacher, { deliveredId: messageId, readId: messageId }, 'never backwards')
  assert.equal((await listThreads(pool, s.maths))[0].unread, 0)
})

test('one bell entry per chat until it is read, then the next message rings again', opts, async () => {
  const s = await school()
  const { threadId } = await ask(s)
  const bell = async () => (await pool.query(`SELECT COUNT(*) FILTER (WHERE NOT is_read)::int AS unread, COUNT(*)::int AS total FROM notifications WHERE recipient_teacher_id = $1`, [s.maths.teacherId])).rows[0]
  await sendMessage(pool, s.student, threadId, msg('and also this'))
  assert.deepEqual(await bell(), { unread: 1, total: 1 })
  await markRead(pool, s.maths, threadId, 2147483647)
  assert.deepEqual(await bell(), { unread: 0, total: 1 })
  await sendMessage(pool, s.student, threadId, msg('one more'))
  assert.deepEqual(await bell(), { unread: 1, total: 2 })
})

test('a retried message is saved once, even when sent together', opts, async () => {
  const s = await school()
  const first = msg('Can you explain step two?')
  const [a, b] = await Promise.all([1, 2].map(() => startThread(pool, s.student, { subject: 'Maths', ...first })))
  assert.equal(a.threadId, b.threadId)
  const reply = msg('Sure.')
  const [c, d] = await Promise.all([1, 2].map(() => sendMessage(pool, s.maths, a.threadId, reply)))
  assert.equal(c.messageId, d.messageId)
  assert.equal((await viewThread(pool, s.student, a.threadId)).messages.length, 2)
})

test('limits on open chats and messages a day', opts, async () => {
  const s = await school()
  const results = await Promise.allSettled(Array.from({ length: MAX_OPEN_THREADS + 2 }, () => ask(s)))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, MAX_OPEN_THREADS)
  const [{ id }] = await listThreads(pool, s.student)
  for (let i = MAX_OPEN_THREADS; i < STUDENT_MESSAGES_PER_DAY; i++) await sendMessage(pool, s.student, id, msg(`part ${i}`))
  await rejects(sendMessage(pool, s.student, id, msg('one too many')), 429)
  await sendMessage(pool, s.maths, id, msg('teachers are not limited'))
  await sendMessage(pool, s.student, id, msg('next day'), new Date(Date.now() + 36 * 3600_000))
})

test('contact details and links are refused from both sides', opts, async () => {
  const s = await school()
  await rejects(ask(s, 'call me on 98765 43210'), 422)
  await rejects(ask(s, 'see www.example.com'), 422)
  const { threadId } = await ask(s)
  await rejects(sendMessage(pool, s.maths, threadId, msg('mail me at a@b.com')), 422)
  assert.equal((await viewThread(pool, s.student, threadId)).messages.length, 1)
})

test('self-harm wording is delivered, flagged and alerts the school, not the teacher or parent view', opts, async () => {
  const s = await school()
  const sent = await ask(s, 'I want to die')
  assert.equal(sent.support, true)
  const { rows } = await pool.query(`SELECT message FROM notifications WHERE recipient_school_id = $1 AND type = 'chat_safety'`, [s.schoolId])
  assert.equal(rows.length, 1)
  assert.ok(!rows[0].message.includes('want to die'))
  assert.equal((await viewThread(pool, s.office, sent.threadId)).messages[0].flag, 'support')
  for (const viewer of [s.maths, s.parent]) {
    const view = await viewThread(pool, viewer, sent.threadId)
    assert.equal(view.messages[0].flag, null)
    assert.equal(view.thread.needsReview, false)
  }
  await markReviewed(pool, s.office, sent.threadId)
  assert.equal((await listThreads(pool, s.office))[0].needsReview, false)
})

test('answered, understood, still not clear, and closing after a week', opts, async () => {
  const s = await school()
  const { threadId } = await ask(s)
  await rejects(setStatus(pool, s.maths, threadId, 'answered'), 409) // no reply yet
  await rejects(setStatus(pool, s.student, threadId, 'answered'), 403)
  await sendMessage(pool, s.maths, threadId, msg('Take out the common factor.'))
  await setStatus(pool, s.maths, threadId, 'answered')
  await rejects(setStatus(pool, s.maths, threadId, 'understood'), 403)
  assert.equal((await setStatus(pool, s.student, threadId, 'still_unclear')).status, 'open')
  await sendMessage(pool, s.maths, threadId, msg('Here is another way.'))
  await setStatus(pool, s.maths, threadId, 'answered')
  await sendMessage(pool, s.student, threadId, msg('One more thing'))
  assert.equal((await viewThread(pool, s.student, threadId)).thread.status, 'open', 'a new question reopens it')
  await sendMessage(pool, s.maths, threadId, msg('Yes.'))
  await setStatus(pool, s.maths, threadId, 'answered')
  const nextWeek = new Date(Date.now() + 8 * 24 * 3600_000)
  assert.equal((await viewThread(pool, s.student, threadId, nextWeek)).thread.status, 'closed')
  await rejects(sendMessage(pool, s.student, threadId, msg('late'), nextWeek), 409)
})

test('a moved student keeps history but cannot write; a new subject teacher takes over', opts, async () => {
  const s = await school()
  const { threadId } = await ask(s)
  await pool.query(`UPDATE class_subjects SET teacher_id = $2 WHERE class_id = $1 AND subject_name = 'Maths'`, [s.classId, s.classTeacher.teacherId])
  await rejects(viewThread(pool, s.maths, threadId), 404)
  assert.equal((await viewThread(pool, s.classTeacher, threadId)).canSend, true)
  await pool.query(`UPDATE students SET grade = '10' WHERE id = $1`, [s.student.studentId])
  assert.equal((await viewThread(pool, s.student, threadId)).canSend, false)
  await rejects(sendMessage(pool, s.classTeacher, threadId, msg('hello')), 409)
})

test('reports, hiding and the access log', opts, async () => {
  const s = await school()
  const { threadId } = await ask(s)
  const reply = await sendMessage(pool, s.maths, threadId, msg('A reply the parent dislikes'))
  await reportChat(pool, s.parent, threadId, { messageId: reply.messageId, reason: 'Please check this' })
  await rejects(markReviewed(pool, s.office, threadId), 409)
  const overview = await schoolOverview(pool, s.office)
  assert.equal(overview.reports.length, 1)
  assert.equal(overview.reports[0].by, 'parent')
  assert.equal(overview.threads[0].needsReview, true)
  const other = await school()
  await rejects(hideMessage(pool, other.office, reply.messageId), 404)
  await rejects(resolveReport(pool, other.office, overview.reports[0].id, 'x'), 404)
  await hideMessage(pool, s.office, reply.messageId)
  for (const viewer of [s.student, s.maths]) assert.equal((await viewThread(pool, viewer, threadId)).messages[1].body, null)
  for (const viewer of [s.parent, s.office]) assert.equal((await viewThread(pool, viewer, threadId)).messages[1].body, 'A reply the parent dislikes')
  await resolveReport(pool, s.office, overview.reports[0].id, 'Hidden and spoken to the teacher')
  assert.equal((await schoolOverview(pool, s.office)).reports.length, 0)
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM chat_access_log WHERE thread_id = $1`, [threadId])
  assert.equal(rows[0].n, 1, 'each school open is logged')
})
