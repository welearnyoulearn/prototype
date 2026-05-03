import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'

// POST /api/classes/sync
// 1. Creates classes for every unique (grade, section) found in active students
// 2. Removes classes that have NO active students, NO subjects, and NO timetable slots
export async function POST(req: NextRequest) {
  const { school_id } = await req.json()
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Step 1: Create missing classes from student data
    // — skip if a class already exists (even soft-deleted) to prevent recreating removed classes
    const createResult = await client.query(
      `INSERT INTO classes (school_id, grade, section)
       SELECT DISTINCT s.school_id, s.grade, s.section
       FROM students s
       WHERE s.school_id = $1
         AND s.status = 'active'
         AND s.grade IS NOT NULL AND s.grade != ''
         AND s.section IS NOT NULL AND s.section != ''
         AND NOT EXISTS (
           SELECT 1 FROM classes c
           WHERE c.school_id = s.school_id
             AND c.grade = s.grade
             AND c.section = s.section
         )
       RETURNING grade, section`,
      [school_id]
    )

    // Step 2: Remove classes that have no active students, no subjects, no timetable
    // — but skip any already soft-deleted (deleted_at IS NOT NULL) so they stay in the removed list
    const deleteResult = await client.query(
      `DELETE FROM classes
       WHERE school_id = $1
         AND deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM students s
           WHERE s.school_id = classes.school_id
             AND s.grade = classes.grade
             AND s.section = classes.section
             AND s.status = 'active'
         )
         AND NOT EXISTS (
           SELECT 1 FROM class_subjects cs WHERE cs.class_id = classes.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM class_timetable ct WHERE ct.class_id = classes.id
         )
       RETURNING grade, section`,
      [school_id]
    )

    await client.query('COMMIT')
    invalidateCache(`classes:${school_id}`)

    return NextResponse.json({
      created: createResult.rowCount ?? 0,
      created_classes: createResult.rows.map(r => `${r.grade}-${r.section}`),
      removed: deleteResult.rowCount ?? 0,
      removed_classes: deleteResult.rows.map(r => `${r.grade}-${r.section}`),
    })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(error)
    return NextResponse.json({ error: 'Failed to sync classes' }, { status: 500 })
  } finally {
    client.release()
  }
}
