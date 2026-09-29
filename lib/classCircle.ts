import pool from './db'

// class_circles has no standalone "grades" table to key off (students.grade
// is a plain string, and `classes` rows are per-section) — see the schema
// comment in lib/db.ts. Circles are created lazily the first time a grade
// actually needs one, rather than pre-seeded for every grade in every
// school. ON CONFLICT + a second SELECT handles the race between two
// concurrent callers (e.g. two students in the same grade both triggering
// creation at once) without erroring either one.
export async function getOrCreateClassCircle(schoolId: number, grade: string): Promise<number> {
  const inserted = await pool.query(
    `INSERT INTO class_circles (school_id, grade)
     VALUES ($1, $2)
     ON CONFLICT (school_id, grade) DO NOTHING
     RETURNING id`,
    [schoolId, grade]
  )
  if (inserted.rows.length > 0) return inserted.rows[0].id

  const existing = await pool.query(
    `SELECT id FROM class_circles WHERE school_id = $1 AND grade = $2`,
    [schoolId, grade]
  )
  return existing.rows[0].id
}
