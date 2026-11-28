// Schema for Teacher Chat (#556, phase 1 #558). Called from the bottom of runIncrementalMigrations() in lib/db.ts.
// Every statement is idempotent. Quiz doubts (student_doubts) are a separate feature and are not touched.
import type { Pool } from 'pg'

type Db = Pick<Pool, 'query'>

export async function ensureTeacherChatSchema(db: Db): Promise<void> {
  await db.query(`
    -- The classes a school has opened chat for. No row = no chat for that class.
    CREATE TABLE IF NOT EXISTS chat_classes (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      enabled_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- One doubt = one thread. The teacher is not stored: it is whoever teaches the subject in the class now.
    CREATE TABLE IF NOT EXISTS chat_threads (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_name VARCHAR(100) NOT NULL,
      title VARCHAR(120) NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
      needs_review BOOLEAN NOT NULL DEFAULT FALSE,
      answered_at TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_threads_student ON chat_threads (student_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_class ON chat_threads (class_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_school ON chat_threads (school_id, needs_review, last_message_at DESC);

    -- Messages are never edited or deleted by users. A school reviewer may hide one; the text stays on record.
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('student', 'teacher')),
      sender_id INTEGER NOT NULL,
      sender_name VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      client_message_id UUID NOT NULL,
      flag VARCHAR(10) CHECK (flag IN ('support', 'adult', 'danger', 'gambling')),
      hidden_at TIMESTAMPTZ,
      hidden_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (sender_type, sender_id, client_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id, id);

    -- How far each side has received and read. Only moves forward. Parents and school reviewers have no cursor.
    CREATE TABLE IF NOT EXISTS chat_cursors (
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      actor_type VARCHAR(10) NOT NULL CHECK (actor_type IN ('student', 'teacher')),
      delivered_id INTEGER NOT NULL DEFAULT 0,
      read_id INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (thread_id, actor_type)
    );

    CREATE TABLE IF NOT EXISTS chat_reports (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
      reporter_type VARCHAR(10) NOT NULL CHECK (reporter_type IN ('student', 'teacher', 'parent')),
      reporter_id INTEGER NOT NULL,
      reason VARCHAR(500) NOT NULL,
      resolution VARCHAR(500),
      resolved_by INTEGER,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_reports_school ON chat_reports (school_id, resolved_at, created_at DESC);

    -- Every time a school reviewer opens a chat.
    CREATE TABLE IF NOT EXISTS chat_access_log (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Phase 2 (#559).
    ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ;
    ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
    -- Chats already open when this arrives start waiting from their last message, if the student wrote it.
    UPDATE chat_threads t SET waiting_since = t.last_message_at
      WHERE t.status = 'open' AND t.waiting_since IS NULL
        AND (SELECT m.sender_type FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) = 'student';
    CREATE INDEX IF NOT EXISTS idx_chat_threads_waiting ON chat_threads (waiting_since) WHERE status = 'open' AND escalated_at IS NULL;

    CREATE TABLE IF NOT EXISTS chat_settings (
      school_id INTEGER PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
      opens TIME NOT NULL,
      closes TIME NOT NULL CHECK (closes > opens),
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_presence (
      actor_type VARCHAR(10) NOT NULL CHECK (actor_type IN ('student', 'teacher')),
      actor_id INTEGER NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (actor_type, actor_id)
    );
    CREATE TABLE IF NOT EXISTS chat_teacher_prefs (
      teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
      hide_online BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS chat_saved_replies (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      body VARCHAR(500) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_saved_replies_teacher ON chat_saved_replies (teacher_id, id);
    CREATE TABLE IF NOT EXISTS chat_parent_prefs (
      parent_id INTEGER PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
      instant BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS chat_repeat_alerts (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_name VARCHAR(100) NOT NULL,
      week_start DATE NOT NULL,
      PRIMARY KEY (class_id, subject_name, week_start)
    );

    -- OFF at every tier until a platform admin switches it on.
    INSERT INTO plan_features (feature_key, tier, enabled)
    VALUES ('teacher-chat', 'basic', false), ('teacher-chat', 'standard', false), ('teacher-chat', 'premium', false)
    ON CONFLICT (feature_key, tier) DO NOTHING;
  `)
}
