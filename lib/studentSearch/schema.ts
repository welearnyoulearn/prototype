// Schema for Student Search (#538). Kept in its own file and called from the bottom of runIncrementalMigrations()
// in lib/db.ts. Every statement is idempotent.
import type { Pool } from 'pg'

type Db = Pick<Pool, 'query'>

export async function ensureStudentSearchSchema(db: Db): Promise<void> {
  await db.query(`
    -- Every consent decision a parent makes is kept (proof of consent). The newest row for a student is the one in force.
    CREATE TABLE IF NOT EXISTS student_search_consents (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES parents(id) ON DELETE SET NULL,
      granted BOOLEAN NOT NULL,
      notice_version VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_search_consents_student ON student_search_consents (student_id, id DESC);

    -- What a student searched. Only the words (never results), kept 30 days.
    CREATE TABLE IF NOT EXISTS student_searches (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      query VARCHAR(200) NOT NULL,
      flag VARCHAR(10) CHECK (flag IN ('support', 'adult', 'danger', 'gambling', 'personal')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_student_searches_student ON student_searches (student_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_student_searches_age ON student_searches (created_at);

    -- OFF at every tier until a platform admin switches it on.
    INSERT INTO plan_features (feature_key, tier, enabled)
    VALUES ('student-search', 'basic', false), ('student-search', 'standard', false), ('student-search', 'premium', false)
    ON CONFLICT (feature_key, tier) DO NOTHING;
  `)
}
