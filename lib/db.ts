import { Pool, types } from 'pg'

// Return DATE columns as plain "YYYY-MM-DD" strings instead of JS Date objects.
// Without this, pg serialises dates as UTC midnight which JSON-stringifies to
// e.g. "2026-03-30T18:30:00.000Z" in IST — .slice(0,10) then gives "2026-03-30"
// instead of "2026-03-31", causing a persistent one-day-behind display bug.
types.setTypeParser(types.builtins.DATE, (val: string) => val)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export default pool

// Lazy singleton — ensures migrations run exactly once per process
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

export async function initDB() {
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
  ]

  for (const sql of migrations) {
    await pool.query(sql).catch(() => { /* column already exists */ })
  }
}
