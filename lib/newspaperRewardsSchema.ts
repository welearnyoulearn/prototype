// Schema for the Daily Newspaper and the Rewards Marketplace. Kept in its own file and called from the bottom of
// runIncrementalMigrations() in lib/db.ts, so the two features touch db.ts in one line.
//
// Every statement is idempotent. The old tables daily_newspapers, student_newspaper_reads, hub_* and marketplace_*
// are left exactly as they are and are not used.
import type { Pool } from 'pg'
import { STARTER_ITEMS } from './rewardRules'
import { GRADE_BANDS } from './newspaperBands'

type Db = Pick<Pool, 'query'>

const BAND_LIST = GRADE_BANDS.map(b => `'${b}'`).join(', ')

export async function ensureNewspaperRewardsSchema(db: Db): Promise<void> {
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

    -- ── Rewards Marketplace ───────────────────────────────────────────────────────
    -- One catalog for the whole platform, edited by WLYL. unit_cost_paise is WLYL-only and never shown.
    CREATE TABLE IF NOT EXISTS reward_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      emoji VARCHAR(16) NOT NULL DEFAULT '🎁',
      points_cost INTEGER NOT NULL CHECK (points_cost > 0),
      unit_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_items_name ON reward_items (LOWER(name));

    -- A delivery run is one month's orders. At most one run is open at a time.
    CREATE TABLE IF NOT EXISTS reward_runs (
      id SERIAL PRIMARY KEY,
      label VARCHAR(60) NOT NULL,
      cutoff_at TIMESTAMPTZ NOT NULL,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_runs_one_open ON reward_runs ((TRUE)) WHERE closed_at IS NULL;

    -- Item, price and student details are copied onto the order, so a later edit never changes history.
    CREATE TABLE IF NOT EXISTS reward_orders (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES reward_runs(id),
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      placed_by VARCHAR(10) NOT NULL CHECK (placed_by IN ('student', 'parent')),
      item_id INTEGER NOT NULL REFERENCES reward_items(id),
      item_name VARCHAR(80) NOT NULL,
      item_emoji VARCHAR(16),
      points_cost INTEGER NOT NULL CHECK (points_cost > 0),
      unit_cost_paise INTEGER NOT NULL DEFAULT 0,
      student_name VARCHAR(255) NOT NULL,
      student_grade VARCHAR(20),
      student_section VARCHAR(10),
      student_roll INTEGER,
      status VARCHAR(12) NOT NULL DEFAULT 'placed'
        CHECK (status IN ('placed', 'sent', 'at_school', 'delivered', 'cancelled', 'refunded')),
      placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      arrived_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      delivered_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reward_orders_run_school ON reward_orders (run_id, school_id, status);
    CREATE INDEX IF NOT EXISTS idx_reward_orders_student ON reward_orders (student_id, placed_at);

    -- ── Points ledger: each newspaper award and each order's spend/refund is written once ──
    CREATE UNIQUE INDEX IF NOT EXISTS uq_student_points_news
      ON student_points (student_id, action_type, reference_type, reference_id)
      WHERE reference_type = 'news_edition';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_student_points_market
      ON student_points (student_id, action_type, reference_type, reference_id)
      WHERE reference_type = 'marketplace_order';

    -- Both features are OFF at every tier until a platform admin switches them on for the pilot schools.
    INSERT INTO plan_features (feature_key, tier, enabled)
    VALUES
      ('daily-newspaper',     'basic', false), ('daily-newspaper',     'standard', false), ('daily-newspaper',     'premium', false),
      ('rewards-marketplace', 'basic', false), ('rewards-marketplace', 'standard', false), ('rewards-marketplace', 'premium', false)
    ON CONFLICT (feature_key, tier) DO NOTHING;
  `)

  // The starter catalog is added once. After that WLYL owns it: a renamed, repriced or switched-off item is
  // never put back, even though this runs again every time SCHEMA_VERSION is bumped.
  const { rowCount } = await db.query(
    `INSERT INTO app_bootstrap_state (key) VALUES ('reward_items_seeded') ON CONFLICT (key) DO NOTHING`,
  )
  if ((rowCount ?? 0) > 0) {
    for (const item of STARTER_ITEMS) {
      await db.query(
        `INSERT INTO reward_items (name, emoji, points_cost, unit_cost_paise, sort_order)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [item.name, item.emoji, item.pointsCost, item.unitCostPaise, item.sortOrder],
      )
    }
  }
}
