import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function main() {
  const pg = await import('pg')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  const queries = [
    // ── Global Master Curriculum tables ────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS master_subjects (
      id SERIAL PRIMARY KEY,
      board VARCHAR(50) NOT NULL,
      grade VARCHAR(20) NOT NULL,
      subject_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(board, grade, subject_name)
    )`,

    `CREATE TABLE IF NOT EXISTS master_chapters (
      id SERIAL PRIMARY KEY,
      subject_id INTEGER NOT NULL REFERENCES master_subjects(id) ON DELETE CASCADE,
      chapter_name VARCHAR(200) NOT NULL,
      chapter_order INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_master_chapters_subject ON master_chapters(subject_id)`,

    `CREATE TABLE IF NOT EXISTS master_topics (
      id SERIAL PRIMARY KEY,
      chapter_id INTEGER NOT NULL REFERENCES master_chapters(id) ON DELETE CASCADE,
      topic_name VARCHAR(200) NOT NULL,
      topic_order INTEGER NOT NULL DEFAULT 0,
      content_text TEXT,
      content_pdf_url VARCHAR(512),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_master_topics_chapter ON master_topics(chapter_id)`,

    `CREATE TABLE IF NOT EXISTS master_resources (
      id SERIAL PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES master_topics(id) ON DELETE CASCADE,
      resource_type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      url VARCHAR(512) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_master_resources_topic ON master_resources(topic_id)`,

    `CREATE TABLE IF NOT EXISTS master_tasks (
      id SERIAL PRIMARY KEY,
      chapter_id INTEGER NOT NULL REFERENCES master_chapters(id) ON DELETE CASCADE,
      topic_id INTEGER REFERENCES master_topics(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      instructions TEXT,
      task_type VARCHAR(50) DEFAULT 'homework',
      max_marks INTEGER DEFAULT 10,
      is_mandatory BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_master_tasks_chapter ON master_tasks(chapter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_master_tasks_topic ON master_tasks(topic_id)`,

    // ── School Local Customized tables ──────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS school_subjects (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      master_subject_id INTEGER REFERENCES master_subjects(id) ON DELETE SET NULL,
      subject_name VARCHAR(100) NOT NULL,
      board VARCHAR(50),
      grade VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(school_id, grade, subject_name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_subjects_school ON school_subjects(school_id)`,

    `CREATE TABLE IF NOT EXISTS school_chapters (
      id SERIAL PRIMARY KEY,
      school_subject_id INTEGER NOT NULL REFERENCES school_subjects(id) ON DELETE CASCADE,
      master_chapter_id INTEGER REFERENCES master_chapters(id) ON DELETE SET NULL,
      chapter_name VARCHAR(200) NOT NULL,
      chapter_order INTEGER NOT NULL DEFAULT 0,
      is_custom BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_chapters_subject ON school_chapters(school_subject_id)`,

    `CREATE TABLE IF NOT EXISTS school_topics (
      id SERIAL PRIMARY KEY,
      school_chapter_id INTEGER NOT NULL REFERENCES school_chapters(id) ON DELETE CASCADE,
      master_topic_id INTEGER REFERENCES master_topics(id) ON DELETE SET NULL,
      topic_name VARCHAR(200) NOT NULL,
      topic_order INTEGER NOT NULL DEFAULT 0,
      content_text TEXT,
      content_pdf_url VARCHAR(512),
      is_custom BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_topics_chapter ON school_topics(school_chapter_id)`,

    `CREATE TABLE IF NOT EXISTS school_resources (
      id SERIAL PRIMARY KEY,
      school_topic_id INTEGER NOT NULL REFERENCES school_topics(id) ON DELETE CASCADE,
      master_resource_id INTEGER REFERENCES master_resources(id) ON DELETE SET NULL,
      resource_type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      url VARCHAR(512) NOT NULL,
      is_custom BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_resources_topic ON school_resources(school_topic_id)`,

    `CREATE TABLE IF NOT EXISTS school_tasks (
      id SERIAL PRIMARY KEY,
      school_chapter_id INTEGER NOT NULL REFERENCES school_chapters(id) ON DELETE CASCADE,
      school_topic_id INTEGER REFERENCES school_topics(id) ON DELETE SET NULL,
      master_task_id INTEGER REFERENCES master_tasks(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      instructions TEXT,
      task_type VARCHAR(50) DEFAULT 'homework',
      max_marks INTEGER DEFAULT 10,
      is_mandatory BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      is_custom BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT chk_mandatory_active CHECK (is_mandatory = FALSE OR is_active = TRUE)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_tasks_chapter ON school_tasks(school_chapter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_school_tasks_topic ON school_tasks(school_topic_id)`,

    `CREATE TABLE IF NOT EXISTS school_topic_progress (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      school_topic_id INTEGER NOT NULL REFERENCES school_topics(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'pending',
      covered_date DATE,
      covered_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(class_id, school_topic_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_topic_progress_class ON school_topic_progress(class_id)`
  ]

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]
    try {
      await pool.query(q)
      console.log(`Query ${i} succeeded!`)
    } catch (err) {
      console.error(`Query ${i} failed:`, err instanceof Error ? err.message : err)
      console.error(`Query detail:`, q)
    }
  }

  await pool.end()
}

main().then(() => process.exit(0))
