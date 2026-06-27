import { Pool, types } from 'pg'

// Return DATE columns as plain "YYYY-MM-DD" strings instead of JS Date objects.
// Without this, pg serialises dates as UTC midnight which JSON-stringifies to
// e.g. "2026-03-30T18:30:00.000Z" in IST — .slice(0,10) then gives "2026-03-30"
// instead of "2026-03-31", causing a persistent one-day-behind display bug.
types.setTypeParser(types.builtins.DATE, (val: string) => val)

// Auto-detect local vs Supabase: skip SSL for localhost connections
const dbUrl = process.env.DATABASE_URL ?? ''
const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
// Vercel serverless: each function instance is isolated — 1 connection is enough,
// keeps us well under Supabase PgBouncer's session-mode pool_size limit.
const isVercel = process.env.VERCEL === '1'

// If individual params are set (avoids special-char URL encoding issues on Vercel),
// use them directly. Otherwise fall back to the connection string URL.
const poolConfig = (process.env.PGHOST)
  ? {
      host:     process.env.PGHOST,
      port:     parseInt(process.env.PGPORT ?? '5432'),
      database: process.env.PGDATABASE ?? 'postgres',
      user:     process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    }
  : {
      connectionString: dbUrl,
      max: isLocal ? 10 : 1,
      idleTimeoutMillis: isVercel ? 10000 : 30000,
      connectionTimeoutMillis: isLocal ? 5000 : 10000,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    }

const pool = new Pool(poolConfig)

export default pool

// Lazy singleton — ensures bootstrap runs at most once per server process.
let _initPromise: Promise<void> | null = null
export function ensureDB(): Promise<void> {
  if (!_initPromise) {
    _initPromise = initDB().catch(err => {
      _initPromise = null // reset so it can retry next request
      throw err
    })
  }
  return _initPromise
}

// Sentinel: the last column added in the most recent migration.
// One fast round-trip replaces 100+ ALTER TABLE round-trips on every cold start.
const SCHEMA_SENTINEL_TABLE  = 'classes'
const SCHEMA_SENTINEL_COLUMN = 'deleted_at'
const BOOTSTRAP_MARKER_KEY   = 'initial_schema_bootstrap'

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_bootstrap_state (
      key TEXT PRIMARY KEY,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Check if core tables exist — on a fresh DB we must create them before any ALTER TABLE
  const tablesExist = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'schools' LIMIT 1
  `)
  const isFreshDB = tablesExist.rows.length === 0

  const bootstrap = await pool.query(
    `SELECT 1 FROM app_bootstrap_state WHERE key = $1 LIMIT 1`,
    [BOOTSTRAP_MARKER_KEY]
  )

  if (!isFreshDB && bootstrap.rows.length > 0) {
    // Schema fully bootstrapped — run only incremental migrations
    await runIncrementalMigrations()
    return
  }

  if (!isFreshDB) {
    // Tables exist but no bootstrap marker — check sentinel
    const { rows } = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = $1
        AND column_name  = $2
      LIMIT 1
    `, [SCHEMA_SENTINEL_TABLE, SCHEMA_SENTINEL_COLUMN])
    if (rows.length > 0) {
      await runIncrementalMigrations()
      await pool.query(
        `INSERT INTO app_bootstrap_state (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
        [BOOTSTRAP_MARKER_KEY]
      )
      return
    }
  }

  // Fresh DB or incomplete bootstrap — create all tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100),
      city VARCHAR(100),
      country VARCHAR(100),
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS school_subscriptions (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
      tier VARCHAR(20) DEFAULT 'none',
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      subject VARCHAR(100),
      phone VARCHAR(50),
      employee_id VARCHAR(50),
      department VARCHAR(100),
      qualification VARCHAR(200),
      date_of_joining DATE,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      grade VARCHAR(20),
      section VARCHAR(10),
      roll_number VARCHAR(50),
      parent_name VARCHAR(255),
      parent_phone VARCHAR(50),
      phone VARCHAR(50),
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      grade VARCHAR(20) NOT NULL,
      section VARCHAR(10) NOT NULL,
      class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(school_id, grade, section)
    );

    CREATE TABLE IF NOT EXISTS class_subjects (
      id SERIAL PRIMARY KEY,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      subject_name VARCHAR(100) NOT NULL,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      leave_type VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS parents (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS student_parents (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE,
      UNIQUE(student_id, parent_id)
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      day_of_week VARCHAR(10) NOT NULL,
      period_number INTEGER,
      time_from VARCHAR(10),
      time_to VARCHAR(10),
      subject VARCHAR(100),
      grade VARCHAR(20),
      section VARCHAR(10),
      room VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS class_timetable (
      id SERIAL PRIMARY KEY,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      day_of_week VARCHAR(10) NOT NULL,
      period_number INTEGER NOT NULL,
      time_from VARCHAR(10),
      time_to VARCHAR(10),
      subject_name VARCHAR(100),
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      room VARCHAR(50),
      is_break BOOLEAN DEFAULT FALSE,
      break_label VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      recipient_teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      sender_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(200),
      message TEXT,
      data JSONB,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS curriculum_assignments (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      grade VARCHAR(20) NOT NULL,
      curriculum_type VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(school_id, grade)
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255),
      school_code VARCHAR(100) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'school_admin',
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      first_login BOOLEAN DEFAULT TRUE,
      profile_completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      full_name VARCHAR(255),
      phone VARCHAR(50),
      designation VARCHAR(100),
      bio TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)

  // Run each migration individually so one failure doesn't block others
  const migrations = [
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50)`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS qualification VARCHAR(200)`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS date_of_joining DATE`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS staff_type VARCHAR(20) DEFAULT 'teaching'`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS teaches_grades TEXT`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS roll_number VARCHAR(20)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(50)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email VARCHAR(255)`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE`,
    // Fix period_number column type if it was previously altered to NUMERIC(4,1)
    `ALTER TABLE class_timetable ALTER COLUMN period_number TYPE INTEGER USING ROUND(period_number)::INTEGER`,
    // Periods-per-week per subject (data-driven timetable generation)
    `ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS periods_per_week INTEGER DEFAULT 4`,
    // Teacher unavailability slots (hard constraint for timetable generator)
    `CREATE TABLE IF NOT EXISTS teacher_unavailability (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      day_of_week VARCHAR(10) NOT NULL,
      period_number INTEGER NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(teacher_id, day_of_week, period_number)
    )`,
    // Ensure auth columns exist on users table (safe for existing DBs)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS school_code VARCHAR(100)`,
    // School contact details + unique school code for login
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS address TEXT`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_code VARCHAR(100) UNIQUE`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_start_date DATE`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_end_date DATE`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_amount NUMERIC(10,2)`,
    // Allow duplicate emails across users (platform admins use email, school admins use school_code)
    `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL`,
    // Student attendance — 2 sessions per day: morning + afternoon
    `CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      session VARCHAR(20) DEFAULT 'morning',
      status VARCHAR(20) DEFAULT 'present',
      marked_by_teacher_id INTEGER REFERENCES teachers(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, date, class_id, session)  -- per-session uniqueness
    )`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email VARCHAR(255)`,
    // If table already existed with old constraint, add session column + new unique index
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS session VARCHAR(20) DEFAULT 'morning'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS attendance_session_unique ON attendance(student_id, date, class_id, session)`,
    // Track when attendance was last marked/updated for "already marked by" feature
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ DEFAULT NOW()`,
    // Widen roll_number column to fit generated IDs like wlyl-stu-{slug}-{num}
    `ALTER TABLE students ALTER COLUMN roll_number TYPE VARCHAR(50)`,
    // Drop old attendance unique constraint that lacked session column (blocks afternoon attendance)
    `ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_date_class_id_key`,
    // Substitute teacher assignments — when a teacher is on leave, admin assigns substitutes per period
    `CREATE TABLE IF NOT EXISTS substitute_assignments (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      leave_request_id INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE,
      original_teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      substitute_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      day_of_week VARCHAR(10) NOT NULL,
      period_number INTEGER NOT NULL,
      subject_name VARCHAR(100),
      time_from VARCHAR(10),
      time_to VARCHAR(10),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(class_id, date, period_number)
    )`,

    // ── Tasks system ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      task_type VARCHAR(20) NOT NULL DEFAULT 'homework',
      max_marks INTEGER NOT NULL DEFAULT 10,
      instructions TEXT,
      assigned_to VARCHAR(20) DEFAULT 'all',
      status VARCHAR(20) DEFAULT 'draft',
      due_date DATE,
      due_time TIME DEFAULT '23:59:00',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_class ON tasks(class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks(teacher_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, due_date)`,

    `CREATE TABLE IF NOT EXISTS task_submissions (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      submitted_at TIMESTAMPTZ,
      submission_text TEXT,
      file_url VARCHAR(1000),
      file_name VARCHAR(255),
      file_public_id VARCHAR(255),
      file_size_kb INTEGER,
      score NUMERIC(5,2),
      feedback TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      resubmission_requested BOOLEAN DEFAULT FALSE,
      reviewed_at TIMESTAMPTZ,
      reviewed_by INTEGER REFERENCES teachers(id),
      UNIQUE(task_id, student_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_task_subs_task ON task_submissions(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_task_subs_student ON task_submissions(student_id)`,

    `CREATE TABLE IF NOT EXISTS task_reminders (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      sent_by INTEGER NOT NULL REFERENCES teachers(id),
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      target_type VARCHAR(20) DEFAULT 'all',
      student_count INTEGER DEFAULT 0,
      student_ids JSONB DEFAULT '[]'
    )`,
    `CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON task_reminders(task_id)`,

    // ── Teacher authentication ──────────────────────────────────────────────
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`,
    `CREATE INDEX IF NOT EXISTS idx_teachers_employee_id ON teachers(employee_id, school_id)`,

    // ── Student authentication ──────────────────────────────────────────────
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`,

    // ── Doubts (student asks, teacher/AI answers) ───────────────────────────
    `CREATE TABLE IF NOT EXISTS doubts (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject VARCHAR(100) NOT NULL,
      question TEXT NOT NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      ai_answer TEXT,
      teacher_answer TEXT,
      answered_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      answered_at TIMESTAMPTZ,
      status VARCHAR(20) DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_doubts_class ON doubts(class_id, school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_doubts_student ON doubts(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_doubts_status ON doubts(status, school_id)`,

    // ── Weekly AI-generated tests ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS weekly_tests (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      questions JSONB NOT NULL DEFAULT '[]',
      student_answers JSONB DEFAULT NULL,
      score INTEGER,
      max_score INTEGER,
      status VARCHAR(20) DEFAULT 'available',
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      UNIQUE(student_id, week_start)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_weekly_tests_student ON weekly_tests(student_id, week_start)`,
    `CREATE INDEX IF NOT EXISTS idx_weekly_tests_class ON weekly_tests(class_id, week_start)`,

    // ── Notifications: add student recipient support ──────────────────────────
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_student_id INTEGER REFERENCES students(id) ON DELETE CASCADE`,

    // ── Doubt live chat messages ─────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS doubt_messages (
      id SERIAL PRIMARY KEY,
      doubt_id INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('student', 'teacher')),
      sender_id INTEGER NOT NULL,
      sender_name VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_doubt_messages_doubt ON doubt_messages(doubt_id, created_at)`,
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ`,
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL`,
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0`,

    // ── Doubt resolution: final answer + teacher-close flow ──────────────────
    `ALTER TABLE doubt_messages ADD COLUMN IF NOT EXISTS is_final_answer BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS closed_by_teacher BOOLEAN DEFAULT FALSE`,

    // ── Doubt: class FAQ & pattern tracking ──────────────────────────────────
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS is_class_faq BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS faq_set_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL`,

    // ── Peer doubt anonymization: upvotes ────────────────────────────────────
    `ALTER TABLE doubts ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS doubt_upvotes (
      id SERIAL PRIMARY KEY,
      doubt_id INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(doubt_id, student_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_doubt_upvotes_doubt ON doubt_upvotes(doubt_id)`,

    // ── Daily Newspaper (pre-written topic bank, rotated by date) ────────────
    `CREATE TABLE IF NOT EXISTS daily_newspapers (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      title VARCHAR(255) NOT NULL,
      subtitle VARCHAR(255),
      content TEXT NOT NULL,
      fun_fact TEXT,
      quiz_question TEXT,
      quiz_answer TEXT,
      topic VARCHAR(100),
      category VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, date)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_newspapers_date ON daily_newspapers(school_id, date)`,

    `CREATE TABLE IF NOT EXISTS student_newspaper_reads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      newspaper_id INTEGER NOT NULL REFERENCES daily_newspapers(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      points_awarded INTEGER DEFAULT 0,
      UNIQUE(student_id, newspaper_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_newspaper_reads_student ON student_newspaper_reads(student_id)`,

    // ── Student Rewards: points, badges, streaks ─────────────────────────────
    `CREATE TABLE IF NOT EXISTS student_points (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      action_type VARCHAR(50) NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      reference_id INTEGER,
      reference_type VARCHAR(50),
      earned_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_student_points_student ON student_points(student_id, school_id)`,

    `CREATE TABLE IF NOT EXISTS student_badges (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      badge_type VARCHAR(50) NOT NULL,
      earned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, badge_type)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_student_badges_student ON student_badges(student_id)`,

    `CREATE TABLE IF NOT EXISTS student_streaks (
      student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_activity_date DATE
    )`,

    // ── Syllabus topics (teacher marks coverage) ─────────────────────────────
    `CREATE TABLE IF NOT EXISTS syllabus_topics (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject VARCHAR(100) NOT NULL,
      chapter_name VARCHAR(200) NOT NULL,
      chapter_order INTEGER DEFAULT 0,
      topic_name VARCHAR(200) NOT NULL,
      topic_order INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      covered_date DATE,
      covered_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_syllabus_class ON syllabus_topics(class_id, school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_syllabus_subject ON syllabus_topics(class_id, subject)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_syllabus_unique_topic ON syllabus_topics(class_id, subject, chapter_name, topic_name)`,

    // ── Exam Marks System ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS exam_records (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES teachers(id),
      exam_name VARCHAR(200) NOT NULL,
      exam_type VARCHAR(50) NOT NULL DEFAULT 'unit_test',
      exam_date DATE,
      passing_pct INTEGER NOT NULL DEFAULT 35,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS exam_subjects (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      subject_name VARCHAR(100) NOT NULL,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      teacher_name VARCHAR(100),
      max_marks INTEGER NOT NULL DEFAULT 100,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      submitted_at TIMESTAMPTZ,
      submitted_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      UNIQUE(exam_id, subject_name)
    )`,
    `CREATE TABLE IF NOT EXISTS exam_marks (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_name VARCHAR(100) NOT NULL,
      marks_obtained NUMERIC(5,2),
      is_absent BOOLEAN NOT NULL DEFAULT FALSE,
      entered_by INTEGER REFERENCES teachers(id),
      entered_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(exam_id, student_id, subject_name)
    )`,
    `CREATE TABLE IF NOT EXISTS parent_mark_acks (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      parent_name VARCHAR(100),
      parent_phone VARCHAR(20),
      acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(exam_id, student_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_exam_records_class ON exam_records(class_id, school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_exam_marks_student ON exam_marks(student_id, exam_id)`,

    // ── Timetable generation tracking ────────────────────────────────────────
    // Tracks when each class's timetable was generated (enables one-time lock in UI)
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_generated_at TIMESTAMPTZ`,
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_generated_by VARCHAR(50)`,

    // ── Teacher unavailability: ensure school_id index for fast lookup ────────
    `CREATE INDEX IF NOT EXISTS idx_teacher_unavail_school ON teacher_unavailability(school_id, teacher_id)`,

    // ── class_timetable: unique constraint on (class_id, day_of_week, period_number) ─
    // Prevents duplicate slots from being inserted during generation retries
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_timetable_slot
       ON class_timetable(class_id, day_of_week, period_number)`,

    // ── timetable (teacher view): unique constraint to prevent duplicates ─────
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_timetable_teacher_slot
       ON timetable(teacher_id, school_id, day_of_week, period_number)`,

    // ── School schedule settings (dynamic periods + break configuration) ──────
    `CREATE TABLE IF NOT EXISTS school_schedule_settings (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
      periods_per_day INTEGER NOT NULL DEFAULT 8,
      start_time VARCHAR(5) NOT NULL DEFAULT '08:30',
      end_time VARCHAR(5) NOT NULL DEFAULT '17:00',
      morning_break_after_period INTEGER NOT NULL DEFAULT 3,
      morning_break_duration INTEGER NOT NULL DEFAULT 15,
      lunch_after_period INTEGER NOT NULL DEFAULT 5,
      lunch_duration INTEGER NOT NULL DEFAULT 45,
      afternoon_break_after_period INTEGER NOT NULL DEFAULT 7,
      afternoon_break_duration INTEGER NOT NULL DEFAULT 10,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE`,
    // class_subjects: unique constraint required for ON CONFLICT (class_id, subject_name)
    `CREATE UNIQUE INDEX IF NOT EXISTS class_subjects_class_subject_key ON class_subjects(class_id, subject_name)`,
    // source column: richer flag replacing is_manual boolean
    // Values: 'auto' (generator), 'manual' (admin edited), 'cloned' (copied from another class), 'master' (reserved for future)
    `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'auto'`,
    // Backfill: existing manual slots → source='manual', rest → source='auto'
    `UPDATE class_timetable SET source = CASE WHEN is_manual = TRUE THEN 'manual' ELSE 'auto' END WHERE source IS NULL OR source = 'auto'`,
    // Index for fast conflict detection queries
    `CREATE INDEX IF NOT EXISTS idx_class_timetable_teacher_slot ON class_timetable(school_id, teacher_id, day_of_week, period_number) WHERE teacher_id IS NOT NULL AND is_break = FALSE`,

    // ── Timetable version system ─────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS timetable_versions (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL DEFAULT 'Draft',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      is_active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      circulated_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_timetable_versions_school ON timetable_versions(school_id)`,

    // ── Class timetable mode tracking (master/slave/independent) ─────────────
    `CREATE TABLE IF NOT EXISTS class_timetable_modes (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      mode VARCHAR(20) NOT NULL DEFAULT 'slave',
      master_source_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(class_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_class_timetable_modes_school ON class_timetable_modes(school_id)`,

    // ── Extend class_timetable with lock support ─────────────────────────────
    `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`,

    // ── Named schedule templates (multiple saved schedules per school) ─────────
    // Admins can save multiple templates (e.g. "Full Day", "Half Day") and select
    // one when generating a class timetable instead of always using the school default.
    `CREATE TABLE IF NOT EXISTS schedule_templates (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      settings JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_schedule_templates_school ON schedule_templates(school_id)`,

    // ── Circulation tracking — records when each class timetable was last published ─
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_circulated_at TIMESTAMPTZ`,

    // ── Announcements / circulars board ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      announcement_type VARCHAR(30) NOT NULL DEFAULT 'general',
      target_audience VARCHAR(20) NOT NULL DEFAULT 'all',
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      created_by_name VARCHAR(100),
      expires_at DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(school_id, created_at DESC)`,

    // ── Academic calendar (holidays, events, meetings) ───────────────────────
    `CREATE TABLE IF NOT EXISTS school_calendar (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      event_date DATE NOT NULL,
      end_date DATE,
      event_type VARCHAR(30) NOT NULL DEFAULT 'event',
      color VARCHAR(20) DEFAULT 'blue',
      description TEXT,
      all_day BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_calendar_school ON school_calendar(school_id, event_date)`,

    // ── Schools: branding + grading scheme ───────────────────────────────────
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS grading_scheme JSONB DEFAULT '[]'`,

    // ── Academic years ────────────────────────────────────────────────────────
    // Tracks each academic year for a school. is_current=true marks the active year.
    `CREATE TABLE IF NOT EXISTS academic_years (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      label VARCHAR(20) NOT NULL,        -- e.g. "2024-25"
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_current BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, label)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_academic_years_school ON academic_years(school_id)`,

    // ── Student class history ─────────────────────────────────────────────────
    // Immutable snapshot: which grade+section a student was in for each academic year.
    // Written once per year during rollover. Never updated — permanent audit trail.
    `CREATE TABLE IF NOT EXISTS student_class_history (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      grade VARCHAR(20) NOT NULL,
      section VARCHAR(10) NOT NULL,
      promoted_to_grade VARCHAR(20),     -- NULL if graduated, grade+1 if promoted
      promoted_at TIMESTAMPTZ,
      UNIQUE(student_id, academic_year_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_student_class_history_student ON student_class_history(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_student_class_history_year ON student_class_history(academic_year_id, school_id)`,

    // ── Platform audit log ────────────────────────────────────────────────────
    // Permanent record of every create/update/delete action taken by platform admins.
    `CREATE TABLE IF NOT EXISTS platform_audit_log (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email VARCHAR(200),
      action VARCHAR(50) NOT NULL,          -- e.g. 'create_school', 'update_subscription', 'delete_school', 'reset_password'
      entity_type VARCHAR(50) NOT NULL,     -- 'school', 'subscription', 'user'
      entity_id INTEGER,
      entity_name VARCHAR(200),
      details JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON platform_audit_log(actor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON platform_audit_log(entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON platform_audit_log(created_at DESC)`,

    // ── Plan feature assignments ───────────────────────────────────────────────
    // Stores which features are enabled for each plan tier.
    // Platform admin configures this; school admin sidebar reflects it.
    `CREATE TABLE IF NOT EXISTS plan_features (
      id SERIAL PRIMARY KEY,
      feature_key VARCHAR(50) NOT NULL,
      tier VARCHAR(20) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(feature_key, tier)
    )`,

    // ── Fee Management ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS fee_categories (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      frequency VARCHAR(20) NOT NULL DEFAULT 'annual',  -- monthly|quarterly|annual|one_time
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fee_categories_school ON fee_categories(school_id)`,

    `CREATE TABLE IF NOT EXISTS fee_structures (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      fee_category_id INTEGER NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
      grade VARCHAR(20) NOT NULL,
      amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      due_day INTEGER DEFAULT 10,           -- day of month due (for monthly fees)
      academic_year VARCHAR(10) NOT NULL,   -- e.g. "2025-26"
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, fee_category_id, grade, academic_year)
    )`,

    `CREATE TABLE IF NOT EXISTS student_fee_ledger (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      fee_category_id INTEGER NOT NULL REFERENCES fee_categories(id),
      fee_structure_id INTEGER REFERENCES fee_structures(id),
      academic_year VARCHAR(10) NOT NULL,
      period_label VARCHAR(50),             -- e.g. "April 2026", "Q1 2026", "2025-26"
      amount_due NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
      due_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|paid|partial|overdue|waived
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fee_ledger_student ON student_fee_ledger(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_ledger_school ON student_fee_ledger(school_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_ledger_year ON student_fee_ledger(school_id, academic_year)`,
    `ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`,

    `CREATE TABLE IF NOT EXISTS fee_payments (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      ledger_id INTEGER NOT NULL REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash',  -- cash|cheque|dd|online|upi
      payment_status VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed|pending_verification
      receipt_number VARCHAR(50) UNIQUE,
      transaction_ref VARCHAR(200),         -- cheque no / UTR / UPI ref
      paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
      collected_by_name VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_payments_school ON fee_payments(school_id, paid_date DESC)`,

    `CREATE TABLE IF NOT EXISTS fee_waivers (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      ledger_id INTEGER REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
      waiver_type VARCHAR(30) NOT NULL DEFAULT 'percentage', -- percentage|fixed_amount|full
      waiver_value NUMERIC(10,2) DEFAULT 0,
      waiver_amount NUMERIC(10,2) DEFAULT 0,
      reason TEXT NOT NULL,
      granted_by_name VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE fee_waivers ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE fee_waivers ADD COLUMN IF NOT EXISTS granted_by_name VARCHAR(100)`,

    // ── Receipt number sequence ───────────────────────────────────────────────
    `CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1000`,

    // ── Report Cards ──────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS report_card_config (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
      show_attendance BOOLEAN DEFAULT TRUE,
      show_rank BOOLEAN DEFAULT TRUE,
      show_remarks BOOLEAN DEFAULT TRUE,
      show_grade_points BOOLEAN DEFAULT TRUE,
      grading_scheme JSONB DEFAULT '[
        {"min":90,"max":100,"grade":"A+","points":10,"label":"Outstanding"},
        {"min":75,"max":89,"grade":"A","points":9,"label":"Excellent"},
        {"min":60,"max":74,"grade":"B","points":8,"label":"Very Good"},
        {"min":50,"max":59,"grade":"C","points":7,"label":"Good"},
        {"min":40,"max":49,"grade":"D","points":6,"label":"Satisfactory"},
        {"min":0,"max":39,"grade":"F","points":0,"label":"Needs Improvement"}
      ]',
      header_text TEXT DEFAULT 'Progress Report',
      footer_text TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS report_card_remarks (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
      class_teacher_remark TEXT,
      conduct VARCHAR(30) DEFAULT 'Good',    -- Excellent|Good|Satisfactory|Needs Improvement
      attendance_remark TEXT,
      next_term_advice TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, exam_id)
    )`,

    // ── Student portal activity tracking ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS student_portal_sessions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_minutes INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_portal_sessions_student ON student_portal_sessions(student_id, started_at DESC)`,

    `CREATE TABLE IF NOT EXISTS student_portal_activity (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      session_id INTEGER REFERENCES student_portal_sessions(id) ON DELETE CASCADE,
      action_type VARCHAR(50) NOT NULL,   -- page_view|task_view|task_submit|test_start|test_submit|doubt_ask|marks_view|fee_view
      action_detail VARCHAR(200),         -- e.g. "Math Assignment", "Weekly Science Test"
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_portal_activity_student ON student_portal_activity(student_id, created_at DESC)`,

    // ── TV/Kiosk Display Tokens ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS display_tokens (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      token VARCHAR(64) NOT NULL UNIQUE,
      label VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_display_tokens_school ON display_tokens(school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_display_tokens_token ON display_tokens(token)`,

    // ── Soft-delete for schools ───────────────────────────────────────────────
    // Instead of hard deleting, we mark deleted_at so platform admin retains all history.
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_schools_deleted ON schools(deleted_at) WHERE deleted_at IS NOT NULL`,

    // ── Soft-delete for teachers ─────────────────────────────────────────────
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`,

    // ── School default subject sets ───────────────────────────────────────────
    // Admins define subject templates per grade range; auto-applied when creating classes
    `CREATE TABLE IF NOT EXISTS school_subject_templates (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      from_grade INTEGER NOT NULL DEFAULT 1,
      to_grade INTEGER NOT NULL DEFAULT 12,
      subjects JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_subject_templates_school ON school_subject_templates(school_id)`,

    // ── Per-template timetables ───────────────────────────────────────────────
    `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS template_id INTEGER`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'class_timetable_template_id_fkey'
           AND conrelid = 'class_timetable'::regclass
       ) THEN
         ALTER TABLE class_timetable
           ADD CONSTRAINT class_timetable_template_id_fkey
           FOREIGN KEY (template_id) REFERENCES schedule_templates(id) ON DELETE SET NULL;
       END IF;
     END $$`,
    `DROP INDEX IF EXISTS idx_class_timetable_slot`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_timetable_slot ON class_timetable(class_id, day_of_week, period_number, COALESCE(template_id, 0))`,

    // ── AI Chat Sessions (student floating chat — visible to parents) ───────────
    `CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject VARCHAR(100),
      messages JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_student ON ai_chat_sessions(student_id, created_at DESC)`,

    // ── Teacher AI chat sessions (professional assistant, not parent-visible) ────
    `CREATE TABLE IF NOT EXISTS teacher_ai_sessions (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      context VARCHAR(100),
      messages JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_teacher_ai_sessions_teacher ON teacher_ai_sessions(teacher_id, created_at DESC)`,

    // ── HOD (Head of Department) assignments ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS department_hods (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      department VARCHAR(100) NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_ids INTEGER[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_department_hods_school ON department_hods(school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_department_hods_teacher ON department_hods(teacher_id)`,
    `ALTER TABLE department_hods DROP CONSTRAINT IF EXISTS department_hods_school_id_department_key`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_department_hods_school_dept_teacher ON department_hods(school_id, department, teacher_id)`,

    // ── Extend syllabus_topics with HOD-governance fields ─────────────────────────
    `ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS target_date DATE`,
    `ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS delay_reason TEXT`,
    `ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS hod_remark TEXT`,
    `ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS hod_remark_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL`,
    `ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS hod_remark_at TIMESTAMPTZ`,
    `ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS last_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL`,

    // ── Soft-delete for classes ───────────────────────────────────────────────
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_classes_deleted ON classes(deleted_at) WHERE deleted_at IS NOT NULL`,

    // ── Syllabus publish workflow: HODs load → review → publish ───────────────
    // Default TRUE so existing topics stay visible. Board-load sets FALSE (draft).
    `ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE`,
    `CREATE INDEX IF NOT EXISTS idx_syllabus_published ON syllabus_topics(class_id, subject, published)`,

    // ── Textbook Library: store extracted PDF text for AI context ─────────────
    // One row per uploaded PDF, keyed by school + grade + subject.
    `CREATE TABLE IF NOT EXISTS textbook_library (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      grade VARCHAR(10) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      book_title VARCHAR(255),
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500),
      total_chunks INTEGER DEFAULT 0,
      total_chars INTEGER DEFAULT 0,
      uploaded_by_name VARCHAR(100),
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, grade, subject, file_name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_textbook_library_school ON textbook_library(school_id, grade, subject)`,

    // Chunks: extracted text split into ~1500-char pieces; full-text search via GIN
    `CREATE TABLE IF NOT EXISTS textbook_chunks (
      id SERIAL PRIMARY KEY,
      textbook_id INTEGER NOT NULL REFERENCES textbook_library(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      grade VARCHAR(10) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      page_hint INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_textbook_chunks_book ON textbook_chunks(textbook_id, chunk_index)`,
    `CREATE INDEX IF NOT EXISTS idx_textbook_chunks_school ON textbook_chunks(school_id, grade, subject)`,
    `CREATE INDEX IF NOT EXISTS idx_textbook_chunks_fts ON textbook_chunks USING GIN (to_tsvector('english', content))`,

    // ── Plan Pricing ──────────────────────────────────────────────────────────────
    // Extends the existing tier system (school_subscriptions.tier) with pricing,
    // quotas and capability flags. Does NOT replace school_subscriptions.
    `CREATE TABLE IF NOT EXISTS plan_pricing (
      id SERIAL PRIMARY KEY,
      tier VARCHAR(20) NOT NULL UNIQUE,
      display_name VARCHAR(50) NOT NULL,
      monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
      included_whatsapp_messages INTEGER NOT NULL DEFAULT 0,
      whatsapp_overage_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
      online_payments_included BOOLEAN NOT NULL DEFAULT FALSE,
      whatsapp_included BOOLEAN NOT NULL DEFAULT FALSE,
      usage_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `INSERT INTO plan_pricing (tier, display_name, monthly_price, included_whatsapp_messages, whatsapp_overage_rate, online_payments_included, whatsapp_included, usage_billing_enabled)
     VALUES
       ('none',     'No Plan',  0,    0,    0,    false, false, false),
       ('basic',    'Basic',    499,  0,    0,    false, false, false),
       ('standard', 'Standard', 999,  1000, 0.20, true,  true,  true),
       ('premium',  'Premium',  1999, 5000, 0.20, true,  true,  true)
     ON CONFLICT (tier) DO NOTHING`,

    // ── Per-school feature overrides ──────────────────────────────────────────────
    // Overrides tier-level plan_features on a per-school basis.
    // Only used for: online-payments, whatsapp, saas-billing.
    // All other features continue to be governed by plan_features unchanged.
    `CREATE TABLE IF NOT EXISTS school_feature_overrides (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      feature_key VARCHAR(50) NOT NULL,
      enabled BOOLEAN NOT NULL,
      updated_by TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, feature_key)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_feature_overrides_school ON school_feature_overrides(school_id)`,

    // ── Cashfree configuration (per school) ───────────────────────────────────────
    // Schools connect their own Cashfree account — money flows school → bank directly.
    // Secret is AES-256-GCM encrypted; never stored or returned in plaintext.
    `CREATE TABLE IF NOT EXISTS school_payment_config (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
      cashfree_app_id TEXT,
      cashfree_secret_encrypted TEXT,
      cashfree_env VARCHAR(10) NOT NULL DEFAULT 'sandbox',
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── Payment transactions (school fee collection via Cashfree) ─────────────────
    // Tracks online payment links created for parents. On PAID: creates fee_payments row.
    `CREATE TABLE IF NOT EXISTS payment_transactions (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      ledger_ids INTEGER[] NOT NULL,
      cashfree_order_id VARCHAR(100) NOT NULL UNIQUE,
      cashfree_payment_id VARCHAR(100),
      amount NUMERIC(10,2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'INR',
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      idempotency_key VARCHAR(100) NOT NULL UNIQUE,
      payment_link TEXT,
      payment_link_expiry TIMESTAMPTZ,
      parent_name VARCHAR(255),
      parent_phone VARCHAR(50),
      parent_email VARCHAR(255),
      failure_reason TEXT,
      webhook_received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_payment_txn_school ON payment_transactions(school_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_txn_student ON payment_transactions(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_txn_order ON payment_transactions(cashfree_order_id)`,

    // ── Webhook log (Cashfree) ────────────────────────────────────────────────────
    // All incoming webhooks logged before processing for idempotency and audit.
    `CREATE TABLE IF NOT EXISTS payment_webhook_log (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
      cashfree_order_id VARCHAR(100),
      event_type VARCHAR(50),
      raw_payload JSONB NOT NULL DEFAULT '{}',
      signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
      processed BOOLEAN NOT NULL DEFAULT FALSE,
      processing_error TEXT,
      received_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_log_order ON payment_webhook_log(cashfree_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_log_received ON payment_webhook_log(received_at DESC)`,

    // ── WhatsApp configuration (per school) ───────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS school_whatsapp_config (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
      provider VARCHAR(20) NOT NULL DEFAULT 'meta',
      access_token_encrypted TEXT,
      phone_number_id VARCHAR(50),
      waba_id VARCHAR(50),
      fee_reminder_template VARCHAR(100),
      payment_receipt_template VARCHAR(100),
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE school_whatsapp_config ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT`,
    `ALTER TABLE school_whatsapp_config ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(50)`,
    `ALTER TABLE school_whatsapp_config ADD COLUMN IF NOT EXISTS waba_id VARCHAR(50)`,
    `ALTER TABLE school_whatsapp_config ADD COLUMN IF NOT EXISTS fee_reminder_template VARCHAR(100)`,
    `ALTER TABLE school_whatsapp_config ADD COLUMN IF NOT EXISTS payment_receipt_template VARCHAR(100)`,

    // ── WhatsApp messages (audit trail + delivery tracking) ───────────────────────
    `CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      sent_by_user_id INTEGER,
      sent_by_name TEXT,
      recipient_phone VARCHAR(20) NOT NULL,
      recipient_name TEXT,
      message_type VARCHAR(50) NOT NULL,
      template_name VARCHAR(100),
      template_params JSONB DEFAULT '{}',
      provider VARCHAR(20) NOT NULL,
      provider_message_id TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'queued',
      failure_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_school ON whatsapp_messages(school_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_type ON whatsapp_messages(school_id, message_type)`,
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_status ON whatsapp_messages(school_id, status)`,

    // ── WhatsApp usage summary (monthly rollup for billing) ───────────────────────
    `CREATE TABLE IF NOT EXISTS whatsapp_usage_summary (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      year_month VARCHAR(7) NOT NULL,
      message_type VARCHAR(50) NOT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(school_id, year_month, message_type)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_usage_school ON whatsapp_usage_summary(school_id, year_month)`,

    // ── Billing cycles (SaaS — school pays platform) ──────────────────────────────
    // Created when a school is assigned a usage-billing-enabled plan.
    // Platform Admin manually closes and invoices each cycle.
    `CREATE TABLE IF NOT EXISTS billing_cycles (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      cycle_start DATE NOT NULL,
      cycle_end DATE NOT NULL,
      tier VARCHAR(20) NOT NULL,
      plan_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      included_whatsapp INTEGER NOT NULL DEFAULT 0,
      overage_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_billing_cycles_school ON billing_cycles(school_id, status)`,

    // ── Usage ledger (per-event billable record) ──────────────────────────────────
    `CREATE TABLE IF NOT EXISTS usage_ledger (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      billing_cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
      reference_id INTEGER,
      reference_type VARCHAR(30),
      is_billable BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_usage_ledger_cycle ON usage_ledger(billing_cycle_id)`,
    `CREATE INDEX IF NOT EXISTS idx_usage_ledger_school ON usage_ledger(school_id, created_at DESC)`,

    // ── SaaS invoices ─────────────────────────────────────────────────────────────
    // Generated manually by Platform Admin after reviewing the billing cycle.
    `CREATE TABLE IF NOT EXISTS saas_invoices (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      billing_cycle_id INTEGER NOT NULL REFERENCES billing_cycles(id),
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      plan_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      whatsapp_included INTEGER NOT NULL DEFAULT 0,
      whatsapp_used INTEGER NOT NULL DEFAULT 0,
      whatsapp_overage INTEGER NOT NULL DEFAULT 0,
      overage_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      notes TEXT,
      generated_by TEXT,
      generated_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_saas_invoices_school ON saas_invoices(school_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_saas_invoices_status ON saas_invoices(status, due_date)`,

    // ── SaaS invoice line items ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS saas_invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES saas_invoices(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      item_type VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
      unit_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
      amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── SaaS payments (school pays platform — manually recorded in v1) ────────────
    `CREATE TABLE IF NOT EXISTS saas_payments (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL REFERENCES saas_invoices(id),
      amount NUMERIC(10,2) NOT NULL,
      payment_mode VARCHAR(30) NOT NULL,
      transaction_ref TEXT,
      payment_date DATE NOT NULL,
      recorded_by TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_saas_payments_school ON saas_payments(school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_saas_payments_invoice ON saas_payments(invoice_id)`,

    // ── School roll number (class roll number assigned by school) ─────────────
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS school_roll_number INTEGER`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_school_roll_unique
       ON students(school_id, grade, section, school_roll_number)
       WHERE school_roll_number IS NOT NULL`,
  ]

  for (const sql of migrations) {
    await pool.query(sql).catch(() => { /* column already exists */ })
  }

  // Run incremental migrations after bootstrap
  await runIncrementalMigrations()

  await pool.query(
    `INSERT INTO app_bootstrap_state (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
    [BOOTSTRAP_MARKER_KEY]
  )
}

async function runIncrementalMigrations() {
  await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS board VARCHAR(20)`)

  await pool.query(`ALTER TABLE parents ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`)
  await pool.query(`ALTER TABLE parents ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`)
  await pool.query(`ALTER TABLE parents ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE`)
  await pool.query(`
    DELETE FROM parents
    WHERE id NOT IN (
      SELECT MIN(id) FROM parents WHERE email IS NOT NULL GROUP BY email
    ) AND email IS NOT NULL
  `)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS parents_email_unique ON parents(email) WHERE email IS NOT NULL`)

  await pool.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'`)
  await pool.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS reference_id INTEGER`)

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`)

  await pool.query(`ALTER TABLE student_points ADD COLUMN IF NOT EXISTS points_type VARCHAR(20) DEFAULT 'academic'`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      emoji VARCHAR(10) DEFAULT '🎁',
      cost_points INTEGER NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_orders (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      item_id INTEGER REFERENCES marketplace_items(id),
      item_name VARCHAR(100),
      item_emoji VARCHAR(10),
      points_spent INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      student_name VARCHAR(255),
      grade VARCHAR(20),
      section VARCHAR(10),
      ordered_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    INSERT INTO marketplace_items (name, description, emoji, cost_points) VALUES
      ('Eraser',       'Good quality rubber eraser',            '🔲', 100),
      ('Pen',          'Ball point pen',                        '🖊️', 200),
      ('Notebook',     'A4 ruled notebook (100 pages)',         '📔', 500),
      ('Pencil Box',   'Coloured pencils set with box',         '🎨', 750),
      ('Geometry Box', 'Complete geometry instruments set',     '📐', 1000)
    ON CONFLICT (name) DO NOTHING
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_daily_content (
      id SERIAL PRIMARY KEY,
      content_date DATE UNIQUE NOT NULL,
      gk_questions JSONB,
      word_of_day JSONB,
      riddle JSONB,
      fact_myth_questions JSONB,
      debate_statement JSONB,
      challenge_problem JSONB,
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE hub_daily_content ADD COLUMN IF NOT EXISTS riddle JSONB`)
  await pool.query(`ALTER TABLE hub_daily_content ADD COLUMN IF NOT EXISTS fact_myth_questions JSONB`)
  await pool.query(`ALTER TABLE hub_daily_content ADD COLUMN IF NOT EXISTS debate_statement JSONB`)
  await pool.query(`ALTER TABLE hub_daily_content ADD COLUMN IF NOT EXISTS challenge_problem JSONB`)
  await pool.query(`ALTER TABLE hub_daily_content ADD COLUMN IF NOT EXISTS reading_passage JSONB`)
  await pool.query(`ALTER TABLE hub_daily_content ADD COLUMN IF NOT EXISTS writing_prompt JSONB`)
  await pool.query(`ALTER TABLE hub_daily_content ADD COLUMN IF NOT EXISTS speaking_sentences JSONB`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fee_structure_locks (
      id            SERIAL PRIMARY KEY,
      school_id     INTEGER NOT NULL,
      academic_year TEXT    NOT NULL,
      locked_by     TEXT    NOT NULL,
      locked_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, academic_year)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fee_structure_amendments (
      id               SERIAL PRIMARY KEY,
      school_id        INTEGER NOT NULL,
      fee_structure_id INTEGER REFERENCES fee_structures(id) ON DELETE SET NULL,
      fee_category_id  INTEGER REFERENCES fee_categories(id) ON DELETE CASCADE,
      grade            TEXT    NOT NULL,
      academic_year    TEXT    NOT NULL,
      old_amount       NUMERIC(10,2) NOT NULL,
      new_amount       NUMERIC(10,2) NOT NULL,
      effective_from   DATE    NOT NULL DEFAULT CURRENT_DATE,
      reason           TEXT    NOT NULL,
      changed_by       TEXT    NOT NULL,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_fee_ledger_edits (
      id            SERIAL PRIMARY KEY,
      ledger_id     INTEGER NOT NULL REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
      school_id     INTEGER NOT NULL,
      student_id    INTEGER NOT NULL,
      old_amount    NUMERIC(10,2) NOT NULL,
      new_amount    NUMERIC(10,2) NOT NULL,
      reason        TEXT    NOT NULL,
      changed_by    TEXT    NOT NULL,
      changed_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS verified_by      TEXT`)
  await pool.query(`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ`)
  await pool.query(`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT`)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_student_fee_ledger_entry
    ON student_fee_ledger (student_id, fee_category_id, academic_year, period_label)
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_hub_completions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      activity_type VARCHAR(50) NOT NULL,
      completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
      score INTEGER DEFAULT 0,
      points_earned INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, activity_type, completed_date)
    )
  `)

  // ── School roll number (class roll number assigned by school) ─────────────────
  await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS school_roll_number INTEGER`)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_school_roll_unique
      ON students(school_id, grade, section, school_roll_number)
      WHERE school_roll_number IS NOT NULL
  `)
  // Drop UNIQUE constraint on fee_payments.receipt_number to allow multi-entry receipts
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fee_payments DROP CONSTRAINT IF EXISTS fee_payments_receipt_number_key;
    EXCEPTION WHEN others THEN NULL;
    END $$
  `)

  // ── Staff limit per plan tier ─────────────────────────────────────────────────
  await pool.query(`ALTER TABLE plan_pricing ADD COLUMN IF NOT EXISTS staff_limit INTEGER DEFAULT NULL`)
  await pool.query(`
    UPDATE plan_pricing SET staff_limit = CASE
      WHEN tier = 'none'     THEN 1
      WHEN tier = 'basic'    THEN 2
      WHEN tier = 'standard' THEN 5
      WHEN tier = 'premium'  THEN NULL
    END
    WHERE staff_limit IS NULL
  `)
}
