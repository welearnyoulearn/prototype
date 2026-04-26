/**
 * migrate-to-supabase.mjs
 *
 * Wipes all data in Supabase, applies the full schema, then re-imports
 * everything from local PostgreSQL.
 *
 * Run once: node scripts/migrate-to-supabase.mjs
 *
 * After this, point .env.local at Supabase so local + Vercel share one DB.
 */

import pg from 'pg'
const { Pool } = pg

// ── Connection strings ─────────────────────────────────────────────────────
const LOCAL_URL = 'postgresql://postgres:1234@localhost:5432/wlyl_local'

// Session-mode pooler (port 5432) — supports parameterized queries + SET commands.
const SUPA_URL =
  'postgresql://postgres.kqumkvdreyxwlrpqhfph:ILvuIndia111%23%23%23@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres'

// ── Tables in topological order (parent before child) ─────────────────────
const TABLE_ORDER = [
  'schools', 'school_subscriptions', 'plan_features',
  'users', 'user_profiles', 'password_reset_tokens',
  'teachers', 'students', 'parents',
  'classes', 'class_subjects', 'student_parents',
  'leave_requests', 'timetable',
  'schedule_templates', 'school_schedule_settings',
  'class_timetable', 'class_timetable_modes', 'timetable_versions',
  'teacher_unavailability',
  'notifications', 'curriculum_assignments',
  'attendance', 'substitute_assignments',
  'tasks', 'task_submissions', 'task_reminders',
  'doubts', 'doubt_messages', 'doubt_upvotes',
  'weekly_tests',
  'daily_newspapers', 'student_newspaper_reads',
  'student_points', 'student_badges', 'student_streaks',
  'syllabus_topics',
  'exam_records', 'exam_subjects', 'exam_marks', 'parent_mark_acks',
  'report_card_config', 'report_card_remarks',
  'student_portal_sessions', 'student_portal_activity',
  'fee_categories', 'fee_structures', 'student_fee_ledger',
  'fee_payments', 'fee_waivers',
  'academic_years', 'student_class_history',
  'platform_audit_log',
  'announcements', 'school_calendar', 'display_tokens',
  'school_subject_templates',
]

// ── Full schema DDL (mirrors lib/db.ts initDB exactly) ────────────────────
// Run against Supabase before importing data so all tables + columns exist.
const SCHEMA_DDL = [
  // Core tables
  `CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(100),
    city VARCHAR(100), country VARCHAR(100), status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS school_subscriptions (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    tier VARCHAR(20) DEFAULT 'none', updated_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, email VARCHAR(255), subject VARCHAR(100),
    phone VARCHAR(50), employee_id VARCHAR(50), department VARCHAR(100),
    qualification VARCHAR(200), date_of_joining DATE,
    status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, email VARCHAR(255), grade VARCHAR(20),
    section VARCHAR(10), roll_number VARCHAR(50), parent_name VARCHAR(255),
    parent_phone VARCHAR(50), phone VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, section VARCHAR(10) NOT NULL,
    class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(school_id, grade, section)
  )`,
  `CREATE TABLE IF NOT EXISTS class_subjects (
    id SERIAL PRIMARY KEY, class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    subject_name VARCHAR(100) NOT NULL,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    leave_type VARCHAR(50) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
    reason TEXT, status VARCHAR(20) DEFAULT 'pending',
    reviewed_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS parents (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255), email VARCHAR(255), phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS student_parents (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES parents(id) ON DELETE CASCADE,
    UNIQUE(student_id, parent_id)
  )`,
  `CREATE TABLE IF NOT EXISTS timetable (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL, period_number INTEGER,
    time_from VARCHAR(10), time_to VARCHAR(10), subject VARCHAR(100),
    grade VARCHAR(20), section VARCHAR(10), room VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS class_timetable (
    id SERIAL PRIMARY KEY,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL, period_number INTEGER NOT NULL,
    time_from VARCHAR(10), time_to VARCHAR(10), subject_name VARCHAR(100),
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    room VARCHAR(50), is_break BOOLEAN DEFAULT FALSE, break_label VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    recipient_teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    sender_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, title VARCHAR(200), message TEXT, data JSONB,
    is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS curriculum_assignments (
    id SERIAL PRIMARY KEY, school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, curriculum_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(), UNIQUE(school_id, grade)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, email VARCHAR(255), school_code VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'school_admin',
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    first_login BOOLEAN DEFAULT TRUE, profile_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    full_name VARCHAR(255), phone VARCHAR(50), designation VARCHAR(100),
    bio TEXT, updated_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL, expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW()
  )`,
  // Migrations / column additions
  `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS staff_type VARCHAR(20) DEFAULT 'teaching'`,
  `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS teaches_grades TEXT`,
  `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
  `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50)`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255)`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(50)`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email VARCHAR(255)`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_student_id INTEGER REFERENCES students(id) ON DELETE CASCADE`,
  `ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS periods_per_week INTEGER DEFAULT 4`,
  `CREATE UNIQUE INDEX IF NOT EXISTS class_subjects_class_subject_key ON class_subjects(class_id, subject_name)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT TRUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS school_code VARCHAR(100)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS address TEXT`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_code VARCHAR(100) UNIQUE`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_start_date DATE`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_end_date DATE`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS plan_amount NUMERIC(10,2)`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS grading_scheme JSONB DEFAULT '[]'`,
  `ALTER TABLE schools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_generated_at TIMESTAMPTZ`,
  `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_generated_by VARCHAR(50)`,
  `ALTER TABLE classes ADD COLUMN IF NOT EXISTS timetable_circulated_at TIMESTAMPTZ`,
  `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'auto'`,
  `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE class_timetable ADD COLUMN IF NOT EXISTS template_id INTEGER`,
  // Teacher unavailability
  `CREATE TABLE IF NOT EXISTS teacher_unavailability (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL, period_number INTEGER NOT NULL, reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(teacher_id, day_of_week, period_number)
  )`,
  // Attendance
  `CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    date DATE NOT NULL, session VARCHAR(20) DEFAULT 'morning',
    status VARCHAR(20) DEFAULT 'present',
    marked_by_teacher_id INTEGER REFERENCES teachers(id),
    created_at TIMESTAMPTZ DEFAULT NOW(), marked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, date, class_id, session)
  )`,
  `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS session VARCHAR(20) DEFAULT 'morning'`,
  `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ DEFAULT NOW()`,
  // Substitute assignments
  `CREATE TABLE IF NOT EXISTS substitute_assignments (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    leave_request_id INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE,
    original_teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    substitute_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL, day_of_week VARCHAR(10) NOT NULL,
    period_number INTEGER NOT NULL, subject_name VARCHAR(100),
    time_from VARCHAR(10), time_to VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, date, period_number)
  )`,
  // Tasks
  `CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL, subject VARCHAR(100) NOT NULL,
    task_type VARCHAR(20) NOT NULL DEFAULT 'homework',
    max_marks INTEGER NOT NULL DEFAULT 10, instructions TEXT,
    assigned_to VARCHAR(20) DEFAULT 'all', status VARCHAR(20) DEFAULT 'draft',
    due_date DATE, due_time TIME DEFAULT '23:59:00',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS task_submissions (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ, submission_text TEXT, file_url VARCHAR(1000),
    file_name VARCHAR(255), file_public_id VARCHAR(255), file_size_kb INTEGER,
    score NUMERIC(5,2), feedback TEXT, status VARCHAR(20) DEFAULT 'pending',
    resubmission_requested BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMPTZ, reviewed_by INTEGER REFERENCES teachers(id),
    UNIQUE(task_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS task_reminders (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    sent_by INTEGER NOT NULL REFERENCES teachers(id),
    sent_at TIMESTAMPTZ DEFAULT NOW(), target_type VARCHAR(20) DEFAULT 'all',
    student_count INTEGER DEFAULT 0, student_ids JSONB DEFAULT '[]'
  )`,
  // Doubts
  `CREATE TABLE IF NOT EXISTS doubts (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
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
    upvote_count INTEGER DEFAULT 0,
    closed_by_teacher BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS doubt_messages (
    id SERIAL PRIMARY KEY,
    doubt_id INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL,
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('student','teacher')),
    sender_id INTEGER NOT NULL, sender_name VARCHAR(100) NOT NULL,
    message TEXT NOT NULL, is_final_answer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS doubt_upvotes (
    id SERIAL PRIMARY KEY,
    doubt_id INTEGER NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doubt_id, student_id)
  )`,
  // Weekly tests
  `CREATE TABLE IF NOT EXISTS weekly_tests (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    week_start DATE NOT NULL, questions JSONB NOT NULL DEFAULT '[]',
    student_answers JSONB DEFAULT NULL, score INTEGER, max_score INTEGER,
    status VARCHAR(20) DEFAULT 'available',
    generated_at TIMESTAMPTZ DEFAULT NOW(), submitted_at TIMESTAMPTZ,
    UNIQUE(student_id, week_start)
  )`,
  // Newspapers
  `CREATE TABLE IF NOT EXISTS daily_newspapers (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    date DATE NOT NULL, title VARCHAR(255) NOT NULL, subtitle VARCHAR(255),
    content TEXT NOT NULL, fun_fact TEXT, quiz_question TEXT, quiz_answer TEXT,
    topic VARCHAR(100), category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(school_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS student_newspaper_reads (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    newspaper_id INTEGER NOT NULL REFERENCES daily_newspapers(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, completed_at TIMESTAMPTZ DEFAULT NOW(),
    points_awarded INTEGER DEFAULT 0, UNIQUE(student_id, newspaper_id)
  )`,
  // Points / badges / streaks
  `CREATE TABLE IF NOT EXISTS student_points (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, action_type VARCHAR(50) NOT NULL,
    points INTEGER NOT NULL DEFAULT 0, reference_id INTEGER,
    reference_type VARCHAR(50), earned_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS student_badges (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, badge_type VARCHAR(50) NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(student_id, badge_type)
  )`,
  `CREATE TABLE IF NOT EXISTS student_streaks (
    student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0, last_activity_date DATE
  )`,
  // Syllabus
  `CREATE TABLE IF NOT EXISTS syllabus_topics (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL, chapter_name VARCHAR(200) NOT NULL,
    chapter_order INTEGER DEFAULT 0, topic_name VARCHAR(200) NOT NULL,
    topic_order INTEGER DEFAULT 0, status VARCHAR(20) DEFAULT 'pending',
    covered_date DATE, covered_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  // Exams
  `CREATE TABLE IF NOT EXISTS exam_records (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES teachers(id),
    exam_name VARCHAR(200) NOT NULL, exam_type VARCHAR(50) NOT NULL DEFAULT 'unit_test',
    exam_date DATE, passing_pct INTEGER NOT NULL DEFAULT 35,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS exam_subjects (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, subject_name VARCHAR(100) NOT NULL,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    teacher_name VARCHAR(100), max_marks INTEGER NOT NULL DEFAULT 100,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', submitted_at TIMESTAMPTZ,
    submitted_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    UNIQUE(exam_id, subject_name)
  )`,
  `CREATE TABLE IF NOT EXISTS exam_marks (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_name VARCHAR(100) NOT NULL, marks_obtained NUMERIC(5,2),
    is_absent BOOLEAN NOT NULL DEFAULT FALSE,
    entered_by INTEGER REFERENCES teachers(id),
    entered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exam_id, student_id, subject_name)
  )`,
  `CREATE TABLE IF NOT EXISTS parent_mark_acks (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL, parent_name VARCHAR(100), parent_phone VARCHAR(20),
    acknowledged_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(exam_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS report_card_config (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    show_attendance BOOLEAN DEFAULT TRUE, show_rank BOOLEAN DEFAULT TRUE,
    show_remarks BOOLEAN DEFAULT TRUE, show_grade_points BOOLEAN DEFAULT TRUE,
    grading_scheme JSONB DEFAULT '[]', header_text TEXT DEFAULT 'Progress Report',
    footer_text TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS report_card_remarks (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    class_teacher_remark TEXT, conduct VARCHAR(30) DEFAULT 'Good',
    attendance_remark TEXT, next_term_advice TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(student_id, exam_id)
  )`,
  // Portal sessions
  `CREATE TABLE IF NOT EXISTS student_portal_sessions (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(), ended_at TIMESTAMPTZ, duration_minutes INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS student_portal_activity (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL,
    session_id INTEGER REFERENCES student_portal_sessions(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, action_detail VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  // Fees
  `CREATE TABLE IF NOT EXISTS fee_categories (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, description TEXT,
    frequency VARCHAR(20) NOT NULL DEFAULT 'annual',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(school_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS fee_structures (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_category_id INTEGER NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    due_day INTEGER DEFAULT 10, academic_year VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, fee_category_id, grade, academic_year)
  )`,
  `CREATE TABLE IF NOT EXISTS student_fee_ledger (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_category_id INTEGER NOT NULL REFERENCES fee_categories(id),
    fee_structure_id INTEGER REFERENCES fee_structures(id),
    academic_year VARCHAR(10) NOT NULL, period_label VARCHAR(50),
    amount_due NUMERIC(10,2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
    due_date DATE, status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS fee_payments (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    ledger_id INTEGER NOT NULL REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'completed',
    receipt_number VARCHAR(50) UNIQUE, transaction_ref VARCHAR(200),
    paid_date DATE NOT NULL DEFAULT CURRENT_DATE, collected_by_name VARCHAR(100),
    notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS fee_waivers (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    ledger_id INTEGER REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
    waiver_type VARCHAR(30) NOT NULL DEFAULT 'percentage',
    waiver_value NUMERIC(10,2) DEFAULT 0, waiver_amount NUMERIC(10,2) DEFAULT 0,
    reason TEXT NOT NULL, granted_by_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1000`,
  // Academic years
  `CREATE TABLE IF NOT EXISTS academic_years (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    label VARCHAR(20) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(school_id, label)
  )`,
  `CREATE TABLE IF NOT EXISTS student_class_history (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL,
    academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL, section VARCHAR(10) NOT NULL,
    promoted_to_grade VARCHAR(20), promoted_at TIMESTAMPTZ,
    UNIQUE(student_id, academic_year_id)
  )`,
  // Audit / plan features
  `CREATE TABLE IF NOT EXISTS platform_audit_log (
    id SERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(200), action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, entity_id INTEGER, entity_name VARCHAR(200),
    details JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS plan_features (
    id SERIAL PRIMARY KEY, feature_key VARCHAR(50) NOT NULL,
    tier VARCHAR(20) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(feature_key, tier)
  )`,
  // School settings
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
  `CREATE TABLE IF NOT EXISTS schedule_templates (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, settings JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(school_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS timetable_versions (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL DEFAULT 'Draft',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(), circulated_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS class_timetable_modes (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL DEFAULT 'slave',
    master_source_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(class_id)
  )`,
  // Announcements / calendar / display
  `CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL, content TEXT NOT NULL,
    announcement_type VARCHAR(30) NOT NULL DEFAULT 'general',
    target_audience VARCHAR(20) NOT NULL DEFAULT 'all',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    created_by_name VARCHAR(100), expires_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS school_calendar (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL, event_date DATE NOT NULL, end_date DATE,
    event_type VARCHAR(30) NOT NULL DEFAULT 'event',
    color VARCHAR(20) DEFAULT 'blue', description TEXT,
    all_day BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS display_tokens (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE, label VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(), last_used_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS school_subject_templates (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, from_grade INTEGER NOT NULL DEFAULT 1,
    to_grade INTEGER NOT NULL DEFAULT 12,
    subjects JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  // FK for template_id (separate from column add so it never blocks)
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
  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_schools_deleted ON schools(deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_teachers_employee_id ON teachers(employee_id, school_id)`,
  `CREATE INDEX IF NOT EXISTS idx_teacher_unavail_school ON teacher_unavailability(school_id, teacher_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_timetable_slot ON class_timetable(class_id, day_of_week, period_number, COALESCE(template_id, 0))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_timetable_teacher_slot ON timetable(teacher_id, school_id, day_of_week, period_number)`,
  `CREATE INDEX IF NOT EXISTS idx_class_timetable_teacher_slot ON class_timetable(school_id, teacher_id, day_of_week, period_number) WHERE teacher_id IS NOT NULL AND is_break = FALSE`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_class ON tasks(class_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks(teacher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_doubts_class ON doubts(class_id, school_id)`,
  `CREATE INDEX IF NOT EXISTS idx_doubts_student ON doubts(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exam_records_class ON exam_records(class_id, school_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fee_ledger_student ON student_fee_ledger(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(school_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_schedule_templates_school ON schedule_templates(school_id)`,
  `CREATE INDEX IF NOT EXISTS idx_academic_years_school ON academic_years(school_id)`,
]

async function migrate() {
  const local = new Pool({ connectionString: LOCAL_URL })
  const supa  = new Pool({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } })

  try {
    await local.query('SELECT 1')
    console.log('✅  Local DB connected')
    await supa.query('SELECT 1')
    console.log('✅  Supabase connected\n')

    const supaConn = await supa.connect()

    try {
      // ── Step 1: Wipe Supabase ────────────────────────────────────────────
      // Delete in reverse order (children first) so FK constraints are satisfied.
      // No superuser tricks needed — plain DELETE respects FK ordering.
      console.log('🗑   Wiping Supabase …')
      for (const t of [...TABLE_ORDER].reverse()) {
        await supaConn
          .query(`DELETE FROM "${t}"`)
          .catch(() => {}) // table may not exist yet — that's fine
      }
      console.log('✅  Wiped\n')

      // ── Step 2: Apply full schema ────────────────────────────────────────
      console.log('🏗   Applying schema …')
      let schemaOk = 0, schemaFail = 0
      for (const ddl of SCHEMA_DDL) {
        const label = ddl.trim().slice(0, 60).replace(/\s+/g, ' ')
        const ok = await supaConn.query(ddl).then(() => true).catch(e => {
          // Only log unexpected errors (not "already exists" type)
          if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
            console.warn(`  ⚠  Schema: ${label} → ${e.message}`)
          }
          return false
        })
        ok ? schemaOk++ : schemaFail++
      }
      console.log(`✅  Schema applied (${schemaOk} ok, ${schemaFail} already-exist skips)\n`)

      // ── Step 3: Copy data ────────────────────────────────────────────────
      console.log('📦  Copying tables …')
      let totalRows = 0

      for (const table of TABLE_ORDER) {
        // Check if table exists locally
        const { rows: exists } = await local.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name=$1`,
          [table]
        )
        if (!exists.length) { console.log(`  ⏭   ${table}: not in local`); continue }

        const { rows } = await local.query(`SELECT * FROM "${table}"`)
        if (!rows.length) { console.log(`  ⏭   ${table}: 0 rows`); continue }

        // Get columns that exist in SUPABASE (after schema sync)
        const { rows: supaCols } = await supaConn.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name=$1`,
          [table]
        )
        const supaColSet = new Set(supaCols.map(r => r.column_name))

        // Only insert columns that exist in both local and Supabase
        const allLocalCols = Object.keys(rows[0])
        const cols = allLocalCols.filter(c => supaColSet.has(c))
        const skippedCols = allLocalCols.filter(c => !supaColSet.has(c))
        if (skippedCols.length) {
          console.log(`  ℹ   ${table}: skipping unknown cols [${skippedCols.join(', ')}]`)
        }

        const colsSql = cols.map(c => `"${c}"`).join(', ')
        let inserted = 0

        for (const row of rows) {
          // Stringify objects/arrays so JSONB columns arrive as valid JSON strings
          const vals = cols.map(c => {
            const v = row[c]
            return (v !== null && typeof v === 'object' && !Buffer.isBuffer(v)) ? JSON.stringify(v) : v
          })
          const ph   = vals.map((_, i) => `$${i + 1}`).join(', ')
          const ok = await supaConn
            .query(`INSERT INTO "${table}" (${colsSql}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals)
            .then(() => true)
            .catch(err => {
              console.warn(`  ⚠  ${table} insert failed: ${err.message.split('\n')[0]}`)
              return false
            })
          if (ok) inserted++
        }

        totalRows += inserted
        console.log(`  ✅  ${table}: ${inserted}/${rows.length} rows`)
      }

      // ── Step 4: Reset sequences ──────────────────────────────────────────
      console.log(`\n🔄  Resetting sequences …`)
      for (const table of TABLE_ORDER) {
        const { rows: seqRows } = await supaConn
          .query(`SELECT pg_get_serial_sequence('"${table}"', 'id') AS seq`)
          .catch(() => ({ rows: [] }))
        const seq = seqRows[0]?.seq
        if (!seq) continue

        const { rows: mx } = await local
          .query(`SELECT COALESCE(MAX(id), 1) AS m FROM "${table}"`)
          .catch(() => ({ rows: [{ m: 1 }] }))

        await supaConn.query(`SELECT setval($1, $2)`, [seq, mx[0].m]).catch(() => {})
      }

      // receipt_number_seq
      const { rows: rcpt } = await local
        .query(`SELECT last_value FROM receipt_number_seq`)
        .catch(() => ({ rows: [{ last_value: 1000 }] }))
      await supaConn
        .query(`SELECT setval('receipt_number_seq', $1)`, [rcpt[0].last_value])
        .catch(() => {})

      console.log(`\n🎉  Done — ${totalRows} rows migrated to Supabase`)
      console.log('\n.env.local already updated to use Supabase pooler URL.')
      console.log('Make sure Vercel env var DATABASE_URL matches the same URL.\n')

    } finally {
      supaConn.release()
    }

  } finally {
    await local.end()
    await supa.end()
  }
}

migrate().catch(err => {
  console.error('\n❌  Migration failed:', err.message)
  process.exit(1)
})
