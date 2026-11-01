// Schema for the Daily Newspaper. Kept in its own file and called from the bottom of runIncrementalMigrations() in
// lib/db.ts, so the feature touches db.ts in one line.
//
// Every statement is idempotent. The old tables daily_newspapers and student_newspaper_reads are left exactly as they
// are and are not used.
import type { Pool } from 'pg'
import { GRADE_BANDS } from './newspaperBands'

type Db = Pick<Pool, 'query'>

const BAND_LIST = GRADE_BANDS.map(b => `'${b}'`).join(', ')

export async function ensureNewspaperSchema(db: Db): Promise<void> {
  await db.query(`
    -- ── Daily Newspaper ───────────────────────────────────────────────────────────
    -- One edition per grade band per day, shared by every school.
    CREATE TABLE IF NOT EXISTS news_editions (
      id SERIAL PRIMARY KEY,
      edition_date DATE NOT NULL,
      grade_band VARCHAR(10) NOT NULL CHECK (grade_band IN (${BAND_LIST})),
      status VARCHAR(10) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'pulled')),
      source_mode VARCHAR(10) NOT NULL DEFAULT 'live' CHECK (source_mode IN ('live', 'bank')),
      notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (edition_date, grade_band)
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id SERIAL PRIMARY KEY,
      edition_id INTEGER NOT NULL REFERENCES news_editions(id) ON DELETE CASCADE,
      position SMALLINT NOT NULL,
      category VARCHAR(40) NOT NULL,
      headline VARCHAR(200) NOT NULL,
      note TEXT NOT NULL,
      why_it_matters TEXT,
      try_it TEXT,
      source_name VARCHAR(120),
      source_url TEXT,
      status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pulled')),
      UNIQUE (edition_id, position)
    );

    -- One question per note. The correct answer is stored here and never sent to the browser before submit.
    CREATE TABLE IF NOT EXISTS news_questions (
      id SERIAL PRIMARY KEY,
      edition_id INTEGER NOT NULL REFERENCES news_editions(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
      stem TEXT NOT NULL,
      options JSONB NOT NULL,
      correct_index SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
      explanation TEXT,
      UNIQUE (item_id)
    );

    CREATE TABLE IF NOT EXISTS news_attempts (
      id SERIAL PRIMARY KEY,
      edition_id INTEGER NOT NULL REFERENCES news_editions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      question_id INTEGER REFERENCES news_questions(id) ON DELETE SET NULL,
      opened_at TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      answered_at TIMESTAMPTZ,
      selected_index SMALLINT CHECK (selected_index BETWEEN 0 AND 3),
      is_correct BOOLEAN,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      UNIQUE (edition_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_news_attempts_student ON news_attempts (student_id);
    CREATE INDEX IF NOT EXISTS idx_news_attempts_school ON news_attempts (school_id, edition_id);

    -- ── Points ledger: each newspaper award is written once per child per edition ──
    CREATE UNIQUE INDEX IF NOT EXISTS uq_student_points_news
      ON student_points (student_id, action_type, reference_type, reference_id)
      WHERE reference_type = 'news_edition';

    -- OFF at every tier until a platform admin switches it on for the pilot schools.
    INSERT INTO plan_features (feature_key, tier, enabled)
    VALUES ('daily-newspaper', 'basic', false), ('daily-newspaper', 'standard', false), ('daily-newspaper', 'premium', false)
    ON CONFLICT (feature_key, tier) DO NOTHING;
  `)
}
