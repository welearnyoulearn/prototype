// How much database work an open chat costs (#559). Throwaway LOCAL database only; it empties the chat test tables.
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55558/wlyl_chat_load npx tsx scripts/load-teacher-chat.ts
// One connection, as production allows per instance. Measures the refresh an open chat makes every 5 seconds.
// It does not measure the web server, the network or the production database.
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { ensureTeacherChatSchema } from '../lib/teacherChat/schema'
import { sendMessage, setClassEnabled, startThread, viewThread } from '../lib/teacherChat/service'

const OPEN_CHATS = 200
const REFRESH_SECONDS = 5

async function main() {
  const url = process.env.TEST_DATABASE_URL
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('TEST_DATABASE_URL must be a local database')
  const pool = new Pool({ connectionString: url, max: 1 })
  const insert = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: number }>(`${sql} RETURNING id`, args)).rows[0].id
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name VARCHAR(255));
    CREATE TABLE IF NOT EXISTS teachers (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255), status VARCHAR(20) DEFAULT 'active', removed_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS students (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255), grade VARCHAR(20), section VARCHAR(10), status VARCHAR(20) DEFAULT 'active');
    CREATE INDEX IF NOT EXISTS idx_load_students ON students (school_id, grade, section);
    CREATE TABLE IF NOT EXISTS classes (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, grade VARCHAR(20), section VARCHAR(10), class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL, deleted_at TIMESTAMPTZ, UNIQUE (school_id, grade, section));
    CREATE TABLE IF NOT EXISTS class_subjects (id SERIAL PRIMARY KEY, class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE, subject_name VARCHAR(100), teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS parents (id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE, name VARCHAR(255));
    CREATE TABLE IF NOT EXISTS student_parents (id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id) ON DELETE CASCADE, parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE, UNIQUE (student_id, parent_id));
    CREATE TABLE IF NOT EXISTS plan_features (feature_key VARCHAR(50), tier VARCHAR(20), enabled BOOLEAN, UNIQUE(feature_key, tier));
    CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, school_id INTEGER, recipient_student_id INTEGER, recipient_teacher_id INTEGER, recipient_school_id INTEGER, recipient_parent_id INTEGER, push_sent_at TIMESTAMPTZ, type VARCHAR(50), title VARCHAR(200), message TEXT, data JSONB, is_read BOOLEAN DEFAULT FALSE);
  `)
  await ensureTeacherChatSchema(pool)
  await pool.query(`TRUNCATE schools, notifications RESTART IDENTITY CASCADE`)

  const schoolId = await insert(`INSERT INTO schools (name) VALUES ('Load school')`)
  const teacherId = await insert(`INSERT INTO teachers (school_id, name) VALUES ($1, 'Teacher')`, [schoolId])
  const classId = await insert(`INSERT INTO classes (school_id, grade, section) VALUES ($1, '9', 'A')`, [schoolId])
  await insert(`INSERT INTO class_subjects (class_id, subject_name, teacher_id) VALUES ($1, 'Maths', $2)`, [classId, teacherId])
  await setClassEnabled(pool, { role: 'school', userId: 1, schoolId }, classId, true)
  const chats: { studentId: number; threadId: number }[] = []
  for (let i = 0; i < OPEN_CHATS; i++) {
    const studentId = await insert(`INSERT INTO students (school_id, name, grade, section) VALUES ($1, 'Student', '9', 'A')`, [schoolId])
    const parentId = await insert(`INSERT INTO parents (school_id, name) VALUES ($1, 'Parent')`, [schoolId])
    await insert(`INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)`, [studentId, parentId])
    const { threadId } = await startThread(pool, { role: 'student', studentId, schoolId }, { subject: 'Maths', body: 'A doubt', clientMessageId: randomUUID() })
    for (let m = 0; m < 10; m++) await sendMessage(pool, { role: 'teacher', teacherId, schoolId }, threadId, { body: `Step ${m}`, clientMessageId: randomUUID() })
    chats.push({ studentId, threadId })
  }

  const times: number[] = []
  const start = performance.now()
  for (let round = 0; round < 3; round++) {
    // All at once: they queue for the one connection, as a burst would.
    await Promise.all(chats.map(async c => {
      await viewThread(pool, { role: 'student', studentId: c.studentId, schoolId }, c.threadId)
      times.push(performance.now())
    }))
  }
  const seconds = (performance.now() - start) / 1000
  const perSecond = times.length / seconds
  console.log(`${times.length} refreshes of ${OPEN_CHATS} chats (11 messages each) in ${seconds.toFixed(1)} s`)
  console.log(`one connection handles about ${perSecond.toFixed(0)} refreshes a second (${(1000 / perSecond).toFixed(1)} ms each)`)
  console.log(`${OPEN_CHATS} chats refreshing every ${REFRESH_SECONDS} s need ${OPEN_CHATS / REFRESH_SECONDS} a second`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
