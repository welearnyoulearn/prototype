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
  ]

  for (const sql of migrations) {
    await pool.query(sql).catch(() => { /* column already exists */ })
  }
}
