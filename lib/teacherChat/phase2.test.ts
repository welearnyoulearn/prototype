// Needs a throwaway LOCAL Postgres (its own database, so it can run beside service.test.ts):
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55558/wlyl_chat_p2 npx tsx --test lib/teacherChat/phase2.test.ts
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { ensureTeacherChatSchema } from './schema'
import { ChatError, markRead, schoolOverview, sendMessage, setClassEnabled, setStatus, startThread, viewThread } from './service'
import { addSavedReply, chatHours, deleteSavedReply, setChatHours, setHideOnline, setParentAlerts, teacherSettings, MAX_SAVED_REPLIES } from './extras'
import { escalateOverdue, parentDailySummary, type DailyDeps } from './daily'
import { DEFAULT_HOURS, clock, withinHours } from './hours'

const url = process.env.TEST_DATABASE_URL
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('TEST_DATABASE_URL must be a local database')
const opts = { skip: url ? false : 'set TEST_DATABASE_URL to a throwaway local Postgres' }

/** A time in India on Monday 7 Dec 2026, or a later day of that week. */
const ist = (time: string, day = 7) => new Date(`2026-12-${String(day).padStart(2, '0')}T${time}:00+05:30`)

test('chat hours are India time and exclude Sunday', () => {
  assert.equal(withinHours(DEFAULT_HOURS, ist('07:59')), false)
  assert.equal(withinHours(DEFAULT_HOURS, ist('08:00')), true)
  assert.equal(withinHours(DEFAULT_HOURS, ist('17:59')), true)
  assert.equal(withinHours(DEFAULT_HOURS, ist('18:00')), false)
  assert.equal(withinHours(DEFAULT_HOURS, ist('10:00', 6)), false)
  assert.equal(clock('00:05'), '12:05 am')
  assert.equal(clock('13:30'), '1:30 pm')
})

let pool: Pool
const insert = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: number }>(`${sql} RETURNING id`, args)).rows[0].id
const rejects = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: unknown) => e instanceof ChatError && e.status === status)
const msg = (body: string) => ({ body, clientMessageId: randomUUID() })

async function school() {
  const schoolId = await insert(`INSERT INTO schools (name) VALUES ('Test school')`)
  const mathsId = await insert(`INSERT INTO teachers (school_id, name) VALUES ($1, 'Maths Teacher')`, [schoolId])
  const classTeacherId = await insert(`INSERT INTO teachers (school_id, name) VALUES ($1, 'Class Teacher')`, [schoolId])
  const classId = await insert(`INSERT INTO classes (school_id, grade, section, class_teacher_id) VALUES ($1, '9', 'A', $2)`, [schoolId, classTeacherId])
  await insert(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Maths', $2)`, [classId, mathsId])
  const child = async () => {
    const studentId = await insert(`INSERT INTO students (school_id, name, grade, section) VALUES ($1, 'Child', '9', 'A')`, [schoolId])
    const parentId = await insert(`INSERT INTO parents (school_id, name) VALUES ($1, 'Parent')`, [schoolId])
    await insert(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [studentId, parentId])
    return { student: { role: 'student' as const, studentId, schoolId }, parent: { role: 'parent' as const, parentId, studentId, schoolId } }
  }
  const office = { role: 'school' as const, userId: 1, schoolId }
  await setClassEnabled(pool, office, classId, true)
  return {
    schoolId, classId, office, child, classTeacherId,
    maths: { role: 'teacher' as const, teacherId: mathsId, schoolId },
    ...(await child()),
  }
}
type School = Awaited<ReturnType<typeof school>>
const ask = (s: School, at: Date, student = s.student) => startThread(pool, student, { subject: 'Maths', ...msg('Please explain') }, at)
const notes = async (schoolId: number, type: string) => (await pool.query<{ recipient_teacher_id: number | null; recipient_parent_id: number | null; recipient_school_id: number | null; pushed: boolean; message: string }>(
  `SELECT recipient_teacher_id, recipient_parent_id, recipient_school_id, push_sent_at IS NOT NULL AS pushed, message FROM notifications WHERE school_id = $1 AND type = $2 ORDER BY id`, [schoolId, type])).rows
const deps = (off: string[] = [], on = true): DailyDeps => ({ featureOn: async () => on, daysOff: async () => new Set(off) })

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
  await ensureTeacherChatSchema(pool)
  // The daily jobs look across schools, so start each run clean.
  await pool.query(`TRUNCATE schools, notifications RESTART IDENTITY CASCADE`)
})
after(async () => { await pool?.end() })

test('school hours can be changed, and must be in order', opts, async () => {
  const s = await school()
  assert.deepEqual(await chatHours(pool, s.schoolId), DEFAULT_HOURS)
  await rejects(setChatHours(pool, s.schoolId, 1, { opens: '18:00', closes: '09:00' }), 400)
  await setChatHours(pool, s.schoolId, 1, { opens: '09:00', closes: '16:30' })
  assert.deepEqual(await chatHours(pool, s.schoolId), { opens: '09:00', closes: '16:30' })
})

test('online shows only during chat hours, and a teacher can hide it', opts, async () => {
  const s = await school()
  const at = ist('10:00')
  const { threadId } = await ask(s, at)
  await viewThread(pool, s.maths, threadId, at)
  const seen = async (when: Date) => (await viewThread(pool, s.student, threadId, when)).presence!
  assert.equal((await seen(new Date(at.getTime() + 20_000))).online, true)
  const gone = await seen(new Date(at.getTime() + 120_000))
  assert.equal(gone.online, false)
  assert.match(gone.hint!, /8:00 am to 6:00 pm/)
  await setHideOnline(pool, s.maths.teacherId, true)
  await viewThread(pool, s.maths, threadId, ist('11:00'))
  assert.equal((await seen(ist('11:00'))).online, false)
  await setHideOnline(pool, s.maths.teacherId, false)
  assert.equal((await seen(ist('11:00'))).online, true)
  await viewThread(pool, s.maths, threadId, ist('21:00'))
  assert.equal((await seen(ist('21:00'))).online, false, 'never outside hours')
  assert.equal((await viewThread(pool, s.parent, threadId, ist('11:00'))).presence, null)
})

test('a teacher is not pushed outside chat hours; the student always is', opts, async () => {
  const s = await school()
  const night = ist('21:00')
  const { threadId } = await ask(s, night)
  assert.deepEqual((await notes(s.schoolId, 'chat_new_message')).map(n => n.pushed), [true], 'marked as sent, so no push')
  await markRead(pool, s.maths, threadId, 2147483647)
  await sendMessage(pool, s.student, threadId, msg('morning'), ist('09:00', 8))
  assert.deepEqual((await notes(s.schoolId, 'chat_new_message')).map(n => n.pushed), [true, false])
  await sendMessage(pool, s.maths, threadId, msg('answer'), ist('22:00', 8))
  assert.deepEqual((await notes(s.schoolId, 'chat_reply')).map(n => n.pushed), [false])
})

test('a parent gets an alert per reply only after asking for it', opts, async () => {
  const s = await school()
  const { threadId } = await ask(s, ist('10:00'))
  await sendMessage(pool, s.maths, threadId, msg('first'), ist('10:05'))
  assert.equal((await notes(s.schoolId, 'chat_parent_reply')).length, 0)
  await setParentAlerts(pool, s.parent.parentId, true)
  await sendMessage(pool, s.maths, threadId, msg('second secret words'), ist('10:10'))
  const got = await notes(s.schoolId, 'chat_parent_reply')
  assert.deepEqual(got.map(n => n.recipient_parent_id), [s.parent.parentId])
  assert.ok(!got[0].message.includes('secret'))
})

test('one daily note per parent per child, only on days with messages', opts, async () => {
  const s = await school()
  await ask(s, ist('10:00', 9))
  await parentDailySummary(pool, deps([], false), ist('18:30', 9))
  assert.equal((await notes(s.schoolId, 'chat_parent_summary')).length, 0, 'feature off')
  await parentDailySummary(pool, deps(), ist('18:30', 9))
  await parentDailySummary(pool, deps(), ist('19:00', 9))
  assert.deepEqual((await notes(s.schoolId, 'chat_parent_summary')).map(n => n.recipient_parent_id), [s.parent.parentId])
  await parentDailySummary(pool, deps(), ist('18:30', 10))
  assert.equal((await notes(s.schoolId, 'chat_parent_summary')).length, 1)
})

test('a doubt waiting two school days is escalated once; a reply resets it', opts, async () => {
  const s = await school()
  const { threadId } = await ask(s, ist('10:00', 7))
  // A follow-up does not restart the clock.
  await sendMessage(pool, s.student, threadId, msg('anyone?'), ist('10:00', 8))
  const mine = async () => (await notes(s.schoolId, 'chat_overdue'))
  await escalateOverdue(pool, deps(), ist('08:00', 8))
  assert.equal((await mine()).length, 0)
  await escalateOverdue(pool, deps(['2026-12-08']), ist('08:00', 9))
  assert.equal((await mine()).length, 0, 'a holiday does not count')
  await escalateOverdue(pool, deps(), ist('08:00', 9))
  await escalateOverdue(pool, deps(), ist('09:00', 9))
  assert.deepEqual((await mine()).map(n => [n.recipient_school_id, n.recipient_teacher_id]), [[s.schoolId, null], [null, s.classTeacherId]])
  let stats = (await schoolOverview(pool, s.office, ist('09:00', 9))).teachers
  assert.deepEqual(stats.map(t => [t.teacher, t.waiting, t.overdue]), [['Maths Teacher', 1, 1]])
  await sendMessage(pool, s.maths, threadId, msg('here'), ist('10:00', 9))
  stats = (await schoolOverview(pool, s.office, ist('11:00', 9))).teachers
  assert.deepEqual(stats, [{ teacher: 'Maths Teacher', waiting: 0, overdue: 0, avgReplyHours: 48 }])
  await setStatus(pool, s.maths, threadId, 'answered', ist('10:01', 9))
  await setStatus(pool, s.student, threadId, 'still_unclear', ist('10:02', 9))
  await escalateOverdue(pool, deps(), ist('12:00', 11))
  assert.equal((await mine()).length, 4, 'waiting again, so raised again')
})

test('the teacher hears once a week when three students ask about a subject', opts, async () => {
  const s = await school()
  const others = [await s.child(), await s.child(), await s.child()]
  await ask(s, ist('10:00'))
  await ask(s, ist('10:01'), s.student)
  await ask(s, ist('10:02'), others[0].student)
  assert.equal((await notes(s.schoolId, 'chat_repeated_subject')).length, 0, 'two students')
  await ask(s, ist('10:03'), others[1].student)
  await ask(s, ist('10:04'), others[2].student)
  assert.deepEqual((await notes(s.schoolId, 'chat_repeated_subject')).map(n => n.recipient_teacher_id), [s.maths.teacherId])
})

test('saved replies are private, limited and checked', opts, async () => {
  const s = await school()
  const other = await school()
  await rejects(addSavedReply(pool, s.maths.teacherId, 'call 98765 43210'), 422)
  const reply = await addSavedReply(pool, s.maths.teacherId, 'Show your working.')
  await rejects(deleteSavedReply(pool, other.maths.teacherId, reply.id), 404)
  for (let i = 1; i < MAX_SAVED_REPLIES; i++) await addSavedReply(pool, s.maths.teacherId, `Reply ${i}`)
  await rejects(addSavedReply(pool, s.maths.teacherId, 'one too many'), 429)
  await deleteSavedReply(pool, s.maths.teacherId, reply.id)
  assert.equal((await teacherSettings(pool, s.maths.teacherId, s.schoolId)).savedReplies.length, MAX_SAVED_REPLIES - 1)
  assert.equal((await teacherSettings(pool, other.maths.teacherId, other.schoolId)).savedReplies.length, 0)
})
