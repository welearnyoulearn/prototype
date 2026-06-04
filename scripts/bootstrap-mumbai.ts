/**
 * Full schema bootstrap for a fresh database.
 * Creates all tables + runs all migrations, then marks bootstrap as complete.
 * Usage: DATABASE_URL=<mumbai-url> npx tsx scripts/bootstrap-mumbai.ts
 */
import { Pool } from 'pg'

const TARGET_URL = process.env.DATABASE_URL!

async function exec(pool: Pool, sql: string, label = '') {
  try {
    await pool.query(sql)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Ignore "already exists" and "does not exist" errors — they are safe on fresh + existing DBs
    if (msg.includes('already exists') || msg.includes('does not exist') || msg.includes('duplicate key')) {
      return
    }
    console.warn(`  WARN [${label || sql.slice(0, 60).replace(/\n/g, ' ')}]: ${msg}`)
  }
}

async function bootstrap() {
  const pool = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } })

  console.log('\n── Phase 1: Core tables ─────────────────────────────')

  await exec(pool, `CREATE TABLE IF NOT EXISTS app_bootstrap_state (
    key TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(100),
    city VARCHAR(100), country VARCHAR(100), status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS school_subscriptions (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    tier VARCHAR(20) DEFAULT 'none', updated_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, email VARCHAR(255), school_code VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'school_admin',
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    first_login BOOLEAN DEFAULT TRUE, profile_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    full_name VARCHAR(255), phone VARCHAR(50), designation VARCHAR(100),
    bio TEXT, updated_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL, expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, email VARCHAR(255), subject VARCHAR(100), phone VARCHAR(50),
    employee_id VARCHAR(50), department VARCHAR(100), qualification VARCHAR(200),
    date_of_joining DATE, status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, email VARCHAR(255), grade VARCHAR(20), section VARCHAR(10),
    roll_number VARCHAR(50), parent_name VARCHAR(255), parent_phone VARCHAR(50),
    phone VARCHAR(50), status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS parents (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255), email VARCHAR(255), phone VARCHAR(50), created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS student_parents (
    id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE, UNIQUE(student_id, parent_id)
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, section VARCHAR(10) NOT NULL,
    class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(), UNIQUE(school_id, grade, section)
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS class_subjects (
    id SERIAL PRIMARY KEY, class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    subject_name VARCHAR(100) NOT NULL, teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    periods_per_week INTEGER DEFAULT 4, created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY, teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    leave_type VARCHAR(50) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
    reason TEXT, status VARCHAR(20) DEFAULT 'pending', reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS timetable (
    id SERIAL PRIMARY KEY, teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL, period_number INTEGER, time_from VARCHAR(10),
    time_to VARCHAR(10), subject VARCHAR(100), grade VARCHAR(20), section VARCHAR(10),
    room VARCHAR(50), created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS class_timetable (
    id SERIAL PRIMARY KEY, class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL, period_number INTEGER NOT NULL,
    time_from VARCHAR(10), time_to VARCHAR(10), subject_name VARCHAR(100),
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    room VARCHAR(50), is_break BOOLEAN DEFAULT FALSE, break_label VARCHAR(50),
    is_manual BOOLEAN DEFAULT FALSE, source VARCHAR(20) DEFAULT 'auto',
    is_locked BOOLEAN DEFAULT FALSE, template_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    recipient_teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    recipient_student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    recipient_school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    sender_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, title VARCHAR(200), message TEXT,
    data JSONB, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW()
  )`)
  await exec(pool, `CREATE TABLE IF NOT EXISTS curriculum_assignments (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, curriculum_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(), UNIQUE(school_id, grade)
  )`)

  console.log('  Core tables created')

  console.log('\n── Phase 2: Column additions ────────────────────────')

  const alters = [
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS board VARCHAR(20)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS address TEXT`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_code VARCHAR(100)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_start_date DATE`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_end_date DATE`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_amount NUMERIC(10,2)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS grading_scheme JSONB DEFAULT '[]'`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS upi_id TEXT`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS staff_type VARCHAR(20) DEFAULT 'teaching'`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS teaches_grades TEXT`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email VARCHAR(255)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE students ALTER COLUMN roll_number TYPE VARCHAR(50)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`,
    `ALTER TABLE parents ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
    `ALTER TABLE parents ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE parents ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE`,
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_generated_at TIMESTAMPTZ`,
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_generated_by VARCHAR(50)`,
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_circulated_at TIMESTAMPTZ`,
    `ALTER TABLE classes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'`,
    `ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS reference_id INTEGER`,
  ]

  for (const sql of alters) {
    await exec(pool, sql)
  }
  console.log('  Column additions done')

  console.log('\n── Phase 3: Feature tables ──────────────────────────')

  await exec(pool, `CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    date DATE NOT NULL, session VARCHAR(20) DEFAULT 'morning',
    status VARCHAR(20) DEFAULT 'present',
    marked_by_teacher_id INTEGER REFERENCES teachers(id),
    marked_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, date, class_id, session)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL, subject VARCHAR(100) NOT NULL,
    task_type VARCHAR(20) NOT NULL DEFAULT 'homework', max_marks INTEGER NOT NULL DEFAULT 10,
    instructions TEXT, assigned_to VARCHAR(20) DEFAULT 'all', status VARCHAR(20) DEFAULT 'draft',
    due_date DATE, due_time TIME DEFAULT '23:59:00',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS task_submissions (
    id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ, submission_text TEXT, file_url VARCHAR(1000),
    file_name VARCHAR(255), file_public_id VARCHAR(255), file_size_kb INTEGER,
    score NUMERIC(5,2), feedback TEXT, status VARCHAR(20) DEFAULT 'pending',
    resubmission_requested BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMPTZ, reviewed_by INTEGER REFERENCES teachers(id),
    UNIQUE(task_id, student_id)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS task_reminders (
    id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    sent_by INTEGER NOT NULL REFERENCES teachers(id), sent_at TIMESTAMPTZ DEFAULT NOW(),
    target_type VARCHAR(20) DEFAULT 'all', student_count INTEGER DEFAULT 0,
    student_ids JSONB DEFAULT '[]'
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS doubts (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL, question TEXT NOT NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    ai_answer TEXT, teacher_answer TEXT,
    answered_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    answered_at TIMESTAMPTZ, status VARCHAR(20) DEFAULT 'open',
    last_message_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
    resolved_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    message_count INTEGER DEFAULT 0, is_class_faq BOOLEAN DEFAULT FALSE,
    faq_set_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    upvote_count INTEGER DEFAULT 0, closed_by_teacher BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS doubt_messages (
    id SERIAL PRIMARY KEY, doubt_id INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('student','teacher')),
    sender_id INTEGER NOT NULL, sender_name VARCHAR(100) NOT NULL,
    message TEXT NOT NULL, is_final_answer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS doubt_upvotes (
    id SERIAL PRIMARY KEY, doubt_id INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doubt_id, student_id)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS weekly_tests (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    week_start DATE NOT NULL, questions JSONB NOT NULL DEFAULT '[]',
    student_answers JSONB DEFAULT NULL, score INTEGER, max_score INTEGER,
    status VARCHAR(20) DEFAULT 'available', generated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ, UNIQUE(student_id, week_start)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS syllabus_topics (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL, chapter_name VARCHAR(200) NOT NULL,
    chapter_order INTEGER DEFAULT 0, topic_name VARCHAR(200) NOT NULL,
    topic_order INTEGER DEFAULT 0, status VARCHAR(20) DEFAULT 'pending',
    covered_date DATE, covered_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS exam_records (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES teachers(id),
    exam_name VARCHAR(200) NOT NULL, exam_type VARCHAR(50) NOT NULL DEFAULT 'unit_test',
    exam_date DATE, passing_pct INTEGER NOT NULL DEFAULT 35,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS exam_subjects (
    id SERIAL PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, subject_name VARCHAR(100) NOT NULL,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL, teacher_name VARCHAR(100),
    max_marks INTEGER NOT NULL DEFAULT 100, status VARCHAR(20) NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMPTZ, submitted_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    UNIQUE(exam_id, subject_name)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS exam_marks (
    id SERIAL PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_name VARCHAR(100) NOT NULL, marks_obtained NUMERIC(5,2),
    is_absent BOOLEAN NOT NULL DEFAULT FALSE, entered_by INTEGER REFERENCES teachers(id),
    entered_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(exam_id, student_id, subject_name)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS parent_mark_acks (
    id SERIAL PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, parent_name VARCHAR(100), parent_phone VARCHAR(20),
    acknowledged_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(exam_id, student_id)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS report_card_config (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    show_attendance BOOLEAN DEFAULT TRUE, show_rank BOOLEAN DEFAULT TRUE,
    show_remarks BOOLEAN DEFAULT TRUE, show_grade_points BOOLEAN DEFAULT TRUE,
    grading_scheme JSONB DEFAULT '[]', header_text TEXT DEFAULT 'Progress Report',
    footer_text TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS report_card_remarks (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    class_teacher_remark TEXT, conduct VARCHAR(30) DEFAULT 'Good',
    attendance_remark TEXT, next_term_advice TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(student_id, exam_id)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS fee_categories (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, description TEXT, frequency VARCHAR(20) NOT NULL DEFAULT 'annual',
    is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS fee_structures (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_category_id INTEGER NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    due_day INTEGER DEFAULT 10, academic_year VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, fee_category_id, grade, academic_year)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_fee_ledger (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_category_id INTEGER NOT NULL REFERENCES fee_categories(id),
    fee_structure_id INTEGER REFERENCES fee_structures(id),
    academic_year VARCHAR(10) NOT NULL, period_label VARCHAR(50),
    amount_due NUMERIC(10,2) NOT NULL DEFAULT 0, amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
    due_date DATE, status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_fee_category_assignments (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_category_id INTEGER NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
    assigned_by TEXT, assigned_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT, UNIQUE(student_id, fee_category_id)
  )`)

  await exec(pool, `CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1000`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS fee_payments (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    ledger_id INTEGER NOT NULL REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL, payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'completed',
    receipt_number VARCHAR(50) UNIQUE, transaction_ref VARCHAR(200),
    paid_date DATE NOT NULL DEFAULT CURRENT_DATE, collected_by_name VARCHAR(100),
    notes TEXT, verified_by TEXT, verified_at TIMESTAMPTZ, rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS fee_waivers (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    ledger_id INTEGER REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
    waiver_type VARCHAR(30) NOT NULL DEFAULT 'percentage',
    waiver_value NUMERIC(10,2) DEFAULT 0, waiver_amount NUMERIC(10,2) DEFAULT 0,
    reason TEXT NOT NULL, granted_by_name VARCHAR(100), created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS fee_structure_locks (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL, academic_year TEXT NOT NULL,
    locked_by TEXT NOT NULL, locked_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(school_id, academic_year)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS fee_structure_amendments (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL,
    fee_structure_id INTEGER REFERENCES fee_structures(id) ON DELETE SET NULL,
    fee_category_id INTEGER REFERENCES fee_categories(id) ON DELETE CASCADE,
    grade TEXT NOT NULL, academic_year TEXT NOT NULL,
    old_amount NUMERIC(10,2) NOT NULL, new_amount NUMERIC(10,2) NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE, reason TEXT NOT NULL,
    changed_by TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_fee_ledger_edits (
    id SERIAL PRIMARY KEY, ledger_id INTEGER NOT NULL REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
    old_amount NUMERIC(10,2) NOT NULL, new_amount NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL, changed_by TEXT NOT NULL, changed_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS academic_years (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    label VARCHAR(20) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, label)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_class_history (
    id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, section VARCHAR(10) NOT NULL,
    promoted_to_grade VARCHAR(20), promoted_at TIMESTAMPTZ, UNIQUE(student_id, academic_year_id)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS platform_audit_log (
    id SERIAL PRIMARY KEY, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(200), action VARCHAR(50) NOT NULL, entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER, entity_name VARCHAR(200), details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS plan_features (
    id SERIAL PRIMARY KEY, feature_key VARCHAR(50) NOT NULL, tier VARCHAR(20) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(feature_key, tier)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL, content TEXT NOT NULL,
    announcement_type VARCHAR(30) NOT NULL DEFAULT 'general',
    target_audience VARCHAR(20) NOT NULL DEFAULT 'all',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    created_by_name VARCHAR(100), expires_at DATE, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS school_calendar (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL, event_date DATE NOT NULL, end_date DATE,
    event_type VARCHAR(30) NOT NULL DEFAULT 'event', color VARCHAR(20) DEFAULT 'blue',
    description TEXT, all_day BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS timetable_versions (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL DEFAULT 'Draft', status VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_active BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(), circulated_at TIMESTAMPTZ
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS class_timetable_modes (
    id SERIAL PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL DEFAULT 'slave',
    master_source_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(class_id)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS school_schedule_settings (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    periods_per_day INTEGER NOT NULL DEFAULT 8, start_time VARCHAR(5) NOT NULL DEFAULT '08:30',
    end_time VARCHAR(5) NOT NULL DEFAULT '17:00', morning_break_after_period INTEGER NOT NULL DEFAULT 3,
    morning_break_duration INTEGER NOT NULL DEFAULT 15, lunch_after_period INTEGER NOT NULL DEFAULT 5,
    lunch_duration INTEGER NOT NULL DEFAULT 45, afternoon_break_after_period INTEGER NOT NULL DEFAULT 7,
    afternoon_break_duration INTEGER NOT NULL DEFAULT 10, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS schedule_templates (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, settings JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS substitute_assignments (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    leave_request_id INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE,
    original_teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    substitute_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL, day_of_week VARCHAR(10) NOT NULL, period_number INTEGER NOT NULL,
    subject_name VARCHAR(100), time_from VARCHAR(10), time_to VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(), UNIQUE(class_id, date, period_number)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS teacher_unavailability (
    id SERIAL PRIMARY KEY, teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL, period_number INTEGER NOT NULL,
    reason TEXT, created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(teacher_id, day_of_week, period_number)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS teacher_ai_sessions (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    context VARCHAR(100), messages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS display_tokens (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE, label VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(), last_used_at TIMESTAMPTZ
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS daily_newspapers (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    date DATE NOT NULL, title VARCHAR(255) NOT NULL, subtitle VARCHAR(255),
    content TEXT NOT NULL, fun_fact TEXT, quiz_question TEXT, quiz_answer TEXT,
    topic VARCHAR(100), category VARCHAR(50), created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, date)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_newspaper_reads (
    id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    newspaper_id INTEGER NOT NULL REFERENCES daily_newspapers(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, completed_at TIMESTAMPTZ DEFAULT NOW(),
    points_awarded INTEGER DEFAULT 0, UNIQUE(student_id, newspaper_id)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_points (
    id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, action_type VARCHAR(50) NOT NULL,
    points INTEGER NOT NULL DEFAULT 0, points_type VARCHAR(20) DEFAULT 'academic',
    reference_id INTEGER, reference_type VARCHAR(50), earned_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_badges (
    id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, badge_type VARCHAR(50) NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(student_id, badge_type)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_streaks (
    student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0, last_activity_date DATE
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS marketplace_items (
    id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, description TEXT,
    emoji VARCHAR(10) DEFAULT '🎁', cost_points INTEGER NOT NULL,
    active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS marketplace_orders (
    id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, item_id INTEGER REFERENCES marketplace_items(id),
    item_name VARCHAR(100), item_emoji VARCHAR(10), points_spent INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', student_name VARCHAR(255),
    grade VARCHAR(20), section VARCHAR(10),
    ordered_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS hub_daily_content (
    id SERIAL PRIMARY KEY, content_date DATE UNIQUE NOT NULL,
    gk_questions JSONB, word_of_day JSONB, riddle JSONB,
    fact_myth_questions JSONB, debate_statement JSONB, challenge_problem JSONB,
    reading_passage JSONB, writing_prompt JSONB, speaking_sentences JSONB,
    generated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_hub_completions (
    id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, activity_type VARCHAR(50) NOT NULL,
    completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    score INTEGER DEFAULT 0, points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(student_id, activity_type, completed_date)
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS ai_chat_sessions (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject VARCHAR(100), messages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_portal_sessions (
    id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ, duration_minutes INTEGER
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS student_portal_activity (
    id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL,
    session_id INTEGER REFERENCES student_portal_sessions(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, action_detail VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS school_subject_templates (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, from_grade INTEGER NOT NULL DEFAULT 1,
    to_grade INTEGER NOT NULL DEFAULT 12, subjects JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)

  await exec(pool, `CREATE TABLE IF NOT EXISTS department_hods (
    id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL, assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by TEXT, UNIQUE(school_id, department)
  )`)

  console.log('  Feature tables created')

  console.log('\n── Phase 4: Indexes ─────────────────────────────────')

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_students_school_grade ON students(school_id, grade, section)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_school_class ON tasks(school_id, class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_doubts_school_student ON doubts(school_id, student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_ledger_school_student ON student_fee_ledger(school_id, student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_weekly_tests_student ON weekly_tests(student_id, week_start)`,
    `CREATE INDEX IF NOT EXISTS idx_submissions_task_student ON task_submissions(task_id, student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(recipient_student_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_teachers_employee_id ON teachers(employee_id, school_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS parents_email_unique ON parents(email) WHERE email IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS attendance_session_unique ON attendance(student_id, date, class_id, session)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_syllabus_unique_topic ON syllabus_topics(class_id, subject, chapter_name, topic_name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_student_fee_ledger_entry ON student_fee_ledger(student_id, fee_category_id, academic_year, period_label)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS class_subjects_class_subject_key ON class_subjects(class_id, subject_name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_timetable_slot ON class_timetable(class_id, day_of_week, period_number, COALESCE(template_id, 0))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_timetable_teacher_slot ON timetable(teacher_id, school_id, day_of_week, period_number)`,
    `CREATE INDEX IF NOT EXISTS idx_syllabus_class ON syllabus_topics(class_id, school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_doubts_class ON doubts(class_id, school_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON platform_audit_log(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_schools_deleted ON schools(deleted_at) WHERE deleted_at IS NOT NULL`,
  ]

  for (const sql of indexes) {
    await exec(pool, sql)
  }

  console.log('  Indexes created')

  console.log('\n── Phase 5: Seed data ───────────────────────────────')

  await exec(pool, `INSERT INTO marketplace_items (name, description, emoji, cost_points) VALUES
    ('Eraser', 'Good quality rubber eraser', '🔲', 100),
    ('Pen', 'Ball point pen', '🖊️', 200),
    ('Notebook', 'A4 ruled notebook (100 pages)', '📔', 500),
    ('Pencil Box', 'Coloured pencils set with box', '🎨', 750),
    ('Geometry Box', 'Complete geometry instruments set', '📐', 1000)
    ON CONFLICT (name) DO NOTHING`)

  console.log('  Seed data inserted')

  console.log('\n── Phase 6: Mark bootstrap complete ─────────────────')

  await pool.query(`INSERT INTO app_bootstrap_state (key) VALUES ('initial_schema_bootstrap') ON CONFLICT DO NOTHING`)

  console.log('  Bootstrap marker set')
  console.log('\n✓ Schema bootstrap complete!\n')
  await pool.end()
}

bootstrap().catch(e => { console.error('✗ Bootstrap failed:', e); process.exit(1) })
